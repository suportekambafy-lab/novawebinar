/**
 * O teste A/B a correr, dentro do hero do Painel: o nome, cada variante com a fatia de visitantes e o
 * resultado no objectivo do teste, quem vai à frente e com que confiança, e a ligação para o teste.
 * Com vários testes activos mostra o do webinar em destaque (ou o mais recente) e diz quantos há mais.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, FlaskConical, Trophy } from "lucide-react";
import { pct, variantColor } from "@/components/ab-tests/parts";
import type { AbTestSummary } from "@/lib/ab-tests/ab-tests.functions";
import { formatMeasure, measureOf, objectiveInfo, VERDICT_LABEL, type Objective } from "@/lib/ab-tests/stats";
import { cn } from "@/lib/utils";

export function pickHeroTest(tests: AbTestSummary[] | undefined, webinarId: string | null) {
  const active = (tests ?? []).filter((t) => t.test.status === "active");
  const featured =
    (webinarId && active.find((t) => t.variants.some((v) => v.webinar_id === webinarId))) || active[0] || null;
  return { featured, others: Math.max(0, active.length - 1) };
}

export function AbHeroCard({ summary, others }: { summary: AbTestSummary; others: number }) {
  const { test, metrics, evaluation } = summary;
  const objective = test.objective as Objective;
  const total = metrics.variants.reduce((sum, v) => sum + v.visitors, 0);
  const best = evaluation.best;
  const lift = evaluation.comparison?.lift;
  const confident = evaluation.verdict === "consistent";
  return (
    <Link
      to="/ab-tests/$testId"
      params={{ testId: test.id }}
      className="group/ab block w-full rounded-2xl bg-black/45 p-4 ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/55 hover:ring-white/30 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/12 px-2.5 py-1 text-[12px] font-medium">
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#5BD68A]/70 motion-reduce:animate-none" />
            <span className="relative size-2 rounded-full bg-[#5BD68A]" />
          </span>
          Teste A/B a correr
        </span>
        <FlaskConical className="size-4 text-white/60" strokeWidth={1.75} aria-hidden />
      </div>
      <p className="mt-3 truncate text-[16px] font-semibold">{test.name}</p>
      <p className="text-[12px] text-white/60">{objectiveInfo(objective).label}</p>

      <ul className="mt-3 flex flex-col gap-2.5">
        {metrics.variants.map((v) => {
          const share = total > 0 ? v.visitors / total : 0;
          const leading = best?.id === v.id;
          return (
            <li key={v.id}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: variantColor(v.position) }} aria-hidden />
                  <span className="font-medium">{v.label}</span>
                  {v.webinarTitle && <span className="truncate text-white/55">· {v.webinarTitle}</span>}
                  {leading && <Trophy className="size-3.5 shrink-0 text-[#FFC46B]" strokeWidth={2} aria-label="à frente" />}
                </span>
                <span className="shrink-0 tabular-nums">
                  <b className="font-semibold">{formatMeasure(measureOf(v, objective))}</b>
                  <span className="text-white/55"> · {v.visitors}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/12" aria-hidden>
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${Math.round(share * 100)}%`, background: variantColor(v.position) }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-[12.5px]">
        <span className={cn("min-w-0 truncate", confident ? "text-[#5BD68A]" : "text-white/70")}>
          {VERDICT_LABEL[evaluation.verdict]}
          {best && lift !== undefined && evaluation.comparison
            ? ` · ${best.label} ${Number.isFinite(lift) ? `${lift >= 0 ? "+" : ""}${pct(lift, 0)}` : "à frente"} · ${Math.round(evaluation.comparison.confidence)}%`
            : total > 0
              ? ` · ${total} visitantes`
              : ""}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-white">
          Ver teste
          <ArrowRight className="size-3.5 transition-transform group-hover/ab:translate-x-0.5" strokeWidth={2} aria-hidden />
        </span>
      </div>
      {others > 0 && (
        <p className="mt-2 text-[12px] text-white/55">
          e mais {others} {others === 1 ? "teste a correr" : "testes a correr"}
        </p>
      )}
    </Link>
  );
}
