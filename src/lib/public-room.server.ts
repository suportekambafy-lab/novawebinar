/**
 * O que as funções públicas da sala fazem na base de dados. Vive à parte das
 * funções de servidor para se poder testar sem um pedido verdadeiro.
 *
 * Regra destas leituras: uma falha da base de dados é sempre um erro para quem
 * chama, nunca "não existe" nem uma lista vazia. É isso que deixa a sala aberta
 * ficar como está e repetir o pedido.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAll } from "@/lib/fetch-all";
import { flowGroupInvite } from "@/lib/flow-group.server";
import { PROVIDERS } from "@/lib/integrations";
import { notifyOutgoing } from "@/lib/integrations.server";
import { liveSettings, parseExtraOffers, roomFormat } from "@/lib/room-logic";
import { sessionWindow } from "@/lib/schedule";
import { smallImage } from "@/lib/shrink-image";

const UNAVAILABLE = "Serviço temporariamente indisponível. Tente novamente.";

/**
 * Envia o aviso para o endereço configurado na integração WebHook.
 * Falhas nunca interrompem a experiência do participante.
 */
export async function notifyWebhook(
  url: string | null | undefined,
  enabled: boolean | null | undefined,
  payload: Record<string, unknown>,
) {
  const endpoint = (url ?? "").trim();
  if (!enabled || !/^https?:\/\//i.test(endpoint)) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, sent_at: new Date().toISOString() }),
    });
  } catch {
    // ignorado de propósito
  }
}

/**
 * Um só URL assinado por vídeo, partilhado por quem entra durante 12 h (vale 24 h): o CDN do
 * Supabase serve-o da cache (HIT, ~0,12 s ao primeiro byte) em vez de ir à origem por cada pessoa.
 * Uma assinatura falhada não fecha a sala: fica o link guardado.
 * ponytail: memória da instância da função; cada instância assina o seu. Chega enquanto forem poucas.
 */
const signedVideos = new Map<string, { url: string; until: number }>();
async function signedVideoUrl(path: string): Promise<string | null> {
  const cached = signedVideos.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data } = await supabaseAdmin.storage
    .from("webinar-videos")
    .createSignedUrl(path, 60 * 60 * 24)
    .catch(() => ({ data: null }));
  if (!data?.signedUrl) return null;
  signedVideos.set(path, { url: data.signedUrl, until: Date.now() + 12 * 3600_000 });
  return data.signedUrl;
}

/**
 * O vídeo de fundo da sala de espera (um vídeo da Biblioteca do mesmo workspace), assinado como o da aula.
 * Nunca rejeita: sem ele (ou com a leitura falhada), a espera fica só com a contagem.
 */
async function waitingVideo(organizationId: string, id: string | null) {
  if (!id) return null;
  const { data } = await supabaseAdmin
    .from("video_sources")
    .select("source_url, provider, storage_path")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle()
    .then(
      (r) => r,
      () => ({ data: null }),
    );
  if (!data) return null;
  const url = (data.storage_path ? await signedVideoUrl(data.storage_path) : null) ?? data.source_url;
  return url ? { url, provider: data.provider } : null;
}

const ROOM_SELECT =
  "id, organization_id, public_title, description, status, room_theme, host_name, host_role, host_avatar_url, chat_pin_title, chat_pin_message, offer_pin_title, offer_pin_message, scheduled_at, session_end_time, schedule_mode, recurrence_enabled, recurrence_pattern, recurrence_weekday, recurrence_start_time, recurrence_end_time, jit_interval_minutes, timezone, duration_seconds, replay_enabled, waiting_room_enabled, prelive_enabled, prelive_seconds, prelive_sound, prelive_message, prelive_template, prelive_appearance, easy_access, sync_video_with_start, cta_text, cta_url, cta_color, cta_price_original, cta_price_now, cta_image_url, cta_countdown_seconds, cta_start_seconds, cta_end_seconds, registration_headline, registration_subtitle, registration_button_text, registration_collect_phone, registration_require_phone, registration_cover_url, registration_badge_text, registration_progress_enabled, registration_progress_value, registration_scarcity_note, share_title, share_description, share_image_url, video_source_id, entry_fields, entry_card_color, entry_button_color, extra_offers, offer_deadline, offer_countdown_end, offer_utm, sales_show_real, sales_where, recurrence_days, recurrence_times, jit_skip_night, host_verified, room_theme_system, chat_settings, video_sources(source_url, provider, duration_seconds, storage_path)";

