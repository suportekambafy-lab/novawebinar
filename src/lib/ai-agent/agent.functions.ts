/**
 * Funções de servidor do Agente IA: configuração, conhecimento, simulador,
 * sugestões para a equipa e métricas.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertWebinarAccess, assertWebinarWriter, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runBilled } from "@/lib/ai/billing.server";
import { s, schema } from "@/lib/ai/schema";
import { defaultPermissions, KNOWLEDGE_FIELDS, type AgentSource } from "./defaults";
import { KNOWLEDGE_SOURCES, readSources, sourcePatch, type SourceId, type SourceMap } from "./knowledge-sources";

type Row = Record<string, any>;

const uuid = z.string().uuid();

/** O agente da conta: a linha sem webinar (migração 0073). Antes da migração não existe. */
async function accountAgent(supabase: any, organizationId: string) {
  const { data } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("organization_id", organizationId)
    .is("webinar_id", null)
    .maybeSingle();
  return (data ?? null) as Row | null;
}

async function ensureAgentRow(supabase: any, webinarId: string) {
  const { data: existing } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("webinar_id", webinarId)
    .maybeSingle();
  if (existing) return existing as Row;

  const { data: webinar } = await supabase
    .from("webinars")
    .select("id, organization_id")
    .eq("id", webinarId)
    .single();
  if (!webinar) throw new Error("Webinar não encontrado.");

  // Com agente da conta, um webinar novo segue-o («Todos os webinars»).
  const account = await accountAgent(supabase, webinar.organization_id);
  const { data: created, error } = await supabase
    .from("ai_agents")
    .insert({
      webinar_id: webinarId,
      organization_id: webinar.organization_id,
      permissions: defaultPermissions(),
      ...(account ? { scope: "account" } : {}),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const rows = KNOWLEDGE_FIELDS.map((field, index) => ({
    agent_id: created.id,
    organization_id: webinar.organization_id,
    section: field.section,
    field: field.field,
    label: field.label,
    value: "",
    visibility: "always",
    position: index,
  }));
  await supabase.from("ai_agent_knowledge").insert(rows);
  return created as Row;
}

/**
 * Cria o agente da conta com as definições do agente deste webinar (nome, autonomia, tom, regras).
 * O conhecimento não se copia: fica sempre em cada webinar.
 */
async function ensureAccountAgent(supabase: any, own: Row) {
  const existing = await accountAgent(supabase, own["organization_id"]);
  if (existing) return existing;
  const { id, webinar_id, created_at, updated_at, ...settings } = own;
  const { data: created, error } = await supabase
    .from("ai_agents")
    .insert({ ...settings, webinar_id: null, scope: "account" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created as Row;
}

/** As definições que o editor mostra e grava: as do webinar ou, com «Todos os webinars», as da conta. */
async function resolveAgentRow(supabase: any, webinarId: string) {
  const own = await ensureAgentRow(supabase, webinarId);
  if (own["scope"] !== "account") return own;
  return ensureAccountAgent(supabase, own);
}

export type AgentScope = "webinar" | "account";

export type AgentBundle = {
  /** As definições: as do webinar ou, com «Todos os webinars», as da conta. */
  agent: Row;
  /** O conhecimento é sempre deste webinar. */
  knowledge: Row[];
  faqs: Row[];
  objections: Row[];
  sources: SourceMap;
  scope: AgentScope;
  /** Falso enquanto a migração 0073 não estiver aplicada: só há «Só este webinar». */
  accountReady: boolean;
};

export const getAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ webinarId: uuid }).parse(data))
  .handler(async ({ data, context }): Promise<AgentBundle> => {
    const supabase = context.supabase as never as any;
    const own = await ensureAgentRow(supabase, data.webinarId);
    const scope: AgentScope = own["scope"] === "account" ? "account" : "webinar";
    const agent = scope === "account" ? await ensureAccountAgent(supabase, own) : own;
    const [{ data: knowledge }, { data: faqs }, { data: objections }] = await Promise.all([
      supabase.from("ai_agent_knowledge").select("*").eq("agent_id", own["id"]).order("position"),
      supabase.from("ai_agent_faqs").select("*").eq("agent_id", own["id"]).order("position"),
      supabase.from("ai_agent_objections").select("*").eq("agent_id", own["id"]).order("position"),
    ]);
    return {
      agent,
      knowledge: (knowledge ?? []) as Row[],
      faqs: (faqs ?? []) as Row[],
      objections: (objections ?? []) as Row[],
      sources: readSources(own),
      scope,
      accountReady: "scope" in own,
    };
  });

/** Âmbito do agente neste webinar. «Todos os webinars» precisa da migração 0073. */
export const saveAgentScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ webinarId: uuid, scope: z.enum(["webinar", "account"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as any;
    const own = await ensureAgentRow(supabase, data.webinarId);
    if (!("scope" in own)) throw new Error("«Todos os webinars» ainda não está disponível.");
    // Primeiro o agente da conta; o âmbito só muda se ele existir.
    if (data.scope === "account") await ensureAccountAgent(supabase, own);
    const { error } = await supabase
      .from("ai_agents")
      .update({ scope: data.scope, updated_at: new Date().toISOString() })
      .eq("id", own["id"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Só as colunas que o editor muda (migrações 0039 e 0073). Estrito: id, webinar_id,
 * organization_id e as datas nunca entram, senão um membro mudava o agente de webinar ou de conta.
 */
const agentPatch = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(["desativado", "copiloto", "hibrido", "automatico"]),
    agent_name: z.string().max(80),
    intro: z.string().max(500),
    personality: z.record(z.string(), z.unknown()),
    response_speed: z.string().max(40),
    show_typing: z.boolean(),
    permissions: z.record(z.string(), z.boolean()),
    never_say: z.string().max(4000),
    escalation: z.record(z.string(), z.unknown()),
    confidence_threshold: z.number().min(0).max(1),
    avatar_url: z.string().max(2000).nullable(),
    use_webinar_transcript: z.boolean(),
    scope: z.enum(["webinar", "account"]),
  })
  .partial()
  .strict();

export const saveAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: uuid,
        patch: agentPatch,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as any;
    const agent = await resolveAgentRow(supabase, data.webinarId);
    const { error } = await supabase
      .from("ai_agents")
      .update({ ...data.patch, updated_at: new Date().toISOString() })
      .eq("id", agent["id"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marca ou desmarca uma fonte de conhecimento deste webinar (seja qual for o âmbito do agente). */
export const saveAgentSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: uuid,
        source: z.enum(KNOWLEDGE_SOURCES.map((s) => s.id) as [SourceId, ...SourceId[]]),
        on: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as any;
    const own = await ensureAgentRow(supabase, data.webinarId);
    const { error } = await supabase
      .from("ai_agents")
      .update({ ...sourcePatch(own, data.source, data.on), updated_at: new Date().toISOString() })
      .eq("id", own["id"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAgentKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: uuid,
        items: z.array(
          z.object({
            id: uuid,
            value: z.string(),
            visibility: z.enum(["always", "after_presented"]),
            presentedAfterMs: z.number().int().nonnegative().nullable(),
          }),
        ),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as any;
    for (const item of data.items) {
      await supabase
        .from("ai_agent_knowledge")
        .update({
          value: item.value,
          visibility: item.visibility,
          presented_after_ms: item.presentedAfterMs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
    }
    return { ok: true };
  });

export const saveAgentFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: uuid,
        id: uuid.nullable(),
        question: z.string().min(1),
        answer: z.string(),
        visibility: z.enum(["always", "after_presented"]).default("always"),
        approved: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as any;
    const agent = await ensureAgentRow(supabase, data.webinarId);
    const payload = {
      question: data.question,
      answer: data.answer,
      visibility: data.visibility,
      approved: data.approved,
      updated_at: new Date().toISOString(),
    };
    if (data.id) await supabase.from("ai_agent_faqs").update(payload).eq("id", data.id);
    else
      await supabase.from("ai_agent_faqs").insert({
        ...payload,
        agent_id: agent["id"],
        organization_id: agent["organization_id"],
      });
    return { ok: true };
  });

export const saveAgentObjection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: uuid,
        id: uuid.nullable(),
        objection: z.string().min(1),
        response: z.string().default(""),
        keyPoints: z.string().default(""),
        neverSay: z.string().default(""),
        allowedCta: z.string().default(""),
        escalateWhen: z.string().default(""),
        approved: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as any;
    const agent = await ensureAgentRow(supabase, data.webinarId);
    const payload = {
      objection: data.objection,
      response: data.response,
      key_points: data.keyPoints,
      never_say: data.neverSay,
      allowed_cta: data.allowedCta,
      escalate_when: data.escalateWhen,
      approved: data.approved,
      updated_at: new Date().toISOString(),
    };
    if (data.id) await supabase.from("ai_agent_objections").update(payload).eq("id", data.id);
    else
      await supabase.from("ai_agent_objections").insert({
        ...payload,
        agent_id: agent["id"],
        organization_id: agent["organization_id"],
      });
    return { ok: true };
  });

export const deleteAgentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ table: z.enum(["ai_agent_faqs", "ai_agent_objections"]), id: uuid }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await (context.supabase as never as any).from(data.table).delete().eq("id", data.id);
    return { ok: true };
  });

