/**
 * Workflow de um webinar: as automações (gatilho → passos) desse webinar, vistas juntas.
 *
 * Uma só fonte de verdade: cada automação guarda o gatilho, as condições de entrada e os
 * passos (automations.steps, 0063). O workflow (automation_workflows) agrupa-as e guarda só
 * o que não se executa: páginas externas, origens de tráfego e posições no canvas.
 * O motor é o do Bloco 4: a base de dados cria e agenda as execuções; o servidor executa
 * um passo de cada vez (automations.server.ts) com as funções puras daqui.
 */
import {
  conditionHeld,
  conditionLabel,
  TRIGGER_LABEL,
  type BooleanFact,
  type Condition,
  type RunFacts,
  type TriggerEvent,
} from "@/lib/automations";
import { parseTime, zonedTimeToMs, zoneParts } from "@/lib/schedule";
import { BASE_MESSAGES } from "./base-messages";

/* ---------- Passos ---------- */

export type Channel = "email" | "whatsapp" | "sms" | "webhook";
export type Target = "contact" | "group" | "webhook";

/** Um envio: canal + destino + conteúdo. Pode nascer vazio (configuração preparada). */
export type Send = {
  channel: Channel;
  target: Target;
  /** WhatsApp em grupo: o nome ou identificador do grupo. */
  group?: string;
  /** Email: o assunto. */
  subject?: string;
  message?: string;
};

export type WaitMode = "delay" | "before_session" | "after_session" | "until";

export type WaitNode = {
  id: string;
  kind: "wait";
  label?: string;
  mode: WaitMode;
  /** delay: depois do passo anterior; before/after_session: antes do início / depois do fim. */
  minutes?: number;
  /** until: data e hora (ISO). */
  at?: string;
  /** Hora do dia ("HH:MM", no fuso do webinar): a espera conta em dias e acaba a essa hora. */
  time?: string;
  next: string | null;
};
export type BranchNode = {
  id: string;
  kind: "branch";
  label?: string;
  condition: Condition;
  yes: string | null;
  no: string | null;
};
export type ActionNode = { id: string; kind: "action"; label?: string; sends: Send[]; next: string | null };
export type StepNode = WaitNode | BranchNode | ActionNode;
export type Steps = { start: string | null; nodes: StepNode[] };

export const MAX_NODES = 60;
export const MAX_SENDS = 6;
/** Limite de passos registados numa execução: protege contra ciclos gravados à mão. */
export const MAX_LOG = 200;

export const CHANNELS: Record<Channel, { label: string; targets: Target[] }> = {
  email: { label: "Email", targets: ["contact"] },
  whatsapp: { label: "WhatsApp", targets: ["contact", "group"] },
  sms: { label: "SMS", targets: ["contact"] },
  webhook: { label: "Webhook", targets: ["webhook"] },
};
export const TARGET_LABEL: Record<Target, string> = {
  contact: "Contacto",
  group: "Grupo",
  webhook: "Webhook de saída",
};

export function sendLabel(send: Send) {
  const channel = CHANNELS[send.channel]?.label ?? send.channel;
  if (send.target === "group") return `${channel} · grupo${send.group ? ` ${send.group}` : ""}`;
  if (send.channel === "webhook") return "Webhook de saída";
  return `${channel} · individual`;
}

/** O que falta para o envio poder sair. Vazio = pronto. */
export function sendMissing(send: Send): string[] {
  const missing: string[] = [];
  if (send.channel === "webhook") return missing;
  if (send.target === "group" && !send.group?.trim()) missing.push("grupo");
  if (send.channel === "email" && !send.subject?.trim()) missing.push("assunto");
  if (!send.message?.trim()) missing.push("mensagem");
  return missing;
}

export function nodeMap(steps: Steps) {
  return new Map(steps.nodes.map((n) => [n.id, n] as const));
}

/** Os passos seguintes de um nó (um, ou dois num ramo). */
export function successors(node: StepNode): (string | null)[] {
  return node.kind === "branch" ? [node.yes, node.no] : [node.next];
}

/** Erros que impedem gravar: apontadores, ciclos, limites. */
export function validateSteps(steps: Steps): string[] {
  const errors: string[] = [];
  const map = nodeMap(steps);
  if (steps.nodes.length > MAX_NODES) errors.push(`No máximo ${MAX_NODES} passos por automação.`);
  if (map.size !== steps.nodes.length) errors.push("Há passos repetidos.");
  if (steps.start && !map.has(steps.start)) errors.push("O primeiro passo não existe.");
  for (const node of steps.nodes) {
    for (const next of successors(node)) {
      if (next && !map.has(next)) errors.push(`O passo "${nodeTitle(node)}" liga a um passo que não existe.`);
      if (next === node.id) errors.push(`O passo "${nodeTitle(node)}" liga a si próprio.`);
    }
    if (node.kind === "action" && node.sends.length > MAX_SENDS)
      errors.push(`No máximo ${MAX_SENDS} envios por mensagem.`);
    if (node.kind === "wait" && node.mode !== "until" && !(Number(node.minutes) >= 0 && Number(node.minutes) <= 43200))
      errors.push("Uma espera tem de ter entre 0 minutos e 30 dias.");
    if (node.kind === "wait" && node.mode === "until" && !node.at) errors.push("Falta a data da espera.");
    else if (node.kind === "wait" && node.mode === "until" && Number.isNaN(Date.parse(node.at ?? "")))
      errors.push("A data da espera não é válida.");
    if (node.kind === "wait" && node.time != null && !TIME_RE.test(node.time)) errors.push("A hora da espera tem de ser HH:MM.");
  }
  // Ciclos: um caminho nunca volta a um passo onde já passou.
  const state = new Map<string, "open" | "done">();
  const visit = (id: string | null): boolean => {
    if (!id || !map.has(id)) return false;
    if (state.get(id) === "open") return true;
    if (state.get(id) === "done") return false;
    state.set(id, "open");
    const cyclic = successors(map.get(id)!).some(visit);
    state.set(id, "done");
    return cyclic;
  };
  if (steps.nodes.some((n) => visit(n.id))) errors.push("Os passos não podem formar um ciclo.");
  return [...new Set(errors)];
}

/** Passos a que não se chega a partir do primeiro (ficam guardados, não correm). */
export function unreachable(steps: Steps): string[] {
  const map = nodeMap(steps);
  const seen = new Set<string>();
  const stack = [steps.start];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id) || !map.has(id)) continue;
    seen.add(id);
    stack.push(...successors(map.get(id)!));
  }
  return steps.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id);
}

/* ---------- Condições dos ramos ---------- */

export function negate(condition: Condition): Condition {
  if ("op" in condition) return { ...condition, op: condition.op === "gte" ? "lt" : "gte" };
  return { fact: condition.fact, value: !condition.value };
}

/** Junta a condição de um ramo às já tomadas: a mais recente sobre o mesmo facto vale. */
export function mergeGuard(guards: Condition[], condition: Condition): Condition[] {
  return [...guards.filter((g) => g.fact !== condition.fact), condition].slice(-8);
}

export type Audience = { who: Condition[]; channels: Channel[]; messages: number };

/**
 * Quem recebe o quê: um caminho por ramo, com as condições que levam lá e os canais das mensagens.
 * Os caminhos sem mensagens não contam.
 */
