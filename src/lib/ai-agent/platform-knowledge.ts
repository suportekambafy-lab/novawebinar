import { startDelaySeconds } from "@/lib/room-logic";
import { lifecycleDetail, safeZone, webinarLifecycle, type ScheduleInput } from "@/lib/schedule";

/**
 * O que a plataforma já sabe do webinar, dito ao Agente em código (sem outra IA): o webinar,
 * o produto, a agenda e a página de inscrição. Muda-se no editor e o Agente acompanha.
 */

export type PlatformColumns = ScheduleInput & {
  status?: string | null;
  chat_settings?: unknown;
  video_sources?: { duration_seconds?: number | null } | null;
  slug: string | null;
  public_title: string | null;
  description: string | null;
  host_name: string | null;
  host_role: string | null;
  replay_enabled: boolean | null;
  registration_headline: string | null;
  registration_subtitle: string | null;
};

/** As colunas de `webinars` que `platformKnowledge` lê. */
export const PLATFORM_COLUMNS =
  "status, slug, public_title, description, host_name, host_role, duration_seconds, replay_enabled, registration_headline, registration_subtitle, schedule_mode, scheduled_at, session_end_time, recurrence_enabled, recurrence_pattern, recurrence_weekday, recurrence_start_time, recurrence_end_time, recurrence_days, recurrence_times, jit_interval_minutes, jit_skip_night, timezone, chat_settings, video_sources(duration_seconds)";

const clean = (value: string | null | undefined) => (value ?? "").trim();

export function platformKnowledge(
  webinar: PlatformColumns,
  { productName, appUrl, nowMs }: { productName: string; appUrl: string; nowMs: number },
) {
  const lines: { label: string; text: string }[] = [];
  const title = clean(webinar.public_title);
  const host = clean(webinar.host_name);
  const role = clean(webinar.host_role);
  // A duração real é a do vídeo (a do webinar fica para trás quando o vídeo muda).
  const videoSeconds = webinar.video_sources?.duration_seconds || webinar.duration_seconds || 0;
  const minutes = Math.round(videoSeconds / 60);
  const about = [
    // «Live», não «webinar»: o agente fala ao público com esta palavra.
    title ? `Live: «${title}».` : "",
    host ? `Apresentado por ${host}${role ? ` (${role})` : ""}.` : "",
    minutes > 0 ? `Dura cerca de ${minutes} min.` : "",
    clean(webinar.description) ? `Descrição: ${clean(webinar.description).slice(0, 400)}` : "",
  ].filter(Boolean);
  if (about.length) lines.push({ label: "Webinar", text: about.join(" ") });

  const product = productName.trim();
  if (product) lines.push({ label: "Produto", text: `Produto à venda: ${product}.` });

  const agenda = [
    // Com o vídeo e a contagem depois de começar, como a sala: senão dizia «Terminou» nos últimos minutos.
    lifecycleDetail(
      webinarLifecycle(
        { ...webinar, duration_seconds: videoSeconds, start_delay_seconds: startDelaySeconds(webinar.chat_settings) },
        nowMs,
      ),
      webinar.timezone,
    ),
    `Fuso horário: ${safeZone(webinar.timezone)}.`,
    webinar.replay_enabled ? "Há gravação para quem não puder ver à hora." : "",
  ].filter(Boolean);
  lines.push({ label: "Agenda", text: `Agenda: ${agenda.join(" ")}` });

  const headline = clean(webinar.registration_headline);
  const subtitle = clean(webinar.registration_subtitle);
  const page = [
    appUrl && webinar.slug ? `Link para se inscrever: ${appUrl.replace(/\/+$/, "")}/w/${webinar.slug}.` : "",
    headline && headline !== title ? `Título da página: «${headline}».` : "",
    subtitle ? `Subtítulo: ${subtitle}` : "",
  ].filter(Boolean);
  if (page.length) lines.push({ label: "Página de inscrição", text: `Página de inscrição. ${page.join(" ")}` });
  return lines;
}
