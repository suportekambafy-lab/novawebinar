import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Funções públicas da sala. São chamadas por visitantes sem sessão, por isso
 * validam sempre a entrada e devolvem apenas os campos que o público precisa.
 */

const slugSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  // A origem (UTM) do endereço: fica na atribuição de um teste A/B.
  utm_source: z.string().trim().max(120).optional(),
  utm_medium: z.string().trim().max(120).optional(),
  utm_campaign: z.string().trim().max(120).optional(),
  utm_content: z.string().trim().max(120).optional(),
  /** Pré-visualização de uma variante de um teste A/B («A», «B»…), sem contar como visita. */
  variante: z.string().trim().max(2).optional(),
});

const joinSchema = z.object({
  webinarId: z.string().uuid(),
  // O que é obrigatório depende dos campos que o organizador escolheu: valida-se no handler.
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  /** Respostas aos campos novos da página: { id do campo: resposta }. */
  answers: z.record(z.string().max(40), z.string().max(200)).optional(),
  mode: z.enum(["live", "replay"]).default("live"),
  // Entrada pela sala de teste: aberta mesmo com a sessão inativa e sem
  // disparar avisos para sistemas externos.
  teste: z.boolean().optional(),
  device: z.enum(["mobile", "tablet", "desktop"]).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  countryCode: z.string().trim().max(8).optional(),
  // Origem do lead (UTM, anúncios ou página de onde veio), calculada no browser.
  utmSource: z.string().trim().toLowerCase().max(120).optional(),
  utmMedium: z.string().trim().toLowerCase().max(120).optional(),
  utmCampaign: z.string().trim().max(120).optional(),
  utmContent: z.string().trim().max(120).optional(),
  referrer: z.string().trim().max(200).optional(),
  /** Armadilha para robôs: um campo invisível que uma pessoa nunca preenche. */
  website: z.string().max(200).optional(),
});

/** A credencial que joinPublicRoom entrega: o id da participação assinado pelo servidor. */
const viewerToken = z.string().min(1).max(200);

const messageSchema = z.object({
  token: viewerToken,
  body: z.string().trim().min(1).max(1000),
  /** Instante real do participante no vídeo (live ou replay), em segundos. */
  sessionSeconds: z.number().int().nonnegative().optional(),
});

const ctaSchema = z.object({
  token: viewerToken,
  eventType: z.enum(["view", "click"]),
  /** Segundo do vídeo em que a pessoa viu ou clicou na oferta. */
  videoSecond: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 24)
    .optional(),
});

const second = z
  .number()
  .int()
  .min(0)
  .max(60 * 60 * 24);

const watchedSchema = z.object({
  token: viewerToken,
  /** Posição mais avançada no conteúdo. */
  watchedSeconds: second,
  /** Posição em que a pessoa começou a ver. */
  entrySeconds: second.optional(),
  /** Segundos vistos desde o último envio; a base de dados limita a 120 por sinal. */
  playedSeconds: z.number().int().min(0).max(120).optional(),
});

const UNAVAILABLE = "Serviço temporariamente indisponível. Tente novamente.";
/** A sala reconhece esta mensagem e pede para entrar outra vez. */
export const VIEWER_EXPIRED = "A sua entrada na sala expirou. Entre outra vez.";

/** O IP de quem pede, para o limite de ritmo; fora de um pedido (testes) não há. */
async function requestIp() {
  try {
    const { getRequest, getRequestIP } = await import("@tanstack/react-start/server");
    const { clientIp } = await import("@/lib/registration");
    return clientIp(getRequestIP(), getRequest().headers.get("x-forwarded-for"));
  } catch {
    return "local";
  }
}

// ponytail: memória de cada instância da função; trava um ciclo, não um ataque distribuído.
let chatLimiter: InstanceType<typeof import("@/lib/registration").RateLimiter> | undefined;
/** Cliques e entradas no grupo: cada um grava e pode avisar webhooks; um ciclo com o token inundava tudo. */
let ctaLimiter: InstanceType<typeof import("@/lib/registration").RateLimiter> | undefined;
async function allowCta(participantId: string) {
  const { RateLimiter } = await import("@/lib/registration");
  ctaLimiter ??= new RateLimiter(20, 60_000);
  if (!ctaLimiter.allow(participantId)) throw new Error("Demasiados pedidos seguidos. Aguarde um minuto.");
}

/** Quem está a pedir: só a credencial emitida pelo servidor diz qual é a participação. */
async function participantOf(token: string) {
  const { participantFromToken } = await import("@/lib/public-room.server");
  const id = participantFromToken(token);
  if (!id) throw new Error(VIEWER_EXPIRED);
  return id;
}

export const getPublicRoom = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    const { loadPublicRoom } = await import("@/lib/public-room.server");
    // Só conta para um endereço de teste A/B: aparelho e país pelo pedido, a origem pelo endereço.
    const fallback = await requestAudienceMeta();
    let referrer: string | null = null;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      referrer = getRequest().headers.get("referer");
    } catch {
      referrer = null;
    }
    return loadPublicRoom(data.slug, {
      device: fallback.device,
      countryCode: fallback.countryCode,
      referrer,
      utmSource: data.utm_source,
      utmMedium: data.utm_medium,
      utmCampaign: data.utm_campaign,
      utmContent: data.utm_content,
    }, data.variante);
  });

/** Deduz dispositivo e localização a partir do pedido quando o navegador não os envia. */
async function requestAudienceMeta() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { audienceMetaFromHeaders } = await import("@/lib/registration.server");
    return audienceMetaFromHeaders(getRequest().headers);
  } catch {
    return { device: null, city: null, country: null, countryCode: null };
  }
}

/**
 * Há gravação para ver? Com o replay ligado e: sem horário (sempre disponível), ou a sessão
 * de data única já terminou, ou o webinar repete e já houve pelo menos uma sessão acabada.
 */
async function replayOpen(webinar: {
  replay_enabled?: boolean | null;
  chat_settings?: unknown;
  duration_seconds?: number | null;
  video_sources?: { duration_seconds?: number | null } | null;
} & Parameters<typeof import("@/lib/schedule").sessionWindow>[0]) {
  if (!webinar.replay_enabled) return false;
  const { sessionWindow } = await import("@/lib/schedule");
  const { startDelaySeconds } = await import("@/lib/room-logic");
  const window = sessionWindow({
    ...webinar,
    duration_seconds: webinar.video_sources?.duration_seconds || webinar.duration_seconds || 0,
    start_delay_seconds: startDelaySeconds(webinar.chat_settings),
  });
  if (window.startMs === null) return true;
  if (window.endedMs !== null) return true;
  if (window.endMs !== null && window.endMs <= Date.now()) return true;
  // O webinar repete: houve sessões antes desta? A janela devolve a actual/próxima; uma anterior acabada
  // conta-se pela base (webinar_sessions com ended_at).
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("webinar_sessions")
    .select("id", { count: "exact", head: true })
    .eq("webinar_id", (webinar as { id: string }).id)
    .not("ended_at", "is", null);
  return (count ?? 0) > 0;
}

export const joinPublicRoom = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => joinSchema.parse(data))
  .handler(async ({ data }) => {
    const { loadRegistrationWebinar, openRegistrationSession, createRegistration, roomPerVisitor, roomPerTarget, RATE_LIMITED } =
      await import("@/lib/registration.server");
    // Por visitante antes de tudo, por webinar depois de ele existir.
    if (!roomPerVisitor.allow(await requestIp())) throw new Error(RATE_LIMITED);
    // Robô: preencheu o campo invisível. Nada se grava.
    if (data.website?.trim()) throw new Error("Não foi possível entrar na sala.");
    const fallback = await requestAudienceMeta();

    const webinar = await loadRegistrationWebinar(data.webinarId).catch(() => null);
    if (!webinar) throw new Error("Webinar indisponível.");
    if (webinar.status === "draft" && !data.teste) throw new Error("Webinar indisponível.");
    if (!roomPerTarget.allow(webinar.id)) throw new Error(RATE_LIMITED);
    // O replay só existe com o replay ligado e depois de a sessão terminar (a sala de teste passa sempre).
    if (data.mode === "replay" && !data.teste && !(await replayOpen(webinar))) {
      throw new Error("A gravação ainda não está disponível.");
    }

    // Os campos da página: os mesmos que a pessoa viu, com as mesmas regras.
    const { parseEntryFields, validateEntry } = await import("@/lib/entry-fields");
    const { normalizePhone, withoutRepeatedDial } = await import("@/lib/registration");
    const fields = parseEntryFields(webinar.entry_fields, {
      collectPhone: webinar.registration_collect_phone,
      requirePhone: webinar.registration_require_phone,
    });
    // Entrada sem formulário (acesso facilitado): o convidado só traz nome e e-mail provisório; os outros
    // campos obrigatórios pedem-se depois (ex.: ao entrar no grupo), em vez de trancar toda a gente à porta.
    const guest = (data.email ?? "").endsWith("@sala.local") && Boolean(webinar.easy_access);
    const entry = validateEntry(guest ? fields.filter((f) => f.kind === "name" || f.kind === "email") : fields, {
      ...(data.answers ?? {}),
      name: data.name ?? "",
      email: data.email ?? "",
      whatsapp: withoutRepeatedDial(data.phone) ?? "",
    });
    if (!entry.ok) throw new Error(entry.message);
    // O mesmo formato da captura externa («+244923456789»): assim a mesma pessoa é reconhecida nos dois caminhos.
    const phone = entry.phone ? (normalizePhone(entry.phone) ?? entry.phone) : entry.phone;

    // Inscrição ao vivo num webinar com horário: fica ligada à sessão global, com a
    // mesma janela que a sala mostra (o mesmo caminho da captura externa).
    const sessionId = await openRegistrationSession(webinar, data.mode, Boolean(data.teste));
    const { participant, error } = await createRegistration(
      webinar,
      {
        name: entry.name,
        email: entry.email,
        phone,
        answers: entry.answers,
        mode: data.mode,
        device: data.device ?? fallback.device,
        city: data.city ?? fallback.city,
        country: data.country ?? fallback.country,
        countryCode: data.countryCode ?? fallback.countryCode,
        utm: {
          ...(data.utmSource ? { utm_source: data.utmSource } : {}),
          ...(data.utmMedium ? { utm_medium: data.utmMedium } : {}),
          ...(data.utmCampaign ? { utm_campaign: data.utmCampaign } : {}),
          ...(data.utmContent ? { utm_content: data.utmContent } : {}),
        },
        referrer: data.referrer ?? null,
        source: "room",
        teste: Boolean(data.teste),
      },
      sessionId,
    );
    if (error || !participant) throw new Error("Não foi possível entrar na sala.");
    // Num teste A/B, a participação e o e-mail ficam ligados à variante desta pessoa (nunca trava a entrada).
    // A sala de teste não entra nos números do teste A/B (nem leva o e-mail de quem testa).
    if (!data.teste) {
      const { linkAssignment } = await import("@/lib/ab-tests/assign.server");
      await linkAssignment({ webinarId: webinar.id, participantId: participant.id, email: entry.email });
    }
    const { roomToken } = await import("@/lib/public-room.server");
    return { token: roomToken(participant.id), name: participant.name };
  });

export const sendPublicRoomMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => messageSchema.parse(data))
  .handler(async ({ data }) => {
    const participantId = await participantOf(data.token);
    // Cada mensagem custa uma chamada à IA paga pela organização: um ciclo com um token esvaziava a carteira.
    const { RateLimiter } = await import("@/lib/registration");
    chatLimiter ??= new RateLimiter(6, 60_000);
    if (!chatLimiter.allow(participantId)) throw new Error("Demasiadas mensagens seguidas. Aguarde um minuto.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: participant, error: participantError } = await supabaseAdmin
      .from("participants")
      .select("id, name, webinar_id, organization_id")
      .eq("id", participantId)
      .maybeSingle();
    if (participantError) throw new Error(UNAVAILABLE);
    if (!participant) throw new Error("Participante desconhecido.");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("private_conversations")
      .select("id")
      .eq("participant_id", participant.id)
      .maybeSingle();
    // Sem saber se a conversa existe, não se abre outra.
    if (existingError) throw new Error(UNAVAILABLE);

    let conversationId = existing?.id ?? null;
    if (!conversationId) {
      const { data: created, error } = await supabaseAdmin
        .from("private_conversations")
        .insert({
          organization_id: participant.organization_id,
          webinar_id: participant.webinar_id,
          participant_id: participant.id,
        })
        .select("id")
        .single();
      if (error?.code === "23505") {
        // Duas mensagens quase ao mesmo tempo: a outra abriu a conversa; usa-se essa.
        const { data: again, error: againError } = await supabaseAdmin
          .from("private_conversations")
          .select("id")
          .eq("participant_id", participant.id)
          .maybeSingle();
        if (againError || !again) throw new Error(UNAVAILABLE);
        conversationId = again.id;
      } else if (error || !created) {
        throw new Error("Não foi possível abrir a conversa.");
      } else {
        conversationId = created.id;
        await supabaseAdmin.rpc("support_log_conversation_event", {
          _conversation_id: created.id,
          _name: "conversation_created",
          _actor_kind: "contact",
          _data: { channel: "webinar_chat" },
        });
      }
    }

    const { error: messageError } = await supabaseAdmin.from("private_messages").insert({
      conversation_id: conversationId,
      organization_id: participant.organization_id,
      participant_id: participant.id,
      sender_kind: "participant",
      body: data.body,
      video_second: data.sessionSeconds ?? null,
    });
    if (messageError) throw new Error("Não foi possível enviar a mensagem.");

    await supabaseAdmin
      .from("private_conversations")
      .update({ last_message_at: new Date().toISOString(), status: "waiting" })
      .eq("id", conversationId);

    // Agente IA: usa o relógio real do participante (live ou replay). Uma
    // falha aqui nunca pode perder a mensagem — vira caso para a equipa.
    try {
      const { handleParticipantMessage } = await import("@/lib/ai-agent/respond.server");
      await handleParticipantMessage({
        webinarId: participant.webinar_id,
        organizationId: participant.organization_id,
        conversationId: conversationId!,
        participantId: participant.id,
        participantName: participant.name ?? null,
        text: data.body,
        sessionMs: Math.max(0, (data.sessionSeconds ?? 0) * 1000),
      });
    } catch {
      try {
        const { escalateToCase } = await import("@/lib/support/cases.server");
        await escalateToCase({
          organizationId: participant.organization_id,
          conversationId: conversationId!,
          participantId: participant.id,
          webinarId: participant.webinar_id,
          text: data.body,
          actor: "system",
          reason: "Problema técnico do assistente",
        });
      } catch {
        // Último recurso: a conversa fica marcada para a equipa, mesmo sem caso.
        await supabaseAdmin
          .from("private_conversations")
          .update({ needs_human: true, escalation_reason: "Problema técnico do assistente" })
          .eq("id", conversationId);
      }
    }

    return { ok: true };
  });

export const trackPublicRoomCta = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ctaSchema.parse(data))
  .handler(async ({ data }) => {
    const participantId = await participantOf(data.token);
    await allowCta(participantId);
    const { recordCta } = await import("@/lib/public-room.server");
    return recordCta({ participantId, eventType: data.eventType, videoSecond: data.videoSecond });
  });

/** Entrar no grupo da oferta: guarda os dados confirmados e conta como clique na oferta. */
export const joinOfferGroup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: viewerToken,
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().toLowerCase().email().max(160).optional(),
        phone: z
          .string()
          .trim()
          .regex(/^[\d\s()+-]{6,24}$/)
          .optional(),
        videoSecond: second.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const participantId = await participantOf(data.token);
    await allowCta(participantId);
    const { recordGroupJoin } = await import("@/lib/public-room.server");
    return recordGroupJoin({
      participantId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      videoSecond: data.videoSecond,
    });
  });

export const trackPublicRoomProgress = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => watchedSchema.parse(data))
  .handler(async ({ data }) => {
    const participantId = await participantOf(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // O pico só avança e o tempo visto só soma: um envio atrasado nunca apaga progresso.
    const { error } = await supabaseAdmin.rpc("record_participant_progress", {
      _participant_id: participantId,
      _position: data.watchedSeconds,
      ...(data.entrySeconds !== undefined ? { _entry: data.entrySeconds } : {}),
      _played: data.playedSeconds ?? 0,
    });
    // A sala volta a enviar este progresso no próximo sinal.
    if (error) throw new Error(UNAVAILABLE);
    return { ok: true };
  });

/** Mensagens privadas de um participante, incluindo as respostas da equipa de suporte. */
export const getPublicRoomMessages = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ token: viewerToken }).parse(data))
  .handler(async ({ data }) => {
    const participantId = await participantOf(data.token);
    const { loadRoomMessages } = await import("@/lib/public-room.server");
    return loadRoomMessages(participantId);
  });

/** Compras reais aprovadas para a sala, desde um instante. */
export const getPublicRoomPurchases = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ webinarId: z.string().uuid(), since: z.number().int().nonnegative() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { loadRoomPurchases } = await import("@/lib/public-room.server");
    return loadRoomPurchases(data.webinarId, data.since);
  });

/** A contagem real por webinar, partilhada por toda a sala durante 15 s (uma leitura, não uma por pessoa). */
const liveCounts = new Map<string, { until: number; value: Promise<number> }>();

/**
 * Quantas pessoas entraram na sala nos últimos 10 minutos (sem a sala de teste). O browser não pode
 * contar os participantes (a RLS esconde-os): antes, «Só a real» mostrava sempre 0.
 */
export const getRoomLiveCount = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ webinarId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const hit = liveCounts.get(data.webinarId);
    if (hit && hit.until > Date.now()) return hit.value;
    if (liveCounts.size > 2000) liveCounts.clear();
    const value = (async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { count, error } = await supabaseAdmin
        .from("participants")
        .select("id", { count: "exact", head: true })
        .eq("webinar_id", data.webinarId)
        .gte("joined_at", new Date(Date.now() - 10 * 60_000).toISOString())
        // Quem só deu o WhatsApp não tem e-mail e conta, tal como os convidados do acesso fácil
        // (convidado-…@sala.local); só a sala de teste (teste-…@sala.local) fica de fora.
        .or("email.is.null,email.not.like.teste-%@sala.local");
      if (error) throw new Error(UNAVAILABLE);
      return count ?? 0;
    })();
    liveCounts.set(data.webinarId, { until: Date.now() + 15_000, value });
    value.catch(() => liveCounts.delete(data.webinarId));
    return value;
  });
