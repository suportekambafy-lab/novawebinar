import { beforeEach, describe, expect, it, vi } from "vitest";

import { clientIp, normalizePhone, originAllowed, parseRegistration, RateLimiter, readLimitedBody, resolveUtm } from "./registration";

describe("normalização", () => {
  it("telefone: só dígitos com o + internacional; curto demais não serve", () => {
    expect(normalizePhone(" +244 923 000 111 ")).toBe("+244923000111");
    expect(normalizePhone("00244-923-000-111")).toBe("+244923000111");
    expect(normalizePhone("923 000 111")).toBe("923000111");
    expect(normalizePhone("12")).toBeNull();
  });

  it("a forma do pedido: sem formulário nem webinar, ou com um id inválido, é recusado por campo", () => {
    expect(parseRegistration({ form_id: crypto.randomUUID(), name: "Ana", email: "ana@exemplo.com" }).ok).toBe(true);
    const bad = parseRegistration({ form_id: "x", name: "Ana" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.error.fields ?? {})).toEqual(["form_id"]);
  });
});

describe("UTM", () => {
  it("vêm da página quando não são enviadas; as explícitas ganham", () => {
    const page = "https://meusite.com/webinar-ia?utm_source=Facebook&utm_medium=CPC&utm_campaign=Setembro&utm_term=ia";
    expect(resolveUtm({}, page)).toEqual({ utm_source: "facebook", utm_medium: "cpc", utm_campaign: "Setembro", utm_term: "ia" });
    expect(resolveUtm({ utm_source: "instagram" }, page).utm_source).toBe("instagram");
    expect(resolveUtm({}, "não é url")).toEqual({});
  });
});

describe("origem", () => {
  it("lista vazia aceita tudo; com lista só as origens indicadas (e subdomínios com *.)", () => {
    expect(originAllowed("https://qualquer.com", [])).toBe(true);
    expect(originAllowed("https://meusite.com", ["https://meusite.com/"])).toBe(true);
    expect(originAllowed("https://outro.com", ["https://meusite.com"])).toBe(false);
    expect(originAllowed("https://lp.meusite.com", ["https://*.meusite.com"])).toBe(true);
    expect(originAllowed(null, ["https://meusite.com"])).toBe(true);
  });

  it("limite de ritmo por janela", () => {
    const limiter = new RateLimiter(2, 60_000);
    expect([limiter.allow("a", 0), limiter.allow("a", 1), limiter.allow("a", 2), limiter.allow("a", 60_001)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });
});

/* ---------- registerFromCapture com a base de dados simulada ---------- */

type Result = { data: unknown; error: { message: string; code?: string } | null };
let answers: Record<string, Result | Result[]>;
let inserts: { table: string; row: Record<string, unknown> }[];
let filters: { table: string; method: string; args: unknown[] }[];

function query(table: string) {
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_, name: string) {
        if (name === "then") {
          const answer = answers[table];
          const result = Array.isArray(answer) ? (answer.shift() ?? { data: null, error: null }) : (answer ?? { data: null, error: null });
          return (ok: (value: Result) => unknown) => Promise.resolve(result).then(ok);
        }
        return (...args: unknown[]) => {
          if (name === "insert") inserts.push({ table, row: args[0] as Record<string, unknown> });
          filters.push({ table, method: name, args });
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
    rpc: async () => ({ data: "session-1", error: null }),
  },
}));
vi.mock("@/lib/public-room.server", () => ({ notifyWebhook: async () => undefined }));
vi.mock("@/lib/integrations.server", () => ({ notifyOutgoing: async () => undefined }));

const { registerFromCapture } = await import("./registration.server");

