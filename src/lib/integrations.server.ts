/**
 * Receptor dos webhooks das plataformas de venda e envio do webhook de saída.
 * Tudo o que chega fica em integration_events, aceite ou não, com o motivo.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeEvent, type ProviderId } from "@/lib/integrations";
import { isHttpUrl } from "@/lib/utils";

function same(a: string, b: string) {
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

const hmac = (algorithm: "sha1" | "sha256", key: string, data: string, encoding: "hex" | "base64" = "hex") =>
  createHmac(algorithm, key).update(data, "utf8").digest(encoding);

/** Motivo da recusa, ou null quando o pedido vem mesmo da plataforma. */
function verify(provider: ProviderId, secret: string, request: Request, raw: string): string | null {
  const url = new URL(request.url);
  switch (provider) {
    case "hotmart":
      if (!secret) return "Falta colar o Hottok nas definições da integração.";
      return same(request.headers.get("x-hotmart-hottok") ?? "", secret) ? null : "Hottok inválido.";
    case "kiwify":
      if (!secret) return "Falta colar o token do webhook da Kiwify.";
      return same(url.searchParams.get("signature") ?? "", hmac("sha1", secret, raw))
        ? null
        : "Assinatura da Kiwify inválida.";
    case "eduzz": {
      if (!secret) return "Falta colar a chave de acesso da Eduzz.";
      const signature = request.headers.get("x-signature") ?? "";
      return same(signature, hmac("sha256", secret, raw)) ||
        same(signature, hmac("sha256", secret, raw, "base64"))
        ? null
        : "Assinatura da Eduzz inválida.";
    }
    case "stripe": {
      if (!secret) return "Falta colar o signing secret do Stripe.";
      const parts = (request.headers.get("stripe-signature") ?? "").split(",").map((p) => p.split("="));
      const timestamp = parts.find(([k]) => k === "t")?.[1] ?? "";
      if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
        return "Assinatura do Stripe em falta ou fora de prazo.";
      }
      const expected = hmac("sha256", secret, `${timestamp}.${raw}`);
      return parts.some(([k, v]) => k === "v1" && v && same(v, expected))
        ? null
        : "Assinatura do Stripe inválida.";
    }
    case "kambafy":
    case "webhook": {
      // A Kambafy chama a partir do navegador do comprador: o endereço fica à vista de quem comprou.
      // Sem segredo, qualquer comprador forjava vendas; por isso ele é obrigatório.
      if (!secret) return "Falta gerar o segredo do webhook nas definições da integração.";
      const sent =
        request.headers.get("x-webhook-secret") ??
        (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      return same(sent, secret) ? null : "Segredo do webhook inválido.";
    }
    default:
      return "Esta integração não recebe vendas.";
  }
}

/** O estado de um pagamento só avança: iniciado → falhado ou abandonado → aprovado → reembolsado. */
const STATUS_RANK = { pending: 0, failed: 1, abandoned: 1, approved: 2, refunded: 3 } as const;

/** O que o webhook de saída envia em cada estado. */
const OUTGOING_EVENT = {
  pending: "purchase.pending",
  failed: "payment.failed",
  abandoned: "checkout.abandoned",
  approved: "purchase.approved",
  refunded: "purchase.refunded",
} as const;

/** Falha nossa: a plataforma guarda o evento e volta a enviar. */
const retryLater = () =>
  new Response("Temporarily unavailable", { status: 503, headers: { "retry-after": "60" } });

/** Outro pedido da mesma venda chegou primeiro: volta-se a ler e decide-se outra vez. */
class Conflict extends Error {}

