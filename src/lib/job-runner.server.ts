/**
 * Motor dos trabalhos em segundo plano.
 *
 * A geração do chat e a sincronização dos comentários não dependem de uma
 * única chamada longa: o pedido fica guardado na base de dados e este motor
 * avança-o etapa a etapa, e cada etapa com IA é cobrada à organização do
 * webinar. Quem o empurra é o próprio servidor, de 15 em 15
 * segundos (`job-ticker.server.ts`), por isso o trabalho continua com o
 * separador fechado. O browser dá só o arranque imediato. Em alojamento sem
 * processo permanente, agenda-se uma chamada a /api/public/run-jobs
 * (autenticada com x-job-runner-token).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { meterTranscription, NoCreditsError, runBilled } from "@/lib/ai/billing.server";
import {
  analyseWebinarStructureImpl,
  auditCommentsTimelineImpl,
  generateCommentsWindowImpl,
  generateEngagementCommentsImpl,
  getWebinarTranscriptImpl,
  planCommentWindowsImpl,
  probeWebinarVideoImpl,
  saveWebinarTranscriptImpl,
  syncCommentsWithSpeechImpl,
} from "@/lib/ai-comments.functions";
import {
  completeVersion,
  createVersion,
  failVersion,
  latestReadyVersion,
  loadVersion,
  NO_PROVIDER_REASON,
  pickProvider,
  providerById,
  resolveMedia,
  saveVersionAnalysis,
  saveVersionReport,
  sentencesFrom,
  versionBelongsTo,
} from "@/lib/temporal/engine.server";
import { attachCausality } from "@/lib/temporal/causality";
import { validateTimeline } from "@/lib/temporal/validator";
import {
  detectPresenterEvents,
  mergeClassifiedPrompts,
  promptCandidates,
} from "@/lib/temporal/events";
import { classifyAudiencePrompts } from "@/lib/temporal/prompt-classifier.server";
import { buildOpportunities, momentsFromSentences } from "@/lib/temporal/opportunities";
import { assignTopics } from "@/lib/temporal/topics";

import { mediaForTranscription } from "@/lib/temporal/media";
import { effectivePrecision } from "@/lib/temporal/integrity";
import type { TranscriptionProgress } from "@/lib/temporal/provider";
import { allowsIntelligentGeneration, PRECISION_LABEL } from "@/lib/temporal/types";

type Job = {
  id: string;
  kind: "chat" | "sync";
  webinar_id: string;
  organization_id: string;
  created_by: string;
  webinar_title: string;
  status: string;
  stage: number;
  progress: number;
  note: string;
  payload: any;
  state: any;
  attempts: number;
};

async function save(id: string, changes: Record<string, unknown>) {
  await supabaseAdmin
    .from("background_jobs")
    .update({ ...changes, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
}

/**
 * O motor corre com a chave de serviço, por isso não confia na linha: quem
 * criou o trabalho tem de pertencer à organização do webinar, e a versão da
 * transcrição guardada no estado tem de ser desse webinar.
 */
async function jobAllowed(job: Job): Promise<boolean> {
  // Uma leitura falhada não é "sem acesso": o trabalho tenta outra vez em vez de morrer.
  const { data: webinar, error: webinarError } = await supabaseAdmin
    .from("webinars")
    .select("organization_id")
    .eq("id", job.webinar_id)
    .maybeSingle();
  if (webinarError) throw new Error(webinarError.message);
  if (!webinar) return false;
  const { data: members, error: membersError } = await supabaseAdmin
    .from("organization_members")
    .select("id")
    .eq("organization_id", webinar.organization_id)
    .eq("user_id", job.created_by)
    .limit(1);
  if (membersError) throw new Error(membersError.message);
  if (!members?.length) return false;
  const versionId = job.state?.versionId;
  return !versionId || versionBelongsTo(String(versionId), job.webinar_id);
}

/** Avança um trabalho de geração de chat exatamente uma etapa. */
async function stepChat(job: Job): Promise<boolean> {
  const sb = supabaseAdmin as never;
  const state = job.state ?? {};
  const payload = job.payload ?? {};
  const phase: string = state.phase ?? "start";

  if (phase === "start") {
    // Versão temporal já pronta para este vídeo? Reutiliza-se, com a sua precisão.
    const version = await latestReadyVersion(job.webinar_id);
    if (version && version.sentences.length > 0) {
      await save(job.id, {
        stage: 2,
        note: `Transcrição guardada reutilizada (${PRECISION_LABEL[version.precision].toLowerCase()}).`,
        state: {
          ...state,
          phase: "structure",
          precision: version.precision,
          versionId: version.id,
          events: version.events ?? [],
          transcript: version.sentences.map((sentence) => ({
            at: Math.round(sentence.startMs / 1000),
            text: sentence.text,
          })),
        },
      });
      return true;
    }

    // Transcrição antiga (tempo estimado): serve de texto, não de causalidade.
    const saved = await getWebinarTranscriptImpl(sb, { webinarId: job.webinar_id });
    const probe = await probeWebinarVideoImpl(sb, { webinarId: job.webinar_id });
    const duration = probe.duration ?? 0;

    const provider = pickProvider();
    let startFailure = "";
    if (provider) {
      try {
        const media = await resolveMedia(job.webinar_id);
        const rawUrl = media.url ?? "";
        const prepared = rawUrl ? mediaForTranscription(rawUrl) : null;
        const mediaUrl = prepared?.url ?? "";
        if (mediaUrl) {
          const handle = await provider.start({
            mediaUrl,
            durationSeconds: duration,
            language: "pt",
            webinarId: job.webinar_id,
          });
          const versionId = await createVersion({
            webinarId: job.webinar_id,
            provider,
            providerJobId: handle.jobId,
          });
          await save(job.id, {
            stage: 1,
            note: "A transcrever o webinar com tempos por palavra...",
            state: {
              ...state,
              phase: "transcribe-word",
              duration,
              handle,
              versionId,
              attemptsWord: 0,
            },
          });
          return true;
        }
      } catch (error) {
        startFailure = String((error as Error)?.message ?? error);
      }
    }

    if (saved.transcript.length > 0) {
      await save(job.id, {
        stage: 2,
        note: "Transcrição guardada reutilizada.",
        state: { ...state, phase: "structure", precision: "estimated", transcript: saved.transcript },
      });
      return true;
    }

    // Sem motor por palavra não há outra transcrição: o erro é explícito.
    await save(job.id, {
      status: "error",
      note: "",
      error: !provider
        ? NO_PROVIDER_REASON
        : startFailure
          ? `Não foi possível iniciar a transcrição: ${startFailure}`
          : "Vídeo do webinar não encontrado.",
    });
    return false;
  }

  if (phase === "transcribe-word") {
    const provider = providerById(state.handle?.provider ?? "assemblyai");
    const input = {
      mediaUrl: "",
      durationSeconds: state.duration ?? 0,
      language: "pt",
      webinarId: job.webinar_id,
    };
    let progress: TranscriptionProgress;
    try {
      progress = provider
        ? await provider.poll(state.handle, input)
        : { status: "failed", reason: "Motor de transcrição indisponível." };
    } catch (error) {
      progress = { status: "failed", reason: String((error as Error)?.message ?? error) };
    }

    if (progress.status === "running") {
      await save(job.id, {
        stage: 1,
        note: progress.note,
        state: { ...state, handle: progress.handle },
      });
      return true;
    }

    if (progress.status === "failed") {
      const attemptsWord = (state.attemptsWord ?? 0) + 1;
      if (attemptsWord < 3) {
        await save(job.id, {
          stage: 1,
          note: "A repetir a transcrição com tempos por palavra...",
          state: { ...state, attemptsWord },
        });
        return true;
      }
      if (state.versionId) await failVersion(state.versionId, progress.reason);
      // Sem alternativa silenciosa: a falha da transcrição pára o trabalho com a razão.
      await save(job.id, {
        status: "error",
        note: "",
        error: `A transcrição falhou: ${progress.reason}`,
      });
      return false;
    }

    const result = progress.result;
    const sentences = sentencesFrom(result);
    let events = detectPresenterEvents(sentences);
    // A transcrição já aconteceu no fornecedor: regista-se sem bloquear, e só
    // uma vez por versão, como no caminho do editor.
    await runBilled(
      {
        organizationId: job.organization_id,
        action: "transcription",
        alreadyIncurred: true,
        ...(state.versionId ? { ref: `transcription:${state.versionId}` } : {}),
      },
      async () => {
        await meterTranscription(state.duration ?? 0);
        // Camada semântica: apanha pedidos à audiência que as regras não veem
        // ("comenta aí de onde és", "quem aqui já...").
        try {
          const classified = await classifyAudiencePrompts(promptCandidates(sentences, events));
          events = mergeClassifiedPrompts(events, classified, sentences);
        } catch {
          /* a camada de regras continua a valer */
        }
      },
    );

    // A precisão declarada só vale se as palavras trouxerem mesmo tempos próprios.
    const { precision: realPrecision, integrity } = effectivePrecision(
      result.precision,
      result.words,
    );
    if (state.versionId) {
      await completeVersion(state.versionId, result, sentences, realPrecision);
      await saveVersionAnalysis(state.versionId, { events });
      if (integrity) await saveVersionReport(state.versionId, { wordIntegrity: integrity });
    }
    if (result.precision === "word" && realPrecision !== "word") {
      await save(job.id, {
        status: "error",
        error:
          "Os tempos por palavra desta transcrição não são fiáveis" +
          (integrity?.reason ? `: ${integrity.reason}` : ".") +
          " Volte a transcrever o vídeo antes de gerar o chat inteligente.",
      });
      return true;
    }
    const transcript = sentences.map((sentence) => ({
      at: Math.round(sentence.startMs / 1000),
      text: sentence.text,
    }));
    try {
      await saveWebinarTranscriptImpl(sb, { webinarId: job.webinar_id, transcript });
    } catch {
      /* guardar a transcrição é um extra */
    }
    await save(job.id, {
      stage: 2,
      note: `Transcrição completa com tempos por palavra: ${sentences.length} frases.`,
      state: { ...state, phase: "structure", precision: realPrecision, events, transcript },
    });
    return true;
  }

  if (phase === "transcribe") {
    // Fase da transcrição por blocos (motor removido): um trabalho antigo parado aqui termina com erro claro.
    await save(job.id, {
      status: "error",
      note: "",
      error: "A transcrição por blocos deixou de existir. Inicie a geração de novo.",
    });
    return false;
  }

  if (phase === "structure") {
    const transcript = state.transcript ?? [];
    let intel: any;
    let analysisRow: any;
    // Sem tempos fiáveis não há causalidade: o Chat Inteligente não avança.
    if (
      payload.settings?.mode === "inteligente" &&
      !allowsIntelligentGeneration(state.precision ?? "estimated")
    ) {
      await save(job.id, {
        status: "error",
        error:
          "A transcrição deste vídeo não tem tempos suficientemente precisos para gerar o chat inteligente. Volte a transcrever o vídeo antes de gerar.",
        note: "",
      });
      return false;
    }
    if (payload.settings?.mode === "inteligente") {
      try {
        const structure = await analyseWebinarStructureImpl(sb, {
          webinarId: job.webinar_id,
          transcript,
          objective: payload.settings.objective,
          participants: payload.settings.participants,
          variant: payload.settings.variant,
        });
        analysisRow = structure.analysis;
        intel = {
          objective: structure.analysis.objective,
          segments: structure.analysis.segments,
          personas: structure.analysis.personas,
          prompts: structure.analysis.prompts ?? [],
          moments: structure.analysis.moments ?? [],
          audienceState: structure.analysis.audienceState ?? [],
        };
      } catch {
        intel = undefined;
      }
    }
    await save(job.id, {
      stage: 2,
      note: intel ? "" : "Seguimos com a geração normal.",
      state: { ...state, phase: "plan", intel: intel ?? null, analysis: analysisRow ?? null },
    });
    return true;
  }

  const base = {
    webinarId: job.webinar_id,
    settings: payload.settings,
    transcript: state.transcript ?? [],
    ...(payload.range ? { range: payload.range } : {}),
    existing: payload.replaceAll ? [] : payload.existing ?? [],
    ...(state.intel ? { intel: state.intel } : {}),
  };

  if (phase === "plan") {
    // Um trecho pequeno cabe numa única chamada.
    if (payload.range) {
      const result = await generateEngagementCommentsImpl(sb, base);
      await save(job.id, {
        stage: 4,
        status: "ready",
        progress: 100,
        note: "",
        result: { drafts: result.comments, analysis: state.analysis ?? null },
      });
      return false;
    }
    const plan = await planCommentWindowsImpl(sb, base);
    await save(job.id, {
      stage: 3,
      note: `0 de ${plan.windows.length} trechos`,
      state: {
        ...state,
        phase: "windows",
        plan: { start: plan.start, end: plan.end, windows: plan.windows },
        windowIndex: 0,
        collected: [],
        failedWindows: 0,
      },
    });
    return true;
  }

  if (phase === "windows") {
    const plan = state.plan;
    const index: number = state.windowIndex ?? 0;
    const collected = state.collected ?? [];
    let failedWindows: number = state.failedWindows ?? 0;

    // Vários trechos ao mesmo tempo: a espera deixa de ser trecho a trecho.
    const PARALLEL = 3;
    const batch = plan.windows.slice(index, index + PARALLEL);

    // A versão da transcrição é lida uma única vez para todo o lote.
    let version: any = null;
    let moments: any[] = [];
    if (state.versionId) {
      try {
        version = await loadVersion(state.versionId);
        if (version) {
          const baseMoments =
            (version.moments ?? []).length > 0
              ? version.moments ?? []
              : momentsFromSentences(version.sentences as any);
          moments = assignTopics(baseMoments).moments;
        }
      } catch {
        /* sem oportunidades, a geração segue como antes */
      }
    }

    const results = await Promise.all(
      batch.map(async (window: any) => {
        // Oportunidades deste trecho: o webinar cria a ocasião, a IA aproveita.
        let slots: any[] = [];
        if (version) {
          try {
            slots = buildOpportunities({
              fromSeconds: window.from,
              toSeconds: window.to,
              events: version.events ?? state.events ?? [],
              moments,
              participants: payload.settings?.participants ?? 25,
            });
          } catch {
            /* sem oportunidades, a geração segue como antes */
          }
        }

        const run = async () =>
          generateCommentsWindowImpl(sb, {
            ...base,
            transcript: (state.transcript ?? []).filter(
              (s: any) => s.at >= window.from - 120 && s.at <= window.to + 120,
            ),
            window,
            bounds: { start: plan.start, end: plan.end },
            existing: [...base.existing, ...collected],
            slots,
          });

        try {
          return (await run()).comments;
        } catch {
          // Uma segunda tentativa: falhas passageiras do motor não podem
          // deixar parte do webinar sem conversa.
          try {
            return (await run()).comments;
          } catch {
            return null;
          }
        }
      }),
    );

    for (const comments of results) {
      if (comments === null) failedWindows += 1;
      else collected.push(...comments);
    }

    const next = index + batch.length;
    const done = next >= plan.windows.length;
    await save(job.id, {
      stage: 3,
      progress: Math.round((next / plan.windows.length) * 90),
      note: done ? "A rever a cronologia" : `Trecho ${next} de ${plan.windows.length}`,
      state: {
        ...state,
        phase: done ? "audit" : "windows",
        windowIndex: next,
        windowRetries: 0,
        collected,
        failedWindows,
      },
    });
    return true;
  }


  // Revisão final da cronologia.
  const collected = state.collected ?? [];
  if (collected.length === 0) {
    await save(job.id, {
      status: "error",
      error: "A IA não conseguiu criar comentários desta vez.",
      note: "",
    });
    return false;
  }

  const personaNames = new Set((state.intel?.personas ?? []).map((p: any) => p.name));
  const decorate = (comment: any) => {
    const origin = collected.find(
      (c: any) => c.author === comment.author && c.message === comment.message,
    );
    const kind = comment.kind ?? origin?.kind;
    const reason = comment.reason ?? origin?.reason ?? "";
    const anchor = comment.anchor ?? origin?.anchor ?? null;
    const slotId = comment.slot ?? origin?.slot ?? null;
    return {
      at: comment.at,
      author: comment.author,
      message: comment.message,
      moment: comment.moment,
      ...(kind ? { kind } : {}),
      ...(reason ? { reason } : {}),
      anchor,
      slotId,
      ...(personaNames.has(comment.author) ? { persona: comment.author } : {}),
    };

  };

  let drafts = collected.map(decorate);
  try {
    const audited = await auditCommentsTimelineImpl(sb, {
      webinarId: job.webinar_id,
      transcript: state.transcript ?? [],
      bounds: { start: state.plan.start, end: state.plan.end },
      comments: collected,
    });
    drafts = audited.comments.map(decorate);
  } catch {
    drafts.sort((a: any, b: any) => a.at - b.at);
  }

  // Causa explícita + auditoria temporal determinística.
  let validation: any = null;
  if (state.versionId) {
    const version = await loadVersion(state.versionId);
    if (version) {
      const offset = version.mediaTimeOffsetMs ?? 0;
      const sentenceMoments = version.sentences.map((sentence: any) => ({
        id: sentence.id,
        startMs: sentence.startMs,
        endMs: sentence.endMs,
        reactionWindowStartMs: sentence.endMs,
        reactionWindowEndMs: sentence.endMs + 55_000,
        topic: "",
        summary: sentence.text,
        novelty: 40,
        emotionalIntensity: 40,
        informationDensity: 40,
        momentType: "outro" as const,
        expectedReactions: [],
        sourceSentenceIds: [sentence.id],
      }));
      const events = version.events ?? state.events ?? [];
      const topicped = assignTopics(
        (version.moments ?? []).length > 0
          ? version.moments ?? []
          : momentsFromSentences(version.sentences as any),
      );
      const moments = [...topicped.moments, ...sentenceMoments];
      const topics = topicped.topics;
      // Mapa das oportunidades de todo o webinar, para reencontrar a causa
      // exata de cada mensagem que nasceu de um slot.
      const allSlots = new Map(
        buildOpportunities({
          fromSeconds: 0,
          toSeconds: state.plan.end,
          events,
          moments: topicped.moments,
          participants: payload.settings?.participants ?? 25,
        }).map((slot) => [slot.id, slot] as const),
      );
      const withCause = attachCausality(
        (drafts as any[]).map((draft) => ({
          ...draft,
          slot: draft.slotId ? allSlots.get(draft.slotId) ?? null : null,
        })),
        {
          sentences: version.sentences,
          moments,
          events,
          topics,
          precision: version.precision,
          mediaTimeOffsetMs: offset,
        },
      );
      const offerStart = webinarOfferStartMs(state);
      const report = validateTimeline(
        withCause.map((draft: any, index: number) => ({
          id: String(index),
          atMs: Math.round(draft.at * 1000),
          author: draft.author,
          message: draft.message,
          causality: draft.causality,
        })),
        { precision: version.precision, moments, events, topics, offerStartMs: offerStart },
      );

      const byId = new Map(report.kept.map((item) => [item.id, item] as const));
      drafts = withCause
        .map((draft: any, index: number) => {
          const kept = byId.get(String(index));
          if (!kept) return null;
          const issue = report.issues.find((i: any) => i.commentId === String(index));
          // Arredondar para cima: descer o segundo poderia colocar a mensagem
          // um instante antes do fim da fala que a provocou.
          const at = Math.ceil(kept.atMs / 1000);
          const cause = draft.causality;
          const causality =
            cause && cause.triggerEndMs != null && cause.temporalRelation !== "CAUSE_OF_PRESENTER_SPEECH"
              ? { ...cause, reactionLatencyMs: at * 1000 - cause.triggerEndMs }
              : cause;
          const { slot: _slot, ...rest } = draft;
          return {
            ...rest,
            at,
            causality,
            validationAction: issue?.action ?? null,
            validationRule: issue?.rule ?? null,
            transcriptVersionId: version.id,
          };
        })
        .filter(Boolean) as any[];
      const byRule: Record<string, number> = {};
      for (const issue of report.issues) {
        byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1;
      }
      validation = {
        generated: withCause.length,
        kept: report.kept.length,
        moved: report.moved,
        removed: report.removed.length,
        byRule,
        fromSlots: withCause.filter((d: any) => d.causality?.slotId).length,
        slots: allSlots.size,
        issues: report.issues.slice(0, 200),
        precision: version.precision,
        provider: version.provider,
        providerModel: version.providerModel,
        words: version.words?.length ?? 0,
        sentences: version.sentences.length,
        moments: version.moments?.length ?? 0,
        events: events.length,
        mediaTimeOffsetMs: offset,
        createdAt: new Date().toISOString(),
      };

      try {
        await saveVersionReport(version.id, validation);
      } catch {
        /* o relatório é evidência extra */
      }
    }
  }

  const failed: number = state.failedWindows ?? 0;
  await save(job.id, {
    stage: 4,
    status: "ready",
    progress: 100,
    note: failed > 0 ? `${failed} trecho(s) ficaram por gerar.` : "",
    result: { drafts, analysis: state.analysis ?? null, validation },
    state: { ...state, phase: "ready", collected: [] },
  });
  return false;
}

/** Segundo em que a oferta começa, em ms, quando o webinar o define. */
function webinarOfferStartMs(state: any): number | null {
  const seconds = state?.analysis?.offerStartSeconds ?? state?.offerStartSeconds ?? null;
  return typeof seconds === "number" && seconds > 0 ? Math.round(seconds * 1000) : null;
}

/** Avança um trabalho de sincronização exatamente um lote. */
async function stepSync(job: Job): Promise<boolean> {
  const sb = supabaseAdmin as never;
  const state = job.state ?? {};
  const payload = job.payload ?? {};
  const BATCH = 40;
  const comments: any[] = payload.comments ?? [];
  const totalBatches = Math.max(1, Math.ceil(comments.length / BATCH));
  const index: number = state.batchIndex ?? 0;

  if (index < totalBatches) {
    const batch = comments.slice(index * BATCH, (index + 1) * BATCH);
    const { updates, usedSeconds } = await syncCommentsWithSpeechImpl(sb, {
      webinarId: job.webinar_id,
      transcript: [],
      comments: batch,
      occupiedSeconds: state.occupied ?? [],
    });
    await save(job.id, {
      progress: Math.round(((index + 1) / totalBatches) * 80),
      note: `A sincronizar lote ${index + 1} de ${totalBatches}...`,
      state: {
        ...state,
        batchIndex: index + 1,
        occupied: [...(state.occupied ?? []), ...(usedSeconds ?? [])],
        updates: [...(state.updates ?? []), ...updates],
      },
    });
    return true;
  }

  let moved = 0;
  for (const update of state.updates ?? []) {
    const current = comments.find((c) => c.id === update.id);
    if (!current || current.at === update.at) continue;
    const { error } = await supabaseAdmin
      .from("scheduled_comments")
      .update({ offset_seconds: Math.max(0, update.at) } as never)
      .eq("id", update.id)
      .eq("webinar_id", job.webinar_id);
    if (error) throw new Error(error.message);
    moved += 1;
  }

  await save(job.id, {
    status: "done",
    progress: 100,
    note:
      moved === 0
        ? "Os comentários já estavam alinhados com a fala."
        : `${moved} comentário${moved === 1 ? "" : "s"} realinhado${moved === 1 ? "" : "s"}.`,
    result: { moved },
  });
  return false;
}

