import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Gift,
  Globe,
  GraduationCap,
  Hash,
  Heart,
  House,
  Lightbulb,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  Target,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PHONE_COUNTRIES, type PhoneCountry } from "@/lib/phone-countries";
import { FIELD_KINDS, fieldIcon, type EntryField, type EntryFieldKind, type EntryNotice, type FieldIconKey } from "@/lib/entry-fields";
import { BrandLogo } from "@/components/ds/brand-icons";
import { ENTRY_CARD_DEFAULT, entryPalette } from "@/lib/room-logic";
import { cn } from "@/lib/utils";
import whatsappIcon from "@/assets/local/whatsapp-icon.webp";

/**
 * A página antes da sala: o título (com «Começa às…» antes da hora), os campos que o organizador escolheu e o
 * botão. Quem preenche entra logo na sala. Sem número de pessoas antes dos dados. A página
 * pública e a pré-visualização do editor desenham este mesmo componente.
 */

const ENTRY_CSS = `@keyframes cwBlink{50%{opacity:.25}}.cw-blink{animation:cwBlink 1.1s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.cw-blink{animation:none}}`;

export const ROOM_FONT = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';

/** Os logótipos das redes (cores da marca); o TikTok, preto, segue a cor do texto. */
const BRAND_FIELD_ICONS = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube" } as const;
type BrandFieldIcon = keyof typeof BRAND_FIELD_ICONS;
const isBrandIcon = (key: FieldIconKey): key is BrandFieldIcon => key in BRAND_FIELD_ICONS;

/** Os ícones que o organizador pode dar a um campo, iguais no editor e na página. */
export const FIELD_ICON_COMPONENTS: Record<Exclude<FieldIconKey, "whatsapp" | BrandFieldIcon>, LucideIcon> = {
  user: UserRound,
  mail: Mail,
  phone: Phone,
  pin: MapPin,
  building: Building2,
  briefcase: Briefcase,
  calendar: CalendarDays,
  globe: Globe,
  school: GraduationCap,
  target: Target,
  wallet: Wallet,
  users: Users,
  heart: Heart,
  star: Star,
  chat: MessageCircle,
  hash: Hash,
  home: House,
  gift: Gift,
  book: BookOpen,
  link: Link2,
  idea: Lightbulb,
  help: CircleHelp,
};

/** O ícone de um campo: o escolhido ou o do tipo. */
export function FieldIcon({
  kind,
  icon,
  className,
}: {
  kind: EntryFieldKind;
  icon?: string | undefined;
  className?: string;
}) {
  const key = fieldIcon({ kind, icon });
  if (key === "whatsapp") return <img src={whatsappIcon} alt="" className={className} />;
  if (isBrandIcon(key)) return <BrandLogo name={BRAND_FIELD_ICONS[key]} className={cn(className, key === "tiktok" && "fill-current")} />;
  const Icon = FIELD_ICON_COMPONENTS[key];
  return <Icon className={className} />;
}

export type EntryScreenProps = {
  title: string;
  /** «Ao vivo» ou, antes da hora, «Começa às 20:00». */
  liveLabel: string;
  live: boolean;
  theme: "dark" | "light";
  /** A aula por trás (só no tema escuro); sem vídeo legível, um fundo escuro. */
  video?: { url: string; startSeconds?: number } | null | undefined;
  buttonText: string;
  /** O aviso no topo do cartão (vagas em % ou texto curto); sem ele, só o título. */
  notice?: EntryNotice | null | undefined;
  /** A capa por cima do formulário, de borda a borda do cartão; sem ela, o cartão começa no aviso ou no título. */
  coverUrl?: string | null | undefined;
  fields: readonly EntryField[];
  values: Readonly<Record<string, string>>;
  onChange?: ((values: Record<string, string>) => void) | undefined;
  country: PhoneCountry;
  onCountry?: ((country: PhoneCountry) => void) | undefined;
  cardColor?: string | null | undefined;
  buttonColor?: string | null | undefined;
  onSubmit?: (() => void) | undefined;
  error?: string | undefined;
  errorField?: string | undefined;
  entering?: boolean | undefined;
  /** Pré-visualização: os campos não recebem foco nem texto. */
  preview?: boolean | undefined;
  /** Na pré-visualização, o elemento em edição fica realçado. */
  highlight?: string | null | undefined;
  className?: string | undefined;
};

