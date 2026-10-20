/**
 * O funil de conversão, com o desenho da página inicial: degraus em trapézio, cada um mais estreito e mais
 * escuro que o anterior (do bege ao laranja da marca), e à direita, entre dois degraus, quanto passou do
 * anterior. Os degraus alargam-se quando o funil chega ao ecrã; com «reduzir movimento», aparecem logo.
 * Serve as métricas do webinar, as Análises e o Painel: cada um dá os seus passos (rótulo e valor).
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type FunnelRow = { label: string; value: number };

const nf = new Intl.NumberFormat("pt-PT");

/** Os tons do funil, do mais claro ao laranja da marca, repartidos pelos degraus que houver. */
function tones(count: number): { bg: string; fg: string }[] {
  const scale = [
    { bg: "var(--accent-100)", fg: "var(--ds-gray-1000)" },
    { bg: "var(--accent-200)", fg: "var(--ds-gray-1000)" },
    { bg: "color-mix(in oklab, var(--accent-600) 55%, white)", fg: "#fff" },
    { bg: "color-mix(in oklab, var(--accent-600) 70%, white)", fg: "#fff" },
    { bg: "color-mix(in oklab, var(--accent-600) 88%, white)", fg: "#fff" },
    { bg: "var(--accent-600)", fg: "#fff" },
  ];
  if (count <= 1) return [scale[scale.length - 1]!];
  return Array.from(
    { length: count },
    (_, i) => scale[Math.round((i * (scale.length - 1)) / (count - 1))]!,
  );
}

export function Funnel({
  steps,
  className,
  /** O texto por baixo, quando há (ex.: «números do período»). */
  note,
}: {
  steps: FunnelRow[];
  className?: string | undefined;
  note?: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const top = steps[0]?.value ?? 0;
  const tone = tones(steps.length);
  // Larguras: o primeiro degrau a 100%, o último a 44%, a descer por igual (não pelo valor: com uma
  // queda grande o degrau ficava fino demais para o texto). A altura do degrau e o intervalo são fixos.
  const widthOf = (i: number) => (steps.length <= 1 ? 100 : 100 - (56 * i) / (steps.length - 1));
  const rates = steps.slice(1).map((s, i) => {
    const prev = steps[i]!.value;
    return prev > 0 ? Math.round((s.value / prev) * 100) : null;
  });

  return (
    <div
      ref={ref}
      className={cn(
        "mx-auto grid w-full max-w-[52rem] gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start",
        className,
      )}
    >
      <ol className="vt-funnel" aria-label="Funil de conversão">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="vt-step transition-[transform,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{
              width: `${widthOf(i)}%`,
              background: tone[i]!.bg,
              color: tone[i]!.fg,
              transform: shown ? "scaleX(1)" : "scaleX(.2)",
              opacity: shown ? 1 : 0,
              transitionDelay: `${i * 110}ms`,
            }}
            title={`${step.label}: ${nf.format(step.value)}${top ? ` · ${Math.round((step.value / top) * 100)}% do primeiro passo` : ""}`}
          >
            <span className="px-3 text-center text-[13px] font-medium leading-tight opacity-90">
              {step.label}
            </span>
            <span className="text-[20px] font-semibold leading-tight tabular-nums">
              {nf.format(step.value)}
            </span>
          </li>
        ))}
      </ol>
      {/* À direita, entre cada par de degraus, quanto passou do anterior (altura 76 + 6 de intervalo). */}
      {steps.length > 1 && (
        <ul
          className="hidden content-start gap-[62px] pt-[69px] sm:grid"
          aria-label="De um passo para o seguinte"
        >
          {rates.map((rate, i) => (
            <li
              key={steps[i + 1]!.label}
              className="whitespace-nowrap text-[13px] font-semibold text-accent-700 transition-opacity duration-500"
              style={{ opacity: shown ? 1 : 0, transitionDelay: `${400 + i * 110}ms` }}
            >
              {rate === null ? "—" : `${rate}% ${steps[i + 1]!.label.toLowerCase()}`}
            </li>
          ))}
        </ul>
      )}
      {/* No telemóvel, as mesmas percentagens numa linha por baixo. */}
      {steps.length > 1 && (
        <p className="text-[12px] text-muted-foreground sm:hidden">
          {rates
            .map(
              (rate, i) =>
                `${rate === null ? "—" : `${rate}%`} ${steps[i + 1]!.label.toLowerCase()}`,
            )
            .join(" · ")}
        </p>
      )}
      {note && <p className="text-[12px] text-muted-foreground sm:col-span-2">{note}</p>}
    </div>
  );
}
