/** Leituras do Atendimento no browser. Tudo passa pelo RLS de quem está a ver. */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PARTICIPATION_COLUMNS } from "@/lib/contacts";
import type { AgentSource } from "@/lib/ai-agent/defaults";
import { buildCommercialContext, type ContextPurchase } from "./context";
import {
  effectiveStatus,
  PRESENCE_BEAT_MS,
  type CaseRow,
  type StaffRow,
  type StaffStatus,
  type WorkspaceRole,
} from "./model";

export type SupportSetup = { staffId: string | null; role: WorkspaceRole; isSupervisor: boolean };

/** Garante os valores iniciais da organização e o perfil de atendimento de quem entra. */
export function useSupportSetup(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "setup", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SupportSetup> => {
      const { data, error } = await supabase.rpc("ensure_support_setup", {
        _organization_id: organizationId!,
      });
      if (error) throw error;
      const row = data as { staff_id: string | null; role: WorkspaceRole; is_supervisor: boolean };
      return { staffId: row.staff_id, role: row.role, isSupervisor: row.is_supervisor };
    },
  });
}

export function useDepartments(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "departments", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_departments")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("position")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSkills(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "skills", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_skills")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRoutingRules(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "rules", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_routing_rules")
        .select("*")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type StaffMember = StaffRow & { openCases: number; presence: StaffStatus };

export function useStaff(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "staff", organizationId],
    enabled: Boolean(organizationId),
    // A presença depende da hora: relê para quem saiu passar a offline.
    refetchInterval: PRESENCE_BEAT_MS,
    queryFn: async (): Promise<StaffMember[]> => {
      const [staff, load] = await Promise.all([
        supabase.from("support_staff").select("*").eq("organization_id", organizationId!).order("name"),
        supabase.from("support_staff_load").select("*").eq("organization_id", organizationId!),
      ]);
      if (staff.error) throw staff.error;
      const open = new Map((load.data ?? []).map((row) => [row.staff_id, row.open_cases ?? 0]));
      return (staff.data ?? []).map((row) => ({
        ...row,
        openCases: open.get(row.id) ?? 0,
        presence: effectiveStatus(row),
      }));
    },
  });
}

/** Diz "estou cá" enquanto o painel estiver aberto. O estado é a pessoa que escolhe. */
export function usePresence(organizationId: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!organizationId || !enabled) return;
    const beat = () => {
      if (document.visibilityState === "hidden") return;
      void supabase.rpc("support_presence", { _organization_id: organizationId });
    };
    beat();
    const timer = window.setInterval(beat, PRESENCE_BEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [organizationId, enabled]);
}

export async function setMyStatus(organizationId: string, status: StaffStatus) {
  const { error } = await supabase.rpc("support_presence", {
    _organization_id: organizationId,
    _status: status,
  });
  if (error) throw error;
}

/* ---------- Conversas ---------- */

const CONVERSATION_COLUMNS =
  "*, participants(name, email, phone, contact_id, webinar_session_id), webinars(public_title)";

export function useSupportConversations(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "conversations", organizationId],
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("private_conversations")
        .select(CONVERSATION_COLUMNS)
        .eq("organization_id", organizationId!)
        .order("last_message_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}
/** Uma pessoa está na live quando a sala deu sinal (de 30 em 30 s, a ver) há menos disto. */
export const ONLINE_WINDOW_MS = 90_000;

/**
 * Quem está na live agora, com o minuto do vídeo em que vai: para o vendedor saber, na conversa, se a
 * pessoa está a ver e em que parte (antes ou depois da oferta). Lido de 15 em 15 s.
 */
export function useOnlineParticipants(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "online", organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from("participants")
        .select("id, watched_seconds, last_progress_at")
        .eq("organization_id", organizationId!)
        .gte("last_progress_at", since)
        .order("id")
        .limit(1000);
      if (error) throw error;
      const online = new Map<string, number>();
      for (const row of data ?? []) online.set(row.id, row.watched_seconds ?? 0);
      return online;
    },
  });
}

/**
 * As sessões que o filtro «Sessão atual» considera: as por terminar e as que terminaram nas últimas horas
 * (ver `currentSessionIds`). Revistas de minuto a minuto, para a sessão seguinte entrar sozinha.
 */
