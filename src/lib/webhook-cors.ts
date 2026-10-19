/**
 * A Kambafy envia o webhook a partir do browser (botão «testar» e pagamentos Express/cartão): as suas
 * origens têm de passar a verificação CORS nos dois endereços que recebem vendas.
 */
const BROWSER_SENDERS = /^https:\/\/([a-z0-9-]+\.)?kambafy\.com$/;

export function withCors(request: Request, response: Response) {
  const origin = request.headers.get("origin") ?? "";
  if (!BROWSER_SENDERS.test(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, x-webhook-secret, x-novawebinar-secret, authorization");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, headers });
}
