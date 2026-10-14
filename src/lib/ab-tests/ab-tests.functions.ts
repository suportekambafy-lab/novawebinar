import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAbTestInput, statusOf, updateAbTestInput, variantLabel, type AbTestHistoryRow, type AbTestRow, type AbTestVariantRow } from "./model";
import { optimizeTestIfDue } from "./optimize.server";
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

/** Aplica a vencedora: o endereço passa a entregar sempre essa variante, o tráfego vai todo para ela, o teste conclui. */
async function applyWinnerRow(test: AbTestRow, variants: AbTestVariantRow[], winner: AbTestVariantRow, actorId: string | null, action: "winner_applied" | "auto_winner_applied") {
  const db = await admin();
  const now = new Date().toISOString();
  const { error } = await db
    .from("ab_tests")
    .update({ applied_variant_id: winner.id, status: "completed", ended_at: test.ended_at ?? now })
    .eq("id", test.id);
  if (error) throw new Error("Não foi possível aplicar a vencedora.");
  await Promise.all(variants.map((v) => db.from("ab_test_variants").update({ traffic_percentage: v.id === winner.id ? 100 : 0 }).eq("id", v.id)));
  await history(test.id, test.organization_id, actorId, action, { variant: winner.label, webinar_id: winner.webinar_id });
}

/**
 * Com «aplicar a vencedora sozinho» ligado: assim que um teste ativo chega a «resultado consistente», a
 * melhor variante fica aplicada. Corre quando alguém abre o painel ou a lista; não precisa de relógio.
 */
async function maybeAutoApply(test: AbTestRow, variants: AbTestVariantRow[], ev: Evaluation): Promise<boolean> {
  if (!test.auto_winner || statusOf(test.status) !== "active" || ev.verdict !== "consistent" || !ev.best) return false;
  const winner = variants.find((v) => v.id === ev.best!.id);
  if (!winner) return false;
  await applyWinnerRow(test, variants, winner, null, "auto_winner_applied");
  return true;
}

/** O dia (AAAA-MM-DD) no fuso do servidor, o mesmo em que `since` começa à meia-noite. */
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Visitantes por dia e por variante nos últimos 14 dias (para o gráfico do painel). */
async function dailyOf(testId: string, variants: AbTestVariantRow[]) {
  const db = await admin();
  // Os últimos 14 dias com hoje incluído: começa há 13 dias.
  const since = new Date(Date.now() - 13 * 86_400_000);
  since.setHours(0, 0, 0, 0);
  const { data } = await db
    .from("ab_test_assignments")
    .select("variant_id, assigned_at")
    .eq("ab_test_id", testId)
    .gte("assigned_at", since.toISOString())
    .order("assigned_at")
    .limit(20_000);
  const days: { day: string; counts: Record<string, number> }[] = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(since.getTime() + i * 86_400_000 + 12 * 3_600_000);
    days.push({ day: localDay(d), counts: Object.fromEntries(variants.map((v) => [v.label, 0])) });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  const labelOf = new Map(variants.map((v) => [v.id, v.label]));
  for (const row of data ?? []) {
    const entry = byDay.get(localDay(new Date(row.assigned_at)));
    const label = labelOf.get(row.variant_id);
    if (entry && label) entry.counts[label] = (entry.counts[label] ?? 0) + 1;
  }
  return days;
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
    // A passagem diária da optimização, se estiver na hora (muda só as fatias; as métricas ficam iguais).
    const optimized = await Promise.all(rows.map((t) => optimizeTestIfDue(t)));
    const variants = await loadVariants(rows.map((t) => t.id));
    const metrics = await Promise.all(rows.map((t) => metricsOf(t.id).catch(() => parseMetrics(null))));
    const out: AbTestSummary[] = [];
    for (const [i, test] of rows.entries()) {
      const m = metrics[i]!;
      const own = variants.filter((v) => v.ab_test_id === test.id);
      const ev = evaluation(test, m);
      const applied = await maybeAutoApply(test, own, ev);
      const fresh = applied || optimized[i];
      out.push({ test: fresh ? await loadTest(test.id) : test, variants: applied ? await loadVariants([test.id]) : own, metrics: m, evaluation: ev });
    }
    return out;
  });

