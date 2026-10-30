/**
 * Os Contactos, só desenho, no mesmo desenho do Atendimento: à esquerda os
 * grupos (lançamentos, temas, listas, segmentos), ao meio as pessoas e à
 * direita a ficha de quem se abriu, ou o resumo do grupo. Os dados chegam por
 * props, reais ou do exemplo; nada aqui lê a base de dados.
 */
import {
  ArrowLeft,
  Check,
  Circle,
  ListChecks,
  List as ListIcon,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  MonitorSmartphone,
  Plus,
  Radio,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { ExampleTag, PersonPhoto } from "@/components/support/inbox";
import { Section } from "@/components/support/contact-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  contactInsight,
  DEVICE_LABEL,
  formatPhone,
  relativeDays,
  sourceLabel,
  sourceVerdict,
  STAGES,
  TEMPERATURE_LABEL,
  whatsappLink,
  type ContactSummary,
  type Temperature,
} from "@/lib/contacts";
import { countryLabel, flagOf } from "@/lib/analytics-geo";
import type { ContactCountry, CountryRow } from "@/lib/contact-countries";
import { STAGE_ADVICE, type ContactFile, type PathStep, type Tone } from "@/lib/contacts-journey";
import { formatDateTime, watchLabel, type SourceRow, type StageCounts } from "@/lib/data";
import { cn } from "@/lib/utils";
import { clockLabel } from "@/lib/webinar-metrics";

/* ---------- Etiquetas ---------- */

const TEMPERATURE_TONE: Record<Temperature, Tone> = {
  customer: "success",
  hot: "destructive",
  warm: "warning",
  cold: "secondary",
};

export function TemperatureBadge({ temperature }: { temperature: Temperature }) {
  return (
    <Badge variant={TEMPERATURE_TONE[temperature]} className="shrink-0">
      {TEMPERATURE_LABEL[temperature]}
    </Badge>
  );
}

/** A etapa de uma pessoa (as do filtro são de grupo: «Não apareceram»). */
const STAGE_ONE: Record<string, string> = {
  new: "Sem eventos",
  no_show: "Não apareceu",
  watched: "Assistiu",
  reached_offer: "Viu a oferta",
  clicked: "Clicou",
  checkout: "Iniciou o pagamento",
  customer: "Comprou",
};

/* ---------- Moldura ---------- */

export type ContactsStep = "list" | "detail";

/** No telemóvel, a ficha ocupa o ecrã por baixo da barra do topo e tapa o menu de baixo, como no Atendimento. */
const PHONE_SCREEN =
  "max-md:@max-2xl:fixed max-md:@max-2xl:inset-x-0 max-md:@max-2xl:top-14 max-md:@max-2xl:bottom-0 max-md:@max-2xl:z-40 max-md:@max-2xl:h-auto max-md:@max-2xl:min-h-0 max-md:@max-2xl:bg-card";

/**
 * Pela largura que sobra: com espaço, grupos, pessoas e ficha lado a lado; a
 * meio, pessoas e ficha (os grupos passam a um seletor); estreito, um passo de cada vez.
 */
