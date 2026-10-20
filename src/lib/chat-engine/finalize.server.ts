/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A passagem final no servidor: liga cada comentário gerado ao seu bloco,
 * valida a cronologia com as dez verificações e devolve os comentários
 * prontos a rever, com causa, confiança e o que a validação fez.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { latestReadyVersion } from "@/lib/temporal/engine.server";
import type { CommentCausality } from "@/lib/temporal/types";

import { ensureVersionBlocks } from "./classify.server";
import { offerStartFromBlocks, planInteractions } from "./plan";
import { kindFor } from "./timing";
import type {
  BlockType,
  Dependency,
  EngineComment,
  InteractionSlot,
  InteractionType,
  SemanticBlock,
} from "./types";
import { validateEngine, type EngineIssue } from "./validate";

export type FinalizeInput = {
  at: number;
  atMs?: number | null | undefined;
  author: string;
  message: string;
  moment?: string | undefined;
  kind?: string | null | undefined;
  anchor?: number | null | undefined;
  slot?: string | null | undefined;
  dependency?: Dependency | null | undefined;
  reason?: string | null | undefined;
  persona?: string | undefined;
  replyTo?: string | null | undefined;
};

export type FinalizedComment = FinalizeInput & {
  atMs: number;
  dependency: Dependency;
  blockId: string | null;
  blockType: BlockType | null;
  interaction: InteractionType | null;
  windowStartMs: number | null;
  windowEndMs: number | null;
  confidence: number;
  needsReview: boolean;
  causality: CommentCausality;
  validationAction: string | null;
  validationRule: string | null;
  transcriptVersionId: string | null;
};

export type FinalizeReport = {
  versionId: string | null;
  blocks: number;
  slots: number;
  generated: number;
  kept: number;
  removed: number;
  moved: number;
  corrected: number;
  byRule: Record<string, number>;
  issues: EngineIssue[];
};

function dependencyOf(kind: string | null | undefined): Dependency {
  if (kind === "provoca") return "BEFORE";
  if (kind === "responde" || kind === "reage") return "AFTER";
  return "INDEPENDENT";
}

export function toEngineComments(drafts: readonly FinalizeInput[]): EngineComment[] {
  return drafts.map((draft, index) => ({
    id: String(index),
    atMs:
      typeof draft.atMs === "number" && Number.isFinite(draft.atMs)
        ? Math.round(draft.atMs)
        : Math.round(draft.at * 1000),
    author: draft.author,
    message: draft.message,
    slotId: draft.slot ?? null,
    blockId: null,
    dependency: draft.dependency ?? dependencyOf(draft.kind),
    confidence: 0.5,
  }));
}

export function causalityFor(
  comment: EngineComment,
  slot: InteractionSlot | null,
  reason: string,
  precisionWord: boolean,
): CommentCausality {
  const relation =
    comment.dependency === "BEFORE"
      ? "CAUSE_OF_PRESENTER_SPEECH"
      : comment.dependency === "AFTER"
        ? slot &&
          (slot.blockType === "QUESTION_TO_AUDIENCE" ||
            slot.blockType === "COMMENT_REQUEST" ||
            slot.blockType === "FEEDBACK_REQUEST" ||
            slot.blockType === "POLL")
          ? "ANSWER_TO_PRESENTER"
          : "REACTION_TO_PRESENTER"
        : "SPONTANEOUS";
  return {
    temporalRelation: relation,
    triggerType: slot ? "PRESENTER_EVENT" : "NONE",
    triggerId: slot?.blockId ?? null,
    triggerStartMs: slot?.blockStartMs ?? null,
    triggerEndMs: slot?.blockEndMs ?? null,
    reactionLatencyMs:
      slot && comment.dependency === "AFTER" ? comment.atMs - slot.blockEndMs : null,
    generationReason:
      reason || slot?.reason || "Engajamento espontâneo, sem fala específica a causá-lo.",
    confidence: precisionWord ? comment.confidence : Math.min(comment.confidence, 0.5),
    slotId: slot?.id ?? null,
  };
}

