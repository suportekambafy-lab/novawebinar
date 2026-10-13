import { describe, expect, it } from "vitest";
import { adjustPriority, classifyCase, keywordIntents, looksLikeRequest, resolveIntent, type Rule } from "./classify";
import { buildCommercialContext, contextFacts, customerLabel } from "./context";
import { availableActions, canOpenPath, caseOpenedBy, effectiveStatus, slaState, TEAM_TOOK_REASON } from "./model";
import { chooseStaff, routingReasonLabel, type Candidate } from "./routing";

const rules: Rule[] = [
  { intent: "purchase", department_id: "vendas", required_skills: ["vendas", "negociacao"], priority: "high", sla_minutes: 10, always_human: false, call_required: false },
  { intent: "post_purchase", department_id: "pos-venda", required_skills: ["pagamentos", "acesso"], priority: "high", sla_minutes: 15, always_human: false, call_required: false },
  { intent: "refund", department_id: "financeiro", required_skills: ["reembolso"], priority: "high", sla_minutes: 30, always_human: true, call_required: false },
  { intent: "information", department_id: "geral", required_skills: ["informacoes"], priority: "low", sla_minutes: 30, always_human: false, call_required: false },
  { intent: "other", department_id: "geral", required_skills: [], priority: "normal", sla_minutes: 30, always_human: false, call_required: false },
];

describe("classificação", () => {
  it("o caso do João: compra sobre pagamento, para Vendas, prioridade alta", () => {
    const c = classifyCase({
      text: "Quero comprar a Mentoria Acelera-C. Ainda tem vagas? Posso pagar em duas vezes?",
      rules,
      isCustomer: true,
      fallbackDepartmentId: "geral",
    });
    expect(c).toMatchObject({
      intent: "purchase",
      category: "payment",
      priority: "high",
      departmentId: "vendas",
      requiredSkills: ["vendas", "negociacao"],
      slaMinutes: 10,
      purchaseIntent: true,
      alwaysHuman: false,
    });
  });

  it("pagou e não recebeu acesso vai para o pós-venda", () => {
    const c = classifyCase({
      text: "Fiz o pagamento mas não recebi acesso.",
      rules,
      isCustomer: false,
      fallbackDepartmentId: "geral",
    });
    expect(c).toMatchObject({ intent: "post_purchase", category: "access", departmentId: "pos-venda" });
  });

  it("um elogio não é um pedido", () => {
    expect(keywordIntents("Excelente conteúdo!")).toEqual([]);
    expect(looksLikeRequest("Excelente conteúdo!")).toBe(false);
    expect(looksLikeRequest("Não consigo acessar o webinar")).toBe(true);
  });

  it("reembolso decide sempre, diga a IA o que disser", () => {
    const r = resolveIntent({ text: "Quero comprar outra vez, mas antes quero o reembolso da primeira", modelIntent: "purchase" });
    expect(r.intent).toBe("refund");
    const c = classifyCase({ text: "quero o meu dinheiro de volta", rules, modelIntent: "information", isCustomer: true, fallbackDepartmentId: null });
    expect(c.alwaysHuman).toBe(true);
    expect(c.defaultReason).toBe("Reembolso");
  });

  it("sem palavras conhecidas, vale a intenção da IA; sem IA, a regra geral", () => {
    expect(resolveIntent({ text: "e a fatura?", modelIntent: "post_purchase" }).intent).toBe("post_purchase");
    expect(resolveIntent({ text: "olá", classification: "HUMAN_REQUEST" }).intent).toBe("human_request");
    expect(resolveIntent({ text: "olá", modelIntent: "inventada" }).intent).toBe("other");
    const c = classifyCase({ text: "olá", rules: [], isCustomer: false, fallbackDepartmentId: "geral" });
    expect(c).toMatchObject({ intent: "other", departmentId: "geral", slaMinutes: 30, priority: "normal" });
  });

  it("acentos e maiúsculas não mudam a intenção", () => {
    expect(keywordIntents("NÃO CONSIGO ENTRAR")[0]).toBe("access");
    expect(keywordIntents("Reclamação: isto é uma vergonha")[0]).toBe("complaint");
    expect(keywordIntents("quero falar com uma pessoa")[0]).toBe("human_request");
    expect(keywordIntents("tem desconto?")[0]).toBe("negotiation");
  });

  it("quem já é cliente sobe na fila; cliente descontente sobe mais", () => {
    expect(adjustPriority("normal", { intent: "access", isCustomer: true })).toBe("high");
    expect(adjustPriority("normal", { intent: "access", isCustomer: false })).toBe("normal");
    expect(adjustPriority("low", { intent: "information", isCustomer: true })).toBe("low");
    expect(adjustPriority("high", { intent: "purchase", isCustomer: true, sentiment: "negative" })).toBe("critical");
    expect(adjustPriority("critical", { intent: "complaint", isCustomer: true, sentiment: "negative" })).toBe("critical");
  });
});

