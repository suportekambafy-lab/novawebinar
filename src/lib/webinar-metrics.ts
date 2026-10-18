import { supabase } from "@/integrations/supabase/client";
import { NOT_TEST_ROOM } from "@/lib/test-room";
import { fetchAll } from "@/lib/fetch-all";
import type { DateRange } from "@/lib/date-range";
import { clockLabel } from "@/lib/engagement-analysis";
import {
  buildDropOff,
  buildRetention,
  factsDuration,
  funnelSummary,
  type DropOffPoint,
  type ParticipantFact,
} from "@/lib/participant-facts";

export { clockLabel };
export type { DropOffPoint };

/** Uma participação, lida dos factos: tempo visto, posição e presença canónicos. */
export type MetricsParticipant = Pick<
  ParticipantFact,
  | "participant_id"
  | "person_id"
  | "contact_id"
  | "webinar_id"
  | "name"
  | "email"
  | "phone"
  | "joined_at"
  | "viewing_mode"
  | "attended"
  | "actual_watch_seconds"
  | "watch_measured"
  | "entry_seconds"
  | "peak_seconds"
  | "reached_pitch"
  | "reached_offer"
  | "duration_seconds"
  | "saw_offer"
  | "clicked"
  | "checkout_started"
  | "purchased"
  | "payment_failed"
  | "checkout_abandoned"
  | "refunded"
  | "webinar_session_id"
>;

const PARTICIPANT_COLUMNS =
  "participant_id, person_id, contact_id, webinar_id, name, email, phone, joined_at, viewing_mode, attended, actual_watch_seconds, watch_measured, entry_seconds, peak_seconds, reached_pitch, reached_offer, duration_seconds, saw_offer, clicked, checkout_started, purchased, payment_failed, checkout_abandoned, refunded, webinar_session_id";

export type WebinarMetrics = {
  participants: MetricsParticipant[];
  /** Pessoas inscritas (cada pessoa conta uma vez). */
  registered: number;
  attended: number;
  attendedLive: number;
  attendedReplay: number;
  reachedPitch: number;
  /** Funil da oferta: pessoas que assistiram, uma vez cada. */
  sawOffer: number;
  clicked: number;
  checkout: number;
  buyers: number;
  paymentFailed: number;
  abandoned: number;
  /** Compraram e foram reembolsados: não contam como compras. */
  refunded: number;
  /** Compraram ÷ assistiram, em percentagem. */
  conversion: number;
  /** Pagamentos aprovados das pessoas deste período, somados por moeda. */
  revenue: { currency: string; amount: number }[];
  approvedPayments: number;
  chatAuthors: number;
  chatMessages: number;
  durationSeconds: number;
  retention: { second: number; label: string; viewers: number }[];
  dropOff: DropOffPoint[];
  /** Tempo visto médio de quem assistiu. */
  averageWatchSeconds: number;
  milestones: { label: string; value: number }[];
  chatParticipantIds: string[];
  teamChatParticipantIds: string[];
};

export type WebinarInsight = {
  tone: "alerta" | "atencao" | "bom";
  title: string;
  detail: string;
};

