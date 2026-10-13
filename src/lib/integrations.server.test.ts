import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Base de dados simulada: cada tabela e operação responde o que o teste
 * definir, e fica o registo do que o receptor mandou gravar.
 */
type Result = { data: unknown; error: { message: string; code?: string } | null };
type Write = { table: string; op: string; row: Record<string, unknown> };

/** Uma lista responde por ordem, uma chamada de cada vez (a última repete-se). */
let answers: Record<string, Result | Result[]>;
let writes: Write[];

const OPS = ["insert", "update", "upsert", "delete"];

function query(table: string) {
  let op = "select";
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_, name: string) {
        if (name === "then") {
          const answer = answers[`${table}.${op}`] ?? { data: null, error: null };
          const result: Result = Array.isArray(answer) ? (answer.length > 1 ? answer.shift()! : answer[0]!) : answer;
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
    rpc: async (name: string) => (answers[`rpc.${name}`] as Result | undefined) ?? { data: null, error: null },
  },
}));

const { receiveIntegrationWebhook } = await import("./integrations.server");

const INTEGRATION = {
  id: "int-1",
  organization_id: "org-1",
  provider: "webhook",
  enabled: true,
  secret: "segredo",
};
const SALE = {
  id: "T-100",
  status: "approved",
  email: "joao@exemplo.com",
  name: "João",
  amount: 100,
};
const down = (message = "fetch failed"): Result => ({ data: null, error: { message } });

const send = (body: unknown = SALE, secret = "segredo") =>
  receiveIntegrationWebhook(
    "chave",
    new Request("https://app.test/api/public/hooks/chave", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": secret },
      body: JSON.stringify(body),
    }),
  );

const written = (table: string, op = "insert") =>
  writes.filter((w) => w.table === table && w.op === op);
const logged = () => written("integration_events").map((w) => w.row);