/** Valida e completa os comentários gerados com os blocos e as oportunidades do webinar. */
export function finalizeWithBlocks(
  drafts: readonly FinalizeInput[],
  input: {
    blocks: SemanticBlock[];
    slots: InteractionSlot[];
    offerStartMs: number | null;
    durationMs: number;
    perMinuteCap: number;
    versionId: string | null;
    precisionWord: boolean;
  },
): { comments: FinalizedComment[]; report: FinalizeReport } {
  const engineComments = toEngineComments(drafts);
  const slotById = new Map(input.slots.map((slot) => [slot.id, slot] as const));
  for (const comment of engineComments) {
    const slot = comment.slotId ? slotById.get(comment.slotId) : null;
    if (slot) {
      comment.blockId = slot.blockId;
      comment.confidence = slot.confidence;
    } else if (comment.slotId) {
      // Slot desconhecido: a mensagem vale como livre.
      comment.slotId = null;
      comment.dependency = "INDEPENDENT";
    }
  }
  const result = validateEngine(engineComments, {
    blocks: input.blocks,
    slots: input.slots,
    offerStartMs: input.offerStartMs,
    durationMs: input.durationMs,
    perMinuteCap: input.perMinuteCap,
  });
  const issueOf = new Map<string, EngineIssue>();
  for (const issue of result.issues)
    if (!issueOf.has(issue.commentId) || issue.action === "eliminado")
      issueOf.set(issue.commentId, issue);

  const comments: FinalizedComment[] = result.kept.map((comment) => {
    const draft = drafts[Number(comment.id)]!;
    const slot = comment.slotId ? (slotById.get(comment.slotId) ?? null) : null;
    const issue = issueOf.get(comment.id) ?? null;
    const kind = slot
      ? kindFor(
          comment.dependency,
          slot.blockType === "QUESTION_TO_AUDIENCE" ||
            slot.blockType === "COMMENT_REQUEST" ||
            slot.blockType === "FEEDBACK_REQUEST" ||
            slot.blockType === "POLL",
        )
      : comment.dependency === "INDEPENDENT"
        ? "espontaneo"
        : (draft.kind ?? "espontaneo");
    return {
      ...draft,
      at: Math.round(comment.atMs / 1000),
      atMs: comment.atMs,
      author: comment.author,
      message: comment.message,
      kind,
      slot: comment.slotId,
      anchor: slot
        ? Math.round((comment.dependency === "BEFORE" ? slot.blockStartMs : slot.blockEndMs) / 1000)
        : (draft.anchor ?? null),
      dependency: comment.dependency,
      blockId: slot?.blockId ?? null,
      blockType: slot?.blockType ?? null,
      interaction: slot?.interaction ?? null,
      windowStartMs: slot?.windowStartMs ?? null,
      windowEndMs: slot?.windowEndMs ?? null,
      confidence: comment.confidence,
      needsReview: Boolean(slot?.needsReview) || comment.confidence < 0.5,
      causality: causalityFor(comment, slot, String(draft.reason ?? ""), input.precisionWord),
      validationAction: issue?.action ?? null,
      validationRule: issue?.rule ?? null,
      transcriptVersionId: input.versionId,
      ...(comment.replyTo ? { replyTo: comment.replyTo } : {}),
    };
  });

  return {
    comments,
    report: {
      versionId: input.versionId,
      blocks: input.blocks.length,
      slots: input.slots.length,
      generated: drafts.length,
      kept: comments.length,
      removed: result.removed.length,
      moved: result.issues.filter((i) => i.action === "reposicionado").length,
      corrected: result.issues.filter((i) => i.action === "corrigido").length,
      byRule: result.byRule,
      issues: result.issues.slice(0, 300),
    },
  };
}

/** Lê o webinar e a versão da transcrição e faz a passagem final. */
export async function finalizeTimelineImpl(input: {
  webinarId: string;
  comments: FinalizeInput[];
  participants: number;
  perMinute: number;
}): Promise<{ comments: FinalizedComment[]; report: FinalizeReport | null }> {
  const { data: webinar } = await (supabaseAdmin as any)
    .from("webinars")
    .select("cta_start_seconds, cta_text, duration_seconds, host_name, video_sources(duration_seconds)")
    .eq("id", input.webinarId)
    .maybeSingle();
  const version = await latestReadyVersion(input.webinarId);
  if (!version || version.sentences.length === 0) {
    return {
      comments: input.comments.map((c) => ({
        ...c,
        atMs: typeof c.atMs === "number" ? c.atMs : c.at * 1000,
        dependency: c.dependency ?? "INDEPENDENT",
        blockId: null,
        blockType: null,
        interaction: null,
        windowStartMs: null,
        windowEndMs: null,
        confidence: 0.5,
        needsReview: false,
        causality: causalityFor(
          {
            id: "0",
            atMs: typeof c.atMs === "number" ? c.atMs : c.at * 1000,
            author: c.author,
            message: c.message,
            slotId: null,
            blockId: null,
            dependency: "INDEPENDENT",
            confidence: 0.5,
          },
          null,
          String(c.reason ?? ""),
          false,
        ),
        validationAction: null,
        validationRule: null,
        transcriptVersionId: null,
      })),
      report: null,
    };
  }
  const { blocks } = await ensureVersionBlocks(version, { ai: false });
  const durationMs =
    Math.max(
      version.durationSeconds,
      Number(webinar?.video_sources?.duration_seconds ?? 0),
      Number(webinar?.duration_seconds ?? 0),
    ) * 1000;
  // A oferta marcada no editor; sem ela, a lida nos blocos (primeiro bloco de oferta com preço).
  const offerStartMs =
    webinar?.cta_text && webinar?.cta_start_seconds != null
      ? Number(webinar.cta_start_seconds) * 1000
      : offerStartFromBlocks(blocks);
  const slots = planInteractions(blocks, {
    fromMs: 0,
    toMs: durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER,
    participants: input.participants,
    perMinute: input.perMinute,
    offerStartMs,
    hostName: typeof webinar?.host_name === "string" ? webinar.host_name : null,
  });
  return finalizeWithBlocks(input.comments, {
    blocks,
    slots,
    offerStartMs,
    durationMs,
    perMinuteCap: Math.max(12, Math.round(input.perMinute * 2.5)),
    versionId: version.id,
    precisionWord: version.precision === "word",
  });
}
