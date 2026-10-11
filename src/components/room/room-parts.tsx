import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Headset,
  Heart,
  Maximize2,
  MessageSquareOff,
  MessagesSquare,
  Minimize2,
  Monitor,
  MonitorPlay,
  Moon,
  Pin,
  Play,
  RotateCcwSquare,
  SendHorizontal,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Smile,
  Sun,
  Users,
  Volume1,
  Volume2,
  VolumeX,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { clock, discountPercent, liveVideoPlace, offerColorVars, type EntryLook, type LiveVideoPlace, type OfferColors, type OfferLook } from "@/lib/room-logic";

/**
 * Peças da sala que a sala pública e a pré-visualização do editor desenham iguais. As cores
 * vêm dos tokens da sala (room-*), por isso o tema escuro e o claro servem as duas.
 */

const ROOM_PARTS_CSS = `@keyframes cwRxUp{0%{opacity:0;transform:translate(0,0) scale(.6)}8%{opacity:1;transform:translate(0,-14px) scale(1)}28%{transform:translate(var(--sway),-62px)}50%{transform:translate(calc(var(--sway) * -1),-112px)}72%{opacity:.85;transform:translate(var(--sway),-160px)}100%{opacity:0;transform:translate(0,calc(-1 * var(--h,210px))) scale(.92)}}.cw-rx{animation:cwRxUp 2.4s linear forwards}@keyframes cwDot{50%{opacity:.35}}.cw-dot{animation:cwDot 1.4s ease-in-out infinite}@keyframes cwPop{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}.cw-pop{animation:cwPop .3s ease}@media (prefers-reduced-motion:reduce){.cw-rx{display:none}.cw-dot,.cw-pop{animation:none}}`;

export function RoomPartsStyle() {
  return <style>{ROOM_PARTS_CSS}</style>;
}

export type Reaction = { id: string | number; offset: number; size?: number };
import type { Appearance } from "@/lib/room-theme";
import { CAPTION_CHARS, CAPTION_LINE, captionAt, captionLines, type SpokenLine } from "@/lib/room-captions";
export type { Appearance };

/**
 * O selo de verificado, como o do YouTube: um círculo cinzento com o visto da cor do fundo.
 * Na sala escura o círculo é claro; na clara, escuro.
 */
