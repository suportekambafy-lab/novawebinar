import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChartColumn,
  CircleAlert,
  Clock,
  Eye,
  Filter,
  Globe2,
  MapPin,
  Monitor,
  MonitorSmartphone,
  MousePointerClick,
  Radio,
  ShoppingBag,
  Smartphone,
  UserPlus,
  Users,
} from "lucide-react";
import worldMap from "@/assets/world-map.jpg";
import { Avatar, BarChart, EmptyState, ProgressRow, TintIcon } from "@/components/ds";
import { Funnel } from "@/components/funnel";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAudienceInsights } from "@/lib/audience-insights";
import type { DateRange, RangePreset } from "@/lib/date-range";
import { METRIC, type Analytics, type Person } from "@/lib/analytics";
import {
  REGIONS,
  audienceCenter,
  countryCodeOf,
  countryLabel,
  flagOf,
  groupByRegion,
  orthographic,
  wholeShares,
  type CountryGroup,
  type RegionGroup,
  type RegionKey,
} from "@/lib/analytics-geo";
import type { LiveNow, LiveSession, MinuteBucket, Spot } from "@/lib/analytics-live";
import type { LiveViewer } from "@/lib/live-presence";
import { watchLabel } from "@/lib/data";
import { moneyLabel } from "@/lib/webinar-metrics";
import type { CountryRevenue } from "@/lib/contact-countries";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("pt-PT");
const pf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });
const pct = (value: number) => `${Math.round(value)}%`;

/** A facturação num número: a primeira moeda em grande, as outras e os pagamentos por baixo (não cortam). */
function revenueFigure(
  revenue: { currency: string; amount: number }[],
  payments: number,
  none: string,
) {
  const [first, ...rest] = revenue.map(moneyLabel);
  const paid = payments
    ? `${nf.format(payments)} ${payments === 1 ? "pagamento aprovado" : "pagamentos aprovados"}`
    : none;
  return { value: first ?? "—", sub: rest.length ? `+ ${rest.join(" + ")} · ${paid}` : paid };
}

/* ---------- Tema do sistema ---------- */

/**
 * Escuro do Geist para uma zona da página. O painel só tem tema claro: aqui trocam-se as
 * variáveis que as classes usam (bg-card, text-foreground, bordas…) só dentro desta zona.
 */
export const DARK_VARS = {
  "--surface-card": "#0A0A0A",
  "--bg-canvas": "#000000",
  "--navy": "#EDEDED",
  "--text-secondary": "#A1A1A1",
  "--text-tertiary": "#8F8F8F",
  "--gray-100": "#1A1A1A",
  "--gray-150": "#1F1F1F",
  "--gray-250": "#2E2E2E",
  "--color-border": "#2E2E2E",
  "--border-card": "rgba(255,255,255,.1)",
  "--border-subtle": "rgba(255,255,255,.08)",
  // Dados e tintas no escuro (a paleta de dados é a mesma, validada também em #0A0A0A).
  "--chart-other": "#707070",
  "--chart-soft": "#63210B",
  "--chart-emphasis": "#F28E63",
  "--chart-emphasis-ink": "#0A0A0A",
  "--chart-track": "#25110A",
  "--tint-brand": "#2E130A",
  "--tint-brand-ink": "#F7B89C",
  "--tint-blue": "#081D34",
  "--tint-blue-ink": "#8EC5FF",
  "--tint-teal": "#0B2623",
  "--tint-teal-ink": "#5FD4C4",
  "--surface-tint": "#211916",
  "--primary": "#EDEDED",
  "--primary-foreground": "#0A0A0A",
  "--ds-gray-100": "#1A1A1A",
  "--ds-gray-200": "#1F1F1F",
  "--ds-gray-400": "#2E2E2E",
  "--ds-gray-500": "#454545",
  "--ds-gray-900": "#A1A1A1",
  "--ds-gray-1000": "#EDEDED",
  "--ds-gray-alpha-200": "rgba(255,255,255,.08)",
  colorScheme: "dark",
} as CSSProperties;

/** As variáveis do tema chegam também às janelas que abrem fora da zona (pop-ups). */
const ThemeVars = createContext<CSSProperties | undefined>(undefined);

export function ThemeZone({
  dark,
  className,
  children,
}: {
  dark: boolean;
  className?: string;
  children: ReactNode;
}) {
  const vars = dark ? DARK_VARS : undefined;
  return (
    <ThemeVars.Provider value={vars}>
      <div
        style={vars}
        className={cn(
          "text-foreground",
          dark && "-mx-1 rounded-[20px] bg-[var(--bg-canvas)] p-2 sm:mx-0 sm:p-3",
          className,
        )}
      >
        {children}
      </div>
    </ThemeVars.Provider>
  );
}

/* ---------- Peças ---------- */

export function Card({
  title,
  sub,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string;
  sub?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-card bg-card p-4 sm:p-6", className)}>
      <header className="mb-4 flex items-start justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-[15px] font-semibold leading-6 tracking-[var(--tracking-title)]">
            {Icon && <TintIcon icon={Icon} size={28} />}
            {title}
          </h2>
          {sub && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Mensagem de estado vazio dentro de um cartão: o que se passa e o que fazer. */
export function Quiet({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-muted px-4 py-8 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      {children && (
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  );
}

/** Duas partes de um todo (ao vivo e replay, telemóvel e computador) numa barra: a 1.ª em laranja, a 2.ª em azul. */
export function SplitBar({
  left,
  right,
  icons,
}: {
  left: { label: string; value: number };
  right: { label: string; value: number };
  icons?: [
    React.ComponentType<{ className?: string }>,
    React.ComponentType<{ className?: string }>,
  ];
}) {
  const [a, b] = wholeShares([left.value, right.value]);
  const total = left.value + right.value;
  const [IconA, IconB] = icons ?? [];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-chart-1" aria-hidden />
          {IconA && <IconA className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{left.label}</span>
          <strong className="font-semibold tabular-nums">{nf.format(left.value)}</strong>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <strong className="font-semibold tabular-nums">{nf.format(right.value)}</strong>
          <span className="truncate">{right.label}</span>
          {IconB && <IconB className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="size-2 shrink-0 rounded-full bg-chart-2" aria-hidden />
        </span>
      </div>
      <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {total > 0 ? (
          <>
            <span
              className="h-full rounded-full bg-chart-1 transition-[width] duration-500"
              style={{ width: `${a}%` }}
            />
            <span
              className="h-full flex-1 rounded-full bg-chart-2"
              style={{ display: b ? undefined : "none" }}
            />
          </>
        ) : (
          <span className="h-full flex-1 rounded-full bg-chart-track" />
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{total ? `${a}%` : "—"}</span>
        <span>{total ? `${b}%` : "—"}</span>
      </div>
    </div>
  );
}

/** Um número com o nome por cima e, se houver, o ícone num círculo tingido. */
export function Figure({
  label,
  value,
  sub,
  icon,
  loading,
  className,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }> | undefined;
  loading?: boolean | undefined;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {icon && <TintIcon icon={icon} className="mb-3" />}
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <strong className="mt-1.5 block truncate text-[26px] leading-none font-semibold tracking-[var(--tracking-display)] tabular-nums sm:text-[28px]">
          {value}
        </strong>
      )}
      {sub && !loading && (
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

/* ---------- Globo ---------- */

let landDots: Promise<[number, number][]> | null = null;

/** Pontos de terra a partir do mapa do mundo (equirretangular): só se lê uma vez. */
function loadLand() {
  landDots ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = 720;
      const h = 360;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return resolve([]);
      ctx.drawImage(img, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h).data;
      const dots: [number, number][] = [];
      const step = 2.2;
      for (let lat = -56; lat <= 80; lat += step) {
        const lonStep = step / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
        for (let lon = -180; lon < 180; lon += lonStep) {
          const x = Math.min(w - 1, Math.floor(((lon + 180) / 360) * w));
          const y = Math.min(h - 1, Math.floor(((90 - lat) / 180) * h));
          // Terra clara sobre mar escuro.
          if ((px[(y * w + x) * 4] ?? 0) > 48) dots.push([lat, lon]);
        }
      }
      resolve(dots);
    };
    img.onerror = () => resolve([]);
    img.src = worldMap;
  });
  return landDots;
}

const shortest = (delta: number) => ((((delta + 180) % 360) + 360) % 360) - 180;

/**
 * O globo da Vista ao vivo: pontos de terra, um marcador por sítio (laranja; verde se
 * alguém aí clicou na oferta) e a percentagem de cada região por cima. Roda devagar
 * quando não há ninguém, vira-se para a audiência quando há, e arrasta-se com o dedo.
 */
export function AudienceGlobe({
  spots,
  regions,
  focus,
  dark,
  className,
}: {
  spots: Spot[];
  regions: { key: RegionKey; label: string; share: number }[];
  focus: RegionKey | null;
  dark: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const props = useRef({ spots, regions, focus, dark });
  props.current = { spots, regions, focus, dark };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dots: [number, number][] = [];
    void loadLand().then((d) => (dots = d));
    const view = { lat: 12, lon: 10 };
    let drag: { x: number; y: number } | null = null;
    let userUntil = 0;
    let frame = 0;

    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      view.lon -= (e.clientX - drag.x) * 0.45;
      view.lat = Math.max(-60, Math.min(60, view.lat + (e.clientY - drag.y) * 0.45));
      drag = { x: e.clientX, y: e.clientY };
      userUntil = performance.now() + 5000;
    };
    const up = () => (drag = null);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const { spots, regions, focus, dark } = props.current;
      const size = canvas.clientWidth;
      if (!size) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // Para onde olhar: a região escolhida, o centro da audiência ou a rodar devagar.
      if (!drag && now > userUntil) {
        const target = focus
          ? REGIONS[focus]
          : audienceCenter(spots.map((s) => ({ lat: s.lat, lon: s.lon, weight: s.count })));
        if (target) {
          const k = still ? 1 : 0.06;
          view.lon += shortest(target.lon - view.lon) * k;
          view.lat += (Math.max(-50, Math.min(50, target.lat)) - view.lat) * k;
        } else if (!still) {
          view.lon += 0.06;
          view.lat += (12 - view.lat) * 0.02;
        }
      }

      const r = size / 2 - 1;
      const cx = size / 2;
      const cy = size / 2;
      const sphere = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
      sphere.addColorStop(0, dark ? "#1c1c1c" : "#ffffff");
      sphere.addColorStop(1, dark ? "#0b0b0b" : "#f1f1f1");
      ctx.fillStyle = sphere;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.08)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Terra em três faixas de profundidade: o que foge para a borda fica mais esbatido.
      const dot = Math.max(1, size / 260);
      ctx.fillStyle = dark ? "#8a8a8a" : "#7d7d7d";
      for (const [band, alpha] of [
        [0, 0.18],
        [0.35, 0.4],
        [0.7, 0.7],
      ] as const) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (const [lat, lon] of dots) {
          const p = orthographic(lat, lon, view.lat, view.lon);
          if (!p.visible || p.depth < band || p.depth >= band + 0.35 + (band === 0.7 ? 1 : 0))
            continue;
          const x = cx + p.x * r;
          const y = cy - p.y * r;
          ctx.moveTo(x + dot, y);
          ctx.arc(x, y, dot, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Marcadores, com um anel que pulsa.
      const max = Math.max(1, ...spots.map((s) => s.count));
      const pulse = still ? 0 : (now % 1800) / 1800;
      for (const s of spots) {
        const p = orthographic(s.lat, s.lon, view.lat, view.lon);
        if (!p.visible) continue;
        const x = cx + p.x * r;
        const y = cy - p.y * r;
        const radius = 3.5 + 6 * Math.sqrt(s.count / max);
        // As cores dos dados (--chart-1 e --chart-2): quem clicou na oferta fica a azul, como a «Oferta» da actividade.
        const color = s.clicked > 0 ? "#0072F5" : "#E8440C";
        ctx.globalAlpha = (1 - pulse) * 0.45 * p.depth;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius + pulse * 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35 + 0.65 * p.depth;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = dark ? "#0A0A0A" : "#ffffff";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // A percentagem de cada região, no sítio da região.
      ctx.font = `600 ${size < 280 ? 10 : 11}px "Geist Variable", system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      for (const region of regions) {
        if (!region.share) continue;
        const c = REGIONS[region.key];
        const p = orthographic(c.lat, c.lon, view.lat, view.lon);
        if (!p.visible || p.depth < 0.3) continue;
        const text = `${c.short} ${Math.round(region.share)}%`;
        const w = ctx.measureText(text).width + 14;
        const x = Math.max(2, Math.min(size - w - 2, cx + p.x * r - w / 2));
        const y = cy - p.y * r - 18;
        ctx.globalAlpha = Math.min(1, p.depth * 1.6);
        ctx.fillStyle = dark ? "rgba(237,237,237,.94)" : "rgba(23,23,23,.9)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y - 10, w, 20, 10);
        else ctx.rect(x, y - 10, w, 20);
        ctx.fill();
        ctx.fillStyle = dark ? "#0A0A0A" : "#ffffff";
        ctx.fillText(text, x + 7, y + 0.5);
      }
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  const people = spots.reduce((s, x) => s + x.count, 0);
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={
        people
          ? `Globo com ${people} ${people === 1 ? "pessoa" : "pessoas"} em ${spots.length} ${spots.length === 1 ? "sítio" : "sítios"}`
          : "Globo sem ninguém a ver neste momento"
      }
      className={cn(
        "aspect-square w-full cursor-grab touch-none select-none active:cursor-grabbing",
        className,
      )}
    />
  );
}

/* ---------- Regiões e países ---------- */

/**
 * As regiões com a percentagem e, por baixo, os países. Tocar numa região vira o globo
 * para lá; tocar num país abre o pop-up com o que se sabe dessa audiência.
 */
export function RegionBreakdown<T>({
  regions,
  selected,
  onSelect,
  details,
  unit,
}: {
  regions: RegionGroup<T>[];
  selected?: RegionKey | null;
  onSelect?: (key: RegionKey | null) => void;
  details: (country: CountryGroup<T>, region: RegionGroup<T>) => ReactNode;
  /** «na sala», «inscritos»: o que se está a contar. */
  unit: string;
}) {
  const vars = useContext(ThemeVars);
  return (
    <ul className="divide-y divide-[var(--border-subtle)]">
      {regions.map((region) => {
        const key = region.key === "outras" ? null : region.key;
        const active = key !== null && selected === key;
        return (
          <li key={region.key} className="py-3 first:pt-0 last:pb-0">
            <button
              type="button"
              disabled={!onSelect || key === null}
              onClick={() => onSelect?.(active ? null : key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md text-left outline-none focus-visible:ring-focus",
                onSelect && key !== null && "cursor-pointer",
              )}
              aria-pressed={onSelect ? active : undefined}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    active && "underline underline-offset-4",
                  )}
                >
                  {region.label}
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-chart-track">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      active ? "bg-chart-emphasis" : key === null ? "bg-chart-other" : "bg-chart-1",
                    )}
                    style={{ width: `${Math.max(2, region.share)}%` }}
                  />
                </span>
              </span>
              <span className="shrink-0 text-right">
                <strong className="block text-lg leading-none font-semibold tabular-nums">
                  {pct(region.share)}
                </strong>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {nf.format(region.count)} {unit}
                </span>
              </span>
            </button>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {region.countries.slice(0, 6).map((country) => (
                <Popover key={country.code ?? country.label}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-chip px-2.5 text-xs transition-colors hover:bg-[var(--gray-250)] data-[state=open]:bg-foreground data-[state=open]:text-[var(--surface-card)]"
                    >
                      {country.flag && <span aria-hidden>{country.flag}</span>}
                      <span className="truncate">{country.label}</span>
                      <span className="tabular-nums opacity-70">{nf.format(country.count)}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    style={vars}
                    align="start"
                    className="w-72 bg-card p-0 text-foreground"
                  >
                    <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
                      <span className="text-2xl leading-none" aria-hidden>
                        {country.flag || "🌐"}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-sm font-semibold">
                          {country.label}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          {region.label} · {pct(country.share)} de quem tem origem detectada
                        </span>
                      </span>
                    </div>
                    <div className="px-4 py-3">{details(country, region)}</div>
                  </PopoverContent>
                </Popover>
              ))}
              {region.countries.length > 6 && (
                <span className="inline-flex h-7 items-center px-1 text-xs text-muted-foreground">
                  +{region.countries.length - 6} países
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Um número de estado: na cor do estado quando há casos, na tinta do texto quando é zero. */
function Tone({ n, className }: { n: number; className: string }) {
  return <span className={cn(n > 0 && className)}>{nf.format(n)}</span>;
}

/** Linhas «nome — valor» dentro de um pop-up. */
export function DetailRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** As cidades de um grupo, da que tem mais pessoas para a que tem menos. */
export function topCities(rows: { city: string | null }[], limit = 3) {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.city) counts.set(r.city, (counts.get(r.city) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return "Sem cidade detectada";
  const shown = sorted.slice(0, limit).map(([city, n]) => `${city} (${n})`);
  return sorted.length > limit
    ? `${shown.join(", ")} e mais ${sorted.length - limit}`
    : shown.join(", ");
}

/* ---------- Vista ao vivo ---------- */

export type MomentItem = {
  id: string;
  who: string;
  text: string;
  at: string;
  kind: "entry" | "offer" | "sale" | "other";
};

export type LiveSessionItem = LiveSession & { badge: string; detail: string | null };

/** As cores dos dados: entradas 1 (laranja), oferta 2 (azul), compras 3 (verde-água), o resto sem destaque. */
const KIND_COLOR: Record<MomentItem["kind"], string> = {
  entry: "bg-chart-1",
  offer: "bg-chart-2",
  sale: "bg-chart-3",
  other: "bg-chart-other",
};

export function agoShort(iso: string, nowMs: number) {
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (s < 60) return "agora mesmo";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Barras minuto a minuto: entradas, oferta, compras e chat ou inscrições, empilhadas com 2px entre as partes. */
export function MinuteBars({ buckets }: { buckets: MinuteBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  return (
    <div>
      <div
        className="flex h-28 items-end gap-[3px]"
        role="img"
        aria-label="Actividade nos últimos 30 minutos, minuto a minuto"
      >
        {buckets.map((b) => (
          <div
            key={b.at}
            title={`${b.label}: ${b.entries} entradas, ${b.offer} na oferta, ${b.sales} compras, ${b.other} no chat ou inscrições`}
            className="flex h-full min-w-0 flex-1 flex-col justify-end gap-0.5"
          >
            {b.total === 0 ? (
              <span className="h-[3px] rounded-full bg-chart-track" />
            ) : (
              <>
                {b.other > 0 && (
                  <span
                    className={cn("rounded-[2px]", KIND_COLOR.other)}
                    style={{ height: `${(b.other / max) * 100}%` }}
                  />
                )}
                {b.sales > 0 && (
                  <span
                    className={cn("rounded-[2px]", KIND_COLOR.sale)}
                    style={{ height: `${(b.sales / max) * 100}%` }}
                  />
                )}
                {b.offer > 0 && (
                  <span
                    className={cn("rounded-[2px]", KIND_COLOR.offer)}
                    style={{ height: `${(b.offer / max) * 100}%` }}
                  />
                )}
                {b.entries > 0 && (
                  <span
                    className={cn("rounded-[2px]", KIND_COLOR.entry)}
                    style={{ height: `${(b.entries / max) * 100}%` }}
                  />
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{buckets[0]?.label}</span>
        <span>{buckets[Math.floor(buckets.length / 2)]?.label}</span>
        <span>agora</span>
      </div>
    </div>
  );
}

function Legend({ items }: { items: [string, string, number][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map(([label, color, value]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", color)} />
          {label}
          <strong className="font-semibold text-foreground tabular-nums">{nf.format(value)}</strong>
        </span>
      ))}
    </div>
  );
}

export type LiveBoardProps = {
  dark: boolean;
  nowMs: number;
  /** Só um webinar (o filtro do topo) ou todos. */
  scoped: boolean;
  now: LiveNow;
  viewers: LiveViewer[];
  spots: Spot[];
  sessions: LiveSessionItem[];
  /** A próxima sessão marcada, para quando não há nenhuma a decorrer. */
  nextSession: { title: string; when: string } | null;
  /** `failed`: a leitura falhou; o cartão diz isso em vez de «sem actividade». */
  activity: {
    buckets: MinuteBucket[];
    moments: MomentItem[];
    last: MomentItem | null;
    loading: boolean;
    failed?: boolean;
  };
  /** O mesmo resumo das Análises: hoje (ou este webinar). `note` diz o que se conta. */
  summary: {
    title: string;
    note: string;
    data: Analytics | undefined;
    loading: boolean;
    search: { webinar?: string | undefined; periodo?: RangePreset | undefined };
  };
};

/** A Vista ao vivo inteira, alimentada por props (a rota trata dos dados). */
export function LiveBoard(props: LiveBoardProps) {
  const { dark, now, viewers, spots, sessions, activity, summary, nowMs, scoped, nextSession } =
    props;
  const [focus, setFocus] = useState<RegionKey | null>(null);
  const { regions, unknown } = groupByRegion(viewers);
  const globeRegions = regions.flatMap((r) =>
    r.key === "outras" ? [] : [{ key: r.key, label: r.label, share: r.share }],
  );
  const s = summary.data?.summary;
  // Sem dados (a leitura falhou) mostra-se «—», nunca um zero que não foi contado.
  const count = (n: number | undefined) => (n === undefined ? "—" : nf.format(n));
  const windowTotals = activity.buckets.reduce(
    (t, b) => ({
      entries: t.entries + b.entries,
      offer: t.offer + b.offer,
      sales: t.sales + b.sales,
      other: t.other + b.other,
      total: t.total + b.total,
    }),
    { entries: 0, offer: 0, sales: 0, other: 0, total: 0 },
  );
  const quiet = windowTotals.total === 0;

  return (
    // As colunas seguem a largura do conteúdo (@container), não a do ecrã: com o menu aberto, o tablet tem ~500 px.
    <ThemeZone dark={dark} className="@container">
      <div className="grid gap-2 sm:gap-3 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Agora */}
        <Card
          title="Agora"
          icon={Radio}
          action={
            now.live > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-danger-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--live-red)] uppercase">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--live-red)] opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[var(--live-red)]" />
                </span>
                Em directo
              </span>
            ) : (
              <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {now.total ? "Só replay" : "Sala vazia"}
              </span>
            )
          }
        >
          <div className="flex items-end gap-3">
            <strong className="text-[64px] leading-[0.9] font-semibold tracking-[var(--tracking-display)] tabular-nums sm:text-[76px]">
              {nf.format(now.total)}
            </strong>
            <span className="pb-1.5 text-sm leading-snug text-muted-foreground">
              {now.total === 1 ? "pessoa" : "pessoas"} na sala
              <br />
              {scoped ? "deste webinar" : "em todas as salas"}
            </span>
          </div>

          {now.total === 0 ? (
            <Quiet title="Ninguém a ver neste momento" className="mt-5">
              Quando alguém entrar numa sala, aparece aqui na hora: de onde vê, em que aparelho e se
              clicou na oferta.
            </Quiet>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-tint px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Na oferta</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {now.onOffer === null ? "—" : nf.format(now.onOffer)}
                  </p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    {now.onOffer === null
                      ? "A sala ainda não envia este dado"
                      : "com a oferta no ecrã"}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-tint px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{METRIC.clicked}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {nf.format(now.clicked)}
                  </p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    {pct(now.total ? (now.clicked / now.total) * 100 : 0)} de quem está na sala
                  </p>
                </div>
              </div>
              <SplitBar
                left={{ label: METRIC.live, value: now.live }}
                right={{ label: METRIC.replay, value: now.replay }}
              />
              <SplitBar
                left={{ label: METRIC.mobile, value: now.mobile }}
                right={{ label: METRIC.desktop, value: now.desktop }}
                icons={[Smartphone, Monitor]}
              />
            </div>
          )}
        </Card>

        {/* De onde estão a ver */}
        <Card
          title="De onde estão a ver"
          icon={Globe2}
          sub={
            now.total === 0
              ? "Arraste o globo para o rodar."
              : `${nf.format(now.total - unknown.length)} com origem detectada${unknown.length ? ` · ${nf.format(unknown.length)} sem origem` : ""}`
          }
        >
          <div className="@container">
            <div className="grid items-center gap-5 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="relative mx-auto w-full max-w-[340px]">
                <AudienceGlobe spots={spots} regions={globeRegions} focus={focus} dark={dark} />
              </div>
              {regions.length ? (
                <RegionBreakdown
                  regions={regions}
                  selected={focus}
                  onSelect={setFocus}
                  unit="na sala"
                  details={(country) => {
                    const rows = country.rows;
                    const count = (test: (v: LiveViewer) => boolean) => rows.filter(test).length;
                    return (
                      <>
                        <DetailRows
                          rows={[
                            ["Na sala agora", nf.format(rows.length)],
                            [
                              `${METRIC.live} · ${METRIC.replay}`,
                              `${count((v) => v.mode === "live")} · ${count((v) => v.mode === "replay")}`,
                            ],
                            [
                              `${METRIC.mobile} · ${METRIC.desktop}`,
                              `${count((v) => v.device === "mobile")} · ${count((v) => v.device === "desktop")}`,
                            ],
                            [METRIC.clicked, nf.format(count((v) => v.checkout))],
                          ]}
                        />
                        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                          {topCities(rows)}
                        </p>
                      </>
                    );
                  }}
                />
              ) : (
                <Quiet
                  title={now.total ? "Ainda sem origem detectada" : "Sem público para mostrar"}
                >
                  {now.total
                    ? "A localização chega uns segundos depois da entrada. Se não chegar, o browser da pessoa bloqueou-a."
                    : "Com pessoas na sala, vê aqui a percentagem por região e, ao tocar num país, a audiência desse país."}
                </Quiet>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* O mesmo resumo das Análises */}
      <section className="mt-2 rounded-card bg-card p-4 sm:mt-3 sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[var(--tracking-title)]">
              {summary.title}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{summary.note}</p>
          </div>
          <Link
            to="/analytics"
            search={summary.search}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Abrir análises <ArrowUpRight className="size-3.5" />
          </Link>
        </header>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 @2xl:grid-cols-3 @5xl:grid-cols-5">
          <Figure
            label={METRIC.registered}
            icon={UserPlus}
            value={count(s?.registered)}
            loading={summary.loading}
          />
          <Figure
            label={METRIC.attended}
            icon={Eye}
            value={count(s?.attended)}
            sub={
              s?.registered ? `${pct((s.attended / s.registered) * 100)} dos inscritos` : undefined
            }
            loading={summary.loading}
          />
          <Figure
            label={METRIC.clicked}
            icon={MousePointerClick}
            value={count(s?.clicked)}
            sub={
              summary.data?.cta == null
                ? undefined
                : `${pct(summary.data.cta)} de quem viu a oferta`
            }
            loading={summary.loading}
          />
          <Figure
            label={METRIC.buyers}
            icon={ShoppingBag}
            value={count(s?.buyers)}
            sub={s?.attended ? `${METRIC.conversion} ${pf.format(s.conversion)}%` : undefined}
            loading={summary.loading}
          />
          <Figure
            label={METRIC.revenue}
            icon={Banknote}
            {...(summary.data
              ? revenueFigure(summary.data.revenue, summary.data.payments, "Sem vendas aprovadas")
              : { value: "—" })}
            loading={summary.loading}
            className="col-span-2 @5xl:col-span-1"
          />
        </div>
      </section>

      <div className="mt-2 grid gap-2 sm:mt-3 sm:gap-3 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* Actividade ao minuto */}
        <Card title="Actividade ao minuto" icon={Activity} sub="Últimos 30 minutos">
          {activity.loading ? (
            <Skeleton className="h-36 w-full" />
          ) : activity.failed ? (
            <Quiet title="Não foi possível ler a actividade">
              A página tenta de novo sozinha dentro de 15 segundos.
            </Quiet>
          ) : quiet ? (
            <Quiet title="Sem movimento nos últimos 30 minutos">
              {activity.last
                ? `Última actividade: ${activity.last.who} ${activity.last.text}, ${agoShort(activity.last.at, nowMs)}.`
                : "Ainda não há actividade registada. Entradas, cliques na oferta e compras aparecem aqui ao minuto."}
            </Quiet>
          ) : (
            <>
              <Legend
                items={[
                  ["Entradas", KIND_COLOR.entry, windowTotals.entries],
                  ["Oferta", KIND_COLOR.offer, windowTotals.offer],
                  ["Compras", KIND_COLOR.sale, windowTotals.sales],
                  ["Chat e inscrições", KIND_COLOR.other, windowTotals.other],
                ]}
              />
              <MinuteBars buckets={activity.buckets} />
            </>
          )}
          {activity.moments.length > 0 && (
            <ul className="mt-5 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {activity.moments.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={cn("size-2 shrink-0 rounded-full", KIND_COLOR[m.kind])} />
                  <span className="min-w-0 flex-1 truncate">
                    <strong className="font-medium">{m.who}</strong>{" "}
                    <span className="text-muted-foreground">{m.text}</span>
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {agoShort(m.at, nowMs)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Sessões a decorrer */}
        <Card
          title="Sessões a decorrer"
          icon={CalendarDays}
          sub={sessions.length ? `${sessions.length} com sala aberta` : undefined}
        >
          {sessions.length === 0 ? (
            <Quiet title="Nenhuma sessão a decorrer">
              {nextSession
                ? `A próxima: ${nextSession.title}, ${nextSession.when}.`
                : "Não há sessões marcadas."}
            </Quiet>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li key={session.webinarId}>
                  <Link
                    to="/live-view"
                    search={{ webinar: session.webinarId }}
                    className="block rounded-lg bg-surface-tint px-3.5 py-3 transition-colors hover:bg-tint-brand"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{session.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {session.badge}
                          {session.detail ? ` · ${session.detail}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <strong className="block text-xl leading-none font-semibold tabular-nums">
                          {nf.format(session.count)}
                        </strong>
                        <span className="text-xs text-muted-foreground">na sala</span>
                      </span>
                    </div>
                    {session.count > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                        {session.live} ao vivo · {session.replay} replay · {session.clicked}{" "}
                        {session.clicked === 1 ? "clicou" : "clicaram"} na oferta
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Sala vazia</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Público neste momento */}
      <Card
        title="Público neste momento"
        icon={Users}
        sub={
          viewers.length
            ? `${nf.format(viewers.length)} ${viewers.length === 1 ? "pessoa" : "pessoas"}, de quem entrou há menos tempo para quem está há mais`
            : undefined
        }
        className="mt-2 sm:mt-3"
      >
        {viewers.length === 0 ? (
          <Quiet title="Sala vazia">
            Ninguém nas salas agora. Quem entrar aparece aqui com o nome, o sítio e o aparelho.
          </Quiet>
        ) : (
          <ul className="grid gap-x-6 @xl:grid-cols-2 @5xl:grid-cols-3">
            {[...viewers]
              .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
              .slice(0, 60)
              .map((v) => {
                const code = countryCodeOf(v.countryCode, v.country);
                const where = [v.city, v.country && countryLabel(code, v.country)]
                  .filter(Boolean)
                  .join(", ");
                const DeviceIcon = v.device === "mobile" ? Smartphone : Monitor;
                return (
                  <li
                    key={v.key}
                    className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-2.5"
                  >
                    <Avatar name={v.name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{v.name}</span>
                      <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {flagOf(code) && <span aria-hidden>{flagOf(code)}</span>}
                        <span className="truncate">{where || "Origem desconhecida"}</span>
                        <span aria-hidden>·</span>
                        <DeviceIcon
                          className="size-3 shrink-0"
                          aria-label={v.device === "mobile" ? METRIC.mobile : METRIC.desktop}
                        />
                        <span>{v.mode === "replay" ? METRIC.replay : METRIC.live}</span>
                      </span>
                    </span>
                    {v.checkout ? (
                      // Azul: a cor da «Oferta» na actividade e de quem clicou, no globo.
                      <span className="shrink-0 rounded-full bg-tint-blue px-2 py-0.5 text-xs font-semibold text-tint-blue-ink">
                        Clicou
                      </span>
                    ) : (
                      <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {agoShort(v.joinedAt, nowMs)}
                      </time>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
        {viewers.length > 60 && (
          <p className="mt-3 text-xs text-muted-foreground">
            E mais {nf.format(viewers.length - 60)} pessoas.
          </p>
        )}
      </Card>
    </ThemeZone>
  );
}

/* ---------- Análises ---------- */

export type AnalyticsBoardProps = {
  data: Analytics | undefined;
  loading: boolean;
  /** Um webinar escolhido: a tabela por webinar dá lugar à ligação às métricas dele. */
  webinarId: string | undefined;
};

/** A página de Análises, alimentada por props. */
export function AnalyticsBoard({ data, loading, webinarId }: AnalyticsBoardProps) {
  if (!loading && !data) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Não foi possível carregar as análises"
        description="A leitura dos dados falhou. Recarregue a página daqui a pouco."
        action={
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        }
      />
    );
  }
  if (loading || !data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-card" />
      </div>
    );
  }
  const s = data.summary;
  if (s.registered === 0 && data.payments === 0) {
    return (
      <EmptyState
        icon={ChartColumn}
        title="Sem dados neste período"
        description="Ninguém se inscreveu nem comprou no período escolhido. Escolha outro período ou outro webinar, em cima."
      />
    );
  }
  const { regions, unknown } = groupByRegion(data.people);
  const attendedPeople = data.people.filter((p) => p.attended);
  // Em duas colunas (telemóvel, tablet com menu), Inscritos e Facturação ocupam a linha toda: o valor não é cortado.
  const tiles: {
    label: string;
    value: string;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
    wide?: boolean;
  }[] = [
    {
      label: METRIC.registered,
      icon: UserPlus,
      value: nf.format(s.registered),
      sub: `em ${nf.format(data.webinars.length)} ${data.webinars.length === 1 ? "webinar" : "webinars"}`,
      wide: true,
    },
    {
      label: METRIC.attended,
      icon: Eye,
      value: nf.format(s.attended),
      sub: s.registered ? `${pct((s.attended / s.registered) * 100)} dos inscritos` : "—",
    },
    {
      label: METRIC.averageWatch,
      icon: Clock,
      value: s.attended ? watchLabel(s.averageWatchSeconds) : "—",
      sub: "de quem assistiu",
    },
    {
      label: METRIC.ctaConversion,
      icon: MousePointerClick,
      value: data.cta === null ? "—" : `${pf.format(data.cta)}%`,
      sub:
        data.cta === null
          ? "Ninguém viu a oferta no período"
          : `${nf.format(s.clicked)} clicaram de ${nf.format(s.sawOffer)} que viram a oferta`,
    },
    {
      label: METRIC.buyers,
      icon: ShoppingBag,
      value: nf.format(s.buyers),
      sub: s.attended ? `${METRIC.conversion} ${pf.format(s.conversion)}% de quem assistiu` : "—",
    },
    {
      label: METRIC.revenue,
      icon: Banknote,
      ...revenueFigure(data.revenue, data.payments, "Sem vendas aprovadas no período"),
      wide: true,
    },
  ];
  const peak = Math.max(0, ...data.daily.days.map((d) => d.value));

  return (
    <div className="@container space-y-3">
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn(
              "min-w-0 rounded-card bg-card p-4 sm:p-5",
              t.wide && "col-span-2 @3xl:col-span-1",
            )}
          >
            <Figure label={t.label} value={t.value} sub={t.sub} icon={t.icon} />
          </div>
        ))}
      </div>

      <Card
        title="Funil de conversão"
        icon={Filter}
        sub="Cada pessoa conta uma vez por webinar; depois de «Assistiram», só conta quem assistiu."
      >
        <Funnel steps={data.funnel.map((s) => ({ label: s.label, value: s.value }))} />
      </Card>

      <div className="grid gap-3 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card
          title="Inscrições por dia"
          icon={Users}
          sub={
            data.daily.capped
              ? "Últimos 90 dias do período"
              : "Pessoas que se inscreveram em cada dia, uma vez por webinar"
          }
        >
          {peak > 0 ? (
            <>
              <BarChart
                data={data.daily.days.map((d) => ({
                  label: d.label,
                  value: d.value,
                  title: `${d.label}: ${nf.format(d.value)} inscrições`,
                }))}
                tag={nf.format(peak)}
                height={180}
                gap={data.daily.days.length > 45 ? 2 : 4}
                showLabels={false}
              />
              {/* Primeiro, meio e último dia, como na actividade ao minuto: no telemóvel as datas por barra ficavam cortadas. */}
              <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>{data.daily.days[0]?.label}</span>
                {data.daily.days.length > 2 && (
                  <span>{data.daily.days[Math.floor(data.daily.days.length / 2)]?.label}</span>
                )}
                <span>{data.daily.days.at(-1)?.label}</span>
              </div>
            </>
          ) : (
            <Quiet title="Sem inscrições no período" />
          )}
        </Card>

        <Card title="Como assistem" icon={MonitorSmartphone}>
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Quem assistiu</p>
              <SplitBar
                left={{ label: METRIC.live, value: s.attendedLive }}
                right={{ label: METRIC.replay, value: s.attendedReplay }}
              />
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Aparelho dos inscritos</p>
              <SplitBar
                left={{ label: METRIC.mobile, value: data.devices.mobile }}
                right={{ label: METRIC.desktop, value: data.devices.desktop }}
                icons={[Smartphone, Monitor]}
              />
              {data.devices.unknown > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {nf.format(data.devices.unknown)} sem aparelho registado (inscreveram-se fora da
                  sala).
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 @4xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card
          title="De onde vêm"
          icon={MapPin}
          sub={
            unknown.length
              ? `${nf.format(data.people.length - unknown.length)} com origem detectada · ${nf.format(unknown.length)} sem origem`
              : "Toque num país para ver a audiência desse país."
          }
        >
          {regions.length ? (
            <RegionBreakdown
              regions={regions}
              unit="inscritos"
              details={(country) => {
                const rows = country.rows as Person[];
                return (
                  <>
                    <DetailRows
                      rows={[
                        [METRIC.registered, nf.format(rows.length)],
                        [METRIC.attended, nf.format(rows.filter((p) => p.attended).length)],
                        [METRIC.clicked, nf.format(rows.filter((p) => p.clicked).length)],
                        [METRIC.buyers, nf.format(rows.filter((p) => p.purchased).length)],
                        [
                          `${METRIC.mobile} · ${METRIC.desktop}`,
                          `${rows.filter((p) => p.device === "mobile").length} · ${rows.filter((p) => p.device === "desktop").length}`,
                        ],
                      ]}
                    />
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {topCities(rows)}
                    </p>
                  </>
                );
              }}
            />
          ) : (
            <Quiet title="Ainda sem origens detectadas">
              A origem é detectada quando a pessoa entra na sala. Quem só se inscreveu ainda não tem
              origem.
            </Quiet>
          )}
        </Card>

        <Card
          title="Oferta e pagamento"
          icon={Activity}
          sub="Pessoas que assistiram, uma vez cada. Clicar não é pagar."
        >
          <DetailRows
            rows={[
              [METRIC.sawOffer, nf.format(s.sawOffer)],
              [METRIC.clicked, nf.format(s.clicked)],
              [METRIC.checkout, nf.format(s.checkout)],
              // Os estados com a sua cor quando há casos: compra a verde, falha a vermelho, abandono e reembolso em aviso.
              [METRIC.buyers, <Tone n={s.buyers} className="text-success" />],
              ["Pagamento falhado", <Tone n={s.paymentFailed} className="text-destructive" />],
              ["Abandonaram o pagamento", <Tone n={s.abandoned} className="text-warning" />],
              ["Reembolsados", <Tone n={s.refunded} className="text-warning" />],
            ]}
          />
          {attendedPeople.length > 0 && s.buyers === 0 && s.clicked > 0 && (
            <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {nf.format(s.clicked)} clicaram e ninguém comprou: confirme se a plataforma de vendas
              está ligada e a enviar as vendas.
            </p>
          )}
        </Card>
      </div>

      {data.payments > 0 && (
        <Card
          title="Facturação por país"
          icon={Banknote}
          sub="País de quem pagou, pelo IP da inscrição (como na Vista ao vivo). O telefone não conta: o número pode ser de outro país."
        >
          <CountryRevenueList rows={data.revenueByCountry} />
        </Card>
      )}

      {webinarId ? (
        <Link
          to="/webinars/$webinarId/metrics"
          params={{ webinarId }}
          className="flex items-center justify-between gap-3 rounded-card bg-card p-4 text-sm font-medium transition-colors hover:bg-chip sm:p-5"
        >
          Retenção, saídas e conversas deste webinar
          <ArrowUpRight className="size-4 shrink-0" />
        </Link>
      ) : (
        data.webinars.length > 0 && (
          <Card
            title="Por webinar"
            icon={Radio}
            sub="Do que teve mais inscritos para o que teve menos. Toque para abrir as métricas."
          >
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 pb-2 font-normal sm:pl-0">Webinar</th>
                    {[
                      METRIC.registered,
                      METRIC.attended,
                      "Clicaram",
                      METRIC.buyers,
                      METRIC.conversion,
                      METRIC.revenue,
                    ].map((h) => (
                      <th key={h} className="px-3 pb-2 text-right font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                  {data.webinars.map((w) => (
                    <tr key={w.webinarId} className="group">
                      <td className="max-w-[260px] py-2.5 pr-3 pl-4 sm:pl-0">
                        <Link
                          to="/webinars/$webinarId/metrics"
                          params={{ webinarId: w.webinarId }}
                          className="block truncate font-medium group-hover:underline"
                        >
                          {w.title}
                        </Link>
                      </td>
                      <td className="px-3 text-right tabular-nums">{nf.format(w.registered)}</td>
                      <td className="px-3 text-right tabular-nums">{nf.format(w.attended)}</td>
                      <td className="px-3 text-right tabular-nums">{nf.format(w.clicked)}</td>
                      <td className="px-3 text-right tabular-nums">{nf.format(w.buyers)}</td>
                      <td className="px-3 text-right tabular-nums">
                        {w.attended ? `${pf.format(w.conversion)}%` : "—"}
                      </td>
                      <td className="px-3 text-right whitespace-nowrap tabular-nums">
                        {w.revenue.length ? w.revenue.map(moneyLabel).join(" + ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}
    </div>
  );
}

/* ---------- Painéis de audiência das métricas de um webinar ---------- */

function Panel({
  title,
  icon: Icon,
  className,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-card bg-card p-5 sm:p-6", className)}>
      <header className="mb-5 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold leading-6 tracking-[var(--tracking-title)]">
          {title}
        </h2>
        <TintIcon icon={Icon} />
      </header>
      {children}
    </section>
  );
}

export function AudienceInsights({
  organizationId,
  webinarId,
  range,
  className,
}: {
  organizationId?: string | undefined;
  webinarId?: string | undefined;
  range?: DateRange;
  className?: string | undefined;
}) {
  const { data } = useAudienceInsights(organizationId, webinarId, range);
  const funnel = data?.funnel ?? [];
  const top = funnel[0]?.value ?? 0;
  const devices = data?.devices ?? { mobile: 0, desktop: 0, unknown: 0 };
  const deviceTotal = devices.mobile + devices.desktop + devices.unknown;
  const deviceData = [
    { name: "Telemóvel", value: devices.mobile, color: "var(--chart-1)" },
    { name: "Computador", value: devices.desktop, color: "var(--chart-2)" },
    { name: "Sem registo", value: devices.unknown, color: "var(--gray-250)" },
  ].filter((slice) => slice.value > 0);
  const mobileShare = deviceTotal ? Math.round((devices.mobile / deviceTotal) * 100) : 0;
  const scheduledDates = (data?.scheduled ?? []).map((key) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
  });
  const regionTop = data?.regions?.[0]?.value ?? 0;

  return (
    <div className={cn("space-y-4", className)}>
      <Panel title="Funil de conversão" icon={Filter}>
        {top > 0 ? (
          <Funnel steps={funnel.map((step) => ({ label: step.label, value: step.value }))} />
        ) : (
          <p className="text-sm text-muted-foreground">
            O funil enche-se quando as pessoas se inscrevem.
          </p>
        )}
      </Panel>

      <div className="grid min-w-0 gap-4 min-[1200px]:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <Panel title="Inscrições por dia" icon={Users}>
          {(data?.daily ?? []).some((d) => d.value > 0) ? (
            <BarChart
              data={(data?.daily ?? []).map((d) => ({
                ...d,
                title: `${d.label}: ${nf.format(d.value)} inscrições`,
              }))}
              tag={nf.format(Math.max(...(data?.daily ?? []).map((d) => d.value)))}
              height={190}
              gap={6}
              labelEvery={(data?.daily ?? []).length > 10 ? 3 : 1}
            />
          ) : (
            <p className="rounded-md bg-white px-4 py-10 text-center text-sm text-muted-foreground">
              Sem inscrições no período.
            </p>
          )}
        </Panel>

        <Panel title="Dispositivos" icon={MonitorSmartphone}>
          {deviceTotal === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda sem entradas registadas.</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_128px] sm:gap-4">
              <ul className="min-w-0 space-y-2 text-sm">
                {deviceData.map((slice) => (
                  <li key={slice.name} className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{slice.name}</span>
                    <span className="shrink-0 text-muted-foreground">{nf.format(slice.value)}</span>
                  </li>
                ))}
              </ul>
              <div className="relative size-28 shrink-0 sm:size-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deviceData}
                      dataKey="value"
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {deviceData.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <strong className="text-xl font-semibold tracking-[var(--tracking-title)]">
                    {mobileShare}%
                  </strong>
                  <span className="text-xs text-muted-foreground">Telemóvel</span>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid min-w-0 gap-4 min-[1200px]:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <Panel title="Participantes por região" icon={MapPin}>
          {(data?.regions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda sem origens registadas.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data!.regions.map((region, i) => (
                <ProgressRow
                  key={region.label}
                  label={region.label}
                  value={regionTop ? (region.value / regionTop) * 100 : 0}
                  display={nf.format(region.value)}
                  highlight={i === 0}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Eventos agendados" icon={CalendarDays}>
          <Calendar
            mode="single"
            className="mx-auto w-full max-w-[360px] overflow-hidden rounded-lg bg-white p-3 [--cell-size:2.25rem] sm:[--cell-size:2.5rem]"
            classNames={{
              root: "w-full",
              month: "flex w-full flex-col gap-3",
              month_grid: "w-full border-collapse",
              weekdays: "grid grid-cols-7",
              weekday: "flex h-9 items-center justify-center text-xs text-muted-foreground",
              week: "mt-1 grid grid-cols-7",
              day: "flex h-9 w-full items-center justify-center p-0 text-center sm:h-10",
            }}
            modifiers={{ agendado: scheduledDates }}
            modifiersClassNames={{
              agendado: "bg-tint-brand text-tint-brand-ink font-semibold rounded-full",
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

/**
 * Pagamentos aprovados por país. A barra mostra a parte da facturação quando tudo está numa
 * só moeda; com várias moedas (que não se somam), a parte dos pagamentos.
 */
function CountryRevenueList({ rows }: { rows: CountryRevenue[] }) {
  const currencies = new Set(rows.flatMap((r) => r.revenue.map((v) => v.currency)));
  const byAmount = currencies.size === 1;
  const weight = (r: CountryRevenue) => (byAmount ? (r.revenue[0]?.amount ?? 0) : r.payments);
  const shares = wholeShares(rows.map(weight));
  return (
    <ul className="divide-y">
      {rows.map((r, i) => (
        <li key={r.code ?? r.label} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline gap-3 text-sm">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {r.flag && <span aria-hidden>{r.flag}</span>}
              <span
                className={cn(
                  "truncate font-medium",
                  !r.code && !r.flag && "text-muted-foreground",
                )}
              >
                {r.label}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {r.revenue.length ? r.revenue.map(moneyLabel).join(" + ") : "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="block h-1.5 flex-1 rounded-full bg-chart-track" aria-hidden>
              <span
                className="block h-1.5 rounded-full bg-success"
                style={{ width: `${shares[i]}%` }}
              />
            </span>
            <span className="w-[13rem] shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {nf.format(r.buyers)} {r.buyers === 1 ? "comprador" : "compradores"} · {shares[i]}%{" "}
              {byAmount ? "da facturação" : "dos pagamentos"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
