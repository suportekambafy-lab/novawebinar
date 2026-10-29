import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de recargas de créditos: a conta Kambafy da plataforma chama este endereço
 * em cada pagamento. O segredo é o `BILLING_WEBHOOK_SECRET` do ambiente, no cabeçalho
 * `x-webhook-secret` (ou `authorization: Bearer …`). A decisão fica em billing.server.ts.
 */

// Sem CORS: a Kambafy envia este aviso do servidor (incluindo o botão «testar», desde 25/10/2026). Um
// browser nunca precisa de o chamar, e sem os cabeçalhos CORS nenhum site consegue fazê-lo por alguém.
const withCors = (_request: Request, response: Response) => response;

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
