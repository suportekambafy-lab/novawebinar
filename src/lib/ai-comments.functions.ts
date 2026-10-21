import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertWebinarAccess, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runBilled } from "@/lib/ai/billing.server";
import type { BilledAction } from "@/lib/credits";

/** Acção paga deste webinar: confirma o acesso e cobra o custo real à organização. */
async function billed<T>(
  supabase: any,
  webinarId: string,
  action: BilledAction,
  run: () => Promise<T>,
): Promise<T> {
  const organizationId = await assertWebinarAccess(supabase, webinarId);
  return runBilled({ organizationId, action }, run);
}
import {
  answersForPrompt,
  audienceStateAt,
  densityForSegment,
  momentAt,
  openingSurgeFactor,
  promptsBetween,
  type AnalysisPersona,
  type AnalysisSegment,
  type AudiencePrompt,
  type AudienceStatePoint,
  type EngagementObjective,
  type SemanticMoment,
  type WebinarAnalysis,
} from "@/lib/engagement-analysis";
import {
  buildOpportunities,
  describeOpportunities,
  momentsFromSentences,
  type Opportunity,
} from "@/lib/temporal/opportunities";
import { pickTimestamp } from "@/lib/temporal/windows";
import {
  applyAuditFixes,
  moveTo,
  placeInTimeline,
  syncOffsets,
  type PlacementReport,
} from "@/lib/temporal/placement";
import { AIError, chatJson } from "@/lib/ai/gateway.server";
import { s, schema } from "@/lib/ai/schema";
import { isChatVariant, variantCountries, variantText } from "@/lib/chat-variants";
import { ensureVersionBlocks } from "@/lib/chat-engine/classify.server";
import { describeSlots, offerStartFromBlocks, planInteractions } from "@/lib/chat-engine/plan";
import type { ReferencedItem } from "@/lib/chat-engine/types";
import {
  buildCast,
  describeMember,
  namedPeople,
  serializeCast,
  type CastMember,
} from "@/lib/chat-engine/cast";
import { buildScript, describeScript, type ScriptLine } from "@/lib/chat-engine/script";
import {
  buildProfiles,
  describeProfiles,
  profileByName,
  styleMessage,
  type Profile,
} from "@/lib/chat-engine/profiles";
import { kindFor, placeSlot } from "@/lib/chat-engine/timing";
import type {
  BlockType,
  Dependency,
  InteractionSlot,
  InteractionType,
  SemanticBlock,
} from "@/lib/chat-engine/types";

/**
 * Geração de comentários de engajamento com IA.
 *
 * O fluxo tem duas etapas separadas para que o editor possa mostrar o progresso:
 * 1. A transcrição com tempos por palavra vive em `src/lib/temporal`
 *    (motor AssemblyAI); aqui só se mede o vídeo (`probeWebinarVideo`).
 * 2. `generateEngagementComments` — usa esses momentos (ou o contexto do
 *    webinar, quando não há transcrição possível) para escrever a conversa.
 *
 * Nada é publicado aqui: as funções apenas devolvem dados para revisão.
 */

export type TranscriptSegment = { at: number; text: string };

/* Formas das respostas da IA. Sem valor: "" nos textos e -1 nos segundos. */
const RISK = ["baixo", "moderado", "alto", "critico"] as const;
const EXPECTS = [
  "cidade",
  "sim-nao",
  "palavra-chave",
  "experiencia",
  "duvida",
  "interesse",
  "numero",
  "livre",
] as const;
const AUDIENCE_PROMPT = s.object({
  at: s.integer(),
  ask: s.string(),
  expects: s.string(EXPECTS),
  keyword: s.string(),
  intensity: s.integer(),
});

export const CHAT_COMMENTS = schema("chat_comments", {
  comments: s.array(
    s.object({
      at: s.integer(),
      author: s.string(),
      message: s.string(),
      moment: s.string([
        "chegada",
        "pergunta",
        "prova-social",
        "emocao",
        "explicacao",
        "oferta",
        "humor",
      ]),
      kind: s.string(["provoca", "reage", "responde", "espontaneo"]),
      anchor: s.integer(),
      slot: s.string(),
      reason: s.string(),
    }),
  ),
});

export const TIMELINE_FIXES = schema("timeline_fixes", {
  fixes: s.array(s.object({ index: s.integer(), at: s.integer() })),
});

export const AUDIENCE_PROMPTS = schema("audience_prompts", { prompts: s.array(AUDIENCE_PROMPT) });

const SCORE = ["overall", "retention", "engagement", "clarity", "pace", "offer", "cta"] as const;
export const WEBINAR_ANALYSIS = schema("webinar_analysis", {
  segments: s.array(
    s.object({
      from: s.integer(),
      to: s.integer(),
      kind: s.string(),
      summary: s.string(),
      engagement: s.integer(),
      dropRisk: s.string(RISK),
      emotion: s.integer(),
      density: s.integer(),
      purchaseIntent: s.integer(),
      objection: s.integer(),
      readsChat: s.boolean(),
      hostQuestion: s.string(),
    }),
  ),
  personas: s.array(
    s.object({
      name: s.string(),
      style: s.string(),
      profile: s.string(),
      emojis: s.string(["poucos", "alguns", "muitos"]),
      knowledge: s.string(["iniciante", "intermedio", "experiente"]),
      rhythm: s.string(["observadora", "moderada", "participativa"]),
      arrivalAt: s.integer(),
    }),
  ),
  prompts: s.array(AUDIENCE_PROMPT),
  moments: s.array(
    s.object({
      from: s.integer(),
      to: s.integer(),
      topic: s.string(),
      summary: s.string(),
      novelty: s.integer(),
      reactionUntil: s.integer(),
    }),
  ),
  audienceState: s.array(
    s.object({
      at: s.integer(),
      estimatedAttention: s.integer(),
      estimatedConfusion: s.integer(),
      estimatedExcitement: s.integer(),
      estimatedTrust: s.integer(),
      estimatedPurchaseIntent: s.integer(),
      estimatedObjection: s.integer(),
      chatEnergy: s.integer(),
    }),
  ),
  insights: s.array(
    s.object({
      at: s.integer(),
      level: s.string(["bom", "atencao", "risco"]),
      title: s.string(),
      note: s.string(),
    }),
  ),
  rescue: s.array(
    s.object({
      from: s.integer(),
      to: s.integer(),
      risk: s.string(RISK),
      reason: s.string(),
      suggestions: s.array(s.string()),
    }),
  ),
  score: s.object({
    ...Object.fromEntries(SCORE.map((key) => [key, s.integer()])),
    summary: s.string(),
  }),
});

export const SPEECH_SYNC = schema("speech_sync", {
  comments: s.array(s.object({ id: s.string(), at: s.integer() })),
});

const settingsSchema = z.object({
  variant: z.string().refine(isChatVariant).default("pt-PT"),
  level: z.enum(["low", "medium", "high", "very-high"]).default("medium"),
  participants: z.coerce
    .number()
    .int()
    .catch(25)
    .transform((n) => Math.min(2000, Math.max(3, n)))
    .default(25),
  emojis: z.enum(["low", "normal", "high"]).default("normal"),
  tone: z.enum(["natural", "excited", "professional", "custom"]).default("natural"),
  customTone: z.string().trim().max(400).default(""),
  densityByMoment: z.boolean().default(true),
  /** Segundos médios entre comentários. Zero deixa o ritmo ao nível de engajamento. */
  frequency: z.number().int().min(0).max(300).default(0),
  /** Total aproximado de comentários pedido. Zero deixa ao ritmo automático. */
  targetTotal: z.coerce.number().int().min(0).max(20000).catch(0).default(0),
});

const generateSchema = z.object({
  webinarId: z.string().uuid(),
  settings: settingsSchema,
  transcript: z
    .array(z.object({ at: z.number(), text: z.string() }))
    .max(2000)
    .default([]),
  /** Trecho a cobrir. Sem trecho, cobre o webinar inteiro. */
  range: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).optional(),
  /** Comentários que já existem, para a IA não repetir nem contradizer. */
  existing: z
    .array(z.object({ at: z.number(), author: z.string(), message: z.string() }))
    .default([])
    .transform((list) => (list.length > 5000 ? list.slice(-5000) : list)),
  /** Quantos comentários pedir. Sem valor, é calculado pela duração e nível. */
  count: z.number().int().min(1).max(120).optional(),
});

/**
 * Junta momentos vizinhos até caber no pedido, em vez de deitar fora falas.
 *
 * A transcrição completa pode ser enorme; para a enviar à IA reduzimos o
 * número de linhas agrupando momentos consecutivos — o tempo de início é
 * sempre o real e nenhuma parte do webinar desaparece.
 */
function condenseTranscript(
  segments: TranscriptSegment[],
  maxLines: number,
  maxCharsPerLine = 600,
): TranscriptSegment[] {
  if (segments.length === 0) return [];
  const ordered = [...segments].sort((a, b) => a.at - b.at);
  if (ordered.length <= maxLines) return ordered;

  const groupSize = Math.ceil(ordered.length / maxLines);
  const merged: TranscriptSegment[] = [];
  for (let index = 0; index < ordered.length; index += groupSize) {
    const group = ordered.slice(index, index + groupSize);
    const text = group.map((s) => s.text).join(" ");
    merged.push({
      at: group[0]!.at,
      text: text.length > maxCharsPerLine ? `${text.slice(0, maxCharsPerLine)}…` : text,
    });
  }
  return merged;
}

/* ------------------------------------------------------------------ *
 * Resolução da fonte de vídeo
 *
 * Muitas fontes (Bunny Stream, Panda Video, Vimeo) não servem um MP4
 * direto: servem uma página de player ou um manifesto HLS. Aqui seguimos
 * essa cadeia — página → manifesto → segmentos — para medir a duração
 * real do vídeo (`measureDuration`).
 * ------------------------------------------------------------------ */

const BROWSERISH = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  Accept: "*/*",
};

function withReferer(url: string): Record<string, string> {
  try {
    return { ...BROWSERISH, Referer: new URL(url).origin + "/" };
  } catch {
    return { ...BROWSERISH };
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: withReferer(url) });
  if (!response.ok) throw new Error(`A fonte respondeu ${response.status} ao pedir o vídeo.`);
  return response.text();
}

/** Procura um manifesto HLS ou um MP4 dentro do HTML de uma página de player. */
function findMediaInHtml(html: string, base: string): string | null {
  const cleaned = html.replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const match =
    /https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i.exec(cleaned) ??
    /https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/i.exec(cleaned);
  if (match) return match[0];
  const relative = /["'](\/[^"'\s]+\.m3u8[^"'\s]*)["']/i.exec(cleaned);
  return relative?.[1] ? new URL(relative[1], base).toString() : null;
}

/** De um manifesto principal, escolhe a faixa só de áudio ou a variante mais leve. */
async function pickMediaPlaylist(
  url: string,
  text: string,
): Promise<{ url: string; text: string }> {
  if (!text.includes("#EXT-X-STREAM-INF")) return { url, text };
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA") && /TYPE=AUDIO/i.test(line)) {
      const uri = /URI="([^"]+)"/.exec(line)?.[1];
      if (uri) {
        const target = new URL(uri, url).toString();
        return { url: target, text: await fetchText(target) };
      }
    }
  }

  let best: { bandwidth: number; uri: string } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]!.startsWith("#EXT-X-STREAM-INF")) continue;
    const bandwidth = Number(/BANDWIDTH=(\d+)/.exec(lines[index]!)?.[1] ?? 0);
    const uri = lines[index + 1]?.trim();
    if (uri && !uri.startsWith("#") && (!best || bandwidth < best.bandwidth))
      best = { bandwidth, uri };
  }
  if (!best) throw new Error("O manifesto de vídeo não tem faixas utilizáveis.");
  const target = new URL(best.uri, url).toString();
  return { url: target, text: await fetchText(target) };
}

function parsePlaylist(url: string, text: string) {
  const lines = text.split(/\r?\n/);
  let init: string | null = null;
  let pending = 0;
  const parts: { url: string; duration: number }[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-MAP")) {
      const uri = /URI="([^"]+)"/.exec(line)?.[1];
      if (uri) init = new URL(uri, url).toString();
    } else if (line.startsWith("#EXTINF:")) {
      pending = Number.parseFloat(line.slice(8).replace(",", "")) || 0;
    } else if (!line.startsWith("#")) {
      parts.push({ url: new URL(line, url).toString(), duration: pending || 6 });
      pending = 0;
    }
  }

  if (text.includes("#EXT-X-KEY") && !/METHOD=NONE/i.test(text)) {
    throw new Error("Este vídeo está encriptado (DRM) e não permite transcrição automática.");
  }

  return { init, parts };
}

type VideoRef = {
  url: string | null;
  duration: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadVideoRef(supabase: any, webinarId: string): Promise<VideoRef> {
  const { data: webinar, error } = await supabase
    .from("webinars")
    .select("id, duration_seconds, video_sources(source_url, storage_path, duration_seconds)")
    .eq("id", webinarId)
    .maybeSingle();

  if (error || !webinar) throw new Error("Webinar não encontrado.");

  const source = webinar.video_sources as {
    source_url: string | null;
    storage_path: string | null;
    duration_seconds: number;
  } | null;
  const duration = source?.duration_seconds || webinar.duration_seconds || 0;

  let url = source?.source_url ?? null;
  if (!url && source?.storage_path) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("webinar-videos")
      .createSignedUrl(source.storage_path, 3600);
    url = signed?.signedUrl ?? null;
  }

  return { url, duration };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Soma a duração de todos os segmentos do manifesto: a duração real do vídeo. */
async function measureDuration(url: string): Promise<number> {
  const resolve = async (target: string, depth: number): Promise<number> => {
    if (depth > 3) return 0;
    if (/\.m3u8(\?|$)/i.test(target)) {
      const picked = await pickMediaPlaylist(target, await fetchText(target));
      const { parts } = parsePlaylist(picked.url, picked.text);
      return Math.round(parts.reduce((sum, part) => sum + part.duration, 0));
    }
    const response = await fetch(target, { headers: withReferer(target) });
    if (!response.ok) return 0;
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (type.includes("mpegurl")) {
      const picked = await pickMediaPlaylist(response.url || target, await response.text());
      const { parts } = parsePlaylist(picked.url, picked.text);
      return Math.round(parts.reduce((sum, part) => sum + part.duration, 0));
    }
    if (type.includes("text/html")) {
      const media = findMediaInHtml(await response.text(), response.url || target);
      return media ? resolve(media, depth + 1) : 0;
    }
    return 0;
  };
  return resolve(url, 0);
}

/**
 * Mede o vídeo antes de transcrever e guarda a duração real.
 *
 * Sem este passo, um vídeo de 78 minutos era tratado como tendo 30 e a
 * geração parava a meio.
 */
export async function probeWebinarVideoImpl(supabase: any, data: any) {
  const { url, duration } = await loadVideoRef(supabase, data.webinarId);
  if (!url) return { ok: false as const, duration, reason: "Este webinar ainda não tem vídeo." };

  try {
    const measured = await measureDuration(url);
    if (measured > 0 && measured !== duration) {
      await supabase
        .from("webinars")
        .update({ duration_seconds: measured })
        .eq("id", data.webinarId);
      // Toda a plataforma lê primeiro a duração do vídeo: guardada só no webinar, a sala continuava a usar a
      // do vídeo (errada ou 0) e a sessão acabava antes do fim.
      const { data: row } = await supabase.from("webinars").select("video_source_id").eq("id", data.webinarId).maybeSingle();
      if (row?.video_source_id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("video_sources").update({ duration_seconds: measured }).eq("id", row.video_source_id);
      }
    }
    return { ok: true as const, duration: measured || duration, reason: "" };
  } catch (error) {
    return {
      ok: false as const,
      duration,
      reason: error instanceof Error ? error.message : "Não foi possível medir o vídeo.",
    };
  }
}

const levelPerMinute: Record<string, number> = {
  low: 1.2,
  medium: 2.2,
  high: 3.6,
  "very-high": 5.5,
};

/** Janelas de tempo do chat em relação à fala, iguais em todos os prompts. */
const TIMING = {
  readAloud: "entre 4 e 20 segundos antes",
  answer: "entre 2 e 45 segundos depois",
  react: "entre 3 e 30 segundos depois",
};

const toneLabel: Record<string, string> = {
  natural: "natural e descontraído",
  excited: "entusiasmado e enérgico",
  professional: "profissional e sóbrio",
  custom: "conforme indicado pelo organizador",
};

const emojiLabel: Record<string, string> = {
  low: "raros, no máximo em 1 de cada 5 mensagens",
  normal: "moderados, em cerca de 1 de cada 3 mensagens",
  high: "frequentes, mas nunca em todas as mensagens",
};

/* ------------------------------------------------------------------ *
 * A geração de uma live inteira não cabe numa única chamada ao servidor
 * (a plataforma corta pedidos longos). Por isso o trabalho é dividido em
 * três chamadas curtas, conduzidas pelo navegador:
 *   1. planCommentWindows      — calcula as janelas de tempo a cobrir;
 *   2. generateCommentsWindow  — gera uma janela de cada vez;
 *   3. auditCommentsTimeline   — revisão final da cronologia.
 * ------------------------------------------------------------------ */

type Comment = {
  at: number;
  /** Instante exato em milissegundos, herdado dos tempos por palavra. */
  atMs?: number;
  author: string;
  message: string;
  moment: string;
  /** Relação causal com a fala do apresentador. */
  kind: "provoca" | "reage" | "responde" | "espontaneo";
  /** Segundo da fala do apresentador relacionada, quando existe. */
  anchor: number | null;
  /** Porque é que esta pessoa escreve isto neste segundo. */
  reason?: string;
  /** Oportunidade (janela válida) de onde esta mensagem nasceu. */
  slot?: string | null;
  /** Campos do motor do chat (blocos de fala): quando existem, o instante já é o certo. */
  dependency?: Dependency;
  blockId?: string | null;
  blockType?: BlockType | null;
  interaction?: InteractionType | null;
  windowStartMs?: number | null;
  windowEndMs?: number | null;
  confidence?: number;
  profileId?: string | null;
};

/** O motor do chat para um trecho: oportunidades ligadas aos blocos de fala e as pessoas que escrevem. */
type Engine = {
  slots: InteractionSlot[];
  blocks: SemanticBlock[];
  profiles: Profile[];
  /** Onde a oferta começa: a marcada no editor, ou a lida nos blocos. */
  offerStartMs: number | null;
};

/** O que a IA devolve no Método Nova: só o texto de cada linha do guião. */
export const SCRIPT_LINES = schema("script_lines", {
  lines: s.array(s.object({ id: s.string(), message: s.string() })),
});

/** Uma linha sobre cada pessoa do elenco, escrita uma vez por webinar. */
export const CAST_SITUATIONS = schema("cast_situations", {
  people: s.array(s.object({ id: s.string(), situation: s.string() })),
});

const castMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.enum(["ao", "mz", "br", "pt"]),
  role: z.enum(["publico", "aluna"]),
  arrivalMs: z.number(),
  leaveMs: z.number().nullable(),
  situation: z.string().default(""),
  emoji: z.boolean(),
  mobile: z.boolean(),
  length: z.enum(["curto", "medio", "longo"]),
  typos: z.boolean(),
  activity: z.number(),
});
const castSchema = z.array(castMemberSchema).max(500).optional();

