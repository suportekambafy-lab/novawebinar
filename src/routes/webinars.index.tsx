import { createFileRoute } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptySection, WebinarTable } from "@/components/page-primitives";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lifecycleOf, useWebinars, useWorkspace } from "@/lib/data";
import type { WebinarLifecycle } from "@/lib/schedule";

export const Route = createFileRoute("/webinars/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? (search["q"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Webinars | Novawebinar" },
      { name: "description", content: "Crie, organize e acompanhe todos os seus webinars." },
      { property: "og:title", content: "Webinars | Novawebinar" },
      { property: "og:description", content: "Gestão completa de webinars." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebinarsPage,
});

/** Os separadores seguem o ciclo de vida calculado, nunca o estado guardado. */
const filters: { value: string; label: string; match?: (l: WebinarLifecycle) => boolean }[] = [
  { value: "todos", label: "Todos" },
  {
    value: "agendados",
    label: "Agendados e em andamento",
    match: (l) => l.kind === "session" && l.state !== "finished",
  },
  { value: "terminados", label: "Terminados", match: (l) => l.kind === "session" && l.state === "finished" },
  { value: "sempre", label: "Sob demanda", match: (l) => l.kind === "on_demand" || l.kind === "jit" },
  { value: "rascunhos", label: "Inativos", match: (l) => l.kind === "draft" },
];

function WebinarsPage() {
  const { data: workspace } = useWorkspace();
  const { data: webinars = [], isPending } = useWebinars(workspace?.organizationId);
  // Enquanto o espaço de trabalho ou a lista carregam, nada de «ainda não criou nenhum webinar».
  const isLoading = !workspace || isPending;
  const [tab, setTab] = useState("todos");
  const { q } = Route.useSearch();

  const active = filters.find((f) => f.value === tab);
  const byStatus = active?.match ? webinars.filter((w) => active.match!(lifecycleOf(w))) : webinars;
  const term = (q ?? "").trim().toLowerCase();
  const rows = term
    ? byStatus.filter((w) =>
        `${w.internal_name ?? ""} ${w.public_title ?? ""}`.toLowerCase().includes(term),
      )
    : byStatus;

  const none = !isLoading && webinars.length === 0;
  return (
    // Sem webinars, a única acção é a do estado vazio.
    <AppShell
      title="Webinars"
      description="Crie, edite e acompanhe todos os seus webinars."
      action={!none}
    >
      {!none && (
        <Tabs value={tab} onValueChange={setTab} className="mb-5">
          <TabsList>
            {filters.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {none ? (
        <EmptySection
          icon={Video}
          title="Ainda não criou nenhum webinar"
          description="O primeiro webinar junta o vídeo, o horário, o chat e a oferta."
          actionLabel="Criar webinar"
          actionTo="/webinars/new"
        />
      ) : (
        <WebinarTable
          rows={rows}
          title={term ? `Resultados para "${q}"` : "Todos os webinars"}
          loading={isLoading}
        />
      )}
    </AppShell>
  );
}
