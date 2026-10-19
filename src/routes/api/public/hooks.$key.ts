import { createFileRoute } from "@tanstack/react-router";

/** Endereço único de ligação de cada integração de vendas (Kambafy, Hotmart, …). */
export const Route = createFileRoute("/api/public/hooks/$key")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { withCors } = await import("@/lib/webhook-cors");
        return withCors(request, new Response(null, { status: 204 }));
      },
      POST: async ({ request, params }) => {
        const [{ receiveIntegrationWebhook }, { withCors }] = await Promise.all([
          import("@/lib/integrations.server"),
          import("@/lib/webhook-cors"),
        ]);
        return withCors(request, await receiveIntegrationWebhook(params.key, request));
      },
    },
  },
});
