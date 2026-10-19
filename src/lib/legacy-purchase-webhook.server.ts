/**
 * O endereço antigo de compras, por webinar: /api/public/purchase-webhook. Quem o configurou antes do
 * receptor por integração (e a Kambafy, que ainda o tem num dos produtos) continua a entregar aqui.
 *
 * Autentica pelo segredo do webinar (social_proof_settings.webhook_secret), que pode vir na URL
 * (?w=<webinar>&s=<segredo>), nos cabeçalhos ou no corpo. Depois a venda segue pelo mesmo motor do
 * receptor novo (applySaleEvent): o contacto, a atribuição ao webinar, o teste A/B e o webhook de saída.
 * Uma venda da Kambafy que chegue pelos dois endereços fica registada uma vez só.
 *
 * As recusas respondem em JSON com o que falta: antes era só «Dados em falta.» e ninguém sabia porquê.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { legacyPurchaseEvent } from "@/lib/integrations";
import { applySaleEvent, same, type SaleContext } from "@/lib/integrations.server";

const text = (value: unknown, max: number) =>
  (value === undefined || value === null ? "" : String(value)).trim().slice(0, max);

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

const keysOf = (body: unknown) =>
  body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body as object).slice(0, 60) : [];

/** O segredo, por ordem: URL, cabeçalhos (os dois nomes antigos, o da Kambafy, Bearer), corpo. */
function secretOf(url: URL, headers: Headers, body: Record<string, unknown>) {
  const bearer = /^Bearer\s+(.+)$/i.exec(headers.get("authorization") ?? "")?.[1];
  return text(
    url.searchParams.get("s") ??
      url.searchParams.get("secret") ??
      headers.get("x-novawebinar-secret") ??
      headers.get("x-convertewebinar-secret") ??
      headers.get("x-webhook-secret") ??
      bearer ??
      body["secret"],
    200,
  );
}

export async function handleLegacyPurchaseWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = await request.text();
  if (raw.length > 256_000) return json(413, { ok: false, error: "Pedido demasiado grande" });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = raw.trim() ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "O corpo do pedido não é um objecto JSON" });
  }
  const data = body["data"] && typeof body["data"] === "object" ? (body["data"] as Record<string, unknown>) : {};
  const webinarId = text(
    url.searchParams.get("w") ?? url.searchParams.get("webinar_id") ?? body["webinar_id"] ?? data["webinar_id"],
    60,
  );
  const secret = secretOf(url, request.headers, body);
  const missingAuth = [...(!webinarId ? ["webinar_id"] : []), ...(!secret ? ["secret"] : [])];
  if (missingAuth.length) {
    return json(400, {
      ok: false,
      error: "Dados em falta",
      missing_fields: missingAuth,
      received_keys: keysOf(body),
      hint: "Envie ?w=<webinar_id>&s=<segredo> na URL, ou webinar_id e secret no corpo (o segredo também pode ir no cabeçalho x-webhook-secret).",
    });
  }

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("social_proof_settings")
    .select("webinar_id, organization_id, webhook_secret, product_name")
    .eq("webinar_id", webinarId)
    .maybeSingle();
  // Falha nossa responde 5xx para quem envia repetir; 401 seria desistir da venda.
  if (settingsError) {
    return new Response("Temporariamente indisponível.", { status: 503, headers: { "retry-after": "60" } });
  }
  if (!settings?.webhook_secret || !same(settings.webhook_secret, secret)) {
    return json(401, { ok: false, error: "Não autorizado", detail: "Webinar desconhecido ou segredo inválido." });
  }

  const { event, missing } = legacyPurchaseEvent(body);
  if (event.kind === "purchase" && !event.product && settings.product_name) event.product = settings.product_name;
  if (missing.length) {
    return json(400, {
      ok: false,
      error: "Dados em falta",
      missing_fields: missing,
      received_keys: keysOf(body),
      received_data_keys: keysOf(data),
    });
  }

  // A venda vem da Kambafy (formato `event` + `data`): entra como venda da Kambafy, com a integração deste
  // webinar quando existe. Assim a mesma venda a chegar pelos dois endereços fica uma vez só.
  const fromKambafy = Boolean(text(body["event"], 60));
  const provider = fromKambafy ? ("kambafy" as const) : ("legacy" as const);
  let integrationId: string | null = null;
  if (fromKambafy) {
    const { data: integration } = await supabaseAdmin
      .from("integrations")
      .select("id")
      .eq("organization_id", settings.organization_id)
      .eq("provider", "kambafy")
      .eq("webinar_id", settings.webinar_id)
      .maybeSingle();
    integrationId = integration?.id ?? null;
  }
  const ctx: SaleContext = {
    integrationId,
    organizationId: settings.organization_id,
    provider,
    webinarId: settings.webinar_id,
  };
  const outcome = await applySaleEvent(ctx, raw, event);
  if (!outcome.response.ok) return outcome.response;
  const conversions =
    outcome.purchaseId === null
      ? []
      : [
          {
            purchase_id: outcome.purchaseId,
            webinar_id: outcome.webinarId,
            external_id: outcome.externalId,
            status: event.kind === "purchase" ? event.status : null,
            duplicate: outcome.duplicate,
          },
        ];
  return json(200, { ok: true, conversions });
}