const FORM = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "org-1",
  webinar_id: "web-1",
  active: true,
  allowed_origins: ["https://meusite.com"],
  require_phone: false,
  consent_text: "Aceito receber comunicações.",
  success_message: null,
  redirect_url: null,
};
const WEBINAR = {
  id: "web-1",
  organization_id: "org-1",
  status: "scheduled",
  slug: "aula",
  public_title: "Aula",
  internal_name: "aula",
  schedule_mode: "scheduled",
  // Longe no futuro: a sessão ainda não terminou (uma data única terminada já não abre sessão).
  scheduled_at: "2099-10-01T20:00:00Z",
  duration_seconds: 3600,
  video_sources: null,
};
const req = (origin: string | null = "https://meusite.com") => ({
  origin,
  ip: `ip-${Math.random()}`,
  headers: new Headers({ "user-agent": "Mozilla/5.0 (iPhone)" }),
  appOrigin: "https://app.novawebinar.com",
  source: "embed" as const,
});
const body = (extra: Record<string, unknown> = {}) => ({
  form_id: FORM.id,
  name: "Ana Paula",
  email: "Ana@Exemplo.com",
  phone: "+244 923 000 111",
  consent: true,
  submission_id: "sub-12345678",
  page_url: "https://meusite.com/webinar?utm_source=facebook&utm_campaign=set",
  // A organização nunca vem do pedido: mesmo que alguém a envie, é ignorada.
  organization_id: "org-intrusa",
  ...extra,
});

beforeEach(() => {
  inserts = [];
  filters = [];
  answers = {
    registration_forms: { data: FORM, error: null },
    webinars: { data: WEBINAR, error: null },
    webinar_sessions: { data: { starts_at: "2099-10-01T20:00:00Z" }, error: null },
    participants: [
      { data: null, error: null }, // mesma submissão? não
      { data: [], error: null }, // mesma pessoa na sessão? não
      { data: { id: "p-1", name: "Ana Paula", contact_id: "c-1", webinar_session_id: "session-1" }, error: null },
    ],
  };
});

describe("inscrição pela captura externa", () => {
  it("inscreve com a organização do formulário, UTM da página, consentimento e sessão", async () => {
    const res = await registerFromCapture(body(), req());
    expect(res.status).toBe(201);
    // Contrato com o Core: a inscrição (= participação) e o contacto.
    expect(res.body).toMatchObject({
      ok: true,
      status: "registered",
      registration_id: "p-1",
      participation_id: "p-1",
      contact_id: "c-1",
      room_url: "https://app.novawebinar.com/w/aula",
    });
    const row = inserts.find((i) => i.table === "participants")!.row;
    expect(row).toMatchObject({
      organization_id: "org-1",
      webinar_id: "web-1",
      email: "ana@exemplo.com",
      phone: "+244923000111",
      utm_source: "facebook",
      utm_campaign: "set",
      webinar_session_id: "session-1",
      registration_source: "embed",
      form_id: FORM.id,
      submission_id: "sub-12345678",
      device: "mobile",
    });
    expect(row["consent_at"]).toEqual(expect.any(String));
    expect(res.allowOrigin).toBe("https://meusite.com");
  });

  it("a mesma submissão devolve a inscrição que já existe (idempotência)", async () => {
    answers["participants"] = [{ data: { id: "p-1", webinar_session_id: "session-1" }, error: null }];
    const res = await registerFromCapture(body(), req());
    expect(res.body).toMatchObject({ status: "already_registered", registration_id: "p-1" });
    expect(inserts).toEqual([]);
  });

  it("a mesma pessoa na mesma sessão: não duplica, e os ids da inscrição que já existe não saem", async () => {
    answers["participants"] = [
      { data: null, error: null },
      { data: [{ id: "p-9", contact_id: "c-9", webinar_session_id: "session-1" }], error: null },
    ];
    const res = await registerFromCapture(body({ submission_id: "outra-submissao" }), req());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: "already_registered", room_url: "https://app.novawebinar.com/w/aula" });
    // Só o email coincide e qualquer pessoa o pode escrever: nada que identifique a inscrição dela.
    expect(res.body).not.toHaveProperty("registration_id");
    expect(res.body).not.toHaveProperty("participation_id");
    expect(res.body).not.toHaveProperty("contact_id");
    expect(JSON.stringify(res.body)).not.toMatch(/p-9|c-9/);
    expect(inserts).toEqual([]);
  });

  it("origem não autorizada, sem consentimento e formulário desligado são recusados", async () => {
    expect((await registerFromCapture(body(), req("https://outro.com"))).status).toBe(403);
    expect((await registerFromCapture(body({ consent: false }), req())).body).toMatchObject({ fields: { consent: expect.any(String) } });
    answers["registration_forms"] = { data: { ...FORM, active: false }, error: null };
    expect((await registerFromCapture(body(), req())).status).toBe(404);
    expect(inserts).toEqual([]);
  });

  it("robô (campo escondido preenchido): responde ok e não grava", async () => {
    const res = await registerFromCapture(body({ website: "http://spam" }), req());
    expect(res.status).toBe(200);
    expect(inserts).toEqual([]);
  });

  it("muitas inscrições seguidas do mesmo visitante: 429", async () => {
    const same = { ...req(), ip: "1.2.3.4" };
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      answers["participants"] = [
        { data: { id: "p-1", webinar_session_id: "session-1" }, error: null },
      ];
      statuses.push((await registerFromCapture(body(), same)).status);
    }
    expect(statuses.slice(-2)).toEqual([429, 429]);
  });
});

