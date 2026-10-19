import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe compras reais de plataformas externas (endereço antigo, por webinar). Ver
 * legacy-purchase-webhook.server: a chamada tem de trazer o segredo do webinar; sem ele nada é registado.
 */

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
      OPTIONS: async ({ request }) => {
        const { withCors } = await import("@/lib/webhook-cors");
        return withCors(request, new Response(null, { status: 204 }));
      },
      POST: async ({ request }) => {
        const [{ RateLimiter }, { withCors }, { handleLegacyPurchaseWebhook }] = await Promise.all([
          import("@/lib/registration"),
          import("@/lib/webhook-cors"),
          import("@/lib/legacy-purchase-webhook.server"),
        ]);
        limiter ??= new RateLimiter(120, 60_000);
        if (!limiter.allow(await requestIp(request)))
          return new Response("Demasiados pedidos.", { status: 429, headers: { "retry-after": "60" } });
        return withCors(request, await handleLegacyPurchaseWebhook(request));
      },
    },
  },
});