export type SimulationResult = {
  ok: boolean;
  classification: string;
  decision: string;
  answer: string;
  confidence: number;
  sources: AgentSource[];
  escalationReason: string | null;
  reason: string;
  model: string;
  error?: string;
};

export const simulateAgentReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: uuid,
        question: z.string().min(1).max(1000),
        sessionSeconds: z.number().int().nonnegative(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<SimulationResult> => {
    const organizationId = await assertWebinarWriter(context.supabase, data.webinarId);
    const { decideAgentReply } = await import("./respond.server");
    const result = await runBilled({ organizationId, action: "agent_reply" }, () =>
      decideAgentReply({
        webinarId: data.webinarId,
        question: data.question,
        sessionMs: data.sessionSeconds * 1000,
        history: [],
        participantName: "Participante de teste",
      }),
    );
    if (!result.ok) {
      return {
        ok: false,
        classification: "UNKNOWN",
        decision: "ESCALATE",
        answer: "",
        confidence: 0,
        sources: [],
        escalationReason: "Problema técnico do assistente",
        reason: "",
        model: "",
        error: result.reason,
      };
    }
    return {
      ok: true,
      classification: result.classification,
      decision: result.decision,
      answer: result.answer,
      confidence: result.confidence,
      sources: result.sources,
      escalationReason: result.escalationReason,
      reason: result.reason,
      model: result.model,
    };
  });