const person = (over: Partial<Candidate>): Candidate => ({
  id: "x",
  name: "X",
  departmentId: null,
  skills: [],
  channels: ["webinar_chat"],
  status: "available",
  capacity: 5,
  openCases: 0,
  active: true,
  lastAssignedAt: null,
  ...over,
});

const team: Candidate[] = [
  person({ id: "maria", name: "Maria Costa", departmentId: "geral", skills: ["atendimento", "informacoes"] }),
  person({ id: "carlos", name: "Carlos Manuel", departmentId: "vendas", skills: ["vendas", "checkout", "negociacao"], openCases: 1 }),
  person({ id: "rita", name: "Rita Fernandes", departmentId: "vendas", skills: ["vendas"], openCases: 0 }),
  person({ id: "ana", name: "Ana Paula", departmentId: "suporte", skills: ["acesso", "webinar", "pagamentos"] }),
  person({ id: "pedro", name: "Pedro Santos", departmentId: "financeiro", skills: ["pagamentos", "reembolso"], status: "offline" }),
];

const route = (over: Partial<Parameters<typeof chooseStaff>[0]> = {}) =>
  chooseStaff({
    candidates: team,
    departmentId: "vendas",
    requiredSkills: ["vendas", "negociacao"],
    channel: "webinar_chat",
    departmentName: "Vendas",
    ...over,
  });

describe("encaminhamento", () => {
  it("escolhe quem é do departamento e tem todas as competências", () => {
    const r = route();
    expect(r).toMatchObject({ staffId: "carlos", tier: 1 });
    expect(r.reason).toContain("Carlos Manuel");
    expect(r.reason).toContain("1 de 5 casos");
  });

  it("com a capacidade cheia passa ao seguinte do departamento", () => {
    const candidates = team.map((c) => (c.id === "carlos" ? { ...c, openCases: 5 } : c));
    expect(route({ candidates })).toMatchObject({ staffId: "rita", tier: 3 });
  });

  it("as competências contam mais do que o departamento", () => {
    // Pós-venda sem ninguém: a Ana, do Suporte, tem as duas competências.
    expect(route({ departmentId: "pos-venda", requiredSkills: ["pagamentos", "acesso"] })).toMatchObject({
      staffId: "ana",
      tier: 2,
    });
  });

  it("entre iguais, quem já atendeu o contacto; depois quem tem menos carga", () => {
    const twins = [
      person({ id: "a", departmentId: "vendas", skills: ["vendas"], openCases: 1 }),
      person({ id: "b", departmentId: "vendas", skills: ["vendas"], openCases: 3 }),
    ];
    const base = { candidates: twins, requiredSkills: ["vendas"] };
    expect(route(base).staffId).toBe("a");
    expect(route({ ...base, preferredStaffId: "b" }).staffId).toBe("b");
    expect(route({ ...base, preferredStaffId: "b" }).reason).toContain("já atendeu este contacto");
  });

  it("disponível passa à frente de online", () => {
    const pair = [
      person({ id: "a", departmentId: "vendas", skills: ["vendas"], status: "online" }),
      person({ id: "b", departmentId: "vendas", skills: ["vendas"], status: "available", openCases: 2 }),
    ];
    expect(route({ candidates: pair, requiredSkills: ["vendas"] }).staffId).toBe("b");
  });

  it("sem pessoa adequada fica na fila, com o motivo", () => {
    const refund = route({ departmentId: "financeiro", requiredSkills: ["reembolso"], departmentName: "Financeiro" });
    expect(refund).toMatchObject({ staffId: null, tier: null });
    expect(refund.reason).toBe("Na fila da equipa Financeiro: ninguém disponível tem reembolso.");

    const busy = team.map((c) => ({ ...c, status: "busy" as const }));
    expect(route({ candidates: busy }).reason).toContain("ninguém está disponível");
    expect(route({ candidates: [] }).reason).toContain("ainda não há pessoas");
    expect(route({ channel: "whatsapp" }).reason).toContain("ninguém disponível atende este canal");
    const full = team.map((c) => ({ ...c, openCases: c.capacity }));
    expect(route({ candidates: full }).reason).toContain("capacidade cheia");
  });

  it("quem trabalha sozinho recebe tudo", () => {
    const solo = [person({ id: "dono", name: "Dona", departmentId: "geral" })];
    expect(route({ candidates: solo })).toMatchObject({ staffId: "dono", tier: 6 });
    // Com mais gente na equipa, a mesma pessoa já não é a escolha automática.
    expect(route({ candidates: [...solo, person({ id: "outro", status: "offline" })] }).staffId).toBeNull();
  });
});