/** Onde a oferta começa: a marcada no editor; sem ela, a lida nos blocos. */
function offerStartOf(webinar: WebinarInfo, blocks: readonly SemanticBlock[]): number | null {
  if (webinar.cta_text && webinar.cta_start_seconds != null) return webinar.cta_start_seconds * 1000;
  return offerStartFromBlocks(blocks);
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * As oportunidades deste trecho, a partir dos blocos de fala guardados na
 * versão da transcrição (feitos agora só com regras, se ainda não existirem).
 */
async function engineForRange(
  webinarId: string,
  from: number,
  to: number,
  settings: Settings,
  webinar: WebinarInfo,
): Promise<Engine | null> {
  try {
    const engine = await import("@/lib/temporal/engine.server");
    const version = await engine.latestReadyVersion(webinarId);
    if (!version || version.precision !== "word" || version.sentences.length === 0) return null;
    const { blocks } = await ensureVersionBlocks(version, { ai: false });
    if (blocks.length === 0) return null;
    const offerStartMs = offerStartOf(webinar, blocks);
    const slots = planInteractions(blocks, {
      fromMs: from * 1000,
      toMs: to * 1000,
      participants: settings.participants,
      perMinute: perMinuteOf(settings),
      offerStartMs,
      hostName: webinar.host_name,
    });
    const profiles = buildProfiles(
      Math.min(400, settings.participants),
      variantCountries(settings.variant),
      hashSeed(webinarId),
    );
    return { slots, blocks, profiles, offerStartMs };
  } catch {
    return null;
  }
}

type WebinarInfo = {
  public_title: string;
  description: string | null;
  duration_seconds: number;
  cta_text: string | null;
  cta_start_seconds: number | null;
  cta_price_now: string | null;
  /** Quem apresenta: o nome dele nunca é alguém do chat. */
  host_name: string | null;
  sourceDuration: number;
};

type Settings = z.infer<typeof settingsSchema>;

type GenContext = {
  webinar: WebinarInfo;
  settings: Settings;
  transcript: TranscriptSegment[];
  duration: number;
  start: number;
  end: number;
  /** Mapa do webinar, quando o modo Inteligente já o construiu. */
  intel?: Intel | undefined;
};

const transcriptSchema = z
  .array(z.object({ at: z.number(), text: z.string() }))
  .max(2000)
  .default([]);
const existingSchema = z
  .array(z.object({ at: z.number(), author: z.string(), message: z.string() }))
  .default([])
  // Nunca rejeitamos por excesso: ficamos com os mais recentes.
  .transform((list) => (list.length > 1500 ? list.slice(-1500) : list));
const boundsSchema = z.object({ start: z.number().int().min(0), end: z.number().int().min(0) });
// A revisão só mexe no instante: todos os outros campos entram e saem intactos.
const fullCommentSchema = z
  .object({
    at: z.number(),
    atMs: z.number().optional(),
    author: z.string(),
    message: z.string(),
    moment: z.string().default("geral"),
    kind: z.enum(["provoca", "reage", "responde", "espontaneo"]).catch("espontaneo"),
    anchor: z.number().int().nullable().catch(null),
    reason: z.string().optional(),
    slot: z.string().nullable().optional(),
    persona: z.string().optional(),
    dependency: z.enum(["BEFORE", "AFTER", "INDEPENDENT"]).optional(),
  })
  .passthrough();

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadWebinar(supabase: any, webinarId: string): Promise<WebinarInfo> {
  const { data: webinar, error } = await supabase
    .from("webinars")
    .select(
      "id, public_title, description, duration_seconds, cta_text, cta_start_seconds, cta_price_now, host_name, video_sources(duration_seconds)",
    )
    .eq("id", webinarId)
    .maybeSingle();

  if (error || !webinar) throw new Error("Webinar não encontrado.");
  const source = webinar.video_sources as { duration_seconds: number } | null;
  return {
    public_title: webinar.public_title,
    description: webinar.description,
    duration_seconds: webinar.duration_seconds,
    cta_text: webinar.cta_text,
    cta_start_seconds: webinar.cta_start_seconds,
    cta_price_now: webinar.cta_price_now,
    host_name: typeof webinar.host_name === "string" ? webinar.host_name : null,
    sourceDuration: source?.duration_seconds || 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Duração do vídeo, que limita todos os instantes gerados.
 *
 * A duração real (do ficheiro ou do webinar) manda. A transcrição só a
 * corrige para cima quando termina depois dela, o que indica metadados
 * errados. Só sem qualquer duração real se estima pela transcrição, com
 * margem, e em último caso pelos 30 minutos.
 */
export function computeDuration(webinar: WebinarInfo, transcript: TranscriptSegment[]): number {
  const transcriptEnd = transcript.reduce((max, s) => Math.max(max, s.at), 0);
  const real = Math.max(webinar.sourceDuration || 0, webinar.duration_seconds || 0);
  if (real > 0) return Math.max(real, transcriptEnd);
  if (transcriptEnd > 0) return transcriptEnd + 60;
  return 1800;
}

/** Limites de geração: nunca depois do fim do vídeo. */
function computeBounds(range: { start: number; end: number } | undefined, duration: number) {
  const start = Math.max(0, Math.min(range?.start ?? 0, duration));
  const end = Math.max(start, Math.min(duration, Math.max(start + 30, range?.end ?? duration)));
  return { start, end };
}

/** Fim efectivo de uma janela: o pedido pelo cliente, mas nunca depois do vídeo. */
function boundedEnd(bounds: { start: number; end: number }, duration: number) {
  return Math.max(bounds.start, Math.min(bounds.end, duration));
}

function perMinuteOf(settings: Settings): number {
  return settings.frequency > 0 ? 60 / settings.frequency : (levelPerMinute[settings.level] ?? 2.2);
}

/** Contexto de inteligência do modo Inteligente: mapa, personas e objetivo. */
type Intel = {
  objective: EngagementObjective;
  segments: AnalysisSegment[];
  personas: AnalysisPersona[];
  prompts?: AudiencePrompt[];
  moments?: SemanticMoment[];
  audienceState?: AudienceStatePoint[];
};

function intelBrief(intel: Intel | undefined, from: number, to: number): string[] {
  if (!intel) return [];
  const here = intel.segments.filter((s) => s.to >= from - 30 && s.from <= to + 30);
  if (here.length === 0) return [];

  const objectiveLine: Record<EngagementObjective, string> = {
    retention:
      "OBJETIVO: RETENÇÃO. Nos trechos de risco, crie interações que dão motivo para ficar (curiosidade, promessa do que vem a seguir, validação de que vale a pena). Não encha o chat: bastam intervenções certeiras.",
    engagement:
      "OBJETIVO: ENGAJAMENTO. Privilegie conversas entre participantes, respostas às perguntas do apresentador e reações genuínas.",
    conversion:
      "OBJETIVO: CONVERSÃO. Prepare o terreno para a oferta: dúvidas legítimas antes do preço, objeções tratadas com naturalidade, entusiasmo credível depois do CTA.",
    balanced: "OBJETIVO: EQUILIBRADO. Misture retenção, conversa e preparação da oferta.",
  };

  // Cada janela conhece o webinar inteiro antes de escrever: percurso global,
  // chamadas diretas do princípio ao fim e só depois o detalhe do trecho.
  const outline = intel.segments.map(
    (s) => `${s.from}-${s.to}s · ${s.kind} · ${s.summary} · risco ${s.dropRisk}`,
  );
  const allPrompts = (intel.prompts ?? []).map(
    (p) => `${p.at}s · "${p.ask}" (espera ${p.expects})`,
  );

  return [
    "",
    objectiveLine[intel.objective],
    ...(outline.length
      ? ["PERCURSO COMPLETO DO WEBINAR (contexto global — do início ao fim):", ...outline]
      : []),
    ...(allPrompts.length
      ? [
          "TODAS AS CHAMADAS DIRETAS AO PÚBLICO DO WEBINAR, com o segundo real em que acontecem (só responde às que caem neste trecho; as outras servem para não gastar antes as mensagens que pertencem a elas):",
          ...allPrompts,
        ]
      : []),
    "MAPA DESTE TRECHO (dados internos — nunca os mencione nas mensagens):",
    ...here.map(
      (s) =>
        `${s.from}-${s.to}s · ${s.kind} · ${s.summary} · potencial ${s.engagement}/100 · risco de abandono ${s.dropRisk} · emoção ${s.emotion}/100 · densidade de informação ${s.density}/100 · intenção de compra ${s.purchaseIntent}/100 · objeção ${s.objection}/100${s.hostQuestion ? ` · pergunta ao público: "${s.hostQuestion}"` : ""}${s.readsChat ? " · o apresentador lê o chat aqui" : ""}`,
    ),
    here.some((s) => s.dropRisk === "alto" || s.dropRisk === "critico")
      ? "Há risco alto de abandono aqui: não despeje mensagens. Escreva poucas intervenções que segurem a atenção (reconhecer que a parte é importante, pedir um exemplo, mostrar que valeu a pena ficar), sempre com palavras diferentes umas das outras."
      : "",
    here.some((s) => s.density >= 70)
      ? "Trecho denso de informação: deixe silêncio. Menos mensagens do que o habitual."
      : "",
    intel.personas.length
      ? [
          "PESSOAS DESTA SESSÃO (use estes nomes; cada uma mantém o seu jeito e a sua história, sem se contradizer):",
          ...intel.personas.map((p) => {
            const arrival = (p.arrivalAt ?? 0) > 0 ? ` · entra na sala ~${p.arrivalAt}s` : "";
            return `- ${p.name} · ${p.style} · nível ${p.knowledge ?? "iniciante"} · ritmo ${p.rhythm ?? "moderada"} · ${p.profile} · emojis ${p.emojis}${arrival}`;
          }),
          "Pode acrescentar poucos nomes novos para dar variedade, mas a maioria das mensagens vem destas pessoas.",
          "RITMO PRÓPRIO: uma pessoa observadora quase só aparece quando tem uma dúvida; uma moderada comenta de vez em quando; uma participativa envolve-se em chamadas e conversas. Ninguém escreve muitas vezes seguidas em poucos minutos — respeite o descanso entre mensagens da mesma pessoa.",
          'NÍVEL DE CONHECIMENTO muda a leitura do mesmo conteúdo: o iniciante faz perguntas de base ("preciso de muito dinheiro para começar?"), o intermédio compara com o que já tentou, o experiente faz perguntas técnicas ou aponta nuances.',
          "EVOLUÇÃO: cada pessoa tem um estado que muda ao longo do webinar (cética → curiosa → interessada; confusa → esclarecida; entusiasmada → hesitante no preço). Mensagens da mesma pessoa em momentos diferentes devem refletir essa evolução.",
          'MEMÓRIA DO QUE JÁ FOI EXPLICADO: ninguém pergunta aos 35 minutos exatamente aquilo que o apresentador esclareceu aos 15 — salvo se for plausível não ter percebido, e aí a pergunta mostra isso ("desculpa, fiquei na dúvida outra vez").',
          'CHEGADAS TARDIAS: quem entra depois do início pode dizer "cheguei agora, perdi muita coisa?" ou "começou há muito?" — com moderação, e nunca antes do seu segundo de entrada.',
          'IMPERFEIÇÃO HUMANA: nem toda a mensagem parece escrita com cuidado. Algumas têm minúsculas, abreviações e construções informais próprias da variante ("simmm", "entendi agr", "mt bom"), conforme a pessoa. Sem exagerar e sem erros caricatos.',
          'Construa um ou dois fios curtos de conversa entre elas (pergunta → resposta de concordância tipo "também queria saber" → seguimento), ligados ao que está a acontecer. Duas ou três mensagens chegam; não transforme o chat num fórum.',
          "Nem toda a pergunta tem resposta de outra pessoa e nem toda a chamada tem dezenas de respostas. Algumas mensagens ficam simplesmente ali.",
        ].join("\n")
      : "",
  ].filter(Boolean);
}

/**
 * Chamadas diretas à audiência (AUDIENCE_PROMPT).
 *
 * Quando o apresentador pergunta alguma coisa ao público ou pede que escrevam
 * algo no chat, esse é o momento de maior prioridade de engajamento: tem de
 * nascer um pequeno pico de respostas logo a seguir, nunca antes.
 */
function promptBrief(
  intel: Intel | undefined,
  from: number,
  to: number,
  participants: number,
): string[] {
  const all = intel?.prompts ?? [];
  if (all.length === 0) return [];
  const here = promptsBetween(all, from, to);
  const soon = all.filter((p) => p.at > to && p.at <= to + 120);
  if (here.length === 0 && soon.length === 0) return [];

  const lines: string[] = [
    "",
    "Chamadas diretas à audiência neste trecho. Num chat real são o que mais gera mensagens, por isso, se o número de mensagens do trecho não chegar para tudo, as respostas a estas chamadas vêm primeiro:",
  ];

  for (const prompt of here) {
    const answers = answersForPrompt(prompt, participants);
    lines.push(
      `- ${prompt.at}s o apresentador pede: "${prompt.ask}" · resposta esperada: ${prompt.expects}${prompt.keyword ? ` · palavra pedida: "${prompt.keyword}"` : ""} · escreva cerca de ${answers} respostas com kind "responde" e anchor ${prompt.at}.`,
    );
  }

  if (here.length > 0) {
    lines.push(
      "Como se comporta um chat real aqui: a primeira resposta chega 2 a 6 segundos depois da pergunta e as restantes espalham-se de forma irregular até cerca de 45 segundos, com intervalos diferentes entre si (às vezes duas quase juntas, às vezes uma pausa maior).",
      "As respostas não podem ter todas o mesmo formato: umas só a cidade, outras cidade e país, outras com emoji, outras com uma frase curta, alguém que responde ao lado ou pergunta outra coisa a seguir. Nada de listas iguais nem de ordem alfabética.",
      'Quando o apresentador pede uma palavra exata ("escreve EU", "põe SIM"), a maioria escreve mesmo essa palavra, com variações naturais de maiúsculas, pontuação e emoji, e alguns acrescentam uma frase curta.',
      "Quanto mais explícito é o pedido, mais gente responde. Um pedido claro nunca pode ficar quase sem respostas.",
    );
  }

  if (soon.length > 0) {
    lines.push(
      ...soon.map(
        (prompt) =>
          `- Aos ${prompt.at}s (já a seguir a este trecho) o apresentador vai pedir: "${prompt.ask}". Guarde esse tipo de mensagem para depois: aqui no máximo uma ou duas pessoas podem adiantar-se; a maior parte das respostas pertence ao momento da pergunta.`,
      ),
    );
  }

  return lines;
}

/* ------------------------------------------------------------------ *
 * A jornada humana da live
 *
 * O chat não reage só a frases: acompanha a experiência de estar numa
 * sala ao vivo. Chegada → expectativa → apresentação → conexão →
 * conteúdo → perguntas → descobertas → dúvidas → prova → oferta →
 * objeções → decisão → CTA → encerramento.
 * ------------------------------------------------------------------ */

type JourneyPhase =
  | "chegada"
  | "abertura"
  | "conexao"
  | "conteudo"
  | "prova"
  | "oferta"
  | "objecoes"
  | "cta"
  | "encerramento";

const PHASE_BEHAVIOUR: Record<JourneyPhase, string> = {
  chegada:
    "CHEGADA. As pessoas acabaram de entrar e ainda ninguém explicou nada. Só cabem cumprimentos, sinais de presença e perguntas sobre o som ou a imagem, curtos e cada um à maneira da pessoa. Nada de opiniões sobre o conteúdo, nada de perguntas técnicas, nada de dizer de onde são (isso só acontece se o apresentador pedir).",
  abertura:
    "EXPECTATIVA E APRESENTAÇÃO. Continuam a chegar pessoas e começa a expectativa ligada ao tema real deste webinar: o que esperam levar de hoje, porque se inscreveram, o que já tentaram antes. Frases simples e pessoais, sem jargão e sem elogiar o que ainda não viram.",
  conexao:
    "CONEXÃO. O apresentador conta quem é ou a sua história. Aparecem identificação, empatia e pequenas partilhas de quem se revê naquilo. Poucas mensagens, mas sentidas.",
  conteudo:
    "CONTEÚDO. A audiência está a ouvir. O chat fica mais calmo: perguntas coerentes com o que acabou de ser dito, pedidos de repetir um ponto, algum 'anotando'. Nas partes técnicas há silêncio — é normal e desejável.",
  prova:
    "DESCOBERTA E PROVA. Algo importante foi mostrado ou revelado. Surgem reações genuínas, surpresa, dúvidas sobre como aquilo se aplica ao caso de cada um. Nunca inventar resultados próprios como se fossem reais.",
  oferta:
    "OFERTA. Curiosidade sobre o que está incluído, como funciona, quanto tempo demora, se serve para quem está a começar. Perguntas, não publicidade.",
  objecoes:
    "PREÇO E OBJEÇÕES. Perguntas de preço, parcelamento, garantia, tempo disponível, se funciona no meu país. Algumas pessoas demonstram que a resposta do apresentador resolveu a dúvida. Tudo em linguagem normal, sem parecer argumentário de vendas.",
  cta: "DECISÃO E CTA. Maior intenção e perguntas práticas de quem está a decidir. NUNCA inventar compras feitas, pagamentos, prints, testemunhos ou resultados como se fossem reais.",
  encerramento:
    "ENCERRAMENTO. Agradecimentos, despedidas, últimas dúvidas rápidas, pedidos de replay. O ritmo cai.",
};

/** Em que fase da experiência está este segundo do webinar. */
function phaseAt(ctx: GenContext, seconds: number): JourneyPhase {
  const duration = Math.max(60, ctx.duration);
  const cta = ctx.webinar.cta_start_seconds ?? null;
  const fraction = seconds / duration;

  if (seconds <= 90) return "chegada";
  if (seconds <= 300) return "abertura";

  const segment = ctx.intel?.segments.find((s) => seconds >= s.from && seconds <= s.to);
  const kind = (segment?.kind ?? "").toLowerCase();
  if (kind.includes("abert") || kind.includes("boas")) return "abertura";
  if (kind.includes("histor") || kind.includes("conex")) return "conexao";
  if (kind.includes("prova") || kind.includes("caso") || kind.includes("demonstr")) return "prova";
  if (kind.includes("preco") || kind.includes("preço") || kind.includes("objec")) return "objecoes";
  if (kind.includes("cta") || kind.includes("inscri") || kind.includes("fecho")) return "cta";
  if (kind.includes("oferta")) return "oferta";
  if (kind.includes("encerr") || kind.includes("despedida")) return "encerramento";

  if (cta !== null && cta > 0) {
    if (seconds >= cta + 600) return "cta";
    if (seconds >= cta + 180) return "objecoes";
    if (seconds >= cta) return "oferta";
  }
  if (fraction >= 0.95) return "encerramento";
  if (fraction >= 0.85) return "cta";
  if (fraction >= 0.7) return "oferta";
  if (fraction >= 0.55) return "prova";
  return "conteudo";
}

/** Instruções de comportamento humano para as fases que esta janela atravessa. */
function journeyBrief(ctx: GenContext, from: number, to: number): string[] {
  const phases: JourneyPhase[] = [];
  for (let second = from; second <= to; second += 30) {
    const phase = phaseAt(ctx, second);
    if (!phases.includes(phase)) phases.push(phase);
  }
  const last = phaseAt(ctx, to);
  if (!phases.includes(last)) phases.push(last);

  const lines = [
    "",
    "FASE DA EXPERIÊNCIA (o chat muda com a jornada da sala, não só com a frase dita):",
    ...phases.map((phase) => `- ${PHASE_BEHAVIOUR[phase]}`),
  ];

  if (phases.includes("chegada") || phases.includes("abertura")) {
    lines.push(
      `A expectativa tem de ser deste webinar em concreto ("${ctx.webinar.public_title}") e do problema que estas pessoas querem resolver — não frases genéricas de motivação copiadas umas das outras.`,
      "Ninguém diz de onde está a assistir enquanto o apresentador não pedir. Se o pedido vier mais tarde, é lá que essas mensagens pertencem.",
    );
  }
  return lines;
}

/* ------------------------------------------------------------------ *
 * Reação ao conteúdo
 *
 * O terceiro comportamento humano, a par do espontâneo e da resposta ao
 * apresentador: reagir ao que acabou de ser explicado, revelado ou
 * contado — sempre depois de a ideia fechar e sempre sobre ela.
 * ------------------------------------------------------------------ */

/** Quando é que a ideia dita neste segundo fecha o suficiente para alguém reagir. */
function ideaEndsAt(ctx: GenContext, anchor: number): number {
  // Com o mapa semântico, a ideia fecha no fim do momento que a contém —
  // uma ideia pode começar aos 10:20 e só fechar aos 10:48.
  const moment = momentAt(ctx.intel?.moments, anchor);
  if (moment) return moment.to;
  const next = ctx.transcript.find((s) => s.at > anchor + 2);
  if (!next) return anchor + 8;
  return Math.min(anchor + 45, Math.max(anchor + 4, next.at));
}

/**
 * Momentos semânticos desta janela: ideias completas, com o ponto onde
 * fecham e a novidade de cada uma. A reação vem depois da conclusão.
 */
function momentsBrief(ctx: GenContext, from: number, to: number): string[] {
  const moments = ctx.intel?.moments ?? [];
  if (moments.length === 0) return [];
  const here = moments.filter((m) => m.to >= from - 60 && m.from <= to);
  if (here.length === 0) return [];

  return [
    "",
    "MOMENTOS DESTE TRECHO (ideias completas, com início e fim — a reação nasce DEPOIS de a ideia fechar, espalhada até ao fim da janela de reação):",
    ...here.map(
      (m) =>
        `- ${m.from}-${m.to}s · ${m.topic} · ${m.summary} · novidade ${m.novelty}/100 · reações naturais entre ${m.to + 3}s e ${m.reactionUntil}s`,
    ),
    'NOVIDADE manda na intensidade: um momento verdadeiramente novo ou importante merece mais "não sabia disso", "agora percebi", "isso muda muita coisa"; conteúdo trivial quase não merece reação.',
    'DIVERSIDADE DE REAÇÃO: um momento forte não move a sala inteira na mesma direção. A mesma explicação pode convencer uma pessoa, deixar outra com dúvidas e não dizer nada a uma terceira. Nunca faça todos "ficarem convencidos" ao mesmo tempo.',
  ];
}

/**
 * Estado coletivo ESTIMADO da audiência nesta janela. É a leitura do modelo
 * sobre a psicologia da sala — uma tendência, nunca uma regra individual.
 */
function audienceCurveBrief(ctx: GenContext, from: number, to: number): string[] {
  const state = ctx.intel?.audienceState ?? [];
  if (state.length === 0) return [];
  const entry = audienceStateAt(state, from);
  const exit = audienceStateAt(state, to);
  if (!entry) return [];

  const fmt = (p: AudienceStatePoint) =>
    `atenção ~${p.estimatedAttention} · confusão ~${p.estimatedConfusion} · entusiasmo ~${p.estimatedExcitement} · confiança ~${p.estimatedTrust} · intenção de compra ~${p.estimatedPurchaseIntent} · objeção ~${p.estimatedObjection} · energia do chat ~${p.chatEnergy}`;

  const lines = [
    "",
    "ESTADO COLETIVO ESTIMADO DA SALA (leitura aproximada do modelo — não são factos nem regras para cada pessoa):",
    `- entrada do trecho (${entry.at}s): ${fmt(entry)}`,
  ];
  if (exit && exit.at !== entry.at) {
    lines.push(`- fim do trecho (${exit.at}s): ${fmt(exit)}`);
    lines.push(
      "Faça o chat acompanhar esta evolução: confusão a subir pede perguntas de esclarecimento; confiança a subir permite validações; objeção a subir traz dúvidas de preço, garantia e aplicação ao próprio caso.",
    );
  }
  lines.push(
    "É uma tendência coletiva: num mesmo segundo há quem esteja convencido, quem duvide e quem esteja indiferente. O estado nunca obriga todas as pessoas a reagir da mesma maneira.",
  );
  return lines;
}

function reactionBrief(ctx: GenContext, from: number, to: number): string[] {
  const here = ctx.transcript.filter((s) => s.at >= from - 30 && s.at <= to);
  if (here.length === 0) return [];

  return [
    "",
    "REAÇÃO AO CONTEÚDO (o segundo grande motor do chat, a par dos cumprimentos e das respostas ao apresentador):",
    "Procure neste trecho as afirmações, explicações, revelações, exemplos, erros comuns e histórias com potencial real de provocar reação. Só aí nascem reações.",
    'Cada reação tem de nascer de uma ideia concreta que acabou de ser dita e tem de se perceber, pela mensagem, que a pessoa estava mesmo a acompanhar. Prefira sempre a reação específica à frase genérica: em vez de "Muito bom", algo como "Essa parte da margem eu não sabia" ou "Então dá para começar sem experiência?" — mas só se isso tiver mesmo sido explicado.',
    "A intensidade acompanha o que foi dito: uma explicação básica pede no máximo um sinal de que se percebeu; algo surpreendente, espanto; algo complexo bem explicado, alívio por ter percebido; uma história pessoal, identificação; um erro comum, reconhecimento com humor; uma oportunidade, uma mudança de perspetiva. Cada pessoa di-lo com as suas palavras, na variante pedida.",
    'Pessoas diferentes reagem de maneiras diferentes ao mesmo momento: entusiasmo, descoberta, identificação, curiosidade (uma pergunta), reflexão, ação ("já anotei"). Nunca ponha cinco pessoas a escrever variações de "Muito bom 🔥" ao mesmo tempo; no máximo uma mensagem curta de elogio por momento, e mesmo essa só se houver motivo.',
    "TEMPO DA REAÇÃO: ninguém reage enquanto a ideia ainda está a ser dita. Conte a partir do momento em que a frase fecha e espalhe as reações de forma irregular a seguir (por exemplo, 3s, 6s, 12s depois), nunca todas juntas e nunca antes.",
  ];
}

/**
 * Estado da audiência no início da janela: o que o motor pesa antes de
 * escolher cada mensagem. A pergunta deixa de ser "que frase combina com
 * isto?" e passa a ser "o que seria natural esta pessoa fazer agora?".
 */
function audienceStateBrief(
  ctx: GenContext,
  from: number,
  to: number,
  already: { at: number; author: string; message: string }[],
): string[] {
  const spoken = ctx.transcript.filter((s) => s.at <= from).slice(-2);
  const segment = ctx.intel?.segments.find((s) => from >= s.from && from <= s.to);
  const prompts = ctx.intel?.prompts ?? [];
  const activePrompt = [...prompts]
    .filter((p) => p.at <= from && p.at >= from - 60)
    .sort((a, b) => b.at - a.at)[0];
  const recent = already
    .filter((c) => c.at <= from && c.at >= from - 180)
    .slice(-6)
    .map((c) => `${c.at}s ${c.author}: ${c.message}`);
  const lastAt = already.reduce((max, c) => (c.at <= from ? Math.max(max, c.at) : max), -1);

  return [
    "",
    "ESTADO DA AUDIÊNCIA À ENTRADA DESTE TRECHO:",
    `- fase da experiência: ${phaseAt(ctx, from)} (no fim do trecho: ${phaseAt(ctx, to)})`,
    spoken.length
      ? `- última fala do apresentador: ${spoken.map((s) => `${s.at}s "${s.text.slice(0, 200)}"`).join(" · ")}`
      : "- última fala do apresentador: ainda não começou",
    activePrompt
      ? `- pergunta ativa: aos ${activePrompt.at}s pediu "${activePrompt.ask}" — ainda está a receber respostas`
      : "- pergunta ativa: nenhuma (ninguém foi chamado a responder; não invente respostas)",
    segment
      ? `- assunto atual: ${segment.summary} · energia ${segment.engagement}/100 · risco de abandono ${segment.dropRisk}`
      : "- assunto atual: seguir a transcrição deste trecho",
    recent.length
      ? `- histórico recente do chat:\n  ${recent.join("\n  ")}`
      : "- o chat está calado",
    lastAt >= 0
      ? `- tempo desde a última mensagem: ${Math.max(0, from - lastAt)}s`
      : "- ainda não houve mensagens nesta sessão",
  ].filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Regra de causalidade determinística
 *
 * O motor conhece o webinar inteiro; as pessoas simuladas não conhecem o
 * futuro. Tudo o que antecipa uma pergunta ou um acontecimento que ainda
 * não houve é reposicionado ou eliminado.
 * ------------------------------------------------------------------ */

const LOCATION_HINT =
  /(\b(s[ãa]o paulo|rio de janeiro|belo horizonte|porto alegre|curitiba|salvador|bras[ií]lia|fortaleza|recife|manaus|goi[âa]nia|campinas|lisboa|porto|braga|coimbra|faro|set[úu]bal|montijo|leiria|aveiro|funchal|luanda|maputo|praia|bissau)\b)|(\baqui de\b|\bdireto de\b|\bassistindo de\b|\bfalando de\b|\bestou de\b|\ba assistir de\b|\bdaqui d[eo]\b)/i;

function isLocationish(message: string) {
  const clean = message.trim();
  if (clean.length > 60) return false;
  return LOCATION_HINT.test(clean);
}

function normalizeWord(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * Remove ou reposiciona mensagens que antecipam a causa: dizer a cidade
 * antes de alguém a perguntar, escrever a palavra pedida antes do pedido,
 * comentar a oferta antes de ela existir.
 */
function stripAnticipations(ctx: GenContext, list: Comment[]): Comment[] {
  const prompts = ctx.intel?.prompts ?? [];
  const locationPrompts = prompts
    .filter((p) => /cidade|local|onde|pais|país/i.test(`${p.expects} ${p.ask}`))
    .sort((a, b) => a.at - b.at);
  const firstLocation = locationPrompts[0]?.at ?? null;

  const keyworded = prompts
    .filter((p) => p.keyword && p.keyword.trim().length > 0)
    .map((p) => ({ at: p.at, key: normalizeWord(p.keyword) }))
    .filter((p) => p.key.length > 0);

  const kept: Comment[] = [];
  let earlyLocation = 0;

  for (const comment of list) {
    // Cidade antes de a cidade ser pedida.
    if (isLocationish(comment.message) && comment.kind !== "responde") {
      if (firstLocation !== null && comment.at < firstLocation) continue;
      if (firstLocation === null) {
        earlyLocation += 1;
        if (earlyLocation > 2) continue;
      }
    }

    // Palavra pedida ("EU", "SIM") escrita antes do pedido.
    const word = normalizeWord(comment.message);
    const match = keyworded.find((p) => p.key === word);
    if (match && comment.at < match.at + 2) {
      if (match.at > ctx.end) continue;
      comment.at = Math.min(ctx.end, match.at + 3 + Math.floor(Math.random() * 25));
      comment.kind = "responde";
      comment.anchor = match.at;
    }

    kept.push(comment);
  }

  return kept;
}

/**
 * Memória da sessão: o que cada pessoa já disse até agora, para ninguém se
 * contradizer (quem disse que está a começar não pode ter cinco anos de casa).
 */
function memoryBrief(
  intel: Intel | undefined,
  already: { at: number; author: string; message: string }[],
): string[] {
  if (!intel || already.length === 0) return [];
  const byAuthor = new Map<string, string[]>();
  for (const comment of already) {
    const list = byAuthor.get(comment.author) ?? [];
    list.push(`${comment.at}s "${comment.message}"`);
    byAuthor.set(comment.author, list);
  }
  const lines = [...byAuthor.entries()]
    .filter(([, list]) => list.length > 0)
    .slice(0, 30)
    .map(([author, list]) => `- ${author}: ${list.slice(-3).join(" · ")}`);
  if (lines.length === 0) return [];
  return [
    "",
    "MEMÓRIA DA SESSÃO (o que cada pessoa já disse). Nunca contradiga o estágio, a experiência, a cidade, a opinião ou as perguntas anteriores de cada uma:",
    ...lines,
  ];
}

/**
 * Coloca as mensagens de uma janela nas oportunidades do motor: o tempo das
 * dependentes é do sistema (antes da leitura, depois da fala), o autor das
 * lidas é o nome que o apresentador diz, e cada pessoa escreve ao seu estilo.
 */
function placeWithEngine(raw: Comment[], engine: Engine, from: number, to: number): Comment[] {
  const slotById = new Map(engine.slots.map((slot) => [slot.id, slot] as const));
  const groups = new Map<string, Comment[]>();
  const free: Comment[] = [];
  for (const comment of raw) {
    const slot = comment.slot ? slotById.get(comment.slot) : null;
    if (!slot) {
      free.push({
        ...comment,
        slot: null,
        kind: "espontaneo",
        anchor: null,
        dependency: "INDEPENDENT",
      });
      continue;
    }
    groups.set(slot.id, [...(groups.get(slot.id) ?? []), comment]);
  }
  const out: Comment[] = [];
  const expects = (slot: InteractionSlot) =>
    slot.blockType === "QUESTION_TO_AUDIENCE" ||
    slot.blockType === "COMMENT_REQUEST" ||
    slot.blockType === "FEEDBACK_REQUEST" ||
    slot.blockType === "POLL";
  for (const [slotId, list] of groups) {
    const slot = slotById.get(slotId)!;
    let group = list.slice(0, slot.maxComments);
    if (slot.dependency === "BEFORE") {
      // A mensagem lida é de quem o apresentador diz, pela ordem em que ele lê.
      const names = slot.referenced.filter((r) => r.kind === "name").map((r) => r.name!);
      if (names.length > 0) {
        const unused = [...names];
        group = group.map((comment) => {
          const index = unused.findIndex(
            (n) =>
              n.split(" ")[0]!.toLocaleLowerCase("pt") ===
              comment.author.split(" ")[0]!.toLocaleLowerCase("pt"),
          );
          if (index >= 0) {
            unused.splice(index, 1);
            return comment;
          }
          const name = unused.shift();
          return name ? { ...comment, author: name } : comment;
        });
      }
    }
    const times = placeSlot(slot, group.length, hashSeed(`${slotId}:${from}`));
    group.forEach((comment, index) => {
      const atMs = Math.max(
        from * 1000,
        Math.min(to * 1000 + 999, times[index] ?? slot.windowStartMs),
      );
      out.push({
        ...comment,
        at: Math.round(atMs / 1000),
        atMs,
        kind: kindFor(slot.dependency, expects(slot)),
        anchor: Math.round(
          (slot.dependency === "BEFORE" ? slot.blockStartMs : slot.blockEndMs) / 1000,
        ),
        dependency: slot.dependency,
        blockId: slot.blockId,
        blockType: slot.blockType,
        interaction: slot.interaction,
        windowStartMs: slot.windowStartMs,
        windowEndMs: slot.windowEndMs,
        confidence: slot.confidence,
        reason: comment.reason || slot.reason,
      });
    });
  }
  return [...out, ...free]
    .map((comment, index) => {
      const profile = profileByName(engine.profiles, comment.author);
      return profile
        ? {
            ...comment,
            profileId: profile.id,
            message: styleMessage(profile, comment.message, index),
          }
        : comment;
    })
    .sort((a, b) => (a.atMs ?? a.at * 1000) - (b.atMs ?? b.at * 1000));
}

async function askWindow(
  ctx: GenContext,
  from: number,
  to: number,
  howMany: number,
  already: { at: number; author: string; message: string }[],
  intel?: Intel,
  slots?: Opportunity[],
  engine?: Engine | null,
): Promise<Comment[]> {
  const { webinar, settings, duration } = ctx;
  // Com o motor dos blocos, o número de mensagens é o das oportunidades, não um alvo cego.
  const engineSlots = engine?.slots ?? [];
  if (engineSlots.length > 0) {
    howMany = Math.max(
      1,
      Math.min(
        250,
        engineSlots.reduce((sum, slot) => sum + slot.maxComments, 0),
      ),
    );
  }
  // Contexto com o mapa do webinar, para a jornada e o estado da audiência.
  const view: GenContext = intel ? { ...ctx, intel } : ctx;
  // A janela recebe a transcrição literal do seu intervalo (com margem), já
  // depois de a IA conhecer o webinar inteiro através do mapa global.
  const transcript = condenseTranscript(
    ctx.transcript.filter((s) => s.at >= from - 90 && s.at <= to + 90),
    200,
    500,
  );
  const existing = already
    .filter((c) => c.at >= from - 240 && c.at <= to + 120)
    .slice(-60)
    .map((c) => `${c.at}s ${c.author}: ${c.message}`)
    .join("\n");

  const tone =
    settings.tone === "custom" && settings.customTone
      ? settings.customTone
      : toneLabel[settings.tone];

  const prompt = [
    `Webinar: "${webinar.public_title}".`,
    webinar.description ? `Descrição: ${webinar.description}` : "",
    webinar.cta_text
      ? `Oferta "${webinar.cta_text}"${webinar.cta_price_now ? ` por ${webinar.cta_price_now}` : ""} apresentada ao segundo ${webinar.cta_start_seconds ?? 0}.`
      : "",
    `Duração total: ${duration} segundos. Cobrir apenas do segundo ${from} ao segundo ${to}.`,
    "",
    transcript.length
      ? `Transcrição da apresentação (segundo aproximado → fala):\n${transcript.map((s) => `${s.at}s: ${s.text}`).join("\n")}`
      : "Não há transcrição disponível. Baseie-se no título, descrição e oferta para imaginar o percurso da apresentação.",
    "",
    existing
      ? `Comentários que já existem e NÃO podem ser repetidos nem contrariados:\n${existing}`
      : "",
    "",
    `Escreva até ${howMany} comentários de chat de espectadores, com tom ${tone}.`,
    variantText(settings.variant),
    engineSlots.length > 0
      ? `As pessoas do chat são as da lista PESSOAS DO CHAT abaixo (use exactamente esses nomes em "author"), com repetições naturais de quem fala mais.`
      : `Use cerca de ${settings.participants} pessoas diferentes, com nome e apelido plausíveis do país de cada pessoa e repetições naturais de quem fala mais.`,
    `Emojis ${emojiLabel[settings.emojis]}.`,
    settings.densityByMoment
      ? "Densidade variável: concentre muitas reações nas perguntas diretas, provas sociais, histórias, momentos emocionais e na oferta; deixe as partes técnicas quase silenciosas."
      : "Distribua os comentários de forma regular ao longo do tempo.",
    from <= 60
      ? "Este trecho é a chegada à sala: cumprimentos curtos, sinais de presença e expectativa ligada ao tema. Ninguém diz ainda de onde está a assistir: isso só acontece quando o apresentador pedir."
      : "",
    from < 360
      ? "Os primeiros minutos são o momento de maior volume de mensagens da sessão, porque toda a gente entra ao mesmo tempo, cumprimenta e mostra presença. Mensagens muito curtas, de muitas pessoas diferentes, em rajadas de vários segundos seguidos, com o ritmo a descer quando o conteúdo começa."
      : "",
    "Regras: variar o comprimento (de duas palavras a uma frase longa); nada de linguagem publicitária, nem mensagens iguais entre si; não mencionar marcas nem links.",
    "",
    'Cada mensagem declara em "kind" a sua relação com a fala do apresentador, e é essa relação que decide o seu segundo:',
    `- "provoca": SÓ quando o apresentador está mesmo a ler, citar, responder ou reagir a uma mensagem do chat em voz alta (ex.: "o Carlos diz que já fez a primeira venda", "a Mariana pergunta se funciona para quem começa"). A mensagem tem de aparecer ANTES dessa fala, ${TIMING.readAloud}, com o mesmo nome que o apresentador diz e o mesmo conteúdo que ele resume. "anchor" é o segundo da fala do apresentador. Uma pergunta espontânea da audiência NÃO é "provoca" — é "espontaneo" e fica no momento em que a pessoa naturalmente perguntaria, nunca colada antes de uma fala do apresentador para criar pretexto.`,
    `- "responde": o apresentador fez uma pergunta direta ao público ou pediu que escrevessem algo no chat, e esta pessoa está a responder. Tem de aparecer DEPOIS da pergunta, ${TIMING.answer}. "anchor" é o segundo da pergunta.`,
    `- "reage": a pessoa responde ao que o apresentador acabou de dizer, perguntar, mostrar ou anunciar. A mensagem tem de aparecer DEPOIS dessa fala, ${TIMING.react}, em cascata com outras. "anchor" é o segundo da fala.`,
    '- "espontaneo": engajamento solto, sem ligação a uma fala concreta. Nunca pode revelar, comentar ou antecipar algo que o apresentador ainda não disse (preço, oferta, bónus, resultados, conclusões). "anchor" é -1.',
    "Nunca escreva uma resposta antes da pergunta, uma reação antes do conteúdo que a provoca, um comentário sobre a oferta antes de a oferta ser apresentada, nem um agradecimento sem mensagem anterior que o justifique.",
    "O motor conhece o webinar todo, mas as pessoas do chat não conhecem o futuro: nenhuma mensagem antecipa uma pergunta, informação ou acontecimento que ainda não aconteceu no vídeo.",
    ...reactionBrief(view, from, to),
    ...momentsBrief(view, from, to),
    ...audienceCurveBrief(view, from, to),
    ...journeyBrief(view, from, to),
    ...audienceStateBrief(view, from, to, already),
    ...promptBrief(intel, from, to, settings.participants),
    ...intelBrief(intel, from, to),
    ...memoryBrief(intel, already),
    "Só escreva uma mensagem quando existir uma razão convincente para alguém a escrever naquele segundo. Se não houver, escreva menos do que o pedido — o silêncio faz parte de um chat real. Qualidade acima de quantidade.",
    "",
    engineSlots.length > 0
      ? [
          'OPORTUNIDADES deste trecho. O webinar é que cria as ocasiões para alguém escrever: cada mensagem indica em "slot" o id da oportunidade de onde nasce. Regras:',
          '- ANTES: o apresentador vai ler ou responder a esta mensagem em voz alta. Escreva exactamente as mensagens OBRIGATÓRIAS indicadas, com o nome que o apresentador diz em "author" e o conteúdo que ele resume (a mesma pergunta, a mesma cidade). O sistema coloca-a antes de ele a ler.',
          "- DEPOIS: resposta ou reacção à fala acabada de dizer. Escreva até ao número indicado, no formato pedido (sim ou não, um número, um emoji, a cidade, a palavra pedida, resposta curta ou longa). A primeira resposta é curta e imediata; as seguintes variam em tamanho, tom e pontuação. Nunca duas iguais.",
          "- LIVRE: comentários soltos, poucos, só sobre o que já foi dito até esse instante.",
          '- Não escreva mensagens sem slot, não invente slots e não passe o máximo de cada um. O instante exacto é o sistema que escolhe: indique "at" dentro da janela do slot.',
          '- Pode responder a outra pessoa começando por "@Nome", no máximo uma vez por slot e só a alguém que já escreveu antes nesse slot.',
          "- Cada pessoa escreve ao seu estilo (ver PESSOAS DO CHAT): frases curtas ou longas, com ou sem emojis, abreviado de telemóvel, às vezes com gralhas. Nada de linguagem de anúncio.",
          describeSlots(engineSlots),
          "",
          "PESSOAS DO CHAT (nomes e estilo; os nomes OBRIGATÓRIOS das mensagens ANTES podem não estar nesta lista):",
          describeProfiles(engine!.profiles, 60),
        ].join("\n")
      : slots && slots.length > 0
        ? [
            'Oportunidades deste trecho. O webinar é que cria as ocasiões para alguém escrever; cada mensagem ligada ao apresentador indica em "slot" a ocasião de onde nasce, escolhida desta lista:',
            describeOpportunities(slots),
            'Regras dos slots: escreva no máximo o número de mensagens indicado em cada slot; use "kind":"responde" nos slots de resposta e "kind":"reage" nos slots de reação; escreva apenas conteúdo compatível com o que foi pedido ou dito nesse slot; não invente slots.',
            'O instante exato é escolhido pelo sistema dentro da janela do slot — indique na mesma um "at" dentro dessa janela, mas nunca fora dela.',
            'Pode haver mensagens sem slot ("slot" vazio), espontâneas, mas no máximo um quarto das mensagens deste trecho e nunca a comentar algo que ainda não foi dito.',
          ].join("\n")
        : "",
    "",
    'Cada mensagem tem de trazer também "reason": uma frase curta, em português, que explique porque é que esta pessoa escreve exatamente isto neste segundo (ex.: "reage ao número de 3.000€ que o apresentador acabou de mostrar"). Mensagens espontâneas também têm de ter "reason" (ex.: "acabou de entrar na sala e cumprimenta"), mesmo sem fala relacionada.',
    'Em cada mensagem, "at" é o segundo inteiro, "anchor" o segundo da fala relacionada (-1 sem fala relacionada) e "slot" o id do slot (vazio sem slot).',
    `Todos os "at" têm de estar entre ${from} e ${to}, por ordem crescente, sem dois iguais e espalhados pelo intervalo.`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await chatJson({
    task: "generation",
    system:
      "És um argumentista de conversas de chat ao vivo. Escreves mensagens curtas e humanas de espectadores reais.",
    user: prompt,
    schema: CHAT_COMMENTS,
  });

  if (!result.ok) throw new AIError(result);

  const parsed = result.json as {
    comments?: {
      at?: unknown;
      author?: unknown;
      message?: unknown;
      moment?: unknown;
      kind?: unknown;
      anchor?: unknown;
      slot?: unknown;
      reason?: unknown;
    }[];
  };

  const byId = new Map((slots ?? []).map((slot) => [slot.id, slot]));
  // Instantes já usados por slot, para não empilhar mensagens no mesmo segundo.
  const scheduled = new Map<string, number[]>();

  const raw = (parsed.comments ?? [])
    .map((item, index) => {
      const kindRaw = String(item.kind ?? "")
        .trim()
        .toLowerCase();
      const kind: Comment["kind"] =
        kindRaw === "provoca" || kindRaw === "reage" || kindRaw === "responde"
          ? kindRaw
          : "espontaneo";
      const anchorRaw = Number(item.anchor);
      const message = String(item.message ?? "")
        .trim()
        .slice(0, 300);
      const slotId = String(item.slot ?? "").trim();
      const slot = slotId ? (byId.get(slotId) ?? null) : null;

      let at = Math.max(from, Math.min(to, Math.round(Number(item.at) || 0)));
      let atMs = at * 1000;
      if (slot) {
        // O sistema é que decide o instante exato dentro da janela do slot,
        // a partir do fim real (ao milissegundo) da fala que o provocou.
        const used = scheduled.get(slot.id) ?? [];
        const ms = pickTimestamp(
          { earliestMs: slot.earliestMs, latestMs: slot.latestMs },
          { message, seed: index, scheduledMs: used, order: used.length },
        );
        used.push(ms);
        scheduled.set(slot.id, used);
        atMs = Math.max(from * 1000, Math.min(to * 1000, Math.round(ms)));
        at = Math.floor(atMs / 1000);
      }

      return {
        at,
        atMs,
        author: String(item.author ?? "")
          .trim()
          .slice(0, 60),
        message,
        moment:
          String(item.moment ?? "")
            .trim()
            .slice(0, 40) || "geral",
        kind,
        anchor:
          slot != null
            ? Math.round(slot.triggerEndMs / 1000)
            : Number.isFinite(anchorRaw) && anchorRaw >= 0
              ? Math.round(anchorRaw)
              : null,
        slot: slot?.id ?? (slotId || null),
        reason: String(item.reason ?? "")
          .trim()
          .slice(0, 300),
      } as Comment;
    })
    .filter((item) => item.author && item.message);

  if (engineSlots.length === 0) return raw;
  const placed = placeWithEngine(raw, engine!, from, to);
  return fillMandatory(ctx, engine!, placed, from, to);
}

/**
 * Método Nova: o guião do trecho (quem, quando, a quê, que tamanho) é determinístico; a IA escreve só o
 * texto de cada linha. Linhas obrigatórias sem texto levam o que o apresentador cita ou uma presença
 * curta; as restantes sem texto caem.
 */
async function novaWindow(
  ctx: GenContext,
  engine: Engine,
  cast: CastMember[],
  from: number,
  to: number,
  already: { at: number; author: string; message: string }[],
): Promise<Comment[]> {
  const { webinar, settings } = ctx;
  const lines = buildScript(engine.slots, cast, {
    fromMs: from * 1000,
    toMs: to * 1000,
    seed: hashSeed(`guiao:${webinar.public_title}:${from}:${to}`),
    perMinute: perMinuteOf(settings),
    offerStartMs: engine.offerStartMs,
    existing: already.map((c) => ({ atMs: c.at * 1000, author: c.author })),
  });
  if (lines.length === 0) return [];

  const transcript = condenseTranscript(
    ctx.transcript.filter((s) => s.at >= from - 60 && s.at <= to + 30),
    160,
    400,
  );
  const recent = already
    .filter((c) => c.at >= from - 180 && c.at <= to)
    .slice(-25)
    .map((c) => `${c.at}s ${c.author}: ${c.message}`)
    .join("\n");
  const byId = new Map(cast.map((m) => [m.id, m] as const));
  const members = [...new Set(lines.map((l) => l.memberId))]
    .map((id) => byId.get(id))
    .filter((m): m is CastMember => Boolean(m));
  const tone =
    settings.tone === "custom" && settings.customTone ? settings.customTone : toneLabel[settings.tone];

  const prompt = [
    `Webinar: "${webinar.public_title}". Apresenta ${webinar.host_name ?? "o apresentador"}.`,
    webinar.description ? `Descrição: ${webinar.description.slice(0, 400)}` : "",
    engine.offerStartMs != null
      ? `A oferta (preço, inscrição) só é apresentada ao segundo ${Math.round(engine.offerStartMs / 1000)}: antes disso ninguém fala de preço, bónus, garantia ou inscrição.`
      : "",
    "",
    transcript.length
      ? `O que o apresentador diz neste trecho (segundo → fala):\n${transcript.map((s) => `${s.at}s: ${s.text}`).join("\n")}`
      : "",
    "",
    recent ? `Últimas mensagens do chat antes deste trecho (continuidade; não repetir):\n${recent}` : "",
    "",
    `Tom do chat: ${tone}. Emojis ${emojiLabel[settings.emojis]}.`,
    variantText(settings.variant),
    "",
    "PESSOAS (quem escreve neste trecho; cada uma escreve sempre ao seu estilo):",
    ...members.map(describeMember),
    "",
    "LINHAS DO GUIÃO. Cada linha já tem quem escreve, o segundo, o motivo e, entre parênteses rectos, o que o apresentador está a fazer nesse instante (a pedir e à espera, a ler o chat, a responder, a explicar, a sala a abrir): escreve SÓ a mensagem de cada uma, com o id, em conformidade com esse estado. Não mudes nomes, não juntes linhas, não acrescentes linhas.",
    "Escreve como pessoas reais num chat ao vivo, não como um redactor: frases curtas e soltas, vírgulas a menos, sem ponto final na maioria, maiúsculas às vezes esquecidas, «kkk», «haha», «mt», «vc», reticências, uma gralha de vez em quando, interjeições («nossa», «eish», «ya», «fixe», «top»). Exemplos do tom: «boa noite!!», «cheguei agora, perdi muito?», «5 mil?? que incrível», «eu também nunca sabia a legenda kkk», «isso é mesmo comigo…», «@Rita braga aqui tb!». Nada de frases de anúncio, nada de elogios vazios em série, nada de resumir o que o apresentador disse. Cada pessoa é diferente: a mesma pessoa mantém o estilo dela ao longo do trecho. Nunca duas mensagens iguais ou quase. Cada mensagem só pode falar do que o apresentador já disse até esse segundo. Respeita o formato pedido (um número é só um número; sim ou não é curto) e o máximo de palavras. OBRIGATÓRIO quer dizer o texto exacto, ou quase.",
    "",
    describeScript(lines, engine.slots),
  ]
    .filter(Boolean)
    .join("\n");

  let texts = new Map<string, string>();
  try {
    const result = await chatJson({
      task: "generation",
      system:
        "És um argumentista de chats ao vivo. Recebes um guião com quem escreve e quando, e devolves só o texto de cada linha, humano e curto. Respondes só com o JSON pedido.",
      user: prompt,
      schema: SCRIPT_LINES,
    });
    if (!result.ok) throw new AIError(result);
    const parsed = result.json as { lines?: { id?: unknown; message?: unknown }[] };
    texts = new Map(
      (parsed.lines ?? [])
        .map((l) => [String(l.id ?? "").trim(), String(l.message ?? "").trim().slice(0, 300)] as const)
        .filter(([id, message]) => id && message),
    );
  } catch (error) {
    // Sem texto da IA, só as linhas obrigatórias sobrevivem (com o que o apresentador cita).
    if (!lines.some((l) => l.mustText || l.intent === "presenca")) throw error;
  }

  const seen = new Set<string>();
  const out: Comment[] = [];
  lines.forEach((line, index) => {
    let message = texts.get(line.id) ?? "";
    if (!message) {
      if (line.mustText) message = line.mustText;
      else if (line.intent === "presenca")
        message = PRESENCE_FALLBACK[hashSeed(line.id + line.author) % PRESENCE_FALLBACK.length]!;
      else return;
    }
    const member = byId.get(line.memberId);
    if (member) message = styleMessage(member, message, index);
    if (line.replyTo && !/^@/.test(message)) message = `@${line.replyTo.split(" ")[0]} ${message}`;
    const key = message.toLocaleLowerCase("pt").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (key && seen.has(key) && !line.mustText) return;
    if (key) seen.add(key);
    out.push({
      at: Math.round(line.atMs / 1000),
      atMs: line.atMs,
      author: line.author,
      message,
      moment: momentOf(line),
      kind: line.kind,
      anchor:
        line.windowStartMs != null && line.slotId
          ? Math.round((line.dependency === "BEFORE" ? (engine.slots.find((s) => s.id === line.slotId)?.blockStartMs ?? line.atMs) : (engine.slots.find((s) => s.id === line.slotId)?.blockEndMs ?? line.atMs)) / 1000)
          : null,
      reason: line.reason,
      slot: line.slotId,
      dependency: line.dependency,
      blockId: line.blockId,
      blockType: line.blockType,
      interaction: line.interaction,
      windowStartMs: line.windowStartMs,
      windowEndMs: line.windowEndMs,
      confidence: line.confidence,
      profileId: line.memberId,
    });
  });
  return out;
}

function momentOf(line: ScriptLine): string {
  if (line.intent === "chegada") return "chegada";
  if (line.intent === "resposta" || line.intent === "replica") return "pergunta";
  if (line.blockType === "SOCIAL_PROOF") return "prova-social";
  if (line.blockType === "EMOTIONAL_MOMENT" || line.blockType === "STORY") return "emocao";
  if (line.blockType === "OFFER" || line.blockType === "CTA") return "oferta";
  return "explicacao";
}

/** Mensagens de presença quando a IA nem a segunda tentativa dão uma: curtas, de chat, sem conteúdo inventado. */
const PRESENCE_FALLBACK = [
  "presente! 🙋‍♀️",
  "boa noite! cheguei agora",
  "aqui 👋",
  "olá, a acompanhar 😊",
  "oi!! presente",
  "tô aqui 🙌",
  "cheguei!",
  "presente ✋",
];

function firstNameLower(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0]?.toLocaleLowerCase("pt") ?? "";
}

/**
 * O que falta nas oportunidades OBRIGATÓRIAS deste trecho: a pessoa que o apresentador vai nomear ou ler
 * e que a IA não escreveu. Devolve, por slot, os itens em falta.
 */
export function missingMandatory(
  slots: readonly InteractionSlot[],
  placed: readonly { slot?: string | null; author: string }[],
  from: number,
  to: number,
): { slot: InteractionSlot; items: ReferencedItem[] }[] {
  const bySlot = new Map<string, { author: string }[]>();
  for (const c of placed) if (c.slot) bySlot.set(c.slot, [...(bySlot.get(c.slot) ?? []), c]);
  const out: { slot: InteractionSlot; items: ReferencedItem[] }[] = [];
  for (const slot of slots) {
    if (slot.dependency !== "BEFORE" || slot.referenced.length === 0) continue;
    if (slot.windowEndMs < from * 1000 || slot.windowStartMs > to * 1000) continue;
    const have = bySlot.get(slot.id) ?? [];
    const names = slot.referenced.filter((r) => r.kind === "name");
    const taken = new Set(have.map((c) => firstNameLower(c.author)));
    const items: ReferencedItem[] = names.filter((r) => !taken.has(firstNameLower(r.name)));
    // Perguntas e mensagens sem nome: conta o que já lá está de quem não é um dos nomes.
    const nameless = slot.referenced.filter((r) => r.kind !== "name" && r.text);
    const namelessHave = have.filter(
      (c) => !names.some((n) => firstNameLower(n.name) === firstNameLower(c.author)),
    ).length;
    items.push(...nameless.slice(namelessHave));
    if (items.length > 0) out.push({ slot, items });
  }
  return out;
}

/**
 * Garantia determinística: a pessoa que o apresentador nomeia ou lê existe no chat antes da fala dele,
 * mesmo que a IA se tenha esquecido dela. Primeiro uma segunda chamada, pequena e focada, só com o que
 * falta; se também falhar, a mensagem lida tal como o apresentador a cita, ou uma presença curta.
 */
async function fillMandatory(
  ctx: GenContext,
  engine: Engine,
  placed: Comment[],
  from: number,
  to: number,
): Promise<Comment[]> {
  const missing = missingMandatory(engine.slots, placed, from, to);
  if (missing.length === 0) return placed;

  const clock = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  const describe = (item: ReferencedItem) =>
    item.kind === "name"
      ? `${item.name}${item.place ? ` (de ${item.place})` : ""}${item.text ? `: escreve "${item.text}"` : ": uma mensagem curta de chat (cumprimento, presença, ou o que o apresentador diz sobre ela)"}`
      : item.kind === "question"
        ? `alguém (escolhe um nome plausível) pergunta: "${item.text}"`
        : item.kind === "city"
          ? `alguém de ${item.text} diz de onde vê`
          : "a mensagem que o apresentador vai ler";

  let written: { slot: string; author: string; message: string }[] = [];
  try {
    const prompt = [
      `Webinar: "${ctx.webinar.public_title}". Apresenta ${ctx.webinar.host_name ?? "o apresentador"}.`,
      "Faltam mensagens de chat que o apresentador vai ler ou cujos autores vai nomear em voz alta. Escreve EXACTAMENTE estas, uma por item, no nome indicado, curtas e humanas, como num chat ao vivo, sem linguagem de anúncio. Português da variante " +
        ctx.settings.variant +
        ".",
      "",
      ...missing.map(
        ({ slot, items }) =>
          `[${slot.id}] antes da fala às ${clock(slot.blockStartMs)}: "${slot.speech}"${slot.context ? `\n   antes disso: "${slot.context.slice(-300)}"` : ""}\n   escrever: ${items.map(describe).join("; ")}`,
      ),
      "",
      'Cada mensagem traz "slot" (o id entre parênteses rectos), "author" (o nome indicado), "message", e os restantes campos podem ir vazios ou a -1.',
    ].join("\n");
    const result = await chatJson({
      task: "generation",
      system: "Escreves mensagens de chat de espectadores reais, curtas e naturais. Respondes só com o JSON pedido.",
      user: prompt,
      schema: CHAT_COMMENTS,
    });
    if (result.ok) {
      const parsed = result.json as { comments?: { slot?: unknown; author?: unknown; message?: unknown }[] };
      written = (parsed.comments ?? [])
        .map((c) => ({
          slot: String(c.slot ?? "").trim(),
          author: String(c.author ?? "").trim().slice(0, 60),
          message: String(c.message ?? "").trim().slice(0, 300),
        }))
        .filter((c) => c.slot && c.author && c.message);
    }
  } catch {
    // Sem a segunda chamada, segue-se para as mensagens de reserva.
  }

  const out = [...placed];
  missing.forEach(({ slot, items }, slotIndex) => {
    const fromAi = written.filter((w) => w.slot === slot.id);
    const fresh: { author: string; message: string }[] = [];
    items.forEach((item, itemIndex) => {
      const seed = hashSeed(`${slot.id}:${itemIndex}:${from}`);
      if (item.kind === "name") {
        const hit =
          fromAi.find((w) => firstNameLower(w.author) === firstNameLower(item.name)) ??
          fromAi.find((w) => !fresh.some((f) => f.message === w.message) && !items.some((i) => i.kind === "name" && firstNameLower(i.name) === firstNameLower(w.author)));
        fresh.push({
          author: item.name!,
          message: hit?.message || item.text || PRESENCE_FALLBACK[seed % PRESENCE_FALLBACK.length]!,
        });
        return;
      }
      const hit = fromAi.find((w) => !fresh.some((f) => f.message === w.message));
      if (hit) fresh.push({ author: hit.author, message: hit.message });
      else if (item.text) {
        const name = engine.profiles[(seed + itemIndex) % Math.max(1, engine.profiles.length)]?.name ?? "Participante";
        fresh.push({ author: name, message: item.text });
      }
    });
    if (fresh.length === 0) return;
    const times = placeSlot(slot, fresh.length, hashSeed(`${slot.id}:falta:${from}:${slotIndex}`));
    fresh.forEach((c, index) => {
      const atMs = Math.max(from * 1000, Math.min(to * 1000 + 999, times[index] ?? slot.windowStartMs));
      out.push({
        at: Math.round(atMs / 1000),
        atMs,
        author: c.author,
        message: c.message,
        moment: "geral",
        kind: "provoca",
        anchor: Math.round(slot.blockStartMs / 1000),
        reason: slot.reason,
        slot: slot.id,
        dependency: "BEFORE",
        blockId: slot.blockId,
        blockType: slot.blockType,
        interaction: slot.interaction,
        windowStartMs: slot.windowStartMs,
        windowEndMs: slot.windowEndMs,
        confidence: slot.confidence,
      });
    });
  });
  return out.sort((a, b) => (a.atMs ?? a.at * 1000) - (b.atMs ?? b.at * 1000));
}

/**
 * Correção determinística da cronologia, pela relação causal que a própria
 * IA declarou: o que provoca a fala fica antes dela, o que reage fica depois,
 * e ninguém fala da oferta antes de ela ser apresentada.
 */
export function fixCausality(
  ctx: GenContext,
  input: Comment[],
  report: PlacementReport<Comment> = { dropped: [] },
) {
  const ctaStart = ctx.webinar.cta_start_seconds ?? null;
  const bounds = { start: ctx.start, end: ctx.end };
  // Primeiro tira tudo o que antecipa uma causa que ainda não aconteceu.
  // As mensagens do motor dos blocos já têm o instante certo: passam intactas.
  const list: Comment[] = [];
  const fromEngine = input.filter((comment) => comment.dependency);
  const loose = input.filter((comment) => !comment.dependency);
  for (const comment of [...fromEngine, ...stripAnticipations(ctx, loose)]) {
    // `at` e `atMs` passam a dizer o mesmo antes de qualquer ajuste.
    syncOffsets(comment);
    if (comment.dependency) {
      if (comment.at > ctx.end) {
        report.dropped.push({
          comment,
          reason: "depois_do_fim",
          detail: `${comment.at}s é depois do fim do vídeo (${ctx.end}s)`,
        });
        continue;
      }
      list.push(comment);
      continue;
    }
    const anchor = comment.anchor;
    // Quando a causa só permite um instante depois do fim do vídeo, o
    // comentário não tem lugar válido: fica registado como descartado.
    let requiredAt: number | null = null;
    if (anchor !== null) {
      if (comment.kind === "provoca") {
        // "Provoca" só é válida como pretexto real: quando o apresentador lê
        // ou cita o chat. Fora disso, uma pergunta espontânea nunca é
        // empurrada para antes de uma fala só para criar pretexto.
        const segment = ctx.intel?.segments.find((s) => anchor >= s.from && anchor <= s.to);
        const readsChat = segment?.readsChat ?? ctx.intel === undefined;
        if (!readsChat) {
          comment.kind = "espontaneo";
          comment.anchor = null;
        } else if (comment.at >= anchor - 3) {
          moveTo(comment, Math.max(ctx.start, anchor - 8));
        }
      } else if (comment.kind === "reage") {
        // Ninguém reage enquanto a ideia ainda está a ser dita: conta-se a
        // partir do momento em que a frase fecha.
        const floor = ideaEndsAt(ctx, anchor) + 3;
        if (comment.at < floor) requiredAt = floor;
      } else if (comment.kind === "responde" && comment.at <= anchor + 1) {
        // Resposta a uma chamada direta: nunca antes da pergunta.
        requiredAt = anchor + 3;
      }
    }
    if (ctaStart !== null && comment.moment === "oferta" && comment.at < ctaStart) {
      requiredAt = Math.max(requiredAt ?? 0, ctaStart + 6);
    }
    if (requiredAt !== null) {
      if (requiredAt > ctx.end) {
        report.dropped.push({
          comment,
          reason: "causa_depois_do_fim",
          detail: `só podia aparecer aos ${requiredAt}s, depois do fim do vídeo (${ctx.end}s)`,
        });
        continue;
      }
      moveTo(comment, requiredAt);
    }
    list.push(comment);
  }
  list.sort((a, b) => a.atMs! - b.atMs!);
  const spread = enforceIntentDiversity(dropPraiseClusters(list));
  // Sem dois comentários no mesmo segundo, para a cascata respirar, mas
  // nunca depois do fim do vídeo: quem não cabe é descartado e reportado.
  // Com o motor dos blocos a cascata é mais apertada (um segundo).
  return placeInTimeline(spread, bounds, fromEngine.length > 0 ? 1 : 2, report);
}

/** Elogios genéricos tipo "muito bom 🔥": no máximo um por momento. */
const GENERIC_PRAISE =
  /^(muito bom|top|show|ótimo|otimo|excelente|perfeito|boa|adorei|amei|maravilha|sensacional|incrível|incrivel|demais|massa|👏+|🔥+)[\s!.🔥👏💯🙌]*$/iu;

function dropPraiseClusters(list: Comment[]): Comment[] {
  const kept: Comment[] = [];
  let lastPraise = -999;
  for (const comment of list) {
    if (comment.dependency) {
      kept.push(comment);
      continue;
    }
    const generic = GENERIC_PRAISE.test(comment.message.trim());
    if (generic) {
      if (comment.at - lastPraise < 40) continue;
      lastPraise = comment.at;
    }
    kept.push(comment);
  }
  return kept;
}

/* ------------------------------------------------------------------ *
 * Anti-repetição por intenção
 *
 * "Muito bom", "conteúdo excelente", "aula muito boa" são a mesma reação
 * com palavras diferentes. O controlo é por intenção, não por texto.
 * ------------------------------------------------------------------ */

type CommentIntent =
  "elogio" | "descoberta" | "identificacao" | "duvida" | "objecao" | "intencao" | "outro";

const INTENT_HINTS: [RegExp, CommentIntent][] = [
  [
    /\b(n[aã]o sabia|desconhecia|faz sentido|agora (percebi|entendi)|finalmente percebi|mudou (tudo|muita coisa)|nunca tinha (visto|olhado|pensado))\b/i,
    "descoberta",
  ],
  [
    /\b(eu tamb[eé]m|comigo (foi|é)|passei (por )?isso|identifico|a minha hist[óo]ria|igual a mim|também eu)\b/i,
    "identificacao",
  ],
  [
    /\b(caro|pre[çc]o|parcel|presta[çc]|garantia|funciona (mesmo|para)|será que|ser[áa] (que|assim)|e se|vale a pena\??)\b/i,
    "objecao",
  ],
  [
    /\b(quero|vou (entrar|aderir|comprar|fazer)|inscrev|comprei|fiz a inscrição|estou dentro|bora l[áa])\b/i,
    "intencao",
  ],
  [/\?$/, "duvida"],
  [
    /\b(bom|top|excelente|[óo]timo|perfeito|adorei|amei|incrível|incrivel|sensacional|parab[ée]ns|brutal|forte|demais|massa)\b|[👏🔥💯🙌❤]/u,
    "elogio",
  ],
];

function intentOf(message: string): CommentIntent {
  const clean = message.trim();
  for (const [hint, intent] of INTENT_HINTS) {
    if (hint.test(clean)) return intent;
  }
  return "outro";
}

/**
 * Limites de intenção por bloco de 10 minutos: um momento forte não faz a
 * sala inteira reagir da mesma maneira. Respostas a chamadas diretas do
 * apresentador ("responde") não contam — pertencem ao pedido.
 */
function enforceIntentDiversity(list: Comment[]): Comment[] {
  const BUCKET = 600;
  const LIMITS: Partial<Record<CommentIntent, number>> = {
    elogio: 3,
    descoberta: 4,
    identificacao: 3,
    intencao: 3,
  };
  const counts = new Map<string, number>();
  const kept: Comment[] = [];
  for (const comment of list) {
    if (comment.kind === "responde" || comment.kind === "provoca" || comment.dependency) {
      kept.push(comment);
      continue;
    }
    const intent = intentOf(comment.message);
    const limit = LIMITS[intent];
    if (limit === undefined) {
      kept.push(comment);
      continue;
    }
    const key = `${intent}:${Math.floor(comment.at / BUCKET)}`;
    const used = counts.get(key) ?? 0;
    if (used >= limit) continue;
    counts.set(key, used + 1);
    kept.push(comment);
  }
  return kept;
}

/** Segunda leitura da timeline pela IA, à procura de inconsistências temporais. */
async function auditTimeline(
  ctx: GenContext,
  list: Comment[],
  report: PlacementReport<Comment> = { dropped: [] },
) {
  if (list.length === 0) return list;
  const transcript = condenseTranscript(
    ctx.transcript.filter((s) => s.at >= ctx.start - 60 && s.at <= ctx.end + 60),
    220,
    360,
  );
  if (transcript.length === 0) return list;

  const review = [
    `Webinar: "${ctx.webinar.public_title}".`,
    ctx.webinar.cta_text
      ? `A oferta só é apresentada ao segundo ${ctx.webinar.cta_start_seconds ?? 0}.`
      : "",
    `Transcrição (segundo → fala):\n${transcript.map((s) => `${s.at}s: ${s.text}`).join("\n")}`,
    "",
    `Chat gerado (índice, segundo, autor, mensagem):\n${list
      .map((c, index) => `${index}| ${c.at}s ${c.author}: ${c.message}`)
      .join("\n")}`,
    "",
    "Reveja apenas a cronologia, sem reescrever mensagens. Procure:",
    `- respostas colocadas antes da pergunta do apresentador (uma pergunta direta ao público só tem respostas ${TIMING.answer} dela);`,
    "- respostas a uma pergunta direta todas no mesmo instante, em vez de espalhadas pela janela de resposta;",
    "- reações colocadas antes da fala que as provoca;",
    `- mensagens que o apresentador lê em voz alta colocadas depois de ele as ler (ficam ${TIMING.readAloud} de ele as ler);`,
    "- comentários sobre a oferta antes de a oferta ser apresentada;",
    "- agradecimentos ou respostas sem mensagem anterior que os justifique;",
    "- comentários que revelam algo que o apresentador ainda não disse;",
    "- pessoas a dizer de onde estão a assistir sem que o apresentador o tenha pedido antes (nesse caso mova para depois do pedido, se existir);",
    "- reações colocadas ainda com a ideia a ser explicada: só podem aparecer depois de a frase fechar;",
    "- no primeiro minuto, mensagens que não sejam de chegada ou expectativa.",
    `Os segundos corrigidos têm de ficar entre ${ctx.start} e ${ctx.end}.`,
    "Para cada mensagem fora do sítio, devolva o índice e o novo segundo. Sem problemas, devolva a lista vazia.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await chatJson({
      task: "analysis",
      system:
        "És revisor de cronologia de chats de webinars. Verificas se cada mensagem está antes ou depois da fala certa.",
      user: review,
      schema: TIMELINE_FIXES,
    });
    if (result.ok) {
      const parsed = result.json as {
        fixes?: { index?: unknown; at?: unknown }[];
      };
      // Só o instante muda; `at` e `atMs` seguem juntos e dentro do vídeo.
      // As mensagens ligadas a um bloco de fala já têm o instante certo: a revisão não lhes mexe.
      const fixes = (parsed.fixes ?? []).filter((fix) => {
        const target = list[Number(fix.index)];
        return !(target && target.dependency && target.dependency !== "INDEPENDENT");
      });
      applyAuditFixes(list, fixes, { start: ctx.start, end: ctx.end });
    }
  } catch {
    // Uma revisão falhada não pode deitar fora o chat inteiro.
  }

  return fixCausality(ctx, list, report);
}

/* ------------------------------------------------------------------ *
 * Engagement Intelligence — o mapa do webinar
 *
 * Antes de escrever uma única mensagem, a IA lê o webinar inteiro e
 * devolve: trechos com significado e as suas notas internas, risco de
 * abandono, personas da sessão, insights para o apresentador, sugestões
 * de recuperação de atenção e uma pontuação global.
 * ------------------------------------------------------------------ */

const objectiveSchema = z
  .enum(["retention", "engagement", "conversion", "balanced"])
  .catch("balanced")
  .default("balanced");

const riskSchema = z.enum(["baixo", "moderado", "alto", "critico"]).catch("moderado");

const segmentAnalysisSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  kind: z.string().trim().max(40).catch("conteudo").default("conteudo"),
  summary: z.string().trim().max(240).catch("").default(""),
  engagement: z.coerce.number().int().catch(50),
  dropRisk: riskSchema,
  emotion: z.coerce.number().int().catch(40),
  density: z.coerce.number().int().catch(50),
  purchaseIntent: z.coerce.number().int().catch(20),
  objection: z.coerce.number().int().catch(20),
  readsChat: z.boolean().catch(false),
  hostQuestion: z.string().trim().max(200).catch("").default(""),
});

const personaSchema = z.object({
  name: z.string().trim().max(40),
  style: z.string().trim().max(60).catch("participativa").default("participativa"),
  profile: z.string().trim().max(200).catch("").default(""),
  emojis: z.enum(["poucos", "alguns", "muitos"]).catch("alguns"),
  knowledge: z
    .enum(["iniciante", "intermedio", "experiente"])
    .catch("iniciante")
    .default("iniciante"),
  rhythm: z
    .enum(["observadora", "moderada", "participativa"])
    .catch("moderada")
    .default("moderada"),
  arrivalAt: z.coerce.number().int().min(0).catch(0).default(0),
});

/**
 * Momento semântico: uma ideia completa, do início à conclusão. As reações
 * nascem depois de a ideia fechar, não três segundos depois de uma frase.
 */
const momentSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  topic: z.string().trim().max(60).catch("geral").default("geral"),
  summary: z.string().trim().max(200).catch("").default(""),
  novelty: z.coerce.number().int().catch(40),
  reactionUntil: z.coerce.number().int().min(0).catch(0),
});