const ring = (on: boolean) =>
  on ? "outline outline-2 outline-offset-4 outline-[#E8440C] shadow-[0_0_0_10px_rgba(232,68,12,.25)]" : "";

/** A cor do cartão: no tema claro, o de origem (escuro) passa a branco, como numa página clara. */
export function entryCardColor(theme: "dark" | "light", cardColor: string | null | undefined) {
  return theme === "light" && (!cardColor || cardColor.toUpperCase() === ENTRY_CARD_DEFAULT) ? "#FFFFFF" : cardColor;
}

/**
 * O selo ao lado do título, antes da hora: «Começa às 20:00». Sem «Ao vivo» no formulário (8/10:
 * parecia pouco sério). O editor usa-o em ponto pequeno.
 */
export function EntryBadge({ live, label, light, className }: { live: boolean; label: string; light: boolean; className?: string }) {
  if (live) return null;
  return (
    <span
      className={cn(
        "mr-2 inline-flex translate-y-[-0.1em] items-center gap-1.5 rounded-md px-2 py-[3px] align-middle text-[11px] font-bold uppercase tracking-[0.06em] @3xl:text-[12px]",
        light ? "bg-[#EDEDED] text-[#444]" : "bg-white/12 text-white/85",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function EntryScreen(props: EntryScreenProps) {
  const light = props.theme === "light";
  const p = entryPalette(entryCardColor(props.theme, props.cardColor), props.buttonColor);
  const hl = (key: string) => ring(props.highlight === key);
  const inert = props.preview;
  const set = (id: string, value: string) => props.onChange?.({ ...props.values, [id]: value });
  const notice = props.notice ?? null;
  const vars = {
    "--cw-btn": p.button,
    "--cw-line": p.line,
    "--cw-field": p.field,
    "--cw-ph": p.placeholder,
    fontFamily: ROOM_FONT,
  } as CSSProperties;
  const input =
    // 16 px no mínimo: abaixo disso o Safari do iPhone amplia a página ao tocar no campo.
    "h-[50px] w-full min-w-0 rounded-xl bg-[var(--cw-field)] px-4 text-[16px] shadow-[0_0_0_1px_var(--cw-line)] outline-none placeholder:text-[var(--cw-ph)] focus:shadow-[0_0_0_2px_var(--cw-btn)] @3xl:h-[52px] @3xl:text-base";

  return (
    <div
      className={cn(
        // Com o telemóvel deitado, nada fica debaixo da câmara nem da barra de casa (zonas seguras).
        "@container relative isolate flex w-full flex-col items-center justify-center overflow-hidden pb-[max(2.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2.5rem,env(safe-area-inset-top))]",
        light ? "bg-[#F4F4F5] text-[#171717]" : "bg-[#0A0A0A] text-white",
        props.className,
      )}
      style={vars}
    >
      <style>{ENTRY_CSS}</style>
      {!light ? (
        <div aria-hidden className="absolute -inset-[30px] -z-10 [filter:blur(16px)_brightness(.45)]">
          {props.video?.url ? (
            <BackgroundVideo url={props.video.url} startSeconds={props.video.startSeconds ?? 0} />
          ) : (
            <div className="h-full bg-[radial-gradient(120%_90%_at_85%_10%,rgba(232,68,12,.22),transparent_55%),linear-gradient(160deg,#22262e,#111316)]" />
          )}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!inert) props.onSubmit?.();
        }}
        noValidate
        className="relative z-10 grid w-full max-w-[400px] gap-4 rounded-[18px] p-6 @3xl:max-w-[480px] @3xl:p-8"
        style={{
          background: p.card,
          color: p.text,
          boxShadow: light ? `0 10px 30px rgba(0,0,0,.08), 0 0 0 1px ${p.line}` : `0 30px 80px rgba(0,0,0,.45), 0 0 0 1px ${p.line}`,
        }}
      >
        {props.coverUrl ? (
          <img
            src={props.coverUrl}
            alt=""
            // Uma imagem não estica na grelha: a largura leva as margens do cartão, para ir de borda a borda.
            className={cn("-mx-6 -mt-6 aspect-video w-[calc(100%+3rem)] max-w-none rounded-t-[18px] object-cover @3xl:-mx-8 @3xl:-mt-8 @3xl:w-[calc(100%+4rem)]", hl("cover"))}
          />
        ) : null}
        {notice ? (
          // Uma linha leve por cima do título, com espaço antes dele: o título respira.
          <div className={cn("mb-2 grid gap-1.5", hl("progress"))}>
            {notice.kind === "progress" ? (
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: p.line }}>
                <div className="h-full rounded-full" style={{ width: `${notice.value}%`, background: p.button }} />
              </div>
            ) : null}
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: p.muted }}>
              {notice.kind === "text" ? <i aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: p.button }} /> : null}
              {notice.kind === "progress" ? `${notice.value}% das vagas preenchidas` : notice.text}
            </span>
          </div>
        ) : null}

        <h1 className={cn("text-[24px] font-bold leading-[1.2] tracking-tight @3xl:text-[30px]", hl("title"))}>
          {/* Sem «Ao vivo» no formulário (8/10: parecia pouco sério); antes da hora fica «Começa às 20:00». */}
          <EntryBadge live={props.live} label={props.liveLabel} light={light} />
          {props.title}
        </h1>
        {props.preview && !props.title ? (
          // No editor, sem título ainda: traços no lugar dele, para a página se ir construindo com o que se preenche.
          <span aria-hidden className="-mt-2 grid gap-2">
            <i className="block h-5 w-full rounded-md" style={{ background: p.line }} />
            <i className="block h-5 w-2/3 rounded-md" style={{ background: p.line }} />
          </span>
        ) : null}

        {props.fields.map((field) => {
          const meta = FIELD_KINDS[field.kind];
          const value = props.values[field.id] ?? "";
          const bad = props.errorField === field.id;
          return (
            <EntryField
              key={field.id}
              label={
                <>
                  <FieldIcon
                    kind={field.kind}
                    icon={field.icon}
                    className={cn("size-4 shrink-0", !isBrandIcon(fieldIcon(field)) && fieldIcon(field) !== "whatsapp" && "opacity-70")}
                  />
                  {field.label}
                </>
              }
              required={field.required}
            >
              {field.kind === "whatsapp" ? (
                <div className={cn("flex min-w-0 items-center gap-2", hl("phone"))}>
                  <CountryPicker country={props.country} onCountry={props.onCountry} inert={inert} className={input} />
                  <input
                    className={cn(input, bad && "shadow-[0_0_0_2px_#E5484D]")}
                    value={value}
                    onChange={(e) => set(field.id, e.target.value.replace(/[^\d\s()-]/g, ""))}
                    inputMode="tel"
                    autoComplete={meta.autoComplete}
                    placeholder={meta.placeholder}
                    readOnly={inert}
                    tabIndex={inert ? -1 : undefined}
                  />
                </div>
              ) : (
                <input
                  className={cn(input, bad && "shadow-[0_0_0_2px_#E5484D]")}
                  type={meta.input === "date" ? "date" : meta.input}
                  value={value}
                  onChange={(e) => set(field.id, e.target.value)}
                  autoComplete={meta.autoComplete}
                  placeholder={meta.placeholder}
                  readOnly={inert}
                  tabIndex={inert ? -1 : undefined}
                />
              )}
            </EntryField>
          );
        })}

        {/* Armadilha para robôs: fora do ecrã e do foco; uma pessoa nunca a preenche. */}
        <input
          type="text"
          name="website"
          value={props.values["website"] ?? ""}
          onChange={(e) => set("website", e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        {props.error ? (
          <p className="text-sm font-medium text-[#E5484D]" role="alert">
            {props.error}
          </p>
        ) : null}
        {props.preview && !props.buttonText ? null : (
        <button
          type="submit"
          disabled={props.entering}
          tabIndex={inert ? -1 : undefined}
          className={cn(
            "flex h-[54px] items-center justify-center gap-2 rounded-xl text-[17px] font-bold transition hover:brightness-110 disabled:opacity-70 @3xl:h-[56px]",
            hl("button"),
          )}
          style={{ background: p.button, color: p.buttonText }}
        >
          {props.entering ? <Loader2 className="size-5 animate-spin" /> : null}
          {props.buttonText}
        </button>
        )}
      </form>
    </div>
  );
}