describe("prazo e presença", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  const base = { status: "assigned", sla_minutes: 20, first_response_at: null, sla_breached_at: null };

  it("em risco no último quarto do prazo", () => {
    expect(slaState({ ...base, sla_deadline: "2026-01-10T12:10:00Z" }, now)).toEqual({ state: "ok", minutesLeft: 10 });
    expect(slaState({ ...base, sla_deadline: "2026-01-10T12:04:00Z" }, now).state).toBe("risk");
    expect(slaState({ ...base, sla_deadline: "2026-01-10T11:58:00Z" }, now)).toEqual({ state: "breached", minutesLeft: -2 });
  });

  it("depois da primeira resposta fica cumprido ou falhado", () => {
    const deadline = "2026-01-10T11:50:00Z";
    expect(slaState({ ...base, sla_deadline: deadline, first_response_at: "2026-01-10T11:45:00Z" }, now).state).toBe("met");
    expect(slaState({ ...base, sla_deadline: deadline, first_response_at: "2026-01-10T11:55:00Z" }, now).state).toBe("breached");
    expect(slaState({ ...base, status: "resolved", sla_deadline: deadline }, now).state).toBe("none");
  });

  it("sem sinal do painel há 3 minutos, conta como offline", () => {
    const staff = { status: "available", user_id: "u", active: true };
    expect(effectiveStatus({ ...staff, last_seen_at: "2026-01-10T11:59:00Z" }, now)).toBe("available");
    expect(effectiveStatus({ ...staff, last_seen_at: "2026-01-10T11:50:00Z" }, now)).toBe("offline");
    expect(effectiveStatus({ ...staff, last_seen_at: null }, now)).toBe("offline");
    expect(effectiveStatus({ ...staff, user_id: null, last_seen_at: "2026-01-10T11:59:00Z" }, now)).toBe("offline");
  });
});

describe("acções e acessos", () => {
  it("caso concluído só se reabre ou fecha", () => {
    const c = { assigned_staff_id: "eu", call_required: false, conversation_id: "c" };
    expect(availableActions({ ...c, status: "resolved" }, "eu")).toEqual(["reopen", "close"]);
    expect(availableActions({ ...c, status: "closed" }, "eu")).toEqual(["reopen"]);
    const mine = availableActions({ ...c, status: "in_progress" }, "eu");
    expect(mine).not.toContain("assume");
    expect(mine).toContain("resolve");
    expect(availableActions({ ...c, status: "in_progress" }, "outro")).toContain("assume");
    expect(availableActions({ ...c, status: "waiting_customer" }, "eu")).toContain("resume");
  });

  it("só é passagem do agente o caso que o agente abriu", () => {
    expect(caseOpenedBy({ confidence: 0.4, reason_for_escalation: "Pediu desconto" })).toBe("agent");
    expect(caseOpenedBy({ confidence: null, reason_for_escalation: TEAM_TOOK_REASON })).toBe("team");
    expect(caseOpenedBy({ confidence: null, reason_for_escalation: "Webinar sem assistente IA" })).toBe("rule");
  });

  it("os motivos antigos leem-se com «equipa»", () => {
    expect(routingReasonLabel("Na fila do departamento")).toBe("Na fila da equipa");
    expect(routingReasonLabel("Na fila de departamento: ninguém disponível pertence a este departamento.")).toBe(
      "Na fila da equipa: ninguém disponível pertence a esta equipa.",
    );
    expect(routingReasonLabel("Na fila de Financeiro: ninguém disponível tem reembolso.")).toBe(
      "Na fila da equipa Financeiro: ninguém disponível tem reembolso.",
    );
    expect(routingReasonLabel("Transferido à mão")).toBe("Transferido à mão");
  });

  it("a função suporte só abre o atendimento", () => {
    expect(canOpenPath("support", "/support")).toBe(true);
    expect(canOpenPath("support", "/cases")).toBe(true);
    expect(canOpenPath("support", "/integrations")).toBe(false);
    expect(canOpenPath("support", "/webinars/abc/edit")).toBe(false);
    expect(canOpenPath("support", "/team")).toBe(false);
    expect(canOpenPath("owner", "/integrations")).toBe(true);
  });
});

