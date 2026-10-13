/**
 * O que a equipa faz no Atendimento. Cada função valida primeiro, com o RLS de
 * quem pede, que a conversa ou o caso é da organização dessa pessoa; só depois
 * usa a chave de serviço para gravar tudo de uma vez.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { effectiveStatus, INTENTS, PRIORITIES, TEAM_TOOK_REASON, type CaseRow } from "./model";

type Client = SupabaseClient<Database>;
const uuid = z.string().uuid();

async function readConversation(supabase: Client, conversationId: string) {
  const { data } = await supabase
    .from("private_conversations")
    .select("id, organization_id, webinar_id, participant_id, channel")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) throw new Error("Conversa não encontrada.");
  return data;
}

async function readCase(supabase: Client, caseId: string) {
  const { data } = await supabase
    .from("support_cases")
    .select("id, organization_id, number, status, assigned_staff_id, conversation_id, intent, priority")
    .eq("id", caseId)
    .maybeSingle();
  if (!data) throw new Error("Caso não encontrado.");
  return data;
}

async function assertTeamManager(supabase: Client, organizationId: string) {
  const { data } = await supabase.rpc("has_organization_role", {
    _organization_id: organizationId,
    _roles: ["owner", "admin"],
  });
  if (!data) throw new Error("Só o proprietário ou um administrador pode fazer isto.");
}

async function act(caseId: string, action: string, userId: string, payload: Record<string, unknown> = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("support_case_action", {
    _case_id: caseId,
    _action: action,
    _actor_user_id: userId,
    _payload: payload as never,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CaseRow;
}

/** O caso aberto da conversa; se não houver, abre um em nome de quem está a atender. */
async function ensureCase(
  conversation: Awaited<ReturnType<typeof readConversation>>,
  userId: string,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: open } = await supabaseAdmin
    .from("support_cases")
    .select("id")
    .eq("conversation_id", conversation.id)
    .not("status", "in", "(resolved,closed)")
    .maybeSingle();
  if (open) return open.id;

  const [{ data: staff }, { data: last }] = await Promise.all([
    supabaseAdmin.rpc("support_staff_for_user", {
      _organization_id: conversation.organization_id,
      _user_id: userId,
    }),
    supabaseAdmin
      .from("private_messages")
      .select("body")
      .eq("conversation_id", conversation.id)
      .eq("sender_kind", "participant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!staff?.id) throw new Error("Não tem perfil de atendimento nesta organização.");

  const { escalateToCase } = await import("./cases.server");
  const opened = await escalateToCase({
    organizationId: conversation.organization_id,
    conversationId: conversation.id,
    participantId: conversation.participant_id,
    webinarId: conversation.webinar_id,
    channel: conversation.channel,
    text: last?.body ?? "",
    actor: "human",
    actorUserId: userId,
    reason: TEAM_TOOK_REASON,
    assignStaffId: staff.id,
  });
  return opened.caseId;
}

export const assumeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversationId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const conversation = await readConversation(context.supabase, data.conversationId);
    const caseId = await ensureCase(conversation, context.userId);
    const updated = await act(caseId, "assume", context.userId);
    return { caseId, status: updated.status };
  });

export const replyToConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversationId: uuid,
        body: z.string().trim().min(1).max(2000),
        /** Sugestão da IA que deu origem a esta resposta. */
        suggestionId: uuid.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const conversation = await readConversation(context.supabase, data.conversationId);
    const caseId = await ensureCase(conversation, context.userId);
    const updated = await act(caseId, "reply", context.userId, { body: data.body });

    if (data.suggestionId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: suggestion } = await supabaseAdmin
        .from("ai_agent_messages")
        .select("id, answer")
        .eq("id", data.suggestionId)
        .eq("conversation_id", conversation.id)
        .maybeSingle();
      if (suggestion) {
        const edited = data.body.trim() !== String(suggestion.answer ?? "").trim();
        await supabaseAdmin
          .from("ai_agent_messages")
          .update({
            status: edited ? "edited" : "sent",
            human_edit: edited ? data.body : null,
            final_answer: data.body,
            updated_at: new Date().toISOString(),
          })
          .eq("id", suggestion.id);
      }
    }
    return { caseId, status: updated.status };
  });

