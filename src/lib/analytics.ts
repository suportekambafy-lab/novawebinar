/**
 * Análises: as contas e as palavras partilhadas pela página de Análises e pela Vista ao
 * vivo. Tudo sai dos factos das participações (`participant_facts`) e dos pagamentos
 * aprovados (`real_purchase_events`); nada é simulado. As regras de contagem (cada pessoa
 * uma vez por webinar, os passos depois de «Assistiram» só contam quem assistiu) são as de
 * `participant-facts.ts`.
 */
import { NOT_TEST_ROOM } from "@/lib/test-room";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fetchContactCountries, revenueByCountry, type ContactCountry } from "@/lib/contact-countries";
import { rangeKey, type DateRange } from "@/lib/date-range";
import { FACT_COLUMNS, funnelSummary, type FunnelFact } from "@/lib/participant-facts";
import { sumByCurrency } from "@/lib/webinar-metrics";

/** As mesmas palavras no Painel, nas Análises e na Vista ao vivo. */
export const METRIC = {
  registered: "Inscritos",
  attended: "Assistiram",
  reachedPitch: "Chegaram ao pitch",
  sawOffer: "Viram a oferta",
  clicked: "Clicaram na oferta",
  checkout: "Iniciaram o pagamento",
  buyers: "Compraram",
  conversion: "Conversão",
  ctaConversion: "Conversão no CTA",
  averageWatch: "Tempo médio assistido",
  revenue: "Facturação",
  live: "Ao vivo",
  replay: "Replay",
  mobile: "Telemóvel",
  desktop: "Computador",
} as const;

export type AnalyticsFact = FunnelFact & {
  joined_at: string | null;
  device: string | null;
  country: string | null;
  city: string | null;
  webinar_title: string | null;
};

export type AnalyticsPurchase = {
  contact_id?: string | null;
  amount_value: number | null;
  currency: string | null;
  webinar_id: string | null;
};

type Summary = ReturnType<typeof funnelSummary>;

export type FunnelStepRow = {
  key: keyof typeof METRIC;
  label: string;
  value: number;
  /** Percentagem dos inscritos. */
  share: number;
  /** Percentagem do passo anterior que chegou a este. */
  pass: number | null;
};

/** Inscritos → Assistiram → … → Compraram, com a passagem de um passo para o seguinte. */
export function funnelSteps(summary: Summary): FunnelStepRow[] {
  const keys = ["registered", "attended", "reachedPitch", "sawOffer", "clicked", "checkout", "buyers"] as const;
  const values: Record<(typeof keys)[number], number> = {
    registered: summary.registered,
    attended: summary.attended,
    reachedPitch: summary.reachedPitch,
    sawOffer: summary.sawOffer,
    clicked: summary.clicked,
    checkout: summary.checkout,
    buyers: summary.buyers,
  };
  return keys.map((key, i) => {
    const value = values[key];
    const previous = i === 0 ? null : values[keys[i - 1]!];
    return {
      key,
      label: METRIC[key],
      value,
      share: summary.registered ? (value / summary.registered) * 100 : 0,
      pass: previous === null ? null : previous ? (value / previous) * 100 : 0,
    };
  });
}

/** Clicaram na oferta ÷ viram a oferta, em percentagem; null sem ninguém a ver a oferta. */
export function ctaConversion(summary: Pick<Summary, "clicked" | "sawOffer">) {
  return summary.sawOffer ? (summary.clicked / summary.sawOffer) * 100 : null;
}

export type Person = {
  key: string;
  webinarId: string | null;
  country: string | null;
  city: string | null;
  device: "mobile" | "desktop" | null;
  attended: boolean;
  clicked: boolean;
  purchased: boolean;
};

/**
 * Uma pessoa por webinar: o aparelho e a origem são os da entrada mais recente; assistiu,
 * clicou e comprou valem se aconteceram em qualquer entrada (e, como no funil, clicar e
 * comprar só contam a quem assistiu).
 */
export function peopleOf(facts: AnalyticsFact[]): Person[] {
  const sorted = [...facts].sort((a, b) => (b.joined_at ?? "").localeCompare(a.joined_at ?? ""));
  const people = new Map<string, Person>();
  for (const f of sorted) {
    const key = `${f.person_id}:${f.webinar_id}`;
    const seen = people.get(key);
    const device = f.device === "mobile" || f.device === "desktop" ? f.device : null;
    people.set(key, {
      key,
      webinarId: f.webinar_id,
      country: seen ? seen.country : f.country,
      city: seen ? seen.city : f.city,
      device: seen ? seen.device : device,
      attended: Boolean(f.attended) || Boolean(seen?.attended),
      clicked: Boolean(f.clicked) || Boolean(seen?.clicked),
      purchased: Boolean(f.purchased) || Boolean(seen?.purchased),
    });
  }
  return [...people.values()].map((p) => ({
    ...p,
    clicked: p.clicked && p.attended,
    purchased: p.purchased && p.attended,
  }));
}