export function useOpenSessions(organizationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["support", "open-sessions", organizationId],
    enabled: Boolean(organizationId) && enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("webinar_sessions")
        .select("id, webinar_id, starts_at, ended_at")
        .eq("organization_id", organizationId!)
        .or(`ended_at.is.null,ended_at.gte.${since}`)
        .order("starts_at")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type SupportConversation = NonNullable<
  ReturnType<typeof useSupportConversations>["data"]
>[number];

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "messages", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("private_messages")
        .select("id, body, sender_kind, sender_user_id, created_at, video_second")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type AgentAnalysis = {
  id: string;
  classification: string;
  decision: string;
  answer: string;
  confidence: number;
  sources: AgentSource[];
  escalationReason: string | null;
  reason: string;
  status: string;
  inboundText: string;
  createdAt: string;
};

/** A última leitura que a IA fez desta conversa, e a sugestão que deixou. */
export function useAgentAnalysis(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "analysis", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<AgentAnalysis | null> => {
      const { data, error } = await supabase
        .from("ai_agent_messages")
        .select(
          "id, classification, decision, answer, confidence, sources, escalation_reason, reason, status, inbound_text, created_at",
        )
        .eq("conversation_id", conversationId!)
        .eq("is_simulation", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        classification: data.classification,
        decision: data.decision,
        answer: data.answer,
        confidence: Number(data.confidence ?? 0),
        sources: (data.sources ?? []) as AgentSource[],
        escalationReason: data.escalation_reason,
        reason: data.reason,
        status: data.status,
        inboundText: data.inbound_text,
        createdAt: data.created_at,
      };
    },
  });
}

/* ---------- Casos ---------- */

const CASE_COLUMNS =
  "*, contacts(id, name, email, phone), participants(name, email, phone), webinars(public_title)";

export function useCases(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["support", "cases", organizationId],
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
    // Os prazos mudam com o relógio, mesmo sem nada mudar na base de dados.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_cases")
        .select(CASE_COLUMNS)
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}
export type SupportCase = NonNullable<ReturnType<typeof useCases>["data"]>[number];

export function caseContactName(c: Pick<SupportCase, "contacts" | "participants">) {
  return c.contacts?.name || c.participants?.name || c.contacts?.email || c.participants?.email || "Contacto";
}