function EntryField({ label, required, children }: { label: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-semibold @3xl:text-[15px]">
        {label}
        {required ? <span className="font-semibold text-[var(--cw-btn)]">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function CountryPicker({
  country,
  onCountry,
  inert,
  className,
}: {
  country: PhoneCountry;
  onCountry?: ((country: PhoneCountry) => void) | undefined;
  inert?: boolean | undefined;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <button
      type="button"
      aria-label="Escolher o indicativo do país"
      tabIndex={inert ? -1 : undefined}
      className={cn(className, "flex w-auto shrink-0 items-center gap-1.5 px-3")}
    >
      <span className="text-lg leading-none">{country.flag}</span>
      <span className="font-semibold tabular-nums">{country.dial}</span>
      <ChevronDown className="size-4 opacity-60" />
    </button>
  );
  if (inert || !onCountry) return trigger;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto p-1">
        {PHONE_COUNTRIES.map((option) => (
          <button
            key={`${option.code}-${option.dial}`}
            type="button"
            onClick={() => {
              onCountry(option);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <span className="text-base leading-none">{option.flag}</span>
            <span className="flex-1 truncate">{option.name}</span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{option.dial}</span>
            {option.code === country.code && option.dial === country.dial ? <Check className="size-3.5 text-primary" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** A aula a decorrer, sem som, a partir do minuto em que a sessão vai. */
function BackgroundVideo({ url, startSeconds }: { url: string; startSeconds: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const seek = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = startSeconds % video.duration;
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
    return () => video.removeEventListener("loadedmetadata", seek);
  }, [startSeconds, url]);
  return <video ref={ref} src={url} muted autoPlay loop playsInline preload="metadata" className="h-full w-full object-cover" />;
}

/** Um vídeo que o browser toca directamente (não um leitor embebido de uma plataforma). */
export function isDirectVideo(url: string | null | undefined, provider?: string | null) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (provider === "upload") return true;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
}

/** «Ao vivo» ou, antes da hora, «Começa às 20:00» (ou o dia, se não for hoje). */
export function entryLiveLabel(startMs: number | null, timezone: string | null | undefined, nowMs: number) {
  if (startMs === null || startMs <= nowMs) return { live: true, label: "Ao vivo" };
  const zone = timezone || "UTC";
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(ms));
  const hour = new Intl.DateTimeFormat("pt-PT", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(new Date(startMs));
  if (day(startMs) === day(nowMs)) return { live: false, label: `Começa às ${hour}` };
  const date = new Intl.DateTimeFormat("pt-PT", { timeZone: zone, day: "numeric", month: "short" }).format(new Date(startMs));
  return { live: false, label: `Começa a ${date.replace(".", "")}, ${hour}` };
}

/** O tema da sala que esta pessoa vê: o do organizador ou o que ela escolheu; «do dispositivo» segue o sistema. */
export { resolveTheme } from "@/lib/room-theme";
