/**
 * A caixa do Atendimento: em que separador fica cada conversa e por que ordem
 * aparece (a mensagem mais recente em cima).
 */
import { keywordIntents } from "./classify";
import { priorityRank, slaState, type CaseRow, type SlaState } from "./model";

export type InboxTab = "all" | "new" | "ai" | "attending";

export const INBOX_TABS: { id: InboxTab; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "new", label: "Novas" },
  { id: "ai", label: "IA" },
  { id: "attending", label: "Em atendimento" },
];

/**
 * Com o agente, à espera de uma pessoa (ninguém pegou), com uma pessoa, ou com o
 * agente em pausa e ninguém à espera (resolvida sem a devolver ao agente): a
 * próxima mensagem do contacto abre um caso.
 */
export type InboxState = "ai" | "new" | "attending" | "paused";

export type InboxItem = {
  id: string;
  name: string;
  /** Fotografia ou desenho; sem ela, as iniciais. */
  photo?: string | null | undefined;
  channel: string;
  preview: string;
  lastFrom: "contact" | "ai" | "team" | null;
  at: string;
  webinarId: string | null;
  webinarTitle: string | null;
  /** A sessão em que a pessoa se inscreveu (o filtro «Sessão atual»); null no replay e sem horário. */
  sessionId?: string | null | undefined;
  state: InboxState;
  intent: string | null;
  /** Só existe com um caso aberto. */
  priority: string | null;
  sla: SlaState;
  /** O agente leu intenção de compra: é uma venda a fechar. */
  hot: boolean;
  teamName: string | null;
  ownerName: string | null;
  ownerId: string | null;
  example?: boolean | undefined;
};

/** Intenções que são uma venda a fechar. */
export const SALES_INTENTS = ["purchase", "checkout", "payment", "negotiation"];

type OpenCase = Pick<
  CaseRow,
  | "assigned_staff_id"
  | "status"
  | "intent"
  | "priority"
  | "purchase_intent"
  | "department_id"
  | "sla_deadline"
  | "sla_minutes"
  | "first_response_at"
  | "sla_breached_at"
>;

export function inboxState(
  conversation: { needs_human: boolean; ai_paused: boolean },
  open: Pick<OpenCase, "assigned_staff_id"> | null,
): InboxState {
  if (open) return open.assigned_staff_id ? "attending" : "new";
  if (conversation.needs_human) return "new";
  return conversation.ai_paused ? "paused" : "ai";
}

const SENDER: Record<string, InboxItem["lastFrom"]> = {
  participant: "contact",
  ai_agent: "ai",
  team: "team",
};

/** Uma conversa da base, já com o caso aberto (se houver), como a caixa a mostra. */
export function toInboxItem(
  c: {
    id: string;
    channel: string;
    last_message_preview: string;
    last_sender_kind: string | null;
    last_message_at: string;
    needs_human: boolean;
    ai_paused: boolean;
    webinar_id: string | null;
    participants?: { name: string | null; webinar_session_id?: string | null } | null;
    webinars?: { public_title: string } | null;
  },
  open: OpenCase | null,
  names: { team?: string | null | undefined; owner?: string | null | undefined } = {},
  now = Date.now(),
): InboxItem {
  const lastFrom = SENDER[c.last_sender_kind ?? ""] ?? null;
  // Sem caso, a intenção lê-se na última mensagem do contacto (regras, sem IA).
  const intent =
    open?.intent ??
    (lastFrom === "contact" ? (keywordIntents(c.last_message_preview)[0] ?? null) : null);
  return {
    id: c.id,
    name: c.participants?.name?.trim() || "Participante",
    channel: c.channel,
    preview: c.last_message_preview,
    lastFrom,
    at: c.last_message_at,
    webinarId: c.webinar_id,
    webinarTitle: c.webinars?.public_title ?? null,
    sessionId: c.participants?.webinar_session_id ?? null,
    state: inboxState(c, open),
    intent,
    priority: open?.priority ?? null,
    sla: open ? slaState(open, now).state : "none",
    hot: Boolean(open?.purchase_intent) || (intent !== null && SALES_INTENTS.includes(intent)),
    teamName: names.team ?? null,
    ownerName: names.owner ?? null,
    ownerId: open?.assigned_staff_id ?? null,
  };
}