beforeEach(() => {
  writes = [];
  answers = {
    "integrations.select": { data: INTEGRATION, error: null },
    "rpc.upsert_contact": { data: "contact-1", error: null },
    "rpc.purchase_attribution": { data: [], error: null },
    "real_purchase_events.insert": { data: { id: "purchase-1" }, error: null },
    "real_purchase_events.update": { data: [{ id: "purchase-1" }], error: null },
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("webhook de venda: resposta à plataforma", () => {
  it("falha a ler a integração responde 503, nunca 404", async () => {
    answers["integrations.select"] = down();
    const response = await send();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(written("real_purchase_events")).toHaveLength(0);
  });

  it("chave que não existe responde 404", async () => {
    answers["integrations.select"] = { data: null, error: null };
    expect((await send()).status).toBe(404);
  });

  it("integração sem segredo recusa com 401: o endereço sozinho não chega", async () => {
    answers["integrations.select"] = { data: { ...INTEGRATION, secret: "" }, error: null };
    const response = await send(SALE, "");
    expect(response.status).toBe(401);
    expect(written("real_purchase_events")).toHaveLength(0);
  });

  it("segredo errado responde 401 e não guarda o pedido em bruto", async () => {
    const response = await send(SALE, "outro");
    expect(response.status).toBe(401);
    expect(logged()).toMatchObject([{ status: "rejected", payload: null }]);
    expect(written("real_purchase_events")).toHaveLength(0);
  });

  it("venda nova fica guardada, com o pedido em bruto no registo", async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(written("real_purchase_events")).toMatchObject([
      {
        row: {
          external_id: "T-100",
          status: "approved",
          contact_id: "contact-1",
          organization_id: "org-1",
        },
      },
    ]);
    expect(logged()).toMatchObject([
      { status: "accepted", purchase_id: "purchase-1", payload: JSON.stringify(SALE) },
    ]);
  });
});

describe("webhook de venda: o mesmo evento duas vezes", () => {
  it("a repetição não cria segunda venda", async () => {
    answers["real_purchase_events.select"] = {
      data: {
        id: "purchase-1",
        status: "approved",
        amount_value: 100,
        currency: null,
        product_name: "",
        webinar_id: null,
      },
      error: null,
    };
    const response = await send();
    expect(response.status).toBe(200);
    expect(written("real_purchase_events")).toHaveLength(0);
    expect(written("real_purchase_events", "update")).toHaveLength(0);
    expect(logged()).toMatchObject([{ status: "ignored", purchase_id: "purchase-1" }]);
  });

  it("um reembolso avança o estado da venda que já existe", async () => {
    answers["real_purchase_events.select"] = {
      data: {
        id: "purchase-1",
        status: "approved",
        amount_value: 100,
        currency: null,
        product_name: "",
        webinar_id: null,
      },
      error: null,
    };
    const response = await send({ ...SALE, status: "refunded" });
    expect(response.status).toBe(200);
    expect(written("real_purchase_events")).toHaveLength(0);
    expect(written("real_purchase_events", "update")).toMatchObject([
      { row: { status: "refunded" } },
    ]);
  });
});

describe("webhook de venda: falhas nossas devolvem o evento à plataforma", () => {
  it.each([
    ["ler se a venda já existe", "real_purchase_events.select"],
    ["guardar o contacto", "rpc.upsert_contact"],
    ["calcular a atribuição", "rpc.purchase_attribution"],
    ["guardar a venda", "real_purchase_events.insert"],
  ])("falha a %s responde 503", async (_what, key) => {
    answers[key] = down();
    const response = await send();
    expect(response.status).toBe(503);
    expect(logged().at(-1)).toMatchObject({ status: "rejected", payload: JSON.stringify(SALE) });
  });

  it("sem contacto guardado, a venda não fica solta", async () => {
    answers["rpc.upsert_contact"] = down();
    await send();
    expect(written("real_purchase_events")).toHaveLength(0);
  });
});

describe("webhook de venda: atribuição só com prova", () => {
  it("guarda o webinar e o motivo que a base de dados encontrou", async () => {
    answers["rpc.purchase_attribution"] = { data: [{ webinar_id: "web-7", evidence: "offer" }], error: null };
    await send({ ...SALE, product_id: "prod-1" });
    expect(written("real_purchase_events")).toMatchObject([{ row: { webinar_id: "web-7" } }]);
    expect(logged()).toMatchObject([{ reason: "Atribuída ao webinar cuja oferta aponta para este produto." }]);
  });

  it("sem prova fica sem webinar, em vez de inventar a última inscrição", async () => {
    await send();
    expect(written("real_purchase_events")).toMatchObject([{ row: { webinar_id: null } }]);
    expect(logged()[0]?.["reason"]).toMatch(/^Sem webinar atribuível/);
  });

  it("o receptor de um webinar (Integrações, «este webinar») atribui-lhe a venda sem adivinhar", async () => {
    answers["integrations.select"] = { data: { ...INTEGRATION, webinar_id: "web-3" }, error: null };
    answers["rpc.purchase_attribution"] = { data: [{ webinar_id: "web-7", evidence: "offer" }], error: null };
    await send({ ...SALE, product_id: "prod-1" });
    expect(written("real_purchase_events")).toMatchObject([{ row: { webinar_id: "web-3" } }]);
    expect(logged()).toMatchObject([{ reason: "Atribuída ao webinar desta integração." }]);
  });
});

describe("webhook de venda: tentativas que não acabaram em compra", () => {
  const existing = (status: string) => ({
    data: { id: "purchase-1", status, amount_value: 100, currency: null, product_name: "", webinar_id: null },
    error: null,
  });

  it("um pagamento falhado fica registado como falhado, não como venda", async () => {
    await send({ ...SALE, status: "failed" });
    expect(written("real_purchase_events")).toMatchObject([{ row: { status: "failed" } }]);
  });

  it("um pagamento falhado que depois é aprovado passa a compra", async () => {
    answers["real_purchase_events.select"] = existing("failed");
    await send();
    expect(written("real_purchase_events", "update")).toMatchObject([{ row: { status: "approved" } }]);
  });

  it("uma falha que chega depois da compra não a desfaz", async () => {
    answers["real_purchase_events.select"] = existing("approved");
    await send({ ...SALE, status: "failed" });
    expect(written("real_purchase_events", "update")).toHaveLength(0);
    expect(logged()).toMatchObject([{ status: "ignored" }]);
  });
});

describe("webhook de venda: idempotência", () => {
  const row = (status: string) => ({
    id: "purchase-1", status, amount_value: 100, currency: null, product_name: "", webinar_id: null,
  });

  it("sem id da plataforma, o mesmo pedido dá sempre a mesma chave", async () => {
    const { id: _id, ...noId } = SALE;
    await send(noId);
    await send(noId);
    const keys = written("real_purchase_events").map((w) => w.row["external_id"]);
    expect(keys[0]).toMatch(/^body:[0-9a-f]{32}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("dois envios em simultâneo: quem perde no índice único volta a ler e não duplica", async () => {
    answers["real_purchase_events.select"] = [{ data: null, error: null }, { data: row("approved"), error: null }];
    answers["real_purchase_events.insert"] = { data: null, error: { message: "duplicate key", code: "23505" } };
    const response = await send();
    expect(response.status).toBe(200);
    expect(written("real_purchase_events")).toHaveLength(1);
    expect(logged()).toMatchObject([{ status: "ignored", purchase_id: "purchase-1" }]);
  });

  it("estado mudado entretanto: a actualização não recua a venda", async () => {
    // Lê pendente; entretanto outro pedido aprovou; a falha que chega não desfaz a compra.
    answers["real_purchase_events.select"] = [{ data: row("pending"), error: null }, { data: row("approved"), error: null }];
    answers["real_purchase_events.update"] = { data: [], error: null };
    const response = await send({ ...SALE, status: "failed" });
    expect(response.status).toBe(200);
    expect(written("real_purchase_events", "update")).toHaveLength(1);
    expect(logged()).toMatchObject([{ status: "ignored" }]);
  });

  it("pendente, falhado, abandonado e reembolso nunca contam como compra nova", async () => {
    for (const status of ["pending", "failed", "abandoned", "refunded"]) {
      writes = [];
      await send({ ...SALE, id: `T-${status}`, status });
      expect(written("real_purchase_events")).toMatchObject([{ row: { status } }]);
    }
  });
});