/**
 * Uma cache curta, por instância do servidor: a mesma sala pedida por centenas de pessoas no mesmo minuto
 * faz uma só leitura. Em carga, cada página custava cerca de dez consultas e a base de dados ficava a 25
 * páginas por segundo; com a cache, custa quase nenhuma. Um pedido em curso é partilhado (sem avalanche
 * quando a entrada expira), e uma falha não fica guardada.
 */
const ROOM_TTL_MS = 10_000;
const roomCache = new Map<string, { until: number; value: Promise<RoomPayload | null> }>();
function cachedRoom(key: string, load: () => Promise<RoomPayload | null>): Promise<RoomPayload | null> {
  const hit = roomCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  if (roomCache.size > 1000) roomCache.clear();
  const value = load().catch((error: unknown) => {
    roomCache.delete(key);
    throw error;
  });
  roomCache.set(key, { until: Date.now() + ROOM_TTL_MS, value });
  return value;
}
/** Só para os testes: esquece as salas guardadas. */
export function clearPublicRoomCache() {
  roomCache.clear();
}

type RoomRow = NonNullable<Awaited<ReturnType<typeof readRoomRow>>>;
async function readRoomRow(column: "slug" | "id", value: string) {
  const { data, error } = await supabaseAdmin.from("webinars").select(ROOM_SELECT).eq(column, value).maybeSingle();
  // Falha de leitura não é "não existe": quem chama mantém a sala que já tem.
  if (error) throw new Error(UNAVAILABLE);
  return data;
}

export type RoomPayload = Awaited<ReturnType<typeof buildRoom>>;

/**
 * A sala de um endereço. Primeiro um webinar com esse slug; senão um teste A/B com esse endereço, que
 * entrega a variante desta pessoa (ver ab-tests/assign.server) sem o endereço mudar.
 */
export async function loadPublicRoom(slug: string, meta: import("@/lib/ab-tests/assign.server").AssignmentMeta = {}, preview?: string | null) {
  const bySlug = await cachedRoom(`slug:${slug}`, async () => {
    const row = await readRoomRow("slug", slug);
    return row ? buildRoom(row) : null;
  });
  if (bySlug) return bySlug;
  const { resolveTestSlug } = await import("@/lib/ab-tests/assign.server");
  const resolved = await resolveTestSlug(slug, meta, preview);
  if (!resolved) return null;
  const byId = await cachedRoom(`id:${resolved.webinarId}`, async () => {
    const row = await readRoomRow("id", resolved.webinarId);
    return row ? buildRoom(row) : null;
  });
  if (!byId) return null;
  return { ...byId, abTest: { id: resolved.testId, variantId: resolved.variantId, preview: resolved.preview } };
}

