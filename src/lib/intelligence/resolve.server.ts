/**
 * O resolvedor do Webinar Intelligence, só no servidor. Quem abre o endereço vai para o favorito, ou para
 * o secundário se já viu um webinar da organização. «Já viu» reconhece-se por quatro sinais, nesta ordem:
 * o cookie de salas vistas (nw_seen_orgs, posto ao entrar numa sala), uma visita anterior a este endereço
 * com o mesmo cookie anónimo (nw_visitor), e o e-mail ou o WhatsApp que o link traz (links dos e-mails e
 * do WhatsApp), cruzados com as participações da organização. Cada visita fica registada.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { visitorId, type KnownPerson } from "@/lib/ab-tests/assign.server";
import { decideWebinar, type SmartLinkRow } from "./model";

export const SEEN_COOKIE = "nw_seen_orgs";
const YEAR = 60 * 60 * 24 * 365;
const MAX_SEEN = 24;

/** As organizações de que esta pessoa já viu uma sala, pelo cookie. Fora de um pedido, nenhuma. */
export async function seenOrganizations(): Promise<string[]> {
  try {
    const { getCookie } = await import("@tanstack/react-start/server");
    const raw = getCookie(SEEN_COOKIE) ?? "";
    return raw.split(",").filter((id) => /^[a-f0-9-]{36}$/i.test(id));
  } catch {
    return [];
  }
}

/** Marca, no cookie, que esta pessoa entrou numa sala desta organização. Falha em silêncio fora de um pedido. */
export async function rememberSeen(organizationId: string): Promise<void> {
  try {
    const { setCookie } = await import("@tanstack/react-start/server");
    const seen = await seenOrganizations();
    const next = [organizationId, ...seen.filter((id) => id !== organizationId)].slice(0, MAX_SEEN);
    setCookie(SEEN_COOKIE, next.join(","), {
      path: "/",
      maxAge: YEAR,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      httpOnly: true,
    });
  } catch {
    // Fora de um pedido (ou cookies bloqueados): o servidor continua a reconhecer pelo e-mail e pelo WhatsApp.
  }
}

/** Uma cache curta por instância: em campanha, o mesmo endereço é aberto centenas de vezes por minuto. */
const LINK_TTL_MS = 30_000;
const linkCache = new Map<string, { until: number; value: Promise<SmartLinkRow | null> }>();
export function clearSmartLinkCache() {
  linkCache.clear();
}

export function findSmartLinkBySlug(slug: string): Promise<SmartLinkRow | null> {
  const hit = linkCache.get(slug);
  if (hit && hit.until > Date.now()) return hit.value;
  if (linkCache.size > 1000) linkCache.clear();
  const value = Promise.resolve(
    supabaseAdmin
      .from("smart_links")
      .select("id, organization_id, name, slug, primary_webinar_id, secondary_webinar_id, status, created_at, updated_at")
      .eq("slug", slug)
      .maybeSingle(),
  )
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return (data as SmartLinkRow | null) ?? null;
    })
    .catch((error: unknown) => {
      linkCache.delete(slug);
      throw error;
    });
  linkCache.set(slug, { until: Date.now() + LINK_TTL_MS, value });
  return value;
}

export type KnownBy = "" | "cookie" | "visita" | "email" | "whatsapp";

const realEmail = (email: string | null | undefined) => {
  const e = (email ?? "").trim().toLowerCase();
  return e && !e.endsWith("@sala.local") && e.length <= 160 ? e : null;
};

/** Como se sabe que a pessoa já viu um webinar desta organização; "" quando não há sinal nenhum. */
export async function knownBy(link: SmartLinkRow, visitor: string, person: KnownPerson): Promise<KnownBy> {
  if ((await seenOrganizations()).includes(link.organization_id)) return "cookie";
  const { data: previous } = await supabaseAdmin
    .from("smart_link_visits")
    .select("id")
    .eq("organization_id", link.organization_id)
    .eq("visitor_id", visitor)
    .limit(1);
  if (previous && previous.length > 0) return "visita";
  const email = realEmail(person.email);
  const phone = (person.phone ?? "").trim() || null;
  if (!email && !phone) return "";
  const escaped = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
  if (email) {
    const { data } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("organization_id", link.organization_id)
      .ilike("email", escaped(email))
      .limit(1);
    if (data && data.length > 0) return "email";
  }
  if (phone) {
    const { data } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("organization_id", link.organization_id)
      .eq("phone", phone)
      .limit(1);
    if (data && data.length > 0) return "whatsapp";
  }
  return "";
}

export type ResolvedSmartLink = { linkId: string; webinarId: string; returning: boolean; knownBy: KnownBy };

/** Para um endereço do Webinar Intelligence: o webinar desta pessoa, e a visita registada. */
export async function resolveSmartLink(slug: string, person: KnownPerson = {}): Promise<ResolvedSmartLink | null> {
  const link = await findSmartLinkBySlug(slug);
  if (!link) return null;
  const visitor = await visitorId();
  // Em pausa, toda a gente vai para o favorito e nada se regista.
  if (link.status !== "active") return { linkId: link.id, webinarId: link.primary_webinar_id, returning: false, knownBy: "" };
  const by = await knownBy(link, visitor, person).catch((): KnownBy => "");
  const returning = by !== "";
  const webinarId = decideWebinar(link, returning);
  const { error } = await supabaseAdmin.from("smart_link_visits").insert({
    smart_link_id: link.id,
    organization_id: link.organization_id,
    visitor_id: visitor,
    webinar_id: webinarId,
    returning_visitor: returning,
    known_by: by,
  });
  // A escrita falhou: a pessoa vê o webinar na mesma; só a contagem fica por fazer.
  if (error) console.error("[intelligence] visita não registada", error.message);
  return { linkId: link.id, webinarId, returning, knownBy: by };
}
