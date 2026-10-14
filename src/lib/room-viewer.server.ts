import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { keepOriginalSession, repeatsSessions, sessionOfWebinar, type ViewerState, type WebinarSchedule } from "@/lib/room-return";

/**
 * Quem regressa à sala, com dados que já existem (sem migração): a sessão de cada pessoa
 * (participants.webinar_session_id), até onde viu e se comprou. Ver room-return.
 */

export type RegisteredRow = { id: string; contact_id: string | null; webinar_session_id: string | null };

/**
 * A inscrição anterior desta pessoa neste webinar (pelo e-mail ou, sem ele, pelo WhatsApp) cuja
 * sessão uma nova inscrição reaproveita (`keepOriginalSession`); null para abrir a sessão actual.
 */
export async function originalRegistration(
  webinar: WebinarSchedule & { id: string },
  person: { email: string | null; phone: string | null },
): Promise<RegisteredRow | null> {
  if (!person.email && !person.phone) return null;
  let query = supabaseAdmin
    .from("participants")
    .select("id, contact_id, webinar_session_id, watched_seconds")
    .eq("webinar_id", webinar.id)
    .order("joined_at", { ascending: false })
    .limit(20);
  query = person.email
    ? query.ilike("email", person.email.replace(/[\\%_]/g, (c) => `\\${c}`))
    : query.eq("phone", person.phone!);
  const { data } = await query;
  const rows = Array.isArray(data) ? data : [];
  const latest = rows[0];
  if (!latest) return null;
  // Sem sessão (sempre disponível, replay): a inscrição que já existe.
  if (!latest.webinar_session_id) return { id: latest.id, contact_id: latest.contact_id, webinar_session_id: null };
  const { data: session } = await supabaseAdmin
    .from("webinar_sessions")
    .select("starts_at, ends_at, ended_at")
    .eq("id", latest.webinar_session_id)
    .maybeSingle();
  // Uma data remarcada deixa a sessão antiga sem efeito: a inscrição nova vai para a sessão actual.
  if (session && !sessionOfWebinar(Date.parse(session.starts_at), webinar)) return null;
  const end = session?.ended_at ?? session?.ends_at ?? null;
  const watched = rows.some((r) => r.webinar_session_id === latest.webinar_session_id && (r.watched_seconds ?? 0) > 0);
  if (!keepOriginalSession(end ? Date.parse(end) : null, watched, Date.now(), repeatsSessions(webinar))) return null;
  return { id: latest.id, contact_id: latest.contact_id, webinar_session_id: latest.webinar_session_id };
}

/** A sessão desta participação, até onde viu e se a pessoa já comprou; null se não existir. */
export async function loadViewerState(participantId: string): Promise<ViewerState | null> {
  const { data: participant } = await supabaseAdmin
    .from("participants")
    .select("webinar_session_id, watched_seconds")
    .eq("id", participantId)
    .maybeSingle();
  if (!participant) return null;
  const [session, facts] = await Promise.all([
    participant.webinar_session_id
      ? supabaseAdmin.from("webinar_sessions").select("starts_at, ends_at, ended_at").eq("id", participant.webinar_session_id).maybeSingle()
      : null,
    supabaseAdmin.from("participant_facts").select("purchased").eq("participant_id", participantId).maybeSingle(),
  ]);
  const s = session?.data;
  return {
    session: s ? { startsAt: s.starts_at, endsAt: s.ended_at ?? s.ends_at } : null,
    watchedSeconds: participant.watched_seconds ?? 0,
    // Uma leitura falhada das compras não fecha a sala a ninguém: conta como «ainda não comprou».
    bought: Boolean(facts.data?.purchased),
  };
}

/**
 * Quem volta a um webinar que repete depois de a sua sessão ter acabado passa para a sessão actual ou
 * a próxima (a mesma que uma inscrição nova abriria), para a sala lhe mostrar a live seguinte e o tempo
 * visto contar nessa sessão. Devolve o estado já com a sessão nova; null quando nada muda (sessão a
 * decorrer, webinar de data única, comprou, sem sessão, ou nenhuma sessão por abrir).
 */
export async function moveToNextSession(participantId: string, state: ViewerState): Promise<ViewerState | null> {
  if (!state.session || state.bought) return null;
  // Uma falha aqui nunca fecha a sala: fica o estado que já havia.
  try {
    return await moveIfEnded(participantId, state);
  } catch {
    return null;
  }
}

async function moveIfEnded(participantId: string, state: ViewerState): Promise<ViewerState | null> {
  if (!state.session) return null;
  const endMs = state.session.endsAt ? Date.parse(state.session.endsAt) : Number.NaN;
  const { data: participant } = await supabaseAdmin
    .from("participants")
    .select("webinar_id")
    .eq("id", participantId)
    .maybeSingle();
  if (!participant?.webinar_id) return null;
  const { loadRegistrationWebinar, openRegistrationSession } = await import("@/lib/registration.server");
  const webinar = await loadRegistrationWebinar(participant.webinar_id);
  if (!webinar || !repeatsSessions(webinar)) return null;
  const duration = webinar.video_sources?.duration_seconds || webinar.duration_seconds || 0;
  const ended = Number.isFinite(endMs)
    ? endMs <= Date.now()
    : duration > 0 && Date.parse(state.session.startsAt) + duration * 1000 <= Date.now();
  if (!ended) return null;
  const sessionId = await openRegistrationSession(webinar, "live");
  if (!sessionId) return null;
  const { data: session } = await supabaseAdmin
    .from("webinar_sessions")
    .select("starts_at, ends_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.starts_at === state.session.startsAt) return null;
  const { error } = await supabaseAdmin
    .from("participants")
    .update({ webinar_session_id: sessionId })
    .eq("id", participantId);
  if (error) return null;
  return { ...state, session: { startsAt: session.starts_at, endsAt: session.ended_at ?? session.ends_at } };
}