export function deviceSplit(people: Pick<Person, "device">[]) {
  const split = { mobile: 0, desktop: 0, unknown: 0 };
  for (const p of people) split[p.device ?? "unknown"] += 1;
  return split;
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const MAX_DAYS = 90;

/**
 * Inscrições por dia (hora local de `joined_at`, que é a criação da inscrição), uma vez por
 * webinar em cada dia. Sem período escolhido, vai do primeiro dia com inscrições até hoje
 * (no máximo 90 dias).
 */
export function dailySeries(facts: Pick<AnalyticsFact, "person_id" | "webinar_id" | "joined_at">[], range: DateRange, now = new Date()) {
  const perDay = new Map<string, Set<string>>();
  let first: Date | null = null;
  for (const f of facts) {
    if (!f.joined_at) continue;
    const at = new Date(f.joined_at);
    if (!first || at < first) first = at;
    const key = dayKey(at);
    perDay.set(key, (perDay.get(key) ?? new Set()).add(`${f.person_id}:${f.webinar_id}`));
  }
  const end = new Date(range ? new Date(range.to).getTime() - 1 : now);
  end.setHours(12, 0, 0, 0);
  const start = new Date(range ? range.from : (first ?? now));
  start.setHours(12, 0, 0, 0);
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const days = Math.min(Math.max(span, 1), MAX_DAYS);
  const out: { key: string; label: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - i);
    out.push({
      key: dayKey(date),
      label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
      value: perDay.get(dayKey(date))?.size ?? 0,
    });
  }
  return { days: out, capped: span > MAX_DAYS };
}

export type WebinarRow = {
  webinarId: string;
  title: string;
  registered: number;
  attended: number;
  clicked: number;
  buyers: number;
  conversion: number;
  revenue: { currency: string; amount: number }[];
};

/** Cada webinar com o seu funil curto e a facturação, do que teve mais inscritos para o que teve menos. */
export function perWebinar(facts: AnalyticsFact[], purchases: AnalyticsPurchase[]): WebinarRow[] {
  const byWebinar = new Map<string, AnalyticsFact[]>();
  for (const f of facts) {
    if (!f.webinar_id) continue;
    const list = byWebinar.get(f.webinar_id);
    if (list) list.push(f);
    else byWebinar.set(f.webinar_id, [f]);
  }
  return [...byWebinar.entries()]
    .map(([webinarId, rows]) => {
      const s = funnelSummary(rows);
      return {
        webinarId,
        title: rows.find((r) => r.webinar_title)?.webinar_title ?? "Webinar",
        registered: s.registered,
        attended: s.attended,
        clicked: s.clicked,
        buyers: s.buyers,
        conversion: s.conversion,
        revenue: sumByCurrency(purchases.filter((p) => p.webinar_id === webinarId)),
      };
    })
    .sort((a, b) => b.registered - a.registered);
}

export function analyticsSummary(
  facts: AnalyticsFact[],
  purchases: AnalyticsPurchase[],
  range: DateRange,
  now = new Date(),
  countries: Map<string, ContactCountry> = new Map(),
) {
  const summary = funnelSummary(facts);
  const people = peopleOf(facts);
  return {
    summary,
    funnel: funnelSteps(summary),
    cta: ctaConversion(summary),
    people,
    devices: deviceSplit(people),
    daily: dailySeries(facts, range, now),
    revenue: sumByCurrency(purchases),
    payments: purchases.length,
    webinars: perWebinar(facts, purchases),
    revenueByCountry: revenueByCountry(
      purchases.map((p) => ({ ...p, contact_id: p.contact_id ?? null })),
      countries,
    ),
  };
}

export type Analytics = ReturnType<typeof analyticsSummary>;

/** Os dados das Análises (e do «Hoje» da Vista ao vivo): factos e pagamentos aprovados do período. */
export function useAnalytics(
  organizationId: string | undefined,
  webinarId: string | undefined,
  range: DateRange,
  refetchInterval: number | false = false,
) {
  return useQuery({
    queryKey: ["analytics", organizationId, webinarId ?? "todos", rangeKey(range)],
    enabled: Boolean(organizationId),
    refetchInterval,
    queryFn: async () => {
      const [facts, purchases] = await Promise.all([
        fetchAll((from, to) => {
          let q = supabase
            .from("participant_facts")
            .select(`${FACT_COLUMNS}, joined_at, device, country, city, webinar_title`, { count: "exact" })
            .eq("organization_id", organizationId!)
            .or(NOT_TEST_ROOM);
          if (webinarId) q = q.eq("webinar_id", webinarId);
          if (range) q = q.gte("joined_at", range.from).lt("joined_at", range.to);
          return q.order("participant_id").range(from, to);
        }),
        fetchAll((from, to) => {
          let q = supabase
            .from("real_purchase_events")
            .select("contact_id, amount_value, currency, webinar_id", { count: "exact" })
            .eq("organization_id", organizationId!)
            .eq("status", "approved");
          if (webinarId) q = q.eq("webinar_id", webinarId);
          if (range) q = q.gte("approved_at", range.from).lt("approved_at", range.to);
          return q.order("id").range(from, to);
        }),
      ]);
      // O país de quem pagou: o da inscrição mais recente da pessoa, mesmo fora do período.
      const countries = await fetchContactCountries(
        organizationId!,
        purchases.flatMap((p) => p.contact_id ?? []),
      ).catch(() => new Map<string, ContactCountry>());
      return analyticsSummary(facts as AnalyticsFact[], purchases, range, new Date(), countries);
    },
  });
}
