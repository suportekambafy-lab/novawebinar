import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Navegação da referência (novawebinar-design/components/navigation):
 * NavTabs (pílulas), Breadcrumb, BottomNav e o cabeçalho de página.
 */

export type NavTabItem<T extends string = string> = {
  id: T;
  label: React.ReactNode;
  icon?: LucideIcon | undefined;
  /** Contador opcional à direita do rótulo. */
  count?: number | null | undefined;
};

/** Separadores secundários do Geist: 32px, raio 6, label-13; activo em cinza 200. */
export function NavTabs<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  items: NavTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md" | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex max-w-full items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(it.id)}
            className={cn(
              "relative touch-hit inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm transition-[background-color,color] duration-[var(--duration-fast)] ease-in-out focus-visible:outline-none focus-visible:ring-focus",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              it.icon && (size === "sm" ? "pl-2" : "pl-2.5"),
              active
                ? "bg-gray-150 text-foreground"
                : "text-gray-600 hover:bg-[var(--hover-ghost)] hover:text-foreground",
            )}
          >
            {it.icon && <it.icon className="size-[15px]" strokeWidth={1.5} />}
            {it.label}
            {it.count != null && (
              <span
                className={cn(
                  "ml-0.5 rounded-pill px-1.5 text-xs tabular-nums",
                  active ? "bg-white text-foreground" : "bg-gray-100 text-muted-foreground",
                )}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export type BackLink = {
  to: string;
  params?: Record<string, string> | undefined;
  label?: string | undefined;
};

export type Crumb = {
  label: React.ReactNode;
  to?: string | undefined;
  params?: Record<string, string>;
};

/** Migalhas pequenas em cinza; a última a azul-noite. */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav
      aria-label="Localização"
      className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="size-3 shrink-0 text-gray-400" strokeWidth={1.5} />}
            {it.to && !last ? (
              <Link
                to={it.to as never}
                params={it.params as never}
                className="truncate transition-colors hover:text-foreground"
              >
                {it.label}
              </Link>
            ) : (
              <span
                className={cn("truncate", last && "text-foreground")}
                aria-current={last ? "page" : undefined}
              >
                {it.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/**
 * Cabeçalho de página: botão voltar opcional, migalhas, título heading-32
 * (heading-24 no compacto) do Geist e a barra de ferramentas à direita.
 */
export function PageHeader({
  title,
  description,
  crumbs,
  back,
  toolbar,
  compact,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode | undefined;
  crumbs?: Crumb[] | undefined;
  /** Destino do botão voltar (círculo branco à esquerda do título). */
  back?: BackLink | undefined;
  toolbar?: React.ReactNode | undefined;
  compact?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        compact ? "mb-5" : "mb-7",
        className,
      )}
    >
      <div className="flex min-w-0 items-end gap-4">
        {back && (
          <Link
            to={back.to as never}
            params={back.params as never}
            aria-label={back.label ?? "Voltar"}
            title={back.label ?? "Voltar"}
            className="mb-0.5 hidden size-9 shrink-0 items-center justify-center rounded-sm bg-white text-foreground shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)] transition-colors hover:bg-gray-100 sm:inline-flex"
          >
            <ArrowLeft className="size-[17px]" strokeWidth={1.5} />
          </Link>
        )}
        <div className="min-w-0">
          {crumbs && crumbs.length > 0 && <Breadcrumb items={crumbs} className="mb-2" />}
          <h1
            className={cn(
              "truncate font-semibold tracking-[var(--tracking-heading)]",
              compact
                ? "text-[20px] leading-[26px] md:text-[24px] md:leading-8"
                : "text-[24px] leading-8 md:text-[32px] md:leading-10",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
    </div>
  );
}

export type RailItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };

/** Barra inferior no telemóvel: activo = pílula cinza com ícone laranja, como no menu. */
export function BottomNav({
  items,
  isActive,
  extra,
  className,
  hidden,
}: {
  items: RailItem[];
  isActive: (item: RailItem) => boolean;
  /** Botão final (ex.: "Menu") que não é uma ligação. */
  extra?: { label: string; icon: LucideIcon; onClick: () => void; active?: boolean };
  className?: string | undefined;
  hidden?: boolean | undefined;
}) {
  const cell = (active: boolean, Icon: LucideIcon, label: string) => (
    <>
      <span
        className={cn(
          "flex h-7 w-11 items-center justify-center rounded-pill transition-colors duration-[var(--duration-fast)]",
          active ? "bg-chip text-brand" : "bg-transparent",
        )}
      >
        <Icon className="size-5" strokeWidth={active ? 1.8 : 1.5} />
      </span>
      {/* Em ecrãs de 320–360px, «Automações» não pode empurrar as vizinhas. */}
      <span className="max-w-full truncate px-0.5">{label}</span>
    </>
  );
  const itemClass = (active: boolean) =>
    cn(
      "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] tracking-[-0.01em] transition-colors",
      active ? "font-medium text-foreground" : "text-muted-foreground",
    );
  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "glass fixed inset-x-0 bottom-0 z-30 items-stretch border-t border-hairline/70 px-1.5 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden",
        hidden ? "hidden" : "flex",
        className,
      )}
    >
      {items.map((it) => {
        const active = isActive(it);
        return (
          <Link
            key={it.to}
            to={it.to as never}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            {cell(active, it.icon, it.label)}
          </Link>
        );
      })}
      {extra && (
        <button type="button" onClick={extra.onClick} className={itemClass(Boolean(extra.active))}>
          {cell(Boolean(extra.active), extra.icon, extra.label)}
        </button>
      )}
    </nav>
  );
}
