import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAll } from "@/lib/fetch-all";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Lock, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ds/data";
import { EmptySection } from "@/components/page-primitives";
import { PresenceDot } from "@/components/support/badges";
import { ContactPanel } from "@/components/support/contact-panel";
import { ConversationView } from "@/components/support/conversation-view";
import { EXAMPLE_AGENT, ExampleInbox } from "@/components/support/example";
import { AgentStatus, InboxFrame, InboxList, type InboxStep } from "@/components/support/inbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWebinars, useWorkspace } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";
import {
  setMyStatus,
  useCases,
  useDepartments,
  useSkills,
  useStaff,
  useSupportConversations,
  useSupportInvalidate,
  useSupportRealtime,
  useSupportSetup,
} from "@/lib/support/hooks";
import {
  agentToday,
  countTabs,
  inTab,
  matchesSearch,
  sortInbox,
  toInboxItem,
  webinarFilters,
  type InboxTab,
} from "@/lib/support/inbox";
import {
  canAttend,
  isOpenStatus,
  STAFF_STATUSES,
  type CaseRow,
  type StaffStatus,
} from "@/lib/support/model";
import { setOrganizationAi } from "@/lib/support/support.functions";

/** `exemplo`: contactos fictícios, só no browser (G5). */
type SupportSearch = { c?: string | undefined; exemplo?: 1 | undefined };

export const Route = createFileRoute("/support")({
  validateSearch: (search: Record<string, unknown>): SupportSearch => ({
    ...(typeof search["c"] === "string" ? { c: search["c"] } : {}),
    ...(search["exemplo"] === 1 || search["exemplo"] === "1" ? { exemplo: 1 as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Atendimento | Novawebinar" },
      {
        name: "description",
        content:
          "O agente qualifica e responde primeiro; o que precisa de uma pessoa chega à equipa certa, com o contexto todo.",
      },
    ],
  }),
  component: SupportPage,
});

/**
 * O que o agente fez hoje: quantas conversas resolveu sozinho e quantas passou à
 * equipa. Conta conversas, não respostas (ver `agentToday`).
 */
function useAiToday(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "events", "ai-today", organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      // Página a página: num dia com muitas conversas passavam-se os 1000 eventos e o número ficava curto.
      const data = await fetchAll((from, to) =>
        supabase
          .from("activity_events")
          .select("name, conversation_id, occurred_at", { count: "exact" })
          .eq("organization_id", organizationId!)
          .in("name", ["ai_resolution", "ai_escalation"])
          .gte("occurred_at", start.toISOString())
          .order("occurred_at")
          .order("id")
          .range(from, to),
      );
      return agentToday(data);
    },
  });
}

/** Há algum agente ligado na conta (num webinar ou o da conta)? */
function useAgentOn(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "agent-on", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("id")
        .eq("organization_id", organizationId!)
        .eq("enabled", true)
        .neq("mode", "desativado")
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}

/** A IA está em pausa em todas as conversas da conta (o interruptor do cabeçalho)? */
function useOrgAiPaused(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "ai-paused", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("ai_paused")
        .eq("id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.ai_paused);
    },
  });
}

