/**
 * Inscrição num webinar, o mesmo caminho para a sala (joinPublicRoom) e para a captura
 * externa (formulário embed ou API pública): sessão global, participação, contacto (pelo
 * gatilho da base de dados, sem duplicar), evento canónico de inscrição (0063) e as
 * notificações de saída de sempre.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { leadSource } from "@/lib/contacts";
import { fieldApiKey, parseEntryFields, validateEntry } from "@/lib/entry-fields";
import { normalizeName, normalizePhone, originAllowed, parseRegistration, RateLimiter, type RegistrationError } from "@/lib/registration";
import { originalRegistration } from "@/lib/room-viewer.server";

export const WEBINAR_REGISTRATION_COLUMNS =
  "id, organization_id, status, slug, public_title, internal_name, webhook_url, webhook_enabled, schedule_mode, scheduled_at, session_end_time, recurrence_enabled, recurrence_pattern, recurrence_weekday, recurrence_start_time, recurrence_end_time, recurrence_days, recurrence_times, jit_interval_minutes, jit_skip_night, timezone, duration_seconds, entry_fields, registration_collect_phone, registration_require_phone, video_sources(duration_seconds)";

export async function loadRegistrationWebinar(id: string) {
  const { data, error } = await supabaseAdmin
    .from("webinars")
    .select(WEBINAR_REGISTRATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
type RegistrationWebinar = NonNullable<Awaited<ReturnType<typeof loadRegistrationWebinar>>>;

/** Dispositivo e localização a partir dos cabeçalhos do pedido. */
export function audienceMetaFromHeaders(headers: Headers): {
  device: "mobile" | "tablet" | "desktop" | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
} {
  const ua = headers.get("user-agent") ?? "";
  const mobileHint = headers.get("sec-ch-ua-mobile");
  const isMobile = mobileHint === "?1" || /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua);
  // Tablet: iPad, «Tablet», ou Android sem «Mobile» (o iPadOS que se diz Mac só o browser distingue: detectDevice).
  const isTablet = /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua));
  const code = (headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  const rawCity = headers.get("cf-ipcity") ?? headers.get("x-vercel-ip-city") ?? headers.get("x-geo-city");
  let city = "";
  try {
    city = rawCity ? decodeURIComponent(rawCity).trim() : "";
  } catch {
    city = rawCity ?? "";
  }
  return {
    device: ua ? (isTablet ? "tablet" : isMobile ? "mobile" : "desktop") : null,
    city: city || null,
    country: code && code !== "XX" ? countryNameFromIso(code) : null,
    countryCode: code && code !== "XX" ? code : null,
  };
}

