/**
 * A caixa do Atendimento, só desenho: a lista de conversas, o estado do agente
 * e a moldura das colunas. Os dados chegam
 * por props, reais ou do exemplo; nada aqui lê a base de dados.
 */
import { Link } from "@tanstack/react-router";
import { Bot, MonitorPlay, Search } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/ds/brand-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { INBOX_TABS, type InboxItem, type InboxTab } from "@/lib/support/inbox";
import { cn } from "@/lib/utils";
import { hourLabel, initials } from "./badges";

/* ---------- Pessoa e canal ---------- */

const CHANNELS: Record<string, { label: string; brand?: string }> = {
  webinar_chat: { label: "Sala" },
  whatsapp: { label: "WhatsApp", brand: "WhatsApp" },
  instagram: { label: "Instagram", brand: "Instagram" },
  email: { label: "E-mail", brand: "Email" },
};

export const channelName = (channel: string) => CHANNELS[channel]?.label ?? "Sala";

export function ChannelLogo({ channel, className }: { channel: string; className?: string }) {
  const brand = CHANNELS[channel]?.brand;
  if (brand) return <BrandLogo name={brand} className={cn(className)} />;
  return (
    <MonitorPlay className={cn("size-4 shrink-0 text-foreground", className)} aria-label="Sala" />
  );
}

// Iniciais sobre uma cor suave, sempre a mesma para o mesmo nome.
const TONES = [
  "bg-[#E8F1FF] text-[#0B5CD5]",
  "bg-[#E9F8EE] text-[#177A3C]",
  "bg-[#FFF1E5] text-[#A74A00]",
  "bg-[#F4ECFF] text-[#6B2BD6]",
  "bg-[#FFEAF1] text-[#B21E55]",
  "bg-[#E6F7F7] text-[#0D7171]",
];
const toneOf = (name: string) =>
  TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TONES.length];

/** Fotografia (ou iniciais) com o canal da conversa no canto, como no Meta Business Suite. */
export function PersonPhoto({
  name,
  photo,
  channel,
  size = 44,
}: {
  name: string;
  photo?: string | null | undefined;
  channel?: string | undefined;
  size?: number;
}) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className={cn(
          "flex size-full items-center justify-center overflow-hidden rounded-full font-semibold",
          !photo && toneOf(name),
        )}
        style={{ fontSize: Math.round(size * 0.34) }}
        aria-hidden
      >
        {photo ? <img src={photo} alt="" className="size-full object-cover" /> : initials(name)}
      </span>
      {channel && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-white shadow-[0_0_0_2px_var(--color-card)]"
          style={{ width: Math.round(size * 0.42), height: Math.round(size * 0.42) }}
          title={channelName(channel)}
        >
          <ChannelLogo channel={channel} className="size-[68%]" />
        </span>
      )}
    </span>
  );
}

/* ---------- Etiquetas ---------- */

export function ExampleTag() {
  return (
    <span className="shrink-0 rounded-xs bg-warning-soft px-1.5 py-px text-xs font-semibold uppercase text-warning">
      Exemplo
    </span>
  );
}

/* ---------- Lista de conversas ---------- */

const PREFIX: Record<string, string> = { ai: "Agente: ", team: "Equipa: " };