/** O resultado de uma chamada à base de dados; um erro nunca passa por "não existe". */
function must<T>(result: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (result.error?.code === "23505") throw new Conflict(`${what}: ${result.error.message}`);
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export async function receiveIntegrationWebhook(key: string, request: Request): Promise<Response> {
  const found = await supabaseAdmin
    .from("integrations")
    .select("id, organization_id, provider, enabled, secret")
    .eq("endpoint_key", key)
    .maybeSingle();
  if (found.error) {
    console.error(`[webhook] integração por ler: ${found.error.message}`);
    return retryLater();
  }
  const integration = found.data;
  if (!integration) return new Response("Not found", { status: 404 });

  const provider = integration.provider as ProviderId;
  const raw = await request.text();
  // O pedido em bruto só se guarda depois de verificado: fica com o registo do
  // evento, para a venda poder ser reprocessada.
  let payload: string | null = null;
  const log = async (
    status: "accepted" | "rejected" | "ignored",
    reason: string,
    extra: Record<string, unknown> = {},
  ) => {
    const { error } = await supabaseAdmin.from("integration_events").insert({
      organization_id: integration.organization_id,
      integration_id: integration.id,
      provider,
      status,
      reason,
      payload,
      ...extra,
    });
    if (error) console.error(`[webhook] registo por guardar (${status}): ${error.message}`);
  };

  if (raw.length > 256_000) {
    await log("rejected", "Pedido demasiado grande.");
    return new Response("Payload too large", { status: 413 });
  }
  const refused = verify(provider, integration.secret, request, raw);
  if (refused) {
    await log("rejected", refused);
    return new Response("Unauthorized", { status: 401 });
  }
  payload = raw;
  if (!integration.enabled) {
    await log("ignored", "A integração está desligada.");
    return Response.json({ ok: true });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    await log("rejected", "O pedido não vem em JSON.");
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = normalizeEvent(provider, body);
  if (event.kind === "ignore") {
    await log("ignored", event.reason, { event_type: event.eventType });
    return Response.json({ ok: true });
  }
  const summary = {
    event_type: event.eventType,
    buyer_email: event.email,
    product_name: event.product || null,
    amount_value: event.amountValue,
    currency: event.currency,
  };
  // Respondemos 200 para a plataforma não repetir um pedido que nunca vai servir.
  if (!event.email) {
    await log("rejected", "A venda não traz o email do comprador.", summary);
    return Response.json({ ok: false });
  }
  const sale = event;
  const email = event.email;
  // Sem id da plataforma, o próprio pedido é a chave: um reenvio igual cai em "já existe".
  const externalId = event.externalId ?? `body:${createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 32)}`;

  const applyPurchase = async (): Promise<Response> => {
    const existing = must(
      await supabaseAdmin
        .from("real_purchase_events")
        .select("id, status, amount_value, currency, product_name, webinar_id")
        .eq("organization_id", integration.organization_id)
        .eq("provider", provider)
        .eq("external_id", externalId)
        .maybeSingle(),
      "venda por ler",
    );
    const touched = () =>
      supabaseAdmin.from("integrations").update({ last_event_at: new Date().toISOString() }).eq("id", integration.id);

    if (existing) {
      // O estado só avança (pendente → aprovada → reembolsada). Um reembolso muitas
      // vezes não traz valor nem produto: muda o estado e preenche o que faltar,
      // sem apagar o que a venda original trouxe nem mudar a atribuição.
      const before = existing.status as keyof typeof STATUS_RANK;
      if (STATUS_RANK[sale.status] <= STATUS_RANK[before]) {
        await log("ignored", "Este pagamento já estava registado neste estado ou num posterior.", {
          ...summary,
          purchase_id: existing.id,
        });
        return Response.json({ ok: true });
      }
      // Só muda se ninguém o mudou entretanto; senão volta a ler.
      const updated = must(
        await supabaseAdmin
          .from("real_purchase_events")
          .update({
            status: sale.status,
            amount_value: existing.amount_value ?? sale.amountValue,
            currency: existing.currency ?? sale.currency,
            product_name: existing.product_name || sale.product.slice(0, 120),
          })
          .eq("id", existing.id)
          .eq("status", before)
          .select("id"),
        "venda por actualizar",
      );
      if (!updated?.length) throw new Conflict();
      if (sale.status === "approved") {
        const { attributePurchase } = await import("@/lib/ab-tests/assign.server");
        await attributePurchase({
          organizationId: integration.organization_id,
          buyerEmail: email,
          webinarId: existing.webinar_id,
          purchaseId: existing.id,
          amount: existing.amount_value ?? sale.amountValue,
          currency: existing.currency ?? sale.currency,
        });
      }
      await Promise.all([log("accepted", "", { ...summary, purchase_id: existing.id }), touched()]);
      await notifyOutgoing(integration.organization_id, OUTGOING_EVENT[sale.status], {
        email,
        external_id: sale.externalId,
        provider,
        webinar_id: existing.webinar_id,
      });
      return Response.json({ ok: true });
    }

    // Sem contacto ou sem participações lidas, a venda ficaria solta e mal
    // atribuída: antes disso, devolve-se o pedido à plataforma.
    const contactId = must(
      await supabaseAdmin.rpc("upsert_contact", {
        _organization_id: integration.organization_id,
        _name: sale.name,
        _email: email,
        _phone: sale.phone ?? "",
        _source: "integration",
      }),
      "contacto por guardar",
    );
    // Atribuição só com prova, calculada na base de dados sobre os factos: o
    // webinar cuja oferta aponta para este produto; senão o último a que a pessoa
    // assistiu dentro da janela; senão nenhum.
    const [match] = contactId
      ? (must(
          await supabaseAdmin.rpc("purchase_attribution", {
            _contact_id: contactId,
            _product_id: sale.productId ?? "",
          }),
          "atribuição por calcular",
        ) ?? [])
      : [];
    const attribution =
      match?.evidence === "offer"
        ? "Atribuída ao webinar cuja oferta aponta para este produto."
        : match
          ? "Atribuída ao último webinar a que a pessoa assistiu antes do pagamento."
          : "Sem webinar atribuível: nenhuma oferta com este produto nem presença recente.";

    const saved = must(
      await supabaseAdmin
        .from("real_purchase_events")
        .insert({
          organization_id: integration.organization_id,
          webinar_id: match?.webinar_id ?? null,
          contact_id: contactId ?? null,
          buyer_email: email,
          buyer_name: (sale.name || email).slice(0, 80),
          product_name: sale.product.slice(0, 120),
          amount: sale.amountValue === null ? "" : String(sale.amountValue),
          amount_value: sale.amountValue,
          currency: sale.currency,
          status: sale.status,
          provider,
          source: provider,
          external_id: externalId,
          product_id: sale.productId ?? null,
        })
        .select("id")
        .single(),
      "venda por guardar",
    );

    // Num teste A/B, a venda aprovada conta para a variante de quem comprou (pelo e-mail).
    if (sale.status === "approved" && saved?.id) {
      const { attributePurchase } = await import("@/lib/ab-tests/assign.server");
      await attributePurchase({
        organizationId: integration.organization_id,
        buyerEmail: email,
        webinarId: match?.webinar_id ?? null,
        purchaseId: saved.id,
        amount: sale.amountValue,
        currency: sale.currency,
      });
    }
    await Promise.all([log("accepted", attribution, { ...summary, purchase_id: saved?.id ?? null }), touched()]);
    await notifyOutgoing(integration.organization_id, OUTGOING_EVENT[sale.status], {
      email,
      name: sale.name,
      product: sale.product,
      amount: sale.amountValue,
      currency: sale.currency,
      provider,
      webinar_id: match?.webinar_id ?? null,
    });
    return Response.json({ ok: true });
  };

  // Dois envios em simultâneo: quem perde a corrida (índice único ou estado mudado entretanto)
  // volta a ler a venda e segue pelo ramo "já existe".
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await applyPurchase();
    } catch (error) {
      if (error instanceof Conflict && attempt < 2) continue;
      // Nada do que falhou aqui é culpa do pedido: fica o registo e a plataforma repete.
      console.error("[webhook] falha a tratar a venda", error);
      await log("rejected", "Falha temporária do nosso lado. A plataforma vai repetir o envio.", summary);
      return retryLater();
    }
  }
}