// ponytail: percorre todos os caminhos (2^ramos); chega com MAX_NODES = 60 e poucos ramos por automação.
export function audiences(steps: Steps | null, entry: Condition[] = []): Audience[] {
  const out: Audience[] = [];
  if (!steps) return out;
  const map = nodeMap(steps);
  const go = (id: string | null, who: Condition[], channels: Channel[], messages: number, seen: string[]) => {
    const n = id ? map.get(id) : undefined;
    if (!n || seen.includes(n.id)) {
      if (messages) out.push({ who, channels: [...new Set(channels)], messages });
      return;
    }
    const path = [...seen, n.id];
    if (n.kind === "branch") {
      go(n.yes, mergeGuard(who, n.condition), channels, messages, path);
      go(n.no, mergeGuard(who, negate(n.condition)), channels, messages, path);
    } else if (n.kind === "action") go(n.next, who, [...channels, ...n.sends.map((s) => s.channel)], messages + 1, path);
    else go(n.next, who, channels, messages, path);
  };
  go(steps.start, entry, [], 0, []);
  return out;
}

export type LaidStep = { node: Exclude<StepNode, WaitNode>; col: number; row: number };
export type LaidEdge = { from: string | null; to: string; handle?: "yes" | "no"; label?: string; wait?: string };

/**
 * A automação desenhada da esquerda para a direita, como no mapa: mensagens e condições em colunas,
 * cada ramo na sua linha. As esperas não são nós: passam a legenda da ligação seguinte.
 * Um ramo vazio (ex.: «Comprou → nada») não ocupa linha. `from: null` é a entrada da automação.
 */
export function stepLayout(steps: Steps | null): { items: LaidStep[]; edges: LaidEdge[]; rows: number } {
  const items: LaidStep[] = [];
  const edges: LaidEdge[] = [];
  if (!steps) return { items, edges, rows: 1 };
  const map = nodeMap(steps);
  const placed = new Set<string>();
  // Devolve as linhas que o caminho ocupa.
  const place = (id: string | null, from: string | null, col: number, row: number, handle?: "yes" | "no", label?: string): number => {
    const waits: string[] = [];
    let n = id ? map.get(id) : undefined;
    for (let guard = 0; n?.kind === "wait" && guard < MAX_NODES; guard += 1) {
      waits.push(waitLabel(n));
      n = n.next ? map.get(n.next) : undefined;
    }
    if (!n || n.kind === "wait") return 0;
    edges.push({ from, to: n.id, ...(handle ? { handle } : {}), ...(label ? { label } : {}), ...(waits.length ? { wait: waits.join(" · ") } : {}) });
    if (placed.has(n.id)) return 0;
    placed.add(n.id);
    items.push({ node: n, col, row });
    if (n.kind === "action") return Math.max(1, place(n.next, n.id, col + 1, row));
    const yes = place(n.yes, n.id, col + 1, row, "yes", conditionLabel(n.condition));
    const no = place(n.no, n.id, col + 1, row + yes, "no", conditionLabel(negate(n.condition)));
    return Math.max(1, yes + no);
  };
  const rows = place(steps.start, null, 0, 0);
  return { items, edges, rows: Math.max(1, rows) };
}

export function conditionsHold(conditions: Condition[], facts: RunFacts | null | undefined) {
  return conditions.every((c) => conditionHeld(c, facts));
}

/** O que a pessoa fez na sessão ao vivo. Fica decidido quando a sessão termina. */
const SESSION_BEHAVIOUR = new Set<string>(["entered", "attended", "no_show", "reached_pitch", "reached_offer", "left_early", "saw_offer", "actual_watch_seconds", "entry_seconds"]);

/**
 * As condições que se confirmam outra vez antes de cada mensagem. Numa automação que começa quando a sessão
 * termina, o que a pessoa fez na sessão já não muda: ver a gravação depois conta no mesmo registo dela, e não
 * a pode tirar da automação a meio. A compra e o resto continuam a confirmar-se.
 * ponytail: quem muda de segmento fica onde está; a troca de automação do mapa (reavaliação) faz-se no motor quando for precisa.
 */
export function conditionsAtSend(trigger: string, conditions: Condition[]): Condition[] {
  return trigger === "webinar_session_ended" ? conditions.filter((c) => !SESSION_BEHAVIOUR.has(c.fact)) : conditions;
}

/**
 * As condições do caminho (os ramos por onde a execução passou) voltam a confirmar-se antes de
 * cada mensagem. Um facto em falta não é um "não": um comprador sem participação não tem
 * `purchased`, e o ramo "Comprou?" já o levou pelo "Não". Só um valor conhecido e contrário
 * mostra que o caminho deixou de valer. As condições de entrada continuam estritas (iguais à SQL).
 */
export function guardsHold(guards: Condition[], facts: RunFacts | null | undefined) {
  return guards.every((g) => facts?.[g.fact] == null || conditionHeld(g, facts));
}

/** As perguntas que um ramo pode fazer. */
export const BRANCH_QUESTIONS: { fact: BooleanFact; question: string }[] = [
  { fact: "entered", question: "Entrou?" },
  { fact: "attended", question: "Assistiu?" },
  { fact: "no_show", question: "Não compareceu?" },
  { fact: "replay", question: "Veio pelo replay?" },
  { fact: "reached_pitch", question: "Viu o pitch?" },
  { fact: "reached_offer", question: "Chegou à oferta?" },
  { fact: "left_early", question: "Saiu cedo?" },
  { fact: "saw_offer", question: "Viu a oferta?" },
  { fact: "clicked", question: "Clicou?" },
  { fact: "checkout_started", question: "Iniciou o checkout?" },
  { fact: "purchased", question: "Comprou?" },
  { fact: "checkout_abandoned", question: "Checkout abandonado?" },
  { fact: "payment_failed", question: "Pagamento falhou?" },
];

export function branchQuestion(condition: Condition) {
  if ("op" in condition) return `${conditionLabel(condition)}?`;
  const q = BRANCH_QUESTIONS.find((b) => b.fact === condition.fact)?.question ?? conditionLabel(condition);
  // Um ramo guardado como "valor falso" pergunta o contrário.
  return condition.value ? q : `Não: ${q.toLowerCase()}`;
}

/* ---------- Esperas ---------- */

export type SessionTimes = { startsAt: string | null; endsAt: string | null };

/** Uma espera relativa à sessão que já passou há mais disto é um lembrete fora de horas. */
const LATE_MS = 5 * 60_000;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A hora do dia de uma espera, quando é válida. */
const waitTime = (node: WaitNode) => (node.mode !== "until" && node.time && TIME_RE.test(node.time) ? node.time : null);
const dayCount = (minutes: number) => Math.floor(minutes / 1440);
const daysLabel = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

export function waitLabel(node: WaitNode) {
  const m = Number(node.minutes ?? 0);
  const span = durationLabel(m);
  const time = waitTime(node);
  if (time) {
    const days = dayCount(m);
    if (node.mode === "delay") return days === 0 ? `Até às ${time}` : `Esperar ${daysLabel(days)}, até às ${time}`;
    if (node.mode === "before_session") return days === 0 ? `No dia da sessão, às ${time}` : `${daysLabel(days)} antes da sessão, às ${time}`;
    return days === 0 ? `Depois do fim da sessão, às ${time}` : `${daysLabel(days)} depois do fim da sessão, às ${time}`;
  }
  switch (node.mode) {
    case "delay":
      return m === 0 ? "Imediatamente" : `Esperar ${span}`;
    case "before_session":
      return m === 0 ? "Até ao início da sessão" : `Até ${span} antes da sessão`;
    case "after_session":
      return m === 0 ? "Até ao fim da sessão" : `${span} depois do fim da sessão`;
    case "until":
      return node.at ? `Até ${new Date(node.at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}` : "Até uma data";
  }
}