describe("captura: os campos da etapa Página (as regras da sala)", () => {
  const NAME_WHATSAPP = [
    { kind: "name", label: "Nome completo", required: true },
    { kind: "whatsapp", label: "WhatsApp", required: true },
    { id: "f_ig", kind: "text", label: "Instagram", required: false, icon: "instagram" },
  ];

  it("Nome + WhatsApp, sem e-mail: inscreve, com as respostas, e procura a mesma pessoa pelo WhatsApp", async () => {
    answers["webinars"] = { data: { ...WEBINAR, entry_fields: NAME_WHATSAPP }, error: null };
    const res = await registerFromCapture(
      body({ email: undefined, name: "  Edna   Kiala ", phone: "+244 923 000 222", answers: { f_ig: "@edna" } }),
      req(),
    );
    expect(res.status).toBe(201);
    expect(inserts.find((i) => i.table === "participants")!.row).toMatchObject({
      name: "Edna Kiala",
      email: null,
      phone: "+244923000222",
      answers: { f_ig: "@edna" },
    });
    expect(filters.some((f) => f.table === "participants" && f.method === "eq" && f.args[0] === "phone")).toBe(true);
  });

  it("falta um campo obrigatório: 400, com o nome do campo da API", async () => {
    answers["webinars"] = { data: { ...WEBINAR, entry_fields: NAME_WHATSAPP }, error: null };
    const res = await registerFromCapture(body({ phone: undefined }), req());
    expect(res).toMatchObject({ status: 400, body: { fields: { phone: "Preencha: WhatsApp." } } });
    expect(inserts).toEqual([]);
  });

  it("sem campos gravados: os de sempre (nome e e-mail obrigatórios)", async () => {
    const res = await registerFromCapture(body({ name: "A", email: "x" }), req());
    expect(res).toMatchObject({ status: 400, body: { fields: { name: expect.any(String) } } });
    const noEmail = await registerFromCapture(body({ email: "x", submission_id: "sub-sem-email" }), req());
    expect(noEmail).toMatchObject({ status: 400, body: { fields: { email: "Indique um e-mail válido." } } });
  });
});