export function InboxList({
  items,
  activeId,
  tab,
  counts,
  onTab,
  search,
  onSearch,
  webinars,
  webinarId,
  onWebinar,
  onSelect,
}: {
  items: InboxItem[];
  activeId: string | null;
  tab: InboxTab;
  counts: Record<InboxTab, number>;
  onTab: (tab: InboxTab) => void;
  search: string;
  onSearch: (value: string) => void;
  webinars: { id: string; title: string }[];
  webinarId: string | null;
  onWebinar: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b px-3 pb-3 pt-2">
        <div
          role="tablist"
          aria-label="Conversas"
          className="-mx-1 flex justify-between overflow-x-auto [scrollbar-width:none]"
        >
          {INBOX_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1 border-b-2 px-1 text-[13px] font-medium transition-colors",
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {/* Só as novas levam número: é o que pede uma pessoa. */}
              {t.id === "new" && counts.new > 0 && (
                <span
                  className={cn(
                    "min-w-[1.125rem] rounded-pill px-1 text-center text-xs tabular-nums",
                    tab === t.id ? "bg-foreground text-background" : "bg-gray-150 text-foreground",
                  )}
                >
                  {counts.new}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Procurar nome ou mensagem"
            aria-label="Procurar conversas"
            className="h-10 pl-9"
          />
        </div>
        {webinars.length > 1 && (
          <div
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]"
            aria-label="Filtrar por webinar"
          >
            <FilterChip active={webinarId === null} onClick={() => onWebinar(null)}>
              Todos
            </FilterChip>
            {webinars.map((w) => (
              <FilterChip key={w.id} active={webinarId === w.id} onClick={() => onWebinar(w.id)}>
                <span className="max-w-[9rem] truncate">{w.title}</span>
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma conversa aqui.
          </li>
        )}
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={activeId === item.id ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left transition-colors",
                // No telemóvel a lista está sozinha: nenhuma linha fica marcada, como no WhatsApp.
                activeId === item.id ? "@2xl:bg-gray-150" : "hover:bg-gray-100",
              )}
            >
              <PersonPhoto name={item.name} photo={item.photo} channel={item.channel} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-[14px]",
                      item.lastFrom === "contact" ? "font-semibold" : "font-medium",
                    )}
                  >
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-[12px] tabular-nums",
                      item.lastFrom === "contact"
                        ? "font-medium text-success"
                        : "text-muted-foreground",
                    )}
                  >
                    {hourLabel(item.at)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px]",
                      item.lastFrom === "contact" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {PREFIX[item.lastFrom ?? ""] ?? ""}
                    {item.preview || "Sem mensagens"}
                  </span>
                  {/* A única etiqueta: alguém à espera de uma pessoa (a vermelho se o prazo passou). */}
                  {item.state === "new" && (
                    <Badge
                      variant={item.sla === "breached" ? "destructive" : "warning"}
                      className="shrink-0"
                    >
                      À espera
                    </Badge>
                  )}
                  {item.lastFrom === "contact" && (
                    <span
                      className="size-2.5 shrink-0 rounded-full bg-success"
                      aria-label="Por responder"
                    />
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

/* ---------- Agente ---------- */

/** O agente da conta em poucas palavras: se está a trabalhar e o que fez hoje. */
export function AgentStatus({
  active,
  paused = null,
  onPausedChange,
  resolved,
  escalated,
}: {
  active: boolean | null;
  /** Em pausa em todas as conversas (o interruptor); null enquanto carrega ou no exemplo. */
  paused?: boolean | null;
  onPausedChange?: ((paused: boolean) => void) | undefined;
  resolved: number | null;
  escalated: number | null;
}) {
  const state =
    active === null || (onPausedChange && paused === null)
      ? "…"
      : paused
        ? "Em pausa"
        : active
          ? "Activo"
          : "Desligado";
  return (
    <div className="flex h-10 items-center gap-2.5 rounded-pill border bg-card pl-2 pr-3 text-[13px]">
      <span className="flex size-7 items-center justify-center rounded-full bg-gray-150">
        <Bot className="size-4" aria-hidden />
      </span>
      <span className="font-medium">Agente IA</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className={cn("size-2 rounded-full", active && !paused ? "bg-success" : "bg-gray-400")}
          aria-hidden
        />
        {state}
      </span>
      {/* O interruptor de todas as conversas: desligado, cada mensagem nova vai para a equipa. */}
      {onPausedChange && (
        <label className="flex cursor-pointer items-center gap-1.5 border-l pl-2.5">
          <span className="hidden text-muted-foreground sm:inline">Em todas as conversas</span>
          <Switch
            checked={paused === false}
            disabled={paused === null}
            aria-label="Agente IA em todas as conversas"
            onCheckedChange={(on) => onPausedChange(!on)}
          />
        </label>
      )}
      {/* Os números do dia só no computador; no telemóvel e no tablet, só o estado. */}
      <span className="hidden h-4 w-px bg-gray-300 xl:block" aria-hidden />
      <span className="hidden text-muted-foreground xl:inline">
        Hoje <strong className="font-medium text-foreground tabular-nums">{resolved ?? 0}</strong>{" "}
        resolvidas ·{" "}
        <strong className="font-medium text-foreground tabular-nums">{escalated ?? 0}</strong>{" "}
        passadas
      </span>
      <Link
        to="/cases"
        search={{ id: undefined }}
        className="hidden font-medium underline-offset-4 hover:underline md:inline"
      >
        Ver actividade
      </Link>
    </div>
  );
}

/* ---------- Moldura ---------- */

export type InboxStep = "list" | "chat" | "contact";

/**
 * No telemóvel, a conversa e o contacto ocupam o ecrã por baixo da barra do
 * topo e tapam o menu de baixo, como no WhatsApp: a caixa de escrever fica
 * sempre à vista e volta-se à lista pela seta.
 */
const PHONE_SCREEN =
  "max-md:@max-2xl:fixed max-md:@max-2xl:inset-x-0 max-md:@max-2xl:top-14 max-md:@max-2xl:bottom-0 max-md:@max-2xl:z-40 max-md:@max-2xl:h-auto max-md:@max-2xl:min-h-0 max-md:@max-2xl:bg-card";

/**
 * Pela largura que sobra (não pela do ecrã, porque o menu da plataforma pode
 * estar aberto ou recolhido): com espaço, lista e conversa lado a lado; estreito,
 * um passo de cada vez. O contacto fica escondido e abre ao tocar na foto ou no
 * nome, como no WhatsApp: com muito espaço ao lado da conversa, senão no lugar dela.
 */
export function InboxFrame({
  step,
  banner,
  list,
  conversation,
  contact,
}: {
  step: InboxStep;
  /** Por cima de tudo (o aviso do modo exemplo). */
  banner?: ReactNode;
  list: ReactNode;
  conversation: ReactNode;
  contact: ReactNode;
}) {
  return (
    <div className="@container">
      {/* Com espaço, a caixa ocupa a altura do ecrã e só as colunas rolam. */}
      <div className="flex flex-col gap-4 @2xl:h-[calc(100dvh-8rem)] @2xl:min-h-[38rem]">
        {banner}
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-card border bg-card @2xl:grid-cols-[20rem_minmax(0,1fr)] @5xl:grid-cols-[21rem_minmax(0,1fr)]",
            step === "contact" && "@5xl:grid-cols-[21rem_minmax(0,1fr)_21rem]",
          )}
        >
          <aside
            className={cn(
              "min-w-0 @2xl:min-h-0 @2xl:border-r",
              step === "list" ? "flex flex-col" : "hidden @2xl:flex @2xl:flex-col",
            )}
          >
            {list}
          </aside>
          <section
            className={cn(
              "h-[calc(100dvh-11rem)] min-h-[28rem] min-w-0 @2xl:h-auto @2xl:min-h-0",
              step === "chat"
                ? cn("flex flex-col", PHONE_SCREEN)
                : step === "contact"
                  ? "hidden @5xl:flex @5xl:flex-col"
                  : "hidden @2xl:flex @2xl:flex-col",
            )}
          >
            {conversation}
          </section>
          <aside
            className={cn(
              "h-[calc(100dvh-11rem)] min-h-[28rem] min-w-0 @2xl:h-auto @2xl:min-h-0 @5xl:border-l",
              step === "contact"
                ? cn(
                    "flex flex-col @2xl:col-start-2 @2xl:row-start-1 @5xl:col-start-3",
                    PHONE_SCREEN,
                  )
                : "hidden",
            )}
          >
            {contact}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Faixa do modo exemplo: diz claramente que nada é real. */
export function ExampleBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] @2xl:px-4 @2xl:text-sm">
      <ExampleTag />
      <span className="min-w-0 flex-1 text-foreground">
        Contactos fictícios<span className="hidden @2xl:inline"> para ver como fica</span>. Nada é
        guardado nem enviado.
      </span>
      <Button size="sm" variant="outline" onClick={onExit} className="shrink-0">
        <span className="@2xl:hidden">Sair</span>
        <span className="hidden @2xl:inline">Sair do exemplo</span>
      </Button>
    </div>
  );
}