/**
 * Estado coletivo estimado. São ESTIMATIVAS do modelo — serão calibradas
 * com comportamento real na Fase 3 — e representam uma tendência, nunca uma
 * obrigação para todas as personas reagirem da mesma maneira.
 */
const audienceStateSchema = z.object({
  at: z.number().int().min(0),
  estimatedAttention: z.coerce.number().int().catch(50),
  estimatedConfusion: z.coerce.number().int().catch(20),
  estimatedExcitement: z.coerce.number().int().catch(30),
  estimatedTrust: z.coerce.number().int().catch(30),
  estimatedPurchaseIntent: z.coerce.number().int().catch(10),
  estimatedObjection: z.coerce.number().int().catch(10),
  chatEnergy: z.coerce.number().int().catch(30),
});

const audiencePromptSchema = z.object({
  at: z.number().int().min(0),
  ask: z.string().trim().max(200).catch("").default(""),
  expects: z.string().trim().max(40).catch("livre").default("livre"),
  keyword: z.string().trim().max(30).catch("").default(""),
  intensity: z.coerce.number().int().catch(60),
});

/**
 * Varredura dedicada das chamadas diretas à audiência.
 *
 * O mapa global vê o webinar inteiro de forma resumida; esta passagem lê a
 * transcrição literal, em blocos, à procura do segundo exato em que o
 * apresentador pergunta alguma coisa ao público. É daqui que sai o "18:37"
 * que depois ancora as respostas aos 18:40, 18:44, 18:49.
 */
