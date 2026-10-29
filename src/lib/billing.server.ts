/**
 * Recargas de créditos de IA pagas na conta Kambafy da plataforma.
 *
 * A Kambafy chama /api/public/billing-webhook em cada pagamento. Só um pagamento
 * aprovado de um produto em `billing_products` carrega créditos, e entra na
 * organização onde o email de quem pagou é dono ou administrador. Tudo o que chega
 * fica em `billing_events` com o motivo, aceite ou não.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeEvent } from "@/lib/integrations";
import { unsignedAllowed, verifyKambafySignature } from "@/lib/kambafy-signature";
import { RateLimiter, readLimitedBody } from "@/lib/registration";

export const BILLING_PROVIDER = "kambafy";
const MAX_BODY = 256_000;

/** Por IP: a Kambafy repete pouco; chega para travar um ciclo de pedidos num só endereço. */
export const perSender = new RateLimiter(60, 60_000);

export type BillingStatus = "accepted" | "ignored" | "unmatched" | "rejected";
export type BillingOutcome = { status: BillingStatus; reason: string };

type Product = { label: string; usd_amount: number };

/** O que o receptor precisa da base de dados; o padrão usa o cliente de serviço. */
export type BillingDeps = {
  findProduct(externalProductId: string): Promise<Product | null>;
  organizationForEmail(email: string): Promise<string | null>;
  applyTopup(args: {
    organizationId: string;
    amountMicros: number;
    ref: string;
    description: string;
    meta: Record<string, unknown>;
  }): Promise<boolean>;
  /** Retira os créditos de uma recarga reembolsada (0087). Devolve o estado da função. */
  applyRefund?(args: {
    organizationId: string;
    purchaseRef: string;
    refundRef: string;
    refundedTotal: number | null;
    paidTotal: number | null;
  }): Promise<string>;
  logEvent(row: {
    status: BillingStatus;
    reason: string;
    event_type: string;
    buyer_email: string | null;
    external_order_id: string | null;
    external_product_id: string | null;
    organization_id: string | null;
  }): Promise<void>;
};

const fail = (what: string, message: string) => new Error(`[recargas] ${what}: ${message}`);

