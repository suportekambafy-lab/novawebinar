import { startDelaySeconds } from "@/lib/room-logic";
import { sessionWindow, type ScheduleInput } from "@/lib/schedule";

/**
 * O fim de uma sessão que começa em `startMs`, com as regras de hoje do webinar (as mesmas da inscrição):
 * a janela calculada nesse instante. undefined quando essa hora já não é uma sessão do webinar (horário
 * mudado): aí não se mexe.
 */
export function sessionEndFor(
  webinar: ScheduleInput & { chat_settings?: unknown; video_sources?: { duration_seconds?: number | null } | null },
  startMs: number,
): number | null | undefined {
  const window = sessionWindow(
    {
      ...webinar,
      duration_seconds: webinar.video_sources?.duration_seconds || webinar.duration_seconds || 0,
      start_delay_seconds: startDelaySeconds(webinar.chat_settings),
    },
    startMs,
  );
  if (window.startMs !== startMs) return undefined;
  return window.endMs;
}
