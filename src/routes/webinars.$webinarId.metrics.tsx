import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronLeft,
  Clock,
  CreditCard,
  Download,
  Eye,
  Lightbulb,
  MessageSquare,
  MonitorPlay,
  MousePointerClick,
  Pencil,
  ShoppingBag,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AudienceInsights } from "@/components/audience-insights";
import { DateRangeFilter } from "@/components/date-range-filter";
import { PageSkeleton } from "@/components/page-skeleton";
import { ExportMomentsDialog } from "@/components/export-moments-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { RunSheet, RunsTable, runOutcomeText } from "@/components/automation-runs";
import { Skeleton } from "@/components/ui/skeleton";
import { RUN_STATUS, type RunStatus } from "@/lib/automations";
import { lifecycleOf, useAutomationRuns, useWorkspace, watchLabel, type AutomationRun } from "@/lib/data";
import { canOpenPath } from "@/lib/support/model";
import { cn } from "@/lib/utils";
import { funnelSummary } from "@/lib/participant-facts";
import { formatSessionStart, lifecycleDetail, lifecycleLabel } from "@/lib/schedule";
import { Badge } from "@/components/ui/badge";
import { rangeKey, resolveRange, type RangePreset } from "@/lib/date-range";
import {
  buildInsights,
  clockLabel,
  downloadCsv,
  fetchWebinarMetrics,
  metricsPeople,
  moneyLabel,
  PERSON_STATUS,
  slugifyName,
  toCsv,
  type MetricsPerson,
  type PersonStatus,
} from "@/lib/webinar-metrics";
import { toast } from "sonner";

