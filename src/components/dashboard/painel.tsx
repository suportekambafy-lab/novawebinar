/**
 * O Painel: o webinar em destaque em cima (como a capa da Netflix ou da Apple TV) e, por
 * baixo, os resultados do período, o funil, de onde e como assistem, a agenda, quem
 * esteve na sala hoje e os webinars recentes. Só apresentação: a página junta os dados.
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Heart,
  Link2,
  Monitor,
  MousePointerClick,
  Pencil,
  Plus,
  Radio,
  Receipt,
  ShoppingBag,
  Smartphone,
  Tablet,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import { cloneElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Avatar, TintIcon } from "@/components/ds";
import { posterFromUrl } from "@/components/video-thumb";
import { Button } from "@/components/ui/button";
import { activeHeroTests } from "@/components/dashboard/ab-hero-card";
import { pct, variantColor } from "@/components/ab-tests/parts";
import { formatMeasure, measureOf, objectiveInfo, VERDICT_LABEL, type Objective } from "@/lib/ab-tests/stats";
import type { AbTestSummary } from "@/lib/ab-tests/ab-tests.functions";
import { Skeleton } from "@/components/ui/skeleton";
import type { DayEntry } from "@/lib/agenda";
import { zoneParts } from "@/lib/schedule";
import {
  fromNow,
  percent,
  PERIODS,
  shortMoney,
  WEEKDAYS_SHORT,
  type FunnelStep,
  type HeroIssue,
  type HeroKind,
  type MixRow,
  type Period,
  type TodayPerson,
} from "@/lib/dashboard";
import { wholeShares } from "@/lib/analytics-geo";
import { watchLabel } from "@/lib/data";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("pt-PT");
const card = "h-full min-w-0 rounded-card bg-card";

/** As cores dos dados (tokens --chart-*, paleta validada para daltonismo): o mesmo aparelho, a mesma cor em todo o lado. */
const DEVICE_COLOR: Record<string, string> = {
  mobile: "var(--chart-1)",
  desktop: "var(--chart-2)",
  tablet: "var(--chart-3)",
};
const DEVICE_ICON: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

/* ---------- Peças comuns ---------- */

function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] leading-6 font-semibold tracking-[var(--tracking-title)]">
          {title}
        </h2>
        {description && (
          <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

/** Ligação discreta no canto de um cartão: «Ver todos ↗». Recebe o <Link> já com o destino. */
function CornerLink({ label, children }: { label: string; children: ReactElement }) {
  return cloneElement(
    children,
    {
      className:
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-sm px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-[var(--hover-ghost)] hover:text-foreground",
    } as never,
    <>
      {label}
      <ArrowUpRight className="size-3.5" strokeWidth={1.75} aria-hidden />
    </>,
  );
}

/** Interruptor de duas ou três opções, no estilo do Geist. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit shrink-0 rounded-md bg-chip p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-7 cursor-pointer rounded-sm px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-focus",
            o.id === value
              ? "bg-white text-foreground shadow-[0_0_0_1px_var(--ds-gray-alpha-400),0_1px_2px_rgba(0,0,0,.06)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-lg bg-chip px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{children}</p>}
    </div>
  );
}

/* ---------- Destaque ---------- */

export type HeroData = {
  id: string;
  slug: string;
  title: string;
  kind: HeroKind;
  /** «A cada 15 min», «Sempre disponível»: a etiqueta de quem está sempre a receber. */
  badge?: string | undefined;
  /** «Hoje às 20:00», ou null sem hora. */
  when: string | null;
  /** «daqui a 3 h», «há 20 min». */
  countdown: string | null;
  /** A frase quando não há hora (sempre a receber, sem data marcada). */
  detail: string;
  /** Capa do webinar, imagem do vídeo ou o próprio ficheiro (um fotograma). */
  image: { cover: string | null; video: string | null; at: number };
  /** Números deste webinar desde sempre; null enquanto carregam. */
  stats: { registered: number; attended: number; buyers: number; registeredToday: number } | null;
  /** Pessoas na sala agora (presença em tempo real). */
  liveNow: number;
  /**
   * Ao vivo: onde vai o vídeo, para o vendedor saber em que parte da aula está a sala (e quando abre a
   * oferta). `videoStartMs` já conta a contagem depois de começar.
   */
  clock?: { videoStartMs: number; durationSeconds: number; offerSeconds: number | null } | null | undefined;
  /** O que falta (vídeo, automações, horário), no máximo 3, com a etapa onde se resolve. */
  issues: HeroIssue[];
};

const KIND_BADGE: Record<HeroKind, string> = {
  live: "Ao vivo agora",
  next: "Próximo webinar",
  open: "Sempre a receber",
  latest: "Sem sessão marcada",
  draft: "Inactivo",
};

function Backdrop({ image }: { image: HeroData["image"] }) {
  const [failed, setFailed] = useState(false);
  const poster = image.cover || posterFromUrl(image.video);
  const isFile = !!image.video && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(image.video);
  const media = failed ? null : poster ? (
    <img src={poster} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
  ) : isFile ? (
    <video
      src={`${image.video}#t=${Math.max(1, Math.round(image.at))}`}
      muted
      playsInline
      preload="metadata"
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  ) : null;
  return (
    <div aria-hidden className="absolute inset-0">
      {/* Sem imagem: luz de palco na cor da marca, para nunca ficar uma caixa preta vazia. */}
      <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_85%_10%,rgba(232,68,12,.38),transparent_60%),radial-gradient(60%_90%_at_100%_100%,rgba(0,114,245,.22),transparent_70%)]" />
      {media && (
        <div className="absolute inset-y-0 right-0 w-full md:w-[68%]">
          {media}
          {/* Do texto para a imagem: escuro à esquerda (computador) ou em baixo (telemóvel). */}
          <div className="absolute inset-0 bg-[linear-gradient(0deg,#0a0a0a_38%,rgba(10,10,10,.55)_70%,rgba(10,10,10,.2))] md:bg-[linear-gradient(90deg,#0a0a0a_0%,rgba(10,10,10,.75)_35%,rgba(10,10,10,.15)_100%)]" />
        </div>
      )}
    </div>
  );
}