async function scanAudiencePrompts(
  transcript: TranscriptSegment[],
  webinarTitle: string,
): Promise<AudiencePrompt[]> {
  if (transcript.length === 0) return [];
  const ordered = [...transcript].sort((a, b) => a.at - b.at);
  const BLOCK = 90;
  const found: AudiencePrompt[] = [];

  for (let index = 0; index < ordered.length; index += BLOCK) {
    const block = ordered.slice(index, index + BLOCK);
    const lines = block.map((s) => `${s.at}s: ${s.text}`).join("\n");
    const prompt = [
      `Webinar: "${webinarTitle}".`,
      `Transcrição literal deste bloco (segundo → fala):\n${lines}`,
      "",
      "Liste TODAS as chamadas diretas à audiência que existem mesmo neste texto: perguntas feitas ao público, pedidos para escrever algo no chat, enquetes, pedidos de levantar a mão e convites a manifestar interesse. Ignore perguntas retóricas que o próprio apresentador responde de imediato.",
      "Para cada uma: at (o segundo em que o pedido termina, tirado da transcrição), ask (o pedido nas palavras dele), expects (cidade, sim-nao, palavra-chave, experiencia, duvida, interesse, numero ou livre), keyword (a palavra exata pedida, se houver) e intensity de 0 a 100 conforme o pedido seja explícito e insistente.",
      "Não invente nada. Se não houver nenhuma, devolva uma lista vazia.",
    ].join("\n");

    try {
      const result = await chatJson({
        task: "classification",
        system: "Detetas pedidos diretos de interação em transcrições de webinars.",
        user: prompt,
        schema: AUDIENCE_PROMPTS,
      });
      if (!result.ok) continue;
      const parsed = z
        .object({ prompts: z.array(audiencePromptSchema).max(40).default([]) })
        .safeParse(result.json);
      if (parsed.success) found.push(...parsed.data.prompts);
    } catch {
      // Um bloco que falhe não estraga a varredura dos restantes.
    }
  }

  found.sort((a, b) => a.at - b.at);
  const unique: AudiencePrompt[] = [];
  for (const prompt of found) {
    if (!prompt.ask) continue;
    if (unique.some((p) => Math.abs(p.at - prompt.at) < 8)) continue;
    unique.push(prompt);
  }
  return unique;
}