/** O que a sala pública recebe, a partir da linha do webinar: comentários, oferta, legendas, vídeo assinado. */
async function buildRoom(webinar: RoomRow) {
  const abTest: { id: string; variantId: string; preview: boolean } | null = null;
  const source = webinar.video_sources;
  const live = liveSettings(webinar.chat_settings);
  // A assinatura do vídeo e o convite do grupo correm ao lado das seis leituras, em vez de esperar por elas.
  const [parts, signedVideo, groupUrl, waitingBg, countdownBg] = await Promise.all([Promise.all([
    // Um webinar longo passa dos 1000 comentários; cortados, o chat calava-se a meio.
    fetchAll((from, to) =>
      supabaseAdmin
        .from("scheduled_comments")
        .select("id, author_name, avatar_url, message, offset_seconds, offset_ms, created_at", {
          count: "exact",
        })
        .eq("webinar_id", webinar.id)
        .order("offset_seconds", { ascending: true })
        .order("id")
        .range(from, to),
    ).then(
      (data) => ({ data, error: null }),
      (error: unknown) => ({ data: null, error }),
    ),
    supabaseAdmin
      .from("audience_configuration")
      .select("mode, curve, format")
      .eq("webinar_id", webinar.id)
      .maybeSingle(),
    supabaseAdmin
      .from("social_proof_settings")
      .select(
        "enabled, product_name, start_mode, start_delay_seconds, start_seconds, end_seconds, min_interval_seconds, max_interval_seconds, position, display_seconds, animation, sound_enabled, notification_color",
      )
      .eq("webinar_id", webinar.id)
      .maybeSingle(),
    supabaseAdmin
      .from("simulated_purchase_events")
      .select("id, buyer_name, product_name, message, offset_seconds")
      .eq("webinar_id", webinar.id)
      .order("offset_seconds", { ascending: true }),
    // Os pixels da conta e os deste webinar (Integrações, âmbito «este webinar»): o do webinar substitui o da conta.
    supabaseAdmin
      .from("integrations")
      .select("provider, settings, webinar_id")
      .eq("organization_id", webinar.organization_id)
      .eq("enabled", true)
      .in("provider", ["meta_pixel", "tiktok_pixel", "google_tag"])
      .or(`webinar_id.is.null,webinar_id.eq.${webinar.id}`),
    // A transcrição do vídeo dá as legendas da sala.
    supabaseAdmin
      .from("webinar_transcripts")
      .select("segments, video_source_id")
      .eq("webinar_id", webinar.id)
      .maybeSingle(),
  ]), source?.storage_path ? signedVideoUrl(source.storage_path) : null,
    // Nunca rejeita: sem grupo no fluxo (ou com a leitura falhada) vem null e o botão não aparece.
    flowGroupInvite(webinar.organization_id, webinar.id),
    waitingVideo(webinar.organization_id, webinar.waiting_room_enabled ? live.waiting.video : null),
    // O vídeo de fundo da contagem antes de começar, também da Biblioteca e assinado da mesma forma.
    waitingVideo(webinar.organization_id, live.countdown?.on ? live.countdown.background.video : null)]);
  // Uma sala sem comentários ou sem oferta por causa de uma leitura falhada
  // substituiria a sala boa de quem já está a assistir.
  if (parts.some((part) => part.error)) throw new Error(UNAVAILABLE);
  const [
    { data: comments },
    { data: audience },
    { data: socialProof },
    { data: simulated },
    { data: adIntegrations },
    { data: transcript },
  ] = parts;

  // Os ids vão parar a endereços de scripts: validam-se outra vez aqui.
  const pixels: Partial<Record<"meta_pixel" | "tiktok_pixel" | "google_tag", string>> = {};
  const scoped = new Set<string>();
  for (const row of adIntegrations ?? []) {
    const info = PROVIDERS.find((p) => p.id === row.provider);
    const id = String(
      (row.settings as Record<string, unknown> | null)?.[info?.setting?.key ?? ""] ?? "",
    );
    if (!info?.setting?.pattern.test(id)) continue;
    const own = (row as { webinar_id?: string | null }).webinar_id === webinar.id;
    // Já há o pixel próprio deste webinar: o da conta não o substitui.
    if (!own && scoped.has(row.provider)) continue;
    pixels[row.provider as keyof typeof pixels] = id;
    if (own) scoped.add(row.provider);
  }

  const duration = source?.duration_seconds || webinar.duration_seconds;
  const session = sessionWindow({ ...webinar, duration_seconds: duration });

  // Vídeo guardado no bucket privado: URL assinado. Vídeos externos (ou enviados antes de existir
  // `storage_path`) mantêm o link guardado.
  const videoUrl: string | null = signedVideo ?? source?.source_url ?? null;

  // Legendas só da transcrição deste vídeo: a de um vídeo trocado diria outra coisa.
  const captions =
    transcript && transcript.video_source_id === webinar.video_source_id && Array.isArray(transcript.segments)
      ? (transcript.segments as unknown[])
          .map((segment) => segment as { at?: unknown; text?: unknown })
          .filter((segment) => Number.isFinite(Number(segment.at)) && typeof segment.text === "string")
          .map((segment) => ({ at: Number(segment.at), text: String(segment.text).slice(0, 300) }))
      : [];

  return {
    pixels,
    captions,
    /** O endereço era de um teste A/B: a variante que esta pessoa recebeu. */
    abTest,
    webinar: {
      id: webinar.id,
      organization_id: webinar.organization_id,
      public_title: webinar.public_title,
      description: webinar.description,
      host_name: webinar.host_name ?? "",
      host_role: webinar.host_role ?? "",
      // Na Vercel, a foto carregada antes da redução (até 900 KB, mostrada a 28–48 px) sai pequena.
      host_avatar_url: process.env["VERCEL"] ? smallImage(webinar.host_avatar_url ?? "") : (webinar.host_avatar_url ?? ""),
      chat_pin_title: webinar.chat_pin_title ?? "",
      chat_pin_message: webinar.chat_pin_message ?? "",
      offer_pin_title: webinar.offer_pin_title ?? "",
      offer_pin_message: webinar.offer_pin_message ?? "",
      status: webinar.status,
      room_theme: webinar.room_theme === "light" ? "light" : "dark",
      room_theme_system: webinar.room_theme_system,
      room_format: roomFormat(webinar.chat_settings),
      live,
      /** O vídeo de fundo da sala de espera, já assinado; null sem vídeo. */
      waiting_video: waitingBg,
      /** O vídeo de fundo da contagem antes de começar, já assinado; null sem vídeo. */
      countdown_video: countdownBg,
      host_verified: webinar.host_verified,
      entry_fields: webinar.entry_fields,
      entry_card_color: webinar.entry_card_color,
      entry_button_color: webinar.entry_button_color,
      extra_offers: webinar.extra_offers,
      offer_deadline: webinar.offer_deadline,
      offer_countdown_end: webinar.offer_countdown_end,
      offer_utm: webinar.offer_utm,
      sales_show_real: webinar.sales_show_real,
      sales_where: webinar.sales_where,
      scheduled_at: webinar.scheduled_at,
      session_start: session.startMs ? new Date(session.startMs).toISOString() : null,
      session_end: session.endMs ? new Date(session.endMs).toISOString() : null,
      session_ended: session.endedMs ? new Date(session.endedMs).toISOString() : null,
      waiting_open: session.waitingOpen,
      schedule_mode: webinar.schedule_mode,
      recurrence_enabled: webinar.recurrence_enabled,
      timezone: webinar.timezone,
      duration_seconds: duration,
      replay_enabled: webinar.replay_enabled,
      waiting_room_enabled: webinar.waiting_room_enabled,
      prelive_enabled: webinar.prelive_enabled,
      prelive_seconds: webinar.prelive_seconds,
      prelive_sound: webinar.prelive_sound,
      prelive_message: webinar.prelive_message,
      prelive_template: webinar.prelive_template,
      prelive_appearance: webinar.prelive_appearance,
      easy_access: webinar.easy_access,
      sync_video_with_start: webinar.sync_video_with_start,
      cta_text: webinar.cta_text,
      cta_url: webinar.cta_url,
      cta_color: webinar.cta_color,
      cta_price_original: webinar.cta_price_original,
      cta_price_now: webinar.cta_price_now,
      cta_image_url: webinar.cta_image_url,
      cta_countdown_seconds: webinar.cta_countdown_seconds,
      cta_start_seconds: webinar.cta_start_seconds,
      cta_end_seconds: webinar.cta_end_seconds,
      registration_headline: webinar.registration_headline,
      registration_subtitle: webinar.registration_subtitle,
      registration_button_text: webinar.registration_button_text,
      registration_collect_phone: webinar.registration_collect_phone,
      registration_require_phone: webinar.registration_require_phone,
      registration_cover_url: webinar.registration_cover_url,
      registration_badge_text: webinar.registration_badge_text,
      registration_progress_enabled: webinar.registration_progress_enabled,
      registration_progress_value: webinar.registration_progress_value,
      registration_scarcity_note: webinar.registration_scarcity_note,
      share_title: webinar.share_title,
      share_description: webinar.share_description,
      share_image_url: webinar.share_image_url,
      video_url: videoUrl,
      /** Convite do grupo de WhatsApp do fluxo deste webinar (o mesmo de {{link_grupo}}). */
      group_url: groupUrl,
      video_provider: source?.provider ?? null,
    },
    // O instante exacto vem dos milissegundos quando existem: o chat acompanha a fala, não o segundo inteiro.
    comments: (comments ?? []).map(({ offset_ms, ...comment }) => ({
      ...comment,
      offset_seconds: typeof offset_ms === "number" ? offset_ms / 1000 : comment.offset_seconds,
    })),
    audience: { mode: audience?.mode ?? "real", curve: audience?.curve ?? [], format: audience?.format ?? null },
    socialProof: socialProof ?? null,
    simulatedPurchases: simulated ?? [],
  };
}