/** Ligar ou pausar a IA numa conversa. Com um caso aberto, ligar é devolver à IA. */
export const setConversationAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ conversationId: uuid, enabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const conversation = await readConversation(context.supabase, data.conversationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: open } = await supabaseAdmin
      .from("support_cases")
      .select("id")
      .eq("conversation_id", conversation.id)
      .not("status", "in", "(resolved,closed)")
      .maybeSingle();

    if (data.enabled && open) {
      await act(open.id, "return_to_ai", context.userId);
      return { ok: true };
    }
    await supabaseAdmin
      .from("private_conversations")
      .update(
        data.enabled
          ? { ai_paused: false, needs_human: false, escalation_reason: null, assigned_to: null }
          : { ai_paused: true },
      )
      .eq("id", conversation.id);
    const { logConversationEvent } = await import("./cases.server");
    await logConversationEvent(conversation.id, data.enabled ? "ai_resumed" : "human_assumed", "human", {
      user_id: context.userId,
      manual: true,
    });
    return { ok: true };
  });

/**
 * Ligar ou pausar a IA em todas as conversas da organização (o interruptor do Atendimento). Em pausa,
 * cada mensagem nova abre um caso para a equipa; as pausas por conversa ficam como estavam.
 */
export const setOrganizationAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ organizationId: uuid, enabled: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_organization_role", {
      _organization_id: data.organizationId,
      _roles: ["owner", "admin", "support"],
    });
    if (!allowed) throw new Error("Só quem atende pode ligar ou pausar o agente.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ ai_paused: !data.enabled })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assume"), caseId: uuid }),
  z.object({ action: z.literal("resume"), caseId: uuid }),
  z.object({ action: z.literal("request_call"), caseId: uuid }),
  z.object({ action: z.literal("return_to_ai"), caseId: uuid }),
  z.object({ action: z.literal("close"), caseId: uuid }),
  z.object({ action: z.literal("review"), caseId: uuid }),
  z.object({ action: z.literal("waiting_customer"), caseId: uuid }),
  z.object({ action: z.literal("waiting_team"), caseId: uuid }),
  z.object({ action: z.literal("reopen"), caseId: uuid, reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("escalate"), caseId: uuid, reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("note"), caseId: uuid, body: z.string().trim().min(1).max(2000) }),
  z.object({
    action: z.literal("resolve"),
    caseId: uuid,
    resolution: z.string().trim().max(2000).default(""),
    returnToAi: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("transfer"),
    caseId: uuid,
    staffId: uuid.optional(),
    departmentId: uuid.optional(),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("classify"),
    caseId: uuid,
    intent: z.enum(INTENTS.map((i) => i.id) as [string, ...string[]]).optional(),
    priority: z.enum(PRIORITIES.map((p) => p.id) as [string, ...string[]]).optional(),
    departmentId: uuid.optional(),
  }),
]);

export type CaseActionInput = z.input<typeof actionSchema>;

export const runCaseAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => actionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const current = await readCase(context.supabase, data.caseId);
    let updated: CaseRow;

    switch (data.action) {
      case "waiting_customer":
        updated = await act(current.id, "waiting", context.userId, { on: "customer" });
        break;
      case "waiting_team":
        updated = await act(current.id, "waiting", context.userId, { on: "team" });
        break;
      case "reopen":
        updated = await act(current.id, "reopen", context.userId, { reason: data.reason ?? "" });
        break;
      case "note":
        updated = await act(current.id, "note", context.userId, { body: data.body });
        break;
      case "resolve":
        updated = await act(current.id, "resolve", context.userId, {
          resolution: data.resolution,
          return_to_ai: data.returnToAi,
        });
        break;
      case "transfer":
        if (!data.staffId && !data.departmentId) throw new Error("Escolha para quem transferir.");
        updated = await act(current.id, "transfer", context.userId, {
          staff_id: data.staffId ?? "",
          department_id: data.departmentId ?? "",
          note: data.note ?? "",
        });
        break;
      case "classify":
        updated = await act(current.id, "classify", context.userId, {
          ...(data.intent ? { intent: data.intent } : {}),
          ...(data.priority ? { priority: data.priority } : {}),
          ...(data.departmentId ? { department_id: data.departmentId } : {}),
        });
        break;
      case "escalate": {
        // Supervisor presente e com menos carga; sem nenhum, fica na fila dos escalados.
        const { loadTeam } = await import("./cases.server");
        const team = await loadTeam(current.organization_id);
        const supervisors = team.staff
          .filter((s) => s.is_supervisor && s.active && s.id !== current.assigned_staff_id)
          .map((s) => ({
            id: s.id,
            present: ["available", "online"].includes(effectiveStatus(s)),
            load: team.candidates.find((c) => c.id === s.id)?.openCases ?? 0,
          }))
          .filter((s) => s.present)
          .sort((a, b) => a.load - b.load);
        updated = await act(current.id, "escalate", context.userId, {
          staff_id: supervisors[0]?.id ?? "",
          reason: data.reason ?? "",
        });
        break;
      }
      default:
        updated = await act(current.id, data.action, context.userId);
    }

    if (updated.status === "resolved" && current.status !== "resolved") {
      const { notifyOutgoing } = await import("@/lib/integrations.server");
      await notifyOutgoing(updated.organization_id, "case.resolved", {
        case_id: updated.id,
        number: updated.number,
        intent: updated.intent,
        priority: updated.priority,
        resolution: updated.resolution,
        webinar_id: updated.webinar_id,
      });
    }
    return { id: updated.id, status: updated.status, assignedStaffId: updated.assigned_staff_id };
  });

