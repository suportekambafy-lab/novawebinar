import { createFileRoute } from "@tanstack/react-router";

/**
 * API pública de inscrição: para quem tem o seu próprio formulário, e o destino do
 * formulário embed. O formulário (form_id) — ou, sem formulário, o webinar (webinar_id) —
 * diz a organização; nunca o pedido. Idempotência: submission_id ou o cabeçalho
 * Idempotency-Key. As origens
 * autorizadas, o limite de ritmo, a armadilha para robôs e a idempotência ficam em
 * registerFromCapture (registration.server.ts).
 */
const MAX_BODY = 16_000;

/** O IP do socket, quando o runtime o dá (fora de um pedido, como nos testes, não há). */
async function socketIp() {
  try {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    return getRequestIP();
  } catch {
    return undefined;
  }
}

function withCors(response: Response, origin: string | null) {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, x-novawebinar-embed, idempotency-key");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, headers });
}

export const Route = createFileRoute("/api/public/register")({
  server: {
    handlers: {
      // O pedido prévio não traz o formulário: a origem é verificada no POST.
      OPTIONS: ({ request }) => withCors(new Response(null, { status: 204 }), request.headers.get("origin")),
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const { clientIp, readLimitedBody } = await import("@/lib/registration");
        const raw = await readLimitedBody(request, MAX_BODY);
        if (raw === null) return withCors(Response.json({ ok: false, error: "too_large" }, { status: 413 }), origin);
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return withCors(Response.json({ ok: false, error: "invalid_json", message: "Envie JSON." }, { status: 400 }), origin);
        }
        const ip = clientIp(await socketIp(), request.headers.get("x-forwarded-for"));
        const { registerFromCapture } = await import("@/lib/registration.server");
        const result = await registerFromCapture(body, {
          origin,
          ip,
          headers: request.headers,
          appOrigin: new URL(request.url).origin,
          source: request.headers.get("x-novawebinar-embed") === "1" ? "embed" : "api",
          idempotencyKey: request.headers.get("idempotency-key")?.trim().slice(0, 100) || null,
        });
        return withCors(Response.json(result.body, { status: result.status }), result.allowOrigin);
      },
    },
  },
});
