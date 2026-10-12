import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDataSaver } from "@/lib/room-data-saver";
import { VideoPlayer } from "@/components/video-player";

/** O fundo escolhido para a contagem: uma imagem ou um vídeo (já assinado), por trás do relógio. */
export type CountdownBackdrop = {
  image: string | null;
  video: { url: string; provider?: string | null | undefined } | null;
};
const NOOP = () => {};
import { entryPalette, offerColor } from "@/lib/room-logic";
import {
  countdownParts,
  normalizeAppearance,
  templateById,
  type PreliveAppearance,
  type PreliveTemplateId,
} from "@/lib/prelive-templates";
import trackOne from "@/assets/local/Event_Countdown.mp3";
import trackTwo from "@/assets/local/Countdown_to_Impact.mp3";
import trackThree from "@/assets/local/Countdown_to_Impact-2.mp3";
import trackFour from "@/assets/local/Countdown_Impact.mp3";

/** As quatro faixas tocam por ordem e recomeçam se a contagem for mais longa. */
const PLAYLIST = [trackOne, trackTwo, trackThree, trackFour];

/** Seis segundos inteiros de descida, terminando em silêncio antes da mudança de imagem. */
const FADE_TRIGGER_SECONDS = 6;
const FADE_DURATION_MS = 5600;

let audioUnlocked = false;

/**
 * Tem de ser chamada diretamente pelo clique da pessoa, senão o navegador
 * mantém o áudio bloqueado.
 */
export function unlockPreliveAudio() {
  audioUnlocked = true;
}

/** Sequência das faixas de evento, em ciclo, com fecho suave no fim da contagem. */
function useAmbientSound(active: boolean, remaining: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const indexRef = useRef(0);
  const fadingRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (typeof Audio === "undefined") return;
    if (!audioUnlocked) audioUnlocked = true;

    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = 0.9;
    audioRef.current = audio;
    fadingRef.current = false;

    const playCurrent = () => {
      const source = PLAYLIST[indexRef.current % PLAYLIST.length] ?? PLAYLIST[0];
      if (!source) return;
      audio.src = source;
      void audio.play().catch(() => {
        /* o navegador ainda não permite som */
      });
    };
    const next = () => {
      indexRef.current += 1;
      playCurrent();
    };
    audio.addEventListener("ended", next);
    playCurrent();

    // Alguns navegadores (sobretudo no telemóvel) pausam esta música quando
    // outro leitor toca. Se isso acontecer antes do fecho, retomamos sozinhos.
    const watchdog = window.setInterval(() => {
      const current = audioRef.current;
      if (!current || fadingRef.current) return;
      if (current.paused && current.src) {
        void current.play().catch(() => undefined);
      }
    }, 700);

    return () => {
      window.clearInterval(watchdog);
      audio.removeEventListener("ended", next);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [active]);

  // Fecho suave: a música desce aos poucos nos últimos segundos, até ao silêncio.
  const fadeStarted = active && remaining >= 0 && remaining <= FADE_TRIGGER_SECONDS;
  useEffect(() => {
    const audio = audioRef.current;
    if (!fadeStarted || !audio) return;
    if (fadingRef.current) return;
    fadingRef.current = true;

    const from = Math.max(audio.volume, 0.9);
    const startedAt = performance.now();
    let frame = 0;

    // Curva em duas fases: a descida é claramente audível desde o início, mas
    // conserva corpo; nos dois segundos finais fecha com força e sem corte.
    const fadeFrame = (now: number) => {
      const current = audioRef.current;
      if (!current) return;
      const ratio = Math.min(1, (now - startedAt) / FADE_DURATION_MS);
      const level = ratio < 0.6 ? 1 - 0.42 * (ratio / 0.6) : 0.58 * (1 - (ratio - 0.6) / 0.4) ** 2;
      current.volume = Math.max(0, Math.min(1, from * level));
      if (ratio >= 1) {
        current.volume = 0;
        current.pause();
        return;
      }
      frame = window.requestAnimationFrame(fadeFrame);
    };
    frame = window.requestAnimationFrame(fadeFrame);

    return () => window.cancelAnimationFrame(frame);
  }, [fadeStarted]);
}

