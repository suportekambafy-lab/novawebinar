/**
 * Quem está na sala agora, pelos batimentos que a sala grava na base (record_participant_progress,
 * de 30 em 30 s enquanto o vídeo corre). É a segunda fonte do «na sala agora», ao lado da presença em
 * tempo real (live-presence.ts): a presença é instantânea mas depende do serviço de presença do
 * Supabase, que já falhou a meio de uma sessão; os batimentos chegam com até 30 s de atraso mas
 * nunca se perdem. O número que se mostra é o maior dos dois, e é o mesmo em todo o painel.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LiveNow, LiveSession } from "./analytics-live";

/** Um batimento perdido não tira ninguém da sala: três batimentos de 30 s. */
export const HEARTBEAT_WINDOW_MS = 90_000;

export type HeartbeatRow = {
  person_id: string | null;
  webinar_id: string | null;
  webinar_title: string | null;
  viewing_mode: string | null;
  device: string | null;
  last_progress_at: string | null;
};

export type RoomCount = { total: number; live: number; replay: number; mobile: number; desktop: number };
export type RoomNow = {
  all: RoomCount;
  byWebinar: Map<string, RoomCount & { title: string }>;
};

const EMPTY: RoomCount = { total: 0, live: 0, replay: 0, mobile: 0, desktop: 0 };

/** Conta quem bateu há menos de `windowMs`: uma vez por pessoa e por webinar (a mesma pessoa em dois separadores conta uma). */
export function roomNowFrom(rows: HeartbeatRow[], nowMs: number, windowMs = HEARTBEAT_WINDOW_MS): RoomNow {
  const byWebinar = new Map<string, RoomCount & { title: string }>();
  const seen = new Set<string>();
  const all = { ...EMPTY };
  for (const row of rows) {
    if (!row.webinar_id || !row.last_progress_at) continue;
    const at = Date.parse(row.last_progress_at);
    if (!Number.isFinite(at) || at < nowMs - windowMs || at > nowMs + 60_000) continue;
    const key = `${row.webinar_id}:${row.person_id ?? row.last_progress_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = byWebinar.get(row.webinar_id) ?? { ...EMPTY, title: row.webinar_title ?? "Sessão" };
    for (const target of [bucket, all]) {
      target.total += 1;
      if (row.viewing_mode === "replay") target.replay += 1;
      else target.live += 1;
      if (row.device === "desktop") target.desktop += 1;
      else if (row.device) target.mobile += 1;
    }
    byWebinar.set(row.webinar_id, bucket);
  }
  return { all, byWebinar };
}

/** O número a mostrar: o maior entre a presença em tempo real e os batimentos (uma das fontes pode falhar; as duas não). */
export const nowCount = (presence: number, heartbeat: number) => Math.max(presence, heartbeat);

/** O «Agora» da Vista ao vivo: cada parcela é o maior das duas fontes; o resto (oferta, cliques, sítio) só a presença sabe. */
export function mergeLiveNow(presence: LiveNow, heartbeat: RoomCount): LiveNow {
  return {
    ...presence,
    total: nowCount(presence.total, heartbeat.total),
    live: nowCount(presence.live, heartbeat.live),
    replay: nowCount(presence.replay, heartbeat.replay),
    mobile: nowCount(presence.mobile, heartbeat.mobile),
    desktop: nowCount(presence.desktop, heartbeat.desktop),
  };
}

/** As sessões com gente: as da presença, com os números subidos pelos batimentos, mais as que só os batimentos conhecem. */
export function mergeSessions(sessions: LiveSession[], heartbeat: RoomNow): LiveSession[] {
  const out = new Map(sessions.map((s) => [s.webinarId, { ...s }]));
  for (const [webinarId, count] of heartbeat.byWebinar) {
    const current = out.get(webinarId) ?? { webinarId, title: count.title, count: 0, live: 0, replay: 0, clicked: 0 };
    out.set(webinarId, {
      ...current,
      count: nowCount(current.count, count.total),
      live: nowCount(current.live, count.live),
      replay: nowCount(current.replay, count.replay),
    });
  }
  return [...out.values()].sort((a, b) => b.count - a.count);
}

const NONE: RoomNow = { all: EMPTY, byWebinar: new Map() };

/** Os batimentos da organização nos últimos 90 s, lidos de 15 em 15 s. */
export function useRoomNow(organizationId: string | null | undefined): RoomNow {
  const query = useQuery({
    queryKey: ["room-now", organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const nowMs = Date.now();
      const { data, error } = await supabase
        .from("participant_facts")
        .select("person_id, webinar_id, webinar_title, viewing_mode, device, last_progress_at")
        .eq("organization_id", organizationId!)
        .gte("last_progress_at", new Date(nowMs - HEARTBEAT_WINDOW_MS).toISOString())
        .limit(5000);
      if (error) throw error;
      return roomNowFrom((data ?? []) as HeartbeatRow[], nowMs);
    },
  });
  return query.data ?? NONE;
}
