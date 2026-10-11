import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAbTestInput, statusOf, variantLabel, type AbTestHistoryRow, type AbTestRow, type AbTestVariantRow } from "./model";
import { evaluate, parseMetrics, type Evaluation, type Objective, type TestMetrics } from "./stats";

/**
 * Os testes A/B, do lado do servidor. Quem pede tem sessão iniciada; cada função confirma que a pessoa é da
 * organização do teste (quem só atende não gere testes). As escritas correm com a chave de serviço e deixam
 * sempre uma linha no histórico.
 */

const uuid = z.string().uuid();

/** A função da pessoa na organização; falha se não for membro. Quem só atende (support) não gere testes. */
async function memberRole(supabase: SupabaseClient<Database>, organizationId: string, userId: string, write = false) {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Sem acesso a esta organização.");
  if (write && data.role === "support") throw new Error("Quem só atende não gere testes A/B.");
  return data.role;
}


async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadTest(testId: string) {
  const db = await admin();
  const { data, error } = await db.from("ab_tests").select("*").eq("id", testId).maybeSingle();
  if (error) throw new Error("Não foi possível ler o teste.");
  if (!data) throw new Error("Teste não encontrado.");
  return data as AbTestRow;
}

/** As variantes dos testes, com o webinar de cada uma (duas leituras: não depende de chaves no esquema). */
async function loadVariants(testIds: string[]): Promise<AbTestVariantRow[]> {
  const db = await admin();
  const { data, error } = await db
    .from("ab_test_variants")
    .select("id, ab_test_id, label, name, webinar_id, traffic_percentage, position")
    .in("ab_test_id", testIds)
    .order("position");
  if (error) throw new Error("Não foi possível ler as variantes.");
  const rows = data ?? [];
  const webinarIds = [...new Set(rows.map((v) => v.webinar_id).filter((id): id is string => Boolean(id)))];
  const { data: webinars } = webinarIds.length
    ? await db.from("webinars").select("id, public_title, internal_name, slug, status").in("id", webinarIds)
    : { data: [] };
  const byId = new Map((webinars ?? []).map((w) => [w.id, w]));
  return rows.map((v) => ({ ...v, webinar: v.webinar_id ? (byId.get(v.webinar_id) ?? null) : null }));
}

async function metricsOf(testId: string): Promise<TestMetrics> {
  const db = await admin();
  const { data, error } = await db.rpc("ab_test_metrics", { p_test: testId });
  if (error) throw new Error("Não foi possível calcular as métricas.");
  return parseMetrics(data);
}

function evaluation(test: AbTestRow, metrics: TestMetrics): Evaluation {
  return evaluate(
    metrics,
    test.objective as Objective,
    {
      confidenceThreshold: Number(test.confidence_threshold ?? 95),
      minimumVisitors: test.minimum_visitors ?? 500,
      minimumConversions: test.minimum_conversions ?? 30,
      minimumDurationDays: test.minimum_duration_days ?? 3,
    },
    test.started_at,
  );
}

async function history(testId: string, organizationId: string, actorId: string | null, action: string, details: Record<string, string | number | null> = {}) {
  const db = await admin();
  await db.from("ab_test_history").insert({ ab_test_id: testId, organization_id: organizationId, actor_id: actorId, action, details: details as Json });
}

/** Um endereço só pode ser de um teste ou de um webinar: é por ele que a sala pública resolve. */
async function slugTaken(slug: string, exceptTestId?: string) {
  const db = await admin();
  const [tests, webinars] = await Promise.all([
    db.from("ab_tests").select("id").eq("slug", slug).limit(2),
    db.from("webinars").select("id").eq("slug", slug).limit(1),
  ]);
  const otherTest = (tests.data ?? []).some((t) => t.id !== exceptTestId);
  return otherTest || (webinars.data ?? []).length > 0;
}

export type AbTestSummary = { test: AbTestRow; variants: AbTestVariantRow[]; metrics: TestMetrics; evaluation: Evaluation };

