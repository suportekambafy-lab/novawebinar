/**
 * Escolha do motor de transcrição e armazenamento das versões.
 *
 * Motor único: AssemblyAI → precisão "word". Sem chave configurada não há
 * transcrição — o erro é explícito, nunca se cai noutro motor em silêncio.
 * Versões antigas podem ter precisão "block" ou "estimated"; lêem-se, mas
 * não se criam novas.
 *
 * Nunca se substitui uma versão válida por outra de precisão inferior e
 * nunca se misturam tempos de fornecedores diferentes na mesma versão.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadVideoRef, videoFingerprint } from "@/lib/ai-comments.functions";

import type { TranscriptionProvider } from "./provider";
import { assemblyAiProvider } from "./providers/assemblyai.server";
import { buildSentences } from "./sentences";
import type {
  NormalizedSentence,
  NormalizedTranscription,
  PresenterEvent,
  TemporalSemanticMoment,
  TimestampPrecision,
} from "./types";

const db = supabaseAdmin as any;

/* eslint-disable @typescript-eslint/no-explicit-any */
const PROVIDERS: TranscriptionProvider[] = [assemblyAiProvider];

const PRECISION_RANK: Record<TimestampPrecision, number> = { word: 3, block: 2, estimated: 1 };

export function providerById(id: string): TranscriptionProvider | null {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

/** Motor disponível, ou null quando nenhum está configurado: quem chama decide o erro. */
export function pickProvider(exclude: string[] = []): TranscriptionProvider | null {
  const available = PROVIDERS.filter(
    (provider) => provider.isAvailable() && !exclude.includes(provider.id),
  );
  return available[0] ?? null;
}

/** Razão para o utilizador quando não há motor de transcrição configurado. */
export const NO_PROVIDER_REASON =
  "A transcrição não está configurada: falta a chave AssemblyAI no servidor.";

/** Frases derivadas: das palavras quando existem, senão dos blocos. */
export function sentencesFrom(result: NormalizedTranscription): NormalizedSentence[] {
  if (result.words.length > 0) return buildSentences(result.words);
  return result.blocks.map((block, index) => ({
    id: `b${index + 1}`,
    text: block.text,
    startMs: block.startMs,
    endMs: Math.max(block.endMs, block.startMs),
    wordIndexes: [],
    speakerId: null,
    confidence: null,
  }));
}

export type TranscriptVersion = {
  id: string;
  provider: string;
  providerModel: string;
  precision: TimestampPrecision;
  status: string;
  durationSeconds: number;
  rawText: string;
  words: NormalizedTranscription["words"];
  sentences: NormalizedSentence[];
  moments: TemporalSemanticMoment[];
  events: PresenterEvent[];
  createdAt: string;
  videoFingerprint: string;
  /** Diferença entre o relógio do áudio transcrito e o do player, em ms. */
  mediaTimeOffsetMs: number;
  /** Blocos de fala classificados (ver chat-engine), quando já existem. */
  blocks: unknown[];
};


function toVersion(row: any): TranscriptVersion {
  return {
    id: row.id,
    provider: row.provider,
    providerModel: row.provider_model ?? "",
    precision: row.timestamp_precision as TimestampPrecision,
    status: row.status,
    durationSeconds: row.duration_seconds ?? 0,
    rawText: row.raw_text ?? "",
    words: (row.words ?? []) as NormalizedTranscription["words"],
    sentences: (row.sentences ?? []) as NormalizedSentence[],
    moments: (row.moments ?? []) as TemporalSemanticMoment[],
    events: (row.events ?? []) as PresenterEvent[],
    createdAt: row.created_at,
    videoFingerprint: row.video_fingerprint ?? "",
    mediaTimeOffsetMs: row.media_time_offset_ms ?? 0,
    blocks: Array.isArray(row.blocks) ? row.blocks : [],
  };
}

/** Versão pronta mais precisa deste vídeo, ou null se o vídeo mudou. */
export async function latestReadyVersion(webinarId: string): Promise<TranscriptVersion | null> {
  const current = await videoFingerprint(supabaseAdmin as never, webinarId);
  const { data } = await db
    .from("webinar_transcript_versions")
    .select("*")
    .eq("webinar_id", webinarId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(20);

  const usable = ((data ?? []) as any[])
    .map(toVersion)
    .filter((version) => !version.videoFingerprint || version.videoFingerprint === current.fingerprint)
    .sort((a, b) => PRECISION_RANK[b.precision] - PRECISION_RANK[a.precision]);

  return usable[0] ?? null;
}

export async function createVersion(input: {
  webinarId: string;
  provider: TranscriptionProvider;
  providerJobId: string | null;
}): Promise<string | null> {
  const current = await videoFingerprint(supabaseAdmin as never, input.webinarId);
  if (!current.organizationId) return null;
  const { data } = await db
    .from("webinar_transcript_versions")
    .insert({
      webinar_id: input.webinarId,
      organization_id: current.organizationId,
      video_source_id: current.videoSourceId,
      video_fingerprint: current.fingerprint,
      provider: input.provider.id,
      provider_model: input.provider.model,
      timestamp_precision: input.provider.precision,
      status: "running",
      provider_job_id: input.providerJobId,
    } as never)
    .select("id")
    .maybeSingle();
  return (data as any)?.id ?? null;
}

export async function completeVersion(
  versionId: string,
  result: NormalizedTranscription,
  sentences: NormalizedSentence[],
  precision?: TimestampPrecision,
) {
  await db
    .from("webinar_transcript_versions")
    .update({
      status: "ready",
      duration_seconds: Math.round(result.durationMs / 1000),
      raw_text: result.rawText,
      words: result.words,
      sentences,
      timestamp_precision: precision ?? result.precision,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", versionId);
}

export async function failVersion(versionId: string, reason: string) {
  await db
    .from("webinar_transcript_versions")
    .update({ status: "failed", error: reason, updated_at: new Date().toISOString() } as never)
    .eq("id", versionId);
}

export async function saveVersionAnalysis(
  versionId: string,
  changes: { moments?: TemporalSemanticMoment[]; events?: PresenterEvent[] },
) {
  await db
    .from("webinar_transcript_versions")
    .update({ ...changes, updated_at: new Date().toISOString() } as never)
    .eq("id", versionId);
}

/** Guarda os blocos de fala classificados nesta versão. */
export async function saveVersionBlocks(versionId: string, blocks: unknown[]) {
  await db
    .from("webinar_transcript_versions")
    .update({ blocks, updated_at: new Date().toISOString() } as never)
    .eq("id", versionId);
}

/** A versão é deste webinar? Os ids chegam do cliente e da fila de trabalhos. */
export async function versionBelongsTo(versionId: string, webinarId: string, providerJobId?: string | null) {
  const { data } = await db
    .from("webinar_transcript_versions")
    .select("id, provider_job_id")
    .eq("id", versionId)
    .eq("webinar_id", webinarId)
    .maybeSingle();
  if (!data) return false;
  // O trabalho do fornecedor também vem do cliente: tem de ser o desta versão (senão um id de outra conta
  // trazia a transcrição alheia para este webinar).
  if (providerJobId !== undefined && (data as { provider_job_id: string | null }).provider_job_id !== providerJobId) return false;
  return true;
}

/** Uma versão concreta da transcrição, para causalidade e inspeção. */
export async function loadVersion(versionId: string): Promise<TranscriptVersion | null> {
  const { data } = await db
    .from("webinar_transcript_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  return data ? toVersion(data) : null;
}

/** Relatório de auditoria guardado na própria versão (evidência permanente). */
export async function saveVersionReport(versionId: string, report: unknown) {
  await db
    .from("webinar_transcript_versions")
    .update({ report, updated_at: new Date().toISOString() } as never)
    .eq("id", versionId);
}

/** Endereço do vídeo pronto a enviar ao motor de transcrição. */
export async function resolveMedia(webinarId: string) {
  return loadVideoRef(supabaseAdmin as never, webinarId);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
