/**
 * A atribuição dos testes A/B, só no servidor. Quem abre o endereço de um teste recebe uma variante e
 * vê a sala do webinar dela sem o endereço mudar. A pessoa reconhece-se por um cookie anónimo de um ano
 * (`nw_visitor`); a mesma pessoa vê sempre a mesma variante. Ao entrar na sala, a participação e o e-mail
 * ficam ligados à atribuição; uma compra com o mesmo e-mail conta para a variante.
 */
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { optimizationDue, optimizeTestIfDue, type OptimizableTest } from "./optimize.server";
import { bucketOf, pickVariant } from "./split";

export { bucketOf, pickVariant };

export const VISITOR_COOKIE = "nw_visitor";
const YEAR = 60 * 60 * 24 * 365;

/** O id anónimo de quem visita: lê o cookie ou cria um novo no primeiro pedido. Fora de um pedido, aleatório. */
export async function visitorId(): Promise<string> {
  try {
    const { getCookie, setCookie } = await import("@tanstack/react-start/server");
    const existing = getCookie(VISITOR_COOKIE);
    if (existing && /^[a-f0-9-]{20,40}$/i.test(existing)) return existing;
    const fresh = randomUUID();
    setCookie(VISITOR_COOKIE, fresh, { path: "/", maxAge: YEAR, sameSite: "lax", secure: process.env["NODE_ENV"] === "production", httpOnly: true });
    return fresh;
  } catch {
    return randomUUID();
  }
}

export type ActiveTest = OptimizableTest & {
  assignment_mode: string | null;
  variants: { id: string; label: string; webinar_id: string | null; traffic_percentage: number; position: number }[];
};

/** Uma cache curta por instância: em carga, o mesmo teste é pedido centenas de vezes por minuto. */
const TEST_TTL_MS = 30_000;
const testCache = new Map<string, { until: number; value: Promise<ActiveTest | null> }>();
/** Só para os testes: esquece os testes guardados. */
export function clearTestCache() {
  testCache.clear();
}

/** O teste com este endereço, se existe e já saiu do rascunho; arquivado não abre. */
export function findTestBySlug(slug: string): Promise<ActiveTest | null> {
  const hit = testCache.get(slug);
  if (hit && hit.until > Date.now()) return hit.value;
  if (testCache.size > 1000) testCache.clear();
  const value = readTestBySlug(slug).catch((error: unknown) => {
    testCache.delete(slug);
    throw error;
  });
  testCache.set(slug, { until: Date.now() + TEST_TTL_MS, value });
  return value;
}

async function readTestBySlug(slug: string): Promise<ActiveTest | null> {
  const { data, error } = await supabaseAdmin
    .from("ab_tests")
    .select("id, organization_id, status, assignment_mode, applied_variant_id, objective, auto_optimize, auto_optimize_after_days, optimized_at, started_at")
    .eq("slug", slug)
    .in("status", ["active", "paused", "completed"])
    .maybeSingle();
  if (error || !data) return null;
  // A passagem diária da optimização do tráfego, quando o endereço é aberto e está na hora (uma vez por dia).
  if (optimizationDue(data)) await optimizeTestIfDue(data);
  const { data: rows } = await supabaseAdmin
    .from("ab_test_variants")
    .select("id, label, webinar_id, traffic_percentage, position")
    .eq("ab_test_id", data.id)
    .order("position");
  const variants = (rows ?? []).filter((v) => v.webinar_id);
  if (variants.length === 0) return null;
  return { ...data, variants };
}

export type AssignmentMeta = {
  device?: string | null | undefined;
  countryCode?: string | null | undefined;
  referrer?: string | null | undefined;
  utmSource?: string | null | undefined;
  utmMedium?: string | null | undefined;
  utmCampaign?: string | null | undefined;
  utmContent?: string | null | undefined;
  utmTerm?: string | null | undefined;
};

export type Resolved = { testId: string; variantId: string; webinarId: string; visitor: string; preview: boolean };

/**
 * Para um endereço de teste: a variante desta pessoa (a de sempre, ou uma nova pelo tráfego) e o webinar
 * dela. Com vencedora aplicada, é sempre ela. Em pausa ou concluído sem vencedora, quem já tinha variante
 * mantém-na e quem chega de novo vê a primeira (o controlo), sem ficar registado.
 * Com `preview` («A», «B»…), mostra essa variante sem atribuir nada: é para o organizador ver as duas.
 */
