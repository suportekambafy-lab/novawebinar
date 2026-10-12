import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { cn, isHttpUrl } from "@/lib/utils";
import { posterFromUrl } from "@/components/video-thumb";
import { levelCap } from "@/lib/room-data-saver";

type Props = {
  url: string | null;
  /** «cover» enche a moldura (corta o que sobra); «contain» mostra o vídeo inteiro, com preto à volta. */
  fit?: "cover" | "contain";
  provider?: string | null;
  controls: boolean;
  onTime: (seconds: number) => void;
  /** Chamado quando o vídeo chega ao fim. */
  onEnded?: () => void;
  /** Chamado quando a reprodução pausa (antes de qualquer retoma automática). */
  onPause?: () => void;
  /** Confirma que a reprodução começou de facto. */
  onPlaying?: () => void;
  /** O navegador não deixou tocar com som sem um toque (um leitor novo no iPhone): o vídeo segue mudo. */
  onSoundBlocked?: () => void;
  /** Dá ao ecrã da sala acesso ao leitor para autorizar o áudio no toque inicial. */
  mediaRef?: RefObject<HTMLVideoElement | null>;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  quiet?: boolean;
  loop?: boolean;
  /** Segundo em que o vídeo deve arrancar (sincronizar com a hora da sessão). */
  startAtSeconds?: number;
  /**
   * Segundo em que o vídeo deveria estar agora, segundo o relógio da sessão.
   * Quando definido, o leitor corrige desvios (sair e voltar ao separador,
   * bloquear o telemóvel, falhas de rede) apanhando o momento real.
   */
  liveTargetSeconds?: number | null;
  /** Desvio tolerado antes de corrigir, em segundos. */
  syncToleranceSeconds?: number;
  /** Tema visual do leitor. */
  theme?: "dark" | "light";
  /** Poupar dados: no HLS, no máximo 360p e pouco vídeo guardado à frente. */
  saveData?: boolean;
};

function embedUrl(url: string, provider?: string | null): string | null {
  const lower = url.toLowerCase();
  if (provider === "vimeo" || lower.includes("vimeo.com")) {
    const id = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    if (id) return `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&controls=0`;
    if (lower.includes("player.vimeo.com")) {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}autoplay=1&muted=1&controls=0`;
    }
  }
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    const id = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/)?.[1];
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&playsinline=1`;
  }
  if (provider === "bunny" || lower.includes("iframe.mediadelivery.net")) {
    if (lower.includes("iframe.mediadelivery.net")) {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}autoplay=true&muted=true&preload=true`;
    }
  }
  if (provider === "panda" || lower.includes("pandavideo")) {
    if (lower.includes("player") || lower.includes("embed")) {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}autoplay=true&muted=true`;
    }
  }
  if (lower.includes("/embed/") || lower.includes("player.")) return url;
  return null;
}

function browserVideoUrl(url: string, provider?: string | null): string {
  const isBunnyCdnFile = /\/\/[^/]*b-cdn\.net\/[0-9a-f-]+\/play_[^/]+\.mp4(?:\?.*)?$/i.test(url);
  if ((provider === "bunny" || provider === "hls") && isBunnyCdnFile) {
    return url.replace(/play_[^/]+\.mp4(?:\?.*)?$/i, "playlist.m3u8");
  }
  return url;
}

const frameClass = "aspect-video w-full rounded-md bg-foreground/90";

/**
 * A forma do vídeo (deitado ou ao alto), antes de o leitor abrir: um ficheiro lê-se pelos metadados;
 * o Vimeo pelo oEmbed (largura e altura). null enquanto não se sabe, ou quando a plataforma não diz
 * (YouTube, Bunny e Panda embebidos).
 * ponytail: Bunny e Panda só pela API com a chave da conta; ler na biblioteca e gravar, se for preciso.
 */
