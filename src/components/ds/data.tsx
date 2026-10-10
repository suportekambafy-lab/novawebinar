import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Componentes de dados da referência (novawebinar-design/components/data):
 * ProgressRow, Avatar e EmptyState. Só apresentação: recebem números já
 * calculados, nunca vão buscar dados.
 */

/** Barra de progresso: preenchimento no laranja claro da marca (o destaque no escuro) e valor dentro. */
export function ProgressRow({
  label,
  value,
  display,
  count,
  highlight,
  className,
}: {
  label: React.ReactNode;
  /** 0–100 */
  value: number;
  /** Texto dentro da barra (omissão: "value%"). */
  display?: React.ReactNode | undefined;
  count?: React.ReactNode | undefined;
  /** A linha em destaque: laranja escuro com texto branco (6.83:1). */
  highlight?: boolean | undefined;
  className?: string | undefined;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex items-center gap-2.5 text-xs", className)}>
      {count != null && <span className="min-w-6 text-sm tabular-nums">{count}</span>}
      <span
        className="w-24 shrink-0 truncate text-gray-700"
        title={typeof label === "string" ? label : undefined}
      >
        {label}
      </span>
      <div className="relative h-[26px] flex-1 overflow-hidden rounded-sm bg-white ring-1 ring-[var(--border-card)] ring-inset">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-sm transition-[width] duration-[var(--duration-base)] ease-standard",
            highlight ? "bg-chart-emphasis" : "bg-chart-soft",
          )}
          style={{ width: `${pct}%` }}
        />
        <span
          className={cn(
            "relative flex h-full items-center px-3 tabular-nums",
            highlight && pct > 18 ? "text-chart-emphasis-ink" : "text-foreground",
          )}
        >
          {display ?? `${Math.round(pct)}%`}
        </span>
      </div>
    </div>
  );
}

export function initialsOf(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Iniciais sobre uma tinta suave, sempre a mesma para o mesmo nome. */
const TINTS = ["bg-tint-brand text-tint-brand-ink", "bg-tint-blue text-tint-blue-ink", "bg-tint-teal text-tint-teal-ink"];
const tintOf = (name: string) => TINTS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TINTS.length];

/** Avatar circular: fotografia ou iniciais numa tinta da pessoa, anel da cor do canvas. */
export function Avatar({
  name,
  src,
  size = 40,
  ring = false,
  tone = "tint",
  className,
}: {
  name?: string | null | undefined;
  src?: string | null | undefined;
  size?: number | undefined;
  ring?: boolean | undefined;
  tone?: "tint" | "gray" | "navy" | "accent" | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      title={name ?? undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium",
        tone === "tint" && tintOf(name ?? ""),
        tone === "gray" && "bg-gray-250 text-foreground",
        tone === "navy" && "bg-navy text-white",
        tone === "accent" && "bg-primary text-white",
        ring && "ring-2 ring-canvas",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {src ? (
        <img src={src} alt={name ?? ""} className="size-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

/**
 * Estado vazio sobre cartão (o único do painel, 9/10): ícone num círculo de 48px, título de
 * 16px a 600, uma frase que diz porque está vazio e a acção para começar.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon | undefined;
  title: React.ReactNode;
  description?: React.ReactNode | undefined;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && <TintIcon icon={Icon} size={48} className="mb-4" />}
      <h2 className="text-base font-semibold tracking-[var(--tracking-title)]">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Ícone num círculo tingido (Nubank: fundo claro e o ícone na cor). 32px nas listas e
 * indicadores, 48px nos estados vazios. Na tinta da marca; os estados têm os seus selos.
 */
export function TintIcon({
  icon: Icon,
  size = 32,
  className,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  size?: 28 | 32 | 48 | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-tint-brand text-tint-brand-ink",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon className={size === 48 ? "size-6" : size === 32 ? "size-4" : "size-3.5"} strokeWidth={size === 48 ? 1.5 : 1.75} />
    </span>
  );
}
