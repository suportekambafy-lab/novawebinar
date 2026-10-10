import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Gráficos da referência (novawebinar-design/components/charts).
 * Regras: sem grelha nem eixos, só rótulos em cinza secundário; as barras no
 * laranja claro da marca e a barra em destaque no laranja, com a etiqueta do
 * valor no laranja escuro (tokens --chart-*). Recebem séries já calculadas —
 * não inventam números.
 */

function ValueTag({ children, className, style }: { children: React.ReactNode; className?: string | undefined; style?: React.CSSProperties }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center whitespace-nowrap rounded-xs bg-chart-emphasis px-2 text-xs text-chart-emphasis-ink tabular-nums",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

export type BarDatum = { label: string; value: number; title?: string };

/** Barras em laranja claro; a barra em destaque em laranja, com a etiqueta do valor. */
export function BarChart({
  data,
  highlight,
  tag,
  height = 160,
  gap = 8,
  showLabels = true,
  labelEvery = 1,
  onSelect,
  className,
}: {
  data: BarDatum[];
  /** Índice da barra em destaque (omissão: a maior). */
  highlight?: number | null | undefined;
  tag?: React.ReactNode | undefined;
  height?: number | undefined;
  gap?: number | undefined;
  showLabels?: boolean | undefined;
  /** Mostrar só 1 em cada N rótulos (séries longas). */
  labelEvery?: number | undefined;
  onSelect?: ((index: number) => void) | undefined;
  className?: string | undefined;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hi =
    highlight === undefined
      ? data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0)
      : highlight;
  const tagRoom = tag != null ? 30 : 0;
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-end" style={{ gap, height }}>
        {data.map((d, i) => {
          const on = i === hi && d.value > 0;
          const h = d.value > 0 ? Math.max(8, (d.value / max) * (height - tagRoom)) : 4;
          return (
            <div
              key={i}
              className={cn("flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2", onSelect && "cursor-pointer")}
              onClick={onSelect ? () => onSelect(i) : undefined}
              title={d.title ?? `${d.label}: ${d.value.toLocaleString("pt-PT")}`}
            >
              {on && tag != null && <ValueTag>{tag}</ValueTag>}
              <div
                className={cn(
                  "w-full rounded-sm transition-[height] duration-[var(--duration-base)] ease-standard",
                  on ? "bg-chart-1" : d.value > 0 ? "bg-chart-soft" : "bg-chart-track",
                )}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="flex" style={{ gap }}>
          {data.map((d, i) => (
            <span
              key={i}
              className={cn(
                "min-w-0 flex-1 overflow-hidden text-center text-xs whitespace-nowrap text-muted-foreground",
                i === hi && "text-foreground",
              )}
            >
              {i % labelEvery === 0 || i === data.length - 1 ? d.label : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