export async function resolveTestSlug(slug: string, meta: AssignmentMeta = {}, preview?: string | null): Promise<Resolved | null> {
  const test = await findTestBySlug(slug);
  if (!test) return null;
  const visitor = await visitorId();
  const control = test.variants[0]!;

  if (preview) {
    const wanted = test.variants.find((v) => v.label.toUpperCase() === preview.trim().toUpperCase()) ?? control;
    return { testId: test.id, variantId: wanted.id, webinarId: wanted.webinar_id!, visitor, preview: true };
  }

  if (test.applied_variant_id) {
    const winner = test.variants.find((v) => v.id === test.applied_variant_id) ?? control;
    return { testId: test.id, variantId: winner.id, webinarId: winner.webinar_id!, visitor, preview: false };
  }

  // Em pausa ou concluído não se atribui mais ninguém: quem já tinha variante mantém-na, o resto vê o controlo.
  if (test.status !== "active") {
    const { data: existing } = await supabaseAdmin
      .from("ab_test_assignments")
      .select("variant_id")
      .eq("ab_test_id", test.id)
      .eq("visitor_id", visitor)
      .maybeSingle();
    const variant = (existing && test.variants.find((v) => v.id === existing.variant_id)) || control;
    return { testId: test.id, variantId: variant.id, webinarId: variant.webinar_id!, visitor, preview: false };
  }

  // Ativo: uma só ida à base. A função ab_assign guarda a escolha ou, se a pessoa já tinha variante, devolve essa.

  const bucket = test.assignment_mode === "legacy" ? Math.floor(Math.random() * 100) : bucketOf(visitor, test.id);
  const chosen = pickVariant(test.variants, bucket);
  const { data: result, error } = await supabaseAdmin.rpc("ab_assign", {
    p_test: test.id,
    p_org: test.organization_id,
    p_visitor: visitor,
    p_variant: chosen.id,
    p_webinar: chosen.webinar_id!,
    p_device: meta.device ?? "",
    p_country: meta.countryCode ?? "",
    p_referrer: (meta.referrer ?? "").slice(0, 200),
    p_utm_source: (meta.utmSource ?? "").slice(0, 120),
    p_utm_medium: (meta.utmMedium ?? "").slice(0, 120),
    p_utm_campaign: (meta.utmCampaign ?? "").slice(0, 120),
    p_utm_content: (meta.utmContent ?? "").slice(0, 120),
    p_utm_term: (meta.utmTerm ?? "").slice(0, 120),
  });
  // A escrita falhou: a pessoa vê a variante escolhida na mesma; a atribuição fica para a visita seguinte.
  if (error) console.error("[ab] atribuição falhou", error.message);
  const assignedId =
    typeof result === "object" && result !== null && typeof (result as { variant_id?: unknown }).variant_id === "string"
      ? (result as { variant_id: string }).variant_id
      : chosen.id;
  const variant = test.variants.find((v) => v.id === assignedId) ?? chosen;
  return { testId: test.id, variantId: variant.id, webinarId: variant.webinar_id!, visitor, preview: false };
}

/**
 * Ao entrar na sala: liga a participação e o e-mail à atribuição desta pessoa no teste em que este webinar
 * é variante, e regista a exposição (a pessoa viu mesmo a sala). Sem teste, não faz nada.
 */