export type GeneratedContent = {
  ok: boolean;
  error?: string;
  usedTranscript: boolean;
  knowledge: { field: string; value: string }[];
  faqs: { question: string; answer: string }[];
  objections: {
    objection: string;
    response: string;
    keyPoints: string;
    neverSay: string;
    allowedCta: string;
    escalateWhen: string;
  }[];
};

const FAQ = s.object({ question: s.string(), answer: s.string() });

/** Forma da resposta de cada pedido de conteúdo do agente. */
export const CONTENT_SCHEMAS = {
  knowledge: schema("agent_knowledge", {
    knowledge: s.array(
      s.object({ field: s.string(KNOWLEDGE_FIELDS.map((f) => f.field)), value: s.string() }),
    ),
  }),
  faqs: schema("agent_faqs", { faqs: s.array(FAQ) }),
  objections: schema("agent_objections", {
    objections: s.array(
      s.object({
        objection: s.string(),
        response: s.string(),
        keyPoints: s.string(),
        neverSay: s.string(),
        allowedCta: s.string(),
        escalateWhen: s.string(),
      }),
    ),
  }),
};

const EMPTY_CONTENT: Omit<GeneratedContent, "ok" | "error" | "usedTranscript"> = {
  knowledge: [],
  faqs: [],
  objections: [],
};

/**
 * "Gerar com IA" das secções de conhecimento, FAQs e objeções.
 *
 * Usa como fonte o que o vendedor já preencheu e, quando existe, a
 * transcrição real do webinar. Tudo é sugestão: só entra depois de aprovado.
 */
