import { useEffect, useRef, useState } from "react";
import {
  Check,
  CirclePlay,
  Clock,
  Eye,
  EyeOff,
  Film,
  Gauge,
  ImageIcon,
  Loader2,
  Moon,
  Palette,
  Play,
  Plus,
  Timer,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import {
  PaneHeader,
  PanelDialog,
  PanelNavButton,
  PanelNavGroup,
  PanelTitle,
} from "@/components/panel-modal";
import { VideoThumb } from "@/components/video-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NETWORK_ICONS } from "@/components/room/live-parts";
import { CountdownThumb } from "@/components/prelive-countdown";
import { TimerThumb } from "@/components/room/lesson-timer";
import { peekCountdown, useCountdownPeek } from "./room-preview";
import { cn } from "@/lib/utils";
import {
  clock,
  COUNTDOWN_MINUTES,
  COUNTDOWN_OFF,
  COUNTDOWN_STYLES,
  entryPalette,
  FOLLOW_NETWORKS,
  OFFER_COLOR_SUGGESTIONS,
  suggestFollowMoments,
  TIMER_MODELS,
  TIMER_OFF,
  type FollowMoment,
  type EntryLook,
  type RoomCountdown,
  type RoomTimer,
  type FollowNetwork,
  type LiveSettings,
} from "@/lib/room-logic";
import type { Appearance } from "@/components/room/room-parts";
import { Note, Section, SwitchRow, Swatches, TimeWindow } from "./ui";
import { LibraryGrid, type EditorClock, type VideoSourceLite } from "./steps/video";

/**
 * Depois de escolher o formato, a sala personaliza-se igual nos dois (Webinar e Live): a aparência,
 * a cor do botão, as redes e os momentos do + Seguir. Fica em `chat_settings.live`; o aviso do
 * Suporte está na etapa Chat, porque aparece no chat.
 */
export function RoomOptions({
  live,
  onLive,
  appearance,
  onAppearance,
  clock: c,
  transcript,
  library,
  providerLabel,
  backgroundUpload,
}: {
  live: LiveSettings;
  onLive: (patch: Partial<LiveSettings>) => void;
  appearance: Appearance;
  onAppearance: (appearance: Appearance) => void;
  clock: EditorClock;
  transcript: readonly { at: number; text: string }[];
  /** A Biblioteca, para o vídeo de fundo da contagem. */
  library: readonly VideoSourceLite[];
  providerLabel: (provider: string) => string;
  /** A imagem de fundo da contagem. */
  backgroundUpload: { uploading: boolean; onFile: (file: File) => void };
}) {
  const hasLink = FOLLOW_NETWORKS.some((n) => live.links[n.id]);
  const taken = (m: FollowMoment) => live.moments.some((x) => m.start < x.end && x.start < m.end);
  const suggestions = suggestFollowMoments(transcript).filter((m) => !taken(m));
  const addMoment = (m: FollowMoment) =>
    onLive({ moments: [...live.moments, m].sort((a, b) => a.start - b.start) });
  const here = Math.round(c.t);
  // As redes à vista: as que já têm link (ou acabaram de ser acrescentadas); sem nenhuma, o Instagram.
  const added = FOLLOW_NETWORKS.filter((n) => n.id in live.links).map((n) => n.id);
  const rows: readonly FollowNetwork[] = added.length ? added : ["instagram"];
  const missing = FOLLOW_NETWORKS.filter((n) => !rows.includes(n.id));
  // A contagem: ao mexer no estilo, na cor ou nos minutos, a pré-visualização mostra-a no lugar do vídeo.
  const countdown = live.countdown ?? COUNTDOWN_OFF;
  const peek = useCountdownPeek();
  const setCountdown = (patch: Partial<RoomCountdown>, show = true) => {
    const next = { ...countdown, ...patch };
    onLive({ countdown: next });
    peekCountdown(next.on && show);
  };
  useEffect(() => () => peekCountdown(false), []);
  // O temporizador: ao mexer, a pré-visualização vai para dentro dos minutos escolhidos, para se ver.
  const timer = live.timer ?? TIMER_OFF;
  const setTimer = (patch: Partial<RoomTimer>) => {
    const next = { ...timer, ...patch };
    onLive({ timer: next });
    if (next.on && (c.t < next.start || c.t > next.end))
      c.seek(Math.round((next.start + next.end) / 2));
  };
  return (
    <>
      <Section icon={Moon} title="Aparência" help="aparencia">
        <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Aparência da sala">
          {(
            [
              ["system", "Automático"],
              ["light", "Claro"],
              ["dark", "Escuro"],
            ] as const
          ).map(([value, label]) => {
            const on = appearance === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onAppearance(value)}
                className="group grid gap-2 text-left"
              >
                <span
                  className={cn(
                    "relative block overflow-hidden rounded-xl ring-1 ring-black/10 transition",
                    on ? "ring-2 ring-foreground ring-offset-2" : "group-hover:ring-black/25",
                  )}
                >
                  <ThemeThumb theme={value} />
                  {on ? (
                    <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-[13px]",
                    on ? "font-semibold" : "font-medium text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          «Automático» segue o telemóvel ou o computador de quem vê. Cada pessoa pode trocar no ⚙ do
          vídeo.
        </p>
      </Section>

      <Section icon={CirclePlay} title="Botão de entrar" help="botaoEntrar">
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Botão de entrar">
          {(
            [
              ["pulse", "Só o botão"],
              ["info", "Botão com informação"],
            ] as const
          ).map(([value, label]) => {
            const on = live.entry === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onLive({ entry: value })}
                className="group grid gap-2 text-left"
              >
                <span
                  className={cn(
                    "relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-[linear-gradient(160deg,#2a2f38,#121417)] ring-1 ring-black/10 transition",
                    on ? "ring-2 ring-foreground ring-offset-2" : "group-hover:ring-black/25",
                  )}
                >
                  <EntryThumb look={value} color={live.offerColor} />
                  {on ? (
                    <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-[13px]",
                    on ? "font-semibold" : "font-medium text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section icon={Palette} title="Cor do botão" help="corBotao">
        <Swatches
          label="Botão de entrar e oferta"
          value={live.offerColor}
          onChange={(offerColor) => onLive({ offerColor })}
          options={OFFER_COLOR_SUGGESTIONS}
        />
        <p className="text-[12.5px] text-muted-foreground">
          O botão de entrar e, por omissão, a oferta usam esta cor; o texto ajusta-se sozinho. «Ao
          vivo» fica sempre vermelho.
        </p>
      </Section>

      <Section icon={Timer} title="Contagem antes de começar" help="contagem">
        <div className="rounded-xl border bg-white p-3">
          <SwitchRow
            title="Mostrar a contagem"
            description="A sala abre antes da hora, com o chat aberto e o relógio no lugar do vídeo."
            checked={countdown.on}
            onChange={(on) => setCountdown({ on })}
          />
        </div>
        {countdown.on ? (
          <>
            <div
              className="grid grid-cols-2 gap-2.5"
              role="radiogroup"
              aria-label="Estilo da contagem"
            >
              {COUNTDOWN_STYLES.map(({ id, name }) => {
                const on = countdown.style === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setCountdown({ style: id })}
                    className="group grid gap-2 text-left"
                  >
                    <span
                      className={cn(
                        "relative block overflow-hidden rounded-xl ring-1 ring-black/10 transition",
                        on ? "ring-2 ring-foreground ring-offset-2" : "group-hover:ring-black/25",
                      )}
                    >
                      <CountdownThumb style={id} color={countdown.color} />
                      {on ? (
                        <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "text-[13px]",
                        on ? "font-semibold" : "font-medium text-muted-foreground",
                      )}
                    >
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
            <Swatches
              label="Cor da contagem"
              value={countdown.color}
              onChange={(color) => setCountdown({ color })}
              options={OFFER_COLOR_SUGGESTIONS}
            />
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium">A sala abre antes da hora</span>
              <div
                className="grid grid-cols-5 gap-1.5"
                role="radiogroup"
                aria-label="Minutos antes da hora"
              >
                {COUNTDOWN_MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={countdown.minutes === m}
                    onClick={() => setCountdown({ minutes: m })}
                    className={cn(
                      "h-10 min-w-0 whitespace-nowrap rounded-lg px-1 text-[13.5px] font-semibold tabular-nums transition",
                      countdown.minutes === m
                        ? "bg-foreground text-background"
                        : "bg-chip hover:bg-[var(--ds-gray-alpha-300)]",
                    )}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            <CountdownBackgroundPicker
              countdown={countdown}
              onChange={(background) => setCountdown({ background })}
              library={library}
              providerLabel={providerLabel}
              upload={backgroundUpload}
            />
            <div className="rounded-xl border bg-white p-3">
              <SwitchRow
                title="Música de fundo"
                checked={countdown.sound}
                onChange={(sound) => setCountdown({ sound }, false)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => peekCountdown(!peek)}
            >
              {peek ? <EyeOff /> : <Eye />}
              {peek ? "Voltar ao vídeo" : "Ver na sala"}
            </Button>
          </>
        ) : null}
      </Section>

      <Section icon={Gauge} title="Temporizador" help="temporizador">
        <div className="rounded-xl border bg-white p-3">
          <SwitchRow
            title="Mostrar o temporizador"
            description="A % da aula por cima do vídeo, nos minutos em que apresenta."
            checked={timer.on}
            onChange={(on) =>
              setTimer(
                on && !(timer.end > timer.start)
                  ? { on, start: 0, end: Math.max(60, Math.round(c.duration)) }
                  : { on },
              )
            }
          />
        </div>
        {timer.on ? (
          <>
            <TimeWindow
              labels={["De", "A"]}
              start={timer.start}
              end={timer.end}
              max={Math.max(1, c.duration)}
              onStart={(start) => setTimer({ start, end: Math.max(timer.end, start + 60) })}
              onEnd={(end) => setTimer({ end: Math.max(timer.start + 60, end) })}
            />
            <div
              className="grid grid-cols-2 gap-2.5"
              role="radiogroup"
              aria-label="Modelo do temporizador"
            >
              {TIMER_MODELS.map(({ id, name }) => {
                const on = timer.model === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTimer({ model: id })}
                    className="group grid gap-2 text-left"
                  >
                    <span
                      className={cn(
                        "relative block overflow-hidden rounded-xl ring-1 ring-black/10 transition",
                        on ? "ring-2 ring-foreground ring-offset-2" : "group-hover:ring-black/25",
                      )}
                    >
                      <TimerThumb model={id} color={timer.color ?? live.offerColor} />
                      {on ? (
                        <span className="absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "text-[13px]",
                        on ? "font-semibold" : "font-medium text-muted-foreground",
                      )}
                    >
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
            <Swatches
              label="Cor do temporizador"
              value={timer.color ?? live.offerColor}
              onChange={(color) => setTimer({ color })}
              options={OFFER_COLOR_SUGGESTIONS}
            />
          </>
        ) : null}
      </Section>

      <Section icon={UserPlus} title="Botão Seguir" help="seguir">
        <div className="grid gap-2">
          {rows.map((id) => {
            const n = FOLLOW_NETWORKS.find((x) => x.id === id)!;
            return (
              <div key={id} className="flex items-center gap-2">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-chip [&_svg]:size-[18px]"
                  title={n.name}
                >
                  {NETWORK_ICONS[id]}
                </span>
                <Input
                  inputMode="url"
                  autoComplete="off"
                  aria-label={n.name}
                  placeholder={n.example}
                  value={live.links[id] ?? ""}
                  onChange={(e) => onLive({ links: { ...live.links, [id]: e.target.value } })}
                  className="min-w-0 flex-1"
                />
                {rows.length > 1 || live.links[id] ? (
                  <button
                    type="button"
                    aria-label={`Tirar ${n.name}`}
                    onClick={() => {
                      const { [id]: _gone, ...rest } = live.links;
                      onLive({ links: rest });
                    }}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-chip hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {missing.length ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="justify-self-start">
                <Plus />
                Adicionar rede
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[200px] p-1">
              {missing.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onLive({ links: { ...live.links, [n.id]: "" } })}
                  className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium hover:bg-chip [&_svg]:size-4"
                >
                  {NETWORK_ICONS[n.id]}
                  {n.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
        <p className="text-[12.5px] leading-snug text-muted-foreground">
          Quem toca em + Seguir, na foto ou no nome vê estas redes. No telemóvel cada uma abre na
          app; no computador, numa janela pequena ao lado da sala.
        </p>
      </Section>

      <Section icon={Clock} title="Quando aparece o + Seguir" help="seguirMomentos">
        <p className="text-[12.5px] leading-snug text-muted-foreground">
          Em cada momento, o botão aparece num minuto e sai noutro. Nunca aparece durante a oferta.
        </p>
        {live.moments.length ? (
          <ol className="grid gap-2">
            {live.moments.map((m, i) => {
              const patch = (next: FollowMoment) =>
                onLive({
                  moments: live.moments
                    .map((x, j) => (j === i ? next : x))
                    .sort((a, b) => a.start - b.start),
                });
              return (
                <li key={`${m.start}-${i}`} className="grid gap-2 rounded-xl border bg-white p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#0072F5] font-mono text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <b className="text-[13px] font-semibold">Momento {i + 1}</b>
                    <span className="text-[12px] text-muted-foreground">
                      · {m.end - m.start} s à vista
                    </span>
                    <button
                      type="button"
                      aria-label={`Tirar o momento ${i + 1}`}
                      onClick={() => onLive({ moments: live.moments.filter((_, j) => j !== i) })}
                      className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-chip hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <TimeWindow
                    labels={["Aparece aos", "Sai aos"]}
                    start={m.start}
                    end={m.end}
                    max={Math.max(1, c.duration)}
                    onStart={(start) => {
                      // Mudar o início leva o fim com ele, mantendo o tempo à vista.
                      patch({
                        start,
                        end: Math.min(Math.max(c.duration, start + 5), start + (m.end - m.start)),
                      });
                      c.seek(Math.max(0, start - 2));
                    }}
                    onEnd={(end) => patch({ start: m.start, end: Math.max(m.start + 5, end) })}
                  />
                </li>
              );
            })}
          </ol>
        ) : (
          <Note icon={Clock}>Ainda sem momentos: o + Seguir não aparece sozinho.</Note>
        )}
        <button
          type="button"
          disabled={taken({ start: here, end: here + 30 })}
          onClick={() => addMoment({ start: here, end: here + 30 })}
          className="flex items-center gap-2.5 rounded-xl border border-dashed bg-white px-3 py-2.5 text-left text-[13.5px] font-medium transition hover:border-foreground/40 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background">
            <Plus className="size-3.5" />
          </span>
          <span className="min-w-0">
            Adicionar momento aos <span className="font-mono">{clock(here)}</span>
            <span className="block text-[12px] font-normal text-muted-foreground">
              Leve o vídeo ao minuto em que pede para seguir.
            </span>
          </span>
        </button>
        {suggestions.length ? (
          <div className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-muted-foreground">
              Sugeridos pela transcrição (quando diz «sigam»):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((m) => (
                <button
                  key={m.start}
                  type="button"
                  onClick={() => addMoment(m)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-chip px-2.5 font-mono text-[13px] tabular-nums transition hover:bg-[#E0F0FF] hover:text-[#0068D6]"
                >
                  <Plus className="size-3.5" />
                  {clock(m.start)} → {clock(m.end)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-xl border bg-white p-3">
          <SwitchRow
            title="Quem já segue deixa de ver"
            description={
              live.hideFollowed
                ? "Quem tocou numa rede não volta a ver o + Seguir nos momentos seguintes."
                : "O + Seguir aparece em todos os momentos, mesmo a quem já segue."
            }
            checked={live.hideFollowed}
            onChange={(hideFollowed) => onLive({ hideFollowed })}
          />
        </div>
        {!hasLink && live.moments.length ? (
          <p className="text-[12.5px] text-warning">
            Ponha pelo menos um link em Botão Seguir, senão o botão não aparece.
          </p>
        ) : null}
      </Section>
    </>
  );
}

/** O botão de entrar em miniatura, ao centro de um vídeo: a pulsar, ou com a linha de informação. */
export function EntryThumb({ look, color = "#E8440C" }: { look: EntryLook; color?: string }) {
  const dot = (size: string) => (
    <span
      className={cn("relative grid shrink-0 place-items-center rounded-full", size)}
      style={{ background: color, color: entryPalette(null, color).buttonText }}
    >
      <span
        className="absolute inset-0 animate-ping rounded-full opacity-50 motion-reduce:animate-none"
        style={{ background: color }}
      />
      <Play className="relative size-[45%] translate-x-[0.5px] fill-current" />
    </span>
  );
  if (look === "pulse") return dot("size-8");
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/60 py-1 pl-1 pr-2.5 text-white ring-1 ring-white/15">
      {dot("size-5")}
      <span className="leading-none">
        <small className="block text-[6.5px] font-bold uppercase tracking-[0.14em] text-white/70">
          Aula ao vivo
        </small>
        <b className="mt-0.5 block text-[9px] font-semibold">Assistir agora</b>
      </span>
    </span>
  );
}

/** A sala em miniatura no tema: o vídeo à esquerda e o painel à direita; «Automático» mostra os dois. */
function ThemeThumb({ theme }: { theme: Appearance }) {
  const half = (dark: boolean) => (
    <span
      className={cn(
        "grid h-full grid-cols-[1fr_34%] gap-1 p-1.5",
        dark ? "bg-[#141414]" : "bg-white",
      )}
    >
      <span className="grid content-start gap-1">
        <span
          className={cn("block aspect-video rounded-[3px]", dark ? "bg-[#2E2E2E]" : "bg-[#E5E5E5]")}
        >
          <i className="m-1 block h-1.5 w-3.5 rounded-[2px] bg-[#E5243B]" />
        </span>
        <i
          className={cn("block h-1.5 w-4/5 rounded-full", dark ? "bg-[#3A3A3A]" : "bg-[#D4D4D4]")}
        />
      </span>
      <span
        className={cn(
          "grid content-end gap-1 rounded-[3px] p-1",
          dark ? "bg-[#1F1F1F]" : "bg-white ring-1 ring-[#E5E5E5]",
        )}
      >
        {[0.9, 0.7, 0.8].map((w, i) => (
          <i
            key={i}
            className={cn("block h-1 rounded-full", dark ? "bg-[#3A3A3A]" : "bg-[#E5E5E5]")}
            style={{ width: `${w * 100}%` }}
          />
        ))}
        <i
          className={cn(
            "mt-0.5 block h-2 rounded-full",
            dark ? "bg-[#2E2E2E]" : "bg-[#F2F2F2] ring-1 ring-[#E5E5E5]",
          )}
        />
      </span>
    </span>
  );
  if (theme !== "system")
    return <span className="block aspect-[16/10]">{half(theme === "dark")}</span>;
  return (
    <span className="relative block aspect-[16/10]">
      <span className="absolute inset-0">{half(true)}</span>
      <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
        {half(false)}
      </span>
    </span>
  );
}

/**
 * O fundo da contagem: a cor (o preto com o brilho da cor escolhida), uma imagem carregada ou um vídeo da
 * Biblioteca, sem som e em ciclo, por trás do relógio. Fica em `live.countdown.background`.
 */
function CountdownBackgroundPicker({
  countdown,
  onChange,
  library,
  providerLabel,
  upload,
}: {
  countdown: RoomCountdown;
  onChange: (background: RoomCountdown["background"]) => void;
  library: readonly VideoSourceLite[];
  providerLabel: (provider: string) => string;
  upload: { uploading: boolean; onFile: (file: File) => void };
}) {
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { background } = countdown;
  const chosen = background.video ? (library.find((v) => v.id === background.video) ?? null) : null;
  const kind: "cor" | "imagem" | "video" = background.image
    ? "imagem"
    : background.video
      ? "video"
      : "cor";
  const nav = <PanelNavButton icon={Film} label="Da Biblioteca" active onClick={() => {}} />;
  const options: readonly { id: typeof kind; name: string }[] = [
    { id: "cor", name: "Cor" },
    { id: "imagem", name: "Imagem" },
    { id: "video", name: "Vídeo" },
  ];
  return (
    <div className="grid gap-2.5 rounded-xl border bg-white p-3">
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) upload.onFile(picked);
          e.target.value = "";
        }}
      />
      <span className="text-[13px] font-medium">Fundo da contagem</span>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Fundo da contagem">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={kind === option.id}
            onClick={() => {
              if (option.id === "cor") onChange({ image: null, video: null });
              else if (option.id === "imagem") file.current?.click();
              else setPicking(true);
            }}
            className={cn(
              "h-10 rounded-lg px-1 text-[13.5px] font-semibold transition",
              kind === option.id
                ? "bg-foreground text-background"
                : "bg-chip hover:bg-[var(--ds-gray-alpha-300)]",
            )}
          >
            {option.name}
          </button>
        ))}
      </div>
      {kind === "imagem" && background.image ? (
        <div className="flex items-center gap-2.5">
          <img
            src={background.image}
            alt=""
            className="aspect-video w-[96px] shrink-0 rounded-md object-cover ring-1 ring-[var(--border-subtle)]"
          />
          <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted-foreground">
            Por trás do relógio, com um véu escuro para os números se lerem.
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={upload.uploading}
            onClick={() => file.current?.click()}
          >
            {upload.uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            Trocar
          </Button>
        </div>
      ) : kind === "video" ? (
        <div className="flex items-center gap-2.5">
          {chosen ? (
            <VideoThumb
              name={chosen.name}
              thumbnailUrl={chosen.thumbnail_url}
              sourceUrl={chosen.source_url}
              overlay={false}
              className="w-[60px] shrink-0 rounded-md"
            />
          ) : null}
          <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-muted-foreground">
            {chosen ? (
              <>
                <span className="block truncate font-medium text-foreground">{chosen.name}</span>
                Sem som e em ciclo, por trás do relógio.
              </>
            ) : (
              "O vídeo escolhido já não está na Biblioteca."
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
            Trocar
          </Button>
        </div>
      ) : upload.uploading ? (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />A carregar a imagem…
        </span>
      ) : (
        <span className="text-[12.5px] text-muted-foreground">
          <ImageIcon className="mr-1 inline size-3.5" />
          Uma imagem 16:9 ou um vídeo da Biblioteca substituem o fundo da cor.
        </span>
      )}
      {picking ? (
        <PanelDialog
          title="Vídeo de fundo da contagem"
          description="Um vídeo da Biblioteca por trás do relógio, sem som e em ciclo."
          onClose={() => setPicking(false)}
          sidebar={
            <>
              <PanelTitle>Vídeo de fundo</PanelTitle>
              <PanelNavGroup>{nav}</PanelNavGroup>
            </>
          }
          mobileNav={nav}
        >
          <PaneHeader
            title="Da Biblioteca"
            subtitle="Toca sem som e em ciclo por trás da contagem."
          />
          {library.length === 0 ? (
            <Note icon={Film}>A Biblioteca ainda está vazia. Carregue um vídeo acima.</Note>
          ) : (
            <LibraryGrid
              library={library}
              current={background.video}
              providerLabel={providerLabel}
              onPick={(video) => {
                onChange({ image: null, video });
                setPicking(false);
              }}
            />
          )}
        </PanelDialog>
      ) : null}
    </div>
  );
}