export function ContactsFrame({
  step,
  banner,
  nav,
  list,
  detail,
}: {
  step: ContactsStep;
  banner?: ReactNode;
  nav: ReactNode;
  list: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="@container">
      <div className="flex flex-col gap-4 @2xl:h-[calc(100dvh-8rem)] @2xl:min-h-[38rem]">
        {banner}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-card border bg-card @2xl:grid-cols-[19rem_minmax(0,1fr)] @5xl:grid-cols-[14.5rem_minmax(0,1fr)_minmax(22rem,25rem)]">
          <aside className="hidden min-w-0 @5xl:flex @5xl:min-h-0 @5xl:flex-col @5xl:border-r">{nav}</aside>
          <section
            className={cn(
              "min-w-0 @2xl:min-h-0 @2xl:border-r",
              step === "list" ? "flex flex-col" : "hidden @2xl:flex @2xl:flex-col",
            )}
          >
            {list}
          </section>
          <aside
            className={cn(
              "h-[calc(100dvh-11rem)] min-h-[28rem] min-w-0 @2xl:h-auto @2xl:min-h-0",
              step === "detail" ? cn("flex flex-col", PHONE_SCREEN) : "hidden @2xl:flex @2xl:flex-col",
            )}
          >
            {detail}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ---------- Grupos ---------- */

export type ScopeKind = "all" | "launch" | "theme" | "list" | "segment";
export type ScopeItem = { key: string; kind: ScopeKind; label: string; count?: number | null | undefined };
export type ScopeGroup = {
  id: string;
  title?: string | undefined;
  items: ScopeItem[];
  /** Mostrado quando o grupo está vazio (o grupo some se não houver texto nem botão). */
  empty?: string | undefined;
  add?: { label: string; onClick: () => void } | undefined;
};

const SCOPE_ICON: Record<ScopeKind, typeof Users> = {
  all: Users,
  launch: Radio,
  theme: MessagesSquare,
  list: ListIcon,
  segment: Sparkles,
};

export function ScopeNav({
  groups,
  active,
  onSelect,
}: {
  groups: ScopeGroup[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2 pt-3" aria-label="Grupos de contactos">
      {groups
        .filter((g) => g.items.length > 0 || g.empty || g.add)
        .map((g) => (
          <div key={g.id}>
            {g.title && (
              <div className="flex h-8 items-center justify-between gap-2 pl-2.5">
                <p className="text-[12px] font-medium text-muted-foreground">{g.title}</p>
                {g.add && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={g.add.onClick}
                    aria-label={g.add.label}
                    title={g.add.label}
                  >
                    <Plus className="size-4" />
                  </Button>
                )}
              </div>
            )}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = SCOPE_ICON[item.kind];
                const on = item.key === active;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.key)}
                      aria-current={on ? "true" : undefined}
                      title={item.label}
                      className={cn(
                        "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors",
                        on ? "bg-gray-150 font-medium text-foreground" : "text-gray-900 hover:bg-gray-100",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.count != null && (
                        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{item.count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {g.items.length === 0 && g.empty && (
              <p className="px-2.5 pb-1 text-[12px] leading-snug text-muted-foreground">{g.empty}</p>
            )}
          </div>
        ))}
    </nav>
  );
}

/** Os mesmos grupos num seletor, quando não há espaço para a coluna. */
export function ScopePicker({
  groups,
  active,
  onSelect,
}: {
  groups: ScopeGroup[];
  active: string;
  onSelect: (key: string) => void;
}) {
  const adds = groups.flatMap((g) => (g.add ? [g.add] : []));
  return (
    <div className="flex gap-2 @5xl:hidden">
      <Select value={active} onValueChange={onSelect}>
        <SelectTrigger className="h-10 min-w-0 flex-1" aria-label="Escolher grupo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <SelectGroup key={g.id}>
                {g.title && <SelectLabel>{g.title}</SelectLabel>}
                {g.items.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                    {item.count != null ? ` · ${item.count}` : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
        </SelectContent>
      </Select>
      {adds.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-10 shrink-0" aria-label="Criar lista ou segmento">
              <Plus />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {adds.map((a) => (
              <DropdownMenuItem key={a.label} onSelect={a.onClick}>
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/* ---------- Pessoas ---------- */

export type ContactRow = {
  contact: ContactSummary;
  launch: string | null;
  /** País pelo IP da inscrição mais recente; undefined enquanto carrega. */
  country?: ContactCountry | null | undefined;
  example?: boolean | undefined;
};

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium transition-colors",
        active ? "bg-foreground text-background" : "bg-gray-100 text-foreground hover:bg-gray-150",
      )}
    >
      {children}
    </button>
  );
}

export function ContactList({
  title,
  total,
  note,
  picker,
  tools,
  search,
  onSearch,
  counts,
  stage,
  onStage,
  countryFilter,
  rows,
  activeId,
  onSelect,
  loading,
  empty,
  selection,
  bulk,
  footer,
}: {
  title: string;
  total: number | null;
  /** Uma linha por baixo do título (a regra do segmento). */
  note?: ReactNode;
  picker?: ReactNode;
  tools?: ReactNode;
  search: string;
  onSearch: (value: string) => void;
  counts: StageCounts | null | undefined;
  stage: string | null;
  onStage: (stage: string | null) => void;
  /** O país escolhido no resumo do grupo, à vista para se poder tirar. */
  countryFilter?: { code: string; onClear: () => void } | null | undefined;
  rows: ContactRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean | undefined;
  empty?: ReactNode;
  /** Modo de seleccionar várias pessoas (para as pôr numa lista). */
  selection?: { selected: Set<string>; onToggle: (id: string) => void } | undefined;
  bulk?: ReactNode;
  footer?: ReactNode;
}) {
  const chips = [
    ...STAGES.map((s) => ({ id: s.id as string, label: s.label })),
    { id: "returning", label: "Voltaram 2+ vezes" },
  ].filter((s) => stage === s.id || (counts?.[s.id as keyof StageCounts] ?? 0) > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b px-3 pb-3 pt-3">
        {picker}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {/* Com o seletor à vista, o nome do grupo já lá está: fica só a contagem. */}
            <h2 className={cn("truncate text-[15px] font-semibold tracking-[-0.01em]", picker && "hidden @5xl:block")}>
              {title}
            </h2>
            <p className="truncate text-[12px] text-muted-foreground" role="status">
              {total === null ? "A carregar…" : `${total.toLocaleString("pt-PT")} ${total === 1 ? "pessoa" : "pessoas"}`}
              {note ? <> · {note}</> : null}
            </p>
          </div>
          {tools}
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Procurar nome, e-mail ou telefone"
            aria-label="Procurar contactos"
            className="h-10 pl-9"
          />
        </div>
        {countryFilter && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">País:</span>
            <button
              type="button"
              onClick={countryFilter.onClear}
              className="flex h-8 items-center gap-1.5 rounded-pill bg-foreground px-3 font-medium text-background"
              aria-label={`Tirar o filtro de país: ${countryLabel(countryFilter.code)}`}
            >
              <span aria-hidden>{flagOf(countryFilter.code)}</span>
              {countryLabel(countryFilter.code)}
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
        {chips.length > 0 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" aria-label="Onde cada pessoa parou">
            <FilterChip active={stage === null} onClick={() => onStage(null)}>
              Todas
              {counts && <span className="tabular-nums opacity-70">{counts.all}</span>}
            </FilterChip>
            {chips.map((s) => (
              <FilterChip key={s.id} active={stage === s.id} onClick={() => onStage(stage === s.id ? null : s.id)}>
                {s.label}
                {counts && (
                  <span className="tabular-nums opacity-70">{counts[s.id as keyof StageCounts] ?? 0}</span>
                )}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {bulk}

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex gap-3 px-2.5 py-3">
              <Skeleton className="size-11 rounded-full" />
              <span className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </span>
            </li>
          ))}
        {!loading && rows.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">{empty ?? "Ninguém neste grupo."}</li>
        )}
        {!loading &&
          rows.map(({ contact: c, launch, country, example }) => {
            const id = c.id ?? "";
            const insight = contactInsight(c);
            const name = c.name || c.email || c.phone || "Sem nome";
            const picked = selection?.selected.has(id) ?? false;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => (selection ? selection.onToggle(id) : onSelect(id))}
                  aria-current={!selection && activeId === id ? "true" : undefined}
                  aria-pressed={selection ? picked : undefined}
                  className={cn(
                    "flex w-full gap-3 rounded-lg px-2.5 py-3 text-left transition-colors",
                    (!selection && activeId === id) || picked ? "bg-gray-150" : "hover:bg-gray-100",
                  )}
                >
                  {selection ? (
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full",
                        picked ? "bg-foreground text-background" : "bg-gray-100 text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {picked ? <Check className="size-5" /> : <Circle className="size-5" />}
                    </span>
                  ) : (
                    <PersonPhoto name={name} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium">{name}</span>
                      {example && <ExampleTag />}
                      <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground">
                        {relativeDays(c.last_seen_at)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{insight.reason}</span>
                    <span className="mt-1.5 flex min-w-0 items-center gap-1">
                      <TemperatureBadge temperature={insight.temperature} />
                      {insight.temperature !== "customer" && (
                        <Badge variant="outline" className="shrink-0">
                          {STAGE_ONE[insight.stage]}
                        </Badge>
                      )}
                      {country && (
                        <span
                          className="flex min-w-0 shrink-0 items-center gap-1 px-1 text-xs text-muted-foreground"
                          title="País detectado pelo IP na inscrição"
                        >
                          {country.flag && <span aria-hidden>{country.flag}</span>}
                          <span className="max-w-[9rem] truncate">{country.label}</span>
                        </span>
                      )}
                      {launch && (
                        <span className="min-w-0 truncate px-1 text-xs text-muted-foreground">{launch}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
      {footer}
    </div>
  );
}

/* ---------- Ficha ---------- */

type FileTab = "contact" | "launches" | "purchases" | "history";

const PATH_LABEL: Record<PathStep["key"], string> = {
  registered: "Inscreveu-se",
  watched: "Assistiu",
  offer: "Viu a oferta",
  clicked: "Clicou",
  checkout: "Pagamento",
  bought: "Comprou",
};

function pathLabel(step: PathStep, file: ContactFile) {
  const c = file.contact;
  if (step.key === "watched" && step.state === "bad")
    return (c.watched_seconds ?? 0) > 0 ? `Viu só ${watchLabel(c.watched_seconds ?? 0)}` : "Não apareceu";
  if (step.key === "watched" && step.state === "done") return `Assistiu ${watchLabel(c.watched_seconds ?? 0)}`;
  if (step.key === "bought" && step.state === "bad") return c.payment_failed ? "Pagamento falhou" : "Abandonou";
  return PATH_LABEL[step.key];
}

const PURCHASE_STATUS: Record<string, { label: string; tone: Tone }> = {
  approved: { label: "Pago", tone: "success" },
  pending: { label: "Pendente", tone: "warning" },
  failed: { label: "Falhou", tone: "destructive" },
  abandoned: { label: "Abandonado", tone: "outline" },
  refunded: { label: "Reembolsado", tone: "outline" },
};

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });

function Line({ icon: Icon, text, href }: { icon: typeof Mail; text: string; href?: string | undefined }) {
  const body = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{text}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
      {body}
    </a>
  ) : (
    <p className="flex min-w-0 items-center gap-2">{body}</p>
  );
}

export function ContactFileView({
  file,
  loading,
  example,
  lists,
  automations,
  onOpenConversation,
  onBack,
}: {
  file: ContactFile;
  /** A jornada ainda a chegar: o cabeçalho já se vê, o resto espera. */
  loading?: boolean | undefined;
  example?: boolean | undefined;
  /** As listas e segmentos, com as acções de juntar e tirar. */
  lists?: ReactNode;
  automations?: ReactNode;
  onOpenConversation?: ((id: string) => void) | undefined;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<FileTab>("contact");
  const { insight } = file;
  const wa = whatsappLink(file.phone, insight.nextAction.message);
  const mail = file.email ? `mailto:${file.email}?body=${encodeURIComponent(insight.nextAction.message)}` : null;
  const tabs: { id: FileTab; label: string; count?: number }[] = [
    { id: "contact", label: "Contacto" },
    { id: "launches", label: "Lançamentos", count: file.launches.length },
    { id: "purchases", label: "Compras", count: file.purchases.length },
    { id: "history", label: "Histórico" },
  ];
  const c = file.contact;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b px-2">
        <Button variant="ghost" size="icon" className="shrink-0 @2xl:hidden" onClick={onBack} aria-label="Voltar aos contactos">
          <ArrowLeft />
        </Button>
        <div role="tablist" aria-label="Ficha do contacto" className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-11 flex-auto items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1.5 text-[13px] font-medium",
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count ? (
                <span className="hidden text-xs tabular-nums text-muted-foreground @2xl:inline">{t.count}</span>
              ) : null}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="hidden shrink-0 @2xl:inline-flex" onClick={onBack} aria-label="Fechar a ficha">
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "contact" && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <PersonPhoto name={file.name} size={56} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-[17px] font-semibold tracking-[-0.01em]">{file.name}</span>
                  {example && <ExampleTag />}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant={insight.temperature === "customer" ? "success" : "secondary"}>{file.customer}</Badge>
                  {insight.temperature !== "customer" && <TemperatureBadge temperature={insight.temperature} />}
                  {file.theme && <Badge variant="info">Tema: {file.theme}</Badge>}
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {file.since ? `Contacto desde ${dayLabel(file.since)} · ` : ""}activo {relativeDays(file.lastSeen)}
                </p>
              </div>
            </div>

            <div className="grid gap-2 text-sm">
              {file.email && <Line icon={Mail} text={file.email} href={`mailto:${file.email}`} />}
              {file.phone && (
                <Line
                  icon={MessageCircle}
                  text={formatPhone(file.phone) ?? file.phone}
                  href={whatsappLink(file.phone) ?? undefined}
                />
              )}
              {file.place && <Line icon={MapPin} text={file.place} />}
              {file.device && <Line icon={MonitorSmartphone} text={DEVICE_LABEL[file.device] ?? file.device} />}
            </div>

            {/* O destaque da ficha (um por página, Nubank): superfície tingida da marca, sem aresta. */}
            <section className="rounded-xl bg-tint-brand p-3">
              <p className="text-[12px] font-semibold text-tint-brand-ink">Próxima acção</p>
              <p className="mt-1 text-[15px] font-medium leading-snug">{insight.nextAction.label}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{insight.reason}</p>
              <p className="mt-2.5 rounded-lg bg-card px-3 py-2 text-[13px] shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-200)]">
                {insight.nextAction.message}
              </p>
              {(wa || mail) && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {wa && (
                    <Button asChild size="sm">
                      <a href={wa} target="_blank" rel="noopener noreferrer">
                        <MessageCircle /> WhatsApp
                      </a>
                    </Button>
                  )}
                  {mail && (
                    <Button asChild size="sm" variant={wa ? "outline" : "default"}>
                      <a href={mail}>
                        <Mail /> E-mail
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </section>

            <Section title="Percurso">
              <ol className="flex flex-wrap gap-1.5" aria-label="Percurso do contacto">
                {file.path.map((step) => (
                  <li
                    key={step.key}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-[12px]",
                      step.state === "done" && "bg-success-soft text-foreground [&>svg]:text-success",
                      step.state === "bad" && "bg-destructive-soft text-destructive",
                      step.state === "todo" && "text-muted-foreground shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)]",
                    )}
                  >
                    {step.state === "done" ? (
                      <Check className="size-3" aria-hidden />
                    ) : step.state === "bad" ? (
                      <X className="size-3" aria-hidden />
                    ) : (
                      <Circle className="size-3" aria-hidden />
                    )}
                    {pathLabel(step, file)}
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="Resumo">
              <dl className="grid grid-cols-2 gap-2">
                {[
                  { label: "Lançamentos", value: String(c.events_registered ?? 0) },
                  { label: "Esteve presente", value: `${c.events_attended ?? 0} de ${c.events_registered ?? 0}` },
                  { label: "Tempo a ver", value: watchLabel(c.watched_seconds ?? 0) },
                  file.totalPaid
                    ? { label: "Investido", value: file.totalPaid }
                    : { label: "Compras", value: String(c.purchases ?? 0) },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border px-3 py-2.5">
                    <dd className="truncate text-[18px] font-semibold tabular-nums">{s.value}</dd>
                    <dt className="text-[12px] text-muted-foreground">{s.label}</dt>
                  </div>
                ))}
              </dl>
            </Section>

            <Section title="Origem">
              <p className="text-sm">
                <span className="text-muted-foreground">Primeira vez: </span>
                {file.firstOrigin}
              </p>
              {file.launches.length > 1 && (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  A origem de cada inscrição está em Lançamentos.
                </p>
              )}
            </Section>

            {lists}
            {automations}
          </div>
        )}

        {tab === "launches" &&
          (loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : file.launches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não se inscreveu em nenhum lançamento. Quando se inscrever, cada um aparece aqui com o que viu.
            </p>
          ) : (
            <ul className="space-y-3">
              {file.launches.map((l) => (
                <li key={l.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.title}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {formatDateTime(l.at)} · {l.mode === "replay" ? "Replay" : "Ao vivo"}
                      </span>
                    </span>
                    <Badge variant={l.outcome.tone} className="shrink-0">
                      {l.outcome.label}
                    </Badge>
                  </div>
                  {l.bar && (
                    <div
                      className="relative mt-3 h-1.5 rounded-full bg-chart-track"
                      role="img"
                      aria-label={`Viu de ${l.bar.from}% a ${l.bar.to}% do vídeo`}
                    >
                      <div
                        className="absolute inset-y-0 rounded-full bg-chart-1"
                        style={{ left: `${l.bar.from}%`, width: `${Math.max(1, l.bar.to - l.bar.from)}%` }}
                      />
                      {l.bar.offerAt !== null && (
                        <span
                          className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-chart-2"
                          style={{ left: `${l.bar.offerAt}%` }}
                          title="Início da oferta"
                        />
                      )}
                    </div>
                  )}
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    {l.attended || l.watchedSeconds > 0 ? (
                      <>
                        Viu {watchLabel(l.watchedSeconds)}
                        {l.watchedPct !== null ? ` · ${l.watchedPct}% do vídeo` : ""}
                        {l.durationSeconds > 0
                          ? ` · chegou a ${clockLabel(l.peakSeconds)} de ${clockLabel(l.durationSeconds)}`
                          : ""}
                      </>
                    ) : (
                      "Inscreveu-se e não chegou a ver."
                    )}
                  </p>
                  {(l.origin || l.via) && (
                    <p className="mt-1 text-[13px]">
                      <span className="text-muted-foreground">Veio por </span>
                      {[l.origin, l.via].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {(l.clicked || l.messages > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {l.clicked && (
                        <Badge variant="outline">
                          Clicou{l.clickedAtSecond !== null ? ` aos ${clockLabel(l.clickedAtSecond)}` : ""}
                        </Badge>
                      )}
                      {l.messages > 0 && (
                        <Badge variant="outline">
                          {l.messages} {l.messages === 1 ? "mensagem" : "mensagens"} no chat
                        </Badge>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ))}

        {tab === "purchases" && (
          <Section title={file.totalPaid ? `Total pago: ${file.totalPaid}` : "Compras"}>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : file.purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda sem compras nem pagamentos iniciados.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {file.purchases.map((p) => {
                  const status = PURCHASE_STATUS[p.status] ?? { label: p.status, tone: "outline" as const };
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.title}</span>
                        <span className="text-[12px] text-muted-foreground">{formatDateTime(p.at)}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-semibold tabular-nums">{p.amount}</span>
                        <Badge variant={status.tone}>{status.label}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        {tab === "history" && (
          <div className="space-y-5">
            <Section title="Conversas">
              {file.conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não falou connosco.</p>
              ) : (
                <ul className="space-y-2">
                  {file.conversations.map((t) => {
                    const body = (
                      <>
                        <span className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                          <span className="truncate text-[13px] font-medium text-foreground">{t.title}</span>
                          <span className="shrink-0">{relativeDays(t.at)}</span>
                        </span>
                        {t.preview && (
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">{t.preview}</span>
                        )}
                        {t.cases.length > 0 && (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {t.cases.map((k) => (
                              <Badge key={k} variant="outline">
                                {k}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </>
                    );
                    return (
                      <li key={t.id}>
                        {onOpenConversation ? (
                          <button
                            type="button"
                            onClick={() => onOpenConversation(t.id)}
                            className="block min-h-11 w-full rounded-lg bg-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-gray-150"
                          >
                            {body}
                          </button>
                        ) : (
                          <div className="rounded-lg bg-gray-100 px-3 py-2.5">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
            <Section title="Actividade">
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : file.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda sem actividade registada.</p>
              ) : (
                <ol className="relative space-y-3.5 border-l pl-4">
                  {file.activity.map((a) => (
                    <li key={a.id} className="relative text-sm">
                      <span
                        className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card bg-gray-500"
                        aria-hidden
                      />
                      <p className="font-medium leading-snug">{a.label}</p>
                      {a.detail && <p className="text-muted-foreground">{a.detail}</p>}
                      <p className="text-[12px] text-muted-foreground">{formatDateTime(a.at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

/** As listas e os segmentos da pessoa: as listas tiram-se e põem-se à mão; os segmentos calculam-se. */
export function ListChips({
  lists,
  segments,
  addable,
  onAdd,
  onRemove,
}: {
  lists: { id: string; name: string }[];
  segments: { id: string; name: string; why?: string | undefined }[];
  addable: { id: string; name: string }[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Section
      title="Listas e segmentos"
      action={
        addable.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8">
                <Plus /> Juntar a lista
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {addable.map((l) => (
                <DropdownMenuItem key={l.id} onSelect={() => onAdd(l.id)}>
                  {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
    >
      {lists.length === 0 && segments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Não está em nenhuma lista nem segmento.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {lists.map((l) => (
            <Badge key={l.id} variant="secondary" className="gap-1 pr-1">
              {l.name}
              <button
                type="button"
                aria-label={`Tirar de ${l.name}`}
                className="relative rounded-full p-0.5 after:absolute after:-inset-3 after:content-[''] hover:bg-gray-150"
                onClick={() => onRemove(l.id)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {segments.map((s) => (
            <Badge key={s.id} variant="soft" title={s.why ? `Entra porque ${s.why}` : undefined}>
              <Sparkles aria-hidden /> {s.name}
            </Badge>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------- Resumo do grupo ---------- */

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** Sem ninguém aberto: onde as pessoas deste grupo pararam e de onde vieram. */
export function GroupSummary({
  title,
  counts,
  sources,
  stage,
  onStage,
  countries,
  country,
  onCountry,
  onBack,
}: {
  title: string;
  counts: StageCounts | null | undefined;
  sources: SourceRow[] | null | undefined;
  stage: string | null;
  onStage: (stage: string | null) => void;
  /** Pessoas por país (0089); sem a migração, null e a secção não aparece. */
  countries?: CountryRow[] | null | undefined;
  country?: string | null | undefined;
  onCountry?: ((code: string | null) => void) | undefined;
  onBack: () => void;
}) {
  const all = counts?.all ?? 0;
  const advice = stage ? STAGE_ADVICE[stage] : null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 items-center gap-1 border-b px-2">
        <Button variant="ghost" size="icon" className="shrink-0 @2xl:hidden" onClick={onBack} aria-label="Voltar aos contactos">
          <ArrowLeft />
        </Button>
        <p className="min-w-0 flex-1 truncate px-2 text-[13px] font-medium">Resumo do grupo</p>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        <div>
          <p className="truncate text-[13px] text-muted-foreground">{title}</p>
          {counts ? (
            <p className="mt-0.5 text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              {all.toLocaleString("pt-PT")}
              <span className="ml-1.5 text-[15px] font-normal tracking-normal text-muted-foreground">
                {all === 1 ? "pessoa" : "pessoas"}
              </span>
            </p>
          ) : (
            <Skeleton className="mt-1 h-8 w-24" />
          )}
        </div>

        {advice && (
          <p role="status" className="rounded-xl border bg-gray-50 px-3 py-2.5 text-[13px] leading-relaxed">
            {advice}
          </p>
        )}

        <Section title="Onde cada pessoa parou">
          {!counts ? (
            <Skeleton className="h-40 w-full" />
          ) : all === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém neste grupo ainda.</p>
          ) : (
            <ul className="space-y-1">
              {[...STAGES, { id: "returning" as const, label: "Voltaram 2+ vezes", hint: "" }].map((s) => {
                const n = counts[s.id] ?? 0;
                const on = stage === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onStage(on ? null : s.id)}
                      aria-pressed={on}
                      className={cn(
                        "w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                        on ? "bg-gray-150" : "hover:bg-gray-100",
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className={cn("truncate", n === 0 && "text-muted-foreground")}>{s.label}</span>
                        <span className="shrink-0 tabular-nums">
                          {n}
                          <span className="ml-1 text-[12px] text-muted-foreground">{pct(n, all)}%</span>
                        </span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-full bg-chart-track" aria-hidden>
                        <span
                          className={cn("block h-1.5 rounded-full", s.id === "customer" ? "bg-success" : "bg-chart-1")}
                          style={{ width: `${pct(n, all)}%` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {sources && sources.length > 0 && (
          <Section title="De onde vieram">
            <p className="mb-2.5 text-[13px] text-muted-foreground">{sourceVerdict(sources)}</p>
            <ul className="divide-y rounded-xl border">
              {sources.slice(0, 6).map((r) => (
                <li key={r.source} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{sourceLabel(r.source)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {" "}· {r.contacts} {r.contacts === 1 ? "pessoa" : "pessoas"}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">
                    {r.customers > 0 ? `${pct(r.customers, r.contacts)}% compram` : `${pct(r.clicked, r.contacts)}% clicam`}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {countries && countries.length > 0 && onCountry && (
          <CountrySection countries={countries} active={country ?? null} onSelect={onCountry} />
        )}

        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <ListChecks className="size-4 shrink-0" aria-hidden />
          Abra uma pessoa para ver os lançamentos, o que viu, o que comprou e as conversas.
        </p>
      </div>
    </div>
  );
}

/**
 * As pessoas do grupo por país, pelo IP da inscrição mais recente (como na Vista ao vivo).
 * Tocar num país filtra a lista; quem não tem país não se filtra.
 */
function CountrySection({
  countries,
  active,
  onSelect,
}: {
  countries: CountryRow[];
  active: string | null;
  onSelect: (code: string | null) => void;
}) {
  const [all, setAll] = useState(false);
  const known = countries.filter((r) => r.country_code);
  const unknown = countries.find((r) => !r.country_code)?.contacts ?? 0;
  const total = countries.reduce((n, r) => n + r.contacts, 0);
  const shown = all ? known : known.slice(0, 8);
  return (
    <Section title="De que países">
      <ul className="divide-y rounded-xl border">
        {shown.map((r) => {
          const code = r.country_code!;
          const on = active === code;
          return (
            <li key={code}>
              <button
                type="button"
                onClick={() => onSelect(on ? null : code)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] transition-colors",
                  on ? "bg-gray-150" : "hover:bg-gray-100",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span aria-hidden>{flagOf(code)}</span>
                  <span className="truncate font-medium">{countryLabel(code)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {r.contacts} · {pct(r.contacts, total)}%
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">
                  {r.customers > 0 ? `${r.customers} ${r.customers === 1 ? "cliente" : "clientes"}` : "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {known.length > 8 && (
        <Button variant="ghost" size="sm" className="mt-1" onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Ver os ${known.length} países`}
        </Button>
      )}
      {unknown > 0 && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          {unknown} {unknown === 1 ? "pessoa sem país" : "pessoas sem país"}: nunca se inscreveram (importados,
          compras de fora), por isso não há IP de onde o tirar.
        </p>
      )}
    </Section>
  );
}