export const Route = createFileRoute("/webinars/$webinarId/metrics")({
  head: () => ({
    meta: [
      { title: "Métricas do webinar | Novawebinar" },
      {
        name: "description",
        content: "Funil, retenção por momento e exportações de participantes e conversas.",
      },
      { property: "og:title", content: "Métricas do webinar | Novawebinar" },
      {
        property: "og:description",
        content: "Veja quem entrou, até onde assistiu e quem clicou na oferta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebinarMetricsPage,
});

/** As sessões mais recentes do período que a tabela mostra (um webinar diário tem ~365 por ano). */
const SESSIONS_CAP = 500;

const numberFormat = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });
/** Percentagem de uma base; sem base não há percentagem. */
const pctLabel = (value: number, from: number) => (from ? `${numberFormat.format((value / from) * 100)}%` : "—");

function Card({
  label,
  value,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: typeof Users;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-card bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        {Icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <strong className="mt-2 block text-2xl tracking-tight tabular-nums">{value}</strong>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

function FunnelStep({
  label,
  value,
  from,
  of,
}: {
  label: string;
  value: number;
  /** Base da percentagem; sem base é o ponto de partida. */
  from?: number;
  /** Em relação a quê é a percentagem. */
  of?: string;
}) {
  const share = from === undefined ? 100 : from ? Math.min(100, (value / from) * 100) : 0;
  return (
    <div className="min-w-0 flex-1 rounded-xl border bg-muted/30 p-4">
      <p className="truncate text-xs font-medium uppercase text-muted-foreground" title={label}>
        {label}
      </p>
      <strong className="mt-1 block text-2xl tracking-tight tabular-nums">{value}</strong>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {from === undefined ? "ponto de partida" : `${pctLabel(value, from)} ${of}`}
      </p>
    </div>
  );
}

/** Execuções de automações de uma sessão, numa linha. */
function sessionAutomationsLabel(runs: { status: string }[]) {
  if (runs.length === 0) return "—";
  const n = (status: string[]) => runs.filter((r) => status.includes(r.status)).length;
  return [
    n(["done"]) ? `${n(["done"])} executadas` : "",
    n(["waiting", "ready", "running"]) ? `${n(["waiting", "ready", "running"])} a aguardar` : "",
    n(["failed"]) ? `${n(["failed"])} falharam` : "",
    n(["cancelled"]) ? `${n(["cancelled"])} canceladas` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function sessionRowLabel(
  session: { state: string; starts_at: string; ends_at: string | null; ended_at: string | null },
  timezone?: string | null,
) {
  if (session.state === "finished" && session.ended_at)
    return `Terminada ${formatSessionStart(Date.parse(session.ends_at ?? session.ended_at), timezone)}`;
  if (session.state === "live") return session.ends_at ? "Em andamento" : "Iniciada, sem hora de fim";
  // Uma data única remarcada antes de começar nunca arranca.
  return Date.parse(session.starts_at) > Date.now() ? "Agendada" : "Não arrancou";
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}

const PEOPLE_FILTERS: { key: string; label: string; statuses: PersonStatus[] | null }[] = [
  { key: "all", label: "Todas", statuses: null },
  { key: "bought", label: "Compraram", statuses: ["bought"] },
  { key: "recover", label: "Para recuperar", statuses: ["failed", "abandoned", "checkout", "clicked", "offer"] },
  { key: "attended", label: "Só assistiram", statuses: ["attended"] },
  { key: "absent", label: "Não assistiram", statuses: ["absent"] },
];

/** Quem esteve neste webinar e onde ficou no percurso, a partir dos factos já carregados. */
function PeopleTable({ people }: { people: MetricsPerson[] }) {
  const [filter, setFilter] = useState("all");
  const statuses = PEOPLE_FILTERS.find((f) => f.key === filter)?.statuses;
  const shown = statuses ? people.filter((p) => statuses.includes(p.status)) : people;
  return (
    <>
      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar pessoas">
        {PEOPLE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filter === f.key ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
            )}
          >
            {f.label}{" "}
            <span className="tabular-nums opacity-70">
              {f.statuses ? people.filter((p) => f.statuses!.includes(p.status)).length : people.length}
            </span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty>Ninguém neste grupo.</Empty>
      ) : (
        <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="glass sticky top-0 text-xs text-muted-foreground">
              <tr>
                {["Pessoa", "Contacto", "Modo", "Tempo assistido", "Chegou até", "Estado"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const status = PERSON_STATUS[p.status];
                return (
                  <tr key={p.personId} className="border-t">
                    <td className="px-4 py-2.5">
                      {p.contactId ? (
                        <Link
                          to="/contacts"
                          search={{ contact: p.contactId }}
                          className="block font-medium hover:underline"
                        >
                          {p.name || p.email || "Sem nome"}
                        </Link>
                      ) : (
                        <span className="block font-medium">{p.name || p.email || "Sem nome"}</span>
                      )}
                      {p.email && p.name ? <span className="text-xs text-muted-foreground">{p.email}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{p.phone || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {p.attended ? (p.replay ? "Replay" : "Ao vivo") : "—"}
                      {p.visits > 1 ? ` · ${p.visits} entradas` : ""}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {watchLabel(p.watchSeconds)}
                      {p.watchSeconds > 0 && !p.watchMeasured ? (
                        <span className="text-xs text-muted-foreground"> (estimado)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {p.peakSeconds ? clockLabel(p.peakSeconds) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function WebinarMetricsPage() {
  const { webinarId } = Route.useParams();
  const { data: workspace } = useWorkspace();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openRun, setOpenRun] = useState<AutomationRun | null>(null);
  const [preset, setPreset] = useState<RangePreset>("todos");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const inRange = (iso: string | null) => {
    if (!range) return true;
    const at = iso ? Date.parse(iso) : Number.NaN;
    return at >= Date.parse(range.from) && at < Date.parse(range.to);
  };

  const { data: webinar, isPending: webinarLoading } = useQuery({
    queryKey: ["webinar-meta", webinarId],
    enabled: Boolean(webinarId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webinars")
        .select(
          "id, organization_id, public_title, internal_name, duration_seconds, cta_start_seconds, pitch_seconds, status, timezone, schedule_mode, scheduled_at, session_end_time, recurrence_enabled, recurrence_pattern, recurrence_weekday, recurrence_start_time, recurrence_end_time, jit_interval_minutes, video_sources(duration_seconds)",
        )
        .eq("id", webinarId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // Os números são do espaço do webinar, não do espaço activo: um link de outro espaço
  // mostra o webinar inteiro ou nada.
  const organizationId = webinar?.organization_id;
  const duration = webinar?.duration_seconds ?? 0;

  // Sessões globais deste webinar, como a base de dados as regista (o fim é dado de
  // minuto a minuto pelo varrimento, não por quem abre a página). O período aplica-se
  // na consulta, para um período antigo não ficar de fora por haver sessões mais recentes.
  const { data: allSessions = [] } = useQuery({
    queryKey: ["webinar-sessions", webinarId, rangeKey(range)],
    enabled: Boolean(webinarId),
    queryFn: async () => {
      const rows = await fetchAll((from, to) => {
        let q = supabase
          .from("webinar_sessions")
          .select("id, starts_at, ends_at, state, ended_at", { count: "exact" })
          .eq("webinar_id", webinarId);
        if (range) q = q.gte("starts_at", range.from).lt("starts_at", range.to);
        return q.order("starts_at", { ascending: false }).order("id").range(from, Math.min(to, SESSIONS_CAP - 1));
      });
      return rows.slice(0, SESSIONS_CAP);
    },
  });
  const lifecycle = webinar ? lifecycleOf(webinar) : null;
  // Todas as execuções deste webinar: as da sessão e as dos pagamentos (sem sessão).
  const { data: allRuns = [], isLoading: runsLoading } = useAutomationRuns({ webinarId }, 1000);
  const sessions = allSessions.filter((s) => inRange(s.starts_at));
  const automationRuns = allRuns.filter((r) => inRange(r.created_at));
  const runCount = (statuses: string[]) => automationRuns.filter((r) => statuses.includes(r.status)).length;
  const canOpenAutomations = canOpenPath(workspace?.role, "/automations");

  const {
    data,
    isPending: metricsPending,
    isError: metricsError,
  } = useQuery({
    queryKey: ["webinar-metrics", organizationId, webinarId, duration, rangeKey(range)],
    enabled: Boolean(organizationId && webinarId),
    queryFn: () => fetchWebinarMetrics(organizationId!, webinarId, duration, range),
    // Ao mudar o período, os números anteriores ficam até chegarem os novos.
    placeholderData: keepPreviousData,
  });
  const people = useMemo(() => metricsPeople(data?.participants ?? []), [data]);

  const title = webinar?.public_title || webinar?.internal_name || "Webinar";
  const base = slugifyName(title);

  const exportAllParticipants = () => {
    if (!data?.participants.length) {
      toast.error("Ainda não há participantes para exportar.");
      return;
    }
    // As execuções vêm da mais recente para a mais antiga: a primeira de cada pessoa é a última.
    const runsOf = (personId: string | null) => automationRuns.filter((r) => r.contact_id === personId);
    downloadCsv(
      `${base}-participantes.csv`,
      toCsv(
        [
          "Nome",
          "Email",
          "Contacto",
          "Entrou em",
          "Assistiu",
          "Tempo assistido",
          "Medição",
          "Começou a ver no momento",
          "Chegou até ao momento",
          "Modo",
          "Chegou ao pitch",
          "Viu a oferta",
          "Clicou na oferta",
          "Iniciou o pagamento",
          "Comprou",
          "Pagamento falhado",
          "Abandonou o pagamento",
          "Webinar",
          "Automações",
          "Última automação",
          "Estado da última",
          "Última execução",
          "Resultado",
        ],
        data.participants.map((p) => [
          p.name ?? "",
          p.email ?? "",
          p.phone ?? "",
          p.joined_at ? new Date(p.joined_at).toLocaleString("pt-PT") : "",
          p.attended ? "Sim" : "Não",
          clockLabel(p.actual_watch_seconds ?? 0),
          p.watch_measured ? "Medido" : "Estimado",
          p.entry_seconds === null ? "—" : clockLabel(p.entry_seconds),
          clockLabel(p.peak_seconds ?? 0),
          p.viewing_mode === "replay" ? "Replay" : "Ao vivo",
          pitchSeconds === null ? "—" : p.reached_pitch ? "Sim" : "Não",
          ...[p.saw_offer, p.clicked, p.checkout_started, p.purchased, p.payment_failed, p.checkout_abandoned].map(
            (fact) => (fact ? "Sim" : "Não"),
          ),
          title,
          ...(() => {
            const runs = runsOf(p.person_id);
            const last = runs[0];
            return [
              runs.map((r) => `${r.automations?.name ?? "Automação"}: ${RUN_STATUS[r.status as RunStatus]?.label ?? r.status}`).join("; "),
              last?.automations?.name ?? "",
              last ? (RUN_STATUS[last.status as RunStatus]?.label ?? last.status) : "",
              last ? new Date(last.finished_at ?? last.scheduled_for).toLocaleString("pt-PT") : "",
              last ? runOutcomeText(last) : "",
            ];
          })(),
        ]),
      ),
    );
    toast.success("Ficheiro de participantes criado.");
  };

  const exportByMoment = () => {
    if (!data?.retention.length) {
      toast.error("Ainda não há dados para exportar.");
      return;
    }
    setFiltersOpen(true);
  };


  const exportMessages = async () => {
    if (!organizationId) return;
    const ids = (data?.participants ?? []).map((p) => p.participant_id);
    if (!ids.length) {
      toast.error("Ainda não há conversas para exportar.");
      return;
    }
    // Filtra pelo webinar em vez de uma lista de ids, que não cabe no endereço
    // quando há milhares de participantes.
    const wanted = new Set<string | null>(ids);
    let rows;
    try {
      rows = (
        await fetchAll((from, to) =>
          supabase
            .from("private_messages")
            .select("body, sender_kind, created_at, participant_id, participants!inner(webinar_id)", {
              count: "exact",
            })
            .eq("organization_id", organizationId)
            .eq("participants.webinar_id", webinarId)
            .order("created_at", { ascending: true })
            .order("id")
            .range(from, to),
        )
      ).filter((m) => m.participant_id && wanted.has(m.participant_id));
    } catch {
      toast.error("Não foi possível obter as mensagens.");
      return;
    }
    if (!rows.length) {
      toast.error("Ainda não há mensagens neste webinar.");
      return;
    }
    const names = new Map((data?.participants ?? []).map((p) => [p.participant_id, p.name]));
    downloadCsv(
      `${base}-mensagens.csv`,
      toCsv(
        ["Data", "Participante", "Enviada por", "Mensagem"],
        rows.map((m) => [
          new Date(m.created_at).toLocaleString("pt-PT"),
          names.get(m.participant_id ?? "") ?? "—",
          m.sender_kind === "team" ? "Equipa" : "Participante",
          m.body,
        ]),
      ),
    );
    toast.success("Ficheiro de mensagens criado.");
  };

  const registered = data?.registered ?? 0;
  const attended = data?.attended ?? 0;
  const live = data?.attendedLive ?? 0;
  const replay = data?.attendedReplay ?? 0;
  const sawOffer = data?.sawOffer ?? 0;
  const clicked = data?.clicked ?? 0;
  const checkout = data?.checkout ?? 0;
  const buyers = data?.buyers ?? 0;
  const pitchSeconds = webinar?.pitch_seconds ?? null;
  const reachedPitch = pitchSeconds === null ? null : (data?.reachedPitch ?? 0);
  const revenue = (data?.revenue ?? []).map(moneyLabel).join(" + ");
  const dropOff = data?.dropOff ?? [];
  const topExits = [...dropOff].filter((p) => p.exits > 0).sort((a, b) => b.exits - a.exits).slice(0, 3);
  const peak = topExits[0];
  const insights = data
    ? buildInsights(data, {
        pitchSeconds,
        ctaStartSeconds: webinar?.cta_start_seconds ?? null,
      })
    : [];
  const noSessionRuns = automationRuns.filter((r) => !r.webinar_session_id);

  // A carregar não é "sem dados": enquanto o webinar ou os números chegam, só o esqueleto.
  if (webinarLoading || (webinar && metricsPending && !metricsError))
    return (
      <AppShell title={title} description="Métricas deste webinar." action={false}>
        <PageSkeleton variant="cards" />
      </AppShell>
    );

  if (!webinar)
    return (
      <AppShell title="Webinar" description="Métricas deste webinar." action={false}>
        <Empty>
          Este webinar não existe ou pertence a um espaço a que não tem acesso.{" "}
          <Link to="/webinars" search={{ q: undefined }} className="font-medium text-primary hover:underline">
            Voltar aos webinars
          </Link>
        </Empty>
      </AppShell>
    );

  return (
    <AppShell
      title={title}
      description="Funil, pessoas, retenção por momento, automações e exportações deste webinar."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/webinars" search={{ q: undefined }}>
              <ChevronLeft className="mr-1 size-4" />
              Webinars
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/webinars/$webinarId/edit" params={{ webinarId }}>
              <Pencil className="mr-1 size-4" />
              Editar
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Download className="mr-1 size-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Exportar em folha de cálculo</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={exportByMoment}>
                Participantes por momento
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={exportAllParticipants}>
                Todos os participantes
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportMessages()}>
                Mensagens e conversas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {lifecycle && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge
            variant={lifecycle.kind === "session" && lifecycle.state === "live" ? "destructive" : "secondary"}
          >
            {lifecycleLabel(lifecycle)}
          </Badge>
          {lifecycleDetail(lifecycle, webinar.timezone)}
        </div>
      )}

      <DateRangeFilter
        className="mb-4"
        preset={preset}
        onPresetChange={setPreset}
        from={customFrom}
        to={customTo}
        onFromChange={setCustomFrom}
        onToChange={setCustomTo}
      />

      {metricsError ? (
        <Empty>Não foi possível carregar as métricas. Recarregue a página para tentar outra vez.</Empty>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card label="Inscritos" value={String(registered)} hint="pessoas únicas neste período" icon={Users} />
        <Card
          label="Assistiram"
          value={String(attended)}
          hint={`${pctLabel(attended, registered)} dos inscritos · ${live} ao vivo, ${replay} em replay`}
          icon={MonitorPlay}
        />
        <Card
          label="Tempo assistido"
          value={watchLabel(Math.round(data?.averageWatchSeconds ?? 0))}
          hint={`média de quem assistiu, num vídeo de ${clockLabel(data?.durationSeconds ?? 0)}`}
          icon={Clock}
        />
        <Card
          label="Viram a oferta"
          value={String(sawOffer)}
          hint={`${pctLabel(sawOffer, attended)} de quem assistiu`}
          icon={Eye}
        />
        <Card
          label="Cliques"
          value={String(clicked)}
          hint={`${pctLabel(clicked, attended)} de quem assistiu clicou na oferta`}
          icon={MousePointerClick}
        />
        <Card
          label="Checkout"
          value={String(checkout)}
          hint={`iniciaram o pagamento · ${data?.paymentFailed ?? 0} falhados, ${data?.abandoned ?? 0} abandonados`}
          icon={CreditCard}
        />
        <Card
          label="Compras"
          value={String(buyers)}
          hint={
            revenue
              ? `${revenue} em ${data?.approvedPayments} ${data?.approvedPayments === 1 ? "pagamento aprovado" : "pagamentos aprovados"}`
              : "sem pagamentos aprovados neste período"
          }
          icon={ShoppingBag}
        />
        <Card
          label="Conversão"
          value={attended ? pctLabel(buyers, attended) : "—"}
          hint={attended ? `${buyers} compraram de ${attended} que assistiram` : "aparece quando alguém assistir"}
          icon={TrendingUp}
        />
        <Card
          label="Automações"
          value={runsLoading ? "…" : String(automationRuns.length)}
          hint={`${runCount(["done"])} executadas · ${runCount(["waiting", "ready", "running"])} a aguardar · ${runCount(["failed"])} falhas`}
          icon={Zap}
        >
          {canOpenAutomations ? (
            <Link to="/automations" className="mt-2 text-xs font-medium text-primary hover:underline">
              Ver automações →
            </Link>
          ) : null}
        </Card>
        <Card
          label="Chat"
          value={String(data?.chatAuthors ?? 0)}
          hint={`pessoas escreveram · ${data?.chatMessages ?? 0} mensagens`}
          icon={MessageSquare}
        />
      </div>

      <section className="mt-6 rounded-card bg-card p-5">
        <h2 className="font-semibold">Da inscrição à compra</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada pessoa conta uma vez. Depois de "Assistiram", cada passo conta só quem assistiu e a
          percentagem é sempre de quem assistiu. "Compraram" é uma compra aprovada atribuída a este
          webinar.
        </p>
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <FunnelStep label="Inscritos" value={registered} />
          <FunnelStep label="Assistiram" value={attended} from={registered} of="dos inscritos" />
          <FunnelStep label="Viram a oferta" value={sawOffer} from={attended} of="de quem assistiu" />
          <FunnelStep label="Clicaram" value={clicked} from={attended} of="de quem assistiu" />
          <FunnelStep label="Iniciaram o pagamento" value={checkout} from={attended} of="de quem assistiu" />
          <FunnelStep label="Compraram" value={buyers} from={attended} of="de quem assistiu" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <FunnelStep
            label="Pagamento falhado"
            value={data?.paymentFailed ?? 0}
            from={checkout}
            of="de quem iniciou o pagamento"
          />
          <FunnelStep
            label="Abandonaram o pagamento"
            value={data?.abandoned ?? 0}
            from={checkout}
            of="de quem iniciou o pagamento"
          />
          <FunnelStep
            label="Reembolsados"
            value={data?.refunded ?? 0}
            from={checkout}
            of="de quem iniciou o pagamento"
          />
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <FunnelStep label="Assistiu ao vivo" value={live} from={attended} of="de quem assistiu" />
          <FunnelStep label="Assistiu ao replay" value={replay} from={attended} of="de quem assistiu" />
          {reachedPitch !== null ? (
            <FunnelStep
              label={`Chegou ao pitch (${clockLabel(pitchSeconds ?? 0)})`}
              value={reachedPitch}
              from={attended}
              of="de quem assistiu"
            />
          ) : null}
          {(data?.milestones ?? []).map((m) => (
            <FunnelStep key={m.label} label={m.label} value={m.value} from={attended} of="de quem assistiu" />
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-card bg-card p-5">
        <h2 className="font-semibold">Pessoas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quem se inscreveu neste período e até onde chegou no percurso. Quem entrou mais do que uma
          vez aparece uma vez, com o maior tempo visto. Clique no nome para abrir o contacto.
        </p>
        {people.length ? (
          <PeopleTable people={people} />
        ) : (
          <Empty>
            Ainda ninguém se inscreveu {range ? "neste período" : "neste webinar"}. As pessoas aparecem
            aqui assim que entram na página de inscrição ou na sala.
          </Empty>
        )}
      </section>

      <section className="mt-6 rounded-card bg-card p-5">
        <h2 className="font-semibold">Participantes por momento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quantas das pessoas que assistiram estavam em cada momento do vídeo, entre o ponto em que
          começaram a ver e o ponto mais avançado. Passe o rato para ver os números.
        </p>
        {attended ? (
          <div className="mt-5 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.retention ?? []} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="retention" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.9} />
                    <stop offset="55%" stopColor="#4ade80" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#dcfce7" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis hide domain={[0, "dataMax"]} />
                <Tooltip
                  cursor={{ stroke: "#16a34a", strokeWidth: 1.5, strokeOpacity: 0.4 }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${value} pessoas`, "Na sala"]}
                  labelFormatter={(label: string) => `Momento ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="viewers"
                  stroke="#15803d"
                  strokeWidth={2.5}
                  fill="url(#retention)"
                  activeDot={{ r: 4, fill: "#15803d", stroke: "var(--popover)", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty>
            Ainda ninguém assistiu {range ? "neste período" : "a este webinar"}. A curva aparece quando a
            primeira pessoa passar o tempo mínimo de presença na sala.
          </Empty>
        )}
      </section>

      {attended ? (
        <section className="mt-6 rounded-card bg-card p-5">
          <h2 className="font-semibold">Onde as pessoas saem</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Em que momento do vídeo as pessoas que assistiram saíram (o ponto mais avançado a que
            chegaram). As barras mais altas são os momentos a rever primeiro.
          </p>
          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dropOff} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis hide domain={[0, "dataMax"]} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`${value} ${value === 1 ? "saída" : "saídas"}`, "Saíram"]}
                  labelFormatter={(label: string) => `A partir de ${label}`}
                />
                <Bar dataKey="exits" radius={[6, 6, 0, 0]}>
                  {dropOff.map((point) => (
                    <Cell
                      key={point.second}
                      fill={point.second === peak?.second ? "#dc2626" : "#f59e0b"}
                      fillOpacity={point.second === peak?.second ? 1 : 0.75}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {topExits.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {topExits.map((point, index) => (
                <div className="rounded-xl border bg-muted/40 p-4" key={point.second}>
                  <span className="text-xs text-muted-foreground">
                    {index === 0 ? "Maior pico de saída" : `${index + 1}.º pico`}
                  </span>
                  <strong className="mt-1 block text-lg tracking-tight">{point.range}</strong>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {point.exits} {point.exits === 1 ? "saída" : "saídas"} · {point.rate.toFixed(0)}% de quem ainda estava na sala
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {insights.length ? (
        <section className="mt-6 rounded-card bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lightbulb className="size-4 text-amber-500" />
            O que melhorar neste webinar
          </h2>
          <ul className="mt-4 space-y-3">
            {insights.map((insight) => (
              <li className="flex gap-3 rounded-xl border bg-muted/30 p-4" key={insight.title}>
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${
                    insight.tone === "alerta"
                      ? "bg-red-500"
                      : insight.tone === "atencao"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                />
                <div>
                  <strong className="block text-sm">{insight.title}</strong>
                  <p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {allSessions.length > 0 && (
        <section className="mt-6 rounded-card bg-card p-5">
          <h2 className="font-semibold">Sessões</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada sessão com hora marcada e quem se inscreveu para ela. O fim é registado
            automaticamente à hora prevista; em replay e sob demanda não há sessão global.
          </p>
          {sessions.length === 0 ? (
            <Empty>Nenhuma sessão começou neste período.</Empty>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    {["Sessão", "Estado", "Inscritos", "Assistiram", "Compraram", "Automações"].map((h) => (
                      <th key={h} className="py-2 pr-4 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {sessions.map((session) => {
                    const sessionPeople = funnelSummary(
                      (data?.participants ?? []).filter((p) => p.webinar_session_id === session.id),
                    );
                    return (
                      <tr key={session.id} className="border-t">
                        <td className="py-2 pr-4">
                          {formatSessionStart(Date.parse(session.starts_at), webinar.timezone)}
                        </td>
                        <td className="py-2 pr-4">{sessionRowLabel(session, webinar.timezone)}</td>
                        <td className="py-2 pr-4">{sessionPeople.registered}</td>
                        <td className="py-2 pr-4">{sessionPeople.attended}</td>
                        <td className="py-2 pr-4">{sessionPeople.buyers}</td>
                        <td className="py-2 pr-4 font-sans">
                          {sessionAutomationsLabel(automationRuns.filter((r) => r.webinar_session_id === session.id))}
                        </td>
                      </tr>
                    );
                  })}
                  {noSessionRuns.length > 0 && (
                    <tr className="border-t text-muted-foreground">
                      <td className="py-2 pr-4" colSpan={5}>
                        Fora de uma sessão (pagamentos, oferta)
                      </td>
                      <td className="py-2 pr-4 font-sans">{sessionAutomationsLabel(noSessionRuns)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="mt-6 rounded-card bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Automações deste webinar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada execução, a pessoa, o estado e o resultado. Clique numa linha para ver porque entrou
              e o que foi enviado.
            </p>
          </div>
          {canOpenAutomations ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/automations">Gerir automações</Link>
            </Button>
          ) : null}
        </div>
        <div className="mt-4 max-h-[36rem] overflow-y-auto">
          {runsLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : (
            <RunsTable
              runs={automationRuns}
              onOpen={setOpenRun}
              empty={
                range
                  ? "Nenhuma automação correu neste período."
                  : "Nenhuma automação correu para este webinar. Correm no fim da sessão, numa compra ou num pagamento falhado, conforme as que activar em Automações."
              }
            />
          )}
        </div>
      </section>

      <AudienceInsights
        organizationId={organizationId}
        webinarId={webinarId}
        range={range}
        // O funil já está acima, com a base explicada; aqui ficam só os painéis de audiência.
        // ponytail: esconde o 1.º painel por CSS; trocar por uma prop showFunnel em audience-insights.tsx.
        className="mt-6 [&>section:first-child]:hidden"
      />

      <RunSheet run={openRun} onClose={() => setOpenRun(null)} />
      <ExportMomentsDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        metrics={data}
        pitchSeconds={pitchSeconds}
        fileBase={base}
      />
    </AppShell>
  );
}