function countryNameFromIso(code: string): string {
  try {
    return new Intl.DisplayNames(["pt-PT"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * A sessão global de uma inscrição ao vivo num webinar com horário, com a mesma janela que a
 * sala mostra. Replay, teste e webinars sem horário não têm sessão. Uma falha não impede a
 * inscrição.
 */
export async function openRegistrationSession(webinar: RegistrationWebinar, mode: "live" | "replay", teste = false) {
  if (mode !== "live" || teste) return null;
  const { sessionWindow } = await import("@/lib/schedule");
  const window = sessionWindow({
    ...webinar,
    duration_seconds: webinar.video_sources?.duration_seconds || webinar.duration_seconds,
  });
  if (window.startMs === null) return null;
  // Data única que já terminou: quem chega agora não entra na sessão encerrada (fica como o
  // replay, sem sessão). A repetição e o just in time devolvem sempre a sessão actual ou a próxima.
  if (window.endMs !== null && window.endMs <= Date.now()) return null;
  const opened = await supabaseAdmin.rpc("open_webinar_session", {
    _webinar_id: webinar.id,
    _starts_at: new Date(window.startMs).toISOString(),
    ...(window.endMs !== null ? { _ends_at: new Date(window.endMs).toISOString() } : {}),
  });
  if (opened.error) {
    console.error(`[sessão] por abrir no webinar ${webinar.id}: ${opened.error.message}`);
    return null;
  }
  return opened.data;
}

export type NewRegistration = {
  name: string;
  /** Sem e-mail quando a página só pede o WhatsApp. */
  email: string | null;
  phone: string | null;
  /** Respostas aos campos novos da página. */
  answers?: Record<string, string>;
  mode: "live" | "replay";
  device: "mobile" | "tablet" | "desktop" | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  utm: { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string };
  referrer: string | null;
  source: "room" | "embed" | "api";
  formId?: string | null;
  consentAt?: string | null;
  submissionId?: string | null;
  teste?: boolean;
};

/** Grava a participação e avisa quem tem de ser avisado. O contacto nasce na base de dados. */
export async function createRegistration(
  webinar: RegistrationWebinar,
  r: NewRegistration,
  sessionId: string | null,
  /** `false` quando quem chama já procurou a inscrição anterior (a captura). */
  findOriginal = true,
) {
  // Sala de teste: entra como convidado. Sem email real nem telefone a base de dados não cria
  // contacto, por isso não há evento de inscrição nem automações; a sala comporta-se igual.
  const internal = Boolean(r.email?.endsWith("@sala.local"));
  // Uma segunda inscrição da mesma pessoa (outro aparelho, o formulário outra vez) fica na sessão original:
  // o evento de inscrição não se repete (nem aquecimento nem lembretes) e a sala segue a sessão dela.
  const original =
    findOriginal && !r.teste && !internal ? await originalRegistration(webinar, { email: r.email, phone: r.phone }) : null;
  const email = r.teste && !internal ? `teste-${crypto.randomUUID().slice(0, 8)}@sala.local` : r.email;
  const { data: participant, error } = await supabaseAdmin
    .from("participants")
    .insert({
      webinar_id: webinar.id,
      organization_id: webinar.organization_id,
      name: r.name,
      email,
      phone: r.teste ? null : r.phone,
      viewing_mode: r.mode,
      device: r.device,
      city: r.city,
      country: r.country,
      country_code: r.countryCode,
      utm_source: r.utm.utm_source ?? null,
      utm_medium: r.utm.utm_medium ?? null,
      utm_campaign: r.utm.utm_campaign ?? null,
      utm_content: r.utm.utm_content ?? null,
      utm_term: r.utm.utm_term ?? null,
      referrer: r.referrer,
      webinar_session_id: original?.webinar_session_id ?? sessionId,
      registration_source: r.source,
      form_id: r.formId ?? null,
      consent_at: r.consentAt ?? null,
      submission_id: r.submissionId ?? null,
      answers: r.answers ?? {},
    })
    .select("id, name, contact_id, webinar_session_id")
    .single();
  if (error) return { participant: null, error };

  const { notifyWebhook } = await import("@/lib/public-room.server");
  await notifyWebhook(webinar.webhook_url, r.teste ? false : webinar.webhook_enabled, {
    event: "registration",
    webinar_id: webinar.id,
    webinar: webinar.public_title,
    participant_id: participant.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    mode: r.mode,
  });
  // Quem entra só com o WhatsApp também é um contacto novo.
  if (!r.teste && !internal && (r.email || r.phone)) {
    const { notifyOutgoing } = await import("@/lib/integrations.server");
    await notifyOutgoing(webinar.organization_id, "contact.registered", {
      webinar_id: webinar.id,
      webinar: webinar.public_title,
      name: r.name,
      email: r.email,
      phone: r.phone,
      mode: r.mode,
      source: r.source,
      utm_source: r.utm.utm_source ?? null,
      utm_medium: r.utm.utm_medium ?? null,
      utm_campaign: r.utm.utm_campaign ?? null,
    });
  }
  return { participant, error: null };
}

/* ---------- Captura externa (formulário embed ou API) ---------- */

export const perVisitor = new RateLimiter(10, 60_000);
export const perTarget = new RateLimiter(300, 60_000);
/**
 * A sala tem limites mais largos: as operadoras partilham um IP entre muitos telemóveis, e uma audiência
 * de 10 000 pessoas entra a mais de 1000 por minuto antes de começar. Chega para travar um ciclo num só IP.
 */
export const roomPerVisitor = new RateLimiter(60, 60_000);
export const roomPerTarget = new RateLimiter(5000, 60_000);
export const RATE_LIMITED = "Demasiadas inscrições seguidas. Tente daqui a um minuto.";

export type CaptureResponse = { status: number; body: Record<string, unknown>; allowOrigin: string | null };

const fail = (e: RegistrationError, allowOrigin: string | null): CaptureResponse => ({
  status: e.status,
  body: { ok: false, error: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) },
  allowOrigin,
});

type CaptureForm = {
  id: string;
  organization_id: string;
  webinar_id: string;
  active: boolean;
  allowed_origins: string[] | null;
  require_phone: boolean;
  consent_text: string | null;
  success_message: string | null;
  redirect_url: string | null;
};

const IDS = "id, contact_id, webinar_session_id";

/**
 * Inscrição vinda de fora. A organização sai do formulário (form_id) ou do webinar
 * (webinar_id, para quem integra pela API sem formulário), nunca do pedido.
 * Ordem: validar → formulário activo e origem → ritmo por visitante → armadilha →
 * consentimento → webinar publicado → campos do webinar (as regras da sala) → ritmo por alvo →
 * mesma submissão (idempotência) ou mesma pessoa na mesma sessão
 * (devolve a inscrição que já existe) → inscrição (contacto e evento canónico
 * webinar_registered nascem na base de dados).
 *
 * Contrato com o Core: a resposta traz contact_id e registration_id (= participation_id:
 * a linha de participants é a inscrição e a participação no webinar), com a origem
 * gravada nessa linha e no evento. Só a quem criou a inscrição (agora ou com a mesma
 * submissão): um email que já estava inscrito confirma sem devolver os ids.
 */
export async function registerFromCapture(
  body: unknown,
  req: {
    origin: string | null;
    ip: string;
    headers: Headers;
    appOrigin: string;
    source: "embed" | "api";
    /** Cabeçalho Idempotency-Key: serve de submission_id quando o corpo não o traz. */
    idempotencyKey?: string | null;
  },
): Promise<CaptureResponse> {
  const withKey =
    req.idempotencyKey && body && typeof body === "object" && !(body as { submission_id?: unknown }).submission_id
      ? { ...body, submission_id: req.idempotencyKey }
      : body;
  const parsed = parseRegistration(withKey);
  if (!parsed.ok) return fail(parsed.error, req.origin);
  const v = parsed.value;

  let form: CaptureForm | null = null;
  if (v.form_id) {
    const { data, error } = await supabaseAdmin
      .from("registration_forms")
      .select("id, organization_id, webinar_id, active, allowed_origins, require_phone, consent_text, success_message, redirect_url")
      .eq("id", v.form_id)
      .maybeSingle();
    if (error) return fail({ status: 500, code: "unavailable", message: "Tente outra vez dentro de momentos." }, req.origin);
    if (!data || !data.active) return fail({ status: 404, code: "form_not_found", message: "Formulário indisponível." }, req.origin);
    if (!originAllowed(req.origin, data.allowed_origins ?? []))
      return fail({ status: 403, code: "origin_not_allowed", message: "Esta página não pode usar o formulário." }, null);
    if (v.webinar_id && v.webinar_id !== data.webinar_id)
      return fail({ status: 400, code: "webinar_mismatch", message: "O formulário não é deste webinar." }, req.origin);
    form = data;
  }
  const allowOrigin = req.origin;
  const webinarId = form?.webinar_id ?? v.webinar_id!;
  const rateLimited = () => fail({ status: 429, code: "rate_limited", message: RATE_LIMITED }, allowOrigin);
  // Por visitante, em todos os alvos: trocar de webinar_id não abre um limite novo.
  if (!perVisitor.allow(req.ip)) return rateLimited();
  // Robô: responde como se tivesse corrido bem e não grava nada.
  if (v.website?.trim()) return { status: 200, body: { ok: true, status: "registered" }, allowOrigin };
  if (form?.consent_text && !v.consent)
    return fail({ status: 400, code: "invalid", message: "Dados inválidos.", fields: { consent: "É preciso aceitar para se inscrever." } }, allowOrigin);

  const webinar = await loadRegistrationWebinar(webinarId).catch(() => null);
  if (!webinar || (form && webinar.organization_id !== form.organization_id) || webinar.status === "draft")
    return fail({ status: 404, code: "webinar_unavailable", message: "Este webinar não está disponível." }, allowOrigin);

  // Os campos da página (etapa Página do editor), com as regras da sala: uma só fonte para a sala, o formulário embed e a API.
  const fields = parseEntryFields(webinar.entry_fields, {
    collectPhone: webinar.registration_collect_phone,
    requirePhone: webinar.registration_require_phone,
  });
  const entry = validateEntry(fields, { ...(v.answers ?? {}), name: v.name ?? "", email: v.email ?? "", whatsapp: v.phone ?? "" });
  const invalid = (key: string, message: string) =>
    fail({ status: 400, code: "invalid", message, fields: { [key]: message } }, allowOrigin);
  if (!entry.ok) {
    const field = fields.find((f) => f.id === entry.field);
    return invalid(field ? fieldApiKey(field) : entry.field, entry.message);
  }
  const phone = normalizePhone(entry.phone);
  if (entry.phone && !phone) return invalid("phone", "Indique um número de WhatsApp válido.");
  const person = { name: normalizeName(entry.name), email: entry.email, phone, answers: entry.answers };
  // Por alvo, só depois de o formulário ou o webinar existirem: ids inventados não ocupam o limitador.
  if (!perTarget.allow(form?.id ?? webinar.id)) return rateLimited();

  type Row = { id: string; contact_id: string | null; webinar_session_id: string | null };
  /** `own`: quem pede criou esta inscrição (agora, ou com a mesma submissão); só então leva os ids. */
  const done = async (status: "registered" | "already_registered", participant: Row, own = true) => {
    const { flowGroupInvite } = await import("@/lib/flow-group.server");
    // A hora da sessão desta pessoa e o convite do grupo do fluxo (o formulário mostra o botão), lidos juntos.
    const [session, groupUrl] = await Promise.all([
      participant.webinar_session_id
        ? supabaseAdmin.from("webinar_sessions").select("starts_at").eq("id", participant.webinar_session_id).maybeSingle()
        : null,
      flowGroupInvite(webinar.organization_id, webinar.id),
    ]);
    const startsAt = session?.data?.starts_at ?? webinar.scheduled_at;
    return {
      status: status === "registered" ? 201 : 200,
      body: {
        ok: true,
        status,
        ...(own
          ? { registration_id: participant.id, participation_id: participant.id, contact_id: participant.contact_id }
          : {}),
        webinar: { id: webinar.id, title: webinar.public_title || webinar.internal_name, starts_at: startsAt },
        room_url: `${req.appOrigin}/w/${webinar.slug}`,
        group_url: groupUrl,
        message: form?.success_message || "Inscrição confirmada.",
        redirect_url: form?.redirect_url ?? null,
      },
      allowOrigin,
    };
  };
  const sameSubmission = async () => {
    if (!v.submission_id) return null;
    const { data } = await supabaseAdmin
      .from("participants")
      .select(IDS)
      .eq("webinar_id", webinar.id)
      .eq("submission_id", v.submission_id)
      .maybeSingle();
    return data;
  };

  // A mesma submissão repetida (duplo clique, nova tentativa da rede): a mesma inscrição.
  const same = await sameSubmission();
  if (same) return done("already_registered", same);

  // A mesma pessoa outra vez: uma inscrição (e o mesmo contacto, pela base de dados), na sessão original enquanto
  // ela não acabou ou se já viu (room-viewer.server); só quem nunca entrou numa sessão acabada passa para a seguinte.
  // A origem da primeira inscrição fica: nada é sobrescrito. Só o email (ou, sem ele, o WhatsApp)
  // coincide e qualquer pessoa o pode escrever: a resposta confirma sem devolver os ids da inscrição que já existe.
  const sessionId = await openRegistrationSession(webinar, "live");
  const already = await originalRegistration(webinar, person);
  // Uma inscrição sem sessão (replay) não prende quem agora se inscreve numa sessão.
  if (already && (already.webinar_session_id !== null || sessionId === null)) return done("already_registered", already, false);

  // Sem UTM: os ids de clique dos anúncios (fbclid, gclid) no endereço da página e depois o
  // site de onde a pessoa chegou, com as mesmas regras da sala (leadSource).
  const pageParams = (() => {
    try {
      return new URL(v.page_url ?? "").searchParams;
    } catch {
      return new URLSearchParams();
    }
  })();
  const pageHost = (() => {
    try {
      return new URL(v.page_url ?? "").hostname;
    } catch {
      return "";
    }
  })();
  const lead = leadSource({
    utm_source: v.utm.utm_source,
    utm_medium: v.utm.utm_medium,
    utm_campaign: v.utm.utm_campaign,
    utm_content: v.utm.utm_content,
    fbclid: pageParams.get("fbclid") ?? undefined,
    gclid: pageParams.get("gclid") ?? undefined,
    referrer: v.referrer?.trim() ?? "",
    ownHost: pageHost,
  });

  const meta = audienceMetaFromHeaders(req.headers);
  const { participant, error } = await createRegistration(
    webinar,
    {
      ...person,
      mode: "live",
      device: v.device ?? meta.device,
      city: meta.city,
      country: meta.country,
      countryCode: meta.countryCode,
      utm: {
        ...v.utm,
        ...(lead.utmSource ? { utm_source: lead.utmSource } : {}),
        ...(lead.utmMedium ? { utm_medium: lead.utmMedium } : {}),
      },
      referrer: v.referrer?.trim() || null,
      source: req.source,
      formId: form?.id ?? null,
      consentAt: v.consent ? new Date().toISOString() : null,
      submissionId: v.submission_id ?? null,
    },
    sessionId,
    false,
  );
  if (error || !participant) {
    // Duas submissões iguais ao mesmo tempo: a segunda encontra a primeira.
    if (error?.code === "23505") {
      const again = await sameSubmission();
      if (again) return done("already_registered", again);
    }
    console.error(`[captura] inscrição falhou no webinar ${webinar.id}: ${error?.message}`);
    return fail({ status: 500, code: "unavailable", message: "Não foi possível concluir a inscrição. Tente outra vez." }, allowOrigin);
  }
  return done("registered", participant);
}