describe("captura: idempotência, API sem formulário e origem", () => {
  const WEBINAR_ID = "22222222-2222-4222-8222-222222222222";
  const apiReq = (extra: Partial<ReturnType<typeof req>> & { idempotencyKey?: string | null } = {}) => ({
    ...req(null),
    source: "api" as const,
    ...extra,
  });

  it("a mesma submissão procura-se no webinar (com ou sem formulário)", async () => {
    answers["participants"] = [{ data: { id: "p-1", contact_id: "c-1", webinar_session_id: null }, error: null }];
    const res = await registerFromCapture(body(), req());
    expect(res.body).toMatchObject({ status: "already_registered", contact_id: "c-1" });
    const lookups = filters.filter((f) => f.table === "participants" && f.method === "eq").map((f) => f.args);
    expect(lookups).toEqual([
      ["webinar_id", "web-1"],
      ["submission_id", "sub-12345678"],
    ]);
  });

  it("o cabeçalho Idempotency-Key serve de submission_id", async () => {
    const res = await registerFromCapture(body({ submission_id: undefined }), apiReq({ idempotencyKey: "chave-idem-0001" }));
    expect(res.status).toBe(201);
    expect(inserts.find((i) => i.table === "participants")!.row).toMatchObject({ submission_id: "chave-idem-0001" });
  });

  it("API só com webinar_id: a organização vem do webinar, nunca do pedido", async () => {
    answers["webinars"] = { data: { ...WEBINAR, id: WEBINAR_ID }, error: null };
    const res = await registerFromCapture(
      { webinar_id: WEBINAR_ID, name: "Rui Costa", email: "rui@exemplo.com", organization_id: "org-intrusa", consent: true },
      apiReq(),
    );
    expect(res.status).toBe(201);
    const row = inserts.find((i) => i.table === "participants")!.row;
    expect(row).toMatchObject({ organization_id: "org-1", webinar_id: WEBINAR_ID, form_id: null, registration_source: "api" });
    expect(row["consent_at"]).toEqual(expect.any(String));
    expect(filters.some((f) => f.table === "registration_forms")).toBe(false);
  });

  it("sem formulário nem webinar, webinar inválido ou em rascunho: recusado sem gravar", async () => {
    const none = await registerFromCapture({ name: "Rui Costa", email: "rui@exemplo.com" }, apiReq());
    expect(none).toMatchObject({ status: 400, body: { fields: { form_id: expect.any(String) } } });
    expect((await registerFromCapture({ webinar_id: "nao-e-uuid", name: "Rui", email: "rui@exemplo.com" }, apiReq())).status).toBe(400);
    answers["webinars"] = { data: { ...WEBINAR, id: WEBINAR_ID, status: "draft" }, error: null };
    expect((await registerFromCapture({ webinar_id: WEBINAR_ID, name: "Rui", email: "rui@exemplo.com" }, apiReq())).status).toBe(404);
    answers["webinars"] = { data: null, error: null };
    expect((await registerFromCapture({ webinar_id: WEBINAR_ID, name: "Rui", email: "rui@exemplo.com" }, apiReq())).status).toBe(404);
    expect(inserts).toEqual([]);
  });

  it("sem UTM: fbclid da página dá Facebook; o referrer do Instagram dá Instagram", async () => {
    await registerFromCapture(body({ page_url: "https://meusite.com/webinar?fbclid=abc" }), req());
    expect(inserts.at(-1)!.row).toMatchObject({ utm_source: "facebook" });
    answers["participants"] = [
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: "p-2", contact_id: "c-2", webinar_session_id: "session-1" }, error: null },
    ];
    await registerFromCapture(
      body({ submission_id: "sub-instagram-1", page_url: "https://meusite.com/webinar", referrer: "https://l.instagram.com/" }),
      req(),
    );
    expect(inserts.at(-1)!.row).toMatchObject({ utm_source: "instagram", referrer: "https://l.instagram.com/" });
  });
});