function HeroStat({ value, label, extra }: { value: number; label: string; extra?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-2 text-[26px] leading-none font-semibold tracking-[var(--tracking-display)] sm:text-[30px]">
        {nf.format(value)}
        {extra}
      </p>
      <p className="mt-1.5 text-[12px] text-white/60">{label}</p>
    </div>
  );
}

/** Um teste A/B a correr, como um banner do hero: as variantes lado a lado, quem vai à frente e a ligação. */
/**
 * O fundo do slide de um teste A/B: não é a capa do webinar (essa é do 1.º slide). As variantes lado a lado,
 * cada uma com a capa do seu webinar tingida na cor da variante e a letra em grande, e «VS» ao meio.
 */
function AbBackdrop({
  variants,
  imageOfWebinar,
  leadId,
}: {
  variants: AbTestSummary["metrics"]["variants"];
  imageOfWebinar?: ((webinarId: string) => HeroData["image"] | null) | undefined;
  leadId: string | null;
}) {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(70%_120%_at_90%_0%,rgba(91,214,138,.22),transparent_60%),radial-gradient(60%_90%_at_100%_100%,rgba(0,114,245,.25),transparent_70%)]" />
      <div className="absolute inset-y-0 right-0 flex w-full md:w-[62%]">
        {variants.map((v, i) => {
          const image = v.webinarId ? imageOfWebinar?.(v.webinarId) : null;
          const poster = image ? image.cover || posterFromUrl(image.video) : null;
          return (
            <div
              key={v.id}
              className="relative min-w-0 flex-1 overflow-hidden"
              style={i > 0 ? { clipPath: "polygon(12% 0, 100% 0, 100% 100%, 0 100%)", marginLeft: "-6%" } : undefined}
            >
              {poster && <img src={poster} alt="" className="size-full scale-105 object-cover grayscale-[35%]" />}
              <div className="absolute inset-0 mix-blend-multiply" style={{ background: variantColor(v.position), opacity: 0.55 }} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,.1),rgba(10,10,10,.7))]" />
              <span
                className={cn(
                  "absolute top-4 right-5 text-[64px] leading-none font-black tracking-tight text-white/25 sm:text-[96px]",
                  v.id === leadId && "text-white/45",
                )}
              >
                {v.label}
              </span>
            </div>
          );
        })}
        {variants.length === 2 && (
          <span className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#0a0a0a]/80 text-[12px] font-bold tracking-wider text-white ring-1 ring-white/25 backdrop-blur">
            VS
          </span>
        )}
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(0deg,#0a0a0a_38%,rgba(10,10,10,.5)_70%,rgba(10,10,10,.15))] md:bg-[linear-gradient(90deg,#0a0a0a_0%,#0a0a0a_32%,rgba(10,10,10,.6)_52%,rgba(10,10,10,0)_75%)]" />
    </div>
  );
}