export async function recordCta(data: {
  participantId: string;
  eventType: "view" | "click";
  videoSecond?: number | undefined;
}) {
  const { data: participant, error: participantError } = await supabaseAdmin
    .from("participants")
    .select("id, name, email, webinar_id, organization_id, cta_clicked")
    .eq("id", data.participantId)
    .maybeSingle();
  // Quem falha avisa: a sala repete o envio em vez de perder o evento.
  if (participantError) throw new Error(UNAVAILABLE);
  if (!participant) return { ok: false };

  const { error: eventError } = await supabaseAdmin.from("cta_events").insert({
    organization_id: participant.organization_id,
    webinar_id: participant.webinar_id,
    participant_id: participant.id,
    event_type: data.eventType,
    video_second: data.videoSecond ?? null,
  });
  if (eventError) throw new Error(UNAVAILABLE);

  if (data.eventType === "click") {
    // Só o primeiro clique avisa os webhooks; a sala de teste (`@sala.local`) nunca avisa ninguém.
    const isTestViewer = !participant.email || participant.email.endsWith("@sala.local");
    const firstClick = !participant.cta_clicked;
    const { error: clickError } = await supabaseAdmin
      .from("participants")
      .update({ cta_clicked: true })
      .eq("id", participant.id);
    if (clickError)
      console.error(
        `[cta] participante ${participant.id} sem marca de clique: ${clickError.message}`,
      );

    if (isTestViewer || !firstClick) return { ok: true };
    const { data: webinar } = await supabaseAdmin
      .from("webinars")
      .select("public_title, webhook_url, webhook_enabled")
      .eq("id", participant.webinar_id)
      .maybeSingle();

    await notifyWebhook(webinar?.webhook_url, webinar?.webhook_enabled, {
      event: "cta_click",
      webinar_id: participant.webinar_id,
      webinar: webinar?.public_title ?? null,
      participant_id: participant.id,
      name: participant.name,
      email: participant.email,
    });
    await notifyOutgoing(participant.organization_id, "offer.clicked", {
      webinar_id: participant.webinar_id,
      webinar: webinar?.public_title ?? null,
      name: participant.name,
      email: participant.email,
      video_second: data.videoSecond ?? null,
    });
  }

  return { ok: true };
}

