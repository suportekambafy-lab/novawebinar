/**
 * O país de cada contacto e a facturação por país. O país é o da inscrição mais recente
 * (localização pelo endereço de rede, a mesma da Vista ao vivo); quem nunca se inscreveu
 * (importado, compra de fora) fica com o país do indicativo do telefone, quando o tem.
 */
import { supabase } from "@/integrations/supabase/client";
import { countryCodeOf, countryLabel, flagOf } from "@/lib/analytics-geo";
import { PHONE_COUNTRIES } from "@/lib/phone-countries";
import { sumByCurrency } from "@/lib/webinar-metrics";

export type ContactCountry = {
  code: string | null;
  label: string;
  flag: string;
  /** «ip»: detectado na inscrição; «phone»: deduzido do indicativo. */
  from: "ip" | "phone";
};

// Indicativos mais longos primeiro: +351 antes de +35; no +1 fica o primeiro da lista (EUA).
const BY_DIAL = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/** «+244 923…» → «AO». Só números escritos com indicativo (+ ou 00). */
export function countryFromPhone(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!/^(\+|00)/.test(raw)) return null;
  const digits = `+${raw.replace(/^00/, "").replace(/\D/g, "")}`;
  if (digits.length < 9) return null;
  return BY_DIAL.find((c) => digits.startsWith(c.dial))?.code ?? null;
}

/** As inscrições vêm da mais recente para a mais antiga; a primeira com país decide. */
export function contactCountryOf(
  registrations: { country: string | null; country_code: string | null }[],
  phone: string | null | undefined,
): ContactCountry | null {
  for (const r of registrations) {
    const code = countryCodeOf(r.country_code, r.country);
    if (code || r.country?.trim())
      return { code, label: countryLabel(code, r.country), flag: flagOf(code), from: "ip" };
  }
  const code = countryFromPhone(phone);
  return code ? { code, label: countryLabel(code), flag: flagOf(code), from: "phone" } : null;
}

const CHUNK = 150;

/** O país de cada contacto pedido (os que não têm nenhum ficam de fora do mapa). */
export async function fetchContactCountries(
  organizationId: string,
  contactIds: string[],
): Promise<Map<string, ContactCountry>> {
  const ids = [...new Set(contactIds)];
  const regs = new Map<string, { country: string | null; country_code: string | null }[]>();
  const phones = new Map<string, string | null>();
  // ponytail: duas leituras por bloco de 150 contactos; passa a uma coluna na base se as Análises ficarem lentas.
  for (let i = 0; i < ids.length; i += CHUNK) {
    const some = ids.slice(i, i + CHUNK);
    const [participants, contacts] = await Promise.all([
      supabase
        .from("participants")
        .select("contact_id, country, country_code, joined_at")
        .eq("organization_id", organizationId)
        .in("contact_id", some)
        .order("joined_at", { ascending: false }),
      supabase
        .from("contacts")
        .select("id, phone")
        .eq("organization_id", organizationId)
        .in("id", some),
    ]);
    if (participants.error) throw participants.error;
    if (contacts.error) throw contacts.error;
    for (const p of participants.data ?? []) {
      if (!p.contact_id) continue;
      const list = regs.get(p.contact_id) ?? [];
      list.push(p);
      regs.set(p.contact_id, list);
    }
    for (const c of contacts.data ?? []) phones.set(c.id, c.phone);
  }
  const out = new Map<string, ContactCountry>();
  for (const id of ids) {
    const country = contactCountryOf(regs.get(id) ?? [], phones.get(id));
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