describe("segunda inscrição: fica na sessão original", () => {
  it("captura: a pessoa já está numa sessão que não acabou (o just in time já abriu outra): não duplica", async () => {
    answers["participants"] = [
      { data: null, error: null },
      { data: [{ id: "p-old", contact_id: "c-1", webinar_session_id: "session-old", watched_seconds: 0 }], error: null },
    ];
    answers["webinar_sessions"] = { data: { starts_at: "2099-10-01T20:00:00Z", ends_at: "2099-10-01T21:00:00Z" }, error: null };
    const res = await registerFromCapture(body({ submission_id: "outra-vez" }), req());
    expect(res.body).toMatchObject({ status: "already_registered" });
    expect(inserts).toEqual([]);
  });

  it("sala: outro aparelho cria a participação na sessão original (o evento de inscrição não se repete)", async () => {
    const { createRegistration } = await import("./registration.server");
    answers["participants"] = [
      { data: [{ id: "p-old", contact_id: "c-1", webinar_session_id: "session-old", watched_seconds: 300 }], error: null },
      { data: { id: "p-new", name: "Ana", contact_id: "c-1", webinar_session_id: "session-old" }, error: null },
    ];
    // Já acabou, mas a pessoa viu: fica na mesma (a sala mostra-lhe o replay, não outro «Ao vivo»).
    answers["webinar_sessions"] = { data: { starts_at: "2099-10-01T20:00:00Z", ends_at: "2020-01-01T21:00:00Z" }, error: null };
    const base = { name: "Ana", email: "ana@exemplo.com", phone: null, mode: "live" as const, device: null, city: null, country: null, countryCode: null, utm: {}, referrer: null, source: "room" as const };
    await createRegistration(WEBINAR as never, base, "session-1");
    expect(inserts.at(-1)!.row).toMatchObject({ webinar_session_id: "session-old" });
  });

  it("sala: quem nunca entrou numa sessão que já acabou vai para a actual", async () => {
    const { createRegistration } = await import("./registration.server");
    answers["participants"] = [
      { data: [{ id: "p-old", contact_id: "c-1", webinar_session_id: "session-old", watched_seconds: 0 }], error: null },
      { data: { id: "p-new", name: "Ana", contact_id: "c-1", webinar_session_id: "session-1" }, error: null },
    ];
    answers["webinar_sessions"] = { data: { starts_at: "2099-10-01T20:00:00Z", ends_at: "2020-01-01T21:00:00Z" }, error: null };
    const base = { name: "Ana", email: "ana@exemplo.com", phone: null, mode: "live" as const, device: null, city: null, country: null, countryCode: null, utm: {}, referrer: null, source: "room" as const };
    await createRegistration(WEBINAR as never, base, "session-1");
    expect(inserts.at(-1)!.row).toMatchObject({ webinar_session_id: "session-1" });
  });

  it("data única remarcada: a sessão antiga não prende quem se inscreve outra vez (vai para a nova data)", async () => {
    answers["participants"] = [
      { data: null, error: null },
      { data: [{ id: "p-old", contact_id: "c-1", webinar_session_id: "session-old", watched_seconds: 0 }], error: null },
      { data: { id: "p-new", contact_id: "c-1", webinar_session_id: "session-1" }, error: null },
    ];
    // A sessão antiga ainda não acabou, mas já não é a data do webinar (2099-10-01T20:00).
    answers["webinar_sessions"] = { data: { starts_at: "2099-09-24T20:00:00Z", ends_at: "2099-09-24T21:00:00Z" }, error: null };
    const res = await registerFromCapture(body({ submission_id: "remarcado" }), req());
    expect(res.body).toMatchObject({ status: "registered" });
    expect(inserts.at(-1)!.row).toMatchObject({ webinar_session_id: "session-1" });
  });
});

describe("sala de teste", () => {
  it("entra como convidado: sem email real nem telefone, a base de dados não cria contacto nem evento de inscrição", async () => {
    const { createRegistration } = await import("./registration.server");
    answers["participants"] = { data: { id: "p-t", name: "Ana", contact_id: null, webinar_session_id: null }, error: null };
    const base = { name: "Ana", email: "ana@exemplo.com", phone: "+244923000111", mode: "live" as const, device: null, city: null, country: null, countryCode: null, utm: {}, referrer: null, source: "room" as const };
    await createRegistration(WEBINAR as never, { ...base, teste: true }, null);
    expect(inserts.at(-1)!.row).toMatchObject({ email: expect.stringMatching(/^teste-[0-9a-f]{8}@sala\.local$/), phone: null });
    await createRegistration(WEBINAR as never, base, null);
    expect(inserts.at(-1)!.row).toMatchObject({ email: "ana@exemplo.com", phone: "+244923000111" });
  });
});