/** Leitura em linguagem simples dos pontos de saída, para o vendedor agir. */
export function buildInsights(
  metrics: Pick<
    WebinarMetrics,
    "dropOff" | "attended" | "durationSeconds" | "averageWatchSeconds" | "sawOffer" | "clicked"
  >,
  options: { pitchSeconds?: number | null; ctaStartSeconds?: number | null } = {},
): WebinarInsight[] {
  const insights: WebinarInsight[] = [];
  // A curva e as saídas contam só quem assistiu; as percentagens também.
  const { dropOff, attended, durationSeconds, averageWatchSeconds } = metrics;
  if (!attended) return insights;

  const ranked = [...dropOff].filter((p) => p.exits > 0).sort((a, b) => b.exits - a.exits);
  const top = ranked[0];
  if (top) {
    insights.push({
      tone: top.rate >= 25 ? "alerta" : "atencao",
      title: `Maior saída entre ${top.range}`,
      detail: `${top.exits} de ${top.watching} pessoas que ainda estavam na sala saíram aqui (${top.rate.toFixed(0)}%). Reveja o que diz neste trecho: costuma ser onde o ritmo cai ou a promessa fica confusa.`,
    });
  }

  const firstMinutes = dropOff.filter((p) => p.second < 300);
  const earlyExits = firstMinutes.reduce((sum, p) => sum + p.exits, 0);
  if (earlyExits) {
    const share = (earlyExits / attended) * 100;
    insights.push({
      tone: share >= 30 ? "alerta" : share >= 15 ? "atencao" : "bom",
      title: `${share.toFixed(0)}% de quem assistiu sai nos primeiros 5 minutos`,
      detail:
        share >= 15
          ? "A abertura não está a prender. Diga logo no primeiro minuto o que a pessoa vai levar do webinar e quando chega a parte prática."
          : "A abertura está a segurar bem a audiência — mantenha este arranque.",
    });
  }

  const pitch = options.pitchSeconds ?? options.ctaStartSeconds ?? null;
  if (pitch !== null && pitch > 0) {
    const before = dropOff.filter((p) => p.endSecond > pitch - 300 && p.second < pitch);
    const exitsBefore = before.reduce((sum, p) => sum + p.exits, 0);
    if (exitsBefore) {
      const share = (exitsBefore / attended) * 100;
      insights.push({
        tone: share >= 15 ? "alerta" : "atencao",
        title: `${exitsBefore} pessoas saem nos 5 minutos antes do pitch (${clockLabel(pitch)})`,
        detail:
          "Antecipe a oferta com uma promessa clara ('já a seguir mostro como aplicar') para que cheguem ao pitch.",
      });
    }
    const afterPitch = dropOff
      .filter((p) => p.second >= pitch)
      .reduce((sum, p) => sum + p.exits, 0);
    if (afterPitch) {
      insights.push({
        tone: "atencao",
        title: `${afterPitch} saídas durante a oferta`,
        detail: `Só ${metrics.clicked} clicaram de ${metrics.sawOffer} que viram a oferta. Teste reforçar preço, garantia e prazo logo nos primeiros minutos do pitch.`,
      });
    }
  }

  const retentionShare = durationSeconds ? (averageWatchSeconds / durationSeconds) * 100 : 0;
  insights.push({
    tone: retentionShare >= 50 ? "bom" : retentionShare >= 30 ? "atencao" : "alerta",
    title: `Tempo médio assistido: ${clockLabel(Math.round(averageWatchSeconds))} (${retentionShare.toFixed(0)}% do webinar)`,
    detail:
      retentionShare >= 50
        ? "Retenção saudável. Concentre-se em melhorar o momento de maior saída."
        : "Retenção abaixo do ideal. Corte partes longas e traga um momento de valor a cada 10 minutos.",
  });

  return insights;
}

export async function fetchWebinarMetrics(
  organizationId: string,
  webinarId: string,
  durationSeconds: number,
  range?: DateRange,
): Promise<WebinarMetrics> {
  const period = <
    T extends { gte: (col: string, val: string) => T; lt: (col: string, val: string) => T },
  >(
    q: T,
    column: string,
  ) => (range ? q.gte(column, range.from).lt(column, range.to) : q);

  const [participantRows, messageRows, purchaseRows] = await Promise.all([
    fetchAll((from, to) =>
      period(
        supabase
          .from("participant_facts")
          .select(PARTICIPANT_COLUMNS, { count: "exact" })
          .eq("organization_id", organizationId)
          .eq("webinar_id", webinarId)
          .or(NOT_TEST_ROOM),
        "joined_at",
      )
        .order("joined_at", { ascending: false })
        .order("participant_id")
        .range(from, to),
    ),
    // Só as mensagens dos participantes deste webinar, não as da organização inteira.
    fetchAll((from, to) =>
      supabase
        .from("private_messages")
        .select("id, participant_id, sender_kind, participants!inner(webinar_id)", {
          count: "exact",
        })
        .eq("organization_id", organizationId)
        .eq("participants.webinar_id", webinarId)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("real_purchase_events")
        .select("id, contact_id, amount_value, currency", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("webinar_id", webinarId)
        .eq("status", "approved")
        .order("id")
        .range(from, to),
    ),
  ]);

  const participants = participantRows as MetricsParticipant[];
  const ids = new Set(participants.map((p) => p.participant_id));
  const messages = messageRows.filter((m) => m.participant_id && ids.has(m.participant_id));
  const summary = funnelSummary(participants);
  // A mesma regra dos factos: só conta a compra de um contacto que participou (no período).
  const contacts = new Set(participants.map((p) => p.contact_id).filter(Boolean));
  const approved = purchaseRows.filter((r) => r.contact_id && contacts.has(r.contact_id));
  // A duração configurada pode faltar ou estar desactualizada: usa também a posição mais avançada.
  const span = Math.max(
    factsDuration(participants) || durationSeconds,
    ...participants.map((p) => p.peak_seconds ?? 0),
    60,
  );

  return {
    participants,
    registered: summary.registered,
    attended: summary.attended,
    attendedLive: summary.attendedLive,
    attendedReplay: summary.attendedReplay,
    reachedPitch: summary.reachedPitch,
    sawOffer: summary.sawOffer,
    clicked: summary.clicked,
    checkout: summary.checkout,
    buyers: summary.buyers,
    paymentFailed: summary.paymentFailed,
    abandoned: summary.abandoned,
    refunded: summary.refunded,
    conversion: summary.conversion,
    revenue: sumByCurrency(approved),
    approvedPayments: approved.length,
    chatAuthors: new Set(messages.map((m) => m.participant_id)).size,
    chatMessages: messages.length,
    durationSeconds: span,
    retention: buildRetention(summary.attendedPeople, span),
    dropOff: buildDropOff(summary.attendedPeople, span),
    averageWatchSeconds: summary.averageWatchSeconds,
    milestones: summary.milestones.map((m) => ({
      label: `Chegou aos ${m.minutes} min`,
      value: m.value,
    })),
    chatParticipantIds: Array.from(
      new Set(messages.filter((m) => m.sender_kind !== "team").map((m) => m.participant_id!)),
    ),
    teamChatParticipantIds: Array.from(
      new Set(messages.filter((m) => m.sender_kind === "team").map((m) => m.participant_id!)),
    ),
  };
}

export function sumByCurrency(rows: { amount_value: number | null; currency: string | null }[]) {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.amount_value === null || !r.currency) continue;
    totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.amount_value));
  }
  return [...totals].map(([currency, amount]) => ({ currency, amount }));
}

