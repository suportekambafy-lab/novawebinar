/**
 * Transcrição com tempos por palavra, acessível ao editor.
 *
 * O gerador de comentários corre no editor (cliente) e precisa das mesmas
 * etapas que a fila do servidor usava: arrancar o motor AssemblyAI, acompanhar
 * o progresso e guardar a versão com as palavras e as frases.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertWebinarWriter as assertWebinarAccess, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { probeWebinarVideoImpl, saveWebinarTranscriptImpl } from "@/lib/ai-comments.functions";
import { creditState, meterTranscription, runBilled } from "@/lib/ai/billing.server";
import { blockedReason } from "@/lib/credits";

/* eslint-disable @typescript-eslint/no-explicit-any */
const handleSchema = z.object({
  provider: z.string(),
  jobId: z.string().nullable(),
  state: z.record(z.string(), z.any()),
});

type Handle = { provider: string; jobId: string | null; state: Record<string, any> };

export const startWordTranscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ webinarId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const organizationId = await assertWebinarAccess(context.supabase, data.webinarId);
    const engine = await import("@/lib/temporal/engine.server");
    const { mediaForTranscription } = await import("@/lib/temporal/media");

    // Versão pronta para este vídeo: reutiliza-se tal como está.
    const existing = await engine.latestReadyVersion(data.webinarId);
    // Só reaproveitamos transcrições já feitas palavra a palavra.
    // As antigas, por blocos, são refeitas de raiz.
    if (existing && existing.sentences.length > 0 && existing.precision === "word") {
      return {
        status: "reused" as const,
        precision: existing.precision,
        versionId: existing.id,
        segments: existing.sentences.map((sentence) => ({
          at: Math.round(sentence.startMs / 1000),
          text: sentence.text,
        })),
      };
    }

    const provider = engine.pickProvider();
    if (!provider) {
      return { status: "unavailable" as const, reason: engine.NO_PROVIDER_REASON };
    }
    const blocked = blockedReason(await creditState(organizationId));
    if (blocked) return { status: "unavailable" as const, reason: blocked };

    const probe = await probeWebinarVideoImpl(context.supabase, { webinarId: data.webinarId });
    const duration = probe.duration ?? 0;
    const media = await engine.resolveMedia(data.webinarId);
    const prepared = media.url ? mediaForTranscription(media.url) : null;
    const mediaUrl = prepared?.url ?? "";
    if (!mediaUrl) {
      return { status: "unavailable" as const, reason: "Vídeo do webinar não encontrado." };
    }

    const handle = await provider.start({
      mediaUrl,
      durationSeconds: duration,
      language: "pt",
      webinarId: data.webinarId,
    });
    const versionId = await engine.createVersion({
      webinarId: data.webinarId,
      provider,
      providerJobId: handle.jobId,
    });
    return { status: "started" as const, handle: handle as Handle, versionId, duration };
  });

export const pollWordTranscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: z.string().uuid(),
        handle: handleSchema,
        versionId: z.string().uuid().nullable(),
        duration: z.number().default(0),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await assertWebinarAccess(context.supabase, data.webinarId);
    const engine = await import("@/lib/temporal/engine.server");
    // O versionId e o trabalho do fornecedor vêm do cliente: têm de ser uma versão deste webinar, criada
    // para este trabalho. Sem versão não há como cobrar uma só vez, por isso não se aceita.
    if (!data.versionId || !(await engine.versionBelongsTo(data.versionId, data.webinarId, data.handle.jobId))) {
      throw new Error("Versão da transcrição não encontrada.");
    }
    const { detectPresenterEvents, mergeClassifiedPrompts, promptCandidates } =
      await import("@/lib/temporal/events");
    const { classifyAudiencePrompts } = await import("@/lib/temporal/prompt-classifier.server");
    const { effectivePrecision } = await import("@/lib/temporal/integrity");

    const provider = engine.providerById(data.handle.provider);
    if (!provider)
      return { status: "failed" as const, reason: "Motor de transcrição indisponível." };

    const input = {
      mediaUrl: "",
      durationSeconds: data.duration,
      language: "pt",
      webinarId: data.webinarId,
    };

    let progress;
    try {
      progress = await provider.poll(data.handle as never, input);
    } catch (error) {
      progress = {
        status: "failed" as const,
        reason: String((error as Error)?.message ?? error),
      };
    }

    if (progress.status === "running") {
      return {
        status: "running" as const,
        handle: progress.handle as Handle,
        note: progress.note,
      };
    }
    if (progress.status === "failed") {
      if (data.versionId) await engine.failVersion(data.versionId, progress.reason);
      return { status: "failed" as const, reason: progress.reason };
    }

    const done = progress;
    return runBilled(
      {
        organizationId,
        action: "transcription",
        alreadyIncurred: true,
        ...(data.versionId ? { ref: `transcription:${data.versionId}` } : {}),
      },
      async () => {
        const result = done.result;
        // Cobra-se a duração real do que foi transcrito (a última palavra), nunca menos: a duração enviada
        // pelo cliente podia vir a zero e a transcrição saía de graça.
        const lastWordMs = result.words.reduce((max, w) => Math.max(max, w.endMs ?? 0), 0);
        await meterTranscription(Math.max(data.duration, Math.ceil(lastWordMs / 1000)));
        const sentences = engine.sentencesFrom(result);
        let events = detectPresenterEvents(sentences);
        try {
          const classified = await classifyAudiencePrompts(promptCandidates(sentences, events));
          events = mergeClassifiedPrompts(events, classified, sentences);
        } catch {
          /* a camada de regras continua a valer */
        }

        const { precision, integrity } = effectivePrecision(result.precision, result.words);
        if (data.versionId) {
          await engine.completeVersion(data.versionId, result, sentences, precision);
          await engine.saveVersionAnalysis(data.versionId, { events });
          if (integrity)
            await engine.saveVersionReport(data.versionId, { wordIntegrity: integrity });
        }
        if (result.precision === "word" && precision !== "word") {
          return {
            status: "failed" as const,
            reason:
              "Os tempos por palavra desta transcrição não são fiáveis" +
              (integrity?.reason ? `: ${integrity.reason}` : "."),
          };
        }

        const segments = sentences.map((sentence) => ({
          at: Math.round(sentence.startMs / 1000),
          text: sentence.text,
        }));
        try {
          await saveWebinarTranscriptImpl(context.supabase, {
            webinarId: data.webinarId,
            transcript: segments,
          });
        } catch {
          /* guardar a transcrição é um extra */
        }

        return {
          status: "done" as const,
          precision,
          versionId: data.versionId,
          segments,
        };
      },
    );
  });
/* eslint-enable @typescript-eslint/no-explicit-any */