/** Endereços internos nunca recebem pedidos do servidor. */
// ponytail: verifica o nome, não o IP resolvido; resolver o DNS se aparecerem nomes a apontar para a rede interna.
function isPublicHost(url: string) {
  const host = new URL(url).hostname.toLowerCase();
  return !(
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.includes(":")
  );
}

/** O que aconteceu a um envio. `transient`: vale a pena tentar outra vez mais tarde. */
export type Delivery = {
  ok: boolean;
  transient: boolean;
  status: number | null;
  ms: number;
  error: string | null;
  /** Conta de teste: o envio foi simulado no servidor e nada saiu para a rede. */
  sandbox?: boolean;
};

/**
 * Webhook de saída da organização, assinado com HMAC-SHA256 no cabeçalho X-Signature.
 * Nunca lança: devolve o resultado. `deliveryId` (cabeçalho X-Delivery-Id) é o mesmo em
 * todas as tentativas de um envio, para o destino poder ignorar repetidos.
 *
 * Numa conta de teste (organizations.is_test) nada sai para a rede: o envio é simulado
 * aqui, depois das mesmas verificações. `settings.simulate` mostra os outros desfechos:
 * "fail_first" (a 1.ª tentativa responde 503 e a seguinte passa) e "reject" (o destino
 * recusa com 400, falha definitiva).
 */