export function useVideoShape(url: string | null | undefined, provider?: string | null) {
  const [shape, setShape] = useState<"horizontal" | "vertical" | null>(null);
  useEffect(() => {
    // Sem endereço (a sala deixa de precisar da forma ao rodar), fica a forma já lida: nada a descarregar.
    if (!url || !isHttpUrl(url)) return;
    setShape(null);
    let stop = false;
    const done = (w?: unknown, h?: unknown) => {
      if (!stop && typeof w === "number" && typeof h === "number" && w > 0 && h > 0) setShape(w >= h ? "horizontal" : "vertical");
    };
    if (embedUrl(url, provider)) {
      if (/vimeo\.com/i.test(url)) {
        fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { width?: unknown; height?: unknown } | null) => done(j?.width, j?.height))
          .catch(() => undefined);
      }
      return () => {
        stop = true;
      };
    }
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    probe.onloadedmetadata = () => done(probe.videoWidth, probe.videoHeight);
    probe.src = browserVideoUrl(url, provider);
    return () => {
      stop = true;
      probe.onloadedmetadata = null;
      probe.removeAttribute("src");
    };
  }, [url, provider]);
  return shape;
}

export function VideoPlayer({
  url,
  provider,
  controls,
  onTime,
  onEnded,
  onPause,
  onPlaying,
  onSoundBlocked,
  mediaRef,
  className,
  autoPlay = true,
  muted = true,
  quiet = false,
  loop = false,
  startAtSeconds = 0,
  liveTargetSeconds = null,
  syncToleranceSeconds = 4,
  theme = "dark",
  fit = "cover",
  saveData = false,
}: Props) {
  const ownVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = mediaRef ?? ownVideoRef;
  const seekedRef = useRef(false);
  const targetRef = useRef<number | null>(liveTargetSeconds);
  const hlsRef = useRef<{
    startLoad: () => void;
    recoverMediaError: () => void;
    levels: { height?: number }[];
    autoLevelCapping: number;
    capLevelToPlayerSize: boolean;
    config: { maxBufferLength: number };
  } | null>(null);
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  const saveDataRef = useRef(saveData);
  saveDataRef.current = saveData;
  const recoveryRef = useRef(0);
  /** A última posição vista: um leitor refeito depois de uma falha retoma daqui. */
  const lastTimeRef = useRef(0);
  const [failed, setFailed] = useState(false);
  /** Conta os leitores refeitos depois de uma falha: cada um liga os efeitos ao elemento novo. */
  const [attempt, setAttempt] = useState(0);
  const [playbackVisible, setPlaybackVisible] = useState(controls);
  const valid = isHttpUrl(url);
  const embed = valid ? embedUrl(url, provider) : null;
  const playbackUrl = valid ? browserVideoUrl(url, provider) : "";
  const isHls = valid && !embed && playbackUrl.toLowerCase().includes(".m3u8");

  targetRef.current = liveTargetSeconds;
  const onSoundBlockedRef = useRef(onSoundBlocked);
  onSoundBlockedRef.current = onSoundBlocked;

  useEffect(() => {
    setFailed(false);
    setPlaybackVisible(controls);
    seekedRef.current = false;
    recoveryRef.current = 0;
  }, [controls, url]);

  // Na sala o som nunca pára: em vez do ecrã de erro definitivo, um leitor novo daí a 5 s, na última posição.
  useEffect(() => {
    if (!failed || controls) return;
    const timer = window.setTimeout(() => {
      recoveryRef.current = 0;
      seekedRef.current = false;
      setFailed(false);
      setAttempt((n) => n + 1);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [controls, failed]);

  // Corrige o desvio entre o relógio da sessão e o vídeo. Sem isto, quem sai e
  // volta (separador em segundo plano, telemóvel bloqueado, falha de rede) fica
  // com a imagem atrás do chat e da oferta — parece que o vídeo travou.
  useEffect(() => {
    const video = videoRef.current;
    // Parado à espera do toque (poupar dados), não se acerta o ponto: cada salto descarregava vídeo.
    if (!video || controls || !autoPlay) return;

    // Numa rede lenta, cada salto para o relógio deita fora o que já estava descarregado e volta a carregar:
    // a tolerância sobe, e nunca se salta enquanto o vídeo está a carregar.
    const tolerance = saveDataRef.current ? Math.max(syncToleranceSeconds, 15) : syncToleranceSeconds;
    const resync = (force = false) => {
      const target = targetRef.current;
      if (target == null || !Number.isFinite(target)) return;
      const duration = video.duration;
      const limit = Number.isFinite(duration) && duration > 0 ? duration - 0.5 : undefined;
      const wanted = limit !== undefined ? Math.min(target, limit) : target;
      if (wanted < 0) return;
      const drift = wanted - video.currentTime;
      if (!force && Math.abs(drift) < tolerance) return;
      if (video.readyState < (force ? HTMLMediaElement.HAVE_METADATA : HTMLMediaElement.HAVE_FUTURE_DATA)) return;
      video.currentTime = wanted;
    };

    const play = () => {
      if (autoPlay && video.paused && !video.ended && video.isConnected) void video.play().catch(() => undefined);
    };
    // Voltar ao separador ou desbloquear o telemóvel: acerta o ponto e, se o carregamento parou, retoma-o.
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      resync();
      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) hlsRef.current?.startLoad();
      play();
    };
    // Uma paragem a carregar é normal numa rede fraca: o hls.js continua sozinho. Reiniciar o carregamento
    // aqui deitava fora o pedaço a meio e, ao rodar o telemóvel, virava um ciclo sem som.
    const nudge = () => play();

    resync();
    const interval = window.setInterval(() => resync(), 2000);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    video.addEventListener("stalled", nudge);
    video.addEventListener("waiting", nudge);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      video.removeEventListener("stalled", nudge);
      video.removeEventListener("waiting", nudge);
    };
  }, [attempt, autoPlay, controls, syncToleranceSeconds, url]);


  // O iPhone só deixa arrancar sozinho um vídeo mudo e dentro da página: o React não escreve o atributo
  // `muted` (só a propriedade), por isso escreve-se aqui, com o `webkit-playsinline` dos iPhones antigos.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultMuted = muted;
    video.toggleAttribute("muted", muted);
    video.setAttribute("webkit-playsinline", "");
  }, [attempt, muted, url]);

  // O salto para o ponto de entrada, uma vez. A poupar dados e parado à espera do toque, fica para quando tocar:
  // saltar antes descarregava vídeo que ninguém via.
  const jumpToStart = (video: HTMLVideoElement) => {
    const wanted = targetRef.current ?? (lastTimeRef.current > 0 ? lastTimeRef.current : startAtSeconds);
    if (wanted > 0 && !seekedRef.current && Number.isFinite(video.duration)) {
      seekedRef.current = true;
      video.currentTime = Math.min(wanted, Math.max(0, video.duration - 1));
    }
  };

  // Mantém o leitor carregado e garante a reprodução assim que a sala o arma.
  // Durante a passagem ele arranca mudo atrás do preto, evitando bloqueios de autoplay.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!autoPlay) {
      video.pause();
      return;
    }

    let active = true;
    const ensurePlaying = async () => {
      // Um elemento já retirado da página não volta a tocar: ficava a soar invisível.
      if (!active || !video.isConnected || video.ended || !video.paused) return;
      video.muted = muted;
      try {
        await video.play();
      } catch (error) {
        // Se o navegador bloquear o arranque com áudio, começa mudo em vez de
        // deixar uma imagem parada, e avisa a sala para pedir o toque outra vez.
        if (!muted && (error as Error | null)?.name === "NotAllowedError") onSoundBlockedRef.current?.();
        video.muted = true;
        await video.play().catch(() => undefined);
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) jumpToStart(video);
    video.muted = muted;
    if (!muted) video.volume = 1;
    void ensurePlaying();
    const retry = window.setInterval(() => void ensurePlaying(), 350);
    video.addEventListener("canplay", ensurePlaying);
    video.addEventListener("pause", ensurePlaying);
    return () => {
      active = false;
      window.clearInterval(retry);
      video.removeEventListener("canplay", ensurePlaying);
      video.removeEventListener("pause", ensurePlaying);
    };
  }, [attempt, autoPlay, muted]);

  // Vigia: som a correr sem imagem (o descodificador de vídeo falhou em silêncio num aparelho fraco, ou o
  // navegador suspendeu os fotogramas). Com o tempo a andar e o vídeo sem largura, tenta recuperar uma vez por
  // leitor: no hls.js pela própria recuperação de media, no leitor nativo recarregando na mesma posição.
  useEffect(() => {
    if (controls) return;
    const video = videoRef.current;
    if (!video) return;
    let recovered = false;
    const check = () => {
      if (recovered || !video.isConnected || video.paused || video.ended) return;
      if (video.currentTime < 3 || video.videoWidth > 0) return;
      recovered = true;
      console.warn("[video] som sem imagem: a recuperar");
      if (hlsRef.current) {
        hlsRef.current.recoverMediaError();
        return;
      }
      const at = video.currentTime;
      video.load();
      const resume = () => {
        video.currentTime = at;
        if (autoPlayRef.current) void video.play().catch(() => undefined);
      };
      video.addEventListener("loadedmetadata", resume, { once: true });
    };
    const timer = window.setInterval(check, 3000);
    return () => window.clearInterval(timer);
  }, [attempt, controls]);


  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isHls || !valid) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playbackUrl;
      return;
    }
    let destroy: (() => void) | undefined;
    let cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      // O leitor já saiu antes de o hls.js chegar: não se liga a um elemento morto.
      if (cancelled) return;
      if (!Hls.isSupported()) {
        setFailed(true);
        return;
      }
      // A qualidade segue só a rede medida, com tecto fixo (720p; 360p a poupar dados). Ligá-la ao tamanho do
      // leitor trocava de qualidade a cada rotação do telemóvel, o que nos aparelhos fracos dava erro de
      // descodificação e deixava a sala sem som.
      const hls = new Hls({
        capLevelToPlayerSize: false,
        startLevel: -1,
        maxBufferLength: saveDataRef.current ? 10 : 30,
      });
      hlsRef.current = hls;
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Uma rendition só de áudio (alguns codificadores juntam-na) daria som sem imagem: fora, quando há vídeo.
        if (hls.levels.some((l) => l.videoCodec)) {
          for (let i = hls.levels.length - 1; i >= 0; i -= 1) if (!hls.levels[i]?.videoCodec) hls.removeLevel(i);
        }
        hls.autoLevelCapping = levelCap(hls.levels, saveDataRef.current ? 360 : 720);
        if (autoPlayRef.current && video.isConnected) void video.play().catch(() => undefined);
      });
      // Uma recuperação que voltou a tocar limpa o contador: só falhas seguidas contam para desistir.
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        recoveryRef.current = 0;
      });
      // Antes de desistir, tentamos recuperar: falhas de rede recarregam o
      // fluxo, falhas de imagem são reparadas pelo próprio motor. Só depois de
      // várias tentativas é que o participante vê uma mensagem de erro.
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (recoveryRef.current >= 6) {
          setFailed(true);
          return;
        }
        recoveryRef.current += 1;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        setFailed(true);
      });
      destroy = () => {
        hlsRef.current = null;
        hls.destroy();
      };
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
    // Sem `autoPlay`: o toque que liga o som não pode voltar a carregar o vídeo (o iPhone perdia o som).
  }, [attempt, isHls, playbackUrl, valid]);

  // Ao sair, o vídeo pára de vez. O navegador pausa um elemento retirado da página, mas o «nunca parar» de
  // cima voltava a dar play antes da limpeza: o som seguia atrás do «Terminou» e duplicava ao rodar o aparelho.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [attempt, videoRef]);



  const cls = cn(frameClass, className);

  const quietFallback = (
    <div className={cn(cls, "relative flex items-center justify-center overflow-hidden", theme === "light" ? "bg-room-surface" : "bg-black")}>
      <div className={cn("absolute inset-0", theme === "light" ? "bg-gradient-to-br from-room-text/[0.03] to-transparent" : "bg-gradient-to-br from-white/5 to-transparent")} />
      <div className={cn("relative flex size-16 items-center justify-center rounded-full shadow-lg ring-1 backdrop-blur-md", theme === "light" ? "bg-room-text/10 text-room-text ring-room-line" : "bg-white/10 text-white ring-white/20")}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M8 5v14l11-7L8 5z" />
        </svg>
      </div>
    </div>
  );

  if (!valid)
    return quiet ? (
      quietFallback
    ) : (
      <div
        className={cn(
          cls,
          "flex items-center justify-center px-6 text-center text-sm text-background/70",
        )}
      >
        O vídeo deste webinar não tem um endereço válido. Abra a Biblioteca e guarde o link do vídeo
        (começado por https://).
      </div>
    );

  if (embed)
    return (
      <iframe
        src={embed}
        title="Vídeo do webinar"
        className={cls}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
      />
    );

  // Na sala, enquanto o leitor novo não chega, fica o preto com o ícone: a mensagem técnica é só para o editor.
  if (failed)
    return quiet || !controls ? (
      quietFallback
    ) : (
      <div
        className={cn(
          cls,
          "flex items-center justify-center px-6 text-center text-sm text-background/70",
        )}
      >
        Não foi possível reproduzir este vídeo. Verifique o link na Biblioteca.
      </div>
    );

  const videoElement = (
    <video
      ref={videoRef}
      {...(isHls ? {} : { src: playbackUrl })}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      playsInline
      // Parado (pausado no editor), só os metadados; a poupar dados e à espera do toque, nada: por trás do botão
      // fica a capa (ou o escuro), e o vídeo só começa a descarregar quando a pessoa toca.
      preload={autoPlay ? "auto" : saveData ? "none" : "metadata"}
      disablePictureInPicture
      controlsList="nodownload noplaybackrate noremoteplayback"
      // Na sala, o próprio elemento de vídeo é a imagem (desenhá-lo numa tela falhava em alguns aparelhos: som sem
      // imagem). Os controlos nativos ficam escondidos por CSS (.nw-live-video) e o escudo de toque é de quem o monta.
      className={
        controls
          ? cn(cls, "object-cover")
          : cn("nw-live-video pointer-events-none absolute inset-0 size-full", fit === "contain" ? "object-contain" : "object-cover", !playbackVisible && "opacity-0")
      }
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        if (autoPlay || !saveData) jumpToStart(video);
        if (autoPlay) void video.play().catch(() => undefined);
      }}
      tabIndex={-1}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (controls) return;
        e.preventDefault();
        const video = e.currentTarget;
        if (video.paused) void video.play().catch(() => undefined);
      }}
      onPause={(e) => {
        onPause?.();
        if (controls || !autoPlay || e.currentTarget.ended || !e.currentTarget.isConnected) return;
        void e.currentTarget.play().catch(() => undefined);
      }}
      onError={(e) => {
        // Uma falha isolada do ficheiro (rede a oscilar, sessão retomada) não
        // deve terminar a transmissão: recarregamos antes de mostrar erro.
        if (recoveryRef.current >= 3) {
          setFailed(true);
          return;
        }
        recoveryRef.current += 1;
        // Com o hls.js ligado, é ele que recupera: um `load()` por cima partia a ligação e o erro tornava-se fatal
        // (rodar o telemóvel muda a qualidade e dispara isto nos aparelhos mais fracos).
        if (hlsRef.current) return;
        const video = e.currentTarget;
        window.setTimeout(() => {
          if (!video.isConnected) return;
          video.load();
          if (autoPlay) void video.play().catch(() => undefined);
        }, 800);
      }}

      onTimeUpdate={(e) => {
        lastTimeRef.current = e.currentTarget.currentTime;
        onTime(Math.floor(e.currentTarget.currentTime));
      }}
      onPlaying={() => {
        setPlaybackVisible(true);
        onPlaying?.();
      }}
      onLoadedData={() => setPlaybackVisible(true)}
      onEnded={() => onEnded?.()}
    />
  );

  if (controls) return videoElement;

  // Até ao primeiro fotograma (rede lenta, ou o iPhone em poupança de energia, que só arranca com um
  // toque), a capa do vídeo da plataforma fica no lugar, em vez de preto.
  const poster = playbackVisible ? null : posterFromUrl(url);
  return (
    <div className={cn(cls, "relative overflow-hidden", fit === "contain" || theme !== "light" ? "bg-black" : "bg-room-surface")}>
      {poster ? <img src={poster} alt="" aria-hidden className={cn("absolute inset-0 size-full", fit === "contain" ? "object-contain" : "object-cover")} /> : null}
      {videoElement}
    </div>
  );
}