/* ---------- Equipa ---------- */

function requestOrigin() {
  const request = getRequest();
  const fromHeader = request?.headers.get("origin");
  if (fromHeader) return fromHeader;
  return request ? new URL(request.url).origin : "";
}

/**
 * Convida uma pessoa já registada na equipa. Quem ainda não tem conta
 * recebe um link para definir a palavra-passe; quem já tem conta passa a ver
 * este espaço de trabalho e entra como sempre entrou — o link de acesso de uma
 * conta que já existe nunca é entregue a outra pessoa.
 */
export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ staffId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase
      .from("support_staff")
      .select("id, organization_id, name, email, user_id")
      .eq("id", data.staffId)
      .maybeSingle();
    if (!staff) throw new Error("Pessoa não encontrada.");
    await assertTeamManager(context.supabase, staff.organization_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.rpc("auth_user_id_for_email", {
      _email: staff.email,
    });
    let userId = (existing as string | null) ?? null;
    let link: string | null = null;
    const hadAccount = Boolean(userId);

    if (!userId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: staff.email,
        options: {
          data: { full_name: staff.name, invited_to_organization: staff.organization_id },
          redirectTo: `${requestOrigin()}/auth/welcome`,
        },
      });
      if (error || !created.user) throw new Error(error?.message ?? "Não foi possível criar o convite.");
      userId = created.user.id;
      link = created.properties?.action_link ?? null;
    }

    const { error: memberError } = await supabaseAdmin
      .from("organization_members")
      .upsert(
        { organization_id: staff.organization_id, user_id: userId, role: "support" },
        { onConflict: "organization_id,user_id", ignoreDuplicates: true },
      );
    if (memberError) throw new Error(memberError.message);
    await supabaseAdmin
      .from("support_staff")
      .update({ user_id: userId, invited_at: new Date().toISOString() })
      .eq("id", staff.id);

    return { link, hadAccount };
  });

/** Apagar uma competência tira-a também de quem a tinha e das regras que a pediam. */
export const deleteSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ skillId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: skill } = await context.supabase
      .from("support_skills")
      .select("id, organization_id, slug")
      .eq("id", data.skillId)
      .maybeSingle();
    if (!skill) throw new Error("Competência não encontrada.");
    await assertTeamManager(context.supabase, skill.organization_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [staff, rules] = await Promise.all([
      supabaseAdmin
        .from("support_staff")
        .select("id, skills")
        .eq("organization_id", skill.organization_id)
        .contains("skills", [skill.slug]),
      supabaseAdmin
        .from("support_routing_rules")
        .select("id, required_skills")
        .eq("organization_id", skill.organization_id)
        .contains("required_skills", [skill.slug]),
    ]);
    await Promise.all([
      ...(staff.data ?? []).map((row) =>
        supabaseAdmin
          .from("support_staff")
          .update({ skills: row.skills.filter((s) => s !== skill.slug) })
          .eq("id", row.id),
      ),
      ...(rules.data ?? []).map((row) =>
        supabaseAdmin
          .from("support_routing_rules")
          .update({ required_skills: row.required_skills.filter((s) => s !== skill.slug) })
          .eq("id", row.id),
      ),
    ]);
    await supabaseAdmin.from("support_skills").delete().eq("id", skill.id);
    return { ok: true };
  });

/** Tira o acesso a uma pessoa da equipa: sai da organização e deixa de receber casos. */
export const removeStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ staffId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase
      .from("support_staff")
      .select("id, organization_id, user_id")
      .eq("id", data.staffId)
      .maybeSingle();
    if (!staff) throw new Error("Pessoa não encontrada.");
    await assertTeamManager(context.supabase, staff.organization_id);
    if (staff.user_id === context.userId) throw new Error("Não pode remover o seu próprio acesso.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (staff.user_id) {
      // Só sai quem entrou como suporte: proprietários e administradores gerem-se nas definições.
      await supabaseAdmin
        .from("organization_members")
        .delete()
        .eq("organization_id", staff.organization_id)
        .eq("user_id", staff.user_id)
        .eq("role", "support");
    }
    await supabaseAdmin
      .from("support_staff")
      .update({ active: false, status: "offline" })
      .eq("id", staff.id);
    return { ok: true };
  });
