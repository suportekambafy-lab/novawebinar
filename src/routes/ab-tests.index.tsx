import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AbStatusBadge, VariantDot, pct } from "@/components/ab-tests/parts";
import { EmptySection, Metric } from "@/components/page-primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbTests } from "@/lib/ab-tests/hooks";
import { measureOf, objectiveInfo, VERDICT_LABEL, formatMeasure, type Objective } from "@/lib/ab-tests/stats";
import { useWorkspace } from "@/lib/data";

export const Route = createFileRoute("/ab-tests/")({
  head: () => ({
    meta: [
      { title: "Testes A/B | Novawebinar" },
      { name: "description", content: "Dois webinars no mesmo endereço: qual converte melhor." },
    ],
  }),
  component: AbTestsPage,
});

function AbTestsPage() {
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const { data: tests = [], isLoading } = useAbTests(orgId);

  const active = tests.filter((t) => t.test.status === "active");
  const visitors = tests.reduce((sum, t) => sum + t.metrics.variants.reduce((s, v) => s + v.visitors, 0), 0);
  const buyers = tests.reduce((sum, t) => sum + t.metrics.variants.reduce((s, v) => s + v.buyers, 0), 0);
  const consistent = tests.filter((t) => t.evaluation.verdict === "consistent").length;

  return (
    <AppShell
      title="Testes A/B"
      description="Um endereço, dois webinars: quem o abre vê sempre a mesma variante, e o teste diz qual converte melhor."
      action={
        (isLoading || tests.length > 0) && (
          <Button asChild>
            <Link to="/ab-tests/new">
              <Plus /> Novo teste
            </Link>
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Testes ativos" value={isLoading ? "…" : String(active.length)} icon={FlaskConical} />
          <Metric label="Visitantes em teste" value={isLoading ? "…" : visitors.toLocaleString("pt-PT")} change="Quem abriu um endereço de teste" />
          <Metric label="Compras em teste" value={isLoading ? "…" : buyers.toLocaleString("pt-PT")} change="Cruzadas pelo e-mail do comprador" />
          <Metric label="Resultados consistentes" value={isLoading ? "…" : String(consistent)} change="Chegaram ao limiar de confiança" />
        </div>

        <div className="overflow-hidden rounded-card bg-card">
          <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <h2 className="text-base font-semibold tracking-[var(--tracking-title)]">Os seus testes</h2>
            {!isLoading && <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">{tests.length} {tests.length === 1 ? "teste" : "testes"}</p>}
          </div>
          {isLoading ? (
            <div className="space-y-3 px-6 pb-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : tests.length === 0 ? (
            <EmptySection
              icon={FlaskConical}
              title="Ainda sem testes"
              description="Escolha dois webinars, dê um endereço ao teste e divida o tráfego. O resto conta-se sozinho."
              action={
                <Button asChild>
                  <Link to="/ab-tests/new">
                    <Plus /> Novo teste
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {tests.map(({ test, metrics, evaluation }) => {
                const objective = objectiveInfo(test.objective);
                return (
                  <li key={test.id}>
                    <Link to="/ab-tests/$testId" params={{ testId: test.id }} className="grid gap-3 px-5 py-4 transition-colors hover:bg-gray-50 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{test.name}</p>
                        <p className="truncate text-[13px] text-muted-foreground">/w/{test.slug} · {objective.label}</p>
                      </div>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums">
                        {metrics.variants.map((v) => (
                          <li key={v.id} className="inline-flex items-center gap-1.5">
                            <VariantDot position={v.position} />
                            <span className="text-muted-foreground">{v.label}</span>
                            <b className="font-semibold">{formatMeasure(measureOf(v, test.objective as Objective))}</b>
                            <span className="text-muted-foreground">({v.visitors})</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[13px] text-muted-foreground">
                        {VERDICT_LABEL[evaluation.verdict]}
                        {evaluation.comparison && evaluation.best ? ` · ${evaluation.best.label} ${evaluation.comparison.lift >= 0 ? "+" : ""}${Number.isFinite(evaluation.comparison.lift) ? pct(evaluation.comparison.lift, 0) : "à frente"} · ${Math.round(evaluation.comparison.confidence)}%` : ""}
                      </p>
                      <AbStatusBadge status={test.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
