import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronRight, Ellipsis, LogOut, LucideProvider, Plus, Search, X } from "lucide-react";
import { createContext, lazy, Suspense, useContext, useEffect, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { toast } from "sonner";
import iconAsset from "@/assets/brand/novawebinar-icon.png";
import {
  BottomNav,
  PageHeader,
  type BackLink,
  type Crumb,
  type RailItem,
} from "@/components/ds/navigation";
import { Avatar } from "@/components/panel-modal";
import { phoneNav, roleLabels, SidebarNav } from "@/components/ui/dashboard-sidebar";
import { NotificationsBell } from "@/components/notifications-bell";
import { PageLoader, useInitialPageLoader } from "@/components/page-loader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { switchWorkspace, useAdminHostRedirect, useWorkspace, type Workspace } from "@/lib/data";
import { useCreditsRoute, useIntegrationsRoute, useSettingsRoute } from "@/lib/modal-route";
import { cn } from "@/lib/utils";
import { usePresence } from "@/lib/support/hooks";
import { canAttend, canOpenPath } from "@/lib/support/model";

/**
 * O menu da plataforma numa página com `rail` (o editor): começa recolhido e abre-se sem mexer no resto. No
 * computador e no tablet a barra lateral alarga; no telemóvel aparecem a barra de cima e a de baixo.
 */
const ShellMenu = createContext<{ open: boolean; toggle: () => void } | null>(null);
export const useShellMenu = () => useContext(ShellMenu);

export function AppShell({
  children,
  title,
  description,
  action = true,
  compact = false,
  crumbs,
  back,
  bleed = false,
  rail = false,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  action?: boolean | ReactNode;
  compact?: boolean;
  /** Migalhas por cima do título (páginas de detalhe). */
  crumbs?: Crumb[];
  /** Botão voltar circular à esquerda do título. */
  back?: BackLink;
  /** Sem margens nem largura máxima: a página ocupa a área toda (o editor do webinar). */
  bleed?: boolean;
  /** O menu da plataforma fica recolhido, só com ícones. */
  rail?: boolean;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  useAdminHostRedirect();
  // «Mais» no menu de baixo do telemóvel: o resto da navegação numa folha que sobe.
  const [moreOpen, setMoreOpen] = useState(false);
  // A pesquisa (⌘K): no computador abre pela barra lateral, no telemóvel pela lupa de cima.
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  // Entre 768 e 1023 px a barra lateral fica recolhida (só ícones) para o conteúdo respirar.
  const [tabletViewport, setTabletViewport] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("nw-sidebar-collapsed") === "1");
    const mobile = window.matchMedia("(max-width: 767px)");
    const tablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const updateViewport = () => {
      setMobileViewport(mobile.matches);
      setTabletViewport(tablet.matches);
    };
    updateViewport();
    mobile.addEventListener("change", updateViewport);
    tablet.addEventListener("change", updateViewport);
    return () => {
      mobile.removeEventListener("change", updateViewport);
      tablet.removeEventListener("change", updateViewport);
    };
  }, []);

  // ⌘K / Ctrl+K abre a pesquisa em qualquer página do painel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("nw-sidebar-collapsed", prev ? "0" : "1");
      return !prev;
    });
  };
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const { data: workspace } = useWorkspace();
  const role = workspace?.role;
  const supportOnly = role === "support";

  // Quem atende conta como presente com qualquer página do painel aberta, não
  // só a do Atendimento; sem isto passava a offline e deixava de receber casos.
  usePresence(workspace?.organizationId, canAttend(role));

  // A função "suporte" só abre o atendimento. As permissões a sério estão na
  // base de dados; isto evita mostrar-lhe páginas vazias.
  const blocked = !canOpenPath(role, pathname);
  useEffect(() => {
    if (blocked) void navigate({ to: "/support", search: { c: undefined }, replace: true });
  }, [blocked, navigate]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) navigate({ to: "/auth/login" });
      else setAuthorized(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate({ to: "/auth/login" });
      else setAuthorized(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  const showLoader = useInitialPageLoader(!authorized);
  // Ícones das páginas e das janelas com o traço 1.75 (a Lucide traz 2), como os dos botões.
  // O menu, o editor do webinar e o desenho do fluxo ficam como estavam.
  const iconStroke = bleed || pathname.startsWith("/automations/workflows/") ? 2 : 1.75;
  const sidebarCollapsed = (rail ? !railOpen : collapsed || tabletViewport) && !mobileViewport;
  const toggleRail = () => setRailOpen((open) => !open);
  // No telemóvel, com o menu recolhido, a página fica sem as barras de cima e de baixo.
  const phoneBars = !rail || railOpen;

  const { tabs: tabItems, more: moreGroups } = phoneNav(role);
  const tabActive = (item: RailItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
  const integrations = useIntegrationsRoute();
  const settings = useSettingsRoute();
  const credits = useCreditsRoute();
  const morePick = (to: string) => {
    setMoreOpen(false);
    if (to === "/integrations") integrations.go([]);
    else if (to === "/credits") credits.go([]);
    else if (to === "/settings") settings.go([]);
    else void navigate({ to: to as never });
  };
  const moreActive = (to: string) =>
    to === "/integrations"
      ? integrations.open
      : to === "/credits"
        ? credits.open
        : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div
      className="min-h-screen bg-background"
      // A largura do menu e a altura da barra de baixo, para o que fica fixo no ecrã (o editor) não ficar por baixo.
      style={
        {
          "--shell-left": sidebarCollapsed ? "72px" : "260px",
          "--shell-bottom": mobileViewport && phoneBars && !showLoader ? "calc(61px + max(10px, env(safe-area-inset-bottom)))" : "0px",
        } as CSSProperties
      }
    >
      {showLoader && (
        <div className="fixed inset-0 z-[100] isolate flex h-[100dvh] w-screen items-center justify-center bg-card">
          <PageLoader className="min-h-0 h-full bg-card" label="A carregar o painel" />
        </div>
      )}
      <div
        aria-hidden={showLoader ? true : undefined}
        className={`fixed inset-y-0 left-0 z-40 -translate-x-full transform transition-all duration-300 ease-in-out md:translate-x-0 ${
          sidebarCollapsed ? "w-[72px]" : "w-[260px]"
        }`}
      >
        <SidebarNav
          className="h-full"
          collapsed={sidebarCollapsed}
          onToggleCollapse={rail ? toggleRail : tabletViewport ? undefined : toggleCollapsed}
          role={role}
          searching={searching}
          onSearchingChange={setSearching}
        />
      </div>
      <div
        aria-hidden={showLoader ? true : undefined}
        // overflow-x-clip: um conteúdo largo demais não alarga a página no telemóvel
        // (o browser encolhia tudo e o menu de baixo ficava distorcido).
        className={`flex min-h-screen flex-col overflow-x-clip transition-all duration-300 ${showLoader ? "invisible" : "visible"} ${sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[260px]"}`}
      >
        {phoneBars && (
          <MobileHeader
            home={supportOnly ? "/support" : "/dashboard"}
            workspace={workspace}
            onSearch={() => setSearching(true)}
            onProfile={() => settings.go([])}
          />
        )}
        <LucideProvider strokeWidth={iconStroke}>
          <main
            className={
              bleed
                ? cn("flex w-full flex-1 flex-col pb-[var(--shell-bottom)] md:min-h-0 md:pb-0", phoneBars ? "min-h-[calc(100dvh-3.5rem)]" : "min-h-dvh")
                : `mx-auto flex w-full max-w-[1480px] min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 flex-col px-4 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))] md:min-h-0 md:pb-10 ${compact ? "md:px-6 md:pt-6" : "md:px-8 md:pt-8"}`
            }
          >
            {title && (
              <PageHeader
                title={title}
                description={description}
                crumbs={crumbs}
                back={back}
                compact={compact}
                toolbar={
                  typeof action === "boolean"
                    ? action &&
                      !supportOnly && (
                        <Button asChild>
                          <Link to="/webinars/new">
                            <Plus />
                            Novo webinar
                          </Link>
                        </Button>
                      )
                    : action
                }
              />
            )}
            <ShellMenu.Provider value={rail ? { open: railOpen, toggle: toggleRail } : null}>{blocked ? null : children}</ShellMenu.Provider>
          </main>
        </LucideProvider>
      </div>
      <BottomNav
        items={tabItems}
        isActive={tabActive}
        hidden={showLoader || !phoneBars}
        extra={{
          label: "Mais",
          icon: Ellipsis,
          onClick: () => setMoreOpen(true),
          // Aceso também quando a página aberta é uma das do «Mais» (Contactos, Créditos…).
          active: moreOpen || moreGroups.some((g) => g.items.some((it) => moreActive(it.to))),
        }}
      />
      <MoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        groups={moreGroups}
        isActive={moreActive}
        onPick={morePick}
        workspace={workspace}
      />
      {/* Integrações, Definições e Créditos: pop-ups por cima da página onde se está
          (#integracoes, #definicoes, #creditos). */}
      <LucideProvider strokeWidth={1.75}>
        {authorized && integrations.open && (
          <Suspense fallback={null}>
            <IntegrationsModal />
          </Suspense>
        )}
        {authorized && settings.open && (
          <Suspense fallback={null}>
            <SettingsModal />
          </Suspense>
        )}
        {authorized && credits.open && (
          <Suspense fallback={null}>
            <CreditsModal />
          </Suspense>
        )}
      </LucideProvider>
    </div>
  );
}

const IntegrationsModal = lazy(() => import("@/components/integrations-modal"));
const SettingsModal = lazy(() => import("@/components/settings-modal"));
const CreditsModal = lazy(() => import("@/components/credits-modal"));

/**
 * A barra fina do telemóvel: a marca, a pesquisa, os avisos e a conta. No computador a
 * navegação, a pesquisa e a conta vivem na barra lateral.
 */
export function MobileHeader({
  home,
  workspace,
  onSearch,
  onProfile,
}: {
  home: "/support" | "/dashboard";
  workspace: Workspace | null | undefined;
  onSearch: () => void;
  onProfile: () => void;
}) {
  return (
    <header className="glass sticky top-0 z-20 flex h-14 items-center justify-between gap-3 px-4 md:hidden">
      <Link to={home} className="flex min-w-0 items-center gap-2" aria-label="Novawebinar">
        <img src={iconAsset} alt="" className="size-7" draggable={false} />
        <span className="truncate text-[15px] font-semibold tracking-[-0.04em]">
          Novawebinar
        </span>
      </Link>
      <div className="-mr-1.5 flex shrink-0 items-center">
        {workspace?.isTest && <TestBadge />}
        <button
          type="button"
          onClick={onSearch}
          aria-label="Pesquisar"
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-[var(--hover-ghost)]"
        >
          <Search className="size-5" strokeWidth={1.5} />
        </button>
        <NotificationsBell quiet className="size-11" />
        <button
          type="button"
          onClick={onProfile}
          aria-label="Perfil e definições"
          className="cursor-pointer rounded-full p-1.5"
        >
          {workspace ? (
            <Avatar workspace={workspace} />
          ) : (
            <span className="block size-8 rounded-full bg-chip" />
          )}
        </button>
      </div>
    </header>
  );
}

/**
 * O «Mais» do telemóvel: a conta em cima (abre as Definições) e o resto do menu em
 * listas agrupadas, como nas definições do iPhone e do Instagram: uma linha por
 * entrada, sem mosaicos órfãos, os mesmos grupos da barra lateral.
 */
export function MoreSheet({
  open,
  onOpenChange,
  groups,
  isActive,
  onPick,
  workspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: { heading: string; items: { to: string; title: string; icon: ElementType }[] }[];
  isActive: (to: string) => boolean;
  onPick: (to: string) => void;
  workspace: Workspace | null | undefined;
}) {
  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão terminada");
    window.location.href = "/auth/login";
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="scrollbar-thin max-h-[88dvh] gap-0 overflow-y-auto rounded-t-[20px] border-0 bg-background px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden [&>button]:hidden"
      >
        <span className="mx-auto mb-2 block h-1 w-9 rounded-full bg-gray-300" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <SheetTitle className="text-[17px] font-semibold tracking-[-0.02em]">Menu</SheetTitle>
          <SheetClose
            aria-label="Fechar"
            className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-gray-150 text-gray-700 after:absolute after:-inset-1.5 after:content-[''] active:bg-gray-250"
          >
            <X className="size-4" strokeWidth={2} />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">O resto do menu e a sua conta.</SheetDescription>
        <div className="flex flex-col gap-4">
          {workspace && (
            <button
              type="button"
              onClick={() => onPick("/settings")}
              className="flex cursor-pointer items-center gap-3 rounded-xl bg-card px-3.5 py-3 text-left shadow-[var(--shadow-border)] active:bg-gray-100"
            >
              <Avatar workspace={workspace} className="size-10 text-[15px]" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[15px] font-medium">
                  {workspace.fullName || "A minha conta"}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  {workspace.organizationName} · {roleLabels[workspace.role]}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-gray-400" aria-hidden />
            </button>
          )}
          {groups.map((g) => (
            // O grupo principal não tem título, como na barra lateral.
            <MoreGroup key={g.heading} heading={g.heading === "Principal" ? undefined : g.heading}>
              {g.items.map((it, i) => {
                const active = isActive(it.to);
                return (
                  <MoreRow key={it.to} onClick={() => onPick(it.to)} active={active}>
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md",
                        active ? "bg-accent text-brand" : "bg-gray-100 text-gray-800",
                      )}
                    >
                      <it.icon className="size-[17px]" strokeWidth={1.75} aria-hidden />
                    </span>
                    <MoreLabel first={i === 0}>
                      <span className={cn("min-w-0 flex-1 truncate", active && "font-medium")}>
                        {it.title}
                      </span>
                      {active ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-gray-400" aria-hidden />
                      )}
                    </MoreLabel>
                  </MoreRow>
                );
              })}
            </MoreGroup>
          ))}
          {workspace && workspace.organizations.length > 1 && (
            <MoreGroup heading="Espaço de trabalho">
              {workspace.organizations.map((org, i) => {
                const current = org.id === workspace.organizationId;
                return (
                  <MoreRow
                    key={org.id}
                    disabled={current}
                    onClick={() => switchWorkspace(org.id)}
                  >
                    <MoreLabel first={i === 0}>
                      <span className={cn("min-w-0 flex-1 truncate", current && "font-medium")}>
                        {org.name}
                      </span>
                      {org.isTest && <TestBadge />}
                      {current && <Check className="size-4 shrink-0 text-brand" aria-label="Actual" />}
                    </MoreLabel>
                  </MoreRow>
                );
              })}
            </MoreGroup>
          )}
          <MoreGroup>
            <MoreRow onClick={() => void signOut()}>
              <MoreLabel first>
                <span className="flex flex-1 items-center justify-center gap-2 text-destructive">
                  <LogOut className="size-[17px]" strokeWidth={1.75} aria-hidden /> Terminar sessão
                </span>
              </MoreLabel>
            </MoreRow>
          </MoreGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MoreGroup({ heading, children }: { heading?: string | undefined; children: ReactNode }) {
  return (
    <section>
      {heading && <h3 className="mb-1.5 px-3.5 text-[12px] font-medium text-gray-600">{heading}</h3>}
      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">{children}</div>
    </section>
  );
}

function MoreRow({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className="flex h-11 w-full cursor-pointer items-center gap-3 pl-3.5 text-left text-[15px] tracking-[-0.01em] transition-colors active:bg-gray-100 disabled:cursor-default disabled:active:bg-transparent"
    >
      {children}
    </button>
  );
}

/** O texto da linha; a linha divisória começa no texto, não no ícone (como no iPhone). */
function MoreLabel({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex h-full min-w-0 flex-1 items-center gap-2 pr-3.5",
        !first && "border-t border-[var(--border-subtle)]",
      )}
    >
      {children}
    </span>
  );
}

/** Conta de teste: dados fictícios e nenhum envio real. */
function TestBadge() {
  return (
    <span
      className="shrink-0 rounded-xs bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning uppercase"
      title="Conta de teste: dados fictícios, nada sai para destinos reais"
    >
      Teste
    </span>
  );
}