export function durationLabel(minutes: number) {
  if (minutes % 1440 === 0 && minutes >= 1440) return minutes === 1440 ? "1 dia" : `${minutes / 1440} dias`;
  if (minutes % 60 === 0 && minutes >= 60) return minutes === 60 ? "1 hora" : `${minutes / 60} horas`;
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

/**
 * Quando uma espera acaba. null: depende de uma sessão que esta execução não tem.
 * Com hora do dia, os minutos contam em dias inteiros e a espera acaba a essa hora, no fuso do
 * webinar: "1 dia antes da sessão, às 09:00", "2 dias depois do fim, às 20:00". Depois do passo
 * anterior ou do fim da sessão, nunca acaba antes do ponto de partida: "até às 09:00" pedido às
 * 15:00 é às 09:00 do dia seguinte.
 */
export function waitTarget(node: WaitNode, now: Date, session: SessionTimes | null, timeZone = "UTC"): Date | null {
  const m = Number(node.minutes ?? 0) * 60_000;
  const time = parseTime(waitTime(node));
  if (time) {
    const from = node.mode === "delay" ? now.toISOString() : node.mode === "before_session" ? session?.startsAt : session?.endsAt;
    if (!from) return null;
    const start = Date.parse(from);
    const days = dayCount(Number(node.minutes ?? 0)) * (node.mode === "before_session" ? -1 : 1);
    const p = zoneParts(start, timeZone);
    const at = (extra: number) => zonedTimeToMs(p.year, p.month, p.day + days + extra, time.hour, time.minute, timeZone);
    const target = at(0);
    return new Date(node.mode !== "before_session" && target <= start ? at(1) : target);
  }
  switch (node.mode) {
    case "delay":
      return new Date(now.getTime() + m);
    case "before_session":
      return session?.startsAt ? new Date(Date.parse(session.startsAt) - m) : null;
    case "after_session":
      return session?.endsAt ? new Date(Date.parse(session.endsAt) + m) : null;
    case "until": {
      // Uma data inválida (guardada à mão, pela API) não envia já: a espera fica sem alvo.
      const at = node.at ? Date.parse(node.at) : Number.NaN;
      return Number.isNaN(at) ? null : new Date(at);
    }
  }
}

/* ---------- Percurso de uma execução ---------- */

export type LogEntry = {
  node: string;
  kind: StepNode["kind"];
  at: string;
  outcome: string;
  /** Envios de uma mensagem: canal, destino, estado. */
  /** `slot`: a posição do envio no passo (o grupo reconhece-se por ela, não pelo nome, que pode mudar). */
  sends?: { channel: Channel; target: Target; to: string | null; status: "simulated" | "delivered" | "failed" | "shared" | "skipped"; http_status?: number | null; error?: string | null; slot?: number }[];
  /** Resultado de um ramo. */
  branch?: "yes" | "no";
};

export type WalkResult = {
  status: "next" | "done" | "failed";
  cursor: string | null;
  scheduledFor: Date;
  guards: Condition[];
  log: LogEntry[];
  error?: string;
};

/**
 * A partir de um passo, anda pelas esperas e ramos (sem efeitos) até à próxima mensagem,
 * a uma espera que ainda não acabou, ou ao fim. Os ramos usam os factos de agora e juntam
 * a sua condição às que se confirmam antes de cada mensagem seguinte.
 */
export function walk(
  steps: Steps,
  from: string | null,
  ctx: { now: Date; facts: RunFacts | null; session: SessionTimes | null; guards: Condition[]; timeZone?: string },
): WalkResult {
  const map = nodeMap(steps);
  const log: LogEntry[] = [];
  let guards = ctx.guards;
  const at = ctx.now.toISOString();
  let id = from;
  for (let i = 0; i <= MAX_NODES; i += 1) {
    if (!id) return { status: "done", cursor: null, scheduledFor: ctx.now, guards, log };
    const node = map.get(id);
    if (!node) return { status: "failed", cursor: id, scheduledFor: ctx.now, guards, log, error: "Passo em falta." };
    if (node.kind === "action") return { status: "next", cursor: node.id, scheduledFor: ctx.now, guards, log };
    if (node.kind === "branch") {
      const held = conditionHeld(node.condition, ctx.facts);
      guards = mergeGuard(guards, held ? node.condition : negate(node.condition));
      log.push({ node: node.id, kind: "branch", at, outcome: `${branchQuestion(node.condition)} ${held ? "Sim" : "Não"}`, branch: held ? "yes" : "no" });
      id = held ? node.yes : node.no;
      continue;
    }
    const target = waitTarget(node, ctx.now, ctx.session, ctx.timeZone);
    if (!target) {
      // Sem sessão marcada (ex.: pagamento sem webinar): a espera relativa não se aplica.
      log.push({ node: node.id, kind: "wait", at, outcome: "Sem sessão marcada: a espera não se aplica" });
      id = skipAction(map, node.next);
      continue;
    }
    if (afterStart(node, target, ctx.session)) {
      // Ex.: "no dia da sessão, às 09:00" numa sessão às 08:00: já não é um lembrete.
      log.push({ node: node.id, kind: "wait", at, outcome: "A hora escolhida fica depois do início da sessão: a mensagem seguinte não sai" });
      id = skipAction(map, node.next);
      continue;
    }
    if (target.getTime() > ctx.now.getTime()) {
      log.push({ node: node.id, kind: "wait", at, outcome: `A aguardar até ${target.toISOString()}` });
      if (!node.next) return { status: "done", cursor: null, scheduledFor: target, guards, log };
      return { status: "next", cursor: node.next, scheduledFor: target, guards, log };
    }
    const late = node.mode === "before_session" && ctx.now.getTime() - target.getTime() > LATE_MS;
    if (late) {
      // Ex.: inscreveu-se 30 min antes: o lembrete de "falta 1 hora" já não faz sentido.
      log.push({ node: node.id, kind: "wait", at, outcome: "A hora já tinha passado: a mensagem seguinte não sai" });
      id = skipAction(map, node.next);
      continue;
    }
    id = node.next;
  }
  return { status: "failed", cursor: id, scheduledFor: ctx.now, guards, log, error: "Demasiados passos seguidos." };
}

function skipAction(map: Map<string, StepNode>, id: string | null) {
  const node = id ? map.get(id) : undefined;
  return node?.kind === "action" ? node.next : id;
}

/** Um lembrete com hora do dia que cai no início da sessão ou depois. */
const afterStart = (node: WaitNode, target: Date, session: SessionTimes | null) =>
  node.mode === "before_session" && Boolean(waitTime(node)) && Boolean(session?.startsAt) && target.getTime() >= Date.parse(session!.startsAt!);

/** As esperas que levam directamente a uma mensagem. */
const waitsInto = (steps: Steps, actionId: string) =>
  steps.nodes.filter((n): n is WaitNode => n.kind === "wait" && n.next === actionId);

/**
 * Uma mensagem que vem de uma espera "antes da sessão" e cuja hora já passou há mais de LATE_MS
 * (o executor ou o servidor atrasaram-se): é um lembrete fora de horas e não sai. A mesma regra
 * que `walk` aplica ao atravessar a espera, agora com o cursor já na mensagem.
 */
export function lateReminder(steps: Steps, actionId: string, now: Date, session: SessionTimes | null, timeZone?: string) {
  return waitsInto(steps, actionId).some((n) => {
    if (n.mode !== "before_session") return false;
    const target = waitTarget(n, now, session, timeZone);
    return target !== null && (now.getTime() - target.getTime() > LATE_MS || afterStart(n, target, session));
  });
}

/**
 * A sessão mudou de hora depois de a mensagem ter sido agendada: a hora nova, se ainda não chegou.
 * Só as esperas presas à sessão se recalculam; as outras contam a partir do passo anterior.
 */
export function movedTarget(steps: Steps, actionId: string, now: Date, session: SessionTimes | null, timeZone?: string): Date | null {
  for (const n of waitsInto(steps, actionId)) {
    if (n.mode !== "before_session" && n.mode !== "after_session") continue;
    const target = waitTarget(n, now, session, timeZone);
    if (target && target.getTime() - now.getTime() > 60_000) return target;
  }
  return null;
}

/* ---------- Horas de silêncio ---------- */

/** WhatsApp e SMS individuais não saem entre estas horas, no fuso do webinar. */
export const QUIET_HOURS = { from: 22, to: 8 } as const;

/**
 * Até quando uma mensagem fica parada pelas horas de silêncio; null = pode sair já. Não param:
 * o email e os grupos; a compra aprovada e a sessão que começou (a pessoa está à espera delas);
 * a hora escolhida por quem configurou (antes da sessão, data marcada ou hora do dia); e tudo o
 * que acontece à volta de uma sessão nocturna (3 horas antes do início até ao fim).
 */
export function quietUntil(
  steps: Steps,
  node: ActionNode,
  ctx: { trigger: string; now: Date; session: SessionTimes | null; timeZone: string },
): Date | null {
  if (ctx.trigger === "purchase_approved" || ctx.trigger === "webinar_session_started") return null;
  if (!node.sends.some((s) => s.target === "contact" && (s.channel === "whatsapp" || s.channel === "sms"))) return null;
  if (waitsInto(steps, node.id).some((n) => n.mode === "before_session" || n.mode === "until" || waitTime(n))) return null;
  const now = ctx.now.getTime();
  const start = ctx.session?.startsAt ? Date.parse(ctx.session.startsAt) : null;
  const end = ctx.session?.endsAt ? Date.parse(ctx.session.endsAt) : start;
  if (start !== null && end !== null && now >= start - 3 * 3_600_000 && now <= end) return null;
  const p = zoneParts(now, ctx.timeZone);
  if (p.hour >= QUIET_HOURS.to && p.hour < QUIET_HOURS.from) return null;
  return new Date(zonedTimeToMs(p.year, p.month, p.day + (p.hour >= QUIET_HOURS.from ? 1 : 0), QUIET_HOURS.to, 0, ctx.timeZone));
}

/* ---------- Quanto falta ---------- */

/**
 * {{falta}}: quanto falta para a sessão desta pessoa, no fuso do webinar, à hora do envio (não do
 * agendamento): «faltam 3 dias», «é amanhã às 20:00», «é hoje às 20:00», «começa daqui a 2 horas»,
 * «começa daqui a 15 minutos», «começa agora», «já começou», «já terminou». Até 6 horas conta em
 * horas, mesmo que passe a meia-noite; depois conta pelos dias do calendário. Sem sessão, vazio.
 */
export function timeLeft(session: SessionTimes | null, now: Date, timeZone = "UTC"): string {
  const start = session?.startsAt ? Date.parse(session.startsAt) : NaN;
  if (Number.isNaN(start)) return "";
  const t = now.getTime();
  if (session?.endsAt && t >= Date.parse(session.endsAt)) return "já terminou";
  if (t >= start) return "já começou";
  const minutes = Math.round((start - t) / 60_000);
  if (minutes < 1) return "começa agora";
  if (minutes < 55) return `começa daqui a ${durationLabel(minutes)}`;
  if (minutes < 6 * 60) return `começa daqui a ${durationLabel(Math.round(minutes / 60) * 60)}`;
  const s = zoneParts(start, timeZone);
  const n = zoneParts(t, timeZone);
  const days = Math.round((Date.UTC(s.year, s.month - 1, s.day) - Date.UTC(n.year, n.month - 1, n.day)) / 86_400_000);
  const at = `${s.hour === 1 ? "à" : "às"} ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
  if (days <= 0) return `é hoje ${at}`;
  if (days === 1) return `é amanhã ${at}`;
  return `faltam ${days} dias`;
}

/* ---------- Mensagens ---------- */

export const MESSAGE_VARIABLES = [
  { key: "nome", label: "Nome completo" },
  { key: "primeiro_nome", label: "Primeiro nome" },
  { key: "email", label: "Email" },
  { key: "webinar", label: "Título do webinar" },
  { key: "data", label: "Data da sessão" },
  { key: "hora", label: "Hora da sessão" },
  { key: "falta", label: "Quanto falta para a sessão da pessoa: «faltam 2 dias», «é amanhã às 20:00», «começa daqui a 2 horas»" },
  { key: "link", label: "Link da sala" },
  { key: "link_oferta", label: "Link da oferta (checkout)" },
  { key: "preco", label: "Preço da oferta" },
  { key: "link_grupo", label: "Link do grupo de WhatsApp" },
  { key: "link_replay", label: "Link do replay" },
  { key: "produto", label: "Produto do pagamento" },
] as const;

type MessageVars = Partial<Record<(typeof MESSAGE_VARIABLES)[number]["key"], string | null>>;

export function renderMessage(template: string | undefined, vars: MessageVars) {
  return (template ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (all, key: string) =>
    key in vars ? (vars[key as keyof typeof vars] ?? "") : all,
  );
}

/** De onde vem cada link (e o {{falta}}): o que falta configurar quando sai vazio. */
const LINK_SOURCE = {
  link: "o endereço da sala do webinar",
  link_oferta: "o link da oferta no webinar",
  link_grupo: "o link do grupo de WhatsApp no Fluxo",
  link_replay: "o replay ligado no webinar",
  falta: "a sessão da pessoa: este gatilho não a traz",
} as const;

/**
 * Os links (e o {{falta}}) que a mensagem usa e que sairiam vazios. Uma mensagem com um botão sem
 * destino, ou com «Olá Ana, !», não sai: o passo falha com o que falta configurar.
 */
export function missingLinks(texts: (string | undefined)[], vars: MessageVars): string[] {
  const used = new Set(texts.flatMap((t) => [...(t ?? "").matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]!)));
  return (Object.keys(LINK_SOURCE) as (keyof typeof LINK_SOURCE)[])
    .filter((key) => used.has(key) && !vars[key]?.trim())
    .map((key) => `{{${key}}} (falta ${LINK_SOURCE[key]})`);
}

/* ---------- Nós do canvas que não se executam ---------- */

export type PageType = "inscricao" | "confirmacao" | "vendas" | "checkout" | "upsell" | "downsell" | "obrigado" | "replay" | "outro";
export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  inscricao: "Inscrição",
  confirmacao: "Obrigado (inscrição)",
  vendas: "Vendas",
  checkout: "Checkout",
  upsell: "Upsell",
  downsell: "Downsell",
  obrigado: "Obrigado (compra)",
  replay: "Replay",
  outro: "Outra",
};
/** Plataformas de tráfego: pagas (Meta, Google, TikTok) e orgânicas. O sítio onde se anuncia escolhe-se ao clicar no nó. */
export const ORIGINS = ["Meta", "Google", "TikTok", "Orgânico", "Email", "Outro"] as const;
export type OriginPlatform = (typeof ORIGINS)[number];
export const ORIGIN_LABEL: Record<OriginPlatform, string> = { Meta: "Meta Ads", Google: "Google Ads", TikTok: "TikTok Ads", Orgânico: "Orgânico", Email: "Email", Outro: "Outro" };
export const ORIGIN_PLACEMENTS: Record<OriginPlatform, string[]> = {
  Meta: ["Facebook", "Instagram", "Facebook e Instagram"],
  Google: ["Pesquisa", "YouTube", "Display"],
  TikTok: ["TikTok"],
  Orgânico: ["Instagram", "YouTube", "TikTok", "Facebook", "LinkedIn", "Indicação"],
  Email: ["Lista própria", "Parceiro"],
  Outro: [],
};
export const PAID_ORIGINS = new Set<string>(["Meta", "Google", "TikTok"]);
/** Origens antigas, guardadas como rede (Facebook, Instagram, YouTube), lêem-se como plataforma + sítio. */
export function originParts(node: { source: string; placement?: string | undefined }): { platform: string; placement?: string } {
  if (node.placement || (ORIGINS as readonly string[]).includes(node.source)) return { platform: node.source, ...(node.placement ? { placement: node.placement } : {}) };
  if (node.source === "Facebook" || node.source === "Instagram") return { platform: "Meta", placement: node.source };
  if (node.source === "YouTube") return { platform: "Google", placement: "YouTube" };
  return { platform: node.source };
}
export function originTitle(node: { source: string; placement?: string | undefined }) {
  const p = originParts(node);
  const platform = ORIGIN_LABEL[p.platform as OriginPlatform] ?? p.platform;
  return p.placement ? `${platform} · ${p.placement}` : platform;
}

export type CanvasNode =
  /** Origem de tráfego: a plataforma (Meta, Google, TikTok, Orgânico…) e, se escolhido, o sítio (Instagram, Pesquisa, YouTube…). */
  | { id: string; kind: "origin"; source: string; placement?: string | undefined; note?: string }
  | { id: string; kind: "page"; name: string; url: string; pageType: PageType }
  /** Grupo de WhatsApp para onde a página de obrigado leva (link de convite). Só representação. */
  | { id: string; kind: "group"; name: string; url: string };
/** Sentido do desenho: a jornada de cima para baixo (como no Sellflux) ou da esquerda para a direita. */
export type Orientation = "vertical" | "horizontal";
export type Canvas = {
  nodes: CanvasNode[];
  positions: Record<string, { x: number; y: number }>;
  /** Por omissão, vertical. */
  orientation?: Orientation | undefined;
};

export function readCanvas(value: unknown): Canvas {
  const v = (value ?? {}) as Partial<Canvas>;
  const known = v.orientation === "vertical" || v.orientation === "horizontal";
  return {
    nodes: Array.isArray(v.nodes) ? v.nodes : [],
    // Fluxos de antes de haver sentido: lêem-se na vertical, e as posições arrastadas (que eram do desenho horizontal) recomeçam.
    positions: known && v.positions && typeof v.positions === "object" ? v.positions : {},
    orientation: v.orientation === "horizontal" ? "horizontal" : "vertical",
  };
}

/**
 * O convite do fluxo: o link do primeiro grupo que o tem. É o {{link_grupo}} das mensagens e o botão
 * do grupo na página de obrigado. Só http(s) (vai parar a um link numa página pública); sem
 * protocolo, ganha https://.
 */
export function groupInvite(canvas: Canvas): string | null {
  for (const node of canvas.nodes) {
    // O canvas vem da base sem validação: um nó estranho não pode partir a página da sala, que lê isto.
    if (node?.kind !== "group" || typeof node.url !== "string" || !node.url.trim()) continue;
    const raw = node.url.trim();
    try {
      const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch {
      /* link inválido: o grupo seguinte */
    }
  }
  return null;
}

export function readSteps(value: unknown): Steps | null {
  const v = value as Partial<Steps> | null;
  if (!v || !Array.isArray(v.nodes)) return null;
  return { start: typeof v.start === "string" ? v.start : null, nodes: v.nodes as StepNode[] };
}

/* ---------- Edição ---------- */

/** O fim do caminho principal: onde entra um passo novo quando nada está escolhido (num ramo, no «Não»). */
export function endOfMain(steps: Steps): { after: string | null; branch?: "yes" | "no" } {
  const map = nodeMap(steps);
  let id = steps.start;
  let last: string | null = null;
  for (let i = 0; id && i < MAX_NODES; i += 1) {
    const n = map.get(id);
    if (!n || n.kind === "branch") return { after: n?.id ?? last, ...(n ? { branch: "no" as const } : {}) };
    last = n.id;
    id = n.next;
  }
  return { after: last };
}

export function newId(steps: Steps, prefix = "p") {
  let i = steps.nodes.length + 1;
  while (steps.nodes.some((n) => n.id === `${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

/** Insere um passo novo depois de `after` (ou no início), mantendo a ligação seguinte. */
export function insertAfter(steps: Steps, after: string | null, node: StepNode, branch: "yes" | "no" = "yes"): Steps {
  const nodes = steps.nodes.map((n) => ({ ...n })) as StepNode[];
  const before = after ? nodes.find((n) => n.id === after) : undefined;
  let continuation: string | null;
  if (!before) {
    continuation = steps.start;
  } else if (before.kind === "branch") {
    continuation = branch === "yes" ? before.yes : before.no;
    if (branch === "yes") before.yes = node.id;
    else before.no = node.id;
  } else {
    continuation = before.next;
    before.next = node.id;
  }
  const inserted = { ...node } as StepNode;
  if (inserted.kind === "branch") inserted.yes = inserted.yes ?? continuation;
  else inserted.next = continuation;
  return { start: before ? steps.start : node.id, nodes: [...nodes, inserted] };
}

/** Retira um passo; quem apontava para ele passa a apontar para o seguinte. */
export function removeNode(steps: Steps, id: string): Steps {
  const node = steps.nodes.find((n) => n.id === id);
  if (!node) return steps;
  const continuation = node.kind === "branch" ? (node.yes ?? node.no) : node.next;
  const relink = (target: string | null) => (target === id ? continuation : target);
  return {
    start: relink(steps.start),
    nodes: steps.nodes
      .filter((n) => n.id !== id)
      .map((n) =>
        n.kind === "branch" ? { ...n, yes: relink(n.yes), no: relink(n.no) } : { ...n, next: relink(n.next) },
      ),
  };
}

/** Liga (ou desliga, com null) a saída de um passo. */
export function connect(steps: Steps, from: string, to: string | null, handle: "next" | "yes" | "no" = "next"): Steps {
  return {
    ...steps,
    nodes: steps.nodes.map((n) => {
      if (n.id !== from) return n;
      if (n.kind === "branch") return handle === "no" ? { ...n, no: to } : { ...n, yes: to };
      return { ...n, next: to };
    }),
  };
}

/** Troca um passo com o anterior (up) ou o seguinte (down) numa sequência sem ramos. */
export function moveNode(steps: Steps, id: string, dir: "up" | "down"): Steps {
  const node = steps.nodes.find((n) => n.id === id);
  if (!node || node.kind === "branch") return steps;
  if (dir === "down") return node.next ? moveNode(steps, node.next, "up") : steps;
  const prev = steps.nodes.find((n) => n.kind !== "branch" && n.next === id);
  if (!prev || prev.kind === "branch") return steps;
  const redirect = (target: string | null) => (target === prev.id ? id : target);
  return {
    start: redirect(steps.start),
    nodes: steps.nodes.map((n) => {
      if (n.id === prev.id) return { ...n, next: node.next } as StepNode;
      if (n.id === id) return { ...n, next: prev.id } as StepNode;
      return n.kind === "branch" ? { ...n, yes: redirect(n.yes), no: redirect(n.no) } : { ...n, next: redirect(n.next) };
    }),
  };
}

/** Passos que já correram (ou onde há execuções paradas): não se apagam, desligam-se. */
export function executedNodes(runs: { cursor: string | null; steps_log: unknown; status: string }[]): Set<string> {
  const ids = new Set<string>();
  for (const run of runs) {
    for (const entry of runLog(run)) ids.add(entry.node);
    if (run.cursor && ["waiting", "ready", "running"].includes(run.status)) ids.add(run.cursor);
  }
  return ids;
}

export function duplicateNode(steps: Steps, id: string): Steps {
  const node = steps.nodes.find((n) => n.id === id);
  if (!node) return steps;
  const copy = { ...structuredClone(node), id: newId(steps) } as StepNode;
  if (copy.kind === "branch") {
    copy.yes = null;
    copy.no = null;
  } else copy.next = null;
  // Logo a seguir ao original (num ramo, no "Sim"), com a continuação dele: o resto do fluxo não muda.
  return insertAfter(steps, id, copy);
}

export function nodeTitle(node: StepNode) {
  if (node.label) return node.label;
  if (node.kind === "wait") return waitLabel(node);
  if (node.kind === "branch") return branchQuestion(node.condition);
  return "Mensagem";
}

/** Os canais que uma automação usa (para saber se pode ser activada). */
export function channelsOf(steps: Steps | null): Channel[] {
  if (!steps) return [];
  return [...new Set(steps.nodes.flatMap((n) => (n.kind === "action" ? n.sends.map((s) => s.channel) : [])))];
}

export type ChannelStatus = { channel: Channel; ready: boolean; simulated: boolean; note: string };

/**
 * Fornecedores disponíveis. O webhook de saída e o WhatsApp não oficial (WAHA, ligado por
 * código QR) têm executor real; email e SMS ficam preparados. Numa conta de teste tudo é
 * simulado e nada sai da plataforma.
 */
export function channelStatus(
  isTest: boolean,
  webhookReady: boolean,
  whatsappReady = false,
): ChannelStatus[] {
  return (Object.keys(CHANNELS) as Channel[]).map((channel) => {
    if (isTest) return { channel, ready: true, simulated: true, note: "Conta de teste: envio simulado" };
    if (channel === "webhook")
      return {
        channel,
        ready: webhookReady,
        simulated: false,
        note: webhookReady ? "Configurado" : "Por configurar em Integrações",
      };
    if (channel === "whatsapp")
      return {
        channel,
        ready: whatsappReady,
        simulated: false,
        note: whatsappReady ? "Número ligado" : "Ligue o número em Integrações › Canais",
      };
    return { channel, ready: false, simulated: false, note: "Sem fornecedor ligado" };
  });
}

/** O que impede activar uma automação: canais sem fornecedor e mensagens por escrever. */
export function activationBlockers(steps: Steps | null, status: ChannelStatus[]): string[] {
  if (!steps) return [];
  const problems: string[] = [];
  const ready = new Map(status.map((s) => [s.channel, s.ready] as const));
  for (const channel of channelsOf(steps))
    if (!ready.get(channel)) problems.push(`${CHANNELS[channel].label}: sem fornecedor configurado`);
  for (const node of steps.nodes) {
    if (node.kind !== "action") continue;
    if (node.sends.length === 0) problems.push(`"${nodeTitle(node)}": sem envios`);
    node.sends.forEach((s) => {
      const missing = sendMissing(s);
      if (missing.length) problems.push(`"${nodeTitle(node)}" · ${sendLabel(s)}: falta ${missing.join(", ")}`);
    });
  }
  return problems;
}

/* ---------- Automação base de um webinar ---------- */

export type BaseAutomation = {
  key: string;
  name: string;
  trigger_event: TriggerEvent;
  conditions: Condition[];
  steps: Steps;
};

const empty = (channel: Channel, target: Target = "contact", extra: Partial<Send> = {}): Send => ({
  channel,
  target,
  ...extra,
});

/** Uma cadeia simples: passos em sequência, ligados pela ordem. */
function chain(nodes: StepNode[]): Steps {
  const linked = nodes.map((n, i) => {
    const next = nodes[i + 1]?.id ?? null;
    return n.kind === "branch" ? n : ({ ...n, next: n.next ?? next } as StepNode);
  });
  return { start: nodes[0]?.id ?? null, nodes: linked };
}

/** Um envio com o texto do modelo do utilizador (docs/automacao/modelo-de-disparo, via base-messages.ts). */
const tpl = (channel: Channel, id: string, target: Target = "contact"): Send => {
  const t = BASE_MESSAGES[id];
  return {
    channel,
    target,
    ...(target === "group" ? { group: "Grupo do lançamento" } : {}),
    ...(channel === "email" && t?.subject ? { subject: t.subject } : {}),
    ...(t?.body ? { message: t.body } : {}),
  };
};
/** [PROPOSTA] Um envio curto nosso, para os momentos que o modelo do utilizador não cobre. */
const short = (channel: Channel, message: string, target: Target = "contact"): Send => ({
  channel,
  target,
  ...(target === "group" ? { group: "Grupo do lançamento" } : {}),
  message,
});
const wait = (id: string, mode: WaitMode, minutes: number, time?: string): WaitNode => ({ id, kind: "wait", mode, minutes, ...(time ? { time } : {}), next: null });
const act = (id: string, label: string, sends: Send[]): ActionNode => ({ id, kind: "action", label, sends, next: null });
const HOUR_BEFORE = "Falta 1 hora para o {{webinar}}. Entre uns minutos antes para garantir o seu lugar: {{link}}";
const MIN_15 = "Começamos em 15 minutos! Entre agora: {{link}}";
const STARTED = "O {{webinar}} já começou e ainda dá tempo de entrar: {{link}}";
const CLICKED = "Vi que você abriu a página da oferta. Ficou alguma dúvida? Responda por aqui que eu ajudo. Para concluir: {{link_oferta}}";
const DAY = 1440;

/**
 * Depois do webinar, quem não comprou entra numa de três automações, conforme o que viu
 * (docs/automacao/mapa-de-automacao, passos 9 e 10 [FONTE]): não acessou, saiu antes do pitch, assistiu o pitch.
 * Oito mensagens cada, nos tempos da proposta do mapa; o fecho fica no 4.º dia [PROPOSTA].
 * A compra faz deixar de cumprir a entrada, e o resto não sai. Sem modelo do utilizador, a mensagem nasce por escrever.
 */
const FOLLOW_UP_WAITS: [minutes: number, time?: string][] = [[60], [DAY, "09:00"], [DAY, "20:00"], [2 * DAY, "09:00"], [2 * DAY, "20:00"], [3 * DAY, "09:00"], [4 * DAY, "09:00"], [4 * DAY, "20:00"]];
type FollowUpMessage = [label: string, sends: Send[]];
const draft = (label: string): FollowUpMessage => [label, [empty("email")]];
function followUp(key: string, name: string, segment: Condition[], messages: [FollowUpMessage, FollowUpMessage, FollowUpMessage, FollowUpMessage, FollowUpMessage, FollowUpMessage]): BaseAutomation {
  const closing: FollowUpMessage[] = [
    ["Encerra hoje", [tpl("email", "l_email_encerra_hoje"), tpl("whatsapp", "l_wpp_encerra_hoje")]],
    ["Última chamada", [tpl("email", "l_email_ultima_chamada"), tpl("whatsapp", "l_wpp_ultima_chamada")]],
  ];
  const nodes = [...messages, ...closing].flatMap(([label, sends], i): StepNode[] => {
    const [minutes, time] = FOLLOW_UP_WAITS[i]!;
    return [wait(`p${2 * i + 1}`, "after_session", minutes, time), act(`p${2 * i + 2}`, label, sends)];
  });
  return { key, name, trigger_event: "webinar_session_ended", conditions: [...segment, { fact: "purchased", value: false }], steps: chain(nodes) };
}

/**
 * As automações prontas de um fluxo, pela ordem do lançamento do utilizador (docs/automacao):
 * obrigado e pesquisa, convite para o grupo, faltam 7 e 4 dias, amanhã, hoje, 1 hora, 15 minutos,
 * ao vivo, as três automações de quem não comprou, carrinho, pagamento, boas-vindas.
 * Nascem desligadas, com os textos dos modelos; o que o motor não preenche vai entre parênteses rectos.
 */
export function baseWorkflow(): BaseAutomation[] {
  return [
    {
      key: "aquecimento",
      name: "Aquecimento",
      trigger_event: "webinar_registered",
      conditions: [],
      steps: chain([
        act("p1", "Obrigado e pesquisa", [tpl("email", "ppl_email_inscricao_pesquisa")]),
        wait("p2", "delay", DAY),
        act("p3", "Convite para o grupo", [tpl("email", "ppl_email_grupo_whatsapp")]),
      ]),
    },
    {
      key: "lembretes",
      name: "Lembretes",
      trigger_event: "webinar_registered",
      conditions: [],
      steps: chain([
        wait("p1", "before_session", 7 * DAY, "09:00"),
        act("p2", "Faltam 7 dias", [tpl("email", "ppl_email_faltam_7"), tpl("whatsapp", "ppl_wpp_faltam_7")]),
        wait("p3", "before_session", 4 * DAY, "09:00"),
        act("p4", "Faltam 4 dias", [tpl("email", "ppl_email_faltam_4"), tpl("whatsapp", "ppl_wpp_faltam_4")]),
        wait("p5", "before_session", DAY, "09:00"),
        act("p6", "É amanhã", [tpl("email", "ppl_email_amanha"), tpl("whatsapp", "ppl_wpp_amanha")]),
        wait("p7", "before_session", 0, "09:00"),
        act("p8", "É hoje", [tpl("email", "pl_email_hoje"), tpl("whatsapp", "pl_wpp_hoje")]),
        wait("p9", "before_session", 60),
        act("p10", "Falta 1 hora", [short("whatsapp", HOUR_BEFORE), short("sms", HOUR_BEFORE)]),
        wait("p11", "before_session", 15),
        act("p12", "Faltam 15 minutos", [short("whatsapp", MIN_15), short("whatsapp", MIN_15, "group")]),
      ]),
    },
    {
      key: "sessao",
      name: "Sessão começou",
      trigger_event: "webinar_session_started",
      conditions: [],
      steps: {
        start: "p1",
        nodes: [
          { ...act("p1", "Estamos ao vivo", [tpl("email", "pl_email_ao_vivo"), tpl("whatsapp", "pl_wpp_ao_vivo"), tpl("whatsapp", "pl_wpp_ao_vivo", "group")]), next: "p2" },
          { ...wait("p2", "delay", 10), next: "p3" },
          { id: "p3", kind: "branch", label: "Entrou?", condition: { fact: "entered", value: true }, yes: null, no: "p4" },
          act("p4", "Já começou, entre agora", [short("whatsapp", STARTED), short("sms", STARTED)]),
        ],
      },
    },
    {
      key: "clicou",
      name: "Clicou e não comprou",
      trigger_event: "offer_clicked",
      conditions: [],
      steps: {
        start: "p1",
        nodes: [
          { ...wait("p1", "delay", 30), next: "p2" },
          { id: "p2", kind: "branch", label: "Comprou?", condition: { fact: "purchased", value: true }, yes: null, no: "p3" },
          act("p3", "Ajuda para comprar", [short("whatsapp", CLICKED)]),
        ],
      },
    },
    followUp("nao-acessou", "Não acessou", [{ fact: "entered", value: false }], [
      ["Gravação disponível", [tpl("email", "l_email_replay"), tpl("whatsapp", "l_wpp_replay_1")]],
      ["Gravação: o que você perdeu", [tpl("whatsapp", "l_wpp_replay_2")]],
      ["Principais pontos da aula", [tpl("email", "l_email_so_o_file"), tpl("whatsapp", "l_wpp_so_o_file_1")]],
      draft("Apresentação da oferta"),
      draft("Prova: resultados de alunos"),
      draft("Garantia"),
    ]),
    followUp("saiu-antes", "Saiu antes do pitch", [{ fact: "entered", value: true }, { fact: "reached_offer", value: false }], [
      draft("Você saiu antes da melhor parte"),
      ["Gravação a partir do pitch", [tpl("email", "l_email_replay"), tpl("whatsapp", "l_wpp_replay_1")]],
      draft("Apresentação da oferta"),
      draft("Bônus"),
      draft("Prova: resultados de alunos"),
      draft("Garantia"),
    ]),
    followUp("assistiu", "Assistiu o pitch", [{ fact: "entered", value: true }, { fact: "reached_offer", value: true }], [
      draft("Resumo da oferta e link de compra"),
      draft("Objeção 1"),
      draft("Objeção 2"),
      draft("Objeção 3"),
      draft("Bônus"),
      draft("Garantia"),
    ]),
    {
      // Começou a pagar e, 15 minutos depois, ainda não comprou (modelo do utilizador).
      key: "abandono",
      name: "Checkout abandonado",
      trigger_event: "checkout_started",
      conditions: [],
      steps: {
        start: "p1",
        nodes: [
          { ...wait("p1", "delay", 15), next: "p2" },
          { id: "p2", kind: "branch", label: "Comprou?", condition: { fact: "purchased", value: true }, yes: null, no: "p3" },
          ...chain([
            act("p3", "Posso ajudar a concluir?", [tpl("whatsapp", "rec_wpp_carrinho_abandonado")]),
            wait("p4", "delay", 45),
            act("p5", "Operação em aberto", [tpl("email", "rec_email_carrinho_abandonado_1")]),
            wait("p6", "delay", 23 * 60),
            act("p7", "Precisa de ajuda?", [tpl("email", "rec_email_carrinho_abandonado_2")]),
          ]).nodes,
        ],
      },
    },
    {
      key: "falha",
      name: "Pagamento falhou",
      trigger_event: "payment_failed",
      conditions: [],
      steps: {
        start: "p1",
        nodes: [
          { id: "p1", kind: "branch", label: "Comprou?", condition: { fact: "purchased", value: true }, yes: null, no: "p2" },
          act("p2", "Outra forma de pagar", [tpl("email", "rec_email_pagamento_recusado_1")]),
        ],
      },
    },
    {
      key: "pos-compra",
      name: "Pós-compra",
      trigger_event: "purchase_approved",
      conditions: [],
      steps: {
        start: "p1",
        nodes: [
          { ...act("p1", "Boas-vindas", [tpl("email", "pos_email_compra_aprovada_1")]), next: "p2" },
          { ...wait("p2", "delay", 5), next: "p3" },
          { ...act("p3", "Matrícula concluída", [tpl("whatsapp", "pos_wpp_compra_aprovada")]), next: "p4" },
          { ...wait("p4", "delay", 2 * DAY), next: "p5" },
          // Reembolsou entretanto? Então já não comprou: o upsell não sai.
          { id: "p5", kind: "branch", label: "Continua cliente?", condition: { fact: "purchased", value: true }, yes: "p6", no: null },
          act("p6", "Upsell", [empty("email")]),
        ],
      },
    },
    {
      key: "reembolso",
      name: "Reembolso",
      trigger_event: "purchase_refunded",
      conditions: [],
      steps: chain([{ id: "p1", kind: "action", label: "Avisar a equipa", sends: [empty("webhook", "webhook")], next: null }]),
    },
  ];
}

/* ---------- O modelo: o fluxo nasce vazio e só o recebe com «Usar modelo» ---------- */

/** As automações do modelo arrumadas como no menu do fluxo. */
export const MODEL_GROUPS: { key: string; title: string; keys: string[] }[] = [
  { key: "aquecimento", title: "Mensagens de aquecimento", keys: ["aquecimento", "lembretes", "sessao"] },
  { key: "recuperacao", title: "Mensagens de recuperação", keys: ["nao-acessou", "saiu-antes", "assistiu", "clicou", "abandono", "falha"] },
  { key: "clientes", title: "Depois da compra", keys: ["pos-compra", "reembolso"] },
];

/** O nome do grupo que o modelo usa quando o fluxo ainda não tem grupos. */
export const MODEL_GROUP = "Grupo do lançamento";

/**
 * Um disparo para o grupo passa a um por grupo (a mesma mensagem em todos, como no mapa); os outros ficam.
 * Devolve os disparos de cada mensagem: quando não cabem numa só (6, também na base de dados), os dos grupos
 * passam para mensagens só deles, de 6 em 6. Nenhum grupo fica sem a sua.
 */
export function toGroups(sends: Send[], groups: string[]): Send[][] {
  const all = groups.length ? sends.flatMap((s) => (s.target === "group" ? groups.map((group) => ({ ...s, group })) : [s])) : sends;
  if (all.length <= MAX_SENDS) return [all];
  const own = all.filter((s) => s.target !== "group");
  const toGroup = all.filter((s) => s.target === "group");
  const chunks = Array.from({ length: Math.ceil(toGroup.length / MAX_SENDS) }, (_, i) => toGroup.slice(i * MAX_SENDS, (i + 1) * MAX_SENDS));
  return own.length ? [own, ...chunks] : chunks;
}

/** Uma mensagem do modelo com os grupos do fluxo: a original e, se for preciso, as dos grupos logo a seguir, sem espera. */
function withGroups(node: ActionNode, groups: string[]): ActionNode[] {
  const [first = [], ...more] = toGroups(node.sends, groups);
  const ids = more.map((_, i) => `${node.id}g${i + 1}`);
  return [
    { ...node, sends: first, next: ids[0] ?? node.next },
    ...more.map((sends, i): ActionNode => ({
      id: ids[i]!,
      kind: "action",
      label: `${nodeTitle(node)} · grupos${more.length > 1 ? ` ${i + 1}` : ""}`,
      sends,
      next: ids[i + 1] ?? node.next,
    })),
  ];
}

/** As automações do modelo escolhidas, com as mensagens de grupo para os grupos do fluxo. */
export function modelAutomations(keys: string[], groups: string[]): BaseAutomation[] {
  return baseWorkflow()
    .filter((a) => keys.includes(a.key))
    .map((a) => ({ ...a, steps: { ...a.steps, nodes: a.steps.nodes.flatMap((n): StepNode[] => (n.kind === "action" ? withGroups(n, groups) : [n])) } }));
}

/** JSON com as chaves por ordem: o jsonb da base não guarda a ordem em que foram escritas. */
const canon = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
/** Os passos sem os nomes dos grupos: um grupo renomeado ou repetido para cada grupo do fluxo não é uma mudança do cliente. */
const withoutGroups = (steps: unknown) => {
  const s = readSteps(steps);
  if (!s) return null;
  const nodes = s.nodes.map((n) => (n.kind === "action" ? { ...n, sends: [...new Set(n.sends.map(({ group: _, ...rest }) => canon(rest)))] } : n));
  return canon({ ...s, nodes });
};

/**
 * Uma automação do modelo tal como entrou (nome, gatilho, condições e passos iguais aos do modelo), para
 * «Começar vazio» a poder tirar de um fluxo antigo. Se está ligada ou já correu, decide quem a chama.
 */
export function isModelAsIs(a: { name: string; trigger_event: string; conditions: unknown; steps: unknown }) {
  const model = baseWorkflow().find((b) => b.name === a.name && b.trigger_event === a.trigger_event);
  return Boolean(model && canon(model.conditions) === canon(a.conditions ?? []) && withoutGroups(model.steps) === withoutGroups(a.steps));
}

/**
 * O grupo mudou de nome no fluxo: as mensagens que iam para ele passam a usar o nome novo (o motor procura o grupo
 * pelo nome no WhatsApp). null quando a automação não escreve para esse grupo.
 */
export function renameGroupIn(steps: Steps | null, from: string, to: string): Steps | null {
  const hit = (s: Send) => s.target === "group" && s.group === from;
  if (!steps || from === to || !steps.nodes.some((n) => n.kind === "action" && n.sends.some(hit))) return null;
  return { ...steps, nodes: steps.nodes.map((n) => (n.kind === "action" ? { ...n, sends: n.sends.map((s) => (hit(s) ? { ...s, group: to } : s)) } : n)) };
}

/** Se a automação escreve para um grupo (para o modelo pôr um grupo no fluxo, quando ainda não há). */
export const usesGroup = (steps: Steps) => steps.nodes.some((n) => n.kind === "action" && n.sends.some((s) => s.target === "group"));

/* ---------- Posição de uma pessoa no workflow ---------- */

export type RunLike = {
  status: string;
  cursor: string | null;
  scheduled_for: string;
  steps_log: unknown;
  automations?: { name: string; trigger_event: string; steps: unknown } | null;
};

export function runLog(run: { steps_log: unknown }): LogEntry[] {
  return Array.isArray(run.steps_log) ? (run.steps_log as LogEntry[]) : [];
}

/** A próxima mensagem de uma execução em curso: o que sai e quando. */
export function nextAction(run: RunLike): { label: string; channels: string; at: string } | null {
  if (!["waiting", "ready", "running"].includes(run.status)) return null;
  const steps = readSteps(run.automations?.steps);
  if (!steps) return null;
  const map = nodeMap(steps);
  // O cursor aponta para a próxima mensagem, ou para o passo depois de uma espera.
  let id = run.cursor ?? steps.start;
  for (let i = 0; id && i < MAX_NODES; i += 1) {
    const node = map.get(id);
    if (!node) return null;
    if (node.kind === "action")
      return {
        label: nodeTitle(node),
        channels: node.sends.map(sendLabel).join(", ") || "sem envios",
        at: run.scheduled_for,
      };
    if (node.kind === "branch") return { label: branchQuestion(node.condition), channels: "decisão", at: run.scheduled_for };
    id = node.next;
  }
  return null;
}

export function triggerTitle(trigger: string) {
  return TRIGGER_LABEL[trigger as TriggerEvent] ?? trigger;
}
