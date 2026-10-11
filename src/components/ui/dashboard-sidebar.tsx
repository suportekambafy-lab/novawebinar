import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  Calendar,
  SquareActivity,
  ChevronsUpDown,
  ContactRound,
  LayoutGrid,
  Inbox,
  Library,
  LogOut,
  MessagesSquare,
  PanelLeft,
  MonitorDot,
  Search,
  Settings,
  WalletMinimal,
  UserRoundCog,
  Video,
  Zap,
  type LucideIcon, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import iconAsset from "@/assets/brand/novawebinar-icon.png";
import { NotificationsBell } from "@/components/notifications-bell";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchWorkspace, useWorkspace } from "@/lib/data";
import { useCreditsRoute, useIntegrationsRoute, useSettingsRoute } from "@/lib/modal-route";
import { canAttend, canManageTeam, canOpenPath, type WorkspaceRole } from "@/lib/support/model";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  title: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Quem vê a entrada, além do que a função já pode abrir. */
  show?: (role: WorkspaceRole | undefined) => boolean;
};

/*
 * Organização da navegação (9/10): em cima, as quatro entradas do dia a dia (as
 * mesmas do menu de baixo do telemóvel) e a Biblioteca; depois as pessoas, os
 * dados e, no fundo, a conta.
 */
// Ícones da referência do projecto (novawebinar-design: layout-grid, calendar,
// square-activity…) e próprios da Novawebinar.
export const NAV_ICON = {
  dashboard: LayoutGrid,
  webinars: Video,
  calendar: Calendar,
  support: MessagesSquare,
  contacts: ContactRound,
  automations: Zap,
  live: MonitorDot,
  cases: Inbox,
  analytics: SquareActivity,
  abTests: FlaskConical,
  library: Library,
  team: UserRoundCog,
  integrations: Blocks,
  credits: WalletMinimal,
  settings: Settings,
} as const;

const MAIN: NavItem[] = [
  { to: "/dashboard", title: "Painel", icon: NAV_ICON.dashboard, exact: true },
  { to: "/webinars", title: "Webinars", icon: NAV_ICON.webinars },
  { to: "/calendar", title: "Agenda", icon: NAV_ICON.calendar },
  { to: "/automations", title: "Automações", icon: NAV_ICON.automations },
  { to: "/library", title: "Biblioteca", icon: NAV_ICON.library },
];

const SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Pessoas",
    items: [
      { to: "/support", title: "Atendimento", icon: NAV_ICON.support, show: canAttend },
      { to: "/cases", title: "Casos", icon: NAV_ICON.cases, show: canAttend },
      { to: "/contacts", title: "Contactos", icon: NAV_ICON.contacts },
    ],
  },
  {
    heading: "Dados",
    items: [
      { to: "/live-view", title: "Ao vivo", icon: NAV_ICON.live },
      { to: "/analytics", title: "Análises", icon: NAV_ICON.analytics },
      { to: "/ab-tests", title: "Testes A/B", icon: NAV_ICON.abTests },
    ],
  },
];

const ACCOUNT: NavItem[] = [
  { to: "/team", title: "Equipas", icon: NAV_ICON.team, show: canManageTeam },
  { to: "/integrations", title: "Integrações", icon: NAV_ICON.integrations },
  { to: "/credits", title: "Créditos", icon: NAV_ICON.credits },
];

/** As entradas que esta função vê, por grupo; o «Mais» do menu de baixo (telemóvel) usa-as. */
export function navGroups(role: WorkspaceRole | undefined) {
  const visible = (item: NavItem) => canOpenPath(role, item.to) && (item.show?.(role) ?? true);
  return [{ heading: "Principal", items: MAIN }, ...SECTIONS, { heading: "Conta", items: ACCOUNT }]
    .map((g) => ({ heading: g.heading, items: g.items.filter(visible) }))
    .filter((g) => g.items.length);
}

/**
 * O menu do telemóvel: as quatro primeiras entradas que a função vê ficam na barra de
 * baixo (Painel, Webinars, Agenda, Automações; quem só atende: Atendimento, Casos,
 * Contactos) e as restantes vão para a folha «Mais», pelos mesmos grupos.
 */
export function phoneNav(role: WorkspaceRole | undefined) {
  const groups = navGroups(role);
  const tabs = groups
    .flatMap((g) => g.items)
    .slice(0, 4)
    .map((it) => ({ to: it.to, label: it.title, icon: it.icon, ...(it.exact ? { exact: true } : {}) }));
  const inTabs = new Set(tabs.map((t) => t.to));
  const more = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !inTabs.has(it.to)) }))
    .filter((g) => g.items.length);
  return { tabs, more };
}

