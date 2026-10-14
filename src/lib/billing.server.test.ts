import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Base de dados simulada: cada tabela e função responde o que o teste definir,
 * e fica o registo do que o receptor mandou gravar e das funções que chamou.
 */
type Result = { data: unknown; error: { message: string } | null };
type Write = { table: string; op: string; row: Record<string, unknown> };
type Call = { name: string; args: Record<string, unknown> };

let answers: Record<string, Result>;
let writes: Write[];
let calls: Call[];

const OPS = ["insert", "update", "upsert", "delete"];

function query(table: string) {
  let op = "select";
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_, name: string) {
        if (name === "then") {
          const result = answers[`${table}.${op}`] ?? { data: null, error: null };
          return (ok: (value: Result) => unknown) => Promise.resolve(result).then(ok);
        }
        return (...args: unknown[]) => {
          if (OPS.includes(name)) {
            op = name;
            writes.push({ table, op, row: (args[0] ?? {}) as Record<string, unknown> });
          }
          return chain;
        };
      },
    },
  );
  return chain;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return answers[`rpc.${name}`] ?? { data: null, error: null };
    },
  },
}));

const { applyBillingEvent, receiveBillingWebhook, perSender } = await import("./billing.server");

const PAYMENT = {
  event: "payment.success",
  email: "Ana@Exemplo.com",
  data: {
    order_id: "ORD-1",
    product_id: "prod-25",
    product_name: "Recarga 25",
    total_price: "22500.00",
    currency: "AOA",
  },
};
const PRODUCT = { label: "25 US$ em créditos", usd_amount: "25.00" };

const events = () => writes.filter((w) => w.table === "billing_events" && w.op === "insert").map((w) => w.row);
const topups = () => calls.filter((c) => c.name === "apply_credit_topup");

