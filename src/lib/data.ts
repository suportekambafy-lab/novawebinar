import { keepPreviousData, useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { LEDGER_LIMIT } from "@/lib/credits";
import { isSegmentRules, type SegmentRules } from "@/lib/segments";
import type { Database, Json } from "@/integrations/supabase/types";
import { webinarLifecycle, type ScheduleInput, type WebinarLifecycle } from "@/lib/schedule";
import { startDelaySeconds } from "@/lib/room-logic";
import {
  buildJourney,
  PARTICIPATION_COLUMNS,
  timelineItems,
  type ContactSummary,
  type Purchase,
} from "@/lib/contacts";

export type Webinar = Database["public"]["Tables"]["webinars"]["Row"];
export type WebinarStatus = Database["public"]["Enums"]["webinar_status"];

export type Workspace = {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  locale: string;
  organizationId: string;
  organizationName: string;
  /** Conta de teste: dados fictícios, nada sai para destinos reais. */
  isTest: boolean;

  plan: string;
  role: Database["public"]["Enums"]["workspace_role"];
  /** Todos os espaços de trabalho a que a pessoa pertence (o próprio e os de equipas que a convidaram). */
  organizations: {
    id: string;
    name: string;
    role: Database["public"]["Enums"]["workspace_role"];
    isTest: boolean;
  }[];
};

export const ACTIVE_ORGANIZATION_KEY = "cw:active-organization";

/** Troca de espaço de trabalho; a página recarrega para nada do anterior ficar no ecrã. */
export function switchWorkspace(organizationId: string) {
  localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organizationId);
  window.location.assign("/dashboard");
}

