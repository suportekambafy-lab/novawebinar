import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Executor das automações com a base de dados e a rede simuladas. A reserva e o
 * resultado são funções da base de dados (claim_automation_runs / finish_automation_run):
 * aqui confirma-se que o executor só corre o que reservou, uma vez, e grava o resultado
 * certo para cada desfecho da acção.
 */
type Result = { data: unknown; error: { message: string } | null };

let answers: Record<string, Result>;
let rpcCalls: { name: string; args: Record<string, unknown> }[];
let fetchMock: ReturnType<typeof vi.fn>;
let filters: { table: string; name: string; args: unknown[] }[] = [];

/** Uma consulta encadeada; `answer` decide o resultado quando é esperada (then). */
function chainOf(table: string, answer: (op: string) => Result) {
  let op = "select";
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_, name: string) {
        if (name === "then") return (ok: (value: Result) => unknown) => Promise.resolve(answer(op)).then(ok);
        return (...args: unknown[]) => {
          if (name === "update") op = "update";
          filters.push({ table, name, args });
          return chain;
        };
      },
    },
  );
  return chain;
}

/** Uma resposta fixa, ou uma lista consumida pela ordem das leituras. */
const pick = (key: string): Result | undefined => {
  const answer = answers[key] as Result | Result[] | undefined;
  return Array.isArray(answer) ? (answer.shift() ?? { data: null, error: null }) : answer;
};
const query = (table: string) => chainOf(table, (op) => pick(`${table}.${op}`) ?? pick(table) ?? { data: null, error: null });

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => query(table),
    // Como no supabase-js: a chamada aceita filtros (eq, maybeSingle) antes de ser esperada.
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return chainOf(`rpc.${name}`, () => {
        const answer = answers[`rpc.${name}`];
        if (Array.isArray(answer)) return answer.shift() ?? { data: null, error: null };
        // A reserva entrega cada execução uma só vez (a seguinte já não a encontra 'ready').
        if (name === "claim_automation_runs") delete answers[`rpc.${name}`];
        return answer ?? { data: null, error: null };
      });
    },
  },
}));

const { runDueAutomations } = await import("./automations.server");

const RUN = {
  id: "run-1",
  organization_id: "org-1",
  automation_id: "auto-1",
  event_id: 42,
  contact_id: "contact-1",
  webinar_id: "web-1",
  webinar_session_id: "session-1",
  status: "running",
  attempts: 1,
  facts: { attended: true, purchased: false, actual_watch_seconds: 900 },
};
const HOOK = { enabled: true, secret: "segredo", settings: { url: "https://hooks.exemplo.com/in" } };

const finishes = () => rpcCalls.filter((c) => c.name === "finish_automation_run").map((c) => c.args);