/** Os testes da organização, com as variantes e as métricas de cada um. */
export const listAbTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ organizationId: uuid }).parse(data))
  .handler(async ({ data, context }): Promise<AbTestSummary[]> => {
    await memberRole(context.supabase, data.organizationId, context.userId);
    const db = await admin();
    const { data: tests, error } = await db
      .from("ab_tests")
      .select("*")
      .eq("organization_id", data.organizationId)
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível ler os testes.");
    const rows = (tests ?? []) as AbTestRow[];
    if (rows.length === 0) return [];
    const variants = await loadVariants(rows.map((t) => t.id));
    const metrics = await Promise.all(rows.map((t) => metricsOf(t.id).catch(() => parseMetrics(null))));
    return rows.map((test, i) => {
      const m = metrics[i]!;
      return { test, variants: variants.filter((v) => v.ab_test_id === test.id), metrics: m, evaluation: evaluation(test, m) };
    });
  });

export type AbTestDetail = AbTestSummary & { history: AbTestHistoryRow[] };

/** Um teste com tudo: variantes e webinars, histórico, métricas e avaliação. */
export const getAbTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ testId: uuid }).parse(data))
  .handler(async ({ data, context }): Promise<AbTestDetail> => {
    const test = await loadTest(data.testId);
    await memberRole(context.supabase, test.organization_id, context.userId);
    const db = await admin();
    const [variants, metrics, log] = await Promise.all([
      loadVariants([test.id]),
      metricsOf(test.id),
      db.from("ab_test_history").select("id, action, actor_id, details, created_at").eq("ab_test_id", test.id).order("created_at", { ascending: false }).limit(50),
    ]);
    return { test, variants, metrics, evaluation: evaluation(test, metrics), history: (log.data ?? []) as AbTestHistoryRow[] };
  });

/** Cria um teste: endereço livre, dois ou mais webinars da organização, tráfego a somar 100%. */
export const createAbTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ organizationId: uuid }).and(createAbTestInput).parse(data))
  .handler(async ({ data, context }) => {
    await memberRole(context.supabase, data.organizationId, context.userId, true);
    if (await slugTaken(data.slug)) throw new Error("Esse endereço já está a ser usado por outro teste ou por um webinar.");
    const db = await admin();
    const webinarIds = data.variants.map((v) => v.webinarId);
    const { data: owned } = await db.from("webinars").select("id").eq("organization_id", data.organizationId).in("id", webinarIds);
    if ((owned ?? []).length !== new Set(webinarIds).size) throw new Error("Todos os webinars têm de ser desta organização.");

    const now = new Date().toISOString();
    const { data: created, error } = await db
      .from("ab_tests")
      .insert({
        organization_id: data.organizationId,
        created_by: context.userId,
        name: data.name,
        slug: data.slug,
        type: "webinar",
        objective: data.objective,
        product_name: data.productName,
        status: data.start ? "active" : "draft",
        minimum_visitors: data.minimumVisitors,
        minimum_conversions: data.minimumConversions,
        minimum_duration_days: data.minimumDurationDays,
        confidence_threshold: data.confidenceThreshold,
        assignment_mode: data.assignmentMode,
        started_at: data.start ? now : null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.code === "23505" ? "Esse endereço já está a ser usado." : "Não foi possível criar o teste.");

    const { error: variantsError } = await db.from("ab_test_variants").insert(
      data.variants.map((v, i) => ({
        ab_test_id: created.id,
        organization_id: data.organizationId,
        label: variantLabel(i),
        name: v.name,
        webinar_id: v.webinarId,
        traffic_percentage: v.trafficPercentage,
        position: i,
      })),
    );
    if (variantsError) {
      await db.from("ab_tests").delete().eq("id", created.id);
      throw new Error("Não foi possível guardar as variantes.");
    }
    await history(created.id, data.organizationId, context.userId, "created", { slug: data.slug, objective: data.objective });
    if (data.start) await history(created.id, data.organizationId, context.userId, "started");
    return { id: created.id };
  });

const ACTIONS = {
  start: { from: ["draft"], to: "active", log: "started" },
  pause: { from: ["active"], to: "paused", log: "paused" },
  resume: { from: ["paused"], to: "active", log: "resumed" },
  complete: { from: ["active", "paused"], to: "completed", log: "completed" },
  archive: { from: ["draft", "paused", "completed"], to: "archived", log: "archived" },
} as const;

/** Iniciar, pausar, retomar, concluir ou arquivar. */
export const updateAbTestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ testId: uuid, action: z.enum(["start", "pause", "resume", "complete", "archive"]) }).parse(data))
  .handler(async ({ data, context }) => {
    const test = await loadTest(data.testId);
    await memberRole(context.supabase, test.organization_id, context.userId, true);
    const rule = ACTIONS[data.action];
    const current = statusOf(test.status);
    if (!(rule.from as readonly string[]).includes(current)) throw new Error(`Não é possível ${data.action === "start" ? "iniciar" : data.action === "pause" ? "pausar" : data.action === "resume" ? "retomar" : data.action === "complete" ? "concluir" : "arquivar"} um teste ${current === "draft" ? "em rascunho" : current === "active" ? "ativo" : current === "paused" ? "em pausa" : current === "completed" ? "concluído" : "arquivado"}.`);
    const db = await admin();
    const now = new Date().toISOString();
    const patch: Database["public"]["Tables"]["ab_tests"]["Update"] = { status: rule.to };
    if (data.action === "start") patch.started_at = test.started_at ?? now;
    if (data.action === "complete" || data.action === "archive") patch.ended_at = test.ended_at ?? now;
    const { error } = await db.from("ab_tests").update(patch).eq("id", test.id);
    if (error) throw new Error("Não foi possível alterar o estado.");
    await history(test.id, test.organization_id, context.userId, rule.log);
    return { status: rule.to };
  });

