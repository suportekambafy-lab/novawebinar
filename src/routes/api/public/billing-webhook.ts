import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de recargas de créditos: a conta Kambafy da plataforma chama este endereço
 * em cada pagamento. O segredo é o `BILLING_WEBHOOK_SECRET` do ambiente, no cabeçalho
 * `x-webhook-secret` (ou `authorization: Bearer …`). A decisão fica em billing.server.ts.
 */

// A Kambafy envia o webhook a partir do browser (botão "testar" e pagamentos
// Express/cartão), por isso as suas origens têm de passar a verificação CORS.
const BROWSER_SENDERS = /^https:\/\/([a-z0-9-]+\.)?kambafy\.com$/;

function withCors(request: Request, response: Response) {
  const origin = request.headers.get("origin") ?? "";
  if (!BROWSER_SENDERS.test(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, x-webhook-secret, authorization");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, headers });
}

/** O IP do socket, quando o runtime o dá (fora de um pedido, como nos testes, não há). */
async function socketIp() {
  try {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    return getRequestIP();
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/api/public/billing-webhook")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => withCors(request, new Response(null, { status: 204 })),
      POST: async ({ request }) => {
        const { clientIp } = await import("@/lib/registration");
        const { receiveBillingWebhook } = await import("@/lib/billing.server");
        const ip = clientIp(await socketIp(), request.headers.get("x-forwarded-for"));
        return withCors(request, await receiveBillingWebhook(request, ip));
      },
    },
  },
});