/* ---------- Cenários do /code-review (2026-10-01) ---------- */

describe("IP do visitante", () => {
  it("ligação directa: vale o socket; o X-Forwarded-For do cliente não conta", () => {
    expect(clientIp("203.0.113.9", "1.1.1.1")).toBe("203.0.113.9");
  });

  it("atrás do nosso proxy: o endereço que o proxy viu (o mais à direita), não o que o cliente escreveu", () => {
    expect(clientIp("10.0.0.2", "6.6.6.6, 198.51.100.7")).toBe("198.51.100.7");
    // Rodar o primeiro valor não muda a chave.
    expect(clientIp("10.0.0.2", "1.2.3.4, 198.51.100.7")).toBe(clientIp("10.0.0.2", "5.6.7.8, 198.51.100.7"));
    expect(clientIp("::ffff:127.0.0.1", "198.51.100.7, 10.0.0.5")).toBe("198.51.100.7");
  });

  it("sem socket (serverless): o mais à direita que não é interno", () => {
    expect(clientIp(undefined, "spoof, 198.51.100.7")).toBe("198.51.100.7");
    expect(clientIp(undefined, null)).toBe("local");
  });
});

describe("limitador cheio", () => {
  it("não esvazia tudo: saem primeiro as chaves fora da janela", () => {
    const limiter = new RateLimiter(2, 1000, 3);
    limiter.allow("antiga", 0);
    limiter.allow("abusador", 1500);
    limiter.allow("abusador", 1600);
    limiter.allow("c", 1700);
    limiter.allow("d", 2000); // 4 chaves > 3: sai só "antiga" (fora da janela)
    expect(limiter.allow("abusador", 2001)).toBe(false); // continua limitado
  });

  it("sem chaves fora da janela: sai a usada há mais tempo, nunca as que estão em uso", () => {
    const limiter = new RateLimiter(1, 60_000, 2);
    limiter.allow("formulario-real", 0);
    limiter.allow("x", 1);
    expect(limiter.allow("formulario-real", 2)).toBe(false); // usada agora: passa a ser a mais recente
    limiter.allow("y", 3); // cheio: sai "x"
    expect(limiter.allow("formulario-real", 4)).toBe(false);
  });
});

describe("corpo do pedido", () => {
  const streamOf = (chunks: string[]) =>
    new Request("https://app/x", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);

  it("content-length acima do limite: recusa sem ler", async () => {
    const req = new Request("https://app/x", { method: "POST", body: "x", headers: { "content-length": "999999" } });
    expect(await readLimitedBody(req, 16_000)).toBeNull();
    expect(req.bodyUsed).toBe(false);
  });

  it("sem content-length (chunked): pára de ler assim que passa o limite", async () => {
    expect(await readLimitedBody(streamOf(["a".repeat(10), "b".repeat(10)]), 15)).toBeNull();
    expect(await readLimitedBody(streamOf(['{"nome":"Jo', 'ão"}']), 100)).toBe('{"nome":"João"}');
  });
});

describe("captura: limite por visitante e sessão terminada", () => {
  it("o mesmo visitante a trocar de webinar_id não abre um limite novo", async () => {
    answers["webinars"] = { data: null, error: null };
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const id = `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`;
      statuses.push((await registerFromCapture({ webinar_id: id, name: "Rui", email: "rui@exemplo.com" }, { ...req(null), ip: "9.9.9.9" })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(-2)).toEqual([429, 429]);
  });

  it("data única que já terminou: a inscrição nova não fica ligada à sessão encerrada", async () => {
    answers["webinars"] = { data: { ...WEBINAR, scheduled_at: "2020-01-01T20:00:00Z" }, error: null };
    const res = await registerFromCapture(body({ submission_id: "sub-depois-do-fim" }), req());
    expect(res.status).toBe(201);
    expect(inserts.find((i) => i.table === "participants")!.row).toMatchObject({ webinar_session_id: null });
  });
});