/** Aplica a vencedora: o endereço do teste passa a entregar sempre essa variante, e o teste fica concluído. */
export const applyWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ testId: uuid, variantId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const test = await loadTest(data.testId);
    await memberRole(context.supabase, test.organization_id, context.userId, true);
    const variants = await loadVariants([test.id]);
    const winner = variants.find((v) => v.id === data.variantId);
    if (!winner) throw new Error("Essa variante não é deste teste.");
    const db = await admin();
    const now = new Date().toISOString();
    const { error } = await db
      .from("ab_tests")
      .update({ applied_variant_id: winner.id, status: "completed", ended_at: test.ended_at ?? now })
      .eq("id", test.id);
    if (error) throw new Error("Não foi possível aplicar a vencedora.");
    // O tráfego passa todo para ela: fica claro na lista o que o endereço entrega.
    await Promise.all(variants.map((v) => db.from("ab_test_variants").update({ traffic_percentage: v.id === winner.id ? 100 : 0 }).eq("id", v.id)));
    await history(test.id, test.organization_id, context.userId, "winner_applied", { variant: winner.label, webinar_id: winner.webinar_id });
    return { ok: true };
  });

/** Uma cópia em rascunho, com as mesmas variantes e regras, sem dados. */
export const duplicateAbTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ testId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const test = await loadTest(data.testId);
    await memberRole(context.supabase, test.organization_id, context.userId, true);
    const variants = await loadVariants([test.id]);
    const db = await admin();
    const base = test.slug.replace(/-copia(-\d+)?$/, "").slice(0, 40);
    let slug = `${base}-copia`;
    for (let n = 2; await slugTaken(slug); n += 1) slug = `${base}-copia-${n}`;
    const { data: created, error } = await db
      .from("ab_tests")
      .insert({
        organization_id: test.organization_id,
        created_by: context.userId,
        name: `${test.name} (cópia)`.slice(0, 120),
        slug,
        type: test.type,
        objective: test.objective,
        product_name: test.product_name,
        status: "draft",
        minimum_visitors: test.minimum_visitors,
        minimum_conversions: test.minimum_conversions,
        minimum_duration_days: test.minimum_duration_days,
        confidence_threshold: test.confidence_threshold,
        assignment_mode: test.assignment_mode,
        parent_test_id: test.id,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("Não foi possível duplicar o teste.");
    const { error: variantsError } = await db.from("ab_test_variants").insert(
      variants.map((v, i) => ({
        ab_test_id: created.id,
        organization_id: test.organization_id,
        label: v.label || variantLabel(i),
        name: v.name,
        webinar_id: v.webinar_id,
        // Uma cópia volta a dividir o tráfego por igual: a vencedora anterior já não conta.
        traffic_percentage: Math.floor(100 / variants.length) + (i === 0 ? 100 - Math.floor(100 / variants.length) * variants.length : 0),
        position: i,
      })),
    );
    if (variantsError) {
      await db.from("ab_tests").delete().eq("id", created.id);
      throw new Error("Não foi possível copiar as variantes.");
    }
    await history(created.id, test.organization_id, context.userId, "duplicated", { from: test.id });
    return { id: created.id };
  });