export const generateAgentContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: uuid,
        target: z.enum(["knowledge", "faqs", "objections"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<GeneratedContent> => {
    const supabase = context.supabase as never as any;
    await assertWebinarWriter(context.supabase, data.webinarId);
    const agent = await ensureAgentRow(supabase, data.webinarId);

    const [{ data: webinar }, { data: knowledge }, { latestReadyVersion }, { chatJson }] =
      await Promise.all([
        supabase
          .from("webinars")
          .select("public_title, description")
          .eq("id", data.webinarId)
          .single(),
        supabase.from("ai_agent_knowledge").select("*").eq("agent_id", agent["id"]).order("position"),
        import("@/lib/temporal/engine.server"),
        import("@/lib/ai/gateway.server"),
      ]);

    const version = await latestReadyVersion(data.webinarId).catch(() => null);
    const transcript = version?.rawText ? version.rawText.slice(0, 24000) : "";
    const usedTranscript = transcript.length > 0;

    const filled = ((knowledge ?? []) as Row[])
      .filter((row) => String(row["value"] ?? "").trim())
      .map((row) => `- ${row["label"]}: ${row["value"]}`)
      .join("\n");

    const fieldList = KNOWLEDGE_FIELDS.map((f) => `- ${f.field}: ${f.label}`).join("\n");

    const ask =
      data.target === "knowledge"
        ? `Preenche os campos em falta usando apenas informação presente nas fontes. Campos possíveis:\n${fieldList}\nDevolve só os campos para os quais tens base real. Nunca inventes preço, garantia, prazos ou bónus.`
        : data.target === "faqs"
          ? "Sugere até 12 perguntas frequentes com resposta curta e concreta, apenas com base nas fontes."
          : "Sugere até 8 objeções reais com resposta recomendada, pontos-chave, o que nunca dizer, chamada à ação permitida e quando passar para uma pessoa da equipa.";

    const sources = [
      webinar?.public_title ? `Webinar: ${webinar.public_title}` : "",
      webinar?.description ? `Descrição: ${webinar.description}` : "",
      filled ? `Conhecimento já preenchido pelo vendedor:\n${filled}` : "",
      transcript ? `Transcrição do webinar:\n${transcript}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!sources.trim()) {
      return {
        ok: false,
        error: "Ainda não há informação suficiente. Preencha alguns campos ou gere a transcrição.",
        usedTranscript,
        ...EMPTY_CONTENT,
      };
    }

    const result = await runBilled(
      { organizationId: String(agent["organization_id"]), action: "agent_content" },
      () =>
        chatJson({
          task: "generation",
          system:
            "És um assistente que prepara conhecimento de apoio a vendas para um webinar. Português de Portugal. Nunca inventes preços, descontos, garantias, bónus ou resultados que não apareçam nas fontes.",
          user: `${sources}\n\n${ask}`,
          schema: CONTENT_SCHEMAS[data.target],
        }),
    );
    if (!result.ok) return { ok: false, error: result.reason, usedTranscript, ...EMPTY_CONTENT };

    const parsed = result.json as Partial<GeneratedContent>;

    const allowed = new Set(KNOWLEDGE_FIELDS.map((f) => f.field));
    return {
      ok: true,
      usedTranscript,
      knowledge: (parsed.knowledge ?? [])
        .filter((item) => item && allowed.has(item.field) && String(item.value ?? "").trim())
        .slice(0, KNOWLEDGE_FIELDS.length),
      faqs: (parsed.faqs ?? []).filter((item) => item?.question).slice(0, 12),
      objections: (parsed.objections ?? [])
        .filter((item) => item?.objection)
        .slice(0, 8)
        .map((item) => ({
          objection: item.objection ?? "",
          response: item.response ?? "",
          keyPoints: item.keyPoints ?? "",
          neverSay: item.neverSay ?? "",
          allowedCta: item.allowedCta ?? "",
          escalateWhen: item.escalateWhen ?? "",
        })),
    };
  });

/** A equipa aprova (com ou sem edição) e a resposta segue para o participante. */
export const sendAgentSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, finalAnswer: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as any;
    const { data: row } = await supabase
      .from("ai_agent_messages")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!row) throw new Error("Sugestão não encontrada.");
    const edited = data.finalAnswer.trim() !== String(row.answer ?? "").trim();

    // A conversa tem de ser visível para quem aprova (RLS da equipa de atendimento).
    const { data: conversation } = await supabase
      .from("private_conversations")
      .select("id")
      .eq("id", row.conversation_id)
      .maybeSingle();
    if (!conversation) throw new Error("Conversa não encontrada.");

    // Reclama a sugestão antes de enviar: dois membros da equipa a carregar em «Enviar» ao mesmo tempo
    // só enviam uma vez (o segundo vê que já foi enviada).
    const { data: claimed } = await supabase
      .from("ai_agent_messages")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "suggested")
      .select("id");
    if (!claimed?.length) throw new Error("Esta sugestão já foi enviada ou descartada.");

    const { error: sendError } = await supabase.from("private_messages").insert({
      conversation_id: row.conversation_id,
      organization_id: row.organization_id,
      participant_id: row.participant_id,
      sender_kind: "ai_agent",
      body: data.finalAnswer,
      agent_message_id: row.id,
    });
    if (sendError) {
      await supabase.from("ai_agent_messages").update({ status: "suggested" }).eq("id", row.id);
      throw new Error("Não foi possível enviar a resposta.");
    }
    await supabase
      .from("private_conversations")
      .update({ status: "active" })
      .eq("id", row.conversation_id);
    const { logConversationEvent } = await import("@/lib/support/cases.server");
    await logConversationEvent(row.conversation_id, "ai_response", "human", {
      agent_message_id: row.id,
      edited,
      user_id: context.userId,
    });
    await supabase
      .from("ai_agent_messages")
      .update({
        status: edited ? "edited" : "sent",
        human_edit: edited ? data.finalAnswer : null,
        final_answer: data.finalAnswer,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { ok: true };
  });

export const discardAgentSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await (context.supabase as never as any)
      .from("ai_agent_messages")
      .update({ status: "discarded", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });
