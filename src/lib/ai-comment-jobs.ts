import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import {
  analyseWebinarStructure,
  auditCommentsTimeline,
  generateCommentsWindow,
  generateEngagementComments,
  planCommentWindows,
} from "@/lib/ai-comments.functions";
import type { EngagementObjective, WebinarAnalysis } from "@/lib/engagement-analysis";
import { friendlyError } from "@/lib/friendly-error";
import { pollWordTranscription, startWordTranscription } from "@/lib/temporal/transcribe.functions";
import type { CommentCausality } from "@/lib/temporal/types";
import { classifyTranscriptBlocks } from "@/lib/chat-engine/classify.functions";
import { finalizeCommentsTimeline } from "@/lib/chat-engine/finalize.functions";
import type { FinalizeReport } from "@/lib/chat-engine/finalize.server";
import type { BlockType, Dependency, InteractionType } from "@/lib/chat-engine/types";

export type DraftComment = {
  at: number;
  /** Instante exato em milissegundos, vindo dos tempos por palavra. */
  atMs?: number;
  author: string;
  message: string;
  moment: string;
  /** Relação com a fala do apresentador, quando a IA a declarou. */
  kind?: "provoca" | "reage" | "responde" | "espontaneo";
  /** Persona simulada que assina a mensagem, no modo Inteligente. */
  persona?: string;
  /** Segundo da fala relacionada, quando existe. */
  anchor?: number | null;
  /** Porque é que esta pessoa escreve isto neste segundo. */
  reason?: string;
  /** Causa temporal resolvida pelo motor temporal. */
  causality?: CommentCausality;
  validationAction?: string | null;
  validationRule?: string | null;
  transcriptVersionId?: string | null;
  /** Motor do chat: o bloco de fala de onde a mensagem nasce e a sua dependência. */
  slot?: string | null;
  dependency?: Dependency;
  blockId?: string | null;
  blockType?: BlockType | null;
  interaction?: InteractionType | null;
  windowStartMs?: number | null;
  windowEndMs?: number | null;
  confidence?: number;
  needsReview?: boolean;
  profileId?: string | null;
  replyTo?: string | null;
};
export type TranscriptSegment = { at: number; text: string };

/** Comentário tal como sai de uma janela de geração. */
export type WindowComment = {
  at: number;
  atMs?: number;
  author: string;
  message: string;
  moment: string;
  kind: "provoca" | "reage" | "responde" | "espontaneo";
  anchor: number | null;
  reason?: string;
  slot?: string | null;
  dependency?: Dependency;
  blockId?: string | null;
  blockType?: BlockType | null;
  interaction?: InteractionType | null;
  windowStartMs?: number | null;
  windowEndMs?: number | null;
  confidence?: number;
  profileId?: string | null;
};

/** O que já foi feito, para que uma nova tentativa continue em vez de repetir. */
export type AiJobPartial = {
  analysis?: WebinarAnalysis | null;
  collected: WindowComment[];
  doneWindows: string[];
  totalWindows: number;
  /** O elenco do Método Nova: as mesmas pessoas em todos os trechos, também numa nova tentativa. */
  cast?: unknown[];
};

export type AiSettings = {
  /** Que português e que nomes: ver chatVariant em chat-variants. */
  variant: string;
  level: "low" | "medium" | "high" | "very-high";
  participants: number;
  emojis: "low" | "normal" | "high";
  tone: "natural" | "excited" | "professional" | "custom";
  customTone: string;
  densityByMoment: boolean;
  /** Segundos médios entre comentários. Zero segue o nível de engajamento. */
  frequency: number;
  /** Total aproximado de comentários a gerar. Zero deixa ao ritmo automático. */
  targetTotal: number;
  /** "rapido" mantém o gerador de sempre; "inteligente" usa o motor de análise. */
  mode: "rapido" | "inteligente";
  /** Só no modo Inteligente: o que a estratégia deve privilegiar. */
  objective: EngagementObjective;
};

export const defaultAiSettings: AiSettings = {
  variant: "pt-PT",
  level: "medium",
  participants: 25,
  emojis: "normal",
  tone: "natural",
  customTone: "",
  densityByMoment: true,
  frequency: 0,
  targetTotal: 0,
  mode: "inteligente",
  objective: "balanced",
};

export const AI_JOB_STAGES = [
  "A analisar o vídeo",
  "A transcrever",
  "A ler a fala em blocos e a traçar a estratégia",
  "A criar as interações e a rever a cronologia",
  "Concluído",
] as const;