export async function deliverOutgoing(
  organizationId: string,
  event: string,
  data: Record<string, unknown>,
  {
    deliveryId,
    timeoutMs = 10_000,
    attempt = 1,
  }: { deliveryId?: string; timeoutMs?: number; attempt?: number } = {},
): Promise<Delivery> {
  const started = Date.now();
  const failed = (error: string, transient: boolean, status: number | null = null): Delivery => ({
    ok: false,
    transient,
    status,
    ms: Date.now() - started,
    error,
  });
  const { data: hook, error: readError } = await supabaseAdmin
    .from("integrations")
    .select("enabled, secret, settings, organizations(is_test)")
    .eq("organization_id", organizationId)
    .eq("provider", "outgoing_webhook")
    .maybeSingle();
  if (readError) return failed(`Não foi possível ler a integração: ${readError.message}`, true);
  const settings = (hook?.settings ?? {}) as { url?: string; simulate?: string };
  const url = settings.url;
  if (!hook?.enabled || !isHttpUrl(url) || !url.startsWith("https://") || !isPublicHost(url)) {
    return failed("O webhook de saída está desligado ou sem endereço https válido (Integrações).", false);
  }
  if (hook.organizations?.is_test) {
    if (settings.simulate === "reject") {
      return { ...failed("Destino de teste: recusa simulada (HTTP 400). Nada saiu da plataforma.", false, 400), sandbox: true };
    }
    if (settings.simulate === "fail_first" && attempt === 1) {
      return { ...failed("Destino de teste: falha simulada (HTTP 503). Nada saiu da plataforma.", true, 503), sandbox: true };
    }
    return { ok: true, transient: false, status: 200, ms: Date.now() - started, error: null, sandbox: true };
  }
  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), data });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": hmac("sha256", hook.secret, body),
        ...(deliveryId ? { "x-delivery-id": deliveryId } : {}),
      },
      body,
      // Um redireccionamento podia levar o pedido para um endereço interno.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    void response.body?.cancel().catch(() => {});
    if (response.ok) return { ok: true, transient: false, status: response.status, ms: Date.now() - started, error: null };
    const transient = response.status === 408 || response.status === 429 || response.status >= 500;
    return failed(`O destino respondeu HTTP ${response.status}.`, transient, response.status);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return failed(
      timedOut
        ? `O destino não respondeu em ${Math.round(timeoutMs / 1000)} s.`
        : `Falha de rede: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  }
}

/** Avisos em tempo real (inscrição, clique, venda, caso): uma tentativa, sem esperar. */
export async function notifyOutgoing(organizationId: string, event: string, data: Record<string, unknown>) {
  // Um destino lento ou em baixo nunca afecta a sala nem a venda.
  await deliverOutgoing(organizationId, event, data, { timeoutMs: 4000 });
}