export type AbTestDetail = AbTestSummary & { history: AbTestHistoryRow[]; daily: { day: string; counts: Record<string, number> }[] };

/** Um teste com tudo: variantes e webinars, histórico, métricas e avaliação. */
export const getAbTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ testId: uuid }).parse(data))
  .handler(async ({ data, context }): Promise<AbTestDetail> => {
    let test = await loadTest(data.testId);
    await memberRole(context.supabase, test.organization_id, context.userId);
    const db = await admin();
    if (await optimizeTestIfDue(test)) test = await loadTest(test.id);
    let variants = await loadVariants([test.id]);
    const metrics = await metricsOf(test.id);
    const ev = evaluation(test, metrics);
    if (await maybeAutoApply(test, variants, ev)) {
      test = await loadTest(test.id);
      variants = await loadVariants([test.id]);
    }
    const [log, daily] = await Promise.all([
      db.from("ab_test_history").select("id, action, actor_id, details, created_at").eq("ab_test_id", test.id).order("created_at", { ascending: false }).limit(50),
      dailyOf(test.id, variants),
    ]);
    return { test, variants, metrics, evaluation: ev, history: (log.data ?? []) as AbTestHistoryRow[], daily };
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
    await applyWinnerRow(test, variants, winner, context.userId, "winner_applied");
    return { ok: true };
  });

/** Muda as definições de um teste e, se vier, a divisão do tráfego (também com o teste a correr). */
export const updateAbTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ testId: uuid }).and(updateAbTestInput).parse(data))
  .handler(async ({ data, context }) => {
    const test = await loadTest(data.testId);
    await memberRole(context.supabase, test.organization_id, context.userId, true);
    if (statusOf(test.status) === "archived") throw new Error("Um teste arquivado não se altera.");
    const db = await admin();
    const patch: Database["public"]["Tables"]["ab_tests"]["Update"] = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.objective !== undefined) patch.objective = data.objective;
    if (data.productName !== undefined) patch.product_name = data.productName;
    if (data.minimumVisitors !== undefined) patch.minimum_visitors = data.minimumVisitors;
    if (data.minimumConversions !== undefined) patch.minimum_conversions = data.minimumConversions;
    if (data.minimumDurationDays !== undefined) patch.minimum_duration_days = data.minimumDurationDays;
    if (data.confidenceThreshold !== undefined) patch.confidence_threshold = data.confidenceThreshold;
    if (data.assignmentMode !== undefined) patch.assignment_mode = data.assignmentMode;
    if (data.autoWinner !== undefined) patch.auto_winner = data.autoWinner;
    if (data.autoOptimize !== undefined) patch.auto_optimize = data.autoOptimize;
    if (data.autoOptimizeAfterDays !== undefined) patch.auto_optimize_after_days = data.autoOptimizeAfterDays;
    if (Object.keys(patch).length) {
      const { error } = await db.from("ab_tests").update(patch).eq("id", test.id);
      if (error) throw new Error("Não foi possível guardar as definições.");
      await history(test.id, test.organization_id, context.userId, "updated", Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === null || typeof v === "object" ? String(v) : (v as string | number | boolean)])) as Record<string, string | number | null>);
    }
    if (data.traffic) {
      if (test.applied_variant_id) throw new Error("Com vencedora aplicada, o tráfego é todo dela.");
      const variants = await loadVariants([test.id]);
      const ids = new Set(variants.map((v) => v.id));
      if (data.traffic.length !== variants.length || data.traffic.some((t) => !ids.has(t.variantId)))
        throw new Error("As fatias têm de cobrir todas as variantes deste teste.");
      await Promise.all(data.traffic.map((t) => db.from("ab_test_variants").update({ traffic_percentage: t.trafficPercentage }).eq("id", t.variantId)));
      await history(test.id, test.organization_id, context.userId, "traffic_changed", Object.fromEntries(data.traffic.map((t) => [variants.find((v) => v.id === t.variantId)?.label ?? t.variantId, t.trafficPercentage])));
    }
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
