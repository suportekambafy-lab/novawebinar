import { createFileRoute } from "@tanstack/react-router";

/**
 * Pedidos por IP e por endereço: a plataforma repete pouco. Sem limite, quem visse o endereço no browser
 * (a Kambafy chama-o do checkout) enchia o registo de eventos da integração com pedidos rejeitados.
 */
let perIp: InstanceType<typeof import("@/lib/registration").RateLimiter> | undefined;
let perKey: InstanceType<typeof import("@/lib/registration").RateLimiter> | undefined;

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

/** Endereço único de ligação de cada integração de vendas (Kambafy, Hotmart, …). */
export const Route = createFileRoute("/api/public/hooks/$key")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { withCors } = await import("@/lib/webhook-cors");
        return withCors(request, new Response(null, { status: 204 }));
      },
      POST: async ({ request, params }) => {
        const [{ receiveIntegrationWebhook }, { withCors }, { RateLimiter }] = await Promise.all([
          import("@/lib/integrations.server"),
          import("@/lib/webhook-cors"),
          import("@/lib/registration"),
        ]);
        perIp ??= new RateLimiter(120, 60_000);
        perKey ??= new RateLimiter(600, 60_000);
        if (!perIp.allow(await requestIp(request)) || !perKey.allow(params.key))
          return withCors(request, new Response("Demasiados pedidos.", { status: 429, headers: { "retry-after": "60" } }));
        return withCors(request, await receiveIntegrationWebhook(params.key, request));
      },
    },
  },
});
