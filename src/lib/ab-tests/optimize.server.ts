/**
 * A passagem diária da optimização automática, no servidor. Corre quando alguém abre a lista ou o painel e,
 * para não depender disso, também quando um visitante abre o endereço de um teste ativo (uma vez por dia por
 * teste). Lê as métricas, decide o plano (optimize.ts), aplica as fatias e deixa a razão no histórico.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { optimizedRecently, planRebalance, warmupOver, type Arm } from "./optimize";
import { measureOf, parseMetrics, type Objective } from "./stats";

export type OptimizableTest = {
  id: string;
  organization_id: string;
  status: string;
  objective: string;
  auto_optimize: boolean | null;
  auto_optimize_after_days: number | null;
  optimized_at: string | null;
  started_at: string | null;
  applied_variant_id: string | null;
};

/** Está na hora de optimizar este teste? Barato: não lê métricas. */
export function optimizationDue(test: OptimizableTest, nowMs = Date.now()): boolean {
  return Boolean(
    test.auto_optimize &&
      test.status === "active" &&
      !test.applied_variant_id &&
      warmupOver(test.started_at, test.auto_optimize_after_days ?? 7, nowMs) &&
      !optimizedRecently(test.optimized_at, nowMs),
  );
}

/**
 * Faz a passagem de hoje se estiver na hora. Devolve se mudou o tráfego. Nunca lança: uma falha aqui não
 * pode travar nem a sala nem o painel.
 */
export async function optimizeTestIfDue(test: OptimizableTest, nowMs = Date.now()): Promise<boolean> {
  if (!optimizationDue(test, nowMs)) return false;
  try {
    // Marca já a passagem: dois pedidos ao mesmo tempo não optimizam duas vezes.
    const { data: claimed } = await supabaseAdmin
      .from("ab_tests")
      .update({ optimized_at: new Date(nowMs).toISOString() })
      .eq("id", test.id)
      .or(`optimized_at.is.null,optimized_at.lt.${new Date(nowMs - 86_400_000).toISOString()}`)
      .select("id");
    if (!claimed?.length) return false;

    const [{ data: variants }, { data: raw }] = await Promise.all([
      supabaseAdmin.from("ab_test_variants").select("id, label, traffic_percentage, position").eq("ab_test_id", test.id).order("position"),
      supabaseAdmin.rpc("ab_test_metrics", { p_test: test.id }),
    ]);
    const metrics = parseMetrics(raw);
    const arms: Arm[] = (variants ?? [])
      .map((v) => {
        const m = metrics.variants.find((x) => x.id === v.id);
        return m ? { id: v.id, label: v.label, traffic: v.traffic_percentage, measure: measureOf(m, test.objective as Objective) } : null;
      })
      .filter((a): a is Arm => a !== null);
    const plan = planRebalance(arms);
    if (plan.changed) {
      await Promise.all(arms.map((a) => supabaseAdmin.from("ab_test_variants").update({ traffic_percentage: plan.next[a.id]! }).eq("id", a.id)));
    }
    await supabaseAdmin.from("ab_test_history").insert({
      ab_test_id: test.id,
      organization_id: test.organization_id,
      actor_id: null,
      action: plan.changed ? "auto_rebalanced" : "auto_checked",
      details: { reason: plan.reason, leader: plan.leader?.label ?? null, confidence: Math.round(plan.confidence * 100), next: plan.next },
    });
    return plan.changed;
  } catch (error) {
    console.error("[ab] optimização falhou", error);
    return false;
  }
}