/**
 * Avança a fila durante o tempo disponível do pedido. Cada etapa é guardada,
 * por isso o trabalho nunca depende de uma única chamada longa.
 */
/**
 * `organizationIds` limita a passagem às organizações de quem a pediu; sem
 * ele (servidor e chamada agendada) avança a fila inteira.
 */
export async function runPendingJobs(budgetMs = 45000, organizationIds?: string[]) {
  const started = Date.now();
  let steps = 0;
  if (organizationIds && organizationIds.length === 0) return { steps };

  while (Date.now() - started < budgetMs) {
    const nowIso = new Date().toISOString();
    let pending = supabaseAdmin
      .from("background_jobs")
      .select("*")
      .in("status", ["queued", "running"])
      .or(`locked_until.is.null,locked_until.lt.${nowIso}`);
    if (organizationIds) pending = pending.in("organization_id", organizationIds);
    const { data: rows } = await pending.order("updated_at", { ascending: true }).limit(1);

    const job = (rows?.[0] as unknown as Job) ?? null;
    if (!job) break;

    // Reserva o trabalho numa só escrita condicional: se outro separador ou a
    // chamada agendada o reservou entretanto, nenhuma linha muda e passa-se à frente.
    // Uma etapa que derruba a função (tempo esgotado, memória) nunca chega ao «catch»: a tentativa conta-se
    // já na reserva. Três reservas sem sucesso param o trabalho, em vez de o repetir (e cobrar) sem fim.
    if ((job.attempts ?? 0) >= 3) {
      await save(job.id, { status: "error", error: "A etapa falhou três vezes seguidas.", locked_until: null });
      continue;
    }
    const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("background_jobs")
      .update({
        status: "running",
        locked_until: lockUntil,
        attempts: (job.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", job.id)
      .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
      .select("id");
    if (claimError) break;
    if (!claimed?.length) continue;

    try {
      if (!(await jobAllowed(job))) {
        await save(job.id, {
          status: "error",
          error: "Sem acesso a este webinar.",
          locked_until: null,
        });
        continue;
      }
      const step = () => (job.kind === "chat" ? stepChat(job) : stepSync(job));
      const phase = job.kind === "chat" ? String(job.state?.phase ?? "start") : "";
      // Cada etapa com IA é cobrada à organização do webinar, como no editor.
      // A espera pela transcrição não custa nada e é cobrada à parte quando acaba.
      const again =
        phase === "transcribe-word"
          ? await step()
          : await runBilled(
              {
                organizationId: job.organization_id,
                action: phase === "structure" ? "webinar_analysis" : "chat_generation",
              },
              step,
            );
      steps += 1;
      await save(job.id, { locked_until: null, attempts: 0 });
    } catch (error) {
      // Sem saldo, repetir não adianta: o trabalho pára com a razão.
      if (error instanceof NoCreditsError) {
        await save(job.id, { status: "error", error: error.message, locked_until: null });
        continue;
      }
      const attempts = (job.attempts ?? 0) + 1;
      const message = error instanceof Error ? error.message : "Falha inesperada.";
      if (attempts >= 3) {
        await save(job.id, { status: "error", error: message, attempts, locked_until: null });
      } else {
        await save(job.id, { attempts, note: "A tentar novamente...", locked_until: null });
      }
    }
  }

  return { steps };
}
