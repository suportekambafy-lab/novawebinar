/**
 * Avisos assinados da Kambafy. Os mesmos ataques que o receptor de recargas aceitava (pedido fabricado
 * com o segredo, repetição com outro número de encomenda, valor zero) passam a ser recusados, e os
 * reembolsos retiram créditos. Base de dados simulada: nenhum crédito real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const { receiveBillingWebhook } = await import("./billing.server");
const { signLikeKambafy, verifyKambafySignature } = await import("./kambafy-signature");

const SECRET = "segredo-de-teste";
const now = () => Math.floor(Date.now() / 1000);
let granted: string[];
let refunds: { purchaseRef: string; refundRef: string; refundedTotal: number | null }[];
const deps = {
  findProduct: async () => ({ label: "Recarga 10 US$", usd_amount: 10 }),
  organizationForEmail: async () => "org-1",
  applyTopup: async ({ ref }: { ref: string }) => {
    granted.push(ref);
    return true;
  },
  applyRefund: async (args: { purchaseRef: string; refundRef: string; refundedTotal: number | null }) => {
    refunds.push(args);
    return "applied";
  },
  logEvent: async () => {},
};
const body = (order: string, extra: Record<string, unknown> = {}, event = "payment.success") =>
  JSON.stringify({ event, data: { order_id: order, product_id: "PROD", customer_email: "dono@conta.pt", amount: "10", currency: "USD", ...extra } });
const post = (raw: string, headers: Record<string, string>) =>
  receiveBillingWebhook(
    new Request("https://novawebinar.vercel.app/api/public/billing-webhook", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw }),
    `ip-${Math.random()}`,
    deps as never,
  );
const signed = (raw: string, t = now(), secret = SECRET) => ({ "x-kambafy-signature": signLikeKambafy(secret, raw, t) });

beforeEach(() => {
  process.env["BILLING_WEBHOOK_SECRET"] = SECRET;
  process.env["KAMBAFY_ALLOW_UNSIGNED"] = "off";
  granted = [];
  refunds = [];
});
afterEach(() => {
  delete process.env["KAMBAFY_ALLOW_UNSIGNED"];
});

describe("assinatura da Kambafy", () => {
  it("o formato é o da Kambafy (t=…,v1=hex) e só vale para o mesmo corpo, segredo e hora", () => {
    const raw = body("A1");
    const t = now();
    expect(verifyKambafySignature(SECRET, raw, signLikeKambafy(SECRET, raw, t)).ok).toBe(true);
    expect(verifyKambafySignature(SECRET, body("A2"), signLikeKambafy(SECRET, raw, t))).toEqual({ ok: false, reason: "invalid" });
    expect(verifyKambafySignature("outro", raw, signLikeKambafy(SECRET, raw, t))).toEqual({ ok: false, reason: "invalid" });
    expect(verifyKambafySignature(SECRET, raw, signLikeKambafy(SECRET, raw, t - 3600))).toEqual({ ok: false, reason: "expired" });
    expect(verifyKambafySignature(SECRET, raw, "lixo")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyKambafySignature(SECRET, raw, null)).toEqual({ ok: false, reason: "missing" });
  });
});

describe("recargas: os ataques reproduzidos deixam de passar", () => {
  it("um aviso assinado pela Kambafy carrega créditos", async () => {
    const raw = body("ENC-1");
    const r = await post(raw, signed(raw));
    expect(r.status).toBe(200);
    expect(granted).toEqual(["kambafy:ENC-1"]);
  });

  it("1. pedido fabricado só com o segredo (sem assinatura) é recusado", async () => {
    const r = await post(body("INVENTADA"), { "x-webhook-secret": SECRET });
    expect(r.status).toBe(401);
    expect(granted).toEqual([]);
  });

  it("2. um aviso verdadeiro apanhado não serve com outro número de encomenda nem mais tarde", async () => {
    const raw = body("VERDADEIRA");
    const header = signed(raw);
    const changed = await post(body("OUTRA"), header);
    expect(changed.status).toBe(401);
    const old = await post(raw, signed(raw, now() - 3600));
    expect(old.status).toBe(401);
    expect(granted).toEqual([]);
  });

  it("3. pagamento a zero ou abaixo do preço em dólares não carrega créditos", async () => {
    const zero = body("ZERO", { amount: "0" });
    await post(zero, signed(zero));
    const low = body("BAIXO", { amount: "1" });
    await post(low, signed(low));
    expect(granted).toEqual([]);
  });

  it("4. assinatura com outro segredo é recusada", async () => {
    const raw = body("SEG");
    expect((await post(raw, signed(raw, now(), "segredo-roubado"))).status).toBe(401);
  });

  it("transição: com KAMBAFY_ALLOW_UNSIGNED ligado, o segredo em claro ainda passa (contas antigas)", async () => {
    process.env["KAMBAFY_ALLOW_UNSIGNED"] = "on";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await post(body("ANTIGA"), { "x-webhook-secret": SECRET });
    expect(r.status).toBe(200);
    expect(granted).toEqual(["kambafy:ANTIGA"]);
    // Mas uma assinatura presente e errada nunca passa, mesmo na transição.
    const raw = body("ERRADA");
    expect((await post(raw, { "x-kambafy-signature": "t=1,v1=" + "0".repeat(64), "x-webhook-secret": SECRET })).status).toBe(401);
  });
});

describe("recargas: reembolsos retiram créditos", () => {
  it("reembolso assinado chama apply_credit_refund com a referência da compra", async () => {
    const raw = body("ENC-9", {}, "refund.approved");
    const r = await post(raw, signed(raw));
    expect(r.status).toBe(200);
    expect(refunds).toEqual([{ organizationId: "org-1", purchaseRef: "kambafy:ENC-9", refundRef: "kambafy:ENC-9:refund:10", refundedTotal: 10, paidTotal: null }]);
    expect(granted).toEqual([]);
  });

  it("reembolso fabricado (sem assinatura) não retira créditos de ninguém", async () => {
    const r = await post(body("ENC-9", {}, "refund.approved"), { "x-webhook-secret": SECRET });
    expect(r.status).toBe(401);
    expect(refunds).toEqual([]);
  });
});
