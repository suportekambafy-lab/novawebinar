/**
 * O país de cada contacto e a facturação por país. O país é só o da localização pelo endereço de
 * rede (IP) na inscrição mais recente, o mesmo da Vista ao vivo. O indicativo do telefone não
 * serve: há quem viva noutro país e mantenha o número de Portugal. Sem inscrição, sem país.
 */
import { supabase } from "@/integrations/supabase/client";
import { countryCodeOf, countryLabel, flagOf } from "@/lib/analytics-geo";
import { sumByCurrency } from "@/lib/webinar-metrics";
import type { ContactSummary } from "@/lib/contacts";
import { stageCountsOf } from "@/lib/contacts-journey";
import type { StageCounts } from "@/lib/data";

export type ContactCountry = {
  code: string | null;
  label: string;
  flag: string;
};

/**
 * As inscrições vêm da mais recente para a mais antiga; a primeira com código de país decide.
 * A mesma regra da vista contact_summaries (0089).
 */
export function contactCountryOf(
  registrations: { country: string | null; country_code: string | null }[],
): ContactCountry | null {
  for (const r of registrations) {
    const code = countryCodeOf(r.country_code);
    if (code && code !== "XX") return { code, label: countryLabel(code, r.country), flag: flagOf(code) };
  }
  return null;
}

/** O país que a vista já traz (0089); undefined se a migração ainda não estiver aplicada. */
export function summaryCountry(c: {
  country_code?: string | null;
  country?: string | null;
}): ContactCountry | null | undefined {
  if (c.country_code === undefined) return undefined;
  if (!c.country_code) return null;
  return { code: c.country_code, label: countryLabel(c.country_code, c.country), flag: flagOf(c.country_code) };
}

/** Uma linha de contact_country_breakdown: as pessoas de um país e em que etapa estão. */
export type CountryRow = {
  country_code: string | null;
  contacts: number;
  customers: number;
  stages: StageCounts;
};

/** As mesmas contas de contact_country_breakdown, para quando a lista é local (temas). */
export function countryRowsOf(rows: ContactSummary[]): CountryRow[] | null {
  if (rows.some((c) => c.country_code === undefined)) return null;
  const byCountry = new Map<string, ContactSummary[]>();
  for (const c of rows) {
    const key = c.country_code ?? "";
    byCountry.set(key, [...(byCountry.get(key) ?? []), c]);
  }
  return [...byCountry.entries()]
    .map(([key, list]) => ({
      country_code: key || null,
      contacts: list.length,
      customers: list.filter((c) => (c.purchases ?? 0) > 0).length,
      stages: stageCountsOf(list),
    }))
    .sort((a, b) => Number(!a.country_code) - Number(!b.country_code) || b.contacts - a.contacts);
}

const CHUNK = 150;

/** O país de cada contacto pedido (os que não têm nenhum ficam de fora do mapa). */
export async function fetchContactCountries(
  organizationId: string,
  contactIds: string[],
): Promise<Map<string, ContactCountry>> {
  const ids = [...new Set(contactIds)];
  const regs = new Map<string, { country: string | null; country_code: string | null }[]>();
  // ponytail: uma leitura por bloco de 150 contactos; com a 0089 aplicada, a lista lê o país da vista.
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("participants")
      .select("contact_id, country, country_code, joined_at")
      .eq("organization_id", organizationId)
      .in("contact_id", ids.slice(i, i + CHUNK))
      .not("country_code", "is", null)
      .order("joined_at", { ascending: false });
    if (error) throw error;
    for (const p of data ?? []) {
      if (!p.contact_id) continue;
      const list = regs.get(p.contact_id) ?? [];
      list.push(p);
      regs.set(p.contact_id, list);
    }
  }
  const out = new Map<string, ContactCountry>();
  for (const [id, list] of regs) {
    const country = contactCountryOf(list);
    if (country) out.set(id, country);
  }
  return out;
}

const UNKNOWN = "Origem desconhecida";

export type CountryRevenue = {
  code: string | null;
  label: string;
  flag: string;
  /** Pessoas diferentes que compraram (pagamentos sem contacto contam um a um). */
  buyers: number;
  payments: number;
  revenue: { currency: string; amount: number }[];
};

/**
 * Os pagamentos aprovados agrupados pelo país de quem pagou, do país com mais pagamentos
 * para o que tem menos; «Origem desconhecida» fica sempre no fim.
 */
export function revenueByCountry(
  purchases: { contact_id: string | null; amount_value: number | null; currency: string | null }[],
  countries: Map<string, ContactCountry>,
): CountryRevenue[] {
  const groups = new Map<
    string,
    { country: ContactCountry | null; rows: typeof purchases; people: Set<string> }
  >();
  purchases.forEach((p, i) => {
    const country = p.contact_id ? (countries.get(p.contact_id) ?? null) : null;
    const key = country ? (country.code ?? country.label) : "";
    const group = groups.get(key) ?? { country, rows: [], people: new Set<string>() };
    group.rows.push(p);
    group.people.add(p.contact_id ?? `sem-contacto-${i}`);
    groups.set(key, group);
  });
  return [...groups.entries()]
    .map(([key, g]) => ({
      code: g.country?.code ?? null,
      label: key ? g.country!.label : UNKNOWN,
      flag: g.country?.flag ?? "",
      buyers: g.people.size,
      payments: g.rows.length,
      revenue: sumByCurrency(g.rows),
    }))
    .sort(
      (a, b) =>
        Number(a.label === UNKNOWN) - Number(b.label === UNKNOWN) || b.payments - a.payments,
    );
}