const analysisPayloadSchema = z.object({
  objective: objectiveSchema,
  durationSeconds: z.number().int().min(0).default(0),
  segments: z.array(segmentAnalysisSchema).max(60).default([]),
  personas: z.array(personaSchema).max(40).default([]),
  prompts: z.array(audiencePromptSchema).max(60).default([]),
  moments: z.array(momentSchema).max(60).default([]),
  audienceState: z.array(audienceStateSchema).max(120).default([]),
  insights: z
    .array(
      z.object({
        at: z.number().int().min(0),
        level: z.enum(["bom", "atencao", "risco"]).catch("atencao"),
        title: z.string().trim().max(120),
        note: z.string().trim().max(400).catch("").default(""),
      }),
    )
    .max(40)
    .default([]),
  rescue: z
    .array(
      z.object({
        from: z.number().int().min(0),
        to: z.number().int().min(0),
        risk: riskSchema,
        reason: z.string().trim().max(300).catch("").default(""),
        suggestions: z.array(z.string().trim().max(200)).max(8).default([]),
      }),
    )
    .max(20)
    .default([]),
  score: z
    .object({
      overall: z.coerce.number().int().catch(0),
      retention: z.coerce.number().int().catch(0),
      engagement: z.coerce.number().int().catch(0),
      clarity: z.coerce.number().int().catch(0),
      pace: z.coerce.number().int().catch(0),
      offer: z.coerce.number().int().catch(0),
      cta: z.coerce.number().int().catch(0),
      summary: z.string().trim().max(400).catch("").default(""),
    })
    .default({
      overall: 0,
      retention: 0,
      engagement: 0,
      clarity: 0,
      pace: 0,
      offer: 0,
      cta: 0,
      summary: "",
    }),
});

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Normaliza o que a IA devolveu: limites, ordem e trechos sem buracos. */
/**
 * Proximidade do CTA (0-100): 100 a partir do segundo em que a oferta abre;
 * antes disso desce um ponto por cada 6 s de distância (70 a três minutos).
 * ponytail: queda linear fixa; afinar os 6 s se os diagnósticos o pedirem.
 */
