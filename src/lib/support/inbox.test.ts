import { describe, expect, it } from "vitest";
import {
  agentToday,
  countTabs,
  inboxState,
  sortInbox,
  currentSessionIds,
  toInboxItem,
  webinarFilters,
  type InboxItem,
} from "./inbox";
import { handoffMessage, HANDOFF_DEFAULT } from "./routing";

const item = (id: string, over: Partial<InboxItem> = {}): InboxItem => ({
  id,
  name: id,
  channel: "webinar_chat",
  preview: "",
  lastFrom: "contact",
  at: "2026-10-08T10:00:00Z",
  webinarId: "w1",
  webinarTitle: "Fórmula Digital",
  sessionId: null,
  state: "ai",
  intent: null,
  priority: null,
  sla: "none",
  hot: false,
  teamName: null,
  ownerName: null,
  ownerId: null,
  ...over,
});

describe("caixa do atendimento", () => {
  it("separa novas, com o agente e em atendimento", () => {
    expect(inboxState({ needs_human: false, ai_paused: false }, null)).toBe("ai");
    expect(inboxState({ needs_human: true, ai_paused: false }, null)).toBe("new");
    expect(inboxState({ needs_human: false, ai_paused: false }, { assigned_staff_id: null })).toBe(
      "new",
    );
    expect(inboxState({ needs_human: false, ai_paused: false }, { assigned_staff_id: "rui" })).toBe(
      "attending",
    );
  });

  it("resolvida sem devolver ao agente fica em pausa, fora de Novas e depois de quem espera", () => {
    // Ao resolver: needs_human = false, ai_paused = NOT give_back, e o caso fecha.
    expect(inboxState({ needs_human: false, ai_paused: true }, null)).toBe("paused");
    const items = [
      item("pausa", { state: "paused", lastFrom: "team", at: "2026-10-08T12:00:00Z" }),
      item("espera", { state: "new", lastFrom: "team", at: "2026-10-08T09:00:00Z" }),
      item("agente", { state: "ai", lastFrom: "ai", at: "2026-10-08T11:00:00Z" }),
    ];
    expect(countTabs(items)).toEqual({ all: 3, new: 1, ai: 1, attending: 0 });
    expect(sortInbox(items).map((i) => i.id)).toEqual(["pausa", "agente", "espera"]);
  });

  it("a mensagem mais recente fica sempre em cima, seja qual for o estado ou a prioridade", () => {
    const sorted = sortInbox([
      item("antiga-urgente", { state: "new", priority: "high", sla: "breached", at: "2026-10-08T09:00:00Z" }),
      item("recente-agente", { state: "ai", at: "2026-10-08T11:00:00Z" }),
      item("meio", { state: "attending", at: "2026-10-08T10:00:00Z" }),
    ]).map((i) => i.id);
    expect(sorted).toEqual(["recente-agente", "meio", "antiga-urgente"]);
  });

  it("sessão atual: a que decorre ou a próxima de cada webinar, e as que acabaram há menos de 3 h", () => {
    const now = Date.parse("2026-10-18T21:00:00Z");
    const ids = currentSessionIds(
      [
        { id: "ontem", webinar_id: "w1", starts_at: "2026-10-17T19:30:00Z", ended_at: "2026-10-17T21:00:00Z" },
        { id: "hoje", webinar_id: "w1", starts_at: "2026-10-18T19:30:00Z", ended_at: null },
        { id: "amanha", webinar_id: "w1", starts_at: "2026-10-19T19:30:00Z", ended_at: null },
        { id: "acabou-agora", webinar_id: "w2", starts_at: "2026-10-18T18:00:00Z", ended_at: "2026-10-18T19:30:00Z" },
      ],
      now,
    );
    expect([...ids].sort()).toEqual(["acabou-agora", "hoje"]);
  });

  it("sem caso, lê a intenção na última mensagem do contacto", () => {
    const base = {
      id: "c1",
      channel: "webinar_chat",
      last_sender_kind: "participant",
      last_message_at: "2026-10-08T10:00:00Z",
      needs_human: false,
      ai_paused: false,
      webinar_id: "w1",
      participants: { name: "Ana" },
      webinars: { public_title: "Fórmula Digital" },
    };
    const buy = toInboxItem(
      { ...base, last_message_preview: "Quero comprar, ainda tem vagas?" },
      null,
    );
    expect(buy).toMatchObject({ intent: "purchase", hot: true, state: "ai", sla: "none" });
    const ai = toInboxItem(
      { ...base, last_sender_kind: "ai_agent", last_message_preview: "Quero comprar" },
      null,
    );
    expect(ai.intent).toBeNull();
  });

  it("conta os separadores e os webinars", () => {
    const items = [
      item("a", { state: "new" }),
      item("b"),
      item("c", { state: "attending", webinarId: "w2", webinarTitle: "Tráfego" }),
    ];
    expect(countTabs(items)).toEqual({ all: 3, new: 1, ai: 1, attending: 1 });
    expect(webinarFilters(items)).toEqual([
      { id: "w1", title: "Fórmula Digital", count: 2 },
      { id: "w2", title: "Tráfego", count: 1 },
    ]);
  });
});

describe("o agente hoje", () => {
  const e = (name: string, conversation_id: string, minute: number) => ({
    name,
    conversation_id,
    occurred_at: `2026-10-09T10:${String(minute).padStart(2, "0")}:00Z`,
  });
  it("conta conversas, não respostas; passada depois da resposta não conta como resolvida", () => {
    expect(
      agentToday([
        e("ai_resolution", "a", 1),
        e("ai_resolution", "a", 2),
        e("ai_resolution", "a", 3),
        e("ai_resolution", "b", 1),
        e("ai_escalation", "b", 5),
        e("ai_escalation", "c", 1),
        e("ai_resolution", "c", 9),
      ]),
    ).toEqual({ resolved: 2, escalated: 2 });
  });
});

describe("passagem do agente", () => {
  it("diz quem continua: a pessoa e a equipa", () => {
    expect(handoffMessage(HANDOFF_DEFAULT, { team: "Financeiro", person: "Sara Lopes" })).toBe(
      `${HANDOFF_DEFAULT} Quem continua: Sara, da equipa Financeiro.`,
    );
    expect(handoffMessage("Já lhe respondem.", { team: "Formação" })).toBe(
      "Já lhe respondem. Quem continua: a equipa Formação.",
    );
    expect(handoffMessage("Já lhe respondem.", {})).toBe("Já lhe respondem.");
  });
});