beforeEach(() => {
  rpcCalls = [];
  filters = [];
  answers = {
    "rpc.claim_automation_runs": { data: [RUN], error: null },
    automations: { data: { id: "auto-1", name: "Recuperação" }, error: null },
    contacts: { data: { id: "contact-1", name: "Ana", email: "ana@exemplo.com", phone: null }, error: null },
    webinars: { data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula" }, error: null },
    webinar_sessions: { data: { id: "session-1", starts_at: "2026-09-28T19:00:00Z", ends_at: "2026-09-28T20:00:00Z" }, error: null },
    integrations: { data: HOOK, error: null },
    // A reserva continua nesta passagem; advance/finish mudam a linha reservada.
    "automation_runs.update": { data: [{ id: "run-1" }], error: null },
    "rpc.advance_automation_run": { data: "waiting", error: null },
    "rpc.finish_automation_run": { data: "done", error: null },
  };
  fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("executar uma automação pronta", () => {
  it("sem execuções prontas não faz nada", async () => {
    answers["rpc.claim_automation_runs"] = { data: [], error: null };
    expect(await runDueAutomations()).toEqual({ executed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finishes()).toEqual([]);
  });

  it("envia o contacto real para o webhook de saída, assinado e com o id da entrega", async () => {
    await runDueAutomations();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.exemplo.com/in");
    const headers = init.headers as Record<string, string>;
    const body = String(init.body);
    expect(headers["x-delivery-id"]).toBe("run-1");
    expect(headers["x-signature"]).toBe(createHmac("sha256", "segredo").update(body).digest("hex"));
    expect(init.redirect).toBe("manual");
    const sent = JSON.parse(body);
    expect(sent.event).toBe("automation.run");
    expect(sent.data.contact).toEqual({ id: "contact-1", name: "Ana", email: "ana@exemplo.com", phone: null });
    expect(sent.data.automation).toEqual({ id: "auto-1", name: "Recuperação" });
    expect(sent.data.session.id).toBe("session-1");
    expect(sent.data.facts).toEqual(RUN.facts);
    // O link da sala identifica a pessoa, como nas mensagens; sem replay ligado não há link do replay.
    expect(sent.data.room_url).toMatch(/\/w\/aula\?nome=Ana&email=ana%40exemplo\.com$/);
    expect(sent.data.replay_url).toBeNull();
    expect(finishes()).toEqual([
      expect.objectContaining({ _run_id: "run-1", _ok: true, _transient: false, _error: null }),
    ]);
    expect(finishes()[0]!["_result"]).toMatchObject({ action: "outgoing_webhook", http_status: 200 });
  });

  it("5xx, 429 e falta de resposta são passageiros: a base de dados volta a tentar", async () => {
    for (const response of [
      () => new Response("", { status: 503 }),
      () => new Response("", { status: 429 }),
      () => Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })),
      () => Promise.reject(new TypeError("fetch failed")),
    ]) {
      rpcCalls = [];
      answers["rpc.claim_automation_runs"] = { data: [RUN], error: null };
      fetchMock.mockImplementationOnce(response as never);
      await runDueAutomations();
      expect(finishes()[0]).toMatchObject({ _ok: false, _transient: true });
    }
  });

  it("4xx e redireccionamentos são definitivos: não se insiste", async () => {
    for (const status of [400, 404, 301]) {
      rpcCalls = [];
      answers["rpc.claim_automation_runs"] = { data: [RUN], error: null };
      fetchMock.mockResolvedValueOnce(new Response(null, { status }));
      await runDueAutomations();
      expect(finishes()[0]).toMatchObject({ _ok: false, _transient: false, _error: `O destino respondeu HTTP ${status}.` });
    }
  });

  it("webhook de saída desligado: falha definitiva, sem pedido", async () => {
    answers["integrations"] = { data: { ...HOOK, enabled: false }, error: null };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finishes()[0]).toMatchObject({ _ok: false, _transient: false });
  });

  it("um endereço interno nunca recebe o pedido", async () => {
    answers["integrations"] = { data: { ...HOOK, settings: { url: "https://127.0.0.1/in" } }, error: null };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("contacto de outra organização (ou apagado) não é lido: falha definitiva, sem envio", async () => {
    answers["contacts"] = { data: null, error: null };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finishes()[0]).toMatchObject({ _ok: false, _transient: false });
  });

  it("leitura falhada da base de dados é passageira, nunca 'não existe'", async () => {
    answers["contacts"] = { data: null, error: { message: "fetch failed" } };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finishes()[0]).toMatchObject({ _ok: false, _transient: true });
  });

  it("se gravar o resultado falhar, repete a gravação (não a acção)", async () => {
    answers["rpc.finish_automation_run"] = [
      { data: null, error: { message: "fetch failed" } },
      { data: "done", error: null },
    ] as never;
    await runDueAutomations();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(finishes()).toHaveLength(2);
  });

  it("dois executores ao mesmo tempo: só quem reservou a execução a executa", async () => {
    // A reserva é atómica na base de dados: o primeiro pedido leva a execução, o segundo nada.
    answers["rpc.claim_automation_runs"] = [
      { data: [RUN], error: null },
      { data: [], error: null },
    ] as never;
    const [first, second] = await Promise.all([runDueAutomations(), runDueAutomations()]);
    expect(first.executed + second.executed).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(finishes()).toHaveLength(1);
  });

  it("conta de teste: nada sai para a rede, e fica o que teria sido enviado", async () => {
    answers["integrations"] = { data: { ...HOOK, organizations: { is_test: true } }, error: null };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finishes()[0]).toMatchObject({ _ok: true, _transient: false });
    expect(finishes()[0]!["_result"]).toMatchObject({ sandbox: true, http_status: 200 });
    expect((finishes()[0]!["_result"] as { payload: { contact: { email: string } } }).payload.contact.email).toBe(
      "ana@exemplo.com",
    );
  });

  it("conta de teste com falha simulada: a 1.ª tentativa é passageira, a 2.ª passa", async () => {
    answers["integrations"] = {
      data: { ...HOOK, settings: { ...HOOK.settings, simulate: "fail_first" }, organizations: { is_test: true } },
      error: null,
    };
    await runDueAutomations();
    expect(finishes()[0]).toMatchObject({ _ok: false, _transient: true, _error: expect.stringContaining("simulada") });
    rpcCalls = [];
    answers["rpc.claim_automation_runs"] = { data: [{ ...RUN, attempts: 2 }], error: null };
    await runDueAutomations();
    expect(finishes()[0]).toMatchObject({ _ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gatilho de pagamento: o pagamento vai no envio", async () => {
    answers["automations"] = { data: { id: "auto-1", name: "Boas-vindas", trigger_event: "purchase_approved" }, error: null };
    answers["activity_events"] = {
      data: { name: "purchase_approved", occurred_at: "2026-09-28T20:00:00Z", data: { purchase_id: "p-1", status: "approved", product: "Curso", amount: 100, currency: "AOA" } },
      error: null,
    };
    await runDueAutomations();
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent.data.trigger).toMatchObject({ event: "purchase_approved", event_id: 42 });
    expect(sent.data.purchase).toEqual({ id: "p-1", status: "approved", product: "Curso", amount: 100, currency: "AOA" });
  });

  it("a reserva falhada não executa nada e avisa quem chamou", async () => {
    answers["rpc.claim_automation_runs"] = { data: null, error: { message: "fetch failed" } };
    await expect(runDueAutomations()).rejects.toThrow("fetch failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("automações com passos (workflow)", () => {
  const STEPS = {
    start: "b",
    nodes: [
      { id: "b", kind: "branch", condition: { fact: "purchased", value: true }, yes: null, no: "m" },
      {
        id: "m",
        kind: "action",
        label: "Recuperação",
        sends: [
          { channel: "email", target: "contact", subject: "Olá {{primeiro_nome}}", message: "Ainda vai a tempo" },
          { channel: "whatsapp", target: "group", group: "Webinar IA", message: "Replay disponível" },
        ],
        next: "w",
      },
      { id: "w", kind: "wait", mode: "delay", minutes: 120, next: "m2" },
      { id: "m2", kind: "action", sends: [{ channel: "webhook", target: "webhook" }], next: null },
    ],
  };
  const advances = () => rpcCalls.filter((c) => c.name === "advance_automation_run").map((c) => c.args);
  const withSteps = (isTest: boolean, extra: Record<string, unknown> = {}) => {
    answers["automations"] = {
      data: { id: "auto-1", name: "Pós-webinar", trigger_event: "webinar_session_ended", conditions: [], steps: STEPS, organizations: { is_test: isTest }, ...extra },
      error: null,
    };
  };

  it("ramo sem mensagem: decide com os factos de agora e deixa a mensagem pronta, sem enviar nada", async () => {
    withSteps(true);
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: { purchased: false } }, error: null };
    answers["rpc.claim_automation_runs"] = [{ data: [{ ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: null, guards: [], steps_log: [] }], error: null }] as never;
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(advances()[0]).toMatchObject({ _status: "next", _cursor: "m", _guards: [{ fact: "purchased", value: false }] });
  });

  it("mensagem na conta de teste: email e WhatsApp em grupo simulados, espera agendada a seguir", async () => {
    withSteps(true);
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: { purchased: false } }, error: null };
    answers["rpc.claim_automation_runs"] = [
      { data: [{ ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: "m", guards: [{ fact: "purchased", value: false }], steps_log: [] }], error: null },
    ] as never;
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    const step = advances()[0]!;
    expect(step).toMatchObject({ _status: "next", _cursor: "m2" });
    const log = step["_log"] as { sends?: { channel: string; target: string; status: string; to: string | null }[]; preview?: { subject: string }[] }[];
    expect(log[0]!.sends).toEqual([
      { channel: "email", target: "contact", to: "an…com", status: "simulated" },
      { channel: "whatsapp", target: "group", to: "Webinar IA", status: "simulated" },
    ]);
    expect(log[0]!.preview![0]!.subject).toBe("Olá Ana");
    expect(Date.parse(step["_scheduled_for"] as string) - Date.now()).toBeGreaterThan(119 * 60_000);
  });

  it("grupo: a mensagem sai uma vez por sessão; as outras pessoas só registam que o grupo já a recebeu", async () => {
    withSteps(true);
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: { purchased: false } }, error: null };
    answers["automation_runs"] = { data: [{ id: "run-0" }], error: null };
    answers["rpc.claim_automation_runs"] = [
      { data: [{ ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: "m", guards: [{ fact: "purchased", value: false }], steps_log: [] }], error: null },
    ] as never;
    await runDueAutomations();
    const log = advances()[0]!["_log"] as { sends?: { target: string; status: string }[] }[];
    expect(log[0]!.sends!.map((s) => `${s.target}:${s.status}`)).toEqual(["contact:simulated", "group:shared"]);
    // steps_log é jsonb: o filtro vai em JSON (um array JS iria como array do Postgres e falhava).
    const contains = filters.find((f) => f.table === "automation_runs" && f.name === "contains")!;
    // Só conta o envio que saiu (aqui, simulado): um que falhou não impede o seguinte.
    expect(JSON.parse(contains.args[1] as string)).toEqual([
      { node: "m", sends: [{ channel: "whatsapp", target: "group", to: "Webinar IA", status: "simulated" }] },
    ]);
  });

  it("comprou entretanto: a recuperação é cancelada antes de a mensagem sair", async () => {
    withSteps(true);
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: { purchased: true } }, error: null };
    answers["rpc.claim_automation_runs"] = [
      { data: [{ ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: "m", guards: [{ fact: "purchased", value: false }], steps_log: [] }], error: null },
    ] as never;
    await runDueAutomations();
    expect(advances()[0]).toMatchObject({ _status: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("conta real sem fornecedor de email: falha sem tentar enviar", async () => {
    withSteps(false);
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: { purchased: false } }, error: null };
    answers["rpc.claim_automation_runs"] = [
      { data: [{ ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: "m", guards: [], steps_log: [] }], error: null },
    ] as never;
    await runDueAutomations();
    expect(advances()[0]).toMatchObject({ _status: "failed", _error: "Sem fornecedor de email configurado" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("webhook num passo: falha passageira volta a tentar o mesmo passo", async () => {
    withSteps(false);
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: { purchased: false } }, error: null };
    answers["rpc.claim_automation_runs"] = [
      { data: [{ ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: "m2", guards: [], steps_log: [] }], error: null },
    ] as never;
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await runDueAutomations();
    expect(finishes()[0]).toMatchObject({ _ok: false, _transient: true });
    expect(advances()).toEqual([]);
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["x-delivery-id"]).toBe("run-1:m2");
  });
});