export type AiJob = {
  webinarId: string;
  webinarTitle: string;
  status: "running" | "ready" | "error";
  stage: number;
  note: string;
  error: string;
  drafts: DraftComment[] | null;
  transcript: TranscriptSegment[];
  settings: AiSettings;
  replaceAll: boolean;
  range?: { start: number; end: number };
  startedAt: number;
  /** Progresso aproximado da etapa em curso, de 0 a 100. */
  progress?: number | null;
  /** Mapa do webinar produzido pelo modo Inteligente. */
  analysis?: WebinarAnalysis | null;
  /** Trabalho já feito, guardado para uma nova tentativa continuar daí. */
  partial?: AiJobPartial | null;
  /** O editor já abriu a revisão deste resultado: não volta a saltar para o Chat ao abrir. */
  seen?: boolean;
  /** O que a validação final fez: quantos ficaram, quantos foram movidos ou eliminados, e porquê. */
  validation?: Omit<FinalizeReport, "issues"> | null;
};

const STORE_KEY = "novawebinar:ai-jobs";

const jobs = new Map<string, AiJob>();
const listeners = new Set<() => void>();
const EMPTY: AiJob[] = [];
let snapshot: AiJob[] = EMPTY;
let hydrated = false;

/** Guarda os trabalhos no browser para nada se perder ao recarregar ou mudar de página. */
function persist() {
  if (typeof window === "undefined") return;
  try {
    // A transcrição completa pode ultrapassar facilmente o limite do localStorage.
    // Ela só é necessária durante a chamada em curso; o resultado a rever não.
    const stored = [...jobs.values()].map((job) => ({
      ...job,
      transcript: job.status === "running" ? job.transcript : [],
    }));
    window.localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  } catch {
    // Última tentativa, ainda mais compacta, para nunca perder os comentários gerados.
    try {
      const stored = [...jobs.values()].map((job) => ({
        ...job,
        transcript: [],
        note: "",
        partial: null,
      }));
      window.localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch {
      /* armazenamento indisponível */
    }
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as AiJob[];
    for (const job of saved) {
      if (!job?.webinarId) continue;
      // Um trabalho que ficou a meio quando a página fechou não pode continuar: fica como falha.
      jobs.set(
        job.webinarId,
        job.status === "running"
          ? {
              ...job,
              status: "error",
              error:
                job.partial && job.partial.collected.length > 0
                  ? `A geração foi interrompida quando a página fechou. Já estão guardados ${job.partial.doneWindows.length} de ${job.partial.totalWindows} trechos: ao gerar outra vez, continuamos daí.`
                  : "A geração foi interrompida quando a página fechou. Toque em gerar outra vez.",
            }
          : job,
      );
    }
    snapshot = jobs.size === 0 ? EMPTY : [...jobs.values()];
  } catch {
    /* dados inválidos */
  }
}

function emit() {
  snapshot = jobs.size === 0 ? EMPTY : [...jobs.values()];
  persist();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  hydrate();
  return snapshot;
}

function getServerSnapshot() {
  return EMPTY;
}

function patch(webinarId: string, changes: Partial<AiJob>) {
  const current = jobs.get(webinarId);
  if (!current) return;
  jobs.set(webinarId, { ...current, ...changes });
  emit();
}

export function useAiJobs() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useAiJob(webinarId?: string) {
  const all = useAiJobs();
  if (!webinarId) return undefined;
  return all.find((job) => job.webinarId === webinarId);
}

export function dismissAiJob(webinarId: string) {
  hydrate();
  jobs.delete(webinarId);
  emit();
}

export function markAiJobSeen(webinarId: string) {
  hydrate();
  patch(webinarId, { seen: true });
}

export function setAiJobDrafts(webinarId: string, drafts: DraftComment[]) {
  hydrate();
  patch(webinarId, { drafts });
}

export function startAiJob(input: {
  webinarId: string;
  webinarTitle: string;
  settings: AiSettings;
  transcript: TranscriptSegment[];
  existing: { at: number; author: string; message: string }[];
  replaceAll: boolean;
  range?: { start: number; end: number };
  onTranscript?: (segments: TranscriptSegment[]) => void;
}) {
  const { webinarId } = input;
  hydrate();
  const previous = jobs.get(webinarId);
  if (previous?.status === "running") return;

  // Se a tentativa anterior falhou a meio, continuamos de onde ficou:
  // o mapa do webinar e os trechos já gerados não são repetidos.
  const sameRun =
    previous?.status === "error" &&
    previous.replaceAll === input.replaceAll &&
    JSON.stringify(previous.range ?? null) === JSON.stringify(input.range ?? null) &&
    JSON.stringify(previous.settings) === JSON.stringify(input.settings);
  const resume: AiJobPartial | null =
    sameRun && previous?.partial && previous.partial.collected.length > 0 ? previous.partial : null;

  jobs.set(webinarId, {
    webinarId,
    webinarTitle: input.webinarTitle,
    status: "running",
    stage: 0,
    note: resume
      ? `A continuar de onde parou: ${resume.doneWindows.length} de ${resume.totalWindows} trechos já feitos.`
      : "",
    error: "",
    drafts: null,
    transcript: input.transcript,
    settings: input.settings,
    replaceAll: input.replaceAll,
    ...(input.range ? { range: input.range } : {}),
    startedAt: Date.now(),
    ...(resume ? { partial: resume, analysis: resume.analysis ?? null } : { partial: null }),
  });
  emit();

  void (async () => {
    try {
      // Só existe um caminho: transcrição palavra a palavra (AssemblyAI).
      // Nunca reaproveitamos nem criamos transcrições por blocos.
      let segments: TranscriptSegment[] = [];
      let wordFailure: string | null = null;
      {
        patch(webinarId, { stage: 1, note: "A medir o vídeo antes de transcrever" });

        let wordSegments: TranscriptSegment[] = [];
        try {
          const started = await startWordTranscription({ data: { webinarId } });
          if (started.status === "reused" && started.segments.length > 0) {
            wordSegments = started.segments;
          } else if (started.status === "unavailable") {
            wordFailure = started.reason ?? "Motor por palavra indisponível.";
          } else if (started.status === "started") {
            let handle = started.handle;
            const versionId = started.versionId ?? null;
            const duration = started.duration ?? 0;
            const began = Date.now();
            for (let tick = 0; tick < 600; tick += 1) {
              const step = await pollWordTranscription({
                data: { webinarId, handle, versionId, duration },
              });
              if (step.status === "running") {
                handle = step.handle;
                const elapsed = (Date.now() - began) / 1000;
                const mins = Math.floor(elapsed / 60);
                const secs = Math.floor(elapsed % 60);
                // O motor não devolve percentagem: estimamos pelo tempo do vídeo.
                const expected = Math.max(45, (duration || 1800) * 0.12);
                const pct = Math.min(95, Math.round((elapsed / expected) * 95));
                const left = Math.max(0, Math.round(expected - elapsed));
                patch(webinarId, {
                  stage: 1,
                  progress: pct,
                  note: `A transcrever palavra a palavra: ${pct}% (${mins}m ${secs}s decorridos, faltam cerca de ${Math.floor(left / 60)}m ${left % 60}s)`,
                });
                await new Promise((resolve) => setTimeout(resolve, 5000));
                continue;
              }
              if (step.status === "done") wordSegments = step.segments;
              break;
            }
          }
        } catch (error) {
          wordFailure = friendlyError(error, "Não foi possível transcrever o vídeo.");
        }

        if (wordSegments.length > 0) {
          segments = wordSegments.sort((a, b) => a.at - b.at);
          const end = segments[segments.length - 1]?.at ?? 0;
          // O motor por palavra só devolve o texto no fim. Mostramos as frases
          // a aparecer para acompanhar a transcrição em vez de um salto seco.
          const stepSize = Math.max(1, Math.ceil(segments.length / 40));
          for (let shown = stepSize; shown < segments.length; shown += stepSize) {
            patch(webinarId, {
              stage: 1,
              progress: Math.round((shown / segments.length) * 100),
              transcript: segments.slice(0, shown),
              note: `A receber a transcrição: ${shown} de ${segments.length} frases`,
            });
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          patch(webinarId, {
            stage: 2,
            progress: null,
            transcript: segments,
            note: `Transcrição completa com tempos por palavra até ao minuto ${Math.round(end / 60)}: ${segments.length} frases.`,
          });
          input.onTranscript?.(segments);
        }
      }

      if (segments.length === 0) {
        // Só trabalhamos com transcrição palavra a palavra. Sem ela, não há
        // geração: comentários sem tempos reais chegariam fora de hora.
        patch(webinarId, {
          status: "error",
          progress: null,
          error: `${wordFailure ?? "Não foi possível transcrever o vídeo palavra a palavra."} Sem esta transcrição não geramos comentários — verifique o vídeo do webinar e tente de novo.`,
          note: "",
        });
        return;
      }
      patch(webinarId, {
        stage: 2,
        note: "A ler a fala em blocos: perguntas, pedidos, leituras do chat, oferta",
      });
      // A fala fica classificada em blocos uma vez (regras e IA) e guardada na
      // transcrição: é daí que nascem as oportunidades de cada trecho.
      try {
        const classified = await classifyTranscriptBlocks({ data: { webinarId } });
        if (classified.total > 0) {
          const asks =
            (classified.byType.QUESTION_TO_AUDIENCE ?? 0) +
            (classified.byType.COMMENT_REQUEST ?? 0) +
            (classified.byType.FEEDBACK_REQUEST ?? 0) +
            (classified.byType.POLL ?? 0);
          const reads =
            (classified.byType.CHAT_READING ?? 0) + (classified.byType.CHAT_RESPONSE ?? 0);
          patch(webinarId, {
            note: `${classified.total} blocos de fala: ${asks} pedidos ao público, ${reads} leituras do chat.`,
          });
        }
      } catch {
        // Sem classificação por IA as regras continuam a valer na geração.
      }

      // Modo Inteligente: antes de escrever uma única mensagem, a IA lê o
      // webinar inteiro e monta o mapa, as personas e a estratégia.
      let intel:
        | {
            objective: EngagementObjective;
            segments: WebinarAnalysis["segments"];
            personas: WebinarAnalysis["personas"];
            prompts: WebinarAnalysis["prompts"];
            moments: NonNullable<WebinarAnalysis["moments"]>;
            audienceState: NonNullable<WebinarAnalysis["audienceState"]>;
          }
        | undefined;

      if (input.settings.mode === "inteligente") {
        patch(webinarId, { note: "A compreender o webinar e a traçar a estratégia" });
        // No modo Inteligente a geração só arranca depois do mapa global.
        // Uma falha momentânea tem segunda tentativa antes de desistir dele.
        let structure: Awaited<ReturnType<typeof analyseWebinarStructure>> | null = null;
        // Numa nova tentativa, o mapa já feito é reaproveitado tal como está.
        if (resume?.analysis)
          structure = { analysis: resume.analysis } as unknown as typeof structure;
        for (let attempt = 0; attempt < 2 && !structure; attempt += 1) {
          try {
            structure = await analyseWebinarStructure({
              data: {
                webinarId,
                transcript: segments,
                objective: input.settings.objective,
                participants: input.settings.participants,
                variant: input.settings.variant,
              },
            });
          } catch {
            if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }

        if (structure) {
          patch(webinarId, { analysis: structure.analysis, note: "" });
          intel = {
            objective: structure.analysis.objective,
            segments: structure.analysis.segments,
            personas: structure.analysis.personas,
            prompts: structure.analysis.prompts ?? [],
            moments: structure.analysis.moments ?? [],
            audienceState: structure.analysis.audienceState ?? [],
          };
        } else {
          patch(webinarId, {
            note: "Não foi possível analisar a estrutura do webinar. Seguimos com a geração normal.",
          });
        }
      }

      const base = {
        webinarId,
        settings: input.settings,
        transcript: segments,
        ...(input.range ? { range: input.range } : {}),
        existing: input.replaceAll ? [] : input.existing,
        ...(intel ? { intel } : {}),
      };

      // Um trecho pequeno cabe numa chamada; a live inteira é gerada janela a
      // janela, porque uma única chamada longa é cortada pela plataforma.
      if (input.range) {
        const result = await generateEngagementComments({ data: base });
        patch(webinarId, { stage: 4, status: "ready", drafts: result.comments, partial: null });
      } else {
        const plan = await planCommentWindows({ data: base });
        // O elenco de uma tentativa anterior mantém-se: as pessoas não mudam a meio.
        const cast = (resume?.cast?.length ? resume.cast : plan.cast) as typeof plan.cast;
        const windowKey = (w: { from: number; to: number }) => `${w.from}-${w.to}`;
        // Trechos já concluídos numa tentativa anterior não voltam a ser gerados.
        const doneWindows = new Set(resume?.doneWindows ?? []);
        const collected: WindowComment[] = resume ? [...resume.collected] : [];
        const pending = plan.windows.filter((w) => !doneWindows.has(windowKey(w)));

        let failedWindows = 0;
        // Última razão real de falha de um trecho, para não esconder o erro.
        let lastWindowError = "";

        // Vários trechos ao mesmo tempo: a geração fica bastante mais rápida
        // do que trecho a trecho, sem sobrecarregar os pedidos à IA.
        const PARALLEL = 6;

        const savePartial = () =>
          patch(webinarId, {
            partial: {
              analysis: jobs.get(webinarId)?.analysis ?? null,
              collected,
              doneWindows: [...doneWindows],
              totalWindows: plan.windows.length,
              cast,
            },
          });
        savePartial();

        let done = plan.windows.length - pending.length;
        for (let i = 0; i < pending.length; i += PARALLEL) {
          const batch = pending.slice(i, i + PARALLEL);
          const snapshotExisting = [...base.existing, ...collected];
          const results = await Promise.all(
            batch.map(async (window) => {
              // Falhas momentâneas da IA (limite de pedidos, falha de rede)
              // têm uma segunda tentativa antes de desistir do trecho.
              for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                  const result = await generateCommentsWindow({
                    data: {
                      ...base,
                      // A janela leva a transcrição literal do seu intervalo; o
                      // conhecimento do webinar inteiro chega pelo mapa global.
                      transcript: segments.filter(
                        (s) => s.at >= window.from - 120 && s.at <= window.to + 120,
                      ),
                      window,
                      bounds: { start: plan.start, end: plan.end },
                      existing: snapshotExisting,
                      cast,
                    },
                  });
                  return result.comments as WindowComment[];
                } catch (error) {
                  lastWindowError = friendlyError(error, "");
                  await new Promise((resolve) => setTimeout(resolve, 3000));
                }
              }
              return null;
            }),
          );
          results.forEach((result, index) => {
            // Um trecho que falhe não deita fora o trabalho já feito: seguimos
            // em frente e avisamos no fim quantos trechos ficaram por gerar.
            if (result) {
              collected.push(...result);
              const key = batch[index];
              if (key) doneWindows.add(windowKey(key));
            } else failedWindows += 1;
          });
          done += batch.length;
          patch(webinarId, {
            stage: 3,
            note: `Trecho ${Math.min(done, plan.windows.length)} de ${plan.windows.length}`,
          });
          // Guardamos o progresso a cada lote: se algo falhar a seguir,
          // a próxima tentativa continua a partir daqui.
          savePartial();
        }

        if (collected.length === 0) {
          throw new Error(
            lastWindowError
              ? `A IA não conseguiu criar comentários desta vez. ${lastWindowError}`
              : "A IA não conseguiu criar comentários desta vez.",
          );
        }

        patch(webinarId, { stage: 3, note: "A rever a cronologia" });
        const personaNames = new Set((intel?.personas ?? []).map((p) => p.name));
        const decorate = (comment: {
          at: number;
          atMs?: number;
          author: string;
          message: string;
          moment: string;
          kind?: "provoca" | "reage" | "responde" | "espontaneo";
          anchor?: number | null;
          reason?: string;
        }): DraftComment => {
          const origin = collected.find(
            (c) => c.author === comment.author && c.message === comment.message,
          );
          const kind = comment.kind ?? origin?.kind;
          // O tempo exato (ms) vem da fala que provocou a mensagem. A revisão
          // devolve-o já em sintonia com `at`; o original é só a reserva.
          const atMs = comment.atMs ?? origin?.atMs ?? null;
          const anchor = comment.anchor ?? origin?.anchor ?? null;
          const reason = comment.reason ?? origin?.reason ?? "";
          const slot = (comment as { slot?: string | null }).slot ?? origin?.slot ?? null;
          return {
            at: comment.at,
            ...(atMs != null ? { atMs } : {}),
            author: comment.author,
            message: comment.message,
            moment: comment.moment,
            ...(kind ? { kind } : {}),
            anchor,
            ...(reason ? { reason } : {}),
            ...(personaNames.has(comment.author) ? { persona: comment.author } : {}),
            slot,
            ...(origin?.dependency ? { dependency: origin.dependency } : {}),
            ...(origin?.blockId ? { blockId: origin.blockId } : {}),
            ...(origin?.blockType ? { blockType: origin.blockType } : {}),
            ...(origin?.interaction ? { interaction: origin.interaction } : {}),
            ...(origin?.windowStartMs != null ? { windowStartMs: origin.windowStartMs } : {}),
            ...(origin?.windowEndMs != null ? { windowEndMs: origin.windowEndMs } : {}),
            ...(origin?.confidence != null ? { confidence: origin.confidence } : {}),
            ...(origin?.profileId ? { profileId: origin.profileId } : {}),
          };
        };

        let finalComments: DraftComment[] = collected.map(decorate);
        // Comentários sem lugar válido até ao fim do vídeo, descartados pela revisão.
        let droppedByAudit = 0;
        try {
          const audited = await auditCommentsTimeline({
            data: {
              webinarId,
              transcript: segments,
              bounds: { start: plan.start, end: plan.end },
              comments: collected,
            },
          });
          finalComments = audited.comments.map(decorate);
          droppedByAudit = audited.dropped.length;
        } catch {
          // A revisão final é um extra: se falhar, entregamos os comentários
          // gerados por ordem, em vez de perder tudo.
          finalComments.sort((a, b) => a.at - b.at);
        }
        // Passagem final: cada mensagem ligada ao seu bloco de fala, dez
        // verificações de cronologia, causa, confiança e o que foi corrigido.
        patch(webinarId, { stage: 3, note: "A validar a cronologia contra a fala" });
        let validation: AiJob["validation"] = null;
        try {
          const perMinute =
            input.settings.frequency > 0
              ? 60 / input.settings.frequency
              : ({ low: 2.2, medium: 5, high: 10, "very-high": 16 }[input.settings.level] ?? 5);
          const finalized = await finalizeCommentsTimeline({
            data: {
              webinarId,
              comments: finalComments.map((c) => ({
                at: c.at,
                atMs: c.atMs ?? null,
                author: c.author,
                message: c.message,
                moment: c.moment,
                kind: c.kind ?? null,
                anchor: c.anchor ?? null,
                slot: c.slot ?? null,
                dependency: c.dependency ?? null,
                reason: c.reason ?? null,
                ...(c.persona ? { persona: c.persona } : {}),
              })),
              participants: Math.max(3, Math.min(5000, input.settings.participants)),
              perMinute: Math.max(1, Math.min(120, perMinute)),
            },
          });
          if (finalized.report) {
            const { issues: _issues, ...summary } = finalized.report;
            validation = summary;
            finalComments = finalized.comments.map((c) => ({
              at: c.at,
              atMs: c.atMs,
              author: c.author,
              message: c.message,
              moment: c.moment ?? "geral",
              kind: (c.kind ?? "espontaneo") as NonNullable<DraftComment["kind"]>,
              ...(c.persona ? { persona: c.persona } : {}),
              anchor: c.anchor ?? null,
              ...(c.reason ? { reason: c.reason } : {}),
              causality: c.causality,
              validationAction: c.validationAction,
              validationRule: c.validationRule,
              transcriptVersionId: c.transcriptVersionId,
              slot: c.slot ?? null,
              dependency: c.dependency,
              blockId: c.blockId,
              blockType: c.blockType,
              interaction: c.interaction,
              windowStartMs: c.windowStartMs,
              windowEndMs: c.windowEndMs,
              confidence: c.confidence,
              needsReview: c.needsReview,
              ...(c.replyTo ? { replyTo: c.replyTo } : {}),
            }));
          }
        } catch {
          // Sem a passagem final, os comentários seguem como a geração os deixou.
        }
        const notes = [
          failedWindows > 0 ? `${failedWindows} trecho(s) ficaram por gerar.` : "",
          droppedByAudit > 0
            ? `${droppedByAudit} comentário(s) ficaram de fora por não haver espaço até ao fim do vídeo.`
            : "",
          validation
            ? `Validação: ${validation.kept} mensagens em ${validation.slots} oportunidades de ${validation.blocks} blocos; ${validation.moved} movidas, ${validation.corrected} corrigidas, ${validation.removed} eliminadas.`
            : "",
        ].filter(Boolean);
        patch(webinarId, {
          stage: 4,
          status: "ready",
          drafts: finalComments,
          partial: null,
          validation,
          note: notes.join(" "),
        });
      }

      const done = jobs.get(webinarId);
      const total = done?.drafts?.length ?? 0;
      toast.success(`Chat gerado: ${total} comentários à sua espera`, {
        description: `“${input.webinarTitle}” · nada foi publicado. Reveja e aprove quando quiser.`,
        duration: 15000,
      });
    } catch (error) {
      const kept = jobs.get(webinarId)?.partial;
      const progress =
        kept && kept.collected.length > 0
          ? ` Já estão guardados ${kept.doneWindows.length} de ${kept.totalWindows} trechos: ao gerar outra vez, continuamos daí.`
          : "";
      const message = friendlyError(error, "Não foi possível gerar os comentários.") + progress;
      patch(webinarId, { status: "error", error: message });
      toast.error("A geração do chat falhou", { description: message, duration: 15000 });
    }
  })();
}
