/**
 * Dados de inspeção temporal para o editor: palavras, frases, eventos e o
 * relatório de auditoria da versão de transcrição em uso.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SemanticBlock } from "@/lib/chat-engine/types";
import type {
  NormalizedSentence,
  NormalizedWord,
  PresenterEvent,
  TemporalSemanticMoment,
  TimestampPrecision,
} from "@/lib/temporal/types";

export type TranscriptInspection = {
  id: string;
  provider: string;
  providerModel: string;
  precision: TimestampPrecision;
  durationSeconds: number;
  mediaTimeOffsetMs: number;
  words: NormalizedWord[];
  sentences: NormalizedSentence[];
  moments: TemporalSemanticMoment[];
  events: PresenterEvent[];
  /** Blocos de fala classificados pelo motor do chat. */
  blocks: SemanticBlock[];
  report: string | null;
  createdAt: string;
};

export const getTranscriptInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ webinarId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<TranscriptInspection | null> => {
    const { data: row } = await (context.supabase as never as any)
      .from("webinar_transcript_versions")
      .select("*")
      .eq("webinar_id", data.webinarId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) return null;
    return {
      id: row.id,
      provider: row.provider,
      providerModel: row.provider_model ?? "",
      precision: row.timestamp_precision as TimestampPrecision,
      durationSeconds: row.duration_seconds ?? 0,
      mediaTimeOffsetMs: row.media_time_offset_ms ?? 0,
      words: (row.words ?? []) as NormalizedWord[],
      sentences: (row.sentences ?? []) as NormalizedSentence[],
      moments: (row.moments ?? []) as TemporalSemanticMoment[],
      events: (row.events ?? []) as PresenterEvent[],
      blocks: (Array.isArray(row.blocks) ? row.blocks : []) as SemanticBlock[],
      report: row.report ? JSON.stringify(row.report) : null,
      createdAt: row.created_at,
    };
  });