export function useEvents(filter: { caseId?: string | null; contactId?: string | null; conversationId?: string | null }) {
  const key = filter.caseId ?? filter.contactId ?? filter.conversationId ?? null;
  return useQuery({
    queryKey: ["support", "events", filter],
    enabled: Boolean(key),
    queryFn: async () => {
      let query = supabase.from("activity_events").select("*").order("id", { ascending: false }).limit(60);
      if (filter.caseId) query = query.eq("case_id", filter.caseId);
      else if (filter.contactId) query = query.eq("contact_id", filter.contactId);
      else query = query.eq("conversation_id", filter.conversationId!);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Os alertas que o supervisor ainda tem por tratar: casos abertos com prazo em risco, parados ou sem dono. */
export function caseAlerts(c: CaseRow, now = Date.now()) {
  const alerts: string[] = [];
  if (!["resolved", "closed"].includes(c.status)) {
    if (!c.assigned_staff_id) alerts.push("Sem responsável");
    if (c.sla_breached_at && !c.first_response_at) alerts.push("Prazo ultrapassado");
    else if (c.sla_warned_at && !c.first_response_at) alerts.push("Prazo quase a terminar");
    if (c.stalled_at) alerts.push("Parado há mais de uma hora");
    if (c.status === "escalated") alerts.push("Escalado");
  }
  void now;
  return alerts;
}

/* ---------- Contexto comercial ---------- */

export function useContactContext(contactId: string | null | undefined, participantId?: string | null) {
  return useQuery({
    queryKey: ["support", "context", contactId ?? null, contactId ? null : (participantId ?? null)],
    enabled: Boolean(contactId || participantId),
    queryFn: async () => {
      const base = supabase.from("participant_facts").select(PARTICIPATION_COLUMNS);
      const [participations, purchases, cases, lists] = await Promise.all([
        (contactId ? base.eq("contact_id", contactId) : base.eq("participant_id", participantId!))
          .order("joined_at", { ascending: false })
          .limit(100),
        contactId
          ? supabase
              .from("real_purchase_events")
              .select("id, created_at, status_at, product_name, amount, amount_value, currency, status, provider, webinar_id")
              .eq("contact_id", contactId)
              .order("created_at", { ascending: false })
              .limit(100)
          : Promise.resolve({ data: [], error: null }),
        contactId
          ? supabase
              .from("support_cases")
              .select("id, number, intent, status, created_at, resolved_at")
              .eq("contact_id", contactId)
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
        contactId
          ? supabase.from("contact_list_members").select("list_id, contact_lists(name)").eq("contact_id", contactId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (participations.error) throw participations.error;

      const rows = participations.data ?? [];
      const ids = rows.flatMap((row) => row.participant_id ?? []);
      const [clicks, messages] = ids.length
        ? await Promise.all([
            supabase
              .from("cta_events")
              .select("participant_id, occurred_at, video_second")
              .in("participant_id", ids)
              .eq("event_type", "click"),
            supabase
              .from("private_messages")
              .select("participant_id, created_at")
              .in("participant_id", ids)
              .eq("sender_kind", "participant")
              .order("created_at", { ascending: false })
              .limit(500),
          ])
        : [{ data: [] }, { data: [] }];

      const latest = rows[0];
      return {
        context: buildCommercialContext({
          participations: rows,
          clicks: clicks.data ?? [],
          messages: messages.data ?? [],
          purchases: (purchases.data ?? []) as ContextPurchase[],
          cases: cases.data ?? [],
        }),
        lists: ((lists.data ?? []) as { list_id: string; contact_lists: { name: string } | null }[]).map(
          (row) => ({ id: row.list_id, name: row.contact_lists?.name ?? "Lista" }),
        ),
        place: latest ? [latest.city, latest.country].filter(Boolean).join(", ") : "",
        device: latest?.device ?? "",
      };
    },
  });
}

/* ---------- Tempo real ---------- */

/**
 * Mensagens, conversas, casos e presença da equipa actualizam o ecrã sem recarregar.
 * Cada subscrição é só da organização aberta: quem pertence a várias não recebe
 * aqui o movimento das outras. Apagar não entra, porque o servidor não consegue
 * filtrar nem verificar o acesso a uma linha que já não existe.
 */
export function useSupportRealtime(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!organizationId) return;
    const watch = (table: string, events: ("INSERT" | "UPDATE")[], keys: string[]) =>
      events.map((event) => ({
        filter: { event, schema: "public", table, filter: `organization_id=eq.${organizationId}` },
        refresh: () => {
          for (const key of keys) void queryClient.invalidateQueries({ queryKey: ["support", key] });
        },
      }));
    let channel = supabase.channel(`support:${organizationId}`);
    for (const { filter, refresh } of [
      ...watch("private_messages", ["INSERT"], ["messages", "conversations", "analysis"]),
      ...watch("private_conversations", ["INSERT", "UPDATE"], ["conversations"]),
      ...watch("support_cases", ["INSERT", "UPDATE"], ["cases", "events", "staff", "context"]),
      ...watch("support_staff", ["INSERT", "UPDATE"], ["staff"]),
    ]) {
      channel = channel.on("postgres_changes" as never, filter as never, refresh);
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, queryClient]);
}

export function useSupportInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: ["support", key] });
  };
}

/**
 * As conversas desta pessoa em todos os webinars (pelas inscrições dela), cada
 * uma com os seus casos. A ficha dos Contactos e o perfil do Atendimento leem o mesmo.
 */
export function useContactConversations(contactId: string | null, participantIds: string[]) {
  return useQuery({
    queryKey: ["support", "conversations", "contact", contactId, participantIds],
    enabled: Boolean(contactId),
    queryFn: async () => {
      const [talks, cases] = await Promise.all([
        participantIds.length
          ? supabase
              .from("private_conversations")
              .select("id, last_message_preview, last_message_at, webinars(public_title)")
              .in("participant_id", participantIds)
              .order("last_message_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),
        supabase
          .from("support_cases")
          .select("id, number, intent, status, conversation_id, created_at")
          .eq("contact_id", contactId!)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      return { talks: talks.data ?? [], cases: cases.data ?? [] };
    },
  });
}