/**
 * Entrar no grupo da oferta (WhatsApp ou Telegram): a pessoa confirma o nome, o e-mail e o
 * WhatsApp, e fica marcada em `participants.answers.grupo`. Depois conta como clique na oferta,
 * para as automações e as métricas separarem quem entrou no grupo e comprou de quem não comprou.
 */
export async function recordGroupJoin(data: {
  participantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  videoSecond?: number | undefined;
}) {
  const { data: participant, error } = await supabaseAdmin
    .from("participants")
    .select("id, name, email, phone, answers")
    .eq("id", data.participantId)
    .maybeSingle();
  if (error) throw new Error(UNAVAILABLE);
  if (!participant) return { ok: false };
  const answers =
    participant.answers && typeof participant.answers === "object" && !Array.isArray(participant.answers)
      ? (participant.answers as Record<string, unknown>)
      : {};
  // O e-mail só substitui o provisório da entrada sem formulário; nunca outro já confirmado.
  const placeholder = !participant.email || participant.email.endsWith("@sala.local");
  const { error: updateError } = await supabaseAdmin
    .from("participants")
    .update({
      name: data.name || participant.name,
      ...(data.email && placeholder ? { email: data.email } : {}),
      ...(data.phone ? { phone: data.phone } : {}),
      answers: { ...answers, grupo: new Date().toISOString() },
    })
    .eq("id", participant.id);
  if (updateError) throw new Error(UNAVAILABLE);
  return recordCta({ participantId: participant.id, eventType: "click", videoSecond: data.videoSecond });
}

