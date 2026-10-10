import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe compras reais de plataformas externas.
 * A chamada tem de trazer o segredo do webinar; sem ele nada é registado.
 * As compras reais entram numa tabela separada das simuladas.
 */
export const Route = createFileRoute("/api/public/purchase-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let payload: {
          webinar_id?: string;
          secret?: string;
          buyer_name?: string;
          product_name?: string;
          amount?: string;
        };
        try {
          payload = (await request.json()) as typeof payload;
        } catch {
          return new Response("Pedido inválido.", { status: 400 });
        }

        // O cabeçalho antigo continua aceite para não partir quem já o configurou.
        const secret =
          request.headers.get("x-novawebinar-secret") ??
          request.headers.get("x-novawebinar-secret") ??
          payload.secret ??
          "";
        const webinarId = payload.webinar_id ?? "";
        const buyer = (payload.buyer_name ?? "").trim();
        if (!webinarId || !secret || !buyer)
          return new Response("Dados em falta.", { status: 400 });

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
        if (!settings || settings.webhook_secret !== secret) {
          return new Response("Não autorizado.", { status: 401 });
        }

        const { error } = await supabaseAdmin.from("real_purchase_events").insert({
          organization_id: settings.organization_id,
          webinar_id: settings.webinar_id,
          buyer_name: buyer.slice(0, 80),
          product_name: (payload.product_name ?? settings.product_name ?? "").slice(0, 120),
          amount: (payload.amount ?? "").slice(0, 40),
        });

        if (error) return new Response("Não foi possível registar a compra.", { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
