import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox, Lock, MessageCircle, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ds/data";
import { NavTabs } from "@/components/ds/navigation";
import { EmptySection, Metric } from "@/components/page-primitives";
import {
  Avatar,
  CallBadge,
  CaseStatusBadge,
  dateTimeLabel,
  IntentBadge,
  PriorityBadge,
  SlaBadge,
} from "@/components/support/badges";
import { CaseActions, CaseSummary, Timeline } from "@/components/support/case-tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/lib/data";
import {
  caseAlerts,
  caseContactName,
  useCases,
  useDepartments,
  useEvents,
  useSkills,
  useStaff,
  useSupportRealtime,
  useSupportSetup,
  type SupportCase,
} from "@/lib/support/hooks";
import { canAttend, isOpenStatus, priorityRank, slaState } from "@/lib/support/model";

export const Route = createFileRoute("/cases")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search["id"] === "string" ? (search["id"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Casos | Novawebinar" },
      { name: "description", content: "O que a IA passou à equipa: de quem é, em que estado está e até quando." },
    ],
  }),
  component: CasesPage,
});

type Filter = { id: string; label: string; test: (c: SupportCase) => boolean };

function minutes(from: string, to: string) {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
}

function CasesPage() {
  const { id: requested } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: workspace } = useWorkspace();
  const allowed = canAttend(workspace?.role);
  const scope = allowed ? workspace?.organizationId : undefined;
  const { data: setup } = useSupportSetup(scope);
  useSupportRealtime(scope);
  const { data: cases = [], isLoading } = useCases(scope);
  const { data: staff = [] } = useStaff(scope);
  const { data: departments = [] } = useDepartments(scope);
  const { data: skills = [] } = useSkills(scope);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");

  const filters = useMemo<Filter[]>(
    () => [
      { id: "open", label: "Todos", test: (c) => isOpenStatus(c.status) },
      { id: "critical", label: "Críticos", test: (c) => isOpenStatus(c.status) && c.priority === "critical" },
      { id: "high", label: "Alta prioridade", test: (c) => isOpenStatus(c.status) && c.priority === "high" },
      { id: "unassigned", label: "Sem responsável", test: (c) => isOpenStatus(c.status) && !c.assigned_staff_id },
      {
        id: "sla",
        label: "Prazo em risco",
        test: (c) => isOpenStatus(c.status) && ["risk", "breached"].includes(slaState(c).state),
      },
      ...departments.map((d) => ({
        id: `department:${d.id}`,
        label: d.name,
        test: (c: SupportCase) => isOpenStatus(c.status) && c.department_id === d.id,
      })),
      {
        id: "waiting",
        label: "Aguardando",
        test: (c) => c.status === "waiting_customer" || c.status === "waiting_team",
      },
      { id: "done", label: "Resolvidos", test: (c) => !isOpenStatus(c.status) },
    ],
    [departments],
  );

  const current = filters.find((f) => f.id === filter) ?? filters[0]!;
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cases
      .filter(current.test)
      .filter(
        (c) =>
          !term ||
          [caseContactName(c), c.contacts?.email, c.summary, String(c.number)]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(term)),
      )
      .sort(
        (a, b) =>
          priorityRank(a.priority) - priorityRank(b.priority) ||
          (a.sla_deadline ?? "9999").localeCompare(b.sla_deadline ?? "9999") ||
          b.created_at.localeCompare(a.created_at),
      );
  }, [cases, current, search]);

  const stats = useMemo(() => {
    const open = cases.filter((c) => isOpenStatus(c.status));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const answered = cases.filter((c) => c.first_response_at);
    const average = answered.length
      ? Math.round(
          answered.reduce((sum, c) => sum + minutes(c.created_at, c.first_response_at!), 0) / answered.length,
        )
      : null;
    return {
      open: open.length,
      unassigned: open.filter((c) => !c.assigned_staff_id).length,
      late: open.filter((c) => ["risk", "breached"].includes(slaState(c).state)).length,
      resolvedToday: cases.filter((c) => c.resolved_at && Date.parse(c.resolved_at) >= today.getTime()).length,
      average,
    };
  }, [cases]);

  const selected = cases.find((c) => c.id === requested) ?? null;
  const open = (id: string | undefined) => void navigate({ search: { id }, replace: true });

  if (workspace && !allowed) {
    return (
      <AppShell title="Casos" action={false}>
        <EmptySection
          icon={Lock}
          title="Sem acesso aos casos"
          description="Os casos são vistos pelo proprietário, pelos administradores e pela equipa de suporte."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Casos"
      description="O que a IA passou à equipa: de quem é, em que estado está e até quando tem de ser respondido."
      action={false}
    >
      {/* No telemóvel os números ficam numa só lista (uma linha cada), não em cinco cartões. */}
      <div className="mb-6 grid gap-3 max-sm:gap-0 max-sm:divide-y max-sm:divide-[var(--border-subtle)] max-sm:overflow-hidden max-sm:rounded-card max-sm:bg-card max-sm:shadow-[inset_0_0_0_1px_var(--border-card)] max-sm:[&>*]:rounded-none max-sm:[&>*]:bg-transparent max-sm:[&>*]:shadow-none sm:grid-cols-2 sm:[&>*:last-child]:col-span-2 lg:grid-cols-5 lg:[&>*:last-child]:col-span-1">
        <Metric label="Abertos" value={String(stats.open)} />
        <Metric label="Sem responsável" value={String(stats.unassigned)} />
        <Metric label="Prazo em risco" value={String(stats.late)} />
        <Metric label="Resolvidos hoje" value={String(stats.resolvedToday)} />
        <Metric
          label="1.ª resposta, em média"
          value={stats.average === null ? "—" : `${stats.average} min`}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NavTabs
          aria-label="Filtrar casos"
          className="min-w-0 flex-1"
          items={filters.map((f) => ({ id: f.id, label: f.label, count: cases.filter(f.test).length }))}
          value={filter}
          onChange={setFilter}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, email ou número"
            aria-label="Procurar casos"
            className="h-9 pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : cases.length === 0 ? (
        <EmptySection
          icon={Inbox}
          title="Ainda não há casos"
          description="Um caso abre-se quando a IA não resolve um pedido ou alguém da equipa assume uma conversa."
          actionLabel="Abrir o atendimento"
          actionTo="/support"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nenhum caso neste filtro"
          description="Experimente outro filtro ou limpe a pesquisa."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setFilter("open");
                setSearch("");
              }}
            >
              Ver todos os casos
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-card bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">N.º</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const owner = staff.find((s) => s.id === c.assigned_staff_id);
                  const department = departments.find((d) => d.id === c.department_id);
                  return (
                    <TableRow
                      key={c.id}
                      onClick={() => open(c.id)}
                      className="cursor-pointer"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && open(c.id)}
                    >
                      <TableCell className="font-medium tabular-nums">{c.number}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <Avatar name={caseContactName(c)} className="size-8" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{caseContactName(c)}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {c.webinars?.public_title ?? "Sem webinar"}
                            </span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <IntentBadge intent={c.intent} />
                          {c.call_required && <CallBadge />}
                        </span>
                        <span className="mt-0.5 block max-w-xs truncate text-xs text-muted-foreground">
                          {c.reason_for_escalation}
                        </span>
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={c.priority} />
                      </TableCell>
                      <TableCell>
                        <CaseStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>
                        {owner ? (
                          <span className="flex items-center gap-2">
                            <Avatar name={owner.name} presence={owner.presence} className="size-7" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{owner.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {department?.name}
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="text-sm">
                            <span className="text-destructive">Sem responsável</span>
                            <span className="block text-xs text-muted-foreground">
                              Fila de {department?.name ?? "atendimento"}
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <SlaBadge c={c} />
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {dateTimeLabel(c.created_at)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => open(c.id)}
                  className="w-full rounded-card bg-card p-3 text-left"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {c.number} · {caseContactName(c)}
                    </span>
                    <CaseStatusBadge status={c.status} />
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <IntentBadge intent={c.intent} />
                    <PriorityBadge priority={c.priority} />
                    <SlaBadge c={c} />
                    {!c.assigned_staff_id && isOpenStatus(c.status) && (
                      <Badge variant="destructive">Sem responsável</Badge>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <CaseSheet
        c={selected}
        staff={staff}
        departments={departments}
        skills={skills}
        myStaffId={setup?.staffId ?? null}
        onClose={() => open(undefined)}
      />
    </AppShell>
  );
}

function CaseSheet({
  c,
  staff,
  departments,
  skills,
  myStaffId,
  onClose,
}: {
  c: SupportCase | null;
  staff: ReturnType<typeof useStaff>["data"] & object;
  departments: NonNullable<ReturnType<typeof useDepartments>["data"]>;
  skills: NonNullable<ReturnType<typeof useSkills>["data"]>;
  myStaffId: string | null;
  onClose: () => void;
}) {
  const { data: events = [] } = useEvents({ caseId: c?.id ?? null });
  if (!c) return <Sheet open={false} />;
  const alerts = caseAlerts(c);
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3">
            <Avatar name={caseContactName(c)} className="size-11 text-sm" />
            <div className="min-w-0">
              <SheetTitle className="truncate">{caseContactName(c)}</SheetTitle>
              <SheetDescription className="truncate">
                {[c.contacts?.email ?? c.participants?.email, c.webinars?.public_title]
                  .filter((value) => value && !value.endsWith("@sala.local"))
                  .join(" · ") || "Sem mais dados"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-5 space-y-6">
          {alerts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {alerts.map((alert) => (
                <Badge key={alert} variant="destructive">
                  {alert}
                </Badge>
              ))}
            </div>
          )}
          <CaseSummary c={c} staff={staff} departments={departments} skills={skills} />
          <div className="flex flex-wrap items-center gap-2">
            <CaseActions c={c} myStaffId={myStaffId} staff={staff} departments={departments} />
            {c.conversation_id && (
              <Button asChild size="sm" variant="ghost">
                <Link to="/support" search={{ c: c.conversation_id }}>
                  <MessageCircle /> Abrir conversa
                </Link>
              </Button>
            )}
          </div>
          <section>
            <h3 className="mb-3 text-sm font-semibold">Rasto do caso</h3>
            <Timeline events={events} staff={staff} departments={departments} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