/** A moeda vem da plataforma de pagamento tal como chega: um código que não é ISO ("R$", "EURO") fica escrito ao lado. */
export function moneyLabel({ currency, amount }: { currency: string; amount: number }) {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
  }
}

/** Onde cada pessoa ficou no percurso, do mais avançado para o menos. */
export const PERSON_STATUS = {
  bought: { label: "Comprou", variant: "success" },
  refunded: { label: "Reembolsado", variant: "outline" },
  failed: { label: "Pagamento falhado", variant: "destructive" },
  abandoned: { label: "Abandonou o pagamento", variant: "warning" },
  checkout: { label: "Iniciou o pagamento", variant: "info" },
  clicked: { label: "Clicou na oferta", variant: "info" },
  offer: { label: "Viu a oferta", variant: "secondary" },
  attended: { label: "Assistiu", variant: "secondary" },
  absent: { label: "Não assistiu", variant: "outline" },
} as const;
export type PersonStatus = keyof typeof PERSON_STATUS;
const STATUS_ORDER = Object.keys(PERSON_STATUS) as PersonStatus[];

export type MetricsPerson = {
  personId: string;
  contactId: string | null;
  name: string;
  email: string;
  phone: string;
  visits: number;
  attended: boolean;
  replay: boolean;
  watchSeconds: number;
  watchMeasured: boolean;
  peakSeconds: number;
  status: PersonStatus;
};

/**
 * Uma linha por pessoa, com a mesma regra do funil: várias entradas contam uma vez,
 * o tempo visto é o maior e cada facto basta numa das entradas.
 */
export function metricsPeople(participants: MetricsParticipant[]): MetricsPerson[] {
  const groups = new Map<string, MetricsParticipant[]>();
  for (const p of participants) {
    const key = p.person_id ?? p.participant_id ?? "";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups]
    .map(([personId, rows]) => {
      const any = (fact: (p: MetricsParticipant) => boolean | null) => rows.some((p) => Boolean(fact(p)));
      const best = rows.reduce((a, b) => ((b.actual_watch_seconds ?? 0) > (a.actual_watch_seconds ?? 0) ? b : a));
      const status: PersonStatus = any((p) => p.purchased)
        ? "bought"
        : any((p) => p.refunded)
          ? "refunded"
        : any((p) => p.payment_failed)
          ? "failed"
          : any((p) => p.checkout_abandoned)
            ? "abandoned"
            : any((p) => p.checkout_started)
              ? "checkout"
              : any((p) => p.clicked)
                ? "clicked"
                : any((p) => p.saw_offer)
                  ? "offer"
                  : any((p) => p.attended)
                    ? "attended"
                    : "absent";
      return {
        personId,
        contactId: rows.find((p) => p.contact_id)?.contact_id ?? null,
        name: rows.find((p) => p.name)?.name ?? "",
        email: rows.find((p) => p.email)?.email ?? "",
        phone: rows.find((p) => p.phone)?.phone ?? "",
        visits: rows.length,
        attended: any((p) => p.attended),
        replay: !any((p) => p.attended && p.viewing_mode !== "replay") && any((p) => p.viewing_mode === "replay"),
        watchSeconds: best.actual_watch_seconds ?? 0,
        watchMeasured: Boolean(best.watch_measured),
        peakSeconds: Math.max(...rows.map((p) => p.peak_seconds ?? 0)),
        status,
      };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.watchSeconds - a.watchSeconds,
    );
}

function escapeCsv(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 4000);
}


export function slugifyName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "webinar"
  );
}