beforeEach(() => {
  writes = [];
  calls = [];
  answers = {
    "billing_products.select": { data: PRODUCT, error: null },
    "rpc.organization_for_billing_email": { data: "org-1", error: null },
    "rpc.apply_credit_topup": { data: true, error: null },
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("recarga: decisão sobre o evento", () => {
  it("pagamento aprovado de uma recarga carrega a organização do email", async () => {
    const outcome = await applyBillingEvent(PAYMENT);
    expect(outcome.status).toBe("accepted");
    expect(topups()).toMatchObject([
      {
        args: {
          _organization_id: "org-1",
          _amount_micros: 25_000_000,
          _ref: "kambafy:ORD-1",
          _description: "Recarga 25 US$ em créditos",
          _meta: { email: "ana@exemplo.com", product: "prod-25" },
        },
      },
    ]);
    expect(calls.find((c) => c.name === "organization_for_billing_email")?.args).toEqual({ _email: "ana@exemplo.com" });
    expect(events()).toMatchObject([
      {
        provider: "kambafy",
        status: "accepted",
        event_type: "payment.success",
        buyer_email: "ana@exemplo.com",
        external_order_id: "ORD-1",
        external_product_id: "prod-25",
        organization_id: "org-1",
      },
    ]);
  });

  it("a mesma encomenda duas vezes fica ignorada à segunda, sem carregar outra vez", async () => {
    answers["rpc.apply_credit_topup"] = { data: false, error: null };
    const outcome = await applyBillingEvent(PAYMENT);
    expect(outcome.status).toBe("ignored");
    expect(outcome.reason).toMatch(/já tinha sido aplicada/);
    expect(events()).toMatchObject([{ status: "ignored", organization_id: "org-1", external_order_id: "ORD-1" }]);
  });

  it("email sem conta fica por corresponder e não carrega nada", async () => {
    answers["rpc.organization_for_billing_email"] = { data: null, error: null };
    const outcome = await applyBillingEvent(PAYMENT);
    expect(outcome.status).toBe("unmatched");
    expect(topups()).toHaveLength(0);
    expect(events()).toMatchObject([{ status: "unmatched", buyer_email: "ana@exemplo.com", organization_id: null }]);
  });

  it("pagamento sem email fica por corresponder", async () => {
    const outcome = await applyBillingEvent({ ...PAYMENT, email: undefined });
    expect(outcome.status).toBe("unmatched");
    expect(calls).toHaveLength(0);
  });

  it("evento que não é pagamento aprovado fica ignorado sem ler produtos", async () => {
    for (const body of [
      { ...PAYMENT, event: "order.pending" },
      { ...PAYMENT, event: "refund.approved" },
      { ...PAYMENT, event: "test.webhook" },
      { ...PAYMENT, event: "customer.updated" },
    ]) {
      writes = [];
      calls = [];
      const outcome = await applyBillingEvent(body);
      expect(outcome.status).toBe("ignored");
      expect(calls).toHaveLength(0);
      expect(events()).toMatchObject([{ status: "ignored", event_type: body.event }]);
    }
  });

  it("produto que não é uma recarga fica ignorado", async () => {
    answers["billing_products.select"] = { data: null, error: null };
    const outcome = await applyBillingEvent(PAYMENT);
    expect(outcome.status).toBe("ignored");
    expect(outcome.reason).toMatch(/prod-25/);
    expect(calls).toHaveLength(0);
    expect(events()).toMatchObject([{ status: "ignored", external_product_id: "prod-25" }]);
  });

  it("pagamento sem id de encomenda fica ignorado: sem referência não há idempotência", async () => {
    const outcome = await applyBillingEvent({ ...PAYMENT, data: { ...PAYMENT.data, order_id: undefined } });
    expect(outcome.status).toBe("ignored");
    expect(topups()).toHaveLength(0);
  });

  it("falha da base de dados sobe como erro, para a plataforma repetir", async () => {
    answers["billing_products.select"] = { data: null, error: { message: "fetch failed" } };
    await expect(applyBillingEvent(PAYMENT)).rejects.toThrow(/produto por ler/);
    expect(events()).toHaveLength(0);
  });
});

describe("recarga: pedido HTTP", () => {
  const env = process.env["BILLING_WEBHOOK_SECRET"];
  beforeEach(() => {
    process.env["BILLING_WEBHOOK_SECRET"] = "segredo";
  });
  afterEach(() => {
    if (env === undefined) delete process.env["BILLING_WEBHOOK_SECRET"];
    else process.env["BILLING_WEBHOOK_SECRET"] = env;
  });

  const send = (headers: Record<string, string>, body: unknown = PAYMENT, ip = "203.0.113.7") =>
    receiveBillingWebhook(
      new Request("https://app.test/api/public/billing-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      ip,
    );

  it("sem segredo no ambiente responde 503 e não grava nada", async () => {
    delete process.env["BILLING_WEBHOOK_SECRET"];
    const response = await send({ "x-webhook-secret": "segredo" });
    expect(response.status).toBe(503);
    expect(events()).toHaveLength(0);
  });

  it("segredo errado ou em falta responde 401", async () => {
    expect((await send({ "x-webhook-secret": "outro" })).status).toBe(401);
    expect((await send({})).status).toBe(401);
    expect(events()).toHaveLength(0);
  });

  it("segredo certo, no cabeçalho próprio ou como Bearer, responde 200 com a decisão", async () => {
    const a = await send({ "x-webhook-secret": "segredo" });
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ status: "accepted" });
    const b = await send({ authorization: "Bearer segredo" });
    expect(b.status).toBe(200);
    expect(await b.json()).toMatchObject({ status: "accepted" });
  });

  it("JSON inválido responde 400", async () => {
    expect((await send({ "x-webhook-secret": "segredo" }, "{nope")).status).toBe(400);
  });

  it("falha da base de dados responde 503 com retry-after", async () => {
    answers["rpc.apply_credit_topup"] = { data: null, error: { message: "down" } };
    const response = await send({ "x-webhook-secret": "segredo" });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("demasiados pedidos do mesmo IP respondem 429", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < 60; i += 1) expect(perSender.allow(ip)).toBe(true);
    expect((await send({ "x-webhook-secret": "segredo" }, PAYMENT, ip)).status).toBe(429);
  });
});