function ctaProximityOf(to: number, ctaStart: number | null) {
  if (ctaStart === null) return 0;
  return clampScore(100 - Math.max(0, ctaStart - to) / 6);
}

function normaliseAnalysis(
  raw: z.infer<typeof analysisPayloadSchema>,
  objective: EngagementObjective,
  duration: number,
  ctaStart: number | null,
): WebinarAnalysis {
  const segments = raw.segments
    .map((s) => ({
      from: Math.max(0, Math.min(duration, Math.round(s.from))),
      to: Math.max(0, Math.min(duration, Math.round(s.to))),
      kind: s.kind || "conteudo",
      summary: s.summary,
      engagement: clampScore(s.engagement),
      dropRisk: s.dropRisk,
      emotion: clampScore(s.emotion),
      density: clampScore(s.density),
      purchaseIntent: clampScore(s.purchaseIntent),
      objection: clampScore(s.objection),
      ctaProximity: ctaProximityOf(Math.round(s.to), ctaStart),
      readsChat: s.readsChat,
      hostQuestion: s.hostQuestion,
    }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from);

  // Sem sobreposições: cada trecho termina onde o seguinte começa.
  for (let i = 0; i < segments.length - 1; i += 1) {
    const current = segments[i]!;
    const next = segments[i + 1]!;
    if (current.to >= next.from) current.to = Math.max(current.from + 1, next.from - 1);
  }

  return {
    objective,
    durationSeconds: duration,
    segments,
    personas: raw.personas.filter((p) => p.name),
    prompts: raw.prompts
      .filter((p) => p.ask)
      .map((p) => ({
        at: Math.max(0, Math.min(duration, Math.round(p.at))),
        ask: p.ask,
        expects: p.expects,
        keyword: p.keyword,
        intensity: clampScore(p.intensity),
      }))
      .sort((a, b) => a.at - b.at),
    moments: raw.moments
      .map((m, index) => {
        const from = Math.max(0, Math.min(duration, Math.round(m.from)));
        const to = Math.max(from + 5, Math.min(duration, Math.round(m.to)));
        return {
          id: `m${index}`,
          from,
          to,
          topic: m.topic || "geral",
          summary: m.summary,
          novelty: clampScore(m.novelty),
          reactionUntil: Math.min(
            duration,
            Math.max(to + 10, Math.round(m.reactionUntil) || to + 60),
          ),
        };
      })
      .sort((a, b) => a.from - b.from),
    audienceState: raw.audienceState
      .map((p) => ({
        at: Math.max(0, Math.min(duration, Math.round(p.at))),
        estimatedAttention: clampScore(p.estimatedAttention),
        estimatedConfusion: clampScore(p.estimatedConfusion),
        estimatedExcitement: clampScore(p.estimatedExcitement),
        estimatedTrust: clampScore(p.estimatedTrust),
        estimatedPurchaseIntent: clampScore(p.estimatedPurchaseIntent),
        estimatedObjection: clampScore(p.estimatedObjection),
        chatEnergy: clampScore(p.chatEnergy),
      }))
      .sort((a, b) => a.at - b.at),
    insights: raw.insights.sort((a, b) => a.at - b.at),
    rescue: raw.rescue.filter((r) => r.to > r.from).sort((a, b) => a.from - b.from),
    score: {
      overall: clampScore(raw.score.overall),
      retention: clampScore(raw.score.retention),
      engagement: clampScore(raw.score.engagement),
      clarity: clampScore(raw.score.clarity),
      pace: clampScore(raw.score.pace),
      offer: clampScore(raw.score.offer),
      cta: clampScore(raw.score.cta),
      summary: raw.score.summary,
    },
  };
}

/**
 * Fase 0 do modo Inteligente — análise completa do webinar.
 * Guarda o resultado para o editor poder mostrar heatmap, insights e score
 * sem ter de repetir a análise.
 */
export async function analyseWebinarStructureImpl(supabase: any, data: any) {
  const webinar = await loadWebinar(supabase, data.webinarId);
  const duration = computeDuration(webinar, data.transcript);

  // A transcrição inteira não cabe no pedido: amostramos ao longo de todo o
  // vídeo e encurtamos cada momento, mantendo o percurso completo.
  // Mapa global: a IA lê o webinar inteiro, do segundo 0 ao fim. Se a
  // transcrição for muito longa, juntamos momentos vizinhos em vez de
  // descartar falas — nenhuma parte do webinar fica por conhecer.
  const condensed = condenseTranscript(data.transcript, 220, 420);
  const lines = condensed.map((s) => `${s.at}s: ${s.text}`).join("\n");

  const howManyPersonas = Math.max(5, Math.min(14, Math.round(data.participants / 4)));

  const prompt = [
    `Webinar: "${webinar.public_title}".`,
    webinar.description ? `Descrição: ${webinar.description}` : "",
    webinar.cta_text
      ? `Oferta "${webinar.cta_text}"${webinar.cta_price_now ? ` por ${webinar.cta_price_now}` : ""} apresentada ao segundo ${webinar.cta_start_seconds ?? 0}.`
      : "",
    `Duração total: ${duration} segundos.`,
    "",
    lines
      ? `Transcrição (segundo aproximado → fala):\n${lines}`
      : "Não há transcrição. Baseie-se no título, descrição e oferta para estimar o percurso provável da apresentação.",
    "",
    "Analise este webinar como diretor de engajamento. Divida-o em 8 a 24 trechos com significado próprio (abertura, chegada, conteúdo, história, explicação técnica, demonstração, prova social, estudo de caso, objeção, transição para a oferta, oferta, preço, bónus, garantia, urgência, cta, encerramento). Os trechos têm de cobrir o webinar do segundo 0 ao segundo final, sem buracos nem sobreposições.",
    "Para cada trecho dê notas de 0 a 100: engagement (potencial de interação), emotion (intensidade emocional), density (densidade de informação), purchaseIntent (intenção de compra), objection (probabilidade de objeção). Classifique dropRisk em baixo, moderado, alto ou critico, tendo em conta explicações longas, excesso técnico, tempo sem interação, mudanças lentas de assunto, silêncio, repetição, histórias longas, transição para o pitch, apresentação do preço e o momento logo a seguir ao CTA.",
    'Em prompts, liste TODAS as chamadas diretas à audiência: perguntas feitas ao público ("de onde é que estão a falar?", "quem aqui já participou num leilão?", "vocês perceberam esta parte?"), pedidos de palavra no chat ("escreve EU", "põe SIM"), pedidos de levantar a mão, enquetes e convites a manifestar interesse. Para cada uma: at (o segundo em que o pedido termina), ask (o pedido nas palavras dele), expects (cidade, sim-nao, palavra-chave, experiencia, duvida, interesse, numero ou livre), keyword (a palavra exata pedida, se houver) e intensity de 0 a 100 conforme o pedido seja explícito e insistente. Não invente pedidos que não existem na transcrição.',
    'Marque readsChat a verdadeiro quando o apresentador lê, cita ou responde ao chat ("estou a ver-vos aqui", "vi alguém perguntar", "quem perguntou isto", "tem muita gente a dizer"). Em hostQuestion escreva a pergunta direta que ele faz ao público, quando existir; caso contrário deixe vazio.',
    "Em moments, liste de 8 a 30 momentos semânticos: ideias completas com início e fim (uma ideia pode começar aos 620s e só fechar aos 648s). Para cada um: from, to (segundo em que a ideia fecha), topic (rótulo curto do tema, para memória das personas), summary, novelty de 0 a 100 (100 = revelação que muda tudo; 10 = conteúdo trivial) e reactionUntil (até que segundo faz sentido alguém reagir — normalmente to + 20 a 90).",
    "Em audienceState, estime o estado COLETIVO da audiência a cada 3 a 8 minutos (e nos pontos de viragem: prova forte, revelação de preço, garantia, CTA). São estimativas do modelo, não factos: estimatedAttention, estimatedConfusion, estimatedExcitement, estimatedTrust, estimatedPurchaseIntent, estimatedObjection e chatEnergy, todos de 0 a 100. Faça-os evoluir com a narrativa: explicação complexa sobe a confusão; exemplo claro baixa-a e sobe a confiança; prova forte sobe a confiança; preço sobe a objeção; garantia baixa-a.",
    `Crie ${howManyPersonas} personas de participantes simulados desta sessão: nome e apelido plausíveis do país de cada pessoa, traço dominante (entusiasta, racional, cética, reservada, participativa), um perfil curto e coerente (país, cidade, experiência, situação) e o uso de emojis. ${variantText(data.variant)} Dê a cada uma: knowledge (iniciante, intermedio ou experiente — muda a forma como lê o conteúdo), rhythm (observadora, moderada ou participativa — quase todas observadoras ou moderadas) e arrivalAt (segundo em que entra na sala: a maioria 0, algumas chegam a meio). Nunca as apresente como clientes reais nem compradores.`,
    "Em insights, aponte 5 a 12 momentos concretos para o apresentador melhorar o webinar, em linguagem simples e direta (trecho longo sem mudança de ritmo, pergunta com bom potencial, história com alta retenção, oferta que começa de forma abrupta, boa oportunidade de CTA).",
    "Em rescue, liste os trechos com previsão de baixa retenção e sugestões concretas (pergunta ao público, comentário contextual, enquete, antecipar uma promessa, CTA secundário, encurtar o trecho no próximo webinar). Não resolva tudo com mais comentários.",
    "Em score, pontue de 0 a 100: overall, retention, engagement, clarity, pace, offer, cta, mais um resumo de duas frases.",
    "Escreva tudo em português de Portugal.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await chatJson({
    task: "analysis",
    system:
      "És diretor de engajamento de webinars. Analisas o percurso da apresentação, antecipas onde se perde atenção e preparas a estratégia de interação.",
    user: prompt,
    schema: WEBINAR_ANALYSIS,
  });

  if (!result.ok) throw new AIError(result);

  const parsed = analysisPayloadSchema.parse({
    ...(result.json as object),
    objective: data.objective,
    durationSeconds: duration,
  });

  const analysis = normaliseAnalysis(
    parsed,
    data.objective,
    duration,
    webinar.cta_text ? (webinar.cta_start_seconds ?? 0) : null,
  );

  // Segunda leitura, sobre a transcrição literal completa: garante que
  // nenhuma pergunta ao público se perde e que o segundo é o real.
  try {
    const scanned = await scanAudiencePrompts(data.transcript, webinar.public_title);
    if (scanned.length > 0) {
      const merged = [...analysis.prompts];
      for (const prompt of scanned) {
        const index = merged.findIndex((p) => Math.abs(p.at - prompt.at) < 8);
        if (index >= 0) merged[index] = prompt;
        else merged.push(prompt);
      }
      merged.sort((a, b) => a.at - b.at);
      analysis.prompts = merged;
    }
  } catch {
    // Sem esta passagem ficam as chamadas do mapa global.
  }

  // Guardar é um extra: se falhar, a geração continua com a análise em mãos.
  const { data: member } = await supabase
    .from("webinars")
    .select("organization_id")
    .eq("id", data.webinarId)
    .maybeSingle();
  if (member?.organization_id) {
    await supabase.from("webinar_analysis").upsert(
      {
        webinar_id: data.webinarId,
        organization_id: member.organization_id,
        objective: analysis.objective,
        duration_seconds: analysis.durationSeconds,
        segments: analysis.segments,
        personas: analysis.personas,
        prompts: analysis.prompts,
        moments: analysis.moments ?? [],
        audience_state: analysis.audienceState ?? [],
        insights: analysis.insights,
        rescue: analysis.rescue,
        score: analysis.score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "webinar_id" },
    );
  }

  return { analysis };
}