describe("WhatsApp não oficial (WAHA)", () => {
  const WA = { provider: "whatsapp", enabled: true, settings: { mode: "unofficial", session: "org_1", phone: "244900000001", country_code: "244" } };
  const advances = () => rpcCalls.filter((c) => c.name === "advance_automation_run").map((c) => c.args);
  // Compra aprovada: as horas de silêncio não se aplicam, o teste não depende da hora a que corre.
  const oneSend = (send: Record<string, unknown>) => {
    answers["automations"] = {
      data: {
        id: "auto-1",
        name: "Pós-compra",
        trigger_event: "purchase_approved",
        conditions: [],
        steps: { start: "m", nodes: [{ id: "m", kind: "action", sends: [{ channel: "whatsapp", message: "Olá {{primeiro_nome}}", ...send }], next: null }] },
        organizations: { is_test: false },
      },
      error: null,
    };
    answers["rpc.automation_contact_facts"] = { data: {}, error: null };
    answers["rpc.claim_automation_runs"] = [{ data: [{ ...RUN, occurrence_key: "purchase_approved:p1", cursor: "m", guards: [], steps_log: [] }], error: null }] as never;
  };
  const call = (i: number) => {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return { url, body: init.body ? JSON.parse(init.body as string) : null, headers: init.headers as Record<string, string> };
  };

  beforeEach(() => {
    vi.stubEnv("WAHA_URL", "https://waha.exemplo.com/");
    vi.stubEnv("WAHA_API_KEY", "chave");
    answers["integrations"] = { data: WA, error: null };
    answers["contacts"] = { data: { id: "contact-1", name: "Ana Silva", email: null, phone: "923456789" }, error: null };
  });
  afterEach(() => vi.unstubAllEnvs());

  it("ao contacto: sai pelo WAHA para o número com o indicativo da ligação", async () => {
    oneSend({ target: "contact" });
    await runDueAutomations();
    expect(call(0)).toEqual({
      url: "https://waha.exemplo.com/api/sendText",
      body: { session: "org_1", chatId: "244923456789@c.us", text: "Olá Ana" },
      headers: expect.objectContaining({ "X-Api-Key": "chave" }),
    });
    const step = advances()[0]!;
    expect(step).toMatchObject({ _status: "done" });
    expect((step["_log"] as { sends: unknown[] }[])[0]!.sends).toEqual([
      { channel: "whatsapp", target: "contact", to: "92…789", status: "delivered", http_status: 200, error: null },
    ]);
  });

  it("{{link}} no WhatsApp: o mesmo link da sala, só com o que o contacto tem (aqui sem email)", async () => {
    oneSend({ target: "contact", message: "Entre: {{link}}" });
    await runDueAutomations();
    expect(call(0).body.text).toMatch(/^Entre: \S*\/w\/aula\?nome=Ana\+Silva$/);
  });

  it("em grupo: encontra o grupo pelo nome entre os grupos do número ligado", async () => {
    oneSend({ target: "group", group: "webinar ia " });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: { _serialized: "111@g.us" }, name: "Outro" }, { id: { _serialized: "222@g.us" }, name: "Webinar IA" }]), { status: 200 }),
    );
    await runDueAutomations();
    expect(call(0).url).toBe("https://waha.exemplo.com/api/org_1/groups?exclude=participants");
    expect(call(1).body).toEqual({ session: "org_1", chatId: "222@g.us", text: "Olá Ana" });
    expect(advances()[0]).toMatchObject({ _status: "done" });
  });

  it("número por ligar (só a ligação oficial guardada): falha definitiva, sem pedido", async () => {
    answers["integrations"] = { data: { ...WA, settings: { mode: "official" } }, error: null };
    oneSend({ target: "contact" });
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(advances()[0]).toMatchObject({ _status: "failed", _error: "O WhatsApp não oficial não está ligado (Integrações › Canais)." });
  });

  it("o WAHA responde 5xx: passageira, o mesmo passo volta a tentar", async () => {
    oneSend({ target: "contact" });
    fetchMock.mockResolvedValueOnce(new Response("indisponível", { status: 503 }));
    await runDueAutomations();
    expect(finishes()[0]).toMatchObject({ _ok: false, _transient: true });
    expect(advances()).toEqual([]);
  });
});

