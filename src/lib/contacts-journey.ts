/**
 * A jornada de um contacto por lançamento, para a ficha dos Contactos: em que
 * webinars esteve, de onde veio para cada um, o que viu, o que comprou e de que
 * falou. Só junta o que as consultas que já existem devolvem (useContactDetail,
 * useContactContext, useContactConversations); não lê a base nem inventa números.
 */
import {
  contactInsight,
  sourceLabel,
  STAGES,
  type ContactInsight,
  type ContactSummary,
  type JourneyStep,
  type Stage,
  type TimelineItem,
} from "@/lib/contacts";
import type { SourceRow, StageCounts } from "@/lib/data";
import { customerLabel, formatMoney, type CommercialContext, type WebinarParticipation } from "@/lib/support/context";
import { intentLabel } from "@/lib/support/model";

export type Tone = "success" | "destructive" | "warning" | "info" | "secondary" | "outline";

/* ---------- Origem de uma inscrição ---------- */

export type OriginRow = {
  id: string;
  webinar_id: string;
  joined_at: string;
  registration_source: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  referrer: string | null;
};

const VIA: Record<string, string> = {
  room: "Página do webinar",
  embed: "Formulário noutro site",
  api: "Integração",
};

/** «Instagram · lancamento-out», o site que a trouxe, ou «Directo». */
export function originText(o: Pick<OriginRow, "utm_source" | "utm_campaign" | "referrer">) {
  let host: string | null = null;
  try {
    host = o.referrer ? new URL(o.referrer).hostname.replace(/^www\./, "") : null;
  } catch {
    host = o.referrer;
  }
  const source = o.utm_source ? sourceLabel(o.utm_source) : null;
  // Sem UTM, a origem é o site; com UTM, o site só repete o que a origem já diz.
  return [source, o.utm_campaign, source ? null : host].filter(Boolean).join(" · ") || "Directo";
}

/* ---------- Cada lançamento em que a pessoa esteve ---------- */

export type LaunchCard = {
  /** A inscrição (participant_id): uma por webinar. */
  id: string;
  webinarId: string;
  title: string;
  at: string;
  mode: "live" | "replay";
  attended: boolean;
  watchedSeconds: number;
  /** 0–100, ou null sem duração conhecida. */
  watchedPct: number | null;
  peakSeconds: number;
  durationSeconds: number;
  /** A parte do vídeo que viu e onde começa a oferta, em % (null sem duração ou sem presença). */
  bar: { from: number; to: number; offerAt: number | null } | null;
  outcome: { label: string; tone: Tone };
  origin: string | null;
  via: string | null;
  reachedOffer: boolean;
  clicked: boolean;
  clickedAtSecond: number | null;
  messages: number;
};

/** O desfecho de uma inscrição, do mais forte para o mais fraco. */
export function launchOutcome(
  w: Pick<
    WebinarParticipation,
    | "purchased"
    | "refunded"
    | "paymentFailed"
    | "checkoutAbandoned"
    | "checkout"
    | "clicked"
    | "reachedOffer"
    | "attended"
    | "watchedSeconds"
  >,
): { label: string; tone: Tone } {
  if (w.purchased) return { label: "Comprou", tone: "success" };
  if (w.refunded) return { label: "Reembolsado", tone: "outline" };
  if (w.paymentFailed) return { label: "Pagamento falhou", tone: "destructive" };
  if (w.checkoutAbandoned) return { label: "Abandonou o pagamento", tone: "warning" };
  if (w.checkout) return { label: "Iniciou o pagamento", tone: "warning" };
  if (w.clicked) return { label: "Clicou na oferta", tone: "info" };
  if (w.reachedOffer) return { label: "Viu a oferta", tone: "info" };
  if (w.attended) return { label: "Assistiu", tone: "secondary" };
  if (w.watchedSeconds > 0) return { label: "Entrou e saiu", tone: "outline" };
  return { label: "Não apareceu", tone: "outline" };
}

const pct = (seconds: number, duration: number) =>
  Math.max(0, Math.min(100, Math.round((seconds / duration) * 100)));

