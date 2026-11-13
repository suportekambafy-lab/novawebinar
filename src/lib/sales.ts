/**
 * Vendas: cada pagamento com quem comprou, de onde é, em que webinar, quanto tempo assistiu e de onde
 * veio. Os pagamentos são os de `real_purchase_events`, pela mesma regra das Análises: os aprovados
 * contam pelo dia da aprovação (`approved_at`); os outros estados pelo dia em que mudaram (`status_at`).
 * O tempo assistido é o da participação da pessoa nesse webinar (`participant_facts`), somando
 * aparelhos e sessões; o país é o do contacto (pelo IP da inscrição, nunca o telefone).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { countryCodeOf, countryLabel, flagOf } from "@/lib/analytics-geo";
import { rangeKey, type DateRange } from "@/lib/date-range";
import { NOT_TEST_ROOM } from "@/lib/test-room";

export type SaleStatus = "approved" | "pending" | "failed" | "refunded" | "abandoned";
export type StatusFilter = SaleStatus | "todos";

export const STATUS_LABEL: Record<SaleStatus, string> = {
  approved: "Aprovada",
  pending: "Pendente",
  failed: "Falhou",
  refunded: "Reembolsada",
  abandoned: "Abandonada",
};

export type PurchaseRow = {
  id: string;
  contact_id: string | null;
  webinar_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  product_name: string | null;
  amount_value: number | null;
  currency: string | null;
  status: string;
  provider: string | null;
  approved_at: string | null;
  status_at: string | null;
  created_at: string;
};

export type FactRow = {
  contact_id: string | null;
  webinar_id: string | null;
  joined_at: string | null;
  attended: boolean | null;
  actual_watch_seconds: number | null;
  duration_seconds: number | null;
  viewing_mode: string | null;
  clicked: boolean | null;
  device: string | null;
};

export type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  country_code?: string | null;
  country?: string | null;
  first_source: string | null;
  first_campaign: string | null;
};

export type Sale = {
  id: string;
  at: string;
  status: SaleStatus;
  amount: number;
  currency: string;
  product: string;
  provider: string;
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  country: { code: string; label: string; flag: string } | null;
  webinarId: string | null;
  webinarTitle: string | null;
  /** Segundos que assistiu a esse webinar; null quando não há participação ligada à compra. */
  watched: number | null;
  /** Parte do vídeo vista (0–100), quando a duração é conhecida. */
  watchedPct: number | null;
  mode: "live" | "replay" | "ambos" | null;
  clicked: boolean;
  device: string | null;
  /** De onde veio a pessoa: a origem da primeira visita (UTM ou referência). */
  source: string | null;
  campaign: string | null;
  /** Quanto tempo passou desde que entrou na sala até pagar, em segundos. */
  afterJoin: number | null;
};

const asStatus = (s: string): SaleStatus => (s in STATUS_LABEL ? (s as SaleStatus) : "pending");
const code = (c: string | null | undefined) => {
  const v = (c ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) && v !== "XX" ? v : null;
};