export function VerifiedBadge({ className, check }: { className?: string | undefined; check?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Verificado"
      className={cn("shrink-0 text-[#AAAAAA] [.room-light_&]:text-[#606060]", className)}
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M7.4 12.3l3.1 3.1 6.1-6.4"
        fill="none"
        stroke={check ?? "var(--room-bg, #fff)"}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- Título e quem apresenta ---------- */

export function RoomTitle({
  kicker,
  title,
  host,
  compact,
  highlight,
  follow,
  onHost,
  foldable,
}: {
  kicker: string;
  title: string;
  host: { name: string; role: string; avatarUrl: string; verified: boolean };
  compact?: boolean | undefined;
  highlight?: string | null | undefined;
  /** O + Seguir, à direita de quem apresenta (só nos momentos escolhidos). */
  follow?: ReactNode;
  /** Tocar na foto ou no nome abre as redes de quem apresenta. */
  onHost?: (() => void) | undefined;
  /** Telemóvel: a seta recolhe o bloco numa só linha (o título com «…»); começa aberto. */
  foldable?: boolean | undefined;
}) {
  const [folded, setFolded] = useState(false);
  const hl = (key: string) =>
    highlight === key ? "outline outline-2 outline-offset-4 outline-[#E8440C] shadow-[0_0_0_10px_rgba(232,68,12,.25)]" : "";
  const initials = host.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const heading = title ? (
    <h1
      className={cn(
        "font-extrabold tracking-tight text-room-text",
        compact ? cn("text-[18px] leading-snug", folded ? "truncate" : "mb-2.5 line-clamp-2") : "mt-1.5 text-[32px] leading-tight",
        foldable && "min-w-0 flex-1",
        hl("title"),
      )}
    >
      {title}
    </h1>
  ) : null;
  return (
    // Recolhível: tocar na zona vazia do bloco também recolhe ou abre (o nome abre as redes; o + Seguir e a seta fazem o seu).
    <div
      className={compact ? cn("px-4 pt-4", folded ? "pb-3" : "pb-1") : "pt-5"}
      onClick={foldable ? (event) => !(event.target as HTMLElement).closest("button, a") && setFolded((f) => !f) : undefined}
    >
      {!compact ? (
        <p className="text-[14.5px] font-bold uppercase tracking-[0.2em] text-primary">{kicker}</p>
      ) : null}
      {heading && foldable ? (
        <div className={cn("flex gap-2", folded ? "items-center" : "items-start")}>
          {heading}
          {/* Recolhido, a linha de quem apresenta sai; o + Seguir (só nos momentos escolhidos) fica ao lado da seta. */}
          {folded ? follow : null}
          <button
            type="button"
            onClick={() => setFolded((f) => !f)}
            aria-expanded={!folded}
            aria-label={folded ? "Mostrar o título e quem apresenta" : "Recolher o título"}
            title={folded ? "Mostrar" : "Recolher"}
            className={cn("-mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-room-subtle transition hover:text-room-text", !folded && "-mt-0.5")}
          >
            {folded ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
          </button>
        </div>
      ) : heading ? (
        heading
      ) : (
        // Ainda sem título: um traço no lugar dele, para a sala se ir construindo com o que se preenche.
        <span aria-hidden className={cn("block w-3/5 rounded-md bg-room-raised", compact ? "mb-2.5 h-5" : "mt-2.5 h-8", hl("title"))} />
      )}
      {host.name && !folded ? (
        <div className={cn("flex items-center", compact ? "gap-2.5" : "mt-4 gap-3.5", hl("host"))}>
          {/* O + Seguir fica logo a seguir ao nome, como no Instagram e no YouTube, e não no outro lado do ecrã. */}
          <button type="button" onClick={onHost} disabled={!onHost} className="flex min-w-0 items-center gap-[inherit] text-left">
          {host.avatarUrl ? (
            <img
              src={host.avatarUrl}
              alt=""
              className={cn("shrink-0 rounded-full object-cover ring-1 ring-room-line", compact ? "size-10" : "size-12")}
            />
          ) : (
            <span
              className={cn(
                "grid shrink-0 place-items-center rounded-full bg-room-raised font-bold text-room-text ring-1 ring-room-line",
                compact ? "size-10 text-sm" : "size-12 text-base",
              )}
            >
              {initials || "?"}
            </span>
          )}
          <span className="min-w-0">
            <b className={cn("flex items-center gap-1.5 font-semibold text-room-text", compact ? "text-[15px]" : "text-[17px]")}>
              <span className="truncate">{host.name}</span>
              {host.verified ? <VerifiedBadge className={compact ? "size-[15px]" : "size-[17px]"} /> : null}
            </b>
            {host.role ? (
              <span className={cn("block truncate text-room-subtle", compact ? "text-[13px]" : "text-sm")}>{host.role}</span>
            ) : null}
          </span>
          </button>
          {follow}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Definições do vídeo, como no YouTube ---------- */

/** O menu do ⚙ em vidro, como no YouTube: transparente, mas legível por cima de qualquer vídeo. */
const GLASS = "rounded-xl bg-[rgba(20,20,20,.74)] p-1.5 text-white shadow-[0_12px_40px_rgba(0,0,0,.45)] ring-1 ring-white/10 backdrop-blur-xl backdrop-saturate-150";

/**
 * O botão ⚙ do vídeo: volume, legendas (ligar ou desligar), qualidade (sempre automática; poupar dados
 * liga-se sozinho numa rede lenta) e aparência. Sem velocidade nem avançar: a sessão parece sempre ao
 * vivo. `inline` (Live): só o ícone, sem fundo, e o menu abre para baixo dentro da própria sala, para
 * nunca sair do ecrã (nem da moldura do aparelho na pré-visualização).
 */
export function VideoSettings({
  volume,
  onVolume,
  captions,
  onCaptions,
  hasCaptions,
  appearance,
  onAppearance,
  compact,
  inline,
}: {
  volume: number;
  onVolume: (volume: number) => void;
  captions: boolean;
  onCaptions: (on: boolean) => void;
  hasCaptions: boolean;
  appearance: Appearance;
  onAppearance: (appearance: Appearance) => void;
  compact?: boolean | undefined;
  inline?: boolean | undefined;
}) {
  const [page, setPage] = useState<"main" | "appearance" | "captions">("main");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Na pré-visualização o aparelho está à escala: o menu abre dentro do ecrã dele, à mesma escala.
  const [screen, setScreen] = useState<HTMLElement | null>(null);
  const [side, setSide] = useState<"top" | "bottom">("top");
  // A barra de estado do aparelho na pré-visualização (na sala, o navegador já a deixa de fora).
  const [statusBar, setStatusBar] = useState(0);
  // Fora do menu, um toque ou o Esc fecham-no (o Popover faz isto sozinho; o menu na sala não).
  useEffect(() => {
    if (!inline || !open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [inline, open]);
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const appearanceLabel = { system: "Do sistema", dark: "Escuro", light: "Claro" }[appearance];
  const row = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] hover:bg-white/10";
  const trigger = (
    <button
      ref={button}
      type="button"
      aria-label="Definições do vídeo"
      aria-expanded={inline ? open : undefined}
      title="Definições"
      onClick={
        inline
          ? () => {
              setPage("main");
              setOpen((o) => !o);
            }
          : undefined
      }
      className={cn(
        "grid place-items-center rounded-full text-white transition",
        compact ? "size-9" : "size-10",
        inline
          ? "drop-shadow-[0_1px_3px_rgba(0,0,0,.6)] hover:opacity-80"
          : "bg-black/55 backdrop-blur hover:bg-black/75",
      )}
    >
      <Settings className={cn(compact ? "size-[18px]" : "size-5", inline && "size-[22px] transition-transform", inline && open && "rotate-45")} />
    </button>
  );
  const back = (label: string) => (
    <button type="button" onClick={() => setPage("main")} className={cn(row, "border-b border-white/10 pb-3")}>
      <ChevronLeft className="size-4" />
      <span className="flex-1 font-medium">{label}</span>
    </button>
  );
  const menu =
    page === "captions" ? (
      <div className="grid gap-0.5">
        {back("Legendas")}
        {(
          [
            [true, "Ligar"],
            [false, "Desligar"],
          ] as const
        ).map(([on, label]) => (
          <button key={label} type="button" onClick={() => onCaptions(on)} className={row}>
            <span className="flex-1">{label}</span>
            {captions === on ? <Check className="size-4" /> : null}
          </button>
        ))}
      </div>
    ) : page === "main" ? (
      <div className="grid gap-0.5">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onVolume(volume === 0 ? 1 : 0)}
            aria-label={volume === 0 ? "Ligar o som" : "Tirar o som"}
            className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-white/10"
          >
            <VolumeIcon className="size-[18px]" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="Volume"
            className="h-1 flex-1 cursor-pointer accent-white"
          />
        </div>
        {hasCaptions ? (
          <button type="button" onClick={() => setPage("captions")} className={row}>
            <Captions className="size-[18px] shrink-0" />
            <span className="flex-1">Legendas</span>
            <span className="text-[13px] text-white/65">{captions ? "Ligadas" : "Desligadas"}</span>
            <ChevronRight className="size-4 text-white/65" />
          </button>
        ) : null}
        <div className={cn(row, "cursor-default hover:bg-transparent")}>
          <MonitorPlay className="size-[18px] shrink-0" />
          <span className="flex-1">Qualidade</span>
          <span className="text-[13px] text-white/65">Automática</span>
        </div>
        <button type="button" onClick={() => setPage("appearance")} className={row}>
          <Moon className="size-[18px] shrink-0" />
          <span className="flex-1">Aparência</span>
          <span className="text-[13px] text-white/65">{appearanceLabel}</span>
          <ChevronRight className="size-4 text-white/65" />
        </button>
      </div>
    ) : (
      <div className="grid gap-0.5">
        {back("Aparência")}
        {(
          [
            ["system", "Do sistema", Monitor],
            ["dark", "Escuro", Moon],
            ["light", "Claro", Sun],
          ] as const
        ).map(([value, label, Icon]) => (
          <button key={value} type="button" onClick={() => onAppearance(value)} className={row}>
            <Icon className="size-[18px] shrink-0" />
            <span className="flex-1">{label}</span>
            {appearance === value ? <Check className="size-4" /> : null}
          </button>
        ))}
      </div>
    );
  if (inline) {
    return (
      <div ref={box} className="relative">
        {trigger}
        {open ? (
          // As unidades cq medem o palco da sala: o menu nunca fica mais largo do que o ecrã.
          <div role="dialog" aria-label="Definições do vídeo" className={cn(GLASS, "absolute right-0 top-[calc(100%+8px)] z-50 w-[272px] max-w-[calc(100cqw-24px)]")}>
            {menu}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <Popover
      onOpenChange={(next) => {
        if (!next) return;
        setPage("main");
        const found = button.current?.closest<HTMLElement>("[data-device-screen]") ?? null;
        setScreen(found);
        // Sem lugar para o menu por cima do ⚙ (telemóvel ao alto: o vídeo está no topo), abre por baixo.
        // Escolhe-se ao abrir, para o menu não saltar de lado ao mudar de página. Na pré-visualização
        // mede-se no ecrã do aparelho, sem a escala.
        const area = found?.getBoundingClientRect();
        const scale = found && area ? area.height / (found.offsetHeight || 1) : 1;
        const bar = Number(found?.dataset["deviceScreen"]) || 0;
        setStatusBar(bar);
        const above = ((button.current?.getBoundingClientRect().top ?? 0) - (area?.top ?? 0)) / scale - bar;
        setSide(above < 220 ? "bottom" : "top");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {/* Sempre com 12 px de margem às bordas do ecrã. */}
      <PopoverContent
        side={side}
        align="end"
        collisionPadding={{ top: 12 + statusBar, right: 12, bottom: 12, left: 12 }}
        {...(screen ? { container: screen, collisionBoundary: screen } : {})}
        className={cn(GLASS, "w-[272px] max-w-[calc(100vw-24px)] border-0")}
      >
        {menu}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A legenda da fala, um pouco acima do fundo do vídeo, como no cinema: em pedaços curtos (no telemóvel,
 * no máximo duas linhas de ~32 caracteres), ao ritmo da fala (`captionAt`). Sem legendas, `lines` vazio.
 */
export function CaptionLine({
  lines,
  t,
  compact,
  raised,
  flow,
}: {
  lines: readonly SpokenLine[];
  /** O segundo do vídeo. */
  t: number;
  compact?: boolean | undefined;
  /** Um aviso de compra está em baixo, no vídeo: a legenda sobe por cima dele. */
  raised?: boolean | undefined;
  /** No fluxo (dentro da prova social, com o chat oculto): logo acima das mensagens, sem as tapar. */
  flow?: boolean | undefined;
}) {
  const size = compact ? "compact" : "full";
  const text = captionAt(lines, t, CAPTION_CHARS[size]);
  if (!text) return null;
  return (
    <div
      className={cn(
        "pointer-events-none flex justify-center px-6",
        flow
          ? "pb-2"
          : cn("absolute inset-x-0 z-[1]", raised ? (compact ? "bottom-[48px]" : "bottom-[72px]") : compact ? "bottom-[6%]" : "bottom-[7%]"),
      )}
    >
      <span
        className={cn(
          "max-w-[86%] whitespace-pre-line break-words rounded bg-black/60 px-2 py-0.5 text-center font-medium leading-snug text-white",
          compact ? "text-[12px]" : "text-[14px]",
        )}
      >
        {captionLines(text, CAPTION_LINE[size])}
      </span>
    </div>
  );
}

/* ---------- Escrever no chat ---------- */

export const EMOJIS = ["😀", "😂", "😍", "🥰", "😮", "🤔", "👏", "🙌", "👍", "💪", "🔥", "💯", "❤️", "🎉", "🙏", "✅", "😅", "🤩", "😢", "👀", "💡", "🚀", "⭐", "🇦🇴", "🇧🇷", "🇵🇹"];

/** Um separador do painel da sala (Chat, Suporte, Oferta); `extra` = o ponto ou o número ao lado do nome. */
export type RoomTabItem<T extends string> = { value: T; label: string; Icon: LucideIcon; extra?: ReactNode };

/**
 * Os separadores do painel da sala (a sala e a pré-visualização do editor): o nosso desenho, com o
 * escolhido a laranja e sublinhado.
 */
export function RoomTabs<T extends string>({
  items,
  active,
  onTab,
  big,
  tight,
  trailing,
}: {
  items: readonly RoomTabItem<T>[];
  active: T;
  onTab: (value: T) => void;
  /** Letra e altura maiores (pré-visualização no computador). */
  big?: boolean | undefined;
  /** Telemóvel deitado: mais baixos, para caberem mais mensagens na coluna do chat. */
  tight?: boolean | undefined;
  /** À direita dos separadores (ex.: o X que fecha o chat deitado). */
  trailing?: ReactNode;
}) {
  return (
    <div className="mx-3 flex shrink-0 items-center gap-1 border-b border-room-line/60">
      {items.map(({ value, label, Icon, extra }) => {
        const on = value === active;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onTab(value)}
            aria-pressed={on}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-2 font-semibold transition",
              big ? "h-[54px] text-[15px]" : tight ? "h-9 text-sm" : "h-12 text-sm",
              on ? "text-primary" : "text-room-subtle hover:text-room-text",
            )}
          >
            <Icon className="size-4" strokeWidth={1.9} />
            {label}
            {extra}
            {on ? <span className="absolute inset-x-5 -bottom-px h-[3px] rounded-full bg-primary" /> : null}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}

/**
 * A caixa de escrever do formato Webinar: o campo com os emojis e, ao lado, o coração das reacções (sempre lá,
 * no Chat). Ao escrever, aparece dentro do campo, junto aos emojis, um enviar discreto (sem fundo); a tecla
 * «Enviar» do teclado também envia. No Suporte (sem reacções) não há coração.
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  withReactions,
  onHeart,
  reactions,
  compact,
  tight,
  inputProps,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  withReactions: boolean;
  onHeart?: (() => void) | undefined;
  reactions?: readonly Reaction[] | undefined;
  compact?: boolean | undefined;
  /** Telemóvel deitado: a linha mais baixa (~44 px), para caberem mais mensagens. */
  tight?: boolean | undefined;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> | undefined;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ready = Boolean(value.trim());
  return (
    <form
      className={cn("flex items-center gap-2 border-t border-room-line/60 px-3", tight ? "py-1" : compact ? "py-3" : "py-2.5")}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit();
      }}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-0.5 rounded-full bg-room-raised pl-4 pr-1 ring-1 ring-inset ring-transparent transition focus-within:ring-room-line",
          tight ? "h-9" : compact ? "h-11" : "h-12",
        )}
      >
        <input
          {...inputProps}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          enterKeyHint="send"
          maxLength={200}
          className={cn("min-w-0 flex-1 bg-transparent text-room-text outline-none placeholder:text-room-subtle", compact ? "text-[15px]" : "text-[15.5px]")}
        />
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Emojis"
              title="Emojis"
              className={cn("grid size-9 shrink-0 place-items-center rounded-full text-room-subtle transition hover:text-room-text", emojiOpen && "bg-room-line text-room-text")}
            >
              <Smile className="size-[21px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-[264px] p-2">
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onChange(`${value}${emoji}`)}
                  className="grid size-7 place-items-center rounded-md text-lg hover:bg-accent"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {ready ? (
          <button
            type="submit"
            aria-label="Enviar"
            title="Enviar"
            className="grid size-9 shrink-0 place-items-center rounded-full text-room-subtle transition hover:text-room-text active:scale-95"
          >
            <SendHorizontal className="size-5 translate-x-px" strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {withReactions && onHeart ? (
        <HeartButton
          onHeart={onHeart}
          reactions={reactions ?? []}
          className={cn("grid shrink-0 place-items-center rounded-full text-room-text transition active:scale-90", tight ? "size-9" : compact ? "size-11" : "size-12")}
          iconClassName={cn(tight ? "size-6" : "size-[26px]", "[stroke-width:1.75]")}
        />
      ) : null}
    </form>
  );
}

const HEART_PATH =
  "M12 21.2 10.6 19.9C5.5 15.3 2.2 12.3 2.2 8.6 2.2 5.6 4.6 3.2 7.6 3.2c1.7 0 3.3.8 4.4 2.1 1.1-1.3 2.7-2.1 4.4-2.1 3 0 5.4 2.4 5.4 5.4 0 3.7-3.3 6.7-8.4 11.3Z";

/**
 * O coração das reacções, na cor do ❤️ do iPhone: um vermelho com um degradê suave de cima para
 * baixo, sem brilho nem relevo (não fica 3D).
 */
export function ReactionHeart({ size, className, style }: { size: number; className?: string | undefined; style?: CSSProperties | undefined }) {
  const id = `rh${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className} style={style}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF4D3D" />
          <stop offset="1" stopColor="#D9160C" />
        </linearGradient>
      </defs>
      <path d={HEART_PATH} fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * O coração das reacções: um contorno; enquanto a pessoa toca enche-se de vermelho (sabe que reagiu)
 * e sobem corações na cor do ❤️ do iPhone, a direito e com um leve balanço, por cima do botão
 * (no canto de baixo à direita).
 */
export function HeartButton({
  onHeart,
  reactions,
  className,
  iconClassName,
}: {
  onHeart: () => void;
  reactions: readonly Reaction[];
  className: string;
  iconClassName?: string | undefined;
}) {
  const [pressed, setPressed] = useState(0);
  useEffect(() => {
    if (!pressed) return;
    const timer = window.setTimeout(() => setPressed(0), 650);
    return () => window.clearTimeout(timer);
  }, [pressed]);
  return (
    <span className="relative shrink-0">
      {/* Sem máscara nem caixa: no Safari uma máscara vazia desenhava um rectângulo preto. */}
      {reactions.length > 0 ? (
        <span aria-hidden className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 h-[230px] w-12 -translate-x-1/2 [--h:210px]">
          {reactions.map((r) => {
            const size = Math.max(26, Math.min(32, r.size ?? 29));
            const sway = Math.max(-7, Math.min(7, Math.round(r.offset / 5))) || 4;
            return (
              <ReactionHeart
                key={r.id}
                size={size}
                className="cw-rx absolute bottom-0 opacity-0 drop-shadow-[0_1px_2px_rgba(0,0,0,.25)]"
                style={{ left: `calc(50% - ${size / 2}px)`, "--sway": `${sway}px` } as CSSProperties}
              />
            );
          })}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setPressed((n) => n + 1);
          onHeart();
        }}
        aria-label="Enviar um coração"
        title="Reagir"
        className={className}
      >
        {pressed ? (
          <span key="on" className={cn("cw-pop grid size-5 place-items-center", iconClassName)}>
            <ReactionHeart size={26} className="size-full" />
          </span>
        ) : (
          <Heart key="off" className={cn("size-5", iconClassName)} />
        )}
      </button>
    </span>
  );
}

/** A reacção do chat simulado a uma mensagem real («❤️ 3»), no fim da linha. */
/** «(VOCÊ)» a vermelho a seguir ao nome de quem está a ver: a pessoa sabe qual é a sua mensagem. */
export function YouTag({ className }: { className?: string | undefined }) {
  return <em className={cn("font-bold not-italic text-[#E53935] [text-shadow:none]", className)}>(VOCÊ)</em>;
}

export function ReactionPill({ text, onVideo }: { text: string; onVideo?: boolean | undefined }) {
  return (
    <span
      className={cn(
        "lv-in ml-1.5 inline-flex h-[22px] items-center rounded-full px-2 align-[1px] text-[12.5px] font-semibold tabular-nums [text-shadow:none]",
        onVideo ? "bg-white/20 text-white" : "bg-room-raised text-room-text ring-1 ring-room-line",
      )}
    >
      {text}
    </span>
  );
}

/** Uma mensagem do chat, como no YouTube: avatar, nome e texto na mesma linha. */
export function ChatLine({
  author,
  text,
  avatarUrl,
  tone = "people",
  badge,
  reaction,
  big,
  tight,
  onVideo,
}: {
  author: string;
  text: string;
  avatarUrl?: string | null | undefined;
  /** Telemóvel deitado: letra 14/18 e avatar de 24 px, para caberem mais mensagens na coluna. */
  tight?: boolean | undefined;
  /** «team»: alguém da equipa, com o nome e o selo na cor do botão. */
  tone?: "people" | "mine" | "agent" | "team" | undefined;
  badge?: string | undefined;
  /** A reacção do chat simulado, quando já chegou. */
  reaction?: string | undefined;
  /** Letra maior (sala no computador). */
  big?: boolean | undefined;
  /** Por cima do vídeo (formato Live): letra branca com sombra, como no Instagram. */
  onVideo?: boolean | undefined;
}) {
  const initials =
    author
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <div className={cn("flex items-start", tight ? "gap-2" : "gap-2.5")}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className={cn("shrink-0 rounded-full object-cover", tight ? "size-6" : big ? "size-8" : "size-7")} />
      ) : (
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-full font-bold",
            tight ? "size-6 text-[12px] tracking-tight" : big ? "size-8 text-[12px]" : "size-7 text-[12px] tracking-tight",
            tone === "agent"
              ? "bg-primary text-white"
              : tone === "team"
                ? "bg-[var(--of,#E8440C)] text-[var(--of-on,#fff)]"
                : onVideo
                ? "bg-white/20 text-white ring-1 ring-white/30 backdrop-blur"
                : "bg-room-raised text-room-text ring-1 ring-room-line",
          )}
        >
          {initials}
        </span>
      )}
      <p
        className={cn(
          "min-w-0 break-words",
          onVideo ? "text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]" : "text-room-text",
          tight ? "pt-[3px] text-[14px] leading-[18px]" : big ? "pt-0.5 text-[16px] leading-[1.45]" : onVideo ? "pt-0.5 text-[15px] leading-[1.45]" : "pt-0.5 text-[14.5px] leading-[1.45]",
        )}
      >
        <span
          className={cn(
            "mr-2 font-semibold",
            tone === "agent" || tone === "team" ? "text-[var(--of-ink,#E8440C)]" : onVideo ? "text-white/80" : "text-room-subtle",
          )}
        >
          {author}
          {tone === "mine" ? <YouTag className="ml-0.5" /> : null}
          {tone === "agent" ? <Zap className="ml-1 inline size-3 align-[-1px]" /> : null}
        </span>
        {badge ? (
          <span
            className={cn(
              "mr-2 rounded px-1.5 py-px align-[1px] [text-shadow:none]",
              "text-[12px] leading-none",
              tone === "team"
                ? "bg-[var(--of,#E8440C)] font-bold text-[var(--of-on,#fff)]"
                : onVideo
                  ? "bg-white/20 font-medium text-white"
                  : "bg-room-raised font-medium text-room-subtle",
            )}
          >
            {badge}
          </span>
        ) : null}
        {/* O texto um pouco transparente, na cor do tema; o nome fica cheio. */}
        <span className={onVideo ? "text-white/90" : "text-room-text/88"}>{text}</span>
        {reaction ? <ReactionPill text={reaction} onVideo={onVideo} /> : null}
      </p>
    </div>
  );
}

/**
 * A mensagem fixada no chat do Webinar (a da etapa Chat do editor), igual na sala e na pré-visualização.
 * O X tira-a até a pessoa sair da sala.
 */
export function ChatPin({
  title,
  message,
  onClose,
  className,
  tight,
}: {
  title: string;
  message?: string | null | undefined;
  onClose: () => void;
  className?: string | undefined;
  /** Telemóvel deitado: numa só linha (~30 px). */
  tight?: boolean | undefined;
}) {
  return (
    <div
      className={cn(
        "mx-3 flex shrink-0 items-center gap-2.5 rounded-xl bg-room-raised pl-3.5 pr-2 text-sm text-room-text",
        tight ? "mt-2 py-1" : "mt-3 py-3",
        className,
      )}
    >
      <Pin className="size-4 shrink-0 text-primary" />
      <span className={cn("min-w-0 flex-1", (!message || tight) && "truncate")}>
        {title}
        {message ? <span className="text-room-subtle"> {message}</span> : null}
      </span>
      <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-6 shrink-0 place-items-center rounded-md text-room-subtle transition hover:text-room-text">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** O primeiro nome de quem se inscreveu, para o «@» do aviso do Suporte. */
export function mentionName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] || "Você";
}

/**
 * No chat do formato Webinar: o Suporte já respondeu e a pessoa ainda não viu. Só ela vê; tocar
 * abre o Suporte. É o mesmo aviso do Live, com o desenho das linhas do chat.
 */
export function SupportNotice({ name, onOpen, big }: { name: string; onOpen: () => void; big?: boolean | undefined }) {
  return (
    <button type="button" onClick={onOpen} className="flex items-start gap-2.5 text-left">
      <span className={cn("grid shrink-0 place-items-center rounded-full bg-[#E8440C] text-white", big ? "size-8" : "size-7")}>
        <Headset className="size-4" />
      </span>
      <p className={cn("min-w-0 pt-0.5 leading-[1.45] text-room-text", big ? "text-[16px]" : "text-[14.5px]")}>
        <span className="mr-2 font-semibold text-room-subtle">Suporte</span>
        @{mentionName(name)}, já respondemos à sua dúvida. <u className="font-semibold underline-offset-[3px]">Ver resposta</u>
      </p>
    </button>
  );
}

/** As cores das compras na sala (aviso no vídeo e linha no chat). */
export const SALE_COLORS: Record<string, { label: string; solid: string; soft: string; ink: string }> = {
  emerald: { label: "Verde", solid: "#16A34A", soft: "rgba(22,163,74,.14)", ink: "#16A34A" },
  blue: { label: "Azul", solid: "#2563EB", soft: "rgba(37,99,235,.14)", ink: "#3B82F6" },
  violet: { label: "Roxo", solid: "#7C3AED", soft: "rgba(124,58,237,.14)", ink: "#8B5CF6" },
  orange: { label: "Laranja", solid: "#E8440C", soft: "rgba(232,68,12,.14)", ink: "#F0642E" },
  amber: { label: "Âmbar", solid: "#D97706", soft: "rgba(217,119,6,.15)", ink: "#F59E0B" },
  rose: { label: "Rosa", solid: "#E11D48", soft: "rgba(225,29,72,.14)", ink: "#F43F5E" },
  slate: { label: "Grafite", solid: "#334155", soft: "rgba(100,116,139,.18)", ink: "#64748B" },
};
export const saleColor = (name: string | null | undefined) => SALE_COLORS[name ?? ""] ?? SALE_COLORS["emerald"]!;

/* ---------- Oferta ---------- */

/** «A oferta termina em» com os minutos e os segundos em blocos, na cor da oferta. */
export function CountdownBlocks({ seconds, compact }: { seconds: number; compact?: boolean | undefined }) {
  const s = Math.max(0, Math.round(seconds));
  const mm = String(Math.min(99, Math.floor(s / 60))).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const tile = cn(
    "grid place-items-center rounded-lg bg-room-raised font-extrabold tabular-nums text-room-text ring-1 ring-room-line",
    compact ? "h-11 w-[34px] text-[26px]" : "h-[52px] w-10 text-[32px]",
  );
  const group = (digits: string, label: string) => (
    <span className="relative flex gap-1 pb-[18px]">
      {digits.split("").map((d, i) => (
        <b key={i} className={tile}>
          {d}
        </b>
      ))}
      <em className="absolute inset-x-0 bottom-0 text-center text-[12px] font-semibold not-italic uppercase tracking-[0.12em] text-room-subtle">
        {label}
      </em>
    </span>
  );
  return (
    <div className="grid justify-items-center gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--of,#E8440C)_10%,transparent)] px-3 pb-3 pt-3.5 ring-1 ring-[color-mix(in_srgb,var(--of,#E8440C)_25%,transparent)]">
      <small className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--of-ink,#E8440C)]">A oferta termina em</small>
      <div className="flex items-start gap-1.5">
        {group(mm, "min")}
        <i className={cn("font-extrabold not-italic text-room-subtle", compact ? "text-2xl leading-[44px]" : "text-[30px] leading-[52px]")}>
          :
        </i>
        {group(ss, "seg")}
      </div>
    </div>
  );
}

/** A imagem do produto em pequeno; sem imagem, o saco na cor da oferta. */
export function OfferThumb({ imageUrl, className }: { imageUrl?: string | null | undefined; className?: string | undefined }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(140deg,var(--of,#E8440C),color-mix(in_srgb,var(--of,#E8440C)_35%,#000))] text-white",
        className,
      )}
    >
      {imageUrl ? <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" /> : <ShoppingBag className="size-[42%]" />}
    </span>
  );
}

/** «-86%» na cor da oferta ou, com a oferta fechada, «Encerrada» a cinzento. */
function OfferBadge({ discount, closed, className }: { discount: number | null; closed?: boolean | undefined; className?: string | undefined }) {
  if (closed)
    return <span className={cn("rounded-full bg-room-raised px-2.5 py-1 text-[12px] font-bold text-room-subtle ring-1 ring-room-line", className)}>Encerrada</span>;
  if (discount === null) return null;
  return <span className={cn("rounded-full bg-[var(--of,#E8440C)] px-2.5 py-1 text-[12.5px] font-extrabold text-[var(--of-on,#fff)]", className)}>-{discount}%</span>;
}

/**
 * O separador Oferta (e a folha da oferta no Live): produto, preços, botão e cronómetro. Três formas,
 * escolhidas no editor: «Quadrada», com o produto num quadrado grande, «Compacta», numa linha, e
 * «Clássica», com a faixa na cor da oferta e o fundo meio transparente.
 */
export function OfferCard({
  productName,
  imageUrl,
  priceFrom,
  priceNow,
  buttonText,
  onBuy,
  countdownSeconds,
  showCountdown,
  closed,
  note,
  banner,
  group,
  compact,
  look = "square",
  colors,
  highlight,
  stickyBuy,
}: {
  productName?: string | null | undefined;
  imageUrl?: string | null | undefined;
  priceFrom?: string | null | undefined;
  priceNow?: string | null | undefined;
  buttonText: string;
  onBuy?: (() => void) | undefined;
  countdownSeconds: number;
  showCountdown: boolean;
  /** O cronómetro chegou a zero (e o botão fecha) ou o prazo passou. */
  closed?: boolean | undefined;
  /** Na pré-visualização, antes de a oferta abrir. */
  note?: ReactNode;
  /** Depois do vídeo: a sala continua aberta para compras. */
  banner?: ReactNode;
  /** O botão leva a um grupo (WhatsApp ou Telegram): pede os dados e abre o grupo. */
  group?: boolean | undefined;
  compact?: boolean | undefined;
  look?: OfferLook | undefined;
  /** As cores próprias da oferta (botão, fundo, texto); vazias, as da sala. */
  colors?: OfferColors | undefined;
  highlight?: string | null | undefined;
  /** Numa folha que rola: o botão fica preso ao fundo, sempre à vista. */
  stickyBuy?: boolean | undefined;
}) {
  // As cores próprias: as variáveis no elemento de cima; com um fundo escolhido, ele vira um cartão
  // nessa cor (numa folha, enche-a).
  const paint = (offerColorVars(colors) ?? undefined) as CSSProperties | undefined;
  const painted = colors?.card ? cn("bg-room-surface text-room-text", !stickyBuy && "m-3 rounded-2xl") : "";
  const hl = (key: string) =>
    highlight === key ? "outline outline-2 outline-offset-4 outline-[#E8440C] shadow-[0_0_0_10px_rgba(232,68,12,.25)]" : "";
  const discount = discountPercent(priceFrom ?? "", priceNow ?? "");
  const name = productName ? (
    <span className={cn("font-extrabold leading-tight", look === "compact" ? "line-clamp-2 text-[17px]" : "relative text-[22px] drop-shadow")}>{productName}</span>
  ) : productName === "" ? (
    <em className="relative justify-self-start rounded-lg border-[1.5px] border-dashed border-[#F2C77B] px-2.5 py-1 text-[15px] font-bold not-italic text-[#F2C77B]">
      Nome do produto
    </em>
  ) : null;
  const buy = (
    // A folha rola por baixo do botão: um esbatido por cima dele, para nada ficar cortado a meio.
    <div
      className={
        stickyBuy
          ? "sticky bottom-0 z-[1] -mx-4 -mb-4 bg-room-surface px-4 pb-4 pt-1 before:pointer-events-none before:absolute before:inset-x-0 before:-top-5 before:h-5 before:bg-gradient-to-t before:from-room-surface before:to-transparent"
          : "contents"
      }
    >
      <button
        type="button"
        onClick={onBuy}
        disabled={closed}
        className={cn(
          "flex w-full items-center justify-center gap-2.5 rounded-xl bg-[var(--of,#E8440C)] font-black uppercase tracking-[0.03em] text-[var(--of-on,#FFFFFF)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-room-raised disabled:text-room-subtle",
          compact || look === "compact" ? "h-[54px] text-[15px]" : "h-[60px] text-[17px]",
          hl("cta"),
        )}
      >
        {group ? <Users className="size-5" /> : <ShoppingCart className="size-5" />}
        {closed ? "Oferta encerrada" : buttonText}
      </button>
    </div>
  );
  const top = (
    <>
      {note ? <p className="rounded-[10px] bg-amber-500/15 px-3 py-2.5 text-[13px] font-medium text-amber-500">{note}</p> : null}
      {banner ? (
        <div className="rounded-[12px] bg-primary/10 px-3.5 py-3 text-[13.5px] leading-snug text-room-text ring-1 ring-primary/25">{banner}</div>
      ) : null}
    </>
  );

  if (look === "classic") {
    // «Clássica»: a faixa na cor da oferta com o nome; por baixo, num fundo meio transparente, os
    // preços e o botão. O cronómetro fica por baixo do cartão, em blocos.
    return (
      <div style={paint} className={cn("grid content-start gap-4 p-4", painted)}>
        {top}
        <div className="overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--room-surface)_78%,transparent)] ring-1 ring-room-line">
          <div className={cn("flex items-center gap-3 bg-[linear-gradient(110deg,var(--of-dark)_0%,var(--of-mid)_52%,var(--of)_100%)] px-4 pb-4 pt-3.5 text-white", hl("product"))}>
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-white/85">{closed ? "Inscrições encerradas" : "Inscrições abertas"}</span>
              {productName ? <span className="line-clamp-3 break-words text-[22px] font-extrabold leading-tight tracking-[-0.01em]">{productName}</span> : name}
            </div>
            {imageUrl ? <OfferThumb imageUrl={imageUrl} className="size-16 rounded-xl ring-1 ring-white/20" /> : null}
          </div>
          <div className="grid gap-3.5 px-4 pb-4 pt-3.5">
            {priceFrom || priceNow ? (
              <div className={cn("flex flex-wrap items-baseline gap-x-2.5 gap-y-1", hl("price"))}>
                {priceFrom ? <s className="text-[14px] font-bold text-room-subtle">De {priceFrom}</s> : null}
                {priceNow ? <b className="text-[24px] font-black leading-tight tracking-tight">Por {priceNow}</b> : null}
                <OfferBadge discount={discount} closed={closed} className="ml-auto self-center" />
              </div>
            ) : null}
            {buy}
          </div>
        </div>
        {showCountdown ? <CountdownBlocks seconds={countdownSeconds} compact={compact} /> : null}
      </div>
    );
  }

  if (look === "compact") {
    return (
      <div style={paint} className={cn("grid content-start gap-3.5 p-4", painted)}>
        {top}
        <div className={cn("flex items-center gap-3", hl("product"))}>
          <OfferThumb imageUrl={imageUrl} className="size-[68px]" />
          <div className="grid min-w-0 flex-1 gap-1">
            {name}
            {priceFrom || priceNow ? (
              <p className={cn("flex flex-wrap items-baseline gap-x-2 leading-tight", hl("price"))}>
                {priceFrom ? <s className="text-[13.5px] font-semibold text-room-subtle">{priceFrom}</s> : null}
                {priceNow ? <b className="text-[22px] font-black tracking-tight">{priceNow}</b> : null}
              </p>
            ) : null}
          </div>
          <OfferBadge discount={discount} closed={closed} className="shrink-0 self-start" />
        </div>
        {buy}
        {showCountdown ? (
          <p className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[color-mix(in_srgb,var(--of,#E8440C)_10%,transparent)] text-[14px] font-bold text-[var(--of-ink,#E8440C)]">
            <Clock className="size-4" strokeWidth={2.4} />
            A oferta termina em <span className="tabular-nums">{clock(Math.max(0, countdownSeconds))}</span>
          </p>
        ) : null}
      </div>
    );
  }

  // «Quadrada»: o produto num quadrado grande (a imagem, ou o saco na cor da oferta), com o nome e os
  // preços ao lado; o botão e o cronómetro cabem por baixo, à vista, mesmo no telemóvel.
  return (
    <div style={paint} className={cn("grid content-start gap-4 p-4", painted)}>
      {top}
      <div className={cn("flex items-start gap-3.5", hl("product"))}>
        <span className={cn("relative aspect-square shrink-0", compact ? "w-[38%] max-w-[132px]" : "w-[42%] max-w-[168px]")}>
          <OfferThumb imageUrl={imageUrl} className="size-full rounded-2xl ring-1 ring-room-line" />
          <OfferBadge discount={discount} closed={closed} className="absolute left-2 top-2" />
        </span>
        <div className="grid min-w-0 flex-1 content-start gap-2 pt-0.5">
          {productName ? (
            <span className={cn("line-clamp-3 break-words font-extrabold leading-tight", compact ? "text-[17px]" : "text-[19px]")}>{productName}</span>
          ) : (
            name
          )}
          {priceFrom || priceNow ? (
            <div className={cn("grid", hl("price"))}>
              {priceFrom ? <s className="text-[14px] font-bold text-room-subtle">De {priceFrom}</s> : null}
              {priceNow ? (
                <b className={cn("font-black leading-tight tracking-tight text-room-text", compact ? "text-[22px]" : "text-[26px]")}>Por {priceNow}</b>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {buy}
      {showCountdown ? <CountdownBlocks seconds={countdownSeconds} compact={compact} /> : null}
    </div>
  );
}

/** A linha de uma compra no chat, na cor escolhida nas Vendas. */
export function SaleLine({
  text,
  color,
  onVideo,
}: {
  text: string;
  color?: string | null | undefined;
  /** Por cima do vídeo: a cor cheia e a letra branca. */
  onVideo?: boolean | undefined;
}) {
  const c = saleColor(color);
  return (
    <div
      className="inline-flex items-center gap-2 self-start justify-self-start rounded-[10px] px-3 py-2 text-[14px] font-semibold"
      style={onVideo ? { background: c.solid, color: "#fff" } : { background: c.soft, color: c.ink }}
    >
      <ShoppingCart className="size-4 shrink-0" />
      <span className="min-w-0">{text}</span>
    </div>
  );
}

/**
 * Onde o aviso de compra aparece, no Webinar e no Live: no canto de baixo do vídeo, dentro da moldura
 * (`phone` no telemóvel, `desk` no tablet e no computador); a legenda sobe por cima dele. No Live com o
 * vídeo ao alto a encher o ecrã, o chat tapa o fundo do vídeo: o aviso entra logo acima das mensagens,
 * à esquerda (`feed`, no fluxo). Para o mover (na sala e na pré-visualização ao mesmo tempo), muda-se só aqui.
 */
export const SALE_TOAST_SPOT = {
  phone: "bottom-2 left-2",
  desk: "bottom-3 left-3",
  feed: "relative mb-2 shrink-0 self-start",
} as const;

/** O aviso de compra por cima do vídeo: uma pílula na cor escolhida nas Vendas, numa só linha. */
export function SaleToast({
  name,
  text,
  color,
  compact,
  className,
  style,
}: {
  name: string;
  text: string;
  color?: string | null | undefined;
  compact?: boolean | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 flex max-w-[calc(100%-16px)] items-center rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,.3)] animate-in fade-in slide-in-from-bottom-2 duration-300",
        compact ? "gap-2 py-1 pl-1 pr-3" : "gap-2.5 py-1.5 pl-1.5 pr-4",
        className,
      )}
      style={{ ...style, background: saleColor(color).solid }}
    >
      <span className={cn("grid shrink-0 place-items-center rounded-full bg-white/25", compact ? "size-6" : "size-8")}>
        <ShoppingCart className={compact ? "size-3" : "size-4"} />
      </span>
      <p className={cn("min-w-0 truncate", compact ? "text-[12.5px]" : "text-[14.5px]")}>
        <b className="font-bold">{name}</b> {text}
      </p>
    </div>
  );
}

/**
 * Mostrar ou ocultar o chat com o aparelho deitado e no computador (Webinar e Live, a sala e a
 * pré-visualização). `alert`: com o chat escondido, há oferta aberta ou resposta do Suporte por ver.
 */
export function ChatToggle({
  open,
  onToggle,
  alert,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  alert?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      aria-label={open ? "Ocultar o chat" : "Mostrar o chat"}
      title={open ? "Ocultar o chat" : "Mostrar o chat"}
      className={cn(
        "relative grid size-10 shrink-0 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-black/70 active:scale-95",
        className,
      )}
    >
      {open ? <MessageSquareOff className="size-5" /> : <MessagesSquare className="size-5" />}
      {!open && alert ? (
        <span className="absolute right-1 top-1 flex">
          <PulseDot />
        </span>
      ) : null}
    </button>
  );
}

/**
 * O ecrã inteiro do Webinar (telemóvel ao alto, vídeo horizontal), como no YouTube: duas setas em diagonal,
 * brancas com sombra, sem círculo, à esquerda do ⚙. Em ecrã inteiro, as setas para dentro (sair).
 */
export function FullscreenButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const Icon = on ? Minimize2 : Maximize2;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={on ? "Sair do ecrã inteiro" : "Ver em ecrã inteiro"}
      title={on ? "Sair do ecrã inteiro" : "Ecrã inteiro"}
      className="grid size-10 shrink-0 place-items-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.6)] transition hover:opacity-80 active:scale-95"
    >
      <Icon className="size-[22px]" strokeWidth={2} />
    </button>
  );
}

/** Sem ecrã inteiro no navegador (iPhone): a dica, 2,5 s por cima do vídeo, para virar o telemóvel. */
export function TurnHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[35] grid place-items-center px-4">
      <p className="flex items-center gap-2 rounded-full bg-black/65 px-3.5 py-2 text-[13px] font-medium text-white backdrop-blur animate-in fade-in duration-200">
        <RotateCcwSquare className="size-[18px] shrink-0" strokeWidth={1.75} />
        Vire o telemóvel para ver em ecrã inteiro
      </p>
    </div>
  );
}

/** O ponto que pulsa no separador Oferta enquanto não está aberto. */
export function PulseDot() {
  return <span aria-hidden className="cw-dot size-[7px] rounded-full bg-[#E8440C]" />;
}

/* ---------- Formato Live (vídeo ao alto, chat por cima) ---------- */

/** O vídeo ao alto a cobrir o palco do Live (as unidades cq medem o palco), sem faixas pretas. */
export const LIVE_COVER =
  "absolute left-1/2 top-1/2 h-[max(100cqh,177.78cqw)] w-[max(100cqw,56.25cqh)] -translate-x-1/2 -translate-y-1/2";
/**
 * O vídeo deitado no computador (Live): 16:9 inteiro, ao centro, com uma margem preta à volta e os
 * cantos arredondados, como no cinema. As unidades cq medem o palco.
 */
export const LIVE_WIDE =
  "absolute left-1/2 top-1/2 aspect-video w-[min(calc(100cqw-64px),calc((100cqh-112px)*16/9))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl";
/**
 * O vídeo deitado no telemóvel (Live). Ao alto, a sala empilha-se como no YouTube (ver `LiveStack` na
 * sala): o vídeo em cima, logo abaixo da zona da câmara, com a barra do Live por cima dele. Esta moldura
 * serve o telemóvel deitado, onde as classes landscape a põem inteira e ao centro. Sem bordas
 * esbatidas: o vídeo acaba a direito.
 */
export const LIVE_TOP = "absolute inset-x-0 top-[var(--live-top,0px)] aspect-video w-full";
/** O vídeo ao alto no computador (Live): uma coluna 9:16 ao centro, quase da altura do palco. */
export const LIVE_COLUMN =
  "absolute left-1/2 top-1/2 aspect-[9/16] h-[calc(100cqh-48px)] max-w-[calc(100cqw-48px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,.06),0_30px_80px_rgba(0,0,0,.6)]";
/** O fundo discreto atrás da coluna ao alto: um cinzento muito escuro que se apaga para as bordas. */
export const LIVE_COLUMN_BG = "absolute inset-0 bg-[radial-gradient(50%_75%_at_50%_50%,#1f1f1f,#0a0a0a_70%,#000)]";

const LIVE_BOXES: Record<LiveVideoPlace, string> = { fill: LIVE_COVER, top: LIVE_TOP, wide: LIVE_WIDE, column: LIVE_COLUMN };

/**
 * A moldura do vídeo no Live: depende só da forma do vídeo (lida do ficheiro) e do aparelho, com
 * regras fixas (`liveVideoPlace`). Só enche o ecrã um vídeo ao alto no telemóvel; nunca estica.
 */
export function liveFrame(shape: "horizontal" | "vertical" | null | undefined, where: "desk" | "phone") {
  const place = liveVideoPlace(shape, where);
  return { place, box: LIVE_BOXES[place], fit: place === "fill" ? ("cover" as const) : ("contain" as const) };
}

/** Num ecrã deitado o vídeo ao alto fica inteiro, ao centro, em fundo preto. */
export const LIVE_CONTAIN = "absolute left-1/2 top-1/2 h-full w-[56.25cqh] -translate-x-1/2 -translate-y-1/2";

/**
 * O botão para começar a ver (o navegador só deixa tocar com som depois de um toque), ao centro do
 * vídeo, na cor do botão escolhida no editor (`--of`): só o botão a pulsar, ou o botão com uma linha de
 * informação. O escurecido do vídeo por trás é `ENTRY_DIM`, posto por quem o desenha.
 */
export function EntryPlay({ look, kicker, compact }: { look: EntryLook; kicker: string; compact?: boolean | undefined }) {
  const big = look === "pulse";
  return (
    <span
      className={cn(
        "pointer-events-none flex items-center text-white",
        !big && "gap-4 rounded-full bg-black/60 py-2.5 pl-2.5 pr-7 text-left shadow-[0_12px_32px_rgba(0,0,0,.35)] ring-1 ring-white/15 backdrop-blur-md",
        !big && compact && "gap-3 py-2 pl-2 pr-5",
      )}
    >
      <span
        className={cn(
          "relative grid shrink-0 place-items-center rounded-full bg-[var(--of,#E8440C)] text-[var(--of-on,#fff)] shadow-[0_8px_28px_color-mix(in_srgb,var(--of,#E8440C)_45%,transparent)]",
          big ? (compact ? "size-[72px]" : "size-24") : compact ? "size-12" : "size-[58px]",
        )}
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--of,#E8440C)] opacity-50 motion-reduce:animate-none" />
        <Play className={cn("relative translate-x-px", big ? (compact ? "size-8" : "size-10") : compact ? "size-5" : "size-6")} fill="currentColor" />
      </span>
      {big ? null : (
        <span className="leading-tight">
          <small className={cn("block font-bold uppercase tracking-[0.16em] text-white/75", "text-[12px]")}>{kicker}</small>
          <b className={cn("block font-semibold", compact ? "text-[16px]" : "text-[18.5px]")}>Assistir agora</b>
        </span>
      )}
    </span>
  );
}

/**
 * O vídeo por trás do botão de entrar, «fusco»: já a correr (sem som), escurecido e desfocado, para se
 * ver que há vídeo sem se perceber bem. Ao tocar sai, e fica o vídeo claro e com som.
 */
export const ENTRY_DIM = "bg-black/45 backdrop-blur-[10px]";