export const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Membro",
  support: "Suporte",
};

export function SidebarNav({
  className = "",
  collapsed = false,
  onToggleCollapse,
  role,
  searching,
  onSearchingChange,
}: {
  /** Função de quem está a ver: decide as entradas do menu. */
  role?: WorkspaceRole | undefined;
  /** A pesquisa (⌘K) aberta. Vive na página: no telemóvel abre-se pela lupa da barra de cima. */
  searching: boolean;
  onSearchingChange: (open: boolean) => void;
  className?: string | undefined;
  collapsed?: boolean | undefined;
  onToggleCollapse?: (() => void) | undefined;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const integrations = useIntegrationsRoute();
  const settings = useSettingsRoute();
  const credits = useCreditsRoute();
  const { data: workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  // ⌘K no Mac, Ctrl K no resto; decidido depois de montar para o servidor e o browser coincidirem.
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcut("⌘K");
  }, []);

  const visible = (item: NavItem) => canOpenPath(role, item.to) && (item.show?.(role) ?? true);
  const home = role === "support" ? "/support" : "/dashboard";
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);

  const main = MAIN.filter(visible);
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter(visible) })).filter((s) => s.items.length);
  const account = ACCOUNT.filter(visible);
  const everything = [...main, ...sections.flatMap((s) => s.items), ...account];

  const go = (to: string, search?: Record<string, string | undefined>) => {
    onSearchingChange(false);
    setQuery("");
    if (to === "/integrations") return integrations.go([]);
    if (to === "/settings") return settings.go([]);
    if (to === "/credits") return credits.go([]);
    void navigate({ to: to as never, search: search as never });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão terminada");
    window.location.href = "/auth/login";
  };

  const row = (item: NavItem) => {
    // Integrações e Créditos abrem um pop-up por cima da página onde se está, em vez de mudar de página.
    const modal =
      item.to === "/integrations" ? integrations : item.to === "/credits" ? credits : null;
    const active = modal ? modal.open : isActive(item);
    const props = {
      title: collapsed ? item.title : undefined,
      "aria-label": item.title,
      "aria-current": active ? ("page" as const) : undefined,
      className: cn(
        "group flex cursor-pointer items-center text-left transition-colors duration-[var(--duration-fast)]",
        collapsed
          ? "mx-auto size-10 justify-center rounded-full"
          : "h-9 gap-3 rounded-md px-3 text-[14px] tracking-[-0.01em]",
        active
          ? "bg-chip text-foreground"
          : "text-gray-800 hover:bg-[var(--hover-ghost)] hover:text-foreground",
      ),
    };
    const content = (
      <>
        <item.icon
          className={cn(
            "size-[18px] shrink-0",
            active ? "text-brand" : "text-gray-700 group-hover:text-foreground",
          )}
          strokeWidth={1.75}
        />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.title}</span>}
      </>
    );
    return modal ? (
      <button
        key={item.to}
        type="button"
        onClick={() => modal.go([])}
        {...props}
      >
        {content}
      </button>
    ) : (
      <Link key={item.to} to={item.to} {...props}>
        {content}
      </Link>
    );
  };

  const name = workspace?.fullName?.trim() || "A minha conta";
  const initial = name.charAt(0).toUpperCase();
  const avatar = workspace?.avatarUrl ? (
    <img src={workspace.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy text-[13px] text-white">
      {initial}
    </span>
  );

  const iconButton =
    "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-[var(--hover-ghost)] hover:text-foreground";

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r border-hairline bg-sidebar-surface font-sans",
        collapsed ? "w-[72px]" : "w-[260px]",
        className,
      )}
    >
      {/* Cabeçalho: a marca, os avisos e recolher; por baixo, a pesquisa (⌘K). */}
      <div className={cn("flex shrink-0 items-center pt-5", collapsed ? "flex-col gap-3 px-3 pb-4" : "gap-0.5 px-3 pb-3")}>
        <Link
          to={home}
          aria-label="Novawebinar"
          className={cn("flex min-w-0 items-center gap-2.5", !collapsed && "flex-1 pl-1")}
        >
          <img src={iconAsset} alt="" className="size-7 shrink-0 select-none" draggable={false} />
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-[-0.04em] text-foreground">
              Novawebinar
            </span>
          )}
        </Link>
        {collapsed && (
          <button
            type="button"
            className={iconButton}
            onClick={() => onSearchingChange(true)}
            title={`Pesquisar (${shortcut})`}
            aria-label="Pesquisar"
          >
            <Search className="size-[17px]" strokeWidth={1.6} />
          </button>
        )}
        <NotificationsBell quiet className="size-8" side={collapsed ? "right" : "bottom"} align="start" />
        {onToggleCollapse && (
          <button
            type="button"
            className={cn(iconButton, "hidden md:inline-flex")}
            onClick={onToggleCollapse}
            title={collapsed ? "Abrir menu" : "Recolher menu"}
            aria-label={collapsed ? "Abrir menu" : "Recolher menu"}
          >
            <PanelLeft className="size-[17px]" strokeWidth={1.6} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="shrink-0 px-3 pb-4">
          <button
            type="button"
            onClick={() => onSearchingChange(true)}
            className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md bg-white px-2.5 text-[13px] text-gray-600 shadow-[var(--shadow-border)] transition-colors hover:text-foreground"
          >
            <Search className="size-[15px] shrink-0" strokeWidth={1.6} aria-hidden />
            <span className="flex-1 text-left">Pesquisar…</span>
            <kbd className="rounded-xs bg-gray-100 px-1.5 py-px font-sans text-xs text-gray-600">{shortcut}</kbd>
          </button>
        </div>
      )}

      <nav
        aria-label="Navegação principal"
        className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-3"
      >
        <div className={cn("flex flex-col", collapsed ? "gap-2" : "gap-0.5")}>{main.map((item) => row(item))}</div>
        {sections.map((section) => (
          <div key={section.heading} className={cn("flex flex-col", collapsed ? "gap-2" : "gap-0.5")}>
            {!collapsed ? (
              <span className="mb-1 px-3 text-[12px] text-gray-600">{section.heading}</span>
            ) : (
              <span className="mx-auto mb-1 h-px w-6 bg-gray-250" aria-hidden />
            )}
            {section.items.map((item) => row(item))}
          </div>
        ))}
        {/* Conta: ferramentas da conta, no fundo da lista (desliza com ela). */}
        {account.length > 0 && (
          <div className={cn("mt-auto flex flex-col", collapsed ? "gap-2" : "gap-0.5")}>
            {!collapsed ? (
              <span className="mb-1 px-3 text-[12px] text-gray-600">Conta</span>
            ) : (
              <span className="mx-auto mb-1 h-px w-6 bg-gray-250" aria-hidden />
            )}
            {account.map((item) => row(item))}
          </div>
        )}
      </nav>

      {/* A pessoa, sempre visível no fundo: um toque abre a conta (definições, espaço de trabalho, sair). */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md text-left transition-colors hover:bg-[var(--hover-ghost)] data-[state=open]:bg-chip",
                collapsed ? "justify-center p-1" : "py-1.5 pr-2 pl-1.5",
              )}
              aria-label="Conta e espaço de trabalho"
              title={collapsed ? name : undefined}
            >
              {avatar}
              {!collapsed && (
                <>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-[14px] tracking-[-0.01em]">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {workspace?.organizationName ?? (workspace ? roleLabels[workspace.role] : "")}
                    </span>
                  </span>
                  <ChevronsUpDown className="size-3.5 shrink-0 text-gray-500" aria-hidden />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} className="w-64">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm text-foreground">{name}</span>
              <span>{workspace ? roleLabels[workspace.role] : ""}</span>
            </DropdownMenuLabel>
            {workspace && workspace.organizations.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Espaço de trabalho</DropdownMenuLabel>
                {workspace.organizations.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    disabled={org.id === workspace.organizationId}
                    onSelect={() => switchWorkspace(org.id)}
                  >
                    <span className="truncate">{org.name}</span>
                    {org.isTest && (
                      <span className="shrink-0 rounded-xs bg-warning-soft px-1.5 py-0.5 text-xs text-warning uppercase">
                        Teste
                      </span>
                    )}
                    <span className="ml-auto pl-3 text-xs text-muted-foreground">{roleLabels[org.role]}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go("/settings")}>
              <Settings /> Definições
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut /> Terminar sessão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandDialog open={searching} onOpenChange={onSearchingChange}>
        <CommandInput placeholder="Pesquisar webinars ou ir para…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>Sem resultados.</CommandEmpty>
          {query.trim() && canOpenPath(role, "/webinars") && (
            <CommandGroup heading="Webinars">
              <CommandItem forceMount value={`pesquisar ${query}`} onSelect={() => go("/webinars", { q: query.trim() })}>
                <Search /> Pesquisar webinars por «{query.trim()}»
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Ir para">
            {everything.map((item) => (
              <CommandItem key={item.to} value={item.title} onSelect={() => go(item.to)}>
                <item.icon /> {item.title}
              </CommandItem>
            ))}
            <CommandItem value="Definições" onSelect={() => go("/settings")}>
              <Settings /> Definições
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
