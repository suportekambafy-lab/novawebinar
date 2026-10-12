import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { WebinarRoom } from "@/components/webinar-room";
import { RoomSkeleton, getCachedRoomTheme, cacheRoomTheme } from "@/components/room-skeleton";
import {
  useAudienceConfiguration,
  useScheduledComments,
  useWebinar,
  useWorkspace,
} from "@/lib/data";
import { useSimulatedPurchases, useSocialProof } from "@/components/social-proof-editor";
import {
  liveSettings,
  offerDeadlinePassed,
  parseExtraOffers,
  roomCountdown,
  roomFormat,
} from "@/lib/room-logic";
import { preliveTitle } from "@/lib/prelive-templates";
import { programmedAppearance, useRoomAppearance } from "@/lib/room-theme";

/**
 * Vista interna da sala, usada pela equipa a partir do estúdio. Não cria
 * participantes: serve para conferir como a sessão corre antes de a partilhar.
 */
export function InternalWebinarRoom({
  webinarId,
  mode,
}: {
  webinarId: string;
  mode: "live" | "replay";
}) {
  const { data: workspace } = useWorkspace();
  const { data: webinar, isLoading } = useWebinar(webinarId);
  const { data: comments = [] } = useScheduledComments(webinarId);
  const { data: audience } = useAudienceConfiguration(webinarId);
  const { data: socialProof } = useSocialProof(webinarId);
  const { data: simulatedPurchases = [] } = useSimulatedPurchases(webinarId);
  const [notified, setNotified] = useState(false);
  // Pré-visualização do temporizador de arranque: como aqui não há sessão
  // agendada, arrancamos a contagem a partir do momento em que a página abre.
  const [previewOpenedAt] = useState(() => Date.now());

  const send = useCallback(async () => {
    if (!notified) {
      setNotified(true);
      toast.info(
        "Esta é a pré-visualização da equipa. As mensagens reais chegam pela sala pública.",
      );
    }
  }, [notified]);

  // O tema programado no editor (Automático segue o aparelho); o ⚙ experimenta sem guardar.
  const { appearance, theme, choose } = useRoomAppearance(
    webinar ? programmedAppearance(webinar) : "dark",
    null,
  );
  // Guardamos o tema para o esqueleto seguir o aspeto da sala.
  useEffect(() => {
    if (webinar) cacheRoomTheme(webinarId, theme);
  }, [webinar, theme, webinarId]);

  if (isLoading) return <RoomSkeleton theme={getCachedRoomTheme(webinarId)} />;

  if (!webinar)
    return (
      <main
        className={`${getCachedRoomTheme(webinarId) === "light" ? "room-light " : ""}room-ambient flex min-h-dvh items-center justify-center text-sm text-room-subtle`}
      >
        Este webinar não está disponível.
      </main>
    );

  const w = webinar as unknown as {
    prelive_enabled?: boolean | null;
    prelive_seconds?: number | null;
    prelive_sound?: boolean | null;
    prelive_message?: string | null;
    prelive_template?: string | null;
    prelive_appearance?: unknown;
  };
  const live = liveSettings((webinar as { chat_settings?: unknown }).chat_settings);
  // As ofertas como na sala pública: as seguintes, o último dia e o que acontece no zero do cronómetro.
  const timezone = webinar.timezone || "UTC";
  const offers = {
    extra: parseExtraOffers(webinar.extra_offers),
    closed: offerDeadlinePassed(webinar.offer_deadline, timezone, Date.now()),
    closeAtZero: webinar.offer_countdown_end === "close",
    utm: webinar.offer_utm,
    timezone,
  };
  const countdown = roomCountdown(live.countdown, w);
  // Ao vivo, as duas contagens seguidas a partir da abertura; no replay (sem hora), só a de depois de
  // começar, que a sala corre à entrada.
  const preliveSeconds =
    mode === "live" ? countdown.seconds + countdown.afterSeconds : countdown.afterSeconds;

  return (
    <WebinarRoom
      mode={mode}
      startsAt={
        mode === "live" && preliveSeconds > 0
          ? new Date(previewOpenedAt + preliveSeconds * 1000).toISOString()
          : null
      }
      syncWithStart={false}
      preliveSeconds={preliveSeconds}
      preliveSound={countdown.sound}
      preliveMessage={preliveTitle(w.prelive_message)}
      preliveTemplate={countdown.style}
      preliveAppearance={w.prelive_appearance}
      preliveColor={countdown.color}
      preliveAfterSeconds={countdown.afterSeconds}
      theme={theme}
      appearance={appearance}
      onAppearance={choose}
      format={roomFormat((webinar as { chat_settings?: unknown }).chat_settings)}
      live={live}
      offers={offers}
      viewerName={workspace?.fullName ?? "Equipa"}
      comments={comments}
      audienceMode={audience?.mode ?? "real"}
      curve={audience?.curve}
      socialProof={socialProof ?? null}
      purchases={simulatedPurchases}
      onSend={send}
      webinar={{
        id: webinar.id,
        public_title: webinar.public_title,
        description: webinar.description,
        host_name: (webinar as { host_name?: string | null }).host_name ?? "",
        host_role: (webinar as { host_role?: string | null }).host_role ?? "",
        host_avatar_url: (webinar as { host_avatar_url?: string | null }).host_avatar_url ?? "",
        chat_pin_title: (webinar as { chat_pin_title?: string | null }).chat_pin_title ?? "",
        chat_pin_message: (webinar as { chat_pin_message?: string | null }).chat_pin_message ?? "",
        offer_pin_title: (webinar as { offer_pin_title?: string | null }).offer_pin_title ?? "",
        offer_pin_message:
          (webinar as { offer_pin_message?: string | null }).offer_pin_message ?? "",
        cta_text: webinar.cta_text,
        cta_url: webinar.cta_url,
        cta_color: webinar.cta_color ?? "green",
        cta_price_original: webinar.cta_price_original,
        cta_price_now: webinar.cta_price_now,
        cta_image_url: (webinar as { cta_image_url?: string | null }).cta_image_url ?? null,
        cta_countdown_seconds:
          (webinar as { cta_countdown_seconds?: number | null }).cta_countdown_seconds ?? null,
        cta_start_seconds: webinar.cta_start_seconds,
        cta_end_seconds: webinar.cta_end_seconds,
        video_url: webinar.video_sources?.source_url ?? null,
        video_provider: webinar.video_sources?.provider ?? null,
        duration_seconds: webinar.video_sources?.duration_seconds ?? webinar.duration_seconds,
      }}
    />
  );
}