function SupportPage() {
  const { c: requested, exemplo } = Route.useSearch();
  const queryClient = useQueryClient();
  const pauseAll = useServerFn(setOrganizationAi);
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const organizationId = workspace?.organizationId;
  const allowed = canAttend(workspace?.role);
  const scope = allowed && !exemplo ? organizationId : undefined;

  const { data: setup } = useSupportSetup(scope);
  useSupportRealtime(scope);
  const invalidate = useSupportInvalidate();
  const { data: webinars = [] } = useWebinars(scope);
  const { data: conversations = [], isLoading } = useSupportConversations(scope);
  const { data: cases = [] } = useCases(scope);
  const { data: staff = [] } = useStaff(scope);
  const { data: departments = [] } = useDepartments(scope);
  const { data: skills = [] } = useSkills(scope);
  const { data: aiToday } = useAiToday(scope);
  const { data: agentOn } = useAgentOn(scope);
  const { data: aiPaused } = useOrgAiPaused(scope);

  const [tab, setTab] = useState<InboxTab>("all");
  const [webinarId, setWebinarId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Vindo de uma ligação (ficha dos Contactos), abre logo a conversa, também no telemóvel.
  const [step, setStep] = useState<InboxStep>(requested ? "chat" : "list");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const myStaffId = setup?.staffId ?? null;
  const me = staff.find((s) => s.id === myStaffId);

  const openCases = useMemo(() => {
    const map = new Map<string, CaseRow>();
    for (const c of cases)
      if (c.conversation_id && isOpenStatus(c.status)) map.set(c.conversation_id, c);
    return map;
  }, [cases]);

  // Cada conversa como a caixa a mostra; a ordem é a da prioridade (ver `compareInbox`).
  const items = useMemo(() => {
    void tick;
    const now = Date.now();
    return conversations.map((c) => {
      const open = openCases.get(c.id) ?? null;
      return toInboxItem(
        c,
        open,
        {
          team: departments.find((d) => d.id === open?.department_id)?.name,
          owner: staff.find((s) => s.id === open?.assigned_staff_id)?.name,
        },
        now,
      );
    });
  }, [conversations, openCases, departments, staff, tick]);

  const scoped = items.filter((i) => !webinarId || i.webinarId === webinarId);
  const visible = sortInbox(scoped.filter((i) => inTab(i, tab) && matchesSearch(i, search)));
  const active = items.find((i) => i.id === requested) ?? visible[0] ?? null;
  const activeConversation = conversations.find((c) => c.id === active?.id);
  const activeCase = active ? (openCases.get(active.id) ?? null) : null;

  const select = (id: string) => {
    void navigate({ to: "/support", search: { c: id }, replace: true });
    setStep("chat");
  };
  const setExample = (on: boolean) =>
    void navigate({ to: "/support", search: on ? { exemplo: 1 } : {}, replace: true });

  if (workspace && !allowed) {
    return (
      <AppShell title="Atendimento" action={false}>
        <EmptySection
          icon={Lock}
          title="Sem acesso ao atendimento"
          description="As conversas com os participantes são vistas pelo proprietário, pelos administradores e pela equipa de suporte."
        />
      </AppShell>
    );
  }

  const changeStatus = async (status: StaffStatus) => {
    if (!organizationId) return;
    try {
      await setMyStatus(organizationId, status);
      invalidate("staff");
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível mudar o estado."));
    }
  };

  const setPausedAll = async (paused: boolean) => {
    if (!organizationId) return;
    try {
      await pauseAll({ data: { organizationId, enabled: !paused } });
      await queryClient.invalidateQueries({ queryKey: ["support", "ai-paused", organizationId] });
      toast.success(
        paused
          ? "Agente em pausa em todas as conversas: as mensagens novas vêm para a equipa."
          : "O agente volta a responder em todas as conversas.",
      );
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível mudar o agente."));
    }
  };

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <AgentStatus
        active={exemplo ? EXAMPLE_AGENT.active : (agentOn ?? null)}
        paused={exemplo ? false : (aiPaused ?? null)}
        onPausedChange={exemplo ? undefined : (paused) => void setPausedAll(paused)}
        resolved={exemplo ? EXAMPLE_AGENT.resolved : (aiToday?.resolved ?? null)}
        escalated={exemplo ? EXAMPLE_AGENT.escalated : (aiToday?.escalated ?? null)}
      />
      {me && !exemplo && (
        <Select
          value={me.status}
          onValueChange={(value) => void changeStatus(value as StaffStatus)}
        >
          <SelectTrigger className="h-10 w-44" aria-label="O meu estado">
            <span className="flex items-center gap-2">
              <PresenceDot status={me.presence} />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {STAFF_STATUSES.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!exemplo && (
        <Button variant="outline" className="h-10" onClick={() => setExample(true)}>
          <Eye /> Ver exemplo
        </Button>
      )}
    </div>
  );

  return (
    <AppShell title="Atendimento" action={header} compact>
      {exemplo ? (
        <ExampleInbox onExit={() => setExample(false)} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-[20rem_1fr]">
          <Skeleton className="h-[32rem]" />
          <Skeleton className="hidden h-[32rem] md:block" />
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Ainda não há conversas"
          description="Quando alguém escrever numa sala, a conversa aparece aqui."
          action={
            <Button size="lg" onClick={() => setExample(true)}>
              <Eye /> Ver um exemplo
            </Button>
          }
        />
      ) : (
        <InboxFrame
          step={step}
          list={
            <InboxList
              items={visible}
              activeId={active?.id ?? null}
              tab={tab}
              counts={countTabs(scoped)}
              onTab={setTab}
              search={search}
              onSearch={setSearch}
              webinars={webinarFilters(items)}
              webinarId={webinarId}
              onWebinar={setWebinarId}
              onSelect={select}
            />
          }
          conversation={
            activeConversation && active ? (
              <ConversationView
                conversation={activeConversation}
                currentCase={activeCase}
                webinar={webinars.find((w) => w.id === activeConversation.webinar_id)}
                staff={staff}
                departments={departments}
                myStaffId={myStaffId}
                onBack={() => setStep("list")}
                onShowContact={() => setStep("contact")}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <MessageCircle className="size-8" aria-hidden />
                <p className="text-sm">Escolha uma conversa.</p>
              </div>
            )
          }
          contact={
            activeConversation && active ? (
              <ContactPanel
                conversation={activeConversation}
                currentCase={activeCase}
                staff={staff}
                departments={departments}
                skills={skills}
                myStaffId={myStaffId}
                intent={active.intent}
                hot={active.hot}
                onOpenConversation={select}
                onBack={() => setStep("chat")}
              />
            ) : null
          }
        />
      )}
    </AppShell>
  );
}