export const analyseWebinarStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: z.string().uuid(),
        transcript: transcriptSchema,
        objective: objectiveSchema,
        participants: z.coerce
          .number()
          .int()
          .catch(25)
          .transform((n) => Math.min(2000, Math.max(3, n))),
        variant: z.string().refine(isChatVariant).catch("pt-PT"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    billed(context.supabase, data.webinarId, "webinar_analysis", () =>
      analyseWebinarStructureImpl(context.supabase, data),
    ),
  );

const intelSchema = z
  .object({
    objective: objectiveSchema,
    segments: z.array(segmentAnalysisSchema).max(60).default([]),
    personas: z.array(personaSchema).max(40).default([]),
    prompts: z.array(audiencePromptSchema).max(60).default([]),
    moments: z.array(momentSchema).max(60).default([]),
    audienceState: z.array(audienceStateSchema).max(120).default([]),
  })
  .optional();

/** Fase 1 — quantas janelas de tempo gerar e quantos comentários em cada uma. */
export async function planCommentWindowsImpl(supabase: any, data: any) {
  const webinar = await loadWebinar(supabase, data.webinarId);
  const duration = computeDuration(webinar, data.transcript);
  const { start, end } = computeBounds(data.range, duration);
  const perMinute = perMinuteOf(data.settings);

  const PER_WINDOW = 35;
  const windowSeconds = Math.max(180, Math.min(900, Math.round((PER_WINDOW / perMinute) * 60)));
  // Um alvo alto pede mais trechos: cada chamada à IA escreve no máximo
  // umas dezenas de mensagens sem perder qualidade.
  const wanted = Number(data.settings?.targetTotal ?? 0);
  const byTarget = wanted > 0 ? Math.ceil(wanted / 45) : 0;
  const total = Math.max(
    1,
    Math.min(60, Math.max(Math.ceil((end - start) / windowSeconds), byTarget)),
  );
  const step = (end - start) / total;

  const segments = (data.intel?.segments ?? []) as AnalysisSegment[];
  const prompts = (data.intel?.prompts ?? []) as AudiencePrompt[];
  const objective = (data.intel?.objective ?? "balanced") as EngagementObjective;

  /** Densidade adaptativa: cada janela pesa os trechos que a compõem. */
  const adaptiveCount = (from: number, to: number) => {
    const inside = segments.filter((s) => s.to >= from && s.from <= to);
    if (inside.length === 0) return Math.round(((to - from) / 60) * perMinute);
    let messages = 0;
    for (const segment of inside) {
      const overlap = Math.max(0, Math.min(to, segment.to) - Math.max(from, segment.from));
      if (overlap <= 0) continue;
      messages += (overlap / 60) * densityForSegment(segment, objective, perMinute);
    }
    return Math.round(messages);
  };

  const windows = Array.from({ length: total }, (_, index) => {
    const from = Math.round(start + index * step);
    const to = index === total - 1 ? end : Math.round(start + (index + 1) * step) - 1;
    const raw = data.intel ? adaptiveCount(from, to) : Math.round(((to - from) / 60) * perMinute);
    // Arranque: os primeiros minutos nunca começam fracos.
    const base = Math.round(raw * openingSurgeFactor(from, to));
    // Cada chamada direta do apresentador traz o seu próprio pico de respostas.
    const extra = promptsBetween(prompts, from, to).reduce(
      (sum, prompt) => sum + answersForPrompt(prompt, data.settings.participants),
      0,
    );
    // Piso do arranque: a sala enche sempre nos primeiros minutos.
    const openingFloor =
      from < 360 ? Math.round(((Math.min(to, 360) - from) / 60) * Math.max(8, perMinute * 2)) : 0;
    const howMany = Math.min(250, Math.max(2, openingFloor, base + extra));
    return { from, to, howMany };
  });

  // Quantidade pedida pelo organizador: mantemos a distribuição pelos
  // momentos, mas ajustamos o volume total ao alvo escolhido.
  const target = Number(data.settings.targetTotal ?? 0);
  if (target > 0) {
    const sum = windows.reduce((acc, w) => acc + w.howMany, 0) || 1;
    const factor = target / sum;
    for (const window of windows) {
      window.howMany = Math.min(250, Math.max(2, Math.round(window.howMany * factor)));
    }
  }

  // Método Nova: o elenco do webinar inteiro, fixo, para os trechos partilharem as mesmas pessoas.
  const cast = await castForWebinar(data.webinarId, data.settings, webinar, duration, data.intel);
  return { duration, start, end, windows, cast };
}

/**
 * O elenco de um webinar: os nomes que o apresentador diz (alunas) mais o público, com chegadas,
 * saídas e actividade determinísticas, e uma linha de situação por pessoa escrita pela IA uma vez.
 * Sem transcrição por palavra não há elenco (o caminho antigo continua a servir).
 */
async function castForWebinar(
  webinarId: string,
  settings: Settings,
  webinar: WebinarInfo,
  duration: number,
  intel?: { personas?: AnalysisPersona[] } | null,
): Promise<CastMember[]> {
  try {
    const engine = await import("@/lib/temporal/engine.server");
    const version = await engine.latestReadyVersion(webinarId);
    if (!version || version.precision !== "word" || version.sentences.length === 0) return [];
    const { blocks } = await ensureVersionBlocks(version, { ai: false });
    if (blocks.length === 0) return [];
    const cast = buildCast(
      {
        participants: settings.participants,
        countries: variantCountries(settings.variant),
        durationMs: duration * 1000,
        seed: hashSeed(`elenco:${webinarId}`),
        hostName: webinar.host_name,
      },
      namedPeople(blocks, webinar.host_name),
    );
    // As personas do mapa (modo Inteligente) dão a situação às primeiras pessoas do público.
    const personas = intel?.personas ?? [];
    let p = 0;
    for (const m of cast) {
      if (m.role !== "publico") continue;
      const persona = personas[p];
      if (!persona) break;
      m.situation = persona.profile.slice(0, 160);
      p += 1;
    }
    const missing = cast.filter((m) => !m.situation).slice(0, 120);
    if (missing.length > 0) {
      try {
        const result = await chatJson({
          task: "analysis",
          system: "Inventas, em uma linha cada, quem são as pessoas de um chat de webinar. Respondes só com o JSON pedido.",
          user: [
            `Webinar: "${webinar.public_title}".${webinar.description ? ` ${webinar.description.slice(0, 300)}` : ""}`,
            `Para cada pessoa, uma linha (até 18 palavras) com cidade, ocupação ou situação e porque está a ver este webinar. Pessoas comuns, variadas e plausíveis; as alunas já conhecem o apresentador e o curso dele. ${variantText(settings.variant)}`,
            "",
            ...missing.map((m) => `${m.id}: ${m.name}${m.role === "aluna" ? " (aluna)" : ""} · ${{ ao: "Angola", mz: "Moçambique", br: "Brasil", pt: "Portugal" }[m.country]}`),
          ].join("\n"),
          schema: CAST_SITUATIONS,
        });
        if (result.ok) {
          const parsed = result.json as { people?: { id?: unknown; situation?: unknown }[] };
          const byId = new Map(cast.map((m) => [m.id, m] as const));
          for (const row of parsed.people ?? []) {
            const m = byId.get(String(row.id ?? ""));
            if (m && !m.situation) m.situation = String(row.situation ?? "").trim().slice(0, 200);
          }
        }
      } catch {
        // Sem situações a IA escreve na mesma, só com nome, país e estilo.
      }
    }
    return serializeCast(cast);
  } catch {
    return [];
  }
}

