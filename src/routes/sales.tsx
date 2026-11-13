import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, Search, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ds/data";
import { Metric } from "@/components/page-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { sourceLabel } from "@/lib/contacts";
import { shortMoney } from "@/lib/dashboard";
import { useWebinars, useWorkspace } from "@/lib/data";
import { RANGE_OPTIONS, resolveRange, type RangePreset } from "@/lib/date-range";
import { matchesSale, salesSummary, STATUS_LABEL, useSales, type Sale, type StatusFilter } from "@/lib/sales";
import { formatMoney } from "@/lib/support/context";
import { downloadCsv, toCsv } from "@/lib/webinar-metrics";

const PRESETS = new Set(RANGE_OPTIONS.map((o) => o.value));
const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "approved", label: "Aprovadas" },
  { value: "todos", label: "Todos os estados" },
  { value: "pending", label: "Pendentes" },
  { value: "failed", label: "Falhadas" },
  { value: "abandoned", label: "Abandonadas" },
  { value: "refunded", label: "Reembolsadas" },
];

type Search = { webinar?: string | undefined; periodo?: RangePreset | undefined; estado?: StatusFilter | undefined };

export const Route = createFileRoute("/sales")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search["webinar"] === "string" ? { webinar: search["webinar"] } : {}),
    ...(PRESETS.has(search["periodo"] as RangePreset) ? { periodo: search["periodo"] as RangePreset } : {}),
    ...(STATUSES.some((s) => s.value === search["estado"]) ? { estado: search["estado"] as StatusFilter } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Vendas | Novawebinar" },
      { name: "description", content: "Todas as vendas: quem comprou, de onde é, em que webinar e quanto tempo assistiu." },
    ],
  }),
  component: SalesPage,
});

/** «45 s», «32 min», «1 h 05 min». */
function duration(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const STATUS_VARIANT = { approved: "success", pending: "outline", failed: "destructive", refunded: "warning", abandoned: "warning" } as const;

const MODE_LABEL = { live: "ao vivo", replay: "no replay", ambos: "ao vivo e no replay" } as const;

/** Assistiu: o tempo, a parte do vídeo e como; e quanto depois de entrar pagou. */
function Watched({ sale }: { sale: Sale }) {
  if (sale.watched === null) {
    return (
      <span className="text-muted-foreground" title="Esta compra não está ligada a uma participação: a pessoa pagou com um e-mail que não se inscreveu, ou sem webinar atribuído.">
        —
      </span>
    );
  }
  return (
    <span className="block">
      <span className="font-medium tabular-nums">{sale.watched > 0 ? duration(sale.watched) : "Não assistiu"}</span>
      {sale.watchedPct !== null && sale.watched > 0 && <span className="text-muted-foreground"> · {sale.watchedPct}%</span>}
      <span className="block text-xs text-muted-foreground">
        {[sale.mode ? MODE_LABEL[sale.mode] : null, sale.clicked ? "clicou na oferta" : null].filter(Boolean).join(" · ") || "inscreveu-se"}
      </span>
    </span>
  );
}

function Buyer({ sale }: { sale: Sale }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{sale.name}</span>
      <span className="block truncate text-xs text-muted-foreground">{sale.email ?? sale.phone ?? "Sem contacto"}</span>
    </span>
  );
}

function Country({ sale }: { sale: Sale }) {
  return sale.country ? (
    <span className="whitespace-nowrap" title="País pelo IP da inscrição">
      {sale.country.flag} {sale.country.label}
    </span>
  ) : (
    <span className="text-muted-foreground" title="Sem inscrição com localização: não há IP de onde o tirar.">
      Desconhecido
    </span>
  );
}