export function useWorkspace() {
  return useQuery<Workspace | null>({
    queryKey: ["workspace"],
    enabled: typeof window !== "undefined",
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return null;

      let { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, locale")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        const fallbackName = String(user.user_metadata?.["full_name"] ?? "").trim();
        const inserted = await supabase
          .from("profiles")
          .insert({ id: user.id, full_name: fallbackName })
          .select("id, full_name, avatar_url, locale")
          .maybeSingle();
        profile = inserted.data;
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("organization_members")
        .select("role, organizations(id, name, plan, is_test)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      // Uma leitura falhada não é "sem espaço de trabalho": não se cria outro.
      if (membershipsError) throw membershipsError;
      const preferred = localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
      let membership =
        memberships?.find((m) => m.organizations?.id === preferred) ?? memberships?.[0] ?? null;

      if (!membership) {
        const workspaceName = profile?.full_name?.trim() || "Meu Workspace";
        const { data: org } = await supabase
          .from("organizations")
          .insert({
            name: workspaceName,
            slug: `workspace-${user.id.replace(/-/g, "")}`,
            created_by: user.id,
          })
          .select("id, name, plan, is_test")
          .single();
        if (org) {
          await supabase
            .from("organization_members")
            .insert({ organization_id: org.id, user_id: user.id, role: "owner" });
          membership = { role: "owner", organizations: org };
        }
      }

      const org = membership?.organizations;
      const role = membership?.role;
      if (!org || !role) return null;

      const name =
        profile?.full_name?.trim() || String(user.user_metadata?.["full_name"] ?? "").trim();

      return {
        userId: user.id,
        email: user.email ?? "",
        fullName: name || (user.email ?? "").split("@")[0] || "Utilizador",
        avatarUrl: profile?.avatar_url ?? null,
        locale: profile?.locale ?? "pt-PT",
        organizationId: org.id,
        organizationName: org.name,
        isTest: org.is_test,

        plan: org.plan,
        role,
        organizations: (memberships?.length ? memberships : [membership!]).flatMap((m) =>
          m.organizations
            ? [{ id: m.organizations.id, name: m.organizations.name, role: m.role, isTest: m.organizations.is_test }]
            : [],
        ),
      };
    },
  });
}

export function useWebinars(organizationId?: string) {
  return useQuery({
    queryKey: ["webinars", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("webinars")
        .select("*, video_sources(name, source_url, duration_seconds, provider)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWebinar(webinarId: string) {
  return useQuery({
    queryKey: ["webinar", webinarId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webinars")
        .select("*, video_sources(id, name, source_url, provider, duration_seconds)")
        .eq("id", webinarId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useVideoSources(organizationId?: string) {
  return useQuery({
    queryKey: ["video-sources", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("video_sources")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Os participantes da organização, dos mais recentes aos mais antigos, em páginas de 1000 até 20 000. */
export function useParticipants(organizationId?: string) {
  return useQuery({
    queryKey: ["participants", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      type Row = Database["public"]["Tables"]["participants"]["Row"] & {
        webinars: { public_title: string; duration_seconds: number } | null;
      };
      const rows: Row[] = [];
      // O servidor corta cada resposta a 1000 linhas: lêem-se página a página, com um tecto para não
      // carregar o navegador. Ordem estável (data e id) para as páginas não se repetirem.
      for (let from = 0; from < 20_000; from += 1000) {
        const { data, error } = await supabase
          .from("participants")
          .select("*, webinars(public_title, duration_seconds)")
          .eq("organization_id", organizationId)
          .order("joined_at", { ascending: false })
          .order("id")
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as Row[]));
        if (!data || data.length < 1000) break;
      }
      return rows;
    },
  });
}

export function useScheduledComments(webinarId: string) {
  return useQuery({
    queryKey: ["scheduled-comments", webinarId],
    // Um webinar longo passa dos 1000 comentários: lêem-se todos.
    queryFn: () =>
      fetchAll((from, to) =>
        supabase
          .from("scheduled_comments")
          .select("*", { count: "exact" })
          .eq("webinar_id", webinarId)
          .order("offset_seconds", { ascending: true })
          .order("id")
          .range(from, to),
      ),
  });
}

export function useAudienceConfiguration(webinarId: string) {
  return useQuery({
    queryKey: ["audience-configuration", webinarId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audience_configuration")
        .select("*")
        .eq("webinar_id", webinarId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (keys: string[]) => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export { useMutation };

/** O ciclo de vida de um webinar com a duração canónica: a do vídeo, senão a do webinar. */
export function lifecycleOf(
  webinar: ScheduleInput & {
    status?: string | null;
    video_sources?: { duration_seconds: number | null } | null;
    /** Com ele, a contagem depois de começar entra no fim da sessão. */
    chat_settings?: unknown;
  },
  nowMs = Date.now(),
): WebinarLifecycle {
  return webinarLifecycle(
    {
      ...webinar,
      duration_seconds: webinar.video_sources?.duration_seconds || webinar.duration_seconds || 0,
      start_delay_seconds: startDelaySeconds(webinar.chat_settings),
    },
    nowMs,
  );
}

/**
 * O estado guardado ao gravar ou activar segue o ciclo de vida desse momento; o que
 * as páginas mostram é sempre o ciclo de vida calculado, nunca esta cópia.
 */
export function statusFromLifecycle(lifecycle: WebinarLifecycle, replayEnabled: boolean): WebinarStatus {
  if (lifecycle.kind === "draft") return "draft";
  if (lifecycle.kind !== "session") return "live";
  if (lifecycle.state === "finished") return replayEnabled ? "replay" : "finished";
  return lifecycle.state;
}

export const providerLabels: Record<Database["public"]["Enums"]["video_provider"], string> = {
  upload: "Upload",
  bunny: "Bunny Stream",
  panda: "Panda Video",
  vimeo: "Vimeo",
  hls: "URL / HLS",
};

export function formatDateTime(value: string | null) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Domínio público das salas. Por omissão usa o domínio onde a aplicação está
 * a correr; pode ser fixado com VITE_PUBLIC_APP_URL (domínio próprio).
 */
const CONFIGURED_PUBLIC_APP_URL = (import.meta.env['VITE_PUBLIC_APP_URL'] as string | undefined)?.trim() ?? "";
/** Devolve a origem pública; o nome da sala é o slug do webinar. */
export function publicOrigin(): string {
  if (CONFIGURED_PUBLIC_APP_URL) return CONFIGURED_PUBLIC_APP_URL.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

// O redireccionamento para o admin vive num módulo leve (a auth não carrega este ficheiro).
export { useAdminHostRedirect } from "@/lib/admin-host";


export function formatDuration(seconds: number) {
  if (!seconds) return "—";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

/** Tempo assistido em texto curto: 45 s, 12 min, 1h 05m. */
export function watchLabel(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total === 0) return "0 min";
  if (total < 60) return `${total} s`;
  if (total < 3600) return `${Math.round(total / 60)} min`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "webinar"
  );
}

/* ---------- Créditos ---------- */

export function useCreditState(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["credits", "state", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("credit_state", { _organization_id: organizationId! });
      if (error) throw error;
      return data as unknown as import("@/lib/credits").CreditState;
    },
  });
}

export function useCreditLedger(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["credits", "ledger", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_ledger")
        .select("id, amount_micros, kind, action, units, description, meta, created_at")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(LEDGER_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBillingProducts() {
  return useQuery({
    queryKey: ["credits", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_products")
        .select("id, label, usd_amount, checkout_url")
        .order("usd_amount");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Vendas aprovadas este mês (pela data de aprovação), para pôr o gasto com IA ao lado do retorno. */
export function useMonthRevenue(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["credits", "revenue", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const start = new Date();
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      return fetchAll((from, to) =>
        supabase
          .from("real_purchase_events")
          .select("amount_value, currency, webinar_id", { count: "exact" })
          .eq("organization_id", organizationId!)
          .eq("status", "approved")
          .gte("approved_at", start.toISOString())
          .order("id")
          .range(from, to),
      );
    },
  });
}

/* ---------- Integrações ---------- */

// O segredo nunca é pedido: o browser só sabe se existe (has_secret).
const INTEGRATION_COLUMNS =
  "id, organization_id, webinar_id, provider, enabled, endpoint_key, has_secret, settings, last_event_at, created_at, updated_at";

export type IntegrationRow = {
  id: string;
  organization_id: string;
  /** O webinar (produto) a que a ligação se aplica; null = toda a conta. */
  webinar_id: string | null;
  provider: string;
  enabled: boolean;
  endpoint_key: string;
  has_secret: boolean;
  settings: Record<string, string>;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
};

export function useIntegrations(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["integrations", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select(INTEGRATION_COLUMNS)
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return (data ?? []) as unknown as IntegrationRow[];
    },
  });
}

export function useIntegrationEvents(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["integrations", "events", organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_events")
        .select(
          "id, integration_id, provider, status, reason, event_type, buyer_email, product_name, amount_value, currency, purchase_id, received_at",
        )
        .eq("organization_id", organizationId!)
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Liga um fornecedor na conta (`webinarId` null) ou só num webinar: o âmbito escolhe-se ao ligar. */
export async function connectIntegration(
  organizationId: string,
  provider: string,
  secret: string,
  webinarId: string | null = null,
) {
  const { data, error } = await supabase
    .from("integrations")
    .insert({ organization_id: organizationId, provider, secret, webinar_id: webinarId })
    .select(INTEGRATION_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as IntegrationRow;
}

export async function updateIntegration(
  id: string,
  changes: { enabled?: boolean; secret?: string; settings?: Record<string, string> },
) {
  const { error } = await supabase
    .from("integrations")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* ---------- Automações ---------- */

export type Automation = Database["public"]["Tables"]["automations"]["Row"];
export type AutomationRun = Database["public"]["Tables"]["automation_runs"]["Row"] & {
  automations: {
    name: string;
    trigger_event: string;
    conditions: unknown;
    wait_minutes: number;
    steps: unknown;
    workflow_id: string | null;
  } | null;
  contacts: { name: string | null; email: string | null; phone: string | null } | null;
  webinars: { public_title: string | null; internal_name: string } | null;
  webinar_sessions: { starts_at: string; ends_at: string | null } | null;
};

const RUN_COLUMNS =
  "*, automations(name, trigger_event, conditions, wait_minutes, steps, workflow_id), contacts(name, email, phone), webinars(public_title, internal_name), webinar_sessions(starts_at, ends_at)";

export function useAutomations(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["automations", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Execuções: as mais recentes da organização, de um contacto ou de um webinar. */
export function useAutomationRuns(
  scope: {
    organizationId?: string | undefined;
    contactId?: string | null | undefined;
    webinarId?: string | undefined;
    automationId?: string | undefined;
    automationIds?: string[] | undefined;
  },
  limit = 100,
) {
  const key =
    scope.contactId ?? scope.automationId ?? scope.automationIds?.join(",") ?? scope.webinarId ?? scope.organizationId;
  return useQuery({
    queryKey: ["automation-runs", key, limit],
    enabled: Boolean(key),
    // A execução avança sozinha (espera, servidor): a página acompanha sem recarregar.
    refetchInterval: 15_000,
    queryFn: async () => {
      // As métricas de um webinar contam todas as execuções: página a página, sem o corte de `limit`
      // (antes, acima de 1000 os números ficavam errados sem aviso).
      if (scope.webinarId && !scope.contactId && !scope.automationId && !scope.automationIds) {
        const rows = await fetchAll((from, to) =>
          supabase
            .from("automation_runs")
            .select(RUN_COLUMNS, { count: "exact" })
            .eq("webinar_id", scope.webinarId!)
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to),
        );
        return rows as unknown as AutomationRun[];
      }
      let q = supabase.from("automation_runs").select(RUN_COLUMNS);
      if (scope.contactId) q = q.eq("contact_id", scope.contactId);
      else if (scope.automationId) q = q.eq("automation_id", scope.automationId);
      else if (scope.automationIds) q = q.in("automation_id", scope.automationIds.length ? scope.automationIds : ["00000000-0000-0000-0000-000000000000"]);
      else if (scope.webinarId) q = q.eq("webinar_id", scope.webinarId);
      else q = q.eq("organization_id", scope.organizationId!);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as AutomationRun[];
    },
  });
}

/** Uma execução pelo id (ligações da ficha do contacto e do Atendimento). */
export function useAutomationRun(id: string | undefined) {
  return useQuery({
    queryKey: ["automation-runs", "one", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("automation_runs").select(RUN_COLUMNS).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AutomationRun | null;
    },
  });
}

/** Arquivar desliga e tira da lista; as execuções ficam. Restaurar volta a mostrar, desligada. */
export async function setAutomationArchived(id: string, archived: boolean) {
  const { error } = await supabase
    .from("automations")
    .update(archived ? { archived_at: new Date().toISOString(), active: false } : { archived_at: null })
    .eq("id", id);
  if (error) throw error;
}

/* ---------- Workflows (0063): automações de um webinar, captura e canvas ---------- */

export type Workflow = Database["public"]["Tables"]["automation_workflows"]["Row"] & {
  webinars: {
    id: string;
    public_title: string | null;
    internal_name: string;
    slug: string;
    cover_url: string | null;
    registration_cover_url: string | null;
    scheduled_at: string | null;
    replay_enabled: boolean;
    cta_url: string | null;
    cta_price_now: string;
  } | null;
};
export type RegistrationForm = Database["public"]["Tables"]["registration_forms"]["Row"];

const WORKFLOW_COLUMNS =
  "*, webinars(id, public_title, internal_name, slug, cover_url, registration_cover_url, scheduled_at, replay_enabled, cta_url, cta_price_now)";

export function useWorkflows(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["workflows", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_workflows")
        .select(WORKFLOW_COLUMNS)
        .eq("organization_id", organizationId!)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Workflow[];
    },
  });
}

/** Um workflow com as suas automações (a lógica) e os formulários do webinar (a captura). */
export function useWorkflow(id: string | undefined) {
  return useQuery({
    queryKey: ["workflows", "one", id],
    enabled: Boolean(id),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data: workflow, error } = await supabase
        .from("automation_workflows")
        .select(WORKFLOW_COLUMNS)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!workflow) return null;
      const [automations, forms] = await Promise.all([
        supabase.from("automations").select("*").eq("workflow_id", id!).order("created_at"),
        workflow.webinar_id
          ? supabase.from("registration_forms").select("*").eq("webinar_id", workflow.webinar_id).order("created_at")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (automations.error) throw automations.error;
      if (forms.error) throw forms.error;
      return {
        workflow: workflow as unknown as Workflow,
        automations: automations.data ?? [],
        forms: (forms.data ?? []) as RegistrationForm[],
      };
    },
  });
}

/** As automações e workflows de um webinar (a área "Automações" do webinar). */
export function useWebinarAutomations(webinarId: string | undefined) {
  return useQuery({
    queryKey: ["workflows", "webinar", webinarId],
    enabled: Boolean(webinarId),
    queryFn: async () => {
      const [workflows, automations] = await Promise.all([
        supabase.from("automation_workflows").select(WORKFLOW_COLUMNS).eq("webinar_id", webinarId!).is("archived_at", null).order("created_at"),
        supabase.from("automations").select("*").eq("webinar_id", webinarId!).is("archived_at", null).order("created_at"),
      ]);
      if (workflows.error) throw workflows.error;
      if (automations.error) throw automations.error;
      return { workflows: (workflows.data ?? []) as unknown as Workflow[], automations: automations.data ?? [] };
    },
  });
}

/** Números do webinar para os eixos do mapa: pessoas em cada passo (participant_facts). */
export function useWebinarJourneyCounts(webinarId: string | undefined | null) {
  return useQuery({
    queryKey: ["workflows", "counts", webinarId],
    enabled: Boolean(webinarId),
    refetchInterval: 30_000,
    queryFn: async () => {
      const rows = await fetchAll((from, to) =>
        supabase
          .from("participant_facts")
          .select("person_id, first_progress_at, actual_watch_seconds, attended, saw_offer, clicked, checkout_started, purchased, payment_failed, checkout_abandoned", { count: "exact" })
          .eq("webinar_id", webinarId!)
          .order("participant_id")
          .range(from, to),
      );
      const people = new Map<string, { entered: boolean; attended: boolean; offer: boolean; clicked: boolean; checkout: boolean; purchased: boolean; failed: boolean; abandoned: boolean }>();
      for (const r of rows) {
        const key = r.person_id ?? "";
        const p = people.get(key) ?? { entered: false, attended: false, offer: false, clicked: false, checkout: false, purchased: false, failed: false, abandoned: false };
        p.entered ||= Boolean(r.first_progress_at) || (r.actual_watch_seconds ?? 0) > 0;
        p.attended ||= Boolean(r.attended);
        p.offer ||= Boolean(r.saw_offer);
        p.clicked ||= Boolean(r.clicked);
        p.checkout ||= Boolean(r.checkout_started);
        p.purchased ||= Boolean(r.purchased);
        p.failed ||= Boolean(r.payment_failed);
        p.abandoned ||= Boolean(r.checkout_abandoned);
        people.set(key, p);
      }
      const list = [...people.values()];
      const count = (f: (p: (typeof list)[number]) => boolean) => list.filter(f).length;
      return {
        registered: list.length,
        entered: count((p) => p.entered),
        attended: count((p) => p.attended),
        offer: count((p) => p.offer),
        clicked: count((p) => p.clicked),
        checkout: count((p) => p.checkout),
        purchased: count((p) => p.purchased),
        failed: count((p) => p.failed),
        abandoned: count((p) => p.abandoned),
      };
    },
  });
}

/** O webinar precisa de um formulário de inscrição para a captura; cria-o se ainda não houver. */
async function ensureRegistrationForm(organizationId: string, webinarId: string) {
  const { data: forms } = await supabase.from("registration_forms").select("id").eq("webinar_id", webinarId).limit(1);
  if (forms?.length) return;
  const { error } = await supabase.from("registration_forms").insert({
    organization_id: organizationId,
    webinar_id: webinarId,
    name: "Formulário de inscrição",
    page_name: "Página de inscrição",
  });
  if (error) throw error;
}

/**
 * "Novo fluxo": o workflow (com ou sem webinar), o grupo de WhatsApp se houver link, e o formulário de inscrição.
 * Nasce vazio: nenhuma automação é criada sozinha; o modelo entra no desenho com «Usar modelo» (addModelAutomations).
 * Sem webinar fica em rascunho até o escolher.
 */
export async function createBaseWorkflow(
  organizationId: string,
  webinar: { id: string; title: string } | null,
  options: { name?: string | undefined; groupUrl?: string | undefined } = {},
) {
  const groupUrl = options.groupUrl?.trim();
  const canvas = { nodes: groupUrl ? [{ id: "grupo", kind: "group", name: "Grupo do lançamento", url: groupUrl }] : [], positions: {}, orientation: "vertical" };
  const name = (options.name?.trim() || (webinar ? `Fluxo · ${webinar.title}` : "Novo fluxo")).slice(0, 120);
  const { data: workflow, error } = await supabase
    .from("automation_workflows")
    .insert({ organization_id: organizationId, webinar_id: webinar?.id ?? null, name, canvas: canvas as unknown as Json })
    .select("id")
    .single();
  if (error) throw error;
  if (webinar) await ensureRegistrationForm(organizationId, webinar.id);
  return workflow.id;
}

/** As automações do modelo escolhidas em «Usar modelo», todas de uma vez e desligadas. */
export async function addModelAutomations(
  workflow: { id: string; organization_id: string; webinar_id: string | null },
  list: { name: string; trigger_event: string; conditions: unknown; steps: unknown }[],
) {
  if (!list.length) return;
  const { error } = await supabase.from("automations").insert(
    list.map((a) => ({
      organization_id: workflow.organization_id,
      webinar_id: workflow.webinar_id,
      workflow_id: workflow.id,
      name: a.name,
      active: false,
      trigger_event: a.trigger_event,
      conditions: a.conditions as Json,
      wait_minutes: 0,
      steps: a.steps as Json,
    })),
  );
  if (error) throw error;
}

/** Trocar (ou escolher) o webinar de um fluxo: o workflow e todas as suas automações passam a contar a partir dele. */
export async function setWorkflowWebinar(workflow: { id: string; organization_id: string }, webinarId: string | null) {
  const { error } = await supabase.from("automation_workflows").update({ webinar_id: webinarId }).eq("id", workflow.id);
  if (error) throw error;
  const { error: automationsError } = await supabase.from("automations").update({ webinar_id: webinarId }).eq("workflow_id", workflow.id);
  if (automationsError) throw automationsError;
  if (webinarId) await ensureRegistrationForm(workflow.organization_id, webinarId);
}

export async function saveWorkflow(id: string, patch: { name?: string; canvas?: Json; archived_at?: string | null }) {
  const { error } = await supabase.from("automation_workflows").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateAutomation(
  id: string,
  patch: Partial<Pick<Automation, "name" | "active" | "trigger_event" | "conditions" | "steps" | "webinar_id">>,
) {
  const { error } = await supabase.from("automations").update(patch).eq("id", id);
  if (error) throw error;
}

/** Uma automação nova dentro de um workflow, desligada: em branco ou a partir de um modelo (condições e passos). */
export async function addWorkflowAutomation(
  workflow: { id: string; organization_id: string; webinar_id: string | null },
  trigger: string,
  name: string,
  template?: { conditions: unknown; steps: unknown },
) {
  const { data, error } = await supabase
    .from("automations")
    .insert({
      organization_id: workflow.organization_id,
      webinar_id: workflow.webinar_id,
      workflow_id: workflow.id,
      name,
      active: false,
      trigger_event: trigger,
      conditions: (template?.conditions ?? []) as Json,
      wait_minutes: 0,
      steps: (template?.steps ?? { start: null, nodes: [] }) as Json,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function saveRegistrationForm(
  id: string,
  patch: Partial<Pick<RegistrationForm, "name" | "page_name" | "page_url" | "allowed_origins" | "ask_phone" | "require_phone" | "consent_text" | "success_message" | "redirect_url" | "active">>,
) {
  const { error } = await supabase.from("registration_forms").update(patch).eq("id", id);
  if (error) throw error;
}

export type AutomationStats = {
  contacts: number;
  runs: number;
  done: number;
  pending: number;
  failed: number;
  cancelled: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const EMPTY_STATS: AutomationStats = {
  contacts: 0,
  runs: 0,
  done: 0,
  pending: 0,
  failed: 0,
  cancelled: 0,
  lastRunAt: null,
  nextRunAt: null,
};

type StatsRow = {
  id: string;
  automation_id: string;
  contact_id: string;
  status: string;
  scheduled_for: string;
  finished_at: string | null;
  updated_at: string;
};
const STATS_COLUMNS = "id, automation_id, contact_id, status, scheduled_for, finished_at, updated_at";
/** Releitura completa de tempos a tempos: apanha execuções apagadas. */
const STATS_FULL_RELOAD_MS = 5 * 60_000;
/** Margem das leituras incrementais: uma escrita confirmada um pouco depois do seu updated_at entra na mesma. */
const STATS_OVERLAP_MS = 2 * 60_000;
const statsCache = new Map<string, { rows: Map<string, StatsRow>; cursor: string; loadedAt: number }>();

/**
 * As execuções da organização para as estatísticas. A primeira leitura (e uma a cada 5 min)
 * traz a tabela toda, paginada por id (ordem estável); as seguintes só o que mudou desde a
 * última (updated_at), juntando por id. Todas as escritas em automation_runs mexem em updated_at.
 */
export async function statsRows(organizationId: string) {
  const page = (since: string | null) =>
    fetchAll<StatsRow>((from, to) => {
      let q = supabase.from("automation_runs").select(STATS_COLUMNS, { count: "exact" }).eq("organization_id", organizationId);
      if (since) q = q.gte("updated_at", since);
      return q.order("id").range(from, to);
    });
  const latest = (rows: StatsRow[], cursor = "") => rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), cursor);
  const cached = statsCache.get(organizationId);
  if (!cached || Date.now() - cached.loadedAt > STATS_FULL_RELOAD_MS) {
    const loadedAt = Date.now();
    const rows = await page(null);
    statsCache.set(organizationId, { rows: new Map(rows.map((r) => [r.id, r])), cursor: latest(rows), loadedAt });
    return rows;
  }
  const since = cached.cursor ? new Date(Date.parse(cached.cursor) - STATS_OVERLAP_MS).toISOString() : null;
  const changed = await page(since);
  for (const row of changed) cached.rows.set(row.id, row);
  cached.cursor = latest(changed, cached.cursor);
  return [...cached.rows.values()];
}

/** Números de cada automação sobre todas as execuções (não só as últimas mostradas). */
export function useAutomationStats(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["automation-runs", "stats", organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const rows = await statsRows(organizationId!);
      const people = new Map<string, Set<string>>();
      const stats = new Map<string, AutomationStats>();
      for (const row of rows) {
        const s = stats.get(row.automation_id) ?? { ...EMPTY_STATS };
        s.runs += 1;
        if (row.status === "done") s.done += 1;
        else if (row.status === "failed") s.failed += 1;
        else if (row.status === "cancelled") s.cancelled += 1;
        else s.pending += 1;
        if ((row.status === "done" || row.status === "failed") && row.finished_at && (!s.lastRunAt || row.finished_at > s.lastRunAt))
          s.lastRunAt = row.finished_at;
        if ((row.status === "waiting" || row.status === "ready") && (!s.nextRunAt || row.scheduled_for < s.nextRunAt))
          s.nextRunAt = row.scheduled_for;
        const set = people.get(row.automation_id) ?? new Set<string>();
        set.add(row.contact_id);
        people.set(row.automation_id, set);
        stats.set(row.automation_id, s);
      }
      for (const [id, set] of people) stats.get(id)!.contacts = set.size;
      const everyone = new Set(rows.map((r) => r.contact_id));
      const totals = { ...EMPTY_STATS, contacts: everyone.size, runs: rows.length };
      for (const s of stats.values()) {
        totals.done += s.done;
        totals.pending += s.pending;
        totals.failed += s.failed;
        totals.cancelled += s.cancelled;
      }
      /** Pessoas distintas em várias automações (um workflow), sem contar duas vezes. */
      const peopleIn = (ids: string[]) => new Set(ids.flatMap((id) => [...(people.get(id) ?? [])])).size;
      return { get: (id: string) => stats.get(id) ?? EMPTY_STATS, totals, peopleIn };
    },
  });
}

/* ---------- Contactos ---------- */

export type ContactFilters = {
  /** Etapa da jornada, "returning" (voltaram 2+ vezes) ou null para todos. */
  stage: string | null;
  listId: string | null;
  webinarId: string | null;
  search: string;
  page: number;
};

export const CONTACTS_PAGE_SIZE = 50;

const allContacts = () => supabase.from("contact_summaries").select("*", { count: "exact" });

function contactsQuery(organizationId: string, f: Omit<ContactFilters, "page">) {
  // Uma lista (manual ou segmento) é lida pela base de dados: o segmento calcula-se agora.
  const base = f.listId
    ? (supabase.rpc("contacts_in_list", { _list_id: f.listId }, { count: "exact" }) as unknown as ReturnType<
        typeof allContacts
      >)
    : allContacts();
  let q = base.eq("organization_id", organizationId);
  if (f.stage === "returning") q = q.gte("events_attended", 2);
  else if (f.stage) q = q.eq("stage", f.stage);
  if (f.webinarId) q = q.contains("webinar_ids", [f.webinarId]);
  // Vírgulas e parênteses partem o filtro `or` do PostgREST.
  const term = f.search.replace(/[,()*%"\\]/g, " ").trim();
  if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  return q.order("last_seen_at", { ascending: false });
}

export function useContacts(organizationId: string | undefined, filters: ContactFilters) {
  return useQuery({
    queryKey: ["contacts", organizationId, filters],
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = filters.page * CONTACTS_PAGE_SIZE;
      const { data, count, error } = await contactsQuery(organizationId!, filters).range(
        from,
        from + CONTACTS_PAGE_SIZE - 1,
      );
      if (error) throw error;
      return { rows: (data ?? []) as ContactSummary[], total: count ?? 0 };
    },
  });
}

/** Todos os contactos do filtro actual, para exportar. */
export async function fetchAllContacts(
  organizationId: string,
  filters: Omit<ContactFilters, "page">,
): Promise<ContactSummary[]> {
  const rows: ContactSummary[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await contactsQuery(organizationId, filters).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as ContactSummary[]));
    if (!data || data.length < 1000) return rows;
  }
}

export type StageCounts = Record<
  "all" | "new" | "no_show" | "watched" | "reached_offer" | "clicked" | "checkout" | "customer" | "returning",
  number
>;

export function useContactStageCounts(
  organizationId: string | undefined,
  listId: string | null,
  webinarId: string | null,
) {
  return useQuery({
    queryKey: ["contacts", "counts", organizationId, listId, webinarId],
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contact_stage_counts", {
        _organization_id: organizationId!,
        ...(listId ? { _list_id: listId } : {}),
        ...(webinarId ? { _webinar_id: webinarId } : {}),
      });
      if (error) throw error;
      return data as StageCounts;
    },
  });
}

export type SourceRow = {
  source: string;
  contacts: number;
  attended: number;
  reached_offer: number;
  clicked: number;
  checkout: number;
  customers: number;
};

export function useContactSources(
  organizationId: string | undefined,
  listId: string | null,
  webinarId: string | null,
) {
  return useQuery({
    queryKey: ["contacts", "sources", organizationId, listId, webinarId],
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contact_source_breakdown", {
        _organization_id: organizationId!,
        ...(listId ? { _list_id: listId } : {}),
        ...(webinarId ? { _webinar_id: webinarId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as SourceRow[];
    },
  });
}

export function useContactLists(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["contacts", "lists", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_lists")
        .select("id, name, created_at, kind, rules")
        .eq("organization_id", organizationId!)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((l) => ({
        ...l,
        kind: l.kind === "smart" ? ("smart" as const) : ("manual" as const),
        rules: isSegmentRules(l.rules) ? l.rules : null,
      }));
    },
  });
}
export type ContactList = NonNullable<ReturnType<typeof useContactLists>["data"]>[number];

/** Cria ou altera um segmento; as regras são validadas outra vez pela base de dados. */
export async function saveSegment(
  organizationId: string,
  segment: { id?: string | undefined; name: string; rules: SegmentRules },
) {
  const rules = segment.rules as unknown as Json;
  if (segment.id) {
    const { error } = await supabase
      .from("contact_lists")
      .update({ name: segment.name, rules })
      .eq("id", segment.id);
    if (error) throw error;
    return segment.id;
  }
  const { data, error } = await supabase
    .from("contact_lists")
    .insert({ organization_id: organizationId, name: segment.name, kind: "smart", rules })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const REGISTRATION_ORIGIN_COLUMNS =
  "id, webinar_id, joined_at, registration_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, consent_at";
export type RegistrationOrigin = Pick<
  Database["public"]["Tables"]["participants"]["Row"],
  | "id"
  | "webinar_id"
  | "joined_at"
  | "registration_source"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_content"
  | "utm_term"
  | "referrer"
  | "consent_at"
>;

export function useContactDetail(contactId: string | null) {
  return useQuery({
    queryKey: ["contacts", "detail", contactId],
    enabled: Boolean(contactId),
    queryFn: async () => {
      const [participations, purchases, memberships, origins, segments] = await Promise.all([
        supabase
          .from("participant_facts")
          .select(PARTICIPATION_COLUMNS)
          .eq("contact_id", contactId!)
          .order("joined_at", { ascending: false })
          .limit(200),
        supabase
          .from("real_purchase_events")
          .select("id, created_at, status_at, product_name, amount, amount_value, currency, status, provider")
          .eq("contact_id", contactId!)
          .order("created_at", { ascending: false }),
        supabase.from("contact_list_members").select("list_id").eq("contact_id", contactId!),
        // A origem de cada inscrição: é da inscrição, não da pessoa (cada webinar tem a sua).
        supabase
          .from("participants")
          .select(REGISTRATION_ORIGIN_COLUMNS)
          .eq("contact_id", contactId!)
          .order("joined_at", { ascending: false })
          .limit(50),
        supabase.rpc("contact_segments", { _contact_ids: [contactId!] }),
      ]);
      if (participations.error) throw participations.error;
      const rows = participations.data ?? [];
      const ids = rows.flatMap((p) => p.participant_id ?? []);
      const [clicks, messages] = ids.length
        ? await Promise.all([
            supabase
              .from("cta_events")
              .select("participant_id, occurred_at, video_second")
              .in("participant_id", ids)
              .eq("event_type", "click"),
            supabase
              .from("private_messages")
              .select("participant_id, body, created_at, video_second")
              .in("participant_id", ids)
              .eq("sender_kind", "participant")
              .order("created_at", { ascending: false })
              .limit(100),
          ])
        : [{ data: [] }, { data: [] }];
      // Os acontecimentos do contacto e o fim das sessões em que esteve (esses são do
      // webinar, sem contacto): nunca os de outras pessoas da mesma sessão.
      const sessionIds = [...new Set(rows.flatMap((p) => p.webinar_session_id ?? []))];
      const ended = sessionIds.length
        ? `,and(name.eq.webinar_session_ended,session_id.in.(${sessionIds.join(",")}))`
        : "";
      const events = await supabase
        .from("event_log")
        .select("name, occurred_at, webinar_id, session_id, video_second, data")
        .or(`contact_id.eq.${contactId}${ended}`)
        .order("occurred_at", { ascending: false })
        .limit(300);
      const titles = new Map(rows.map((p) => [p.webinar_id, p.webinar_title]));
      const latest = rows[0];
      return {
        timeline: timelineItems(events.data ?? []).slice(0, 40),
        webinarTitles: titles,
        journey: buildJourney({
          participations: rows,
          clicks: clicks.data ?? [],
          messages: messages.data ?? [],
          purchases: (purchases.data ?? []) as Purchase[],
        }),
        lastMessages: (messages.data ?? []).slice(0, 3),
        listIds: (memberships.data ?? []).map((m) => m.list_id),
        segmentIds: (segments.data ?? []).map((m) => m.list_id),
        origins: (origins.data ?? []) as RegistrationOrigin[],
        place: latest ? [latest.city, latest.country].filter(Boolean).join(", ") : "",
        device: latest?.device ?? "",
      };
    },
  });
}