export const supabaseBillingDeps: BillingDeps = {
  async findProduct(externalProductId) {
    const { data, error } = await supabaseAdmin
      .from("billing_products")
      .select("label, usd_amount")
      .eq("provider", BILLING_PROVIDER)
      .eq("external_product_id", externalProductId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw fail("produto por ler", error.message);
    return data ? { label: data.label, usd_amount: Number(data.usd_amount) } : null;
  },
  async organizationForEmail(email) {
    const { data, error } = await supabaseAdmin.rpc("organization_for_billing_email", { _email: email });
    if (error) throw fail("organização por ler", error.message);
    return data ?? null;
  },
  async applyTopup({ organizationId, amountMicros, ref, description, meta }) {
    const { data, error } = await supabaseAdmin.rpc("apply_credit_topup", {
      _organization_id: organizationId,
      _amount_micros: amountMicros,
      _ref: ref,
      _description: description,
      _meta: meta as never,
    });
    if (error) throw fail("recarga por aplicar", error.message);
    return data === true;
  },
  async applyRefund({ organizationId, purchaseRef, refundRef, refundedTotal, paidTotal }) {
    const { data, error } = await supabaseAdmin.rpc("apply_credit_refund" as never, {
      _organization_id: organizationId,
      _purchase_ref: purchaseRef,
      _refund_ref: refundRef,
      _refunded_total: refundedTotal,
      _paid_total: paidTotal,
      _description: "Reembolso da recarga",
      _meta: {},
    } as never);
    if (error) throw fail("reembolso por aplicar", error.message);
    return String((data as { status?: string } | null)?.status ?? "");
  },
  async logEvent(row) {
    const { error } = await supabaseAdmin.from("billing_events").insert({ provider: BILLING_PROVIDER, ...row });
    if (error) console.error(`[recargas] registo por guardar (${row.status}): ${error.message}`);
  },
};

/** Dólares → micro-dólares inteiros, como o `credit_ledger` guarda. */
export const usdToMicros = (usd: number) => Math.round(usd * 1_000_000);

/**
 * Decide o que fazer com um evento da Kambafy e regista-o. Devolve o estado e o
 * motivo; uma falha da base de dados sobe como erro, para a plataforma repetir.
 */
export async function applyBillingEvent(body: unknown, deps: BillingDeps = supabaseBillingDeps): Promise<BillingOutcome> {
  const event = normalizeEvent(BILLING_PROVIDER, body);
  const base = {
    event_type: event.eventType,
    buyer_email: event.kind === "purchase" ? event.email : null,
    external_order_id: event.kind === "purchase" ? event.externalId : null,
    external_product_id: event.kind === "purchase" ? (event.productId ?? null) : null,
    organization_id: null as string | null,
  };
  const finish = async (status: BillingStatus, reason: string, organizationId: string | null = null) => {
    await deps.logEvent({ status, reason, ...base, organization_id: organizationId });
    return { status, reason };
  };

  if (event.kind === "ignore") return finish("ignored", event.reason);

  // Reembolso de uma recarga: retira os créditos que ela deu (proporcional, sem excesso, uma vez).
  if (event.status === "refunded") {
    if (!event.externalId) return finish("ignored", "O reembolso não traz o id da encomenda.");
    if (!event.email) return finish("unmatched", "O reembolso não traz o email de quem pagou.");
    const organizationId = await deps.organizationForEmail(event.email);
    if (!organizationId) return finish("unmatched", `Nenhuma conta tem ${event.email} como dono ou administrador.`);
    if (!deps.applyRefund) return finish("ignored", "Reembolsos de recargas por ligar.", organizationId);
    const state = await deps.applyRefund({
      organizationId,
      purchaseRef: `${BILLING_PROVIDER}:${event.externalId}`,
      refundRef: `${BILLING_PROVIDER}:${event.externalId}:refund:${event.amountValue ?? "total"}`,
      refundedTotal: event.amountValue,
      paidTotal: null,
    });
    if (state === "applied") return finish("accepted", `Reembolso da encomenda ${event.externalId}: créditos retirados.`, organizationId);
    return finish("ignored", `Reembolso da encomenda ${event.externalId}: ${state}.`, organizationId);
  }

  if (event.status !== "approved") return finish("ignored", `Pagamento ${event.status}: só um pagamento aprovado carrega créditos.`);
  // Um pagamento a zero não é uma compra (pedido fabricado ou cupão de 100 %).
  if (event.amountValue !== null && event.amountValue <= 0) return finish("ignored", "Pagamento sem valor: não carrega créditos.");
  if (!event.productId) return finish("ignored", "O evento não traz o id do produto.");
  if (!event.externalId) return finish("ignored", "O evento não traz o id da encomenda.");

  const product = await deps.findProduct(event.productId);
  if (!product) return finish("ignored", `O produto ${event.productId} não é uma recarga à venda.`);
  // Pago em dólares: tem de ser pelo menos o preço da recarga (nas outras moedas o câmbio decide na Kambafy).
  if (event.currency === "USD" && event.amountValue !== null && event.amountValue + 0.01 < product.usd_amount)
    return finish("ignored", `Pago ${event.amountValue} US$, abaixo do preço da recarga (${product.usd_amount} US$).`);

  if (!event.email) return finish("unmatched", "O pagamento não traz o email de quem pagou.");
  const organizationId = await deps.organizationForEmail(event.email);
  if (!organizationId) return finish("unmatched", `Nenhuma conta tem ${event.email} como dono ou administrador.`);

  const applied = await deps.applyTopup({
    organizationId,
    amountMicros: usdToMicros(product.usd_amount),
    ref: `${BILLING_PROVIDER}:${event.externalId}`,
    description: `Recarga ${product.label}`,
    meta: {
      email: event.email,
      product: event.productId,
      product_name: event.product || null,
      paid_amount: event.amountValue,
      paid_currency: event.currency,
    },
  });
  if (!applied) return finish("ignored", `A encomenda ${event.externalId} já tinha sido aplicada.`, organizationId);
  return finish("accepted", `${product.label}: ${product.usd_amount} US$ carregados.`, organizationId);
}

/* ---------- Pedido HTTP ---------- */

function same(a: string, b: string) {
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** O segredo vem em `x-webhook-secret` ou em `authorization: Bearer …`. */
function providedSecret(request: Request) {
  const header = request.headers.get("x-webhook-secret")?.trim();
  if (header) return header;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
}

const retryLater = () =>
  new Response("Temporarily unavailable", { status: 503, headers: { "retry-after": "60" } });

/**
 * Recebe o webhook de recargas: limite por IP, segredo em tempo constante, JSON, e a
 * decisão em `applyBillingEvent`. Responde 200 com {status, reason} ao que foi decidido,
 * e 503 quando a base de dados falha, para a Kambafy voltar a tentar.
 */
export async function receiveBillingWebhook(request: Request, ip: string, deps?: BillingDeps): Promise<Response> {
  if (!perSender.allow(ip)) return new Response("Too many requests", { status: 429, headers: { "retry-after": "60" } });

  const expected = process.env["BILLING_WEBHOOK_SECRET"]?.trim();
  if (!expected) return new Response("Recargas por configurar", { status: 503 });

  const raw = await readLimitedBody(request, MAX_BODY);
  if (raw === null) return new Response("Payload too large", { status: 413 });

  // A prova de que o aviso saiu dos servidores da Kambafy é a assinatura sobre este corpo e esta hora.
  // O segredo em claro só serve enquanto houver contas a enviar sem assinatura (transição).
  const signature = request.headers.get("x-kambafy-signature");
  if (signature) {
    const check = verifyKambafySignature(expected, raw, signature);
    if (!check.ok) return new Response(`Unauthorized (${check.reason})`, { status: 401 });
  } else {
    if (!unsignedAllowed()) return new Response("Unauthorized (missing signature)", { status: 401 });
    if (!same(providedSecret(request), expected)) return new Response("Unauthorized", { status: 401 });
    console.warn("[recargas] aviso sem assinatura aceite pelo segredo em claro (transição)");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    return Response.json(await applyBillingEvent(body, deps));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return retryLater();
  }
}