export function inTab(item: InboxItem, tab: InboxTab) {
  return tab === "all" || item.state === tab;
}

export function countTabs(items: InboxItem[]): Record<InboxTab, number> {
  return {
    all: items.length,
    new: items.filter((i) => i.state === "new").length,
    ai: items.filter((i) => i.state === "ai").length,
    attending: items.filter((i) => i.state === "attending").length,
  };
}

const SLA_RANK: Record<SlaState, number> = { breached: 0, risk: 1, ok: 2, none: 3, met: 3 };

/**
 * A ordem da caixa: a mensagem mais recente sempre em cima (como no WhatsApp). Quem precisa de uma pessoa
 * vê-se no separador Novas e pelos selos de prazo e prioridade, não pela posição na lista.
 */
export function compareInbox(a: InboxItem, b: InboxItem) {
  return b.at.localeCompare(a.at) || a.id.localeCompare(b.id);
}

export function sortInbox(items: InboxItem[]) {
  return [...items].sort(compareInbox);
}

/** Os webinars das conversas, com quantas tem cada um: o filtro por webinar. */
export function webinarFilters(items: InboxItem[]) {
  const map = new Map<string, { id: string; title: string; count: number }>();
  for (const item of items) {
    if (!item.webinarId) continue;
    const row = map.get(item.webinarId) ?? {
      id: item.webinarId,
      title: item.webinarTitle ?? "Webinar",
      count: 0,
    };
    row.count += 1;
    map.set(item.webinarId, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

export function matchesSearch(item: InboxItem, term: string) {
  const clean = term.trim().toLowerCase();
  if (!clean) return true;
  return [item.name, item.preview, item.webinarTitle].some((v) => v?.toLowerCase().includes(clean));
}

/* ---------- O agente hoje ---------- */

/**
 * O que o agente fez hoje, em conversas e não em respostas: uma conversa com
 * cinco respostas conta uma vez. Só conta como resolvida a que não foi passada
 * à equipa depois da última resposta do agente.
 */
export function agentToday(
  events: { name: string; conversation_id: string | null; occurred_at: string }[],
) {
  const lastAnswer = new Map<string, string>();
  const lastPass = new Map<string, string>();
  for (const e of events) {
    if (!e.conversation_id) continue;
    const map = e.name === "ai_resolution" ? lastAnswer : e.name === "ai_escalation" ? lastPass : null;
    if (map && (map.get(e.conversation_id) ?? "") < e.occurred_at) map.set(e.conversation_id, e.occurred_at);
  }
  let resolved = 0;
  for (const [id, at] of lastAnswer) if ((lastPass.get(id) ?? "") < at) resolved += 1;
  return { resolved, escalated: lastPass.size };
}

/** Fim de uma sessão há pouco: as conversas de quem escreve logo a seguir à live ainda são «da sessão atual». */
export const RECENT_SESSION_MS = 3 * 3600_000;

/**
 * As sessões atuais: de cada webinar, a que está a decorrer ou a próxima (ainda por terminar), e as que
 * terminaram há menos de 3 horas.
 */
export function currentSessionIds(
  sessions: { id: string; webinar_id: string; starts_at: string; ended_at: string | null }[],
  now = Date.now(),
): Set<string> {
  const ids = new Set<string>();
  const next = new Map<string, { id: string; at: number }>();
  for (const s of sessions) {
    if (s.ended_at) {
      if (now - Date.parse(s.ended_at) <= RECENT_SESSION_MS) ids.add(s.id);
      continue;
    }
    const at = Date.parse(s.starts_at);
    const seen = next.get(s.webinar_id);
    if (!seen || at < seen.at) next.set(s.webinar_id, { id: s.id, at });
  }
  for (const { id } of next.values()) ids.add(id);
  return ids;
}