function clock(total: number) {
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

type ViewProps = {
  remaining: number;
  total: number;
  message: string;
  appearance: PreliveAppearance;
};

/** O título: o escrito no editor antigo, ou a frase da sala; sem nenhum, só o selo do estilo. */
const titleOf = (message: string, appearance: PreliveAppearance) =>
  appearance.title.trim() || message.trim();

/** O título e a frase por baixo; as letras medem o próprio relógio (cqmin), não o ecrã. */
function Texts({ message, appearance }: { message: string; appearance: PreliveAppearance }) {
  const title = titleOf(message, appearance);
  if (!title && !appearance.subtitle) return null;
  return (
    <div className="cd-texts grid max-w-[min(90cqw,34rem)] justify-items-center gap-1 text-center">
      {title ? (
        <p className="line-clamp-2 text-[length:clamp(13px,4.4cqmin,21px)] font-semibold leading-snug">
          {title}
        </p>
      ) : null}
      {appearance.subtitle ? (
        <p className="line-clamp-2 text-[length:clamp(11.5px,3.4cqmin,15px)] leading-snug opacity-70">
          {appearance.subtitle}
        </p>
      ) : null}
    </div>
  );
}

/**
 * O fundo da contagem: preto com um brilho da cor escolhida. Ocupa o lugar do vídeo (16:9) ou, no
 * Live, o palco inteiro (`fill`); ao alto, o relógio sobe para não ficar por baixo do chat.
 */
function Shell({
  children,
  color,
  fill,
  glow = true,
  backdrop,
}: {
  children: ReactNode;
  color: string;
  fill?: boolean | undefined;
  glow?: boolean;
  backdrop?: CountdownBackdrop | null | undefined;
}) {
  const saveData = useDataSaver();
  // A poupar dados, o vídeo de fundo não descarrega; fica a imagem (se houver) ou a cor.
  const video = backdrop?.video && !saveData ? backdrop.video : null;
  const image = backdrop?.image ?? null;
  const covered = Boolean(video || image);
  const vars = {
    "--primary": color,
    "--primary-foreground": entryPalette(null, color).buttonText,
    "--room-glow": `color-mix(in oklab, ${color} 18%, transparent)`,
    containerType: "size",
    // Num palco ao alto (Live no telemóvel) o chat ocupa o fundo: o relógio centra-se na parte de cima.
    paddingBottom: fill ? "max(0px, calc((100cqh - 100cqw) * 0.6))" : undefined,
  } as CSSProperties;
  return (
    <div
      className={cn(
        "prelive-dark relative flex flex-col items-center justify-center overflow-hidden bg-room-bg px-4 text-room-text",
        fill ? "size-full" : "aspect-video w-full",
        glow && !covered && "prelive-glow",
      )}
      style={vars}
    >
      {video ? (
        <div className="absolute inset-0" aria-hidden>
          <VideoPlayer
            url={video.url}
            provider={video.provider ?? null}
            controls={false}
            onTime={NOOP}
            loop
            muted
            quiet
            className="h-full aspect-auto rounded-none"
          />
        </div>
      ) : image ? (
        <img
          src={image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      ) : null}
      {/* Um véu escuro: o relógio lê-se por cima de qualquer imagem ou vídeo. */}
      {covered ? <div className="absolute inset-0 bg-black/45" aria-hidden /> : null}
      {/* Num vídeo baixo (o Webinar no telemóvel) as frases saem: fica o relógio e cabe o aviso do som. */}
      <style>{"@container (max-height:300px){.cd-texts{display:none}}"}</style>
      <div className="relative flex flex-col items-center">{children}</div>
    </div>
  );
}

/** Os números com o nome de cada unidade por baixo (min, seg). */
function Units({
  remaining,
  appearance,
  boxed,
}: {
  remaining: number;
  appearance: PreliveAppearance;
  boxed?: boolean;
}) {
  const parts = countdownParts(remaining, appearance);
  return (
    <div className="flex items-baseline gap-[2cqmin]">
      {parts.map((part, index) => (
        <div key={part.key} className="flex items-baseline gap-[2cqmin]">
          {index > 0 && !boxed ? (
            <span className="text-[length:13cqmin] font-black leading-none text-primary">:</span>
          ) : null}
          <div className="grid justify-items-center gap-[1.4cqmin]">
            <span
              className={cn(
                "font-black tabular-nums leading-none tracking-tight",
                boxed
                  ? "grid min-w-[19cqmin] place-items-center rounded-[2.4cqmin] bg-white/[0.07] px-[2.4cqmin] py-[2.6cqmin] text-[length:13cqmin] ring-1 ring-white/12 shadow-[inset_0_-3px_0_var(--primary)]"
                  : "text-[length:13cqmin]",
              )}
            >
              {part.value}
            </span>
            <span className="text-[length:clamp(9px,2.4cqmin,12px)] font-bold uppercase tracking-[0.22em] opacity-60">
              {part.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Cada estilo só muda a apresentação — os segundos chegam sempre de fora. */
function TemplateView({
  template,
  remaining,
  total,
  message,
  appearance,
  color,
  fill,
  backdrop,
}: ViewProps & {
  template: PreliveTemplateId;
  color: string;
  fill?: boolean | undefined;
  backdrop?: CountdownBackdrop | null | undefined;
}) {
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;
  const gap = "gap-[3.6cqmin]";
  // Pouco texto: o selo («A começar») só aparece quando não há título.
  const chip = !titleOf(message, appearance);

  if (template === "premium") {
    // Blocos: um cartão por unidade, com um traço da cor escolhida em baixo.
    return (
      <Shell color={color} fill={fill} backdrop={backdrop}>
        <div className={cn("flex flex-col items-center", gap)}>
          {chip ? (
            <span className="rounded-full bg-primary/15 px-3 py-1 text-[length:clamp(9.5px,2.6cqmin,12px)] font-bold uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--primary)_55%,white)] ring-1 ring-primary/35">
              A começar
            </span>
          ) : null}
          <Units remaining={remaining} appearance={appearance} boxed />
          <Texts message={message} appearance={appearance} />
        </div>
      </Shell>
    );
  }

  if (template === "dark") {
    // Grande: só os números, enormes, com os dois pontos na cor escolhida.
    const parts = countdownParts(remaining, appearance);
    return (
      <Shell color={color} fill={fill} glow={false} backdrop={backdrop}>
        <div className={cn("flex flex-col items-center", gap)}>
          <p className="flex items-baseline text-[length:min(26cqmin,170px)] font-black leading-none tabular-nums tracking-[-0.04em]">
            {parts.map((part, i) => (
              <span key={part.key} className="flex items-baseline">
                {i > 0 ? <span className="px-[1cqmin] text-primary">:</span> : null}
                {part.value}
              </span>
            ))}
          </p>
          <Texts message={message} appearance={appearance} />
        </div>
      </Shell>
    );
  }

  if (template === "urgency") {
    // Barra: o sinal vivo, a contagem e a barra que enche até à hora.
    return (
      <Shell color={color} fill={fill} backdrop={backdrop}>
        <div className={cn("flex w-full flex-col items-center", gap)}>
          {chip ? (
            <span className="flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-[length:clamp(9.5px,2.6cqmin,12px)] font-bold uppercase tracking-[0.2em] text-primary-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              Quase a começar
            </span>
          ) : null}
          <Units remaining={remaining} appearance={appearance} />
          <div className="h-[clamp(4px,1.2cqmin,8px)] w-[min(64cqw,420px)] overflow-hidden rounded-full bg-white/12">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <Texts message={message} appearance={appearance} />
        </div>
      </Shell>
    );
  }

  // Anel: o desenho original, com o anel de progresso e o relógio ao centro.
  const size = 240;
  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  const parts = countdownParts(remaining, appearance);
  return (
    <Shell color={color} fill={fill} backdrop={backdrop}>
      <div className={cn("relative flex flex-col items-center", gap)}>
        <div className="relative size-[min(52cqmin,260px)]">
          <span className="pointer-events-none absolute inset-[-8%] rounded-full border border-primary/30 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="relative size-full -rotate-90"
            aria-hidden
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="fill-none stroke-white/15"
              strokeWidth={8}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="fill-none stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1.2cqmin]">
            <Globe
              className="size-[min(5cqmin,30px)] text-primary/80 [animation:spin_14s_linear_infinite]"
              aria-hidden
            />
            <p className="text-[length:min(11cqmin,64px)] font-black leading-none tabular-nums text-white drop-shadow">
              {parts.length <= 2 ? clock(remaining) : parts.map((part) => part.value).join(":")}
            </p>
            <p className="text-[length:clamp(7px,2cqmin,11px)] font-bold uppercase tracking-[0.28em] text-white/60">
              para começar
            </p>
          </div>
        </div>
        <Texts message={message} appearance={appearance} />
      </div>
    </Shell>
  );
}

/**
 * Contagem de arranque da transmissão: fica no lugar do vídeo, com o relógio a
 * descer, enquanto o chat já está aberto ao lado. O estilo e a cor só mudam a
 * apresentação — os segundos continuam a vir da sala.
 */
export function PreliveCountdown({
  remaining,
  total,
  message,
  soundOn,
  soundEnabled,
  template,
  appearance,
  color,
  fill,
  background,
}: {
  remaining: number;
  total: number;
  message: string;
  soundOn: boolean;
  soundEnabled: boolean;
  template?: string | null | undefined;
  appearance?: unknown;
  /** A cor do anel, dos blocos e da barra; sem ela, o laranja da marca. */
  color?: string | null | undefined;
  /** No Live: ocupa o palco inteiro em vez de um 16:9. */
  fill?: boolean | undefined;
  /** A imagem ou o vídeo de fundo escolhidos no editor; sem nenhum, a cor. */
  background?: CountdownBackdrop | null | undefined;
}) {
  useAmbientSound(soundEnabled && soundOn, remaining);

  const resolved = templateById(template);
  const look = normalizeAppearance(resolved.id, appearance);

  return (
    <TemplateView
      template={resolved.id}
      remaining={remaining}
      total={total}
      message={message}
      appearance={look}
      color={offerColor(color)}
      fill={fill}
      backdrop={background}
    />
  );
}

/**
 * A contagem em miniatura (os cartões do editor): o mesmo desenho, sem som, desenhado a 320 px de largura
 * e encolhido até à largura do cartão, para as letras mínimas não rebentarem o desenho.
 */
export function CountdownThumb({ style, color }: { style: string; color: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(0.45);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setScale(node.clientWidth / 320 || 0.45);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <span
      ref={box}
      className="pointer-events-none relative block aspect-video w-full overflow-hidden"
    >
      <span
        className="absolute left-0 top-0 block w-[320px] origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        <TemplateView
          template={templateById(style).id}
          remaining={272}
          total={300}
          message=""
          appearance={normalizeAppearance(style, { subtitle: "" })}
          color={offerColor(color)}
        />
      </span>
    </span>
  );
}