/* ---------- Cenários do /code-review (2026-10-01) ---------- */

describe("reserva, leitura falhada e concorrência", () => {
  it("reserva uma execução de cada vez: a reserva começa quando o executor lhe pega", async () => {
    answers["rpc.claim_automation_runs"] = [
      { data: [RUN], error: null },
      { data: [{ ...RUN, id: "run-2" }], error: null },
    ] as never;
    expect(await runDueAutomations()).toEqual({ executed: 2 });
    const claims = rpcCalls.filter((c) => c.name === "claim_automation_runs");
    expect(claims.map((c) => c.args["_limit"])).toEqual([1, 1, 1]);
  });

  it("reserva expirada antes do envio (outra passagem retomou-a): o webhook não sai e nada se grava", async () => {
    answers["automation_runs.update"] = { data: [], error: null };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finishes()).toEqual([]);
    // A renovação só vale para quem tem a reserva: a mesma execução, a correr, com as mesmas tentativas.
    const renew = filters.filter((f) => f.table === "automation_runs" && f.name === "eq").map((f) => f.args);
    expect(renew).toEqual([
      ["id", "run-1"],
      ["status", "running"],
      ["attempts", 1],
    ]);
  });

  it("advance/finish sem linha mudada (reserva perdida) ficam no registo, não passam por sucesso", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    answers["rpc.finish_automation_run"] = { data: null, error: null };
    await runDueAutomations();
    expect(errors.mock.calls.some((c) => String(c[0]).includes("reserva já tinha expirado"))).toBe(true);
    errors.mockRestore();
  });

  it("a leitura da automação falha: não corre como automação antiga (sem passos)", async () => {
    // 1.ª leitura (tem passos?) falha; as seguintes funcionariam. Antes caía no webhook genérico.
    answers["automations"] = [
      { data: null, error: { message: "fetch failed" } },
      { data: { id: "auto-1", name: "Recuperação" }, error: null },
    ] as never;
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finishes()).toEqual([expect.objectContaining({ _ok: false, _transient: true, _error: "automação: fetch failed" })]);
  });

  it("uma falha inesperada numa execução fica nela e não pára as seguintes", async () => {
    answers["automations"] = {
      data: {
        id: "auto-1",
        name: "Grupo",
        trigger_event: "webinar_session_ended",
        conditions: [],
        steps: { start: "g", nodes: [{ id: "g", kind: "action", sends: [{ channel: "whatsapp", target: "group", group: "VIP", message: "Olá" }], next: null }] },
        organizations: { is_test: true },
      },
      error: null,
    };
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: {} }, error: null };
    // A leitura "o grupo já recebeu?" falha (must lança).
    answers["automation_runs.select"] = { data: null, error: { message: "fetch failed" } };
    const run = { ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: null, guards: [], steps_log: [] };
    answers["rpc.claim_automation_runs"] = [
      { data: [run], error: null },
      { data: [{ ...run, id: "run-2" }], error: null },
    ] as never;
    expect(await runDueAutomations()).toEqual({ executed: 2 });
    expect(finishes().map((f) => [f["_run_id"], f["_transient"]])).toEqual([
      ["run-1", true],
      ["run-2", true],
    ]);
  });

  it("factos da sessão: só a linha desta pessoa é pedida à base de dados", async () => {
    answers["automations"] = {
      data: { id: "auto-1", name: "Pós", trigger_event: "webinar_session_ended", conditions: [], steps: { start: null, nodes: [] }, organizations: { is_test: true } },
      error: null,
    };
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: {} }, error: null };
    answers["rpc.claim_automation_runs"] = { data: [{ ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: null, guards: [], steps_log: [] }], error: null };
    await runDueAutomations();
    const asked = filters.filter((f) => f.table === "rpc.automation_session_facts").map((f) => [f.name, ...f.args]);
    expect(asked).toEqual([["eq", "contact_id", "contact-1"], ["maybeSingle"]]);
  });
});

