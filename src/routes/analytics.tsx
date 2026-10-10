import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Radio } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AnalyticsBoard } from "@/components/audience-insights";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAnalytics } from "@/lib/analytics";
import { useWebinars, useWorkspace } from "@/lib/data";
import { RANGE_OPTIONS, resolveRange, type RangePreset } from "@/lib/date-range";

const PRESETS = new Set(RANGE_OPTIONS.map((o) => o.value));

export const Route = createFileRoute("/analytics")({
  validateSearch: (search: Record<string, unknown>): { webinar?: string | undefined; periodo?: RangePreset | undefined } => ({
    ...(typeof search["webinar"] === "string" ? { webinar: search["webinar"] } : {}),
    ...(PRESETS.has(search["periodo"] as RangePreset) ? { periodo: search["periodo"] as RangePreset } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Análises | Novawebinar" },
      { name: "description", content: "Inscritos, presença, funil, origem e vendas da audiência real." },
      { property: "og:title", content: "Análises | Novawebinar" },
      { property: "og:description", content: "Analise presença, origem e conversão da audiência real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: workspace } = useWorkspace();
  const organizationId = workspace?.organizationId;
  const { webinar, periodo = "todos" } = Route.useSearch();
  const navigate = useNavigate();
  const { data: webinars = [] } = useWebinars(organizationId);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = useMemo(() => resolveRange(periodo, customFrom, customTo), [periodo, customFrom, customTo]);
  const { data, isLoading } = useAnalytics(organizationId, webinar, range);
  const selected = webinar ? webinars.find((w) => w.id === webinar) : undefined;

  const setSearch = (next: { webinar?: string | undefined; periodo?: RangePreset }) => {
    const merged = { webinar, periodo, ...next };
    void navigate({
      to: "/analytics",
      search: {
        ...(merged.webinar ? { webinar: merged.webinar } : {}),
        ...(merged.periodo && merged.periodo !== "todos" ? { periodo: merged.periodo } : {}),
      },
    });
  };

  return (
    <AppShell
      title="Análises"
      description={
        selected
          ? `${selected.public_title || selected.internal_name}: presença, origem e vendas.`
          : "Presença, origem e vendas de todos os webinars."
      }
      action={false}
    >
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Select value={periodo} onValueChange={(value) => setSearch({ periodo: value as RangePreset })}>
          <SelectTrigger className="w-[180px]" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={webinar ?? "todos"} onValueChange={(value) => setSearch({ webinar: value === "todos" ? undefined : value })}>
          <SelectTrigger className="w-[min(260px,100%)]" aria-label="Webinar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os webinars</SelectItem>
            {webinars.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.public_title || w.internal_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {periodo === "personalizado" && (
          <>
            <Input type="date" aria-label="De" className="w-[150px]" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <Input type="date" aria-label="Até" className="w-[150px]" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        )}
        <Button variant="ghost" className="ml-auto" asChild>
          <Link to="/live-view" search={webinar ? { webinar } : {}}>
            <Radio />
            Vista ao vivo
          </Link>
        </Button>
      </div>

      <div className="mb-28 md:mb-0">
        <AnalyticsBoard data={data} loading={isLoading || !organizationId} webinarId={webinar} />
      </div>
    </AppShell>
  );
}
