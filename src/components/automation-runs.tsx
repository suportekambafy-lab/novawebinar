import { Link } from "@tanstack/react-router";
import {
  CircleCheck,
  CircleX,
  Clock,
  Funnel,
  GitFork,
  Send,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { triggerLabel } from "@/components/automation-flow";
import { formatDateTime, useAutomationRuns, useWorkspace, type AutomationRun } from "@/lib/data";
import {
  AUTOMATION_EVENT,
  conditionHeld,
  conditionLabel,
  factsLabel,
  isSessionTrigger,
  MAX_ATTEMPTS,
  RUN_STATUS,
  runOutcome,
  triggerOfOccurrence,
  waitLabel,
  type Condition,
  type RunFacts,
  type RunStatus,
} from "@/lib/automations";
import { canOpenPath } from "@/lib/support/model";
import { nextAction, nodeMap, nodeTitle, readSteps, runLog, sendLabel } from "@/lib/workflow";
import { cn } from "@/lib/utils";

export function RunStatusBadge({ status }: { status: string }) {
  const info = RUN_STATUS[status as RunStatus] ?? { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export const runOutcomeText = (run: AutomationRun) => runOutcome(run, formatDateTime);

type RunResult = {
  http_status?: number | null;
  ms?: number;
  sandbox?: boolean;
  payload?: unknown;
  cancelled?: string;
  facts?: RunFacts;
};

/** O resultado numa etiqueta curta, para tabelas. */
function resultShort(run: AutomationRun) {
  const result = (run.result ?? {}) as RunResult;
  if (readSteps(run.automations?.steps)) {
    const next = nextAction({ ...run, automations: run.automations ?? null });
    if (next) return `Próximo: ${next.label}`;
    const sent = runLog(run).filter((e) => e.kind === "action").length;
    if (run.status === "done")
      return sent
        ? `${sent} mensage${sent === 1 ? "m" : "ns"}${result.sandbox ? " (teste)" : ""}`
        : "Sem mensagens";
  }
  if (run.status === "cancelled")
    return result.cancelled === "inactive" ? "Automação desligada" : "Deixou de cumprir";
  if (run.status === "waiting" && run.attempts === 0) return "—";
  if (result.http_status) return `HTTP ${result.http_status}${result.sandbox ? " (teste)" : ""}`;
  if (run.error) return "Sem resposta";
  return "—";
}

const contactName = (run: AutomationRun) => run.contacts?.name || run.contacts?.email || "Contacto";

/* ---------- Detalhe: evento → condições → espera → acção → resultado ---------- */

function SeqStep({
  icon: Icon,
  title,
  tone,
  last,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[2.25rem_1fr] gap-3">
      <span
        className={cn("z-10 flex size-9 items-center justify-center rounded-full", tone)}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      {!last && (
        <span
          className="absolute left-[1.1rem] top-9 h-[calc(100%-1.75rem)] w-px bg-border"
          aria-hidden
        />
      )}
      <div className="min-w-0 pb-5">
        <p className="text-xs text-muted-foreground">
          {title}
        </p>
        <div className="mt-1 space-y-1 text-sm">{children}</div>
      </div>
    </li>
  );
}

export function RunSheet({ run, onClose }: { run: AutomationRun | null; onClose: () => void }) {
  const { data: workspace } = useWorkspace();
  return (
    <Sheet open={Boolean(run)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {run && (
          <RunDetail run={run} canOpenAutomations={canOpenPath(workspace?.role, "/automations")} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RunDetail({
  run,
  canOpenAutomations,
}: {
  run: AutomationRun;
  canOpenAutomations: boolean;
}) {
  const result = (run.result ?? {}) as RunResult;
  const trigger = triggerOfOccurrence(run.occurrence_key) ?? run.automations?.trigger_event ?? "";
  const conditions = (run.automations?.conditions ?? []) as Condition[];
  const facts = run.facts as RunFacts;
  const webinar = run.webinars ? run.webinars.public_title || run.webinars.internal_name : null;
  const steps = readSteps(run.automations?.steps);
  const ok = run.status === "done";
  const bad = run.status === "failed";

  return (
    <>
      <SheetHeader>
        <SheetDescription className="text-xs">
          Execução de automação
        </SheetDescription>
        <SheetTitle className="text-xl">{contactName(run)}</SheetTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <RunStatusBadge status={run.status} />
          <span className="text-muted-foreground">{run.automations?.name ?? "Automação"}</span>
        </div>
        <p className="text-sm text-muted-foreground">{runOutcomeText(run)}</p>
      </SheetHeader>

      <ol className="mt-6">
        <SeqStep icon={Zap} title="Evento" tone="bg-primary/10 text-primary">
          <p className="font-medium">{triggerLabel(trigger)}</p>
          <p className="text-muted-foreground">
            {isSessionTrigger(trigger) && run.webinar_sessions?.ends_at
              ? `Fim da sessão às ${formatDateTime(run.webinar_sessions.ends_at)}`
              : `Registado às ${formatDateTime(run.created_at)}`}
            {webinar ? ` · ${webinar}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Evento #{run.event_id} · <code>{trigger}</code>
          </p>
        </SeqStep>

        {steps ? (
          <StepsLog run={run} conditions={conditions} facts={facts} />
        ) : (
          <>
            <SeqStep icon={Funnel} title="Condições" tone="bg-info/10 text-info">
              {conditions.length === 0 ? (
                <p>
                  Sem condições:{" "}
                  {isSessionTrigger(trigger)
                    ? "entram todos os inscritos na sessão."
                    : "entra a pessoa do evento."}
                </p>
              ) : (
                <ul className="space-y-1">
                  {conditions.map((c, i) => {
                    const held = conditionHeld(c, facts);
                    return (
                      <li key={i} className="flex items-center gap-2">
                        {held ? (
                          <CircleCheck className="size-4 text-success" aria-label="Verificada" />
                        ) : (
                          <CircleX
                            className="size-4 text-destructive"
                            aria-label="Não verificada"
                          />
                        )}
                        {conditionLabel(c)}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Porque entrou: {factsLabel(facts)}.</p>
            </SeqStep>

            <SeqStep icon={Clock} title="Espera" tone="bg-warning/15 text-warning-foreground">
              <p>{waitLabel(run.automations?.wait_minutes ?? 0)}</p>
              {/* Depois de uma falha, scheduled_for passa a ser a hora da nova tentativa; o fim da
              espera foi a primeira tentativa. */}
              {(() => {
                const waiting = run.status === "waiting";
                const retried = run.attempts > 1 || (run.attempts > 0 && waiting);
                return (
                  <p className="text-muted-foreground">
                    Pronta a partir de{" "}
                    {formatDateTime(retried && run.started_at ? run.started_at : run.scheduled_for)}
                    {retried &&
                      ` · ${waiting ? "próxima tentativa às" : "nova tentativa às"} ${formatDateTime(run.scheduled_for)}`}
                  </p>
                );
              })()}
              {run.status === "cancelled" && (
                <p className="text-muted-foreground">
                  As condições foram confirmadas outra vez no fim da espera e já não se verificavam.
                </p>
              )}
            </SeqStep>

            <SeqStep icon={Send} title="Acção" tone="bg-success/10 text-success">
              <p className="font-medium">Enviar para o webhook de saída</p>
              <p className="text-muted-foreground">
                Evento <code>{AUTOMATION_EVENT}</code> · tentativas {run.attempts} de {MAX_ATTEMPTS}
              </p>
              {run.started_at && (
                <p className="text-muted-foreground">
                  Iniciada às {formatDateTime(run.started_at)}
                </p>
              )}
            </SeqStep>
          </>
        )}

        <SeqStep
          icon={ok ? CircleCheck : bad ? CircleX : Clock}
          title="Resultado"
          tone={
            ok
              ? "bg-success/15 text-success"
              : bad
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
          }
          last
        >
          <p className="font-medium">
            {RUN_STATUS[run.status as RunStatus]?.label ?? run.status}
            {result.http_status ? ` · HTTP ${result.http_status}` : ""}
            {result.ms !== undefined ? ` em ${result.ms} ms` : ""}
          </p>
          {run.finished_at && (
            <p className="text-muted-foreground">Concluída às {formatDateTime(run.finished_at)}</p>
          )}
          {result.sandbox && (
            <p className="text-muted-foreground">
              Destino de teste: o envio foi simulado e nada saiu da plataforma.
            </p>
          )}
          {run.error && <p className="text-destructive">{run.error}</p>}
          {result.payload !== undefined && (
            <details className="pt-1">
              <summary className="cursor-pointer text-muted-foreground">
                Ver o que foi enviado
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(result.payload, null, 2)}
              </pre>
            </details>
          )}
        </SeqStep>
      </ol>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/contacts" search={{ contact: run.contact_id }}>
            Abrir o contacto
          </Link>
        </Button>
        {canOpenAutomations && run.automations?.workflow_id && (
          <Button asChild variant="outline" size="sm">
              <Link
                to="/automations/workflows/$workflowId"
                params={{ workflowId: run.automations.workflow_id }}
                search={{ a: run.automation_id }}
              >
                Abrir no fluxo
              </Link>
          </Button>
        )}
      </div>
    </>
  );
}

/* ---------- Execução com passos: o que já fez, onde está, o que vem a seguir ---------- */

const SEND_STATUS = {
  simulated: "simulado",
  delivered: "entregue",
  failed: "falhou",
  shared: "o grupo já a recebeu nesta sessão",
  skipped: "saltado",
} as const;

function StepsLog({
  run,
  conditions,
  facts,
}: {
  run: AutomationRun;
  conditions: Condition[];
  facts: RunFacts;
}) {
  const steps = readSteps(run.automations?.steps);
  const map = steps ? nodeMap(steps) : new Map();
  const guards = (Array.isArray(run.guards) ? run.guards : []) as Condition[];
  const next = nextAction({ ...run, automations: run.automations ?? null });
  return (
    <>
      <SeqStep icon={Funnel} title="Condições" tone="bg-info/10 text-info">
        {conditions.length === 0 ? (
          <p>Sem condições de entrada.</p>
        ) : (
          conditions.map((c, i) => (
            <p key={i} className="flex items-center gap-2">
              {conditionHeld(c, facts) ? (
                <CircleCheck className="size-4 text-success" />
              ) : (
                <CircleX className="size-4 text-destructive" />
              )}
              {conditionLabel(c)}
            </p>
          ))
        )}
        {guards.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Caminho escolhido (confirmado antes de cada mensagem):{" "}
            {guards.map((g) => conditionLabel(g).toLowerCase()).join(", ")}.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Quando entrou: {factsLabel(facts)}.</p>
      </SeqStep>
      {runLog(run).map((entry, i) => {
        const node = map.get(entry.node);
        const kind = KIND_TONE[entry.kind] ?? KIND_TONE["action"]!;
        return (
          <SeqStep key={i} icon={kind.icon} title={kind.title} tone={kind.tone}>
            <p className="font-medium">{node ? nodeTitle(node) : entry.node}</p>
            <p className="text-muted-foreground">
              {entry.outcome.startsWith("A aguardar até ")
                ? `A aguardar até ${formatDateTime(entry.outcome.slice("A aguardar até ".length))}`
                : entry.outcome}
            </p>
            {entry.sends?.map((s, j) => (
              <p key={j} className="text-xs">
                <span className="font-medium">
                  {sendLabel({ channel: s.channel, target: s.target })}
                </span>
                {s.to ? ` → ${s.to}` : ""} · {SEND_STATUS[s.status]}
                {s.http_status ? ` (HTTP ${s.http_status})` : ""}
              </p>
            ))}
            {(
              entry as { preview?: { channel: string; subject: string | null; message: string }[] }
            ).preview?.map((p, j) => (
              <p key={`p${j}`} className="rounded-md bg-muted px-2 py-1 text-xs">
                {p.subject ? <span className="font-medium">{p.subject} · </span> : null}
                {p.message}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
          </SeqStep>
        );
      })}
      {next && (
        <SeqStep icon={Clock} title="Próximo passo" tone="bg-primary/10 text-primary">
          <p className="font-medium">{next.label}</p>
          <p className="text-muted-foreground">
            {next.channels} ·{" "}
            {Date.parse(next.at) > Date.now() ? `às ${formatDateTime(next.at)}` : "a sair agora"}
          </p>
          {run.attempts > 0 && (
            <p className="text-xs text-muted-foreground">
              Tentativa {run.attempts} de {MAX_ATTEMPTS}
            </p>
          )}
        </SeqStep>
      )}
    </>
  );
}

const KIND_TONE: Record<string, { icon: LucideIcon; title: string; tone: string }> = {
  wait: { icon: Clock, title: "Espera", tone: "bg-warning/15 text-warning-foreground" },
  branch: { icon: GitFork, title: "Condição", tone: "bg-info/10 text-info" },
  action: { icon: Send, title: "Acção", tone: "bg-success/10 text-success" },
};

/* ---------- Tabela com filtros por estado ---------- */

export const RUN_FILTERS: { key: string; label: string; statuses: RunStatus[] | null }[] = [
  { key: "all", label: "Todas", statuses: null },
  { key: "waiting", label: "A aguardar", statuses: ["waiting"] },
  { key: "ready", label: "Prontas", statuses: ["ready", "running"] },
  { key: "done", label: "Executadas", statuses: ["done"] },
  { key: "failed", label: "Falharam", statuses: ["failed"] },
  { key: "cancelled", label: "Canceladas", statuses: ["cancelled"] },
];

export function RunsTable({
  runs,
  onOpen,
  showAutomation = true,
  empty,
}: {
  runs: AutomationRun[];
  onOpen: (run: AutomationRun) => void;
  showAutomation?: boolean;
  empty: string;
}) {
  const [filter, setFilter] = useState("all");
  const counts = useMemo(
    () =>
      Object.fromEntries(
        RUN_FILTERS.map((f) => [
          f.key,
          f.statuses
            ? runs.filter((r) => f.statuses!.includes(r.status as RunStatus)).length
            : runs.length,
        ]),
      ),
    [runs],
  );
  const statuses = RUN_FILTERS.find((f) => f.key === filter)?.statuses;
  const shown = statuses ? runs.filter((r) => statuses.includes(r.status as RunStatus)) : runs;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por estado">
        {RUN_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filter === f.key
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-muted",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {runs.length === 0 ? empty : "Nenhuma execução neste estado."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card bg-card">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {[
                  "Contacto",
                  ...(showAutomation ? ["Automação"] : []),
                  "Estado",
                  "Criada",
                  "Agendada",
                  "Executada",
                  "Tentativas",
                  "Resultado",
                ].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((run) => (
                <tr
                  key={run.id}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                  onClick={() => onOpen(run)}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(run)}
                  tabIndex={0}
                >
                  <td className="px-4 py-2.5">
                    <span className="block font-medium">{contactName(run)}</span>
                    {run.contacts?.email && run.contacts.name && (
                      <span className="text-xs text-muted-foreground">{run.contacts.email}</span>
                    )}
                  </td>
                  {showAutomation && (
                    <td className="px-4 py-2.5">{run.automations?.name ?? "—"}</td>
                  )}
                  <td className="px-4 py-2.5">
                    <RunStatusBadge status={run.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                    {formatDateTime(run.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                    {formatDateTime(run.scheduled_for)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                    {run.finished_at && run.status === "done"
                      ? formatDateTime(run.finished_at)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {run.attempts}/{MAX_ATTEMPTS}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5",
                      run.status === "failed" && "text-destructive",
                    )}
                  >
                    {resultShort(run)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- Na ficha do contacto e no Atendimento ---------- */

const CONTACT_GROUPS: { label: string; statuses: RunStatus[] }[] = [
  { label: "Em curso", statuses: ["waiting", "ready", "running"] },
  { label: "Executadas", statuses: ["done"] },
  { label: "Falharam", statuses: ["failed"] },
  { label: "Canceladas", statuses: ["cancelled"] },
];

/**
 * As automações de um contacto, por estado. Cada execução leva ao seu detalhe. Serve a ficha
 * do contacto e o Atendimento, com a mesma leitura (automation_runs).
 */
/**
 * Onde a pessoa está na jornada: o que cada automação com passos já fez (✓), onde está
 * agora (●) e a próxima acção. Lê as execuções reais e os passos do workflow.
 */
export function WorkflowPosition({ runs }: { runs: AutomationRun[] }) {
  const withSteps = runs.filter((r) => readSteps(r.automations?.steps));
  if (!withSteps.length) return null;
  const current = withSteps.filter((r) => ["waiting", "ready", "running"].includes(r.status));
  // Uma jornada por sessão (sem sessão: por webinar), a mais recente primeiro.
  const journeys = new Map<string, AutomationRun[]>();
  for (const run of withSteps) {
    const key = run.webinar_session_id ?? run.webinar_id ?? "";
    journeys.set(key, [run, ...(journeys.get(key) ?? [])]);
  }
  return (
    <div className="mb-3 space-y-2 rounded-xl border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">
        Posição na jornada
      </p>
      {[...journeys.values()].map((journey) => (
        <div key={journey[0]!.id} className="space-y-1.5">
          {journeys.size > 1 && (
            <p className="text-xs font-medium">
              {journey[0]!.webinars?.public_title ||
                journey[0]!.webinars?.internal_name ||
                "Sem webinar"}
              {journey[0]!.webinar_sessions?.starts_at
                ? ` · sessão de ${formatDateTime(journey[0]!.webinar_sessions.starts_at)}`
                : ""}
            </p>
          )}
          <ul className="space-y-1.5 text-sm">
            {journey.map((run) => {
              const steps = readSteps(run.automations?.steps)!;
              const map = nodeMap(steps);
              const done = runLog(run).filter(
                (e) => e.kind === "action" && e.sends?.every((x) => x.status !== "failed"),
              );
              const next = nextAction({ ...run, automations: run.automations ?? null });
              const live = ["waiting", "ready", "running"].includes(run.status);
              return (
                <li key={run.id}>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {done.map((e, i) => (
                      <span key={i} className="text-success">
                        ✓ {map.get(e.node) ? nodeTitle(map.get(e.node)!) : e.node}
                      </span>
                    ))}
                    {live ? (
                      <span className="font-semibold text-primary">
                        ● {run.automations?.name} activa
                      </span>
                    ) : run.status === "cancelled" ? (
                      <span className="text-muted-foreground">
                        ✕ {run.automations?.name}: parou (deixou de cumprir)
                      </span>
                    ) : run.status === "failed" ? (
                      <span className="text-destructive">✕ {run.automations?.name}: falhou</span>
                    ) : (
                      <span className="text-muted-foreground">
                        ✓ {run.automations?.name} concluída
                      </span>
                    )}
                  </span>
                  {live && next && (
                    <span className="block text-xs text-muted-foreground">
                      Próxima acção: {next.label} ({next.channels}){" "}
                      {Date.parse(next.at) > Date.now() ? `às ${formatDateTime(next.at)}` : "agora"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {current.length === 0 && (
        <p className="text-xs text-muted-foreground">Sem automações em curso neste momento.</p>
      )}
    </div>
  );
}

export function ContactAutomations({
  contactId,
  title = "Automações",
}: {
  contactId: string | null | undefined;
  title?: string;
}) {
  const { data: runs = [], isLoading } = useAutomationRuns({ contactId: contactId ?? null }, 50);
  const { data: workspace } = useWorkspace();
  const canOpen = canOpenPath(workspace?.role, "/automations");
  if (!contactId) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda não entrou em nenhuma automação.</p>
      ) : (
        <>
          <WorkflowPosition runs={runs} />
          <div className="mb-2 grid grid-cols-4 gap-1.5 text-center">
            {CONTACT_GROUPS.map((g) => (
              <div key={g.label} className="rounded-md bg-muted/60 px-1 py-1.5">
                <p className="text-base font-semibold tabular-nums">
                  {runs.filter((r) => g.statuses.includes(r.status as RunStatus)).length}
                </p>
                <p className="text-[0.7rem] text-muted-foreground">{g.label}</p>
              </div>
            ))}
          </div>
          <ul className="space-y-1.5">
            {runs.map((run) => {
              const body = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {run.automations?.name ?? "Automação"}
                    </span>
                    <RunStatusBadge status={run.status} />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {triggerLabel(triggerOfOccurrence(run.occurrence_key) ?? "")} ·{" "}
                    {runOutcomeText(run)}
                  </span>
                </>
              );
              return (
                <li key={run.id}>
                  {canOpen ? (
                    <Link
                      to="/automations"
                      search={{ run: run.id }}
                      className="block rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="rounded-md border px-3 py-2 text-sm">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