export function launchCards(
  participations: WebinarParticipation[],
  steps: JourneyStep[],
  origins: OriginRow[],
): LaunchCard[] {
  return participations
    .map((w): LaunchCard => {
      const step = steps.find(
        (s): s is Extract<JourneyStep, { kind: "event" }> => s.kind === "event" && s.id === w.participantId,
      );
      const origin = origins.find((o) => o.id === w.participantId);
      const duration = step?.durationSeconds ?? 0;
      return {
        id: w.participantId,
        webinarId: w.webinarId,
        title: w.title,
        at: w.at,
        mode: step?.mode === "replay" ? "replay" : "live",
        attended: w.attended,
        watchedSeconds: w.watchedSeconds,
        watchedPct: w.watchedPct,
        peakSeconds: step?.peakSeconds ?? 0,
        durationSeconds: duration,
        bar:
          step && duration > 0 && (w.attended || w.watchedSeconds > 0)
            ? {
                from: pct(step.entrySeconds, duration),
                to: Math.max(pct(step.entrySeconds, duration), pct(step.peakSeconds, duration)),
                offerAt: step.offerAtPct,
              }
            : null,
        outcome: launchOutcome(w),
        origin: origin ? originText(origin) : null,
        via: origin ? (VIA[origin.registration_source ?? "room"] ?? VIA["room"]!) : null,
        reachedOffer: w.reachedOffer,
        clicked: w.clicked,
        clickedAtSecond: step?.clickedAtSecond ?? null,
        messages: w.messages,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------- O percurso numa linha ---------- */

export type PathStep = {
  key: "registered" | "watched" | "offer" | "clicked" | "checkout" | "bought";
  state: "done" | "bad" | "todo";
};

/** Inscreveu-se → assistiu → oferta → clique → pagamento → compra. */
export function journeyPath(c: ContactSummary): PathStep[] {
  const registered = (c.events_registered ?? 0) > 0;
  const attended = (c.events_attended ?? 0) > 0;
  const bought = (c.purchases ?? 0) > 0;
  return [
    { key: "registered", state: registered ? "done" : "todo" },
    { key: "watched", state: attended ? "done" : registered ? "bad" : "todo" },
    { key: "offer", state: c.reached_offer || c.clicked_offer ? "done" : "todo" },
    { key: "clicked", state: c.clicked_offer ? "done" : "todo" },
    { key: "checkout", state: c.checkout_started || bought ? "done" : "todo" },
    { key: "bought", state: bought ? "done" : c.payment_failed || c.checkout_abandoned ? "bad" : "todo" },
  ];
}

/* ---------- Tema das conversas ---------- */

/** O tema da conversa mais recente com caso (Pagamento, Acesso…), ou null. */
export function latestTheme(cases: { intent: string | null; created_at: string }[]): string | null {
  const last = [...cases].filter((c) => c.intent).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return last?.intent ?? null;
}

/** As pessoas agrupadas pelo tema das conversas, do tema com mais gente para o com menos. */
export function themeGroups(rows: { contact_id: string | null; intent: string | null }[]) {
  const groups = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.contact_id || !r.intent) continue;
    groups.set(r.intent, (groups.get(r.intent) ?? new Set()).add(r.contact_id));
  }
  return [...groups]
    .map(([id, people]) => ({ id, label: intentLabel(id), contactIds: [...people] }))
    .sort((a, b) => b.contactIds.length - a.contactIds.length || a.label.localeCompare(b.label));
}

/* ---------- Filtros locais (exemplo e temas, onde a lista não vem paginada da base) ---------- */

export function stageCountsOf(rows: ContactSummary[]): StageCounts {
  const counts = Object.fromEntries(
    [...STAGES.map((s) => s.id), "all", "returning"].map((k) => [k, 0]),
  ) as StageCounts;
  for (const c of rows) {
    counts.all += 1;
    counts[contactInsight(c).stage] += 1;
    if ((c.events_attended ?? 0) >= 2) counts.returning += 1;
  }
  return counts;
}

const fold = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function filterContacts(
  rows: ContactSummary[],
  f: { stage: string | null; search: string; country?: string | null | undefined },
) {
  const term = fold(f.search.trim());
  return rows.filter((c) => {
    if (f.country && c.country_code !== f.country) return false;
    if (f.stage === "returning" && (c.events_attended ?? 0) < 2) return false;
    if (f.stage && f.stage !== "returning" && contactInsight(c).stage !== f.stage) return false;
    if (!term) return true;
    return [c.name, c.email, c.phone].some((v) => fold(v).includes(term));
  });
}

/** As origens com o que cada uma deu, com as regras de `contact_source_breakdown` (0064), para quando a lista é local. */
export function sourceRowsOf(rows: ContactSummary[]): SourceRow[] {
  const bySource = new Map<string, SourceRow>();
  for (const c of rows) {
    const source = c.first_source || "direto";
    const r = bySource.get(source) ?? {
      source,
      contacts: 0,
      attended: 0,
      reached_offer: 0,
      clicked: 0,
      checkout: 0,
      customers: 0,
    };
    r.contacts += 1;
    if ((c.events_attended ?? 0) > 0) r.attended += 1;
    if (c.reached_offer || c.clicked_offer || c.checkout_started) r.reached_offer += 1;
    if (c.clicked_offer) r.clicked += 1;
    if (c.checkout_started) r.checkout += 1;
    if ((c.purchases ?? 0) > 0) r.customers += 1;
    bySource.set(source, r);
  }
  return [...bySource.values()].sort((a, b) => b.contacts - a.contacts);
}

/** O lançamento mais recente da pessoa e quantos mais: «Fórmula Digital +1». */
export function launchLabel(ids: string[] | null | undefined, titleOf: (id: string) => string | undefined) {
  const last = ids?.at(-1);
  const title = last ? titleOf(last) : undefined;
  if (!title) return null;
  return ids!.length > 1 ? `${title} +${ids!.length - 1}` : title;
}

/* ---------- A ficha inteira ---------- */

export type ContactFile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  place: string | null;
  device: string | null;
  since: string | null;
  lastSeen: string | null;
  contact: ContactSummary;
  insight: ContactInsight;
  stage: Stage;
  /** «Cliente · 1 compra» ou «Ainda não comprou». */
  customer: string;
  /** O tema da última conversa (Pagamento, Acesso…), quando houve conversa com caso. */
  theme: string | null;
  firstOrigin: string;
  path: PathStep[];
  launches: LaunchCard[];
  purchases: { id: string; title: string; amount: string; status: string; at: string }[];
  totalPaid: string | null;
  conversations: { id: string; at: string; title: string; preview: string | null; cases: string[] }[];
  activity: { id: string; at: string; label: string; detail: string | null }[];
};

export type FileInput = {
  contact: ContactSummary;
  context: Pick<CommercialContext, "webinars" | "purchases" | "spent" | "approvedPurchases" | "cases"> | null;
  steps: JourneyStep[];
  origins: OriginRow[];
  timeline: TimelineItem[];
  titles: Map<string | null, string | null>;
  talks: { id: string; at: string; title: string; preview: string | null; cases: string[] }[];
  place: string;
  device: string;
};

export function contactFile(input: FileInput): ContactFile {
  const c = input.contact;
  const insight = contactInsight(c);
  const ctx = input.context;
  const theme = latestTheme(ctx?.cases ?? []);
  return {
    id: c.id ?? "",
    name: c.name || c.email || c.phone || "Sem nome",
    email: c.email && !c.email.endsWith("@sala.local") ? c.email : null,
    phone: c.phone,
    place: input.place || null,
    device: input.device || null,
    since: c.created_at,
    lastSeen: c.last_seen_at,
    contact: c,
    insight,
    stage: insight.stage,
    customer: ctx ? customerLabel(ctx as CommercialContext) : (c.purchases ?? 0) > 0 ? "Cliente" : "Ainda não comprou",
    theme: theme ? intentLabel(theme) : null,
    firstOrigin: sourceLabel(c.first_source) + (c.first_campaign ? ` · ${c.first_campaign}` : ""),
    path: journeyPath(c),
    launches: launchCards(ctx?.webinars ?? [], input.steps, input.origins),
    purchases: ctx?.purchases ?? [],
    totalPaid: ctx?.spent.length ? ctx.spent.map((s) => formatMoney(s.total, s.currency)).join(" + ") : null,
    conversations: input.talks,
    activity: input.timeline.slice(0, 30).map((t, i) => ({
      id: `${t.name}-${t.at}-${i}`,
      at: t.at,
      label: t.times > 1 ? `${t.label} (${t.times}×)` : t.label,
      // O produto e o lançamento juntos, sem repetir quando têm o mesmo nome.
      detail: [...new Set([t.detail, t.webinarId ? input.titles.get(t.webinarId) : null])].filter(Boolean).join(" · ") || null,
    })),
  };
}

/** O que fazer com cada etapa, dito em linguagem de quem vende. */
export const STAGE_ADVICE: Record<string, string> = {
  checkout:
    "Iniciaram o pagamento e não concluíram: são as pessoas mais perto de comprar. Fale com elas no próprio dia; se o pagamento falhou, ofereça outra forma de pagar.",
  clicked:
    "Clicaram na oferta e não iniciaram o pagamento. Normalmente falta uma resposta sobre preço, garantia ou prazo.",
  reached_offer:
    "Ficaram até à oferta mas não clicaram. Falta uma resposta a uma objecção ou um motivo para decidir agora.",
  watched: "Saíram antes da oferta. O replay a partir do ponto em que saíram traz uma parte delas de volta.",
  no_show: "Inscreveram-se e não apareceram. Um lembrete com o replay nas primeiras 24 horas recupera muitas.",
  new: "Ainda não participaram em nenhum evento. Convide-as para o próximo webinar.",
  customer: "Já compraram. São quem melhor pode dar um testemunho ou comprar a próxima oferta.",
  returning: "Voltaram a dois ou mais eventos: há interesse repetido, mesmo que ainda não tenham clicado.",
};