describe("fluxos com factos em falta, lembretes e fuso", () => {
  const stepsAutomation = (steps: unknown, isTest = false, trigger = "payment_failed") => {
    answers["automations"] = {
      data: { id: "auto-1", name: "Fluxo", trigger_event: trigger, conditions: [], steps, organizations: { is_test: isTest } },
      error: null,
    };
  };
  const advances = () => rpcCalls.filter((c) => c.name === "advance_automation_run").map((c) => c.args);

  it("pagamento falhado de quem não tem participação (factos {}): a recuperação sai", async () => {
    // Igual ao fluxo base "Pagamento falhou": Comprou? → Não → mensagem.
    stepsAutomation({
      start: "p1",
      nodes: [
        { id: "p1", kind: "branch", condition: { fact: "purchased", value: true }, yes: null, no: "p2" },
        { id: "p2", kind: "action", sends: [{ channel: "webhook", target: "webhook" }], next: null },
      ],
    });
    answers["rpc.automation_contact_facts"] = { data: {}, error: null };
    const run = { ...RUN, webinar_session_id: null, occurrence_key: "payment_failed:42", steps_log: [] };
    answers["rpc.claim_automation_runs"] = [
      { data: [{ ...run, cursor: null, guards: [] }], error: null },
      { data: [{ ...run, cursor: "p2", guards: [{ fact: "purchased", value: false }] }], error: null },
    ] as never;
    await runDueAutomations();
    expect(advances()[0]).toMatchObject({ _status: "next", _cursor: "p2", _guards: [{ fact: "purchased", value: false }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(advances()[1]).toMatchObject({ _status: "done" });
  });

  it("checkout abandonado: comprou entretanto (facto conhecido e contrário) continua a cancelar", async () => {
    stepsAutomation(
      { start: "p3", nodes: [{ id: "p3", kind: "action", sends: [{ channel: "webhook", target: "webhook" }], next: null }] },
      false,
      "checkout_abandoned",
    );
    answers["rpc.automation_contact_facts"] = { data: { purchased: true }, error: null };
    answers["rpc.claim_automation_runs"] = {
      data: [{ ...RUN, webinar_session_id: null, occurrence_key: "checkout_abandoned:42", cursor: "p3", guards: [{ fact: "purchased", value: false }], steps_log: [] }],
      error: null,
    };
    await runDueAutomations();
    expect(advances()[0]).toMatchObject({ _status: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const reminder = {
    start: "w",
    nodes: [
      { id: "w", kind: "wait", mode: "before_session", minutes: 60, next: "m" },
      { id: "m", kind: "action", label: "Lembrete 1 hora", sends: [{ channel: "webhook", target: "webhook" }], next: null },
    ],
  };
  const reminderRun = { ...RUN, occurrence_key: "webinar_registered:1", cursor: "m", guards: [], steps_log: [] };

  it("lembrete '1 hora antes' apanhado 90 min atrasado (sessão já começou): não sai, o fluxo segue", async () => {
    stepsAutomation(reminder, false, "webinar_registered");
    const startsAt = new Date(Date.now() - 30 * 60_000).toISOString();
    answers["webinar_sessions"] = { data: { id: "session-1", starts_at: startsAt, ends_at: null }, error: null };
    answers["rpc.automation_contact_facts"] = { data: {}, error: null };
    answers["rpc.claim_automation_runs"] = { data: [reminderRun], error: null };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    const step = advances()[0]!;
    expect(step).toMatchObject({ _status: "done" });
    expect((step["_log"] as { outcome: string }[])[0]!.outcome).toBe("A hora já tinha passado: a mensagem não sai");
  });

  it("lembrete dentro da hora (1 min de atraso) sai normalmente", async () => {
    stepsAutomation(reminder, false, "webinar_registered");
    const startsAt = new Date(Date.now() + 59 * 60_000).toISOString();
    answers["webinar_sessions"] = { data: { id: "session-1", starts_at: startsAt, ends_at: null }, error: null };
    answers["rpc.automation_contact_facts"] = { data: {}, error: null };
    answers["rpc.claim_automation_runs"] = { data: [reminderRun], error: null };
    await runDueAutomations();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("{{data}} e {{hora}} no fuso do webinar (19:00 em Lisboa no verão, não 18:00 UTC)", async () => {
    stepsAutomation(
      {
        start: "m",
        nodes: [{ id: "m", kind: "action", sends: [{ channel: "email", target: "contact", subject: "Lembrete", message: "{{data}} às {{hora}}" }], next: null }],
      },
      true,
      "webinar_registered",
    );
    answers["webinars"] = { data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula", timezone: "Europe/Lisbon" }, error: null };
    answers["webinar_sessions"] = { data: { id: "session-1", starts_at: "2026-07-01T18:00:00Z", ends_at: null }, error: null };
    answers["rpc.automation_contact_facts"] = { data: {}, error: null };
    answers["rpc.claim_automation_runs"] = { data: [{ ...reminderRun, cursor: "m" }], error: null };
    await runDueAutomations();
    const log = advances()[0]!["_log"] as { preview?: { message: string }[] }[];
    expect(log[0]!.preview![0]!.message).toBe("01 de julho às 19:00");
  });

  it("fuso inválido guardado no webinar: UTC, sem rebentar o envio", async () => {
    stepsAutomation(
      { start: "m", nodes: [{ id: "m", kind: "action", sends: [{ channel: "email", target: "contact", subject: "x", message: "{{hora}}" }], next: null }] },
      true,
      "webinar_registered",
    );
    answers["webinars"] = { data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula", timezone: "Lua/Base" }, error: null };
    answers["webinar_sessions"] = { data: { id: "session-1", starts_at: "2026-07-01T18:00:00Z", ends_at: null }, error: null };
    answers["rpc.automation_contact_facts"] = { data: {}, error: null };
    answers["rpc.claim_automation_runs"] = { data: [{ ...reminderRun, cursor: "m" }], error: null };
    await runDueAutomations();
    const log = advances()[0]!["_log"] as { preview?: { message: string }[] }[];
    expect(log[0]!.preview![0]!.message).toBe("18:00");
  });
});

describe("reserva expirada num passo de workflow", () => {
  it("webhook de um passo: sem a reserva, não envia nem grava (outra passagem retoma)", async () => {
    answers["automations"] = {
      data: {
        id: "auto-1",
        name: "Pós",
        trigger_event: "webinar_session_ended",
        conditions: [],
        steps: { start: "m", nodes: [{ id: "m", kind: "action", sends: [{ channel: "webhook", target: "webhook" }], next: null }] },
        organizations: { is_test: false },
      },
      error: null,
    };
    answers["rpc.automation_session_facts"] = { data: { contact_id: "contact-1", facts: {} }, error: null };
    answers["automation_runs.update"] = { data: [], error: null };
    answers["rpc.claim_automation_runs"] = { data: [{ ...RUN, occurrence_key: "webinar_session_ended:session-1", cursor: "m", guards: [], steps_log: [] }], error: null };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcCalls.filter((c) => c.name === "advance_automation_run" || c.name === "finish_automation_run")).toEqual([]);
  });
});

describe("horas de silêncio, links e sessão que mudou", () => {
  const advances = () => rpcCalls.filter((c) => c.name === "advance_automation_run").map((c) => c.args);
  const flow = (sends: unknown[], trigger = "checkout_abandoned", nodes: unknown[] = []) => {
    answers["automations"] = {
      data: {
        id: "auto-1",
        name: "Fluxo",
        trigger_event: trigger,
        conditions: [],
        steps: { start: nodes.length ? "w" : "m", nodes: [...nodes, { id: "m", kind: "action", sends, next: null }] },
        organizations: { is_test: true },
      },
      error: null,
    };
    answers["rpc.automation_contact_facts"] = { data: {}, error: null };
    answers["rpc.claim_automation_runs"] = {
      data: [{ ...RUN, webinar_session_id: null, occurrence_key: `${trigger}:42`, cursor: "m", guards: [], steps_log: [] }],
      error: null,
    };
  };
  const at = (iso: string) => vi.useFakeTimers({ now: new Date(iso), toFake: ["Date"] });
  afterEach(() => vi.useRealTimers());

  it("WhatsApp individual às 23:30 de Lisboa: fica para as 08:00, no mesmo passo, sem enviar", async () => {
    at("2026-07-10T22:30:00Z");
    flow([{ channel: "whatsapp", target: "contact", message: "Ainda vai a tempo" }]);
    answers["webinars"] = { data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula", timezone: "Europe/Lisbon" }, error: null };
    await runDueAutomations();
    const step = advances()[0]!;
    expect(step).toMatchObject({ _status: "next", _cursor: "m", _scheduled_for: "2026-07-11T07:00:00.000Z" });
    expect((step["_log"] as { outcome: string }[])[0]!.outcome).toMatch(/^Horas de silêncio/);
  });

  it("{{link_oferta}}, {{preco}} e {{link_grupo}} vêm do webinar e do Fluxo", async () => {
    at("2026-07-10T12:00:00Z");
    flow([{ channel: "email", target: "contact", subject: "Oferta", message: "{{link_oferta}} · {{preco}} · {{link_grupo}}" }]);
    answers["automations"] = { data: { ...(answers["automations"]!.data as object), workflow_id: "wf-1" }, error: null };
    answers["webinars"] = { data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula", cta_url: "https://pay.exemplo.com/1", cta_price_now: "97 €" }, error: null };
    answers["automation_workflows"] = {
      data: { canvas: { nodes: [{ id: "g", kind: "group", name: "Grupo", url: "https://chat.whatsapp.com/abc" }], positions: {} } },
      error: null,
    };
    await runDueAutomations();
    const log = advances()[0]!["_log"] as { preview?: { message: string }[] }[];
    // Sem anúncio conhecido, a origem é a plataforma; o canal fica em utm_content.
    expect(log[0]!.preview![0]!.message).toBe(
      "https://pay.exemplo.com/1?utm_source=novawebinar&utm_medium=webinar&utm_content=email-00m00s · 97 € · https://chat.whatsapp.com/abc",
    );
  });

  it("{{link_oferta}} leva o anúncio que trouxe a pessoa e o canal por onde clicou; o webhook recebe o link tal como está", async () => {
    at("2026-07-10T12:00:00Z");
    flow([
      { channel: "email", target: "contact", subject: "Oferta", message: "{{link_oferta}}" },
      { channel: "whatsapp", target: "contact", message: "{{link_oferta}}" },
      { channel: "webhook", target: "webhook" },
      // No grupo, nem a pessoa no link da sala nem o anúncio dela na oferta: todos abrem o mesmo link.
      { channel: "whatsapp", target: "group", group: "VIP", message: "{{link}} {{link_replay}} {{link_oferta}}" },
    ]);
    answers["contacts"] = {
      data: { id: "contact-1", name: "Ana", email: "ana@exemplo.com", phone: "923456789", first_source: "facebook", first_campaign: "lancamento" },
      error: null,
    };
    answers["webinars"] = {
      data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula", cta_url: "https://pay.exemplo.com/1?x=1", cta_price_now: "97 €", replay_enabled: true },
      error: null,
    };
    await runDueAutomations();
    const log = advances()[0]!["_log"] as { preview?: { message: string }[] }[];
    expect(log[0]!.preview!.map((p) => p.message)).toEqual([
      "https://pay.exemplo.com/1?x=1&utm_source=facebook&utm_medium=webinar&utm_campaign=lancamento&utm_content=email-00m00s",
      "https://pay.exemplo.com/1?x=1&utm_source=facebook&utm_medium=webinar&utm_campaign=lancamento&utm_content=whatsapp-00m00s",
      expect.stringMatching(
        /^\S*\/w\/aula \S*\/w\/aula\?replay=1 https:\/\/pay\.exemplo\.com\/1\?x=1&utm_source=novawebinar&utm_medium=webinar&utm_content=whatsapp-00m00s$/,
      ),
    ]);
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent.data.offer).toEqual({ url: "https://pay.exemplo.com/1?x=1", price: "97 €", utm: true });
  });

  it("oferta sem UTM no webinar (como no botão da sala): o link sai tal como está", async () => {
    at("2026-07-10T12:00:00Z");
    flow([{ channel: "email", target: "contact", subject: "Oferta", message: "{{link_oferta}}" }]);
    answers["webinars"] = { data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula", cta_url: "https://pay.exemplo.com/1", offer_utm: false }, error: null };
    await runDueAutomations();
    const log = advances()[0]!["_log"] as { preview?: { message: string }[] }[];
    expect(log[0]!.preview![0]!.message).toBe("https://pay.exemplo.com/1");
  });

  it("{{link}} e {{link_replay}} levam o nome e o email (codificados), sem partir o ?replay=1", async () => {
    at("2026-07-10T12:00:00Z");
    flow([{ channel: "email", target: "contact", subject: "Sala", message: "{{link}} · {{link_replay}}" }]);
    answers["contacts"] = { data: { id: "contact-1", name: "Ana Silva", email: "ana+x@exemplo.com", phone: null }, error: null };
    answers["webinars"] = { data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula", replay_enabled: true }, error: null };
    await runDueAutomations();
    const log = advances()[0]!["_log"] as { preview?: { message: string }[] }[];
    expect(log[0]!.preview![0]!.message.split(" · ")).toEqual([
      expect.stringMatching(/\/w\/aula\?nome=Ana\+Silva&email=ana%2Bx%40exemplo\.com$/),
      expect.stringMatching(/\/w\/aula\?replay=1&nome=Ana\+Silva&email=ana%2Bx%40exemplo\.com$/),
    ]);
  });

  it("link da oferta em falta: a mensagem não sai e diz o que falta configurar", async () => {
    at("2026-07-10T12:00:00Z");
    flow([{ channel: "email", target: "contact", subject: "Oferta", message: "Compre: {{link_oferta}}" }]);
    await runDueAutomations();
    expect(advances()[0]).toMatchObject({ _status: "failed", _error: "A mensagem usa {{link_oferta}} (falta o link da oferta no webinar)" });
  });

  it("{{falta}}: conta à hora do envio, a partir da sessão desta pessoa, no fuso do webinar", async () => {
    at("2026-10-11T08:00:00Z"); // 09:00 em Luanda
    const remind = (sessionId: string, startsAt: string) => {
      flow([{ channel: "email", target: "contact", subject: "Lembrete", message: "Olá {{primeiro_nome}}, {{falta}}!" }], "webinar_registered");
      answers["rpc.claim_automation_runs"] = {
        data: [{ ...RUN, webinar_session_id: sessionId, occurrence_key: "webinar_registered:1", cursor: "m", guards: [], steps_log: [] }],
        error: null,
      };
      answers["webinars"] = { data: { id: "web-1", public_title: "Aula", internal_name: "aula", slug: "aula", timezone: "Africa/Luanda" }, error: null };
      answers["webinar_sessions"] = { data: { id: sessionId, starts_at: startsAt, ends_at: null }, error: null };
    };
    const sent = () => (advances().at(-1)!["_log"] as { preview?: { message: string }[] }[])[0]!.preview![0]!.message;
    remind("tarde", "2026-10-11T10:00:00Z");
    await runDueAutomations();
    expect(sent()).toBe("Olá Ana, começa daqui a 2 horas!");
    remind("noite", "2026-10-12T19:00:00Z");
    await runDueAutomations();
    expect(sent()).toBe("Olá Ana, é amanhã às 20:00!");
    expect(filters.filter((f) => f.table === "webinar_sessions" && f.name === "eq" && f.args[0] === "id").map((f) => f.args[1])).toEqual(["tarde", "noite"]);
  });

  it("{{falta}} sem sessão: a mensagem não sai e diz porquê", async () => {
    at("2026-07-10T12:00:00Z");
    flow([{ channel: "email", target: "contact", subject: "Lembrete", message: "Olá, {{falta}}!" }]);
    await runDueAutomations();
    expect(advances()[0]).toMatchObject({ _status: "failed", _error: "A mensagem usa {{falta}} (falta a sessão da pessoa: este gatilho não a traz)" });
  });

  it("a sessão passou para mais tarde: o lembrete acompanha a hora nova em vez de sair cedo", async () => {
    at("2026-10-01T19:00:00Z");
    flow([{ channel: "webhook", target: "webhook" }], "webinar_registered", [{ id: "w", kind: "wait", mode: "before_session", minutes: 60, next: "m" }]);
    answers["rpc.claim_automation_runs"] = {
      data: [{ ...RUN, occurrence_key: "webinar_registered:1", cursor: "m", guards: [], steps_log: [] }],
      error: null,
    };
    answers["webinar_sessions"] = { data: { id: "session-1", starts_at: "2026-10-01T22:00:00Z", ends_at: null }, error: null };
    await runDueAutomations();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(advances()[0]).toMatchObject({ _status: "next", _cursor: "m", _scheduled_for: "2026-10-01T21:00:00.000Z" });
  });
});
