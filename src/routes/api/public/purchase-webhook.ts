import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe compras reais de plataformas externas (receptor antigo, por webinar).
 * A chamada tem de trazer o segredo do webinar; sem ele nada é registado.
 * As compras reais entram numa tabela separada das simuladas.
 *
 * Idempotente: cada compra tem um id externo (o `id`/`order_id` do pedido ou, sem ele, a
 * impressão digital do corpo); a mesma compra reenviada pela plataforma não volta a contar.
 */

const text = (value: unknown, max: number) =>
  (value === undefined || value === null ? "" : String(value)).trim().slice(0, max);

/** Pedidos por IP: a plataforma repete pouco; trava um ciclo a partir de um só endereço. */
let limiter: InstanceType<typeof import("@/lib/registration").RateLimiter> | undefined;

async function requestIp(request: Request) {
  const { clientIp } = await import("@/lib/registration");
  let socket: string | undefined;
  try {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    socket = getRequestIP();
  } catch {
    socket = undefined;
  }
  return clientIp(socket, request.headers.get("x-forwarded-for"));
}

export const Route = createFileRoute("/api/public/purchase-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { RateLimiter } = await import("@/lib/registration");
        limiter ??= new RateLimiter(120, 60_000);
        if (!limiter.allow(await requestIp(request)))
          return new Response("Demasiados pedidos.", { status: 429, headers: { "retry-after": "60" } });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { same } = await import("@/lib/integrations.server");
        const { parseAmount } = await import("@/lib/integrations");
        const { createHash } = await import("node:crypto");

        const raw = await request.text();
        let payload: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
          payload = parsed as Record<string, unknown>;
        } catch {
          return new Response("Pedido inválido.", { status: 400 });
        }

        // O cabeçalho antigo (de antes do nome Novawebinar) continua aceite para não partir quem já o configurou.
        const secret = text(
          request.headers.get("x-novawebinar-secret") ??
            request.headers.get("x-convertewebinar-secret") ??
            payload["secret"],
          200,
        );
        const webinarId = text(payload["webinar_id"], 60);
        const buyer = text(payload["buyer_name"], 80);
        if (!webinarId || !secret || !buyer) return new Response("Dados em falta.", { status: 400 });

        const { data: settings, error: settingsError } = await supabaseAdmin
          .from("social_proof_settings")
          .select("webinar_id, organization_id, webhook_secret, product_name")
          .eq("webinar_id", webinarId)
          .maybeSingle();

        // Falha nossa responde 5xx para quem envia repetir; 401 seria desistir da venda.
        if (settingsError) {
          return new Response("Temporariamente indisponível.", {
            status: 503,
            headers: { "retry-after": "60" },
          });
        }
        if (!settings?.webhook_secret || !same(settings.webhook_secret, secret)) {
          return new Response("Não autorizado.", { status: 401 });
        }

        const buyerEmail = text(payload["buyer_email"], 160).toLowerCase() || null;
        const amountText = text(payload["amount"], 40);
        const amountValue = parseAmount(payload["amount"]);
        const currency = text(payload["currency"], 3).toUpperCase() || null;
        const externalId =
          text(payload["id"] ?? payload["order_id"] ?? payload["transaction_id"], 120) ||
          `body:${createHash("sha256").update(raw).digest("hex")}`;

        const { data: saved, error } = await supabaseAdmin
          .from("real_purchase_events")
          .insert({
            organization_id: settings.organization_id,
            webinar_id: settings.webinar_id,
            buyer_name: buyer,
            buyer_email: buyerEmail,
            product_name: text(payload["product_name"] ?? settings.product_name, 120),
            amount: amountText,
            amount_value: amountValue,
            ...(currency ? { currency } : {}),
            provider: "legacy",
            source: "legacy",
            external_id: externalId,
          })
          .select("id, amount_value, currency")
          .single();

        // A mesma compra outra vez: já está registada, responde 200 para a plataforma não repetir.
        if (error?.code === "23505") return Response.json({ ok: true, duplicate: true });
        if (error || !saved) return new Response("Não foi possível registar a compra.", { status: 500 });
        // Num teste A/B, a venda conta para a variante de quem comprou, quando o pedido traz o e-mail.
        if (buyerEmail) {
          const { attributePurchase } = await import("@/lib/ab-tests/assign.server");
          await attributePurchase({
            organizationId: settings.organization_id,
            buyerEmail,
            webinarId: settings.webinar_id,
            purchaseId: saved.id,
            amount: saved.amount_value,
            currency: saved.currency,
          });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