export async function linkAssignment(input: { webinarId: string; participantId: string; email: string | null }) {
  try {
    const visitor = await visitorId();
    const { data: candidates } = await supabaseAdmin
      .from("ab_test_variants")
      .select("id, ab_test_id, organization_id")
      .eq("webinar_id", input.webinarId);
    if (!candidates?.length) return;
    const { data: tests } = await supabaseAdmin
      .from("ab_tests")
      .select("id")
      .in("id", candidates.map((c) => c.ab_test_id))
      // Um teste terminado (ou o original de um duplicado, que usa os mesmos webinars) já não recebe visitas.
      .in("status", ["active", "paused"]);
    const open = new Set((tests ?? []).map((t) => t.id));
    for (const variant of candidates.filter((c) => open.has(c.ab_test_id))) {
      const { data: assignment } = await supabaseAdmin
        .from("ab_test_assignments")
        .select("id, participant_id, email, variant_id")
        .eq("ab_test_id", variant.ab_test_id)
        .eq("visitor_id", visitor)
        .maybeSingle();
      // Só a variante desta pessoa: quem tem A e abre o link do webinar de B não passa a contar para A com B.
      if (!assignment || assignment.variant_id !== variant.id) continue;
      const patch: { participant_id?: string; email?: string } = {};
      if (!assignment.participant_id) patch.participant_id = input.participantId;
      if (!assignment.email && input.email && !input.email.endsWith("@sala.local")) patch.email = input.email.toLowerCase();
      if (Object.keys(patch).length) await supabaseAdmin.from("ab_test_assignments").update(patch).eq("id", assignment.id);
      await supabaseAdmin.from("ab_test_events").insert({
        ab_test_id: variant.ab_test_id,
        variant_id: assignment.variant_id,
        organization_id: variant.organization_id,
        assignment_id: assignment.id,
        visitor_id: visitor,
        participant_id: input.participantId,
        webinar_id: input.webinarId,
        event_type: "ab_exposure",
        idempotency_key: `exposure:${assignment.id}`,
      });
    }
  } catch (error) {
    // Nada disto pode travar a entrada na sala.
    console.error("[ab] ligação da participação falhou", error);
  }
}

/**
 * Uma venda aprovada conta para a variante de quem comprou: cruza o e-mail do comprador com as atribuições
 * da organização (do webinar da venda, quando se sabe) e regista a receita. Repetir a mesma venda não duplica.
 */
export async function attributePurchase(input: {
  organizationId: string;
  buyerEmail: string | null | undefined;
  webinarId: string | null;
  purchaseId: string;
  amount: number | null;
  currency: string | null;
}) {
  const email = (input.buyerEmail ?? "").trim().toLowerCase();
  if (!email) return;
  try {
    const { data: assignments } = await supabaseAdmin
      .from("ab_test_assignments")
      .select("id, ab_test_id, variant_id, participant_id, visitor_id")
      .eq("organization_id", input.organizationId)
      .eq("email", email)
      .order("assigned_at", { ascending: false });
    if (!assignments?.length) return;
    const { data: variants } = await supabaseAdmin
      .from("ab_test_variants")
      .select("id, ab_test_id, webinar_id")
      .in("ab_test_id", [...new Set(assignments.map((a) => a.ab_test_id))]);
    // Os webinars de cada teste: uma venda presa ao webinar de uma variante (o receptor desse webinar, um
    // checkout partilhado) conta também para quem estava na outra variante do mesmo teste.
    const webinarsOf = new Map<string, Set<string>>();
    for (const v of variants ?? []) {
      if (!v.webinar_id) continue;
      const set = webinarsOf.get(v.ab_test_id) ?? new Set<string>();
      set.add(v.webinar_id);
      webinarsOf.set(v.ab_test_id, set);
    }
    // Sem webinar na venda: só o teste da atribuição mais recente desta pessoa (antes a venda contava
    // para todos os testes em que o e-mail alguma vez entrou).
    const matching = input.webinarId
      ? assignments.filter((a) => webinarsOf.get(a.ab_test_id)?.has(input.webinarId!) ?? false)
      : assignments.slice(0, 1);
    // Uma por teste: a atribuição mais recente de cada um.
    const seen = new Set<string>();
    for (const a of matching) {
      if (seen.has(a.ab_test_id)) continue;
      seen.add(a.ab_test_id);
      const { error } = await supabaseAdmin.from("ab_test_events").insert({
        ab_test_id: a.ab_test_id,
        variant_id: a.variant_id,
        organization_id: input.organizationId,
        assignment_id: a.id,
        visitor_id: a.visitor_id,
        participant_id: a.participant_id,
        webinar_id: input.webinarId,
        event_type: "purchase",
        revenue: input.amount,
        currency: input.currency,
        event_data: { purchase_id: input.purchaseId },
        idempotency_key: `purchase:${input.purchaseId}:${a.id}`,
      });
      if (error && error.code !== "23505") console.error("[ab] receita por atribuir", error.message);
    }
  } catch (error) {
    console.error("[ab] atribuição da venda falhou", error);
  }
}