export const planCommentWindows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: z.string().uuid(),
        settings: settingsSchema,
        transcript: transcriptSchema,
        range: boundsSchema.optional(),
        intel: intelSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => planCommentWindowsImpl(context.supabase, data));

/** Fase 2 — gera os comentários de uma única janela de tempo. */
export async function generateCommentsWindowImpl(supabase: any, data: any) {
  const webinar = await loadWebinar(supabase, data.webinarId);
  const duration = computeDuration(webinar, data.transcript);
  const intel = data.intel
    ? {
        objective: data.intel.objective as EngagementObjective,
        segments: data.intel.segments as AnalysisSegment[],
        personas: data.intel.personas as AnalysisPersona[],
        prompts: (data.intel.prompts ?? []) as unknown as AudiencePrompt[],
        moments: (data.intel.moments ?? []) as SemanticMoment[],
        audienceState: (data.intel.audienceState ?? []) as AudienceStatePoint[],
      }
    : undefined;
  const ctx: GenContext = {
    webinar,
    settings: data.settings,
    transcript: data.transcript,
    duration,
    start: data.bounds.start,
    end: boundedEnd(data.bounds, duration),
    intel,
  };
  // Oportunidades a partir dos tempos reais por palavra: sem elas, as
  // mensagens não teriam a que fala pertencem nem quando podem aparecer.
  let slots = (data.slots ?? []) as Opportunity[];
  if (slots.length === 0) {
    try {
      const engine = await import("@/lib/temporal/engine.server");
      const version = await engine.latestReadyVersion(data.webinarId);
      if (version && version.precision === "word" && version.sentences.length > 0) {
        const moments =
          version.moments.length > 0 ? version.moments : momentsFromSentences(version.sentences);
        slots = buildOpportunities({
          fromSeconds: data.window.from,
          toSeconds: data.window.to,
          events: version.events ?? [],
          moments,
          participants: Number(data.settings.participants ?? 40),
        });
      }
    } catch {
      // Sem oportunidades a IA continua a gerar, mas com menos precisão.
    }
  }

  const engine = await engineForRange(
    data.webinarId,
    data.window.from,
    data.window.to,
    data.settings,
    webinar,
  );
  // Método Nova: com elenco e blocos, o guião decide tudo menos o texto.
  const cast = (data.cast ?? []) as CastMember[];
  if (engine && cast.length > 0) {
    const comments = await novaWindow(ctx, engine, cast, data.window.from, data.window.to, data.existing);
    return { comments };
  }
  const comments = await askWindow(
    ctx,
    data.window.from,
    data.window.to,
    data.window.howMany,
    data.existing,
    intel,
    slots,
    engine,
  );
  return { comments };
}

export const generateCommentsWindow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: z.string().uuid(),
        settings: settingsSchema,
        transcript: transcriptSchema,
        window: z.object({
          from: z.number().int().min(0),
          to: z.number().int().min(0),
          howMany: z.number().int().min(1).max(250),
        }),
        bounds: boundsSchema,
        existing: existingSchema,
        intel: intelSchema,
        slots: z.array(z.any()).optional(),
        cast: castSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    billed(context.supabase, data.webinarId, "chat_generation", () =>
      generateCommentsWindowImpl(context.supabase, data),
    ),
  );

/** Fase 3 — revisão final da cronologia da timeline completa. */
export async function auditCommentsTimelineImpl(supabase: any, data: any) {
  const webinar = await loadWebinar(supabase, data.webinarId);
  const duration = computeDuration(webinar, data.transcript);
  // A revisão final também usa o mapa guardado, para apanhar antecipações.
  const { data: saved } = await supabase
    .from("webinar_analysis")
    .select("objective, segments, personas, prompts, moments, audience_state")
    .eq("webinar_id", data.webinarId)
    .maybeSingle();
  const ctx: GenContext = {
    webinar,
    settings: settingsSchema.parse({}),
    transcript: data.transcript,
    duration,
    start: data.bounds.start,
    end: boundedEnd(data.bounds, duration),
    intel: saved
      ? {
          objective: (saved.objective as EngagementObjective) ?? "balanced",
          segments: (saved.segments ?? []) as AnalysisSegment[],
          personas: (saved.personas ?? []) as AnalysisPersona[],
          prompts: (saved.prompts ?? []) as AudiencePrompt[],
          moments: (saved.moments ?? []) as SemanticMoment[],
          audienceState: (saved.audience_state ?? []) as AudienceStatePoint[],
        }
      : undefined,
  };
  const report: PlacementReport<Comment> = { dropped: [] };
  const finalList = await auditTimeline(ctx, data.comments as Comment[], report);
  // Devolve os comentários inteiros: a revisão só mexeu no instante.
  return {
    comments: finalList,
    dropped: report.dropped.map(({ comment, reason, detail }) => ({
      at: comment.at,
      author: comment.author,
      message: comment.message,
      reason,
      detail,
    })),
  };
}

export const auditCommentsTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: z.string().uuid(),
        transcript: transcriptSchema,
        bounds: boundsSchema,
        comments: z.array(fullCommentSchema).max(1500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    billed(context.supabase, data.webinarId, "chat_generation", () =>
      auditCommentsTimelineImpl(context.supabase, data),
    ),
  );

/**
 * Geração pontual (regerar um comentário, gerar mais num trecho): uma única
 * janela, curta o suficiente para caber numa chamada.
 */
export async function generateEngagementCommentsImpl(supabase: any, data: any) {
  const webinar = await loadWebinar(supabase, data.webinarId);
  const duration = computeDuration(webinar, data.transcript);
  const { start, end } = computeBounds(data.range, duration);
  const perMinute = perMinuteOf(data.settings);

  const ctx: GenContext = {
    webinar,
    settings: data.settings,
    transcript: data.transcript,
    duration,
    start,
    end,
  };

  const howMany =
    data.count ?? Math.max(2, Math.min(60, Math.round(((end - start) / 60) * perMinute)));
  const engine = await engineForRange(data.webinarId, start, end, data.settings, webinar);
  const comments = await askWindow(
    ctx,
    start,
    end,
    howMany,
    data.existing,
    undefined,
    undefined,
    engine,
  );
  if (comments.length === 0) throw new Error("A IA não conseguiu criar comentários desta vez.");

  const report: PlacementReport<Comment> = { dropped: [] };
  const finalList = fixCausality(ctx, comments, report);
  return { comments: finalList, dropped: report.dropped.length };
}

export const generateEngagementComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateSchema.parse(data))
  .handler(async ({ data, context }) =>
    billed(context.supabase, data.webinarId, "chat_generation", () =>
      generateEngagementCommentsImpl(context.supabase, data),
    ),
  );

/** Lê o mapa guardado do webinar, para o editor mostrar heatmap, insights e score. */
export const getWebinarAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ webinarId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("webinar_analysis")
      .select(
        "objective, duration_seconds, segments, personas, prompts, moments, audience_state, insights, rescue, score",
      )
      .eq("webinar_id", data.webinarId)
      .maybeSingle();

    if (!row) return { analysis: null as WebinarAnalysis | null };

    const analysis: WebinarAnalysis = {
      objective: (row.objective as EngagementObjective) ?? "balanced",
      durationSeconds: row.duration_seconds ?? 0,
      segments: (row.segments ?? []) as WebinarAnalysis["segments"],
      personas: (row.personas ?? []) as WebinarAnalysis["personas"],
      prompts: (row.prompts ?? []) as WebinarAnalysis["prompts"],
      moments: (row.moments ?? []) as SemanticMoment[],
      audienceState: (row.audience_state ?? []) as AudienceStatePoint[],
      insights: (row.insights ?? []) as WebinarAnalysis["insights"],
      rescue: (row.rescue ?? []) as WebinarAnalysis["rescue"],
      score: (row.score ?? {}) as WebinarAnalysis["score"],
    };
    return { analysis };
  });

/** Impressão digital do vídeo: se mudar, a transcrição guardada deixa de servir. */
export async function videoFingerprint(
  supabase: { from: (table: string) => any },
  webinarId: string,
): Promise<{ organizationId: string | null; videoSourceId: string | null; fingerprint: string }> {
  const { data: row } = await supabase
    .from("webinars")
    .select("organization_id, video_source_id, video_sources(source_url, storage_path)")
    .eq("id", webinarId)
    .maybeSingle();
  const source = (
    Array.isArray(row?.video_sources) ? row?.video_sources[0] : row?.video_sources
  ) as { source_url: string | null; storage_path: string | null } | null | undefined;
  return {
    organizationId: row?.organization_id ?? null,
    videoSourceId: row?.video_source_id ?? null,
    fingerprint: `${row?.video_source_id ?? ""}|${source?.source_url ?? ""}|${source?.storage_path ?? ""}`,
  };
}

/** Devolve a transcrição já guardada deste vídeo (evita transcrever outra vez). */
export async function getWebinarTranscriptImpl(supabase: any, data: any) {
  const { data: row } = await supabase
    .from("webinar_transcripts")
    .select("segments, duration_seconds, video_fingerprint, updated_at")
    .eq("webinar_id", data.webinarId)
    .maybeSingle();
  if (!row) return { transcript: [] as TranscriptSegment[], updatedAt: null as string | null };

  const current = await videoFingerprint(supabase as never, data.webinarId);
  // Vídeo trocado desde a última transcrição: recomeçamos do zero.
  if (row.video_fingerprint && row.video_fingerprint !== current.fingerprint) {
    return { transcript: [] as TranscriptSegment[], updatedAt: null as string | null };
  }
  return {
    transcript: (row.segments ?? []) as TranscriptSegment[],
    updatedAt: (row.updated_at as string) ?? null,
  };
}

export const getWebinarTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ webinarId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => getWebinarTranscriptImpl(context.supabase, data));

/** Guarda a transcrição completa para reaproveitar nas próximas gerações. */
export async function saveWebinarTranscriptImpl(supabase: any, data: any) {
  if (data.transcript.length === 0) return { ok: false as const };
  const current = await videoFingerprint(supabase as never, data.webinarId);
  if (!current.organizationId) return { ok: false as const };
  const duration = (data.transcript as TranscriptSegment[]).reduce(
    (max: number, s: TranscriptSegment) => Math.max(max, s.at),
    0,
  );
  await supabase.from("webinar_transcripts").upsert(
    {
      webinar_id: data.webinarId,
      organization_id: current.organizationId,
      video_source_id: current.videoSourceId,
      video_fingerprint: current.fingerprint,
      duration_seconds: Math.round(duration),
      segments: data.transcript,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "webinar_id" },
  );
  return { ok: true as const };
}

export const saveWebinarTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: z.string().uuid(),
        transcript: z.array(z.object({ at: z.number(), text: z.string() })),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => saveWebinarTranscriptImpl(context.supabase, data));

/* ------------------------------------------------------------------ *
 * Sincronizar comentários com a fala
 *
 * Reposiciona comentários já existentes em cima da transcrição: cada
 * mensagem passa a aparecer logo a seguir à frase que a justifica, em
 * vez de ficar atrasada em relação ao que está a ser dito.
 * ------------------------------------------------------------------ */

type SyncComment = { id: string; at: number; author: string; message: string };

async function syncBatch(
  lines: TranscriptSegment[],
  batch: SyncComment[],
  duration: number,
): Promise<Record<string, number>> {
  const prompt = [
    "Transcrição do webinar (segundo — fala):",
    ...lines.map((line) => `${line.at} — ${line.text}`),
    "",
    "Mensagens de chat já escritas (id | segundo atual | autor | mensagem):",
    ...batch.map((c) => `${c.id} | ${c.at} | ${c.author} | ${c.message}`),
    "",
    "Tarefa: corrigir o segundo de cada mensagem para o momento REAL da fala a que ela responde ou reage.",
    "Regras:",
    `- Uma reação aparece ${TIMING.react} de a ideia ficar clara.`,
    `- Uma resposta a uma pergunta direta do apresentador aparece ${TIMING.answer} da pergunta.`,
    "- Nunca antecipar: ninguém pode comentar algo antes de ser dito.",
    "- Não empilhar: evite dois segundos iguais; espalhe de forma irregular.",
    "- Mantenha o texto e o autor exatamente iguais; só muda o segundo.",
    `- Todos os segundos entre 0 e ${Math.round(duration)}.`,
  ].join("\n");

  const result = await chatJson({
    task: "analysis",
    system: "És um editor de timing de chat ao vivo. Alinhas mensagens com a fala do apresentador.",
    user: prompt,
    schema: SPEECH_SYNC,
  });
  if (!result.ok) throw new AIError(result);

  const parsed = result.json as {
    comments?: { id?: unknown; at?: unknown }[];
  };

  const map: Record<string, number> = {};
  for (const item of parsed.comments ?? []) {
    const id = String(item.id ?? "");
    const at = Math.round(Number(item.at));
    if (id && Number.isFinite(at) && at >= 0) map[id] = Math.min(Math.round(duration), at);
  }
  return map;
}

/**
 * Realinha um lote de comentários programados com os momentos reais da
 * transcrição. O cliente pode chamar esta função várias vezes, passando os
 * segundos já ocupados, para mostrar progresso enquanto sincroniza muitos
 * comentários.
 */
export async function syncCommentsWithSpeechImpl(supabase: any, data: any) {
  let transcript = data.transcript;
  // Se o editor ainda não tem a transcrição em memória, usamos a guardada.
  if (transcript.length === 0) {
    const { data: row } = await supabase
      .from("webinar_transcripts")
      .select("segments")
      .eq("webinar_id", data.webinarId)
      .maybeSingle();
    transcript = ((row?.segments ?? []) as TranscriptSegment[]).filter(
      (line) => typeof line?.at === "number" && typeof line?.text === "string",
    );
  }
  if (transcript.length === 0)
    throw new Error(
      "Ainda não existe transcrição guardada deste vídeo. Gere o chat com IA uma vez para a criar.",
    );

  const duration =
    (transcript as TranscriptSegment[]).reduce(
      (max: number, s: TranscriptSegment) => Math.max(max, s.at),
      0,
    ) + 30;
  const ordered = [...data.comments].sort((a, b) => a.at - b.at);

  const from = Math.max(0, (ordered[0]?.at ?? 0) - 180);
  const to = (ordered[ordered.length - 1]?.at ?? duration) + 300;
  // Damos o trecho falado à volta do lote, com detalhe suficiente para
  // encontrar a frase certa.
  const around = (transcript as TranscriptSegment[]).filter(
    (line: TranscriptSegment) => line.at >= from && line.at <= to,
  );
  const lines = condenseTranscript(around.length > 0 ? around : transcript, 160, 400);
  const map = await syncBatch(lines, ordered, duration);

  // Garante segundos únicos, respeitando os já ocupados pelos lotes anteriores.
  const used = new Set<number>(data.occupiedSeconds);
  const updates: { id: string; at: number }[] = [];
  for (const comment of ordered) {
    const next = map[comment.id];
    if (typeof next !== "number") continue;
    let at = Math.min(Math.round(duration), Math.max(0, next));
    while (used.has(at)) at += 1;
    used.add(at);
    updates.push({ id: comment.id, at });
  }

  return { updates, usedSeconds: Array.from(used) };
}

/**
 * Mede um vídeo da biblioteca (HLS, Bunny, página com o vídeo) e grava a duração. O browser não lê a
 * duração de um .m3u8 nem de um leitor embebido: estes vídeos ficavam com 0 e a sessão sem fim certo.
 */
export const measureVideoSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ videoSourceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Lido com a sessão de quem pede: só um vídeo da organização dele.
    const { data: source } = await context.supabase
      .from("video_sources")
      .select("id, source_url, duration_seconds")
      .eq("id", data.videoSourceId)
      .maybeSingle();
    if (!source?.source_url) return { duration: source?.duration_seconds ?? 0 };
    const measured = await measureDuration(source.source_url).catch(() => 0);
    if (measured > 0 && measured !== source.duration_seconds) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("video_sources").update({ duration_seconds: measured }).eq("id", source.id);
    }
    return { duration: measured || source.duration_seconds || 0 };
  });