describe("contexto comercial", () => {
  // Uma linha dos factos como a base de dados a devolve: vídeo de 1000 s, oferta aos 600 s.
  const fact = (id: string, webinarId: string, title: string, joinedAt: string, watched: number, clicked = false) => ({
    participant_id: id,
    webinar_id: webinarId,
    webinar_title: title,
    joined_at: joinedAt,
    viewing_mode: "live",
    duration_seconds: 1000,
    offer_start_seconds: 600,
    entry_seconds: 0,
    peak_seconds: watched,
    actual_watch_seconds: watched,
    watch_measured: true,
    watch_ratio: watched / 1000,
    attended: watched >= 60,
    saw_offer: watched >= 600,
    clicked,
    // Como na base de dados: só as compras aprovadas atribuídas a este webinar.
    checkout_started: webinarId === "w1",
    purchased: webinarId === "w1",
    payment_failed: false,
    checkout_abandoned: false,
    refunded: false,
  });
  const context = buildCommercialContext({
    participations: [
      fact("p1", "w1", "Fórmula Digital", "2026-08-12T10:00:00Z", 1000, true),
      fact("p2", "w2", "Tráfego para Negócios Físicos", "2026-09-10T10:00:00Z", 780),
      fact("p3", "w3", "Mentoria Acelera-C", "2026-09-16T10:00:00Z", 0),
    ],
    clicks: [],
    messages: [{ participant_id: "p2", created_at: "2026-09-16T14:32:00Z" }],
    purchases: [
      { id: "b1", created_at: "2026-08-12T10:15:00Z", status_at: "2026-08-12T10:15:00Z", product_name: "Fórmula Digital", amount: "", amount_value: 750000, currency: "AOA", status: "approved", provider: "kambafy", webinar_id: "w1" },
      { id: "b2", created_at: "2026-09-15T14:20:00Z", status_at: "2026-09-15T14:20:00Z", product_name: "Mentoria", amount: "", amount_value: 497000, currency: "AOA", status: "approved", provider: "kambafy", webinar_id: null },
      { id: "b3", created_at: "2026-09-15T15:00:00Z", status_at: "2026-09-15T15:00:00Z", product_name: "Extra", amount: "", amount_value: 100, currency: "AOA", status: "refunded", provider: "kambafy", webinar_id: null },
    ],
    cases: [{ id: "c1", number: 3, intent: "payment", status: "resolved", created_at: "2026-09-01T00:00:00Z", resolved_at: "2026-09-01T01:00:00Z" }],
  });

  it("soma só as compras aprovadas", () => {
    expect(context.approvedPurchases).toBe(2);
    expect(context.spent).toEqual([{ currency: "AOA", total: 1_247_000 }]);
    expect(context.isCustomer).toBe(true);
    expect(customerLabel(context)).toBe("Cliente recorrente · 2 compras");
  });

  it("mostra cada webinar com a percentagem assistida", () => {
    expect(context.registered).toBe(3);
    expect(context.attended).toBe(2);
    expect(context.webinars.map((w) => [w.title, w.watchedPct, w.purchased])).toEqual([
      ["Mentoria Acelera-C", 0, false],
      ["Tráfego para Negócios Físicos", 78, false],
      ["Fórmula Digital", 100, true],
    ]);
    expect(context.lastActivityAt).toBe("2026-09-16T14:32:00Z");
  });

  it("descreve o contacto em frases", () => {
    const facts = contextFacts(context, "w2");
    expect(facts[0]).toBe("Já comprou 2 vezes: Mentoria; Fórmula Digital.");
    // O reembolso não conta como compra, mas quem atende tem de o saber.
    expect(facts[1]).toBe("A última compra foi reembolsada (Extra).");
    expect(facts[2]).toBe("Nesta live (Tráfego para Negócios Físicos): assistiu a 78%, viu a oferta.");
    expect(facts[3]).toBe("Outras lives: Fórmula Digital (100%).");
    expect(facts[4]).toBe("Casos anteriores: Pagamento.");
  });

  it("quem entrou há pouco não aparece como quem nunca assistiu", () => {
    const now = buildCommercialContext({
      participations: [fact("p9", "w9", "Aula ao vivo", "2026-09-20T10:00:00Z", 40)],
      clicks: [],
      messages: [],
      purchases: [],
      cases: [],
    });
    expect(now.attended).toBe(0);
    expect(contextFacts(now, "w9")[1]).toBe("Nesta live (Aula ao vivo): viu pouco até agora.");
  });
});
