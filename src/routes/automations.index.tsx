import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RunSheet } from "@/components/automation-runs";
import { Button } from "@/components/ui/button";
import { WorkflowList } from "@/components/workflow/workflow-list";
import { useAutomationRun, useAutomations, useAutomationStats, useWorkflows, useWorkspace } from "@/lib/data";

type Search = { run?: string | undefined };

export const Route = createFileRoute("/automations/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Automações | Novawebinar" },
      { name: "description", content: "Um fluxo por webinar: primeiro configura-se, depois desenha-se." },
    ],
  }),
  component: AutomationsPage,
});

/** A lista dos fluxos. O resto (execuções, configuração, captura) vive dentro de cada fluxo. */
function AutomationsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const { data: automations = [] } = useAutomations(orgId);
  const { data: workflows = [], isLoading } = useWorkflows(orgId);
  const { data: stats } = useAutomationStats(orgId);
  const { data: linkedRun } = useAutomationRun(search.run);

  return (
    <AppShell
      title="Automações"
      description="Um fluxo por webinar, com as mensagens de antes, do dia e de depois da sessão."
      action={
        // Sem fluxos, a lista mostra o estado vazio com o seu «Novo fluxo».
        (isLoading || workflows.length > 0) && (
          <Button asChild>
            <Link to="/automations/new">
              <Plus /> Novo fluxo
            </Link>
          </Button>
        )
      }
    >
      <WorkflowList workflows={workflows} automations={automations} stats={stats} loading={isLoading} />
      <RunSheet run={linkedRun ?? null} onClose={() => void navigate({ search: { run: undefined }, replace: true })} />
    </AppShell>
  );
}
