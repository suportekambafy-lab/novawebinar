/**
 * Contexto comercial de um contacto: o que comprou, a que assistiu e o que já
 * pediu. É o mesmo retrato para o agente IA decidir e para a pessoa que atende.
 * Os números vêm da jornada dos Contactos (`buildJourney`), não de contas novas.
 */
import { buildJourney, type Participation, type Purchase } from "@/lib/contacts";
import { intentLabel, isOpenStatus, statusLabel, type CaseRow } from "./model";

export type ContextPurchase = Purchase & { webinar_id: string | null };
export type ContextCase = Pick<CaseRow, "id" | "number" | "intent" | "status" | "created_at" | "resolved_at">;

export type WebinarParticipation = {
  participantId: string;
  webinarId: string;
  title: string;
  at: string;
  attended: boolean;
  /** 0–100, ou null quando o vídeo não tem duração conhecida. */
  watchedPct: number | null;
  watchedSeconds: number;
  reachedOffer: boolean;
  clicked: boolean;
  /** A plataforma registou um pagamento atribuído a este webinar. */
  checkout: boolean;
  paymentFailed: boolean;
  checkoutAbandoned: boolean;
  purchased: boolean;
  /** Comprou e foi reembolsado: não é uma compra activa. */
  refunded: boolean;
  messages: number;
};

export type CommercialContext = {
  purchases: { id: string; title: string; amount: string; status: string; at: string }[];
  approvedPurchases: number;
  /** Só compras aprovadas com valor conhecido, por moeda. */
  spent: { currency: string; total: number }[];
  webinars: WebinarParticipation[];
  registered: number;
  attended: number;
  messages: number;
  isCustomer: boolean;
  lastActivityAt: string | null;
  cases: ContextCase[];
};

export function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export function buildCommercialContext(input: {
  participations: Participation[];
  clicks: { participant_id: string | null; occurred_at: string; video_second?: number | null }[];
  messages: { participant_id: string | null; created_at?: string }[];
  purchases: ContextPurchase[];
  cases: ContextCase[];
}): CommercialContext {
  const journey = buildJourney(input);
  const approved = input.purchases.filter((p) => p.status === "approved");

  const webinars: WebinarParticipation[] = [];
  for (const step of journey) {
    if (step.kind !== "event") continue;
    const participation = input.participations.find((p) => p.participant_id === step.id);
    if (!participation) continue;
    webinars.push({
      participantId: step.id,
      webinarId: participation.webinar_id ?? "",
      title: step.title,
      at: step.at,
      attended: step.attended,
      watchedPct: step.watchedPct,
      watchedSeconds: step.watchedSeconds,
      reachedOffer: step.reachedOffer,
      clicked: step.clicked,
      checkout: Boolean(participation.checkout_started),
      paymentFailed: Boolean(participation.payment_failed),
      checkoutAbandoned: Boolean(participation.checkout_abandoned),
      purchased: Boolean(participation.purchased),
      refunded: Boolean(participation.refunded),
      messages: step.messages,
    });
  }

  const totals = new Map<string, number>();
  for (const buy of approved) {
    if (buy.amount_value === null || !buy.currency) continue;
    totals.set(buy.currency, (totals.get(buy.currency) ?? 0) + Number(buy.amount_value));
  }

  const moments = [
    ...input.participations.map((p) => p.joined_at ?? ""),
    ...input.purchases.map((p) => p.status_at),
    ...input.messages.map((m) => m.created_at ?? ""),
  ].filter(Boolean);

  return {
    purchases: journey
      .filter((step) => step.kind === "purchase")
      .map((step) => ({
        id: step.id,
        title: step.title,
        amount: step.kind === "purchase" ? step.amount : "",
        status: step.kind === "purchase" ? step.status : "",
        at: step.at,
      })),
    approvedPurchases: approved.length,
    spent: [...totals].map(([currency, total]) => ({ currency, total })),
    webinars,
    registered: new Set(webinars.map((w) => w.webinarId)).size,
    attended: new Set(webinars.filter((w) => w.attended).map((w) => w.webinarId)).size,
    messages: input.messages.length,
    isCustomer: approved.length > 0,
    lastActivityAt: moments.sort().at(-1) ?? null,
    cases: input.cases,
  };
}

export const EMPTY_CONTEXT: CommercialContext = buildCommercialContext({
  participations: [],
  clicks: [],
  messages: [],
  purchases: [],
  cases: [],
});

export function customerLabel(context: CommercialContext) {
  const n = context.approvedPurchases;
  if (n === 0) return "Ainda não comprou";
  return n === 1 ? "Cliente · 1 compra" : `Cliente recorrente · ${n} compras`;
}

/** Os factos do contacto, em frases. Servem para o resumo do caso e para o agente. */
export function contextFacts(context: CommercialContext, currentWebinarId?: string | null): string[] {
  const facts: string[] = [];
  const bought = context.purchases.filter((p) => p.status === "approved");
  if (bought.length > 0) {
    const names = bought.slice(0, 5).map((p) => p.title);
    facts.push(
      `Já comprou ${bought.length === 1 ? "uma vez" : `${bought.length} vezes`}: ${names.join("; ")}.`,
    );
  } else {
    facts.push("Ainda não comprou nada.");
  }
  // O pagamento mais recente, quando não acabou em compra.
  const last = context.purchases[0];
  const attempt: Record<string, string> = {
    failed: "O último pagamento falhou",
    pending: "Tem um pagamento pendente",
    abandoned: "Iniciou o pagamento e não concluiu",
    refunded: "A última compra foi reembolsada",
  };
  if (last && attempt[last.status]) facts.push(`${attempt[last.status]} (${last.title}).`);

  const current = context.webinars.find((w) => w.webinarId === currentWebinarId);
  if (current) {
    const parts = [
      current.attended
        ? current.watchedPct !== null
          ? `assistiu a ${current.watchedPct}%`
          : "está a assistir"
        : current.watchedSeconds > 0
          ? "viu pouco até agora"
          : "inscreveu-se e ainda não assistiu",
      current.reachedOffer ? "viu a oferta" : "",
      current.clicked ? "clicou na oferta" : "",
      current.purchased
        ? "comprou"
        : current.refunded
          ? "comprou e foi reembolsado"
          : current.paymentFailed
          ? "o pagamento falhou"
          : current.checkoutAbandoned
          ? "abandonou o pagamento"
          : current.checkout
            ? "iniciou o pagamento"
            : "",
    ].filter(Boolean);
    facts.push(`Nesta live (${current.title}): ${parts.join(", ")}.`);
  }

  const others = context.webinars.filter((w) => w.webinarId !== currentWebinarId && w.attended);
  if (others.length > 0) {
    facts.push(
      `Outras lives: ${others
        .slice(0, 4)
        .map((w) => `${w.title}${w.watchedPct !== null ? ` (${w.watchedPct}%)` : ""}`)
        .join("; ")}.`,
    );
  }

  const open = context.cases.filter((c) => isOpenStatus(c.status));
  const past = context.cases.filter((c) => !isOpenStatus(c.status));
  if (open.length > 0) {
    facts.push(
      `Tem ${open.length === 1 ? "um caso aberto" : `${open.length} casos abertos`}: ${open
        .map((c) => `${intentLabel(c.intent)} (${statusLabel(c.status).toLowerCase()})`)
        .join("; ")}.`,
    );
  }
  if (past.length > 0) {
    facts.push(
      `Casos anteriores: ${past
        .slice(0, 3)
        .map((c) => intentLabel(c.intent))
        .join("; ")}.`,
    );
  }
  return facts;
}