/**
 * Credencial da sala: o id da participação assinado pelo servidor. Só quem entra pela sala a
 * recebe; saber o id (de um webhook, de uma resposta da API) não chega para ler ou escrever
 * no chat privado de outra pessoa.
 * ponytail: chave derivada da service role; trocá-la obriga quem está na sala a entrar outra vez.
 */
function roomSignature(participantId: string) {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error(UNAVAILABLE);
  return createHmac("sha256", key).update(`room-access:${participantId}`).digest("base64url");
}

export const roomToken = (participantId: string) => `${participantId}.${roomSignature(participantId)}`;

/** O id da participação de uma credencial emitida por este servidor; null em qualquer outro caso. */
export function participantFromToken(token: string): string | null {
  const [id, signature, extra] = token.split(".");
  if (!id || !signature || extra !== undefined) return null;
  const expected = Buffer.from(roomSignature(id));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export async function loadRoomMessages(participantId: string) {
  const { data: messages, error } = await supabaseAdmin
    .from("private_messages")
    .select("id, body, sender_kind, created_at")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: true })
    .limit(200);
  // Com erro, a sala fica com a conversa que já tinha em vez de a esvaziar.
  if (error) throw new Error(UNAVAILABLE);

  return { messages: messages ?? [] };
}

/**
 * Compras reais aprovadas para a sala: as do produto da oferta (o id do produto está no link
 * do botão), desde `sinceMs`. Só o primeiro nome de quem comprou chega ao público.
 */
export async function loadRoomPurchases(webinarId: string, sinceMs: number) {
  const { data: webinar, error } = await supabaseAdmin
    .from("webinars")
    .select("organization_id, cta_url, extra_offers, sales_show_real")
    .eq("id", webinarId)
    .maybeSingle();
  if (error) throw new Error(UNAVAILABLE);
  if (!webinar?.sales_show_real) return [];
  const urls = [webinar.cta_url ?? "", ...parseExtraOffers(webinar.extra_offers).map((o) => o.url)].filter(Boolean);
  if (urls.length === 0) return [];
  // No máximo seis horas para trás: a sala mostra o que está a acontecer, não o histórico.
  const since = new Date(Math.max(sinceMs, Date.now() - 6 * 3600_000)).toISOString();
  const { data: rows, error: purchasesError } = await supabaseAdmin
    .from("real_purchase_events")
    .select("id, buyer_name, product_name, product_id, approved_at")
    .eq("organization_id", webinar.organization_id)
    .eq("status", "approved")
    .gte("approved_at", since)
    .order("approved_at", { ascending: true })
    .limit(50);
  if (purchasesError) throw new Error(UNAVAILABLE);
  return (rows ?? [])
    .filter((row) => {
      const id = (row.product_id ?? "").trim();
      return id.length >= 4 && urls.some((url) => url.includes(id));
    })
    .map((row) => ({
      id: row.id,
      buyer: (row.buyer_name ?? "").trim().split(/\s+/)[0] || "Alguém",
      product: row.product_name ?? "",
      at: row.approved_at,
    }));
}