function SalesPage() {
  const { data: workspace } = useWorkspace();
  const organizationId = workspace?.organizationId;
  const { webinar, periodo = "30dias" as RangePreset, estado = "approved" } = Route.useSearch();
  const navigate = useNavigate();
  const { data: webinars = [] } = useWebinars(organizationId);
  const titles = useMemo(() => new Map(webinars.map((w) => [w.id, w.public_title || w.internal_name])), [webinars]);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearchText] = useState("");
  const range = useMemo(() => resolveRange(periodo, customFrom, customTo), [periodo, customFrom, customTo]);
  const { data: sales = [], isLoading, error } = useSales(organizationId, range, estado, webinar, titles);
  const shown = useMemo(() => sales.filter((s) => matchesSale(s, search)), [sales, search]);
  const summary = useMemo(() => salesSummary(shown), [shown]);
  const loading = isLoading || !organizationId;

  const setFilters = (next: Search) => {
    const merged = { webinar, periodo, estado, ...next };
    void navigate({
      to: "/sales",
      search: {
        ...(merged.webinar ? { webinar: merged.webinar } : {}),
        ...(merged.periodo && merged.periodo !== "30dias" ? { periodo: merged.periodo } : {}),
        ...(merged.estado && merged.estado !== "approved" ? { estado: merged.estado } : {}),
      },
    });
  };
  const open = (sale: Sale) => {
    if (sale.contactId) void navigate({ to: "/contacts", search: { contact: sale.contactId } });
  };
  const exportCsv = () =>
    downloadCsv(
      "vendas.csv",
      toCsv(
        ["Data", "Estado", "Comprador", "Email", "Telefone", "País", "Webinar", "Produto", "Valor", "Moeda", "Assistiu (min)", "Parte do vídeo (%)", "Como", "Clicou na oferta", "Origem", "Campanha", "Plataforma"],
        shown.map((s) => [
          s.at,
          STATUS_LABEL[s.status],
          s.name,
          s.email ?? "",
          s.phone ?? "",
          s.country?.label ?? "",
          s.webinarTitle ?? "",
          s.product,
          s.amount,
          s.currency,
          s.watched === null ? "" : Math.round(s.watched / 60),
          s.watchedPct ?? "",
          s.mode ? MODE_LABEL[s.mode] : "",
          s.clicked ? "sim" : "não",
          s.source ? sourceLabel(s.source) : "",
          s.campaign ?? "",
          s.provider,
        ]),
      ),
    );

  const revenue = summary.revenue.length ? summary.revenue.map((r) => shortMoney(r.amount, r.currency)).join(" + ") : "0";

  return (
    <AppShell
      title="Vendas"
      description="Quem comprou, de onde é, em que webinar e quanto tempo assistiu."
      action={
        <Button variant="outline" onClick={exportCsv} disabled={shown.length === 0}>
          <Download />
          Exportar
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Select value={periodo} onValueChange={(value) => setFilters({ periodo: value as RangePreset })}>
          <SelectTrigger className="w-[170px]" aria-label="Período">
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
        <Select value={webinar ?? "todos"} onValueChange={(value) => setFilters({ webinar: value === "todos" ? undefined : value })}>
          <SelectTrigger className="w-[min(240px,100%)]" aria-label="Webinar">
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
        <Select value={estado} onValueChange={(value) => setFilters({ estado: value as StatusFilter })}>
          <SelectTrigger className="w-[170px]" aria-label="Estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
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
        <label className="relative ml-auto w-full sm:w-[260px]">
          <span className="sr-only">Procurar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-9" placeholder="Nome, email, produto, país" value={search} onChange={(e) => setSearchText(e.target.value)} />
        </label>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Facturação" value={loading ? "…" : revenue} change="Pagamentos aprovados no período" />
        <Metric label="Pagamentos" value={loading ? "…" : String(summary.payments)} change={`${summary.withWebinar} ligados a um webinar`} />
        <Metric label="Compradores" value={loading ? "…" : String(summary.buyers)} change="Pessoas diferentes" />
        <Metric
          label="Tempo médio assistido"
          value={loading ? "…" : summary.averageWatch === null ? "—" : duration(summary.averageWatch)}
          change="De quem comprou e assistiu"
        />
      </div>

      {error ? (
        <EmptyState icon={ShoppingBag} title="Não foi possível carregar as vendas" description="Tente outra vez daqui a pouco." />
      ) : loading ? (
        <div className="grid gap-2 rounded-card bg-card p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={search ? "Nenhuma venda com esta pesquisa" : "Ainda não há vendas neste período"}
          description="As compras chegam pelas Integrações (Kambafy, Hotmart, Stripe ou webhook) e aparecem aqui na hora."
        />
      ) : (
        <div className="mb-28 overflow-hidden rounded-card bg-card md:mb-0">
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Comprador</th>
                <th className="px-4 py-3 font-medium">País</th>
                <th className="px-4 py-3 font-medium">Webinar</th>
                <th className="px-4 py-3 font-medium">Assistiu</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => open(s)}
                  className={`border-b last:border-0 ${s.contactId ? "cursor-pointer hover:bg-muted/40" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums text-muted-foreground">{dateTime(s.at)}</td>
                  <td className="max-w-[240px] px-4 py-3 align-top">
                    {s.contactId ? (
                      <button type="button" className="block w-full text-left focus-visible:outline-2" onClick={(e) => (e.stopPropagation(), open(s))}>
                        <Buyer sale={s} />
                      </button>
                    ) : (
                      <Buyer sale={s} />
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Country sale={s} />
                  </td>
                  <td className="max-w-[220px] px-4 py-3 align-top">
                    <span className="block truncate">{s.webinarTitle ?? <span className="text-muted-foreground">Sem webinar</span>}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.product}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Watched sale={s} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="block">{s.source ? sourceLabel(s.source) : <span className="text-muted-foreground">—</span>}</span>
                    {s.campaign && <span className="block max-w-[160px] truncate text-xs text-muted-foreground">{s.campaign}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                    <span className="block font-semibold tabular-nums">{formatMoney(s.amount, s.currency)}</span>
                    {s.status !== "approved" && (
                      <Badge variant={STATUS_VARIANT[s.status]} className="mt-1">
                        {STATUS_LABEL[s.status]}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y md:hidden">
            {shown.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => open(s)} disabled={!s.contactId} className="grid w-full gap-2 px-4 py-3 text-left text-sm">
                  <span className="flex items-start justify-between gap-3">
                    <Buyer sale={s} />
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{formatMoney(s.amount, s.currency)}</span>
                      {s.status !== "approved" && (
                        <Badge variant={STATUS_VARIANT[s.status]} className="mt-1">
                          {STATUS_LABEL[s.status]}
                        </Badge>
                      )}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateTime(s.at)} · {s.country ? `${s.country.flag} ${s.country.label}` : "País desconhecido"} · {s.webinarTitle ?? "Sem webinar"}
                  </span>
                  <span className="text-xs">
                    <Watched sale={s} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
