import { Link } from "@tanstack/react-router";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE, statusOf } from "@/lib/ab-tests/model";
import { VERDICT_LABEL, formatMeasure, type Evaluation, type VariantMetrics } from "@/lib/ab-tests/stats";
import { cn } from "@/lib/utils";

/** Uma cor fixa por posição (A, B, C…): a mesma no gráfico, na tabela e na lista. Paleta validada para daltonismo. */
export const VARIANT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"] as const;
export const variantColor = (position: number) => VARIANT_COLORS[position % VARIANT_COLORS.length]!;

export function VariantDot({ position, className }: { position: number; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: variantColor(position) }} />;
}

export function AbStatusBadge({ status }: { status: string | null | undefined }) {
  const s = statusOf(status);
  return (
    <Badge variant={STATUS_TONE[s]}>
      {s === "active" ? <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden /> : null}
      {STATUS_LABEL[s]}
    </Badge>
  );
}

export const pct = (value: number, digits = 1) => `${(value * 100).toLocaleString("pt-PT", { maximumFractionDigits: digits })}%`;
export const ratio = (hits: number, n: number) => (n > 0 ? hits / n : 0);

/** O veredito do teste: a frase, a confiança e, sem dados, o que falta. */
export function VerdictCard({ evaluation, threshold, currency = "EUR" }: { evaluation: Evaluation; threshold: number; currency?: string }) {
  const { verdict, comparison, best, control, reasons } = evaluation;
  const tone =
    verdict === "consistent" ? "border-[#1D8A5E]/40 bg-[#1D8A5E]/5" : verdict === "trend" ? "border-amber-500/40 bg-amber-500/5" : "border-[var(--border-subtle)] bg-card";
  const confidence = comparison ? Math.round(comparison.confidence * 10) / 10 : 0;
  return (
    <section className={cn("rounded-card border p-5", tone)}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Veredito</p>
      <h2 className="mt-1 text-lg font-semibold">{VERDICT_LABEL[verdict]}</h2>
      {comparison && best && control ? (
        <p className="mt-2 text-sm text-muted-foreground">
          A variante <b className="text-foreground">{best.label}</b> está{" "}
          {Number.isFinite(comparison.lift) ? (
            <b className="text-foreground">{comparison.lift >= 0 ? "+" : ""}{pct(comparison.lift, 0)}</b>
          ) : (
            "à frente"
          )}{" "}
          face a {control.label} no objectivo. Confiança de <b className="text-foreground">{confidence}%</b>; o teste decide aos {threshold}%.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Sem diferença medível entre as variantes por agora.</p>
      )}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-chip" aria-hidden>
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.min(100, confidence)}%` }} />
      </div>
      {reasons.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : null}
      {evaluation.measures.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {evaluation.measures.map(({ variant, measure }) => (
            <div key={variant.id} className="rounded-md bg-background/60 p-3 ring-1 ring-[var(--border-subtle)]">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <VariantDot position={variant.position} /> Variante {variant.label}
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{formatMeasure(measure, currency)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * A retenção de cada variante ao longo do vídeo: percentagem de quem começou a ver que ainda estava em cada
 * ponto (0% a 100% do vídeo, de 5 em 5). Uma linha por variante, na cor dela; legenda sempre presente.
 */
export function RetentionChart({ variants }: { variants: VariantMetrics[] }) {
  const points = 21;
  const data = Array.from({ length: points }, (_, i) => {
    const row: Record<string, number | string> = { label: `${i * 5}%` };
    for (const v of variants) {
      const started = v.retention[0] ?? v.started;
      row[v.label] = started > 0 ? Math.round(((v.retention[i] ?? 0) / started) * 1000) / 10 : 0;
    }
    return row;
  });
  const empty = variants.every((v) => (v.retention[0] ?? v.started) === 0);
  if (empty) return <p className="rounded-md bg-chip/60 p-4 text-sm text-muted-foreground">A curva aparece quando alguém começar a ver em cada variante.</p>;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} width={36} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeOpacity: 0.4 }}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }}
            formatter={(value: number, name: string) => [`${value}% ainda a ver`, `Variante ${name}`]}
            labelFormatter={(label: string) => `Aos ${label} do vídeo`}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(value: string) => `Variante ${value}`} />
          {variants.map((v) => (
            <Line key={v.id} type="monotone" dataKey={v.label} stroke={variantColor(v.position)} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--popover)" }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A tabela A contra B: o que cada variante fez, linha a linha, com os números absolutos e as taxas. */
export function ComparisonTable({ variants, currency = "EUR" }: { variants: VariantMetrics[]; currency?: string }) {
  const money = (v: number) => {
    try {
      return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
    } catch {
      return `${Math.round(v)} ${currency}`;
    }
  };
  const rows: { label: string; cell: (v: VariantMetrics) => string }[] = [
    { label: "Visitantes", cell: (v) => String(v.visitors) },
    { label: "Inscritos", cell: (v) => `${v.participants} · ${pct(ratio(v.participants, v.visitors))}` },
    { label: "Começaram a ver", cell: (v) => `${v.started} · ${pct(ratio(v.started, v.participants))}` },
    { label: "Chegaram a metade", cell: (v) => `${v.p50} · ${pct(ratio(v.p50, v.started))}` },
    { label: "Chegaram ao pitch", cell: (v) => (v.pitch === null ? "sem minuto do pitch" : `${v.pitch} · ${pct(ratio(v.pitch, v.started))}`) },
    { label: "Viram a oferta", cell: (v) => `${v.offerViews} · ${pct(ratio(v.offerViews, v.participants))}` },
    { label: "Clicaram na oferta", cell: (v) => `${v.clicks} · ${pct(ratio(v.clicks, v.participants))}` },
    { label: "Compraram", cell: (v) => `${v.buyers} · ${pct(ratio(v.buyers, v.visitors))} dos visitantes` },
    { label: "Receita", cell: (v) => `${money(v.revenue)} · ${money(v.visitors > 0 ? v.revenue / v.visitors : 0)} por visitante` },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-normal">Momento</th>
            {variants.map((v) => (
              <th key={v.id} className="py-2 pr-4 font-normal">
                <span className="inline-flex items-center gap-1.5">
                  <VariantDot position={v.position} /> {v.label}
                  {v.webinarId ? (
                    <Link to="/webinars/$webinarId/edit" params={{ webinarId: v.webinarId }} className="truncate text-muted-foreground hover:underline">
                      · {v.webinarTitle || "webinar"}
                    </Link>
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[var(--border-subtle)]">
              <td className="py-2.5 pr-4 text-muted-foreground">{row.label}</td>
              {variants.map((v) => (
                <td key={v.id} className="py-2.5 pr-4 tabular-nums">
                  {row.cell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A divisão do tráfego: a fatia prevista de cada variante e a observada (quantos visitantes calharam em cada
 * uma). Com poucos visitantes as duas afastam-se; é normal.
 */
export function DistributionCard({ variants, slug, origin }: { variants: VariantMetrics[]; slug: string; origin: string }) {
  const total = variants.reduce((sum, v) => sum + v.visitors, 0);
  return (
    <section className="rounded-card bg-card p-5 sm:p-6">
      <h2 className="font-semibold">Divisão do tráfego</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A mesma pessoa, no mesmo navegador, vê sempre a mesma variante: é assim que o teste mede com rigor. Para ver as outras use os
        links de pré-visualização, que não contam como visitas.
      </p>
      <ul className="mt-4 space-y-3">
        {variants.map((v) => {
          const observed = total > 0 ? v.visitors / total : 0;
          return (
            <li key={v.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <VariantDot position={v.position} /> Variante {v.label}
                  {v.webinarTitle ? <span className="truncate text-muted-foreground">· {v.webinarTitle}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  prevista {v.traffic}% · observada {total > 0 ? pct(observed, 0) : "—"} ({v.visitors})
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-chip" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.round(observed * 100)}%`, background: variantColor(v.position) }} />
              </div>
              <a
                href={`${origin}/w/${slug}?variante=${encodeURIComponent(v.label)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[13px] text-primary hover:underline"
              >
                Pré-visualizar a variante {v.label}
              </a>
            </li>
          );
        })}
      </ul>
      {total > 0 && total < 50 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Com {total} visitantes a divisão ainda oscila; aproxima-se da prevista com algumas dezenas.</p>
      ) : null}
    </section>
  );
}

/** Visitantes novos por dia e por variante, nos últimos 14 dias. */
export function DailyChart({ days, variants }: { days: { day: string; counts: Record<string, number> }[]; variants: VariantMetrics[] }) {
  const data = days.map((d) => ({ label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7), ...d.counts }));
  const empty = days.every((d) => Object.values(d.counts).every((n) => n === 0));
  if (empty) return <p className="rounded-md bg-chip/60 p-4 text-sm text-muted-foreground">Ainda não houve visitantes nos últimos 14 dias.</p>;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeOpacity: 0.4 }}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }}
            formatter={(value: number, name: string) => [`${value} visitantes`, `Variante ${name}`]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(value: string) => `Variante ${value}`} />
          {variants.map((v) => (
            <Line key={v.id} type="monotone" dataKey={v.label} stroke={variantColor(v.position)} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--popover)" }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