function AbHeroSlide({
  summary,
  imageOfWebinar,
  onCopyLink,
}: {
  summary: AbTestSummary;
  imageOfWebinar?: ((webinarId: string) => HeroData["image"] | null) | undefined;
  onCopyLink: (slug: string) => void;
}) {
  const { test, metrics, evaluation } = summary;
  const objective = test.objective as Objective;
  const total = metrics.variants.reduce((sum, v) => sum + v.visitors, 0);
  const best = evaluation.best;
  const comparison = evaluation.comparison;
  const confident = evaluation.verdict === "consistent";
  return (
    <section className="relative isolate flex h-full min-h-[420px] min-w-0 flex-col justify-end overflow-hidden rounded-card bg-[#0a0a0a] text-white md:min-h-[360px]">
      <AbBackdrop variants={metrics.variants} imageOfWebinar={imageOfWebinar} leadId={best?.id ?? null} />
      <div className="relative flex flex-col gap-6 p-5 pb-12 sm:p-8 sm:pb-12 md:max-w-[680px] md:p-10 md:pb-12">
        <div className="flex flex-col gap-3">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-white/12 px-2.5 py-1 text-[12px] font-medium backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#5BD68A]/70 motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-[#5BD68A]" />
            </span>
            Teste A/B a correr
          </span>
          <h2 className="line-clamp-2 text-[28px] leading-[1.08] font-semibold tracking-[var(--tracking-display)] sm:text-[40px]">
            {test.name}
          </h2>
          <p className="text-[15px] text-white/75">
            <span className="font-medium text-white">{objectiveInfo(objective).label}</span>
            {" · "}
            {total > 0 ? `${nf.format(total)} visitantes` : "à espera dos primeiros visitantes"}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-4">
          {metrics.variants.map((v) => {
            const share = total > 0 ? v.visitors / total : 0;
            return (
              <div key={v.id} className="min-w-[8.5rem]">
                <p className="flex items-baseline gap-2 text-[26px] leading-none font-semibold tracking-[var(--tracking-display)] sm:text-[30px]">
                  {formatMeasure(measureOf(v, objective))}
                  {best?.id === v.id && (
                    <Trophy className="size-4 self-center text-[#FFC46B]" strokeWidth={2} aria-label="à frente" />
                  )}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-white/60">
                  <span className="size-2 rounded-full" style={{ background: variantColor(v.position) }} aria-hidden />
                  Variante {v.label} · {nf.format(v.visitors)} ({total > 0 ? pct(share, 0) : "—"})
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/12" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: variantColor(v.position) }} />
                </div>
              </div>
            );
          })}
        </div>

        <p className={cn("text-[14px]", confident ? "text-[#5BD68A]" : "text-white/75")}>
          {VERDICT_LABEL[evaluation.verdict]}
          {best && comparison
            ? ` · ${best.label} ${Number.isFinite(comparison.lift) ? `${comparison.lift >= 0 ? "+" : ""}${pct(comparison.lift, 0)}` : "à frente"} com ${Math.round(comparison.confidence)}% de confiança`
            : ""}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*:first-child]:col-span-2">
          <Button asChild size="lg" className="bg-white text-[#0a0a0a] hover:bg-white/85">
            <Link to="/ab-tests/$testId" params={{ testId: test.id }}>
              Ver teste <ArrowRight />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="bg-white/10 text-white hover:bg-white/20"
            onClick={() => onCopyLink(test.slug)}
          >
            <Link2 /> Copiar link
          </Button>
          <Button asChild size="lg" variant="ghost" className="bg-white/10 text-white hover:bg-white/20">
            <Link to="/ab-tests">Todos os testes</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * O hero do Painel em slides: o webinar em destaque e, a seguir, cada teste A/B a correr. Passa sozinho de
 * 7 em 7 segundos (pára com o rato por cima, com o foco lá dentro, ou com «reduzir movimento»); os pontos
 * e as setas mudam à mão. Os slides ocupam a mesma célula: a altura é a do maior, sem saltos.
 */
export function HeroCarousel({
  hero,
  loading,
  hasWebinars,
  onCopyLink,
  abTests,
  imageOfWebinar,
}: {
  hero: HeroData | null;
  loading: boolean;
  hasWebinars: boolean;
  onCopyLink: (slug: string) => void;
  abTests?: AbTestSummary[] | undefined;
  /** A imagem de um webinar da conta (a capa da variante que vai à frente serve de fundo ao teste). */
  imageOfWebinar?: ((webinarId: string) => HeroData["image"] | null) | undefined;
}) {
  const tests = loading ? [] : activeHeroTests(abTests, hero?.id ?? null);
  const count = 1 + tests.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = Math.min(index, count - 1);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 7000);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  const go = (i: number) => setIndex(((i % count) + count) % count);

  return (
    <div
      className="relative min-w-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription={count > 1 ? "carrossel" : undefined}
    >
      <div className="grid">
        {[0, ...tests.map((_, i) => i + 1)].map((i) => (
          <div
            key={i}
            className={cn(
              "[grid-area:1/1] min-w-0 transition-opacity duration-500 motion-reduce:transition-none",
              i === current ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden={i !== current}
            {...(i !== current ? { inert: true } : {})}
          >
            {i === 0 ? (
              <Hero hero={hero} loading={loading} hasWebinars={hasWebinars} onCopyLink={onCopyLink} />
            ) : (
              <AbHeroSlide summary={tests[i - 1]!} imageOfWebinar={imageOfWebinar} onCopyLink={onCopyLink} />
            )}
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="absolute right-4 bottom-4 z-10 flex items-center gap-2 sm:right-6 sm:bottom-5">
          <button
            type="button"
            onClick={() => go(current - 1)}
            aria-label="Anterior"
            className="grid size-8 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/25"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Destaques">
            {Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === current}
                aria-label={i === 0 ? "Webinar em destaque" : `Teste A/B ${i}`}
                onClick={() => go(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === current ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(current + 1)}
            aria-label="Seguinte"
            className="grid size-8 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/25"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** «35:12», ou «1:05:12» passada a hora. */
function clockText(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** O minuto da live a correr, segundo a segundo, com a barra do vídeo e a hora da oferta. */
export function LiveClock({
  videoStartMs,
  durationSeconds,
  offerSeconds,
}: {
  videoStartMs: number;
  durationSeconds: number;
  offerSeconds: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const position = (now - videoStartMs) / 1000;
  if (position < 0)
    return (
      <p className="text-[15px] text-white/80" aria-live="polite">
        Contagem na sala: o vídeo começa daqui a{" "}
        <span className="font-semibold tabular-nums text-white">{clockText(-position)}</span>
      </p>
    );
  const at = durationSeconds > 0 ? Math.min(position, durationSeconds) : position;
  const share = durationSeconds > 0 ? Math.min(100, (at / durationSeconds) * 100) : 0;
  const offer = offerSeconds !== null && offerSeconds > 0 ? offerSeconds : null;
  return (
    <div className="flex max-w-md flex-col gap-2" aria-label="Onde vai a live">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-medium uppercase tracking-wider text-white/60">A live vai em</span>
        <span className="text-[28px] font-semibold tabular-nums leading-none">{clockText(at)}</span>
        {durationSeconds > 0 && (
          <span className="text-[15px] tabular-nums text-white/60">/ {clockText(durationSeconds)}</span>
        )}
      </div>
      {durationSeconds > 0 && (
        <div className="relative h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="absolute inset-y-0 left-0 rounded-full bg-live" style={{ width: `${share}%` }} />
          {offer !== null && offer < durationSeconds && (
            <span
              className="absolute inset-y-0 w-0.5 bg-[#FFC46B]"
              style={{ left: `${(offer / durationSeconds) * 100}%` }}
              title={`Oferta aos ${clockText(offer)}`}
            />
          )}
        </div>
      )}
      {offer !== null && (
        <p className="text-[14px] text-white/75">
          {at < offer ? (
            <>
              A oferta abre daqui a{" "}
              <span className="font-semibold tabular-nums text-[#FFC46B]">{clockText(offer - at)}</span> (aos{" "}
              {clockText(offer)})
            </>
          ) : (
            <>
              <span className="font-semibold text-[#FFC46B]">Oferta aberta</span> desde os {clockText(offer)}
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function Hero({
  hero,
  loading,
  hasWebinars,
  onCopyLink,
}: {
  hero: HeroData | null;
  loading: boolean;
  hasWebinars: boolean;
  onCopyLink: (slug: string) => void;
}) {
  const live = hero?.kind === "live";
  return (
    <section className="relative isolate flex h-full min-h-[420px] min-w-0 flex-col justify-end overflow-hidden rounded-card bg-[#0a0a0a] text-white md:min-h-[360px]">
      {hero && <Backdrop key={hero.id} image={hero.image} />}
      {!hero && !loading && <Backdrop image={{ cover: null, video: null, at: 0 }} />}
      <div className="relative flex flex-col gap-6 p-5 pb-12 sm:p-8 sm:pb-12 md:max-w-[620px] md:p-10 md:pb-12">
        {loading ? (
          <>
            <Skeleton className="h-6 w-36 bg-white/10" />
            <Skeleton className="h-10 w-80 max-w-full bg-white/10" />
            <Skeleton className="h-10 w-64 bg-white/10" />
          </>
        ) : !hero ? (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-[28px] leading-[1.1] font-semibold tracking-[var(--tracking-display)] sm:text-[40px]">
                {hasWebinars ? "Nenhum webinar activo" : "Crie o primeiro webinar"}
              </h2>
              <p className="mt-3 max-w-md text-[15px] text-white/70">
                Vídeo, chat e oferta num só sítio. Os números aparecem aqui quando as primeiras
                pessoas se inscreverem.
              </p>
            </div>
            <div>
              <Button asChild size="lg" className="bg-white text-[#0a0a0a] hover:bg-white/85">
                <Link to="/webinars/new">
                  <Plus /> Criar webinar
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <span
                className={cn(
                  "inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium",
                  live ? "bg-live text-white" : "bg-white/12 text-white backdrop-blur",
                )}
              >
                {live ? (
                  <span className="relative flex size-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
                    <span className="relative size-2 rounded-full bg-white" />
                  </span>
                ) : hero.kind === "open" ? (
                  <Radio className="size-3.5 text-[var(--accent-200)]" strokeWidth={1.75} aria-hidden />
                ) : (
                  <CalendarDays className="size-3.5 text-[var(--accent-200)]" strokeWidth={1.75} aria-hidden />
                )}
                {hero.kind === "open" && hero.badge ? hero.badge : KIND_BADGE[hero.kind]}
              </span>
              <h2 className="line-clamp-3 text-[28px] leading-[1.08] font-semibold tracking-[var(--tracking-display)] sm:text-[40px]">
                {hero.title}
              </h2>
              <p className="text-[15px] text-white/75">
                {hero.when ? (
                  <>
                    <span className="font-medium text-white">{hero.when}</span>
                    {hero.countdown && <span> · {hero.countdown}</span>}
                  </>
                ) : (
                  hero.detail
                )}
              </p>
            </div>

            {live && hero.clock && <LiveClock {...hero.clock} />}

            {(live || (hero.stats && hero.stats.registered > 0)) && (
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                {live && (
                  <HeroStat
                    value={hero.liveNow}
                    label="na sala agora"
                    extra={<span className="size-2 rounded-full bg-live" aria-hidden />}
                  />
                )}
                {hero.stats && hero.stats.registered > 0 && (
                  <>
                    <HeroStat
                      value={hero.stats.registered}
                      label="inscritos"
                      extra={
                        hero.stats.registeredToday > 0 && (
                          <span className="text-[13px] font-medium tracking-normal text-[#5BD68A]">
                            +{nf.format(hero.stats.registeredToday)} hoje
                          </span>
                        )
                      }
                    />
                    {!live && <HeroStat value={hero.stats.attended} label="assistiram" />}
                    <HeroStat value={hero.stats.buyers} label="compraram" />
                  </>
                )}
              </div>
            )}

            {hero.issues.length > 0 && (
              <ul className="flex flex-col gap-1.5" aria-label="O que falta">
                {hero.issues.map((issue) => (
                  <li key={issue.step}>
                    <Link
                      to="/webinars/$webinarId/edit"
                      params={{ webinarId: hero.id }}
                      search={{ step: issue.step }}
                      className="group/issue inline-flex items-center gap-2 text-[14px] text-[#FFC46B] hover:text-white"
                    >
                      <CircleAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="underline-offset-4 group-hover/issue:underline">{issue.title}</span>
                      <ArrowRight className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Telemóvel: a acção principal a toda a largura e as outras duas lado a lado. */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*:first-child]:col-span-2 [&>*:nth-child(2):last-child]:col-span-2">
              {hero.kind === "draft" ? (
                // A sala de um rascunho ainda não abre: activa-se na Revisão do editor.
                <Button asChild size="lg" className="bg-white text-[#0a0a0a] hover:bg-white/85">
                  <Link
                    to="/webinars/$webinarId/edit"
                    params={{ webinarId: hero.id }}
                    search={{ step: "revisao" }}
                  >
                    Rever e activar <ArrowRight />
                  </Link>
                </Button>
              ) : hero.kind === "latest" ? (
                // A data marca-se na etapa Agenda do editor.
                <Button asChild size="lg" className="bg-white text-[#0a0a0a] hover:bg-white/85">
                  <Link
                    to="/webinars/$webinarId/edit"
                    params={{ webinarId: hero.id }}
                    search={{ step: "agenda" }}
                  >
                    Marcar data <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" className="bg-white text-[#0a0a0a] hover:bg-white/85">
                  {live ? (
                    <Link to="/live-view" search={{ webinar: hero.id }}>
                      <Radio /> Ver ao vivo
                    </Link>
                  ) : (
                    <Link to="/live/$webinarId" params={{ webinarId: hero.id }}>
                      Testar sala <ArrowRight />
                    </Link>
                  )}
                </Button>
              )}
              {hero.kind === "draft" ? (
                <Button asChild size="lg" variant="ghost" className="bg-white/10 text-white hover:bg-white/20">
                  <Link to="/live/$webinarId" params={{ webinarId: hero.id }}>
                    Testar sala
                  </Link>
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="bg-white/10 text-white hover:bg-white/20"
                    onClick={() => onCopyLink(hero.slug)}
                  >
                    <Link2 /> Copiar link
                  </Button>
                  <Button asChild size="lg" variant="ghost" className="bg-white/10 text-white hover:bg-white/20">
                    <Link to="/webinars/$webinarId/edit" params={{ webinarId: hero.id }}>
                      <Pencil /> Editar
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- Resultados ---------- */

export type Results = {
  registered: number;
  attended: number;
  averageWatchSeconds: number;
  sawOffer: number;
  clicked: number;
  buyers: number;
  /** Mensagens escritas na sala; null quando não foi possível ler. */
  messages: number | null;
  /** Corações tocados na sala; null quando não foi possível ler. */
  reactions?: number | null;
  /** Pagamentos aprovados no período. */
  purchases: number;
  revenue: { currency: string; amount: number }[];
  webinarsCreated: number;
  webinarsTotal: number;
};

function Stat({
  label,
  icon,
  value,
  sub,
  title,
  loading,
}: {
  label: string;
  /** O ícone num círculo tingido da marca (fundo claro, ícone na cor). */
  icon: typeof Users;
  value: string;
  sub: ReactNode;
  title?: string | undefined;
  loading: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5 sm:py-5" title={title}>
      <TintIcon icon={icon} className="mb-3" />
      <p className="truncate text-[13px] text-muted-foreground">{label}</p>
      {loading ? (
        <>
          <Skeleton className="mt-2.5 h-8 w-20" />
          <Skeleton className="mt-2 h-3.5 w-28" />
        </>
      ) : (
        <>
          <p className="mt-1.5 truncate text-[26px] leading-9 font-semibold tracking-[var(--tracking-display)] [font-variant-numeric:proportional-nums] sm:text-[28px]">
            {value}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-muted-foreground">{sub}</p>
        </>
      )}
    </div>
  );
}

/** Quatro números por linha; as linhas e colunas separadas por uma linha fina. */
function StatRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="px-4 pt-4 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase sm:px-5">
        {title}
      </p>
      <div className="grid grid-cols-2 [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b lg:grid-cols-4 lg:[&>*]:!border-b-0 lg:[&>*:not(:last-child)]:border-r [&>*]:border-[var(--border-subtle)]">
        {children}
      </div>
    </div>
  );
}

export function ResultsCard({
  results,
  loading,
  error,
}: {
  results: Results | null;
  loading: boolean;
  error: boolean;
}) {
  const r = results;
  const busy = loading || !r;
  const money = r?.revenue ?? [];
  const cta = r ? percent(r.clicked, r.sawOffer) : null;
  const conversion = r ? percent(r.buyers, r.attended) : null;
  if (error)
    return (
      <section className={cn(card, "p-5")}>
        <p className="text-sm text-destructive">Não foi possível carregar os resultados. Recarregue a página.</p>
      </section>
    );
  return (
    <section className={cn(card, "divide-y divide-[var(--border-subtle)] overflow-hidden")}>
      <StatRow title="Audiência">
        <Stat
          loading={busy}
          label="Participantes"
          icon={Users}
          value={nf.format(r?.registered ?? 0)}
          sub={r?.registered ? `${nf.format(r.attended)} assistiram (${percent(r.attended, r.registered)})` : "Ainda sem inscritos"}
        />
        <Stat
          loading={busy}
          label="Tempo médio assistido"
          icon={Clock}
          value={r?.attended ? watchLabel(r.averageWatchSeconds) : "—"}
          sub={r?.attended ? "de quem assistiu" : "Ninguém assistiu ainda"}
        />
        <Stat
          loading={busy}
          label="Reacções"
          icon={Heart}
          value={r?.reactions == null ? "—" : nf.format(r.reactions)}
          sub={r?.messages == null ? "Mensagens por contar" : `${nf.format(r.messages)} mensagens no chat`}
          title="Corações tocados na sala e mensagens que os participantes escreveram no chat."
        />
        <Stat
          loading={busy}
          label="Webinars criados"
          icon={Video}
          value={nf.format(r?.webinarsCreated ?? 0)}
          sub={`${nf.format(r?.webinarsTotal ?? 0)} no total`}
        />
      </StatRow>
      <StatRow title="Vendas">
        <Stat
          loading={busy}
          label="Conversão no CTA"
          icon={MousePointerClick}
          value={cta ?? "—"}
          sub={r?.sawOffer ? `${nf.format(r.clicked)} clicaram de ${nf.format(r.sawOffer)} que viram a oferta` : "Ninguém viu a oferta ainda"}
        />
        <Stat
          loading={busy}
          label="Conversões"
          icon={ShoppingBag}
          value={nf.format(r?.buyers ?? 0)}
          sub={conversion ? `${conversion} de quem assistiu comprou` : "Pessoas do webinar que compraram"}
        />
        <Stat
          loading={busy}
          label="Total de compras"
          icon={Receipt}
          value={nf.format(r?.purchases ?? 0)}
          sub="pagamentos aprovados"
        />
        <Stat
          loading={busy}
          label="Facturação"
          icon={Banknote}
          value={money.length ? shortMoney(money[0]!.amount, money[0]!.currency) : "—"}
          title={money.map((m) => `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(m.amount)} ${m.currency}`).join(" + ") || undefined}
          sub={
            money.length > 1
              ? `+ ${money.slice(1).map((m) => shortMoney(m.amount, m.currency)).join(" + ")}`
              : money.length
                ? "em vendas aprovadas"
                : "Sem vendas no período"
          }
        />
      </StatRow>
    </section>
  );
}

/** Título da secção dos resultados com o período (7 dias, 30 dias, tudo). */
export function ResultsHeader({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
      <div>
        <h2 className="text-[18px] leading-7 font-semibold tracking-[var(--tracking-title)]">Resultados</h2>
        <p className="text-[13px] text-muted-foreground">
          {period === "all" ? "Desde o primeiro webinar." : `Inscrições e vendas dos últimos ${PERIODS.find((p) => p.id === period)?.label}.`}
        </p>
      </div>
      <Segmented label="Período" value={period} options={PERIODS} onChange={onPeriod} />
    </div>
  );
}

/* ---------- Funil ---------- */

export function FunnelCard({
  steps,
  loading,
}: {
  steps: FunnelStep[] | null;
  loading: boolean;
}) {
  const first = steps?.[0]?.value ?? 0;
  const attended = steps?.[1]?.value ?? 0;
  const buyers = steps?.at(-1)?.value ?? 0;
  // A maior perda entre dois passos seguidos (só onde o número desce).
  const worst = steps?.reduce<{ i: number; drop: number } | null>((best, s, i) => {
    if (i === 0 || s.fromPrevious === null || s.fromPrevious >= 1) return best;
    const drop = 1 - s.fromPrevious;
    return !best || drop > best.drop ? { i, drop } : best;
  }, null);
  return (
    <section className={cn(card, "flex flex-col gap-5 p-5 sm:p-6")}>
      <CardHeader
        title="Funil de conversão"
        description="Cada pessoa conta uma vez por webinar."
        action={<CornerLink label="Análises"><Link to="/analytics" search={{ webinar: undefined }} /></CornerLink>}
      />
      {loading || !steps ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-40" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : first === 0 ? (
        <Empty title="Sem inscritos no período">
          O funil enche-se quando as pessoas se inscrevem, entram na sala e chegam à oferta.
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-[40px] leading-none font-semibold tracking-[var(--tracking-display)] [font-variant-numeric:proportional-nums]">
                {percent(buyers, attended) ?? "—"}
              </p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">de quem assistiu comprou</p>
            </div>
            {worst && (
              <p className="max-w-[280px] text-[13px] leading-5 text-muted-foreground sm:text-right">
                Maior perda:{" "}
                <span className="font-medium text-foreground">
                  {steps[worst.i - 1]!.label.toLowerCase()} → {steps[worst.i]!.label.toLowerCase()}
                </span>{" "}
                <span className="font-medium text-destructive">(−{Math.round(worst.drop * 100)}%)</span>
              </p>
            )}
          </div>
          {/* Uma só escala: 100% = inscritos. A faixa clara é essa escala; o último passo (compraram) no laranja escuro. */}
          <ol className="flex flex-col gap-3.5">
            {steps.map((s, i) => (
              <li
                key={s.label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[168px_minmax(0,1fr)_96px]"
                title={`${s.label}: ${nf.format(s.value)} · ${percent(s.value, first)} dos inscritos${
                  s.fromPrevious !== null ? ` · ${percent(s.value, steps[i - 1]!.value)} do passo anterior` : ""
                }`}
              >
                <span className="truncate text-[13px] text-foreground">{s.label}</span>
                <span className="col-span-2 row-start-2 h-3 overflow-hidden rounded-[4px] bg-chart-track sm:col-span-1 sm:row-start-1 sm:col-start-2">
                  <span
                    className={cn(
                      "block h-full rounded-[4px] transition-[width] duration-500",
                      i === steps.length - 1 ? "bg-chart-emphasis" : "bg-chart-1",
                    )}
                    style={{ width: `${Math.max(s.value ? 1.5 : 0, Math.min(100, s.share * 100))}%` }}
                  />
                </span>
                <span className="text-right text-[13px] whitespace-nowrap tabular-nums sm:col-start-3 sm:row-start-1">
                  <span className="font-semibold">{nf.format(s.value)}</span>
                  <span className="ml-1.5 inline-block w-11 text-muted-foreground">
                    {Math.round(s.share * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/* ---------- De onde e como assistem ---------- */

export type AudienceMix = {
  devices: { rows: MixRow[]; unknown: number; total: number };
  countries: { rows: MixRow[]; regions: MixRow[]; unknown: number; total: number };
};

export function AudienceCard({ mix, loading }: { mix: AudienceMix | null; loading: boolean }) {
  const devices = mix?.devices;
  const countries = mix?.countries;
  const maxShare = Math.max(0, ...(countries?.rows.map((r) => r.share) ?? []));
  return (
    <section className={cn(card, "flex flex-col gap-6 p-5 sm:p-6")}>
      <CardHeader title="De onde e como assistem" description="Quem assistiu, uma vez por webinar." />
      {loading || !mix ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-2/3" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : devices!.total === 0 ? (
        <Empty title="Ninguém assistiu no período">
          O aparelho e o país aparecem quando alguém entra na sala.
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h3 className="text-[13px] font-medium">Aparelhos</h3>
            {devices!.rows.length ? (
              <>
                {/* Barra de 100% com um intervalo de 2px entre as partes. */}
                <div className="flex h-3 gap-0.5" role="img" aria-label={devices!.rows.map((r) => `${r.label} ${Math.round(r.share * 100)}%`).join(", ")}>
                  {devices!.rows.map((r) => (
                    <span
                      key={r.key}
                      title={`${r.label}: ${nf.format(r.value)} (${Math.round(r.share * 100)}%)`}
                      className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                      style={{ width: `${r.share * 100}%`, background: DEVICE_COLOR[r.key] }}
                    />
                  ))}
                </div>
                <ul className="flex flex-wrap gap-x-6 gap-y-2">
                  {devices!.rows.map((r) => {
                    const Icon = DEVICE_ICON[r.key] ?? Monitor;
                    return (
                      <li key={r.key} className="flex items-center gap-2 text-[13px]">
                        <span className="size-2.5 rounded-full" style={{ background: DEVICE_COLOR[r.key] }} aria-hidden />
                        <Icon className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                        <span>{r.label}</span>
                        <span className="font-semibold tabular-nums">{Math.round(r.share * 100)}%</span>
                        <span className="text-muted-foreground tabular-nums">({nf.format(r.value)})</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
            <p className="text-[12px] text-muted-foreground">
              Os tablets contam como telemóvel.
              {devices!.unknown > 0 && ` ${nf.format(devices!.unknown)} sem aparelho registado.`}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-[13px] font-medium">Regiões e países</h3>
            {countries!.regions.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {wholeShares(countries!.regions.map((r) => r.value)).map((pct, i) => {
                  const r = countries!.regions[i]!;
                  return (
                    <li key={r.key} className="rounded-pill bg-chip px-2.5 py-1 text-[12px]" title={`${r.label}: ${nf.format(r.value)}`}>
                      {r.label} <span className="font-semibold tabular-nums">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {countries!.rows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Ainda sem país registado: a sala guarda-o quando a localização responde.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {countries!.rows.map((r) => (
                  <li
                    key={r.key}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[132px_minmax(0,1fr)_64px]"
                    title={`${r.label}: ${nf.format(r.value)} (${Math.round(r.share * 100)}%)`}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-[13px]">
                      <span className="w-5 shrink-0 text-center text-[15px] leading-none" aria-hidden>
                        {r.flag ?? ""}
                      </span>
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="col-span-2 row-start-2 h-2 overflow-hidden rounded-[4px] bg-chart-track sm:col-span-1 sm:col-start-2 sm:row-start-1">
                      <span
                        className={cn("block h-full rounded-[4px]", r.key === "outros" ? "bg-chart-other" : "bg-chart-1")}
                        style={{ width: `${maxShare ? (r.share / maxShare) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="text-right text-[13px] tabular-nums sm:col-start-3 sm:row-start-1">
                      <span className="font-semibold">{Math.round(r.share * 100)}%</span>
                      <span className="ml-1 text-muted-foreground">{nf.format(r.value)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {countries!.unknown > 0 && countries!.rows.length > 0 && (
              <p className="text-[12px] text-muted-foreground">
                Percentagens de quem tem país registado. {nf.format(countries!.unknown)} sem país.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- Agenda ---------- */

export type AgendaData = {
  year: number;
  /** 1–12. */
  month: number;
  today: number;
  nowMs: number;
  /** As sessões do mês, por dia (monthEntries). */
  days: Map<number, DayEntry[]>;
  /** As próximas sessões (a semana e o mês saem daqui). */
  upcoming: DayEntry[];
  /** Webinars que recebem pessoas sem data (just in time, sempre disponível). */
  open: { id: string; title: string; when: string }[];
};

const timeOf = (e: DayEntry) =>
  new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: e.timezone }).format(
    new Date(e.startMs),
  );

function MiniMonth({
  data,
  selected,
  onSelect,
}: {
  data: AgendaData;
  selected: number | null;
  onSelect: (day: number | null) => void;
}) {
  const first = (new Date(data.year, data.month - 1, 1).getDay() + 6) % 7;
  const last = new Date(data.year, data.month, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + last) / 7) * 7 }, (_, i) => i - first + 1);
  const label = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(
    new Date(data.year, data.month - 1, 1),
  );
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[13px] font-medium first-letter:uppercase">{label}</p>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
          <span key={i} className="pb-1 text-xs text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day < 1 || day > last) return <span key={i} />;
          const list = data.days.get(day) ?? [];
          const upcoming = list.some((e) => e.startMs >= data.nowMs);
          const isToday = day === data.today;
          const isSelected = day === selected;
          return (
            <button
              key={i}
              type="button"
              disabled={!list.length}
              onClick={() => onSelect(isSelected ? null : day)}
              aria-pressed={isSelected}
              aria-label={`${day}${list.length ? `: ${list.length} ${list.length === 1 ? "sessão" : "sessões"}` : ""}`}
              className={cn(
                "relative mx-auto flex size-9 flex-col items-center justify-center rounded-full text-[13px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-focus",
                list.length ? "cursor-pointer hover:bg-gray-100" : "cursor-default text-muted-foreground",
                isToday && "font-semibold text-foreground ring-1 ring-foreground",
                isSelected && "bg-foreground text-white hover:bg-foreground",
              )}
            >
              {day}
              {list.length > 0 && (
                <span
                  className={cn(
                    "absolute bottom-1 size-1 rounded-full",
                    isSelected ? "bg-white" : upcoming ? "bg-brand" : "bg-gray-500",
                  )}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaCard({ data, loading }: { data: AgendaData | null; loading: boolean }) {
  const [range, setRange] = useState<"week" | "month">("week");
  const [selected, setSelected] = useState<number | null>(null);
  const horizon = (range === "week" ? 7 : 30) * 86_400_000;
  const list = !data
    ? []
    : selected !== null
      ? (data.days.get(selected) ?? [])
      : data.upcoming.filter((e) => e.startMs < data.nowMs + horizon);
  const shown = list.slice(0, 6);
  return (
    <section className={cn(card, "flex flex-col gap-5 p-5 sm:p-6")}>
      <CardHeader
        title="Agenda"
        description={selected !== null && data ? `Sessões de dia ${selected}.` : "Sessões marcadas."}
        action={<CornerLink label="Abrir agenda"><Link to="/calendar" /></CornerLink>}
      />
      {loading || !data ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <div className="grid gap-6 sm:grid-cols-[252px_minmax(0,1fr)]">
          <MiniMonth data={data} selected={selected} onSelect={setSelected} />
          <div className="flex min-w-0 flex-col gap-3">
            {selected === null ? (
              <Segmented
                label="Janela"
                value={range}
                onChange={setRange}
                options={[
                  { id: "week", label: "Semana" },
                  { id: "month", label: "Mês" },
                ]}
              />
            ) : (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-fit cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground"
              >
                ← Voltar às próximas
              </button>
            )}
            {shown.length === 0 ? (
              <div className="flex flex-col gap-2 rounded-lg bg-chip px-4 py-5">
                <p className="text-sm font-medium">
                  {range === "week" ? "Nada marcado para os próximos 7 dias" : "Nada marcado para os próximos 30 dias"}
                </p>
                {data.open.length > 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Sempre a receber: {data.open.map((o) => `${o.title} (${o.when.toLowerCase()})`).join(", ")}.
                  </p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">A data marca-se na etapa Agenda de cada webinar.</p>
                )}
              </div>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {shown.map((e) => {
                  const d = zoneParts(e.startMs, e.timezone);
                  const past = e.startMs < data.nowMs;
                  return (
                    <li key={`${e.webinarId}:${e.startMs}`}>
                      <Link
                        to="/webinars/$webinarId/edit"
                        params={{ webinarId: e.webinarId }}
                        search={{ step: "agenda" }}
                        className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[var(--hover-ghost)]"
                      >
                        <span
                          className={cn(
                            "flex size-11 shrink-0 flex-col items-center justify-center rounded-md leading-none",
                            past ? "bg-chip text-muted-foreground" : "bg-accent text-accent-700",
                          )}
                        >
                          <span className="text-xs font-medium uppercase">{WEEKDAYS_SHORT[d.weekday]}</span>
                          <span className="mt-0.5 text-[17px] font-semibold tabular-nums">{d.day}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium">{e.title}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {timeOf(e)} · {past ? "já aconteceu" : fromNow(e.startMs, data.nowMs)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {list.length > shown.length && (
                  <li className="px-2 pt-1 text-[12px] text-muted-foreground">
                    e mais {nf.format(list.length - shown.length)} na agenda
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Hoje ---------- */

export type TodayData = {
  inRoom: number;
  registered: number;
  liveNow: number;
  people: TodayPerson[];
  nowMs: number;
};

export function TodayCard({ data, loading }: { data: TodayData | null; loading: boolean }) {
  return (
    <section className={cn(card, "flex flex-col gap-5 p-5 sm:p-6")}>
      <CardHeader
        title="Participantes do dia"
        description="Quem entrou numa sala hoje."
        action={<CornerLink label="Participantes"><Link to="/participants" /></CornerLink>}
      />
      {loading || !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-32" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <p className="text-[40px] leading-none font-semibold tracking-[var(--tracking-display)] [font-variant-numeric:proportional-nums]">
                {nf.format(data.inRoom)}
              </p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {data.inRoom === 1 ? "pessoa na sala hoje" : "pessoas na sala hoje"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pb-0.5">
              <span className="rounded-pill bg-chip px-2.5 py-1 text-[12px]">
                <span className="font-semibold tabular-nums">{nf.format(data.registered)}</span>{" "}
                {data.registered === 1 ? "inscrição" : "inscrições"} hoje
              </span>
              {data.liveNow > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-live/10 px-2.5 py-1 text-[12px] text-live">
                  <span className="size-1.5 rounded-full bg-live" aria-hidden />
                  <span className="font-semibold tabular-nums">{nf.format(data.liveNow)}</span> agora
                </span>
              )}
            </div>
          </div>
          {data.people.length === 0 ? (
            <Empty title="Ainda ninguém entrou numa sala hoje">
              Quem entrar aparece aqui, com o webinar, o aparelho e de onde está a ver.
            </Empty>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {data.people.map((p) => {
                const Icon = p.device ? (DEVICE_ICON[p.device] ?? Monitor) : null;
                const row = (
                  <>
                    <Avatar name={p.name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{p.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {p.webinar}
                        {p.place && ` · ${p.place}`}
                      </span>
                    </span>
                    {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-label={p.device === "mobile" ? "Telemóvel" : "Computador"} />}
                    <time dateTime={p.at} className="w-16 shrink-0 text-right text-[12px] text-muted-foreground">
                      {fromNow(Date.parse(p.at), data.nowMs)}
                    </time>
                  </>
                );
                return (
                  <li key={p.key}>
                    {p.contactId ? (
                      <Link
                        to="/contacts"
                        search={{ contact: p.contactId }}
                        className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[var(--hover-ghost)]"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ---------- Webinars recentes ---------- */

export type RecentWebinar = {
  id: string;
  title: string;
  state: string;
  tone: "live" | "next" | "muted";
  when: string;
  image: HeroData["image"];
  stats: { registered: number; attended: number; buyers: number } | null;
};

function Poster({ image, title }: { image: HeroData["image"]; title: string }) {
  const [failed, setFailed] = useState(false);
  const poster = image.cover || posterFromUrl(image.video);
  const isFile = !!image.video && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(image.video);
  return (
    <div className="relative aspect-video overflow-hidden rounded-md bg-[#141414]">
      {!failed && poster ? (
        <img src={poster} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={() => setFailed(true)} />
      ) : !failed && isFile ? (
        <video
          src={`${image.video}#t=${Math.max(1, Math.round(image.at))}`}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex size-full items-end bg-[radial-gradient(90%_120%_at_90%_0%,rgba(232,68,12,.45),transparent_60%),#141414] p-3">
          <span className="line-clamp-2 text-[13px] leading-tight font-semibold text-white/90">{title}</span>
        </div>
      )}
    </div>
  );
}

export function RecentWebinars({ items, loading }: { items: RecentWebinar[] | null; loading: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-end justify-between gap-3 pt-2">
        <div>
          <h2 className="text-[18px] leading-7 font-semibold tracking-[var(--tracking-title)]">Webinars recentes</h2>
          <p className="text-[13px] text-muted-foreground">Os números de cada um, desde sempre.</p>
        </div>
        <CornerLink label="Ver todos"><Link to="/webinars" search={{ q: undefined }} /></CornerLink>
      </div>
      {loading || !items ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={cn(card, "p-5")}>
          <Empty title="Ainda sem webinars activos">Os rascunhos ficam na página Webinars até serem activados.</Empty>
        </div>
      ) : (
        // Telemóvel: uma fila que desliza, como as filas da Netflix. Tablet e computador: grelha.
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
          {items.map((w) => (
            <li key={w.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
              <Link
                to="/webinars/$webinarId/metrics"
                params={{ webinarId: w.id }}
                className={cn(card, "group flex h-full flex-col gap-3 p-2.5 transition-shadow hover:shadow-[var(--shadow-raised)]")}
              >
                <div className="relative">
                  <Poster image={w.image} title={w.title} />
                  <span
                    className={cn(
                      "absolute top-2 left-2 rounded-pill px-2 py-0.5 text-xs font-medium backdrop-blur",
                      w.tone === "live" ? "bg-live text-white" : w.tone === "next" ? "bg-white/90 text-foreground" : "bg-black/55 text-white",
                    )}
                  >
                    {w.state}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 px-1.5 pb-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{w.title}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{w.when}</p>
                  </div>
                  {w.stats === null ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                      {(
                        [
                          ["Inscritos", w.stats.registered],
                          ["Assistiram", w.stats.attended],
                          ["Compraram", w.stats.buyers],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="truncate text-xs text-muted-foreground">{label}</dt>
                          <dd className="text-[15px] font-semibold tabular-nums">{nf.format(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- O Painel inteiro ---------- */

export function DashboardView({
  hero,
  heroLoading,
  hasWebinars,
  onCopyLink,
  period,
  onPeriod,
  results,
  resultsLoading,
  resultsError,
  steps,
  mix,
  agenda,
  today,
  recent,
  abTests,
  imageOfWebinar,
}: {
  abTests?: AbTestSummary[] | undefined;
  imageOfWebinar?: ((webinarId: string) => HeroData["image"] | null) | undefined;
  hero: HeroData | null;
  heroLoading: boolean;
  hasWebinars: boolean;
  onCopyLink: (slug: string) => void;
  period: Period;
  onPeriod: (p: Period) => void;
  results: Results | null;
  resultsLoading: boolean;
  resultsError: boolean;
  steps: FunnelStep[] | null;
  mix: AudienceMix | null;
  agenda: AgendaData | null;
  today: TodayData | null;
  recent: RecentWebinar[] | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <HeroCarousel
        hero={hero}
        loading={heroLoading}
        hasWebinars={hasWebinars}
        onCopyLink={onCopyLink}
        abTests={abTests}
        imageOfWebinar={imageOfWebinar}
      />

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <AgendaCard data={agenda} loading={!agenda} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <TodayCard data={today} loading={!today} />
        </div>
      </div>

      <ResultsHeader period={period} onPeriod={onPeriod} />
      <ResultsCard results={results} loading={resultsLoading} error={resultsError} />
      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <FunnelCard steps={steps} loading={resultsLoading} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <AudienceCard mix={mix} loading={resultsLoading} />
        </div>
      </div>

      <RecentWebinars items={recent} loading={!recent} />
    </div>
  );
}