/** Junta pagamentos, participações e contactos numa venda por linha, da mais recente para a mais antiga. */
export function buildSales(
  purchases: PurchaseRow[],
  facts: FactRow[],
  contacts: ContactRow[],
  titles: Map<string, string>,
): Sale[] {
  const byContact = new Map(contacts.map((c) => [c.id, c]));
  const factsOf = new Map<string, FactRow[]>();
  for (const f of facts) {
    if (!f.contact_id) continue;
    const list = factsOf.get(f.contact_id) ?? [];
    list.push(f);
    factsOf.set(f.contact_id, list);
  }
  return purchases
    .map((p) => {
      const status = asStatus(p.status);
      const at = (status === "approved" ? p.approved_at : p.status_at) ?? p.status_at ?? p.created_at;
      const contact = p.contact_id ? byContact.get(p.contact_id) : undefined;
      const mine = (p.contact_id ? factsOf.get(p.contact_id) ?? [] : []).filter((f) => !p.webinar_id || f.webinar_id === p.webinar_id);
      // Sem webinar atribuído, o tempo só conta se a pessoa esteve num único webinar (sem adivinhar).
      const webinars = new Set(mine.map((f) => f.webinar_id));
      const linked = p.webinar_id || webinars.size === 1 ? mine : [];
      const webinarId = p.webinar_id ?? (webinars.size === 1 ? [...webinars][0] ?? null : null);
      const latest = [...linked].sort((a, b) => (b.joined_at ?? "").localeCompare(a.joined_at ?? ""))[0];
      const watched = linked.length ? Math.max(...linked.map((f) => f.actual_watch_seconds ?? 0)) : null;
      const duration = Math.max(0, ...linked.map((f) => f.duration_seconds ?? 0));
      const modes = new Set(linked.filter((f) => f.attended).map((f) => (f.viewing_mode === "replay" ? "replay" : "live")));
      const firstJoin = linked.map((f) => f.joined_at).filter((j): j is string => Boolean(j)).sort()[0];
      const afterJoin = firstJoin ? Math.round((Date.parse(at) - Date.parse(firstJoin)) / 1000) : null;
      const cc = code(contact?.country_code);
      return {
        id: p.id,
        at,
        status,
        amount: Number(p.amount_value ?? 0),
        currency: (p.currency ?? "EUR").toUpperCase(),
        product: p.product_name?.trim() || "Produto",
        provider: p.provider ?? "",
        contactId: p.contact_id,
        name: contact?.name?.trim() || p.buyer_name?.trim() || p.buyer_email || "Sem nome",
        email: contact?.email ?? p.buyer_email,
        phone: contact?.phone ?? null,
        country: cc ? { code: cc, label: countryLabel(cc, contact?.country ?? null), flag: flagOf(cc) } : null,
        webinarId,
        webinarTitle: webinarId ? (titles.get(webinarId) ?? "Webinar removido") : null,
        watched,
        watchedPct: watched !== null && duration > 0 ? Math.min(100, Math.round((watched / duration) * 100)) : null,
        mode: modes.size === 2 ? "ambos" : modes.size === 1 ? ([...modes][0] as "live" | "replay") : null,
        clicked: linked.some((f) => f.clicked),
        device: latest?.device ?? null,
        source: contact?.first_source ?? null,
        campaign: contact?.first_campaign ?? null,
        afterJoin: afterJoin !== null && afterJoin >= 0 ? afterJoin : null,
      } satisfies Sale;
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Os totais do topo: facturação por moeda, pagamentos, compradores e o tempo médio que assistiram. */
export function salesSummary(sales: Sale[]) {
  const approved = sales.filter((s) => s.status === "approved");
  const revenue = new Map<string, number>();
  for (const s of approved) revenue.set(s.currency, (revenue.get(s.currency) ?? 0) + s.amount);
  const buyers = new Set(approved.map((s) => s.contactId ?? s.id));
  const watched = approved.map((s) => s.watched).filter((w): w is number => w !== null && w > 0);
  return {
    revenue: [...revenue.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
    payments: approved.length,
    buyers: buyers.size,
    averageWatch: watched.length ? Math.round(watched.reduce((a, b) => a + b, 0) / watched.length) : null,
    withWebinar: approved.filter((s) => s.webinarId).length,
  };
}

/** «desconhecido» no filtro de país: quem não tem país (sem inscrição com IP). */
export const UNKNOWN_COUNTRY = "desconhecido";

/** Os países das vendas, para o filtro: do que tem mais vendas para o que tem menos; sem país no fim. */
export function salesCountries(sales: Sale[]) {
  const byCode = new Map<string, { code: string; label: string; flag: string; count: number }>();
  for (const s of sales) {
    const key = s.country?.code ?? UNKNOWN_COUNTRY;
    const row = byCode.get(key) ?? { code: key, label: s.country?.label ?? "País desconhecido", flag: s.country?.flag ?? "", count: 0 };
    row.count += 1;
    byCode.set(key, row);
  }
  return [...byCode.values()].sort(
    (a, b) => Number(a.code === UNKNOWN_COUNTRY) - Number(b.code === UNKNOWN_COUNTRY) || b.count - a.count || a.label.localeCompare(b.label),
  );
}

export function inCountry(s: Sale, country: string | undefined) {
  if (!country) return true;
  return (s.country?.code ?? UNKNOWN_COUNTRY) === country;
}

export function matchesSale(s: Sale, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [s.name, s.email, s.phone, s.product, s.webinarTitle, s.country?.label].some((v) => v?.toLowerCase().includes(q));
}

/** Uma participação, para contar por país quem se inscreveu e quem assistiu. */
export type CountryFact = { person_id: string | null; country: string | null; attended: boolean | null };

export type CountryResult = {
  code: string;
  label: string;
  flag: string;
  /** Pessoas que se inscreveram no período (cada uma uma vez). */
  registered: number;
  attended: number;
  /** Pessoas diferentes com pagamento aprovado no período. */
  buyers: number;
  revenue: { currency: string; amount: number }[];
  /** Compraram ÷ assistiram, em percentagem; null sem ninguém a assistir. */
  conversion: number | null;
};

/**
 * Por país: quantas pessoas se inscreveram e assistiram no período (o país da inscrição, pelo IP) e
 * quantas compraram e quanto facturou (as vendas aprovadas do período, pelo país do contacto).
 * Do país que mais facturou para o que menos; sem país no fim.
 */
export function countryResults(facts: CountryFact[], sales: Sale[]): CountryResult[] {
  const rows = new Map<string, { registered: Set<string>; attended: Set<string>; buyers: Set<string>; revenue: Map<string, number>; label: string; flag: string }>();
  const row = (code: string, name?: string | null) => {
    let r = rows.get(code);
    if (!r) {
      const known = code !== UNKNOWN_COUNTRY;
      r = { registered: new Set(), attended: new Set(), buyers: new Set(), revenue: new Map(), label: known ? countryLabel(code, name ?? null) : "País desconhecido", flag: known ? flagOf(code) : "" };
      rows.set(code, r);
    }
    return r;
  };
  facts.forEach((f, i) => {
    const code = countryCodeOf(null, f.country);
    const r = row(code && code !== "XX" ? code : UNKNOWN_COUNTRY, f.country);
    const person = f.person_id ?? `sem-pessoa-${i}`;
    r.registered.add(person);
    if (f.attended) r.attended.add(person);
  });
  for (const s of sales) {
    if (s.status !== "approved") continue;
    const r = row(s.country?.code ?? UNKNOWN_COUNTRY);
    r.buyers.add(s.contactId ?? s.id);
    r.revenue.set(s.currency, (r.revenue.get(s.currency) ?? 0) + s.amount);
  }
  const total = (r: { revenue: Map<string, number> }) => [...r.revenue.values()].reduce((a, b) => a + b, 0);
  return [...rows.entries()]
    .sort(([a, ra], [b, rb]) => Number(a === UNKNOWN_COUNTRY) - Number(b === UNKNOWN_COUNTRY) || total(rb) - total(ra) || rb.attended.size - ra.attended.size)
    .map(([code, r]) => ({
      code,
      label: r.label,
      flag: r.flag,
      registered: r.registered.size,
      attended: r.attended.size,
      buyers: r.buyers.size,
      revenue: [...r.revenue.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
      conversion: r.attended.size ? Math.min(100, (r.buyers.size / r.attended.size) * 100) : null,
    }));
}

/** As participações do período (inscrições), para a conversão por país. */
export function useCountryFacts(organizationId: string | undefined, range: DateRange, webinarId: string | undefined) {
  return useQuery({
    queryKey: ["sales-country-facts", organizationId, rangeKey(range), webinarId ?? "todos"],
    enabled: Boolean(organizationId),
    queryFn: () =>
      fetchAll((from, to) => {
        let q = supabase
          .from("participant_facts")
          .select("person_id, country, attended, participant_id", { count: "exact" })
          .eq("organization_id", organizationId!)
          .or(NOT_TEST_ROOM);
        if (webinarId) q = q.eq("webinar_id", webinarId);
        if (range) q = q.gte("joined_at", range.from).lt("joined_at", range.to);
        return q.order("participant_id").range(from, to);
      }) as Promise<CountryFact[]>,
  });
}

const CHUNK = 150;

export function useSales(organizationId: string | undefined, range: DateRange, status: StatusFilter, webinarId: string | undefined, titles: Map<string, string>) {
  return useQuery({
    queryKey: ["sales", organizationId, rangeKey(range), status, webinarId ?? "todos"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const purchases = await fetchAll((from, to) => {
        let q = supabase
          .from("real_purchase_events")
          .select("id, contact_id, webinar_id, buyer_name, buyer_email, product_name, amount_value, currency, status, provider, approved_at, status_at, created_at", { count: "exact" })
          .eq("organization_id", organizationId!);
        if (status !== "todos") q = q.eq("status", status);
        if (webinarId) q = q.eq("webinar_id", webinarId);
        const column = status === "approved" ? "approved_at" : "status_at";
        if (range) q = q.gte(column, range.from).lt(column, range.to);
        return q.order("id").range(from, to);
      });
      const ids = [...new Set(purchases.flatMap((p) => (p.contact_id ? [p.contact_id] : [])))];
      const facts: FactRow[] = [];
      const contacts: ContactRow[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const [f, c] = await Promise.all([
          supabase
            .from("participant_facts")
            .select("contact_id, webinar_id, joined_at, attended, actual_watch_seconds, duration_seconds, viewing_mode, clicked, device")
            .eq("organization_id", organizationId!)
            .in("contact_id", slice)
            .or(NOT_TEST_ROOM),
          supabase
            .from("contact_summaries")
            .select("*")
            .eq("organization_id", organizationId!)
            .in("id", slice),
        ]);
        if (f.error) throw f.error;
        if (c.error) throw c.error;
        facts.push(...((f.data ?? []) as FactRow[]));
        contacts.push(...((c.data ?? []) as ContactRow[]));
      }
      return buildSales(purchases as PurchaseRow[], facts, contacts, titles);
    },
  });
}
