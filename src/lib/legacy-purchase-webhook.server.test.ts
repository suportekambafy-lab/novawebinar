import { beforeEach, describe, expect, it, vi } from "vitest";

/** A mesma base simulada do receptor por integração (integrations.server.test). */
type Result = { data: unknown; error: { message: string; code?: string } | null };
type Write = { table: string; op: string; row: Record<string, unknown> };
let answers: Record<string, Result>;
let writes: Write[];
let rpcs: { name: string; args: Record<string, unknown> }[];
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
      rpcs.push({ name, args });
      return answers[`rpc.${name}`] ?? { data: null, error: null };
    },
  },
}));
vi.mock("@/lib/ab-tests/assign.server", () => ({ attributePurchase: async () => undefined }));

const { handleLegacyPurchaseWebhook } = await import("./legacy-purchase-webhook.server");

const WEBINAR = "6ccaa849-2819-472c-8327-b0d088c02515";
const SETTINGS = { webinar_id: WEBINAR, organization_id: "org-1", webhook_secret: "segredo", product_name: "Marca Milionária" };

/** O que a Kambafy envia (comprador na raiz e dentro de `data`). */
const KAMBAFY = {
  event: "payment.success",
  timestamp: "2026-10-19T07:38:12.706Z",
  order_id: "QWGDL8AI6",
  event_id: "purchase_QWGDL8AI6",
  email: "cliente@exemplo.com",
  name: "Nome do Cliente",
  phone: "912345678",
  data: {
    order_id: "QWGDL8AI6",
    amount: 197,
    total: 197,
    currency: "EUR",
    customer_email: "cliente@exemplo.com",
    customer_name: "Nome do Cliente",
    customer_phone: "912345678",
    payment_method: "klarna",
    product_id: "a775fa08-39e3-4cc2-ac06-da89531c7d68",
    product_name: "Marca Milionária Legacy",
    status: "completed",
    paid_at: "2026-10-18T21:18:50.994Z",
  },
  version: "1.0",
  webhook_id: "016882fc-51a1-469e-9c84-585d8a62c5c9",
};

const post = (body: unknown, query = `?w=${WEBINAR}&s=segredo`, headers: Record<string, string> = {}) =>
  handleLegacyPurchaseWebhook(
    new Request(`https://www.novawebinar.com/api/public/purchase-webhook${query}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const written = (table: string, op = "insert") => writes.filter((w) => w.table === table && w.op === op);

beforeEach(() => {
  writes = [];
  rpcs = [];
  answers = {
    "social_proof_settings.select": { data: SETTINGS, error: null },
    "integrations.select": { data: { id: "int-kambafy" }, error: null },
    "rpc.upsert_contact": { data: "contact-1", error: null },
    "real_purchase_events.insert": { data: { id: "purchase-1" }, error: null },
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("endereço antigo de compras: o formato da Kambafy", () => {
  it("regista a venda com ?w=&s= na URL e responde ok com a conversão", async () => {
    const response = await post(KAMBAFY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      conversions: [{ purchase_id: "purchase-1", webinar_id: WEBINAR, external_id: "QWGDL8AI6", status: "approved", duplicate: false }],
    });
    // Entra como venda da Kambafy, atribuída ao webinar do segredo, com o contacto (e o telefone) criado.
    expect(written("real_purchase_events")[0]!.row).toMatchObject({
      organization_id: "org-1",
      webinar_id: WEBINAR,
      buyer_email: "cliente@exemplo.com",
      buyer_name: "Nome do Cliente",
      amount_value: 197,
      currency: "EUR",
      product_id: "a775fa08-39e3-4cc2-ac06-da89531c7d68",
      product_name: "Marca Milionária Legacy",
      provider: "kambafy",
      external_id: "QWGDL8AI6",
      status: "approved",
    });
    expect(rpcs.find((r) => r.name === "upsert_contact")?.args).toMatchObject({ _email: "cliente@exemplo.com", _phone: "912345678" });
    // Fica no registo da integração da Kambafy deste webinar.
    expect(written("integration_events")[0]!.row).toMatchObject({ status: "accepted", integration_id: "int-kambafy" });
  });

  it("a mesma venda já registada pelo receptor novo não entra duas vezes", async () => {
    answers["real_purchase_events.select"] = {
      data: { id: "purchase-9", status: "approved", amount_value: 197, currency: "EUR", product_name: "x", webinar_id: WEBINAR },
      error: null,
    };
    const response = await post(KAMBAFY);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      conversions: [{ purchase_id: "purchase-9", webinar_id: WEBINAR, external_id: "QWGDL8AI6", status: "approved", duplicate: true }],
    });
    expect(written("real_purchase_events")).toHaveLength(0);
  });

  it("o segredo pode vir no cabeçalho x-webhook-secret e o webinar no corpo", async () => {
    const response = await post({ ...KAMBAFY, webinar_id: WEBINAR }, "", { "x-webhook-secret": "segredo" });
    expect(response.status).toBe(200);
    expect(written("real_purchase_events")).toHaveLength(1);
  });

  it("o teste do webhook da Kambafy responde ok sem registar nada", async () => {
    const response = await post({ event: "test.webhook", data: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, conversions: [] });
    expect(written("real_purchase_events")).toHaveLength(0);
  });
});

describe("endereço antigo de compras: recusas com o motivo", () => {
  it("sem webinar nem segredo: 400 em JSON com os campos em falta e o que veio", async () => {
    const response = await post(KAMBAFY, "");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: "Dados em falta", missing_fields: ["webinar_id", "secret"] });
    expect(body.received_keys).toEqual(expect.arrayContaining(["event", "order_id", "email", "data"]));
    expect(written("real_purchase_events")).toHaveLength(0);
  });

  it("segredo errado: 401 em JSON", async () => {
    const response = await post(KAMBAFY, `?w=${WEBINAR}&s=errado`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: "Não autorizado" });
  });

  it("corpo que não é JSON: 400 em JSON", async () => {
    const response = await post("isto não é json");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("formato antigo sem e-mail: diz que falta o e-mail", async () => {
    const response = await post({ buyer_name: "Ana" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, missing_fields: ["email"], received_keys: ["buyer_name"] });
  });
});

describe("endereço antigo de compras: o formato antigo continua a entrar", () => {
  it("buyer_name/buyer_email com o segredo e o webinar no corpo", async () => {
    const response = await post(
      { webinar_id: WEBINAR, secret: "segredo", buyer_name: "Ana Silva", buyer_email: "ana@exemplo.com", amount: "149,00", order_id: "A1" },
      "",
    );
    expect(response.status).toBe(200);
    expect(written("real_purchase_events")[0]!.row).toMatchObject({
      provider: "legacy",
      buyer_email: "ana@exemplo.com",
      buyer_name: "Ana Silva",
      amount_value: 149,
      external_id: "A1",
      webinar_id: WEBINAR,
      // Sem nome do produto no pedido, fica o do webinar.
      product_name: "Marca Milionária",
    });
    // Sem integração para o formato antigo: o registo fica sem integração.
    expect(written("integration_events")[0]!.row).toMatchObject({ status: "accepted", integration_id: null, provider: "legacy" });
  });
});
