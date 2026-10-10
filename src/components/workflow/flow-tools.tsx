/**
 * As ferramentas do fluxo: o menu das peças à esquerda e as definições de um elemento num painel à direita.
 * O menu (8/10/2026) arruma as peças pelo que o cliente quer fazer: gatilhos pelas três partes do lançamento,
 * grupos de WhatsApp, mensagens de aquecimento e de recuperação do modelo, mensagens por canal, condições,
 * páginas e tráfego. Abre-se uma secção de cada vez e recolhe-se numa barra de ícones. Nada entra sozinho no
 * fluxo: cada peça entra quando se clica nela ou se arrasta para o desenho.
 */
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eraser,
  FileText,
  Flame,
  GitFork,
  LifeBuoy,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  ShoppingBag,
  TriangleAlert,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { BrandLogo } from "@/components/ds/brand-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TRIGGER_GROUPS, TRIGGER_LABEL } from "@/lib/automations";
import { cn } from "@/lib/utils";
import {
  baseWorkflow,
  MODEL_GROUPS,
  ORIGIN_LABEL,
  ORIGIN_PLACEMENTS,
  ORIGINS,
  PAID_ORIGINS,
  triggerTitle,
  type CanvasNode,
  type OriginPlatform,
} from "@/lib/workflow";
import type { FlowComponent } from "./flow-map";
import { Glyph, LOOK, type Look } from "./flow-look";
import { PALETTE } from "./step-panel";

export const DND = "application/x-novawebinar-flow";

const SURFACE = "bg-white shadow-[0_8px_24px_rgba(16,24,40,0.12)] ring-1 ring-gray-200";

/* ---------- Catálogo: o que se pode pôr no fluxo ---------- */

/** `done`: uma automação do modelo que já está no fluxo; vê-se, mas não entra outra vez. */
type Item = { key: string; component: FlowComponent; label: string; hint?: string | undefined; tile: ReactNode; done?: boolean };
/** Um bloco dentro da secção: em grelha (logótipos) ou em lista. */
type Block = { title?: string | undefined; logo?: string | undefined; tag?: string | undefined; grid?: boolean; items: Item[] };
type Section = { key: string; label: string; icon: LucideIcon; tone: string; count?: number | undefined; blocks: Block[] };

const tile = (cls: string, icon: ReactNode) => <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", cls)}>{icon}</span>;
const logoTile = (name: string) => (
  <span className="flex size-9 items-center justify-center rounded-xl bg-white ring-1 ring-gray-200">
    <BrandLogo name={name} className="size-5" />
  </span>
);
const SEND_KEYS: [string, Look][] = [
  ["wa", "whatsapp"],
  ["email", "email"],
  ["sms", "sms"],
  ["webhook", "webhook"],
];

/** O logótipo que identifica um sítio de anúncio: a rede quando a tem; senão a plataforma. */
export const SITE_LOGO: Record<string, string> = {
  Facebook: "Facebook",
  Instagram: "Instagram",
  "Facebook e Instagram": "Meta",
  YouTube: "YouTube",
  TikTok: "TikTok",
  LinkedIn: "LinkedIn",
  Pesquisa: "Google",
  Display: "Google",
  "Lista própria": "Email",
  Parceiro: "Email",
  Indicação: "Orgânico",
};

const originItem = (source: OriginPlatform, placement?: string): Item => ({
  key: `origin-${source}-${placement ?? ""}`,
  component: { kind: "origin", source, ...(placement ? { placement } : {}) },
  label: placement ?? ORIGIN_LABEL[source],
  tile: logoTile(placement ? (SITE_LOGO[placement] ?? source) : source),
});

const SEND_HINT: Record<string, string> = {
  wa: "Só para a pessoa. Não sai entre as 22h e as 8h.",
  email: "Assunto e texto.",
  sms: "Texto curto. Não sai entre as 22h e as 8h.",
  webhook: "Para o Zapier, Make, n8n ou CRM.",
};
const LOGIC_HINT: Record<string, string> = {
  delay: "Depois do passo anterior.",
  before: "Antes da sessão de cada pessoa.",
  after: "Depois do fim da sessão.",
  until: "Dia e hora certos, iguais para todos.",
};
const ZAP = tile("bg-accent text-accent-700", <Zap className="size-4" strokeWidth={1.75} aria-hidden />);

/** As automações do modelo de um bloco (aquecimento, recuperação, depois da compra), uma a uma. */
function modelItems(groupKey: string, present: Set<string>): Item[] {
  const keys = MODEL_GROUPS.find((g) => g.key === groupKey)?.keys ?? [];
  return baseWorkflow()
    .filter((t) => keys.includes(t.key))
    .map((t) => {
      const n = t.steps.nodes.filter((s) => s.kind === "action").length;
      const done = present.has(t.name);
      return {
        key: `auto-${t.key}`,
        component: { kind: "automation" as const, key: t.key },
        label: t.name,
        hint: done ? "Já no fluxo" : `${n} ${n === 1 ? "mensagem" : "mensagens"} · ${triggerTitle(t.trigger_event)}`,
        tile: done ? tile("bg-success-soft text-success", <Check className="size-4" aria-hidden />) : ZAP,
        done,
      };
    });
}

function buildCatalog(groups: Extract<CanvasNode, { kind: "group" }>[], present: Set<string>): Section[] {
  const pal = (key: string) => PALETTE.find((p) => p.key === key)!;
  const logicItem = (p: (typeof PALETTE)[number]): Item => {
    const Icon = p.icon;
    return {
      key: p.key,
      component: { kind: "step", key: p.key },
      label: p.label,
      hint: LOGIC_HINT[p.key],
      tile: tile(p.group === "Tempo" ? "bg-gray-100 text-gray-700" : "bg-amber-50 text-amber-700", <Icon className="size-4" strokeWidth={1.75} aria-hidden />),
    };
  };
  const groupTile = tile(LOOK.whatsapp_group.tile, <Glyph look="whatsapp_group" />);
  return [
    {
      key: "gatilhos",
      label: "Gatilhos",
      icon: Zap,
      tone: "bg-accent text-accent-700",
      blocks: TRIGGER_GROUPS.map((g) => ({
        title: g.title,
        items: g.triggers.map((t) => ({ key: `t-${t}`, component: { kind: "trigger", trigger: t }, label: TRIGGER_LABEL[t], tile: ZAP })),
      })),
    },
    {
      key: "grupos",
      label: "Grupos de WhatsApp",
      icon: Users,
      tone: LOOK.whatsapp_group.tile,
      count: groups.length || undefined,
      blocks: [
        {
          items: [
            ...groups.map((g) => ({
              key: `g-${g.id}`,
              component: { kind: "group" as const, id: g.id },
              label: g.name,
              hint: g.url ? "Link de convite pronto" : "Falta o link de convite",
              tile: groupTile,
            })),
            { key: "group-new", component: { kind: "group" }, label: "Novo grupo", hint: "Nome e link de convite", tile: tile("bg-gray-100 text-gray-700", <Plus className="size-4" aria-hidden />) },
          ],
        },
        {
          title: "Mensagem",
          items: [{ key: "wa-group", component: { kind: "step", key: "wa-group" }, label: "Mensagem nos grupos", hint: "Escolha um ou vários grupos", tile: groupTile }],
        },
      ],
    },
    { key: "aquecimento", label: "Mensagens de aquecimento", icon: Flame, tone: "bg-amber-50 text-amber-700", blocks: [{ items: modelItems("aquecimento", present) }] },
    { key: "recuperacao", label: "Mensagens de recuperação", icon: LifeBuoy, tone: "bg-blue-50 text-blue-600", blocks: [{ items: modelItems("recuperacao", present) }] },
    { key: "clientes", label: "Depois da compra", icon: ShoppingBag, tone: "bg-emerald-50 text-emerald-700", blocks: [{ items: modelItems("clientes", present) }] },
    {
      key: "mensagens",
      label: "Mensagens",
      icon: Send,
      tone: "bg-gray-100 text-gray-700",
      blocks: [
        {
          items: SEND_KEYS.map(([key, look]) => ({
            key,
            component: { kind: "step", key },
            label: pal(key).label,
            hint: SEND_HINT[key],
            tile: tile(LOOK[look].tile, <Glyph look={look} />),
          })),
        },
      ],
    },
    {
      key: "condicoes",
      label: "Condições e esperas",
      icon: GitFork,
      tone: "bg-amber-50 text-amber-700",
      blocks: [
        { title: "Se… (Sim e Não)", items: PALETTE.filter((p) => p.group === "Condições").map(logicItem) },
        { title: "Esperar", items: PALETTE.filter((p) => p.group === "Tempo").map(logicItem) },
      ],
    },
    {
      key: "paginas",
      label: "Páginas",
      icon: FileText,
      tone: "bg-gray-100 text-gray-700",
      blocks: [
        {
          items: [
            {
              key: "page-outro",
              component: { kind: "page", pageType: "outro" },
              label: "Página",
              hint: "O tipo e o endereço escolhem-se no desenho",
              tile: tile("bg-gray-100 text-gray-700", <FileText className="size-4" strokeWidth={1.75} aria-hidden />),
            },
          ],
        },
      ],
    },
    {
      key: "trafego",
      label: "Tráfego",
      icon: Megaphone,
      tone: "bg-gray-100 text-gray-700",
      blocks: ORIGINS.map((p) => ({
        title: ORIGIN_LABEL[p],
        logo: p,
        tag: PAID_ORIGINS.has(p) ? "pago" : p === "Orgânico" ? "orgânico" : undefined,
        grid: true,
        items: ORIGIN_PLACEMENTS[p].length ? ORIGIN_PLACEMENTS[p].map((pl) => originItem(p, pl)) : [originItem(p)],
      })),
    },
  ];
}

/** Arrastar para o mapa (fica onde se larga) ou clicar (fica no sítio automático). */
const drag = (component: FlowComponent, onAdd: (c: FlowComponent) => void) => ({
  draggable: true,
  onDragStart: (e: DragEvent) => {
    e.dataTransfer.setData(DND, JSON.stringify(component));
    e.dataTransfer.effectAllowed = "move";
  },
  onClick: () => onAdd(component),
});

function Grid({ items, onAdd }: { items: Item[]; onAdd: (c: FlowComponent) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          title={it.label}
          {...drag(it.component, onAdd)}
          className="flex cursor-grab flex-col items-center gap-1 rounded-xl py-2 hover:bg-gray-50 active:cursor-grabbing"
        >
          {it.tile}
          <span className="w-full truncate text-center text-[11px]">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function List({ items, onAdd }: { items: Item[]; onAdd: (c: FlowComponent) => void }) {
  return (
    <div>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          disabled={it.done}
          {...(it.done ? {} : drag(it.component, onAdd))}
          className="flex min-h-11 w-full cursor-grab items-center gap-3 rounded-xl px-2 py-1.5 text-left enabled:hover:bg-gray-50 enabled:active:cursor-grabbing disabled:cursor-default"
        >
          {it.tile}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] leading-5">{it.label}</span>
            {it.hint && <span className="block truncate text-[12px] leading-4 text-muted-foreground">{it.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * O menu das peças. Aberto: as secções, uma aberta de cada vez. Recolhido: uma barra de ícones (no computador) e,
 * no telemóvel e no tablet, nada (o botão «Juntar peças» fica na lista). O estado vive no mapa.
 */
export function ToolsPanel({
  onAdd,
  groups,
  present,
  startEmpty,
  open,
  onOpenChange,
  section,
  onSection,
}: {
  onAdd: (c: FlowComponent) => void;
  groups: Extract<CanvasNode, { kind: "group" }>[];
  /** Os nomes das automações que já estão no fluxo. */
  present: Set<string>;
  startEmpty?: StartEmpty | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: string | null;
  onSection: (key: string | null) => void;
}) {
  const catalog = useMemo(() => buildCatalog(groups, present), [groups, present]);
  if (!open)
    return (
      <nav aria-label="Peças do fluxo" className={cn(SURFACE, "absolute top-3 left-3 z-10 hidden w-14 flex-col items-center gap-1 rounded-2xl py-2 lg:flex")}>
        <button type="button" title="Abrir as peças" aria-label="Abrir as peças" onClick={() => onOpenChange(true)} className="flex size-10 items-center justify-center rounded-xl hover:bg-gray-100">
          <PanelLeftOpen className="size-5" strokeWidth={1.75} aria-hidden />
        </button>
        <span className="my-1 h-px w-8 bg-gray-200" />
        {catalog.map((c) => (
          <button
            key={c.key}
            type="button"
            title={c.label}
            aria-label={c.label}
            onClick={() => {
              onSection(c.key);
              onOpenChange(true);
            }}
            className="flex size-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 hover:text-foreground"
          >
            <c.icon className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
        ))}
      </nav>
    );
  return (
    <div
      role="region"
      aria-label="Peças do fluxo"
      // Abaixo do computador ocupa o desenho todo, sem deixar ver a lista cortada à volta.
      className={cn(
        SURFACE,
        "absolute inset-y-0 left-0 z-20 flex w-full flex-col overflow-hidden rounded-card lg:top-3 lg:w-[320px] lg:bottom-auto lg:left-3 lg:max-h-[calc(100%-1.5rem)] lg:rounded-2xl",
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-100 pr-2 pl-4">
        <p className="flex-1 text-[15px] font-semibold">Peças do fluxo</p>
        <button type="button" title="Recolher" aria-label="Recolher as peças" onClick={() => onOpenChange(false)} className="flex size-10 items-center justify-center rounded-xl hover:bg-gray-100">
          <PanelLeftClose className="size-5 max-lg:hidden" strokeWidth={1.75} aria-hidden />
          <X className="size-5 lg:hidden" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {startEmpty && <StartEmptyCard {...startEmpty} className="mb-2" />}
        {catalog.map((c) => {
          const on = section === c.key;
          return (
            <section key={c.key}>
              <button
                type="button"
                aria-expanded={on}
                onClick={() => onSection(on ? null : c.key)}
                className={cn("flex h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-gray-50", on && "bg-gray-50")}
              >
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", c.tone)}>
                  <c.icon className="size-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{c.label}</span>
                {c.count ? <span className="text-xs tabular-nums text-muted-foreground">{c.count}</span> : null}
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", on && "rotate-180")} aria-hidden />
              </button>
              {on && (
                <div className="space-y-2 py-1 pl-2">
                  {c.blocks.map((b, i) => (
                    <div key={b.title ?? i}>
                      {b.title && (
                        <p className="flex items-center gap-1.5 px-2 pt-1 pb-1 text-[12px] font-medium text-muted-foreground">
                          {b.logo && <BrandLogo name={b.logo} className="size-3.5" />}
                          {b.title}
                          {b.tag && <span className="rounded-pill bg-gray-100 px-1.5 py-px text-[10px] font-normal">{b.tag}</span>}
                        </p>
                      )}
                      {b.grid ? <Grid items={b.items} onAdd={onAdd} /> : <List items={b.items} onAdd={onAdd} />}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export type StartEmpty = { count: number; onStart: () => void };

/** Um fluxo antigo trouxe o modelo: «Começar vazio» tira de uma vez as automações do modelo por mexer (arquivadas, com «Desfazer»). */
export function StartEmptyCard({ count, onStart, className }: StartEmpty & { className?: string }) {
  return (
    <div className={cn("rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200", className)}>
      <p className="text-[13px] leading-5">
        <b className="font-semibold">
          {count} {count === 1 ? "automação do modelo" : "automações do modelo"}
        </b>{" "}
        neste fluxo, desligadas e por mexer.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium ring-1 ring-gray-300 hover:bg-gray-100"
      >
        <Eraser className="size-4" aria-hidden /> Começar vazio
      </button>
    </div>
  );
}

/** «Usar modelo»: o cliente escolhe que automações do modelo entram. Entram todas desligadas; as que já estão no fluxo vêm desmarcadas. */
export function ModelDialog({
  open,
  busy,
  present = [],
  onClose,
  onApply,
}: {
  open: boolean;
  busy: boolean;
  /** Os nomes das automações que já estão no fluxo. */
  present?: string[];
  onClose: () => void;
  onApply: (keys: string[]) => void;
}) {
  const base = useMemo(baseWorkflow, []);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(base.filter((a) => !present.includes(a.name)).map((a) => a.key)));
  const toggle = (keys: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const k of keys) if (on) next.add(k);
      else next.delete(k);
      return next;
    });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Usar modelo</DialogTitle>
          <DialogDescription>Escolha o que entra. Tudo entra desligado: reveja e ligue no desenho.</DialogDescription>
        </DialogHeader>
        {/* A lista desliza; o botão de adicionar fica sempre à vista. */}
        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-auto px-1">
          {MODEL_GROUPS.map((g) => {
            const all = g.keys.every((k) => picked.has(k));
            return (
              <div key={g.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{g.title}</p>
                  <button type="button" onClick={() => toggle(g.keys, !all)} className="h-8 rounded-md px-2 text-xs font-medium text-primary hover:bg-gray-50">
                    {all ? "Nenhuma" : "Todas"}
                  </button>
                </div>
                <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
                  {base
                    .filter((a) => g.keys.includes(a.key))
                    .map((a) => {
                      const n = a.steps.nodes.filter((s) => s.kind === "action").length;
                      return (
                        <label key={a.key} className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                          <Checkbox checked={picked.has(a.key)} onCheckedChange={(v) => toggle([a.key], v === true)} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm">{a.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {present.includes(a.name) ? (
                                <span className="font-medium text-success">Já no fluxo</span>
                              ) : (
                                `${n} ${n === 1 ? "mensagem" : "mensagens"} · ${triggerTitle(a.trigger_event)}`
                              )}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || picked.size === 0} onClick={() => onApply([...picked])}>
            {busy ? "A adicionar…" : `Adicionar ${picked.size} ${picked.size === 1 ? "automação" : "automações"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ReadyCheck = { ok: boolean; label: string; onClick?: (() => void) | undefined };

/** «Pronto para ligar?» num só botão: o que falta abre-se numa lista, cada linha leva ao sítio onde se resolve. */
export function ReadyStatus({ checks }: { checks: ReadyCheck[] }) {
  const missing = checks.filter((c) => !c.ok).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-medium ring-1",
            missing ? "bg-warning-soft text-warning ring-warning/25" : "bg-success-soft text-success ring-success/25",
          )}
        >
          {missing ? <TriangleAlert className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {missing ? `${missing} por resolver` : "Pronto a ligar"}
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-[min(20rem,calc(100vw-2rem))] p-2">
        <p className="px-2 pt-1 pb-2 text-sm font-semibold">Pronto para ligar?</p>
        <ul>
          {checks.map((c) => (
            <li key={c.label}>
              <button
                type="button"
                disabled={!c.onClick}
                onClick={c.onClick}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm enabled:hover:bg-gray-50 disabled:cursor-default"
              >
                {c.ok ? <Check className="size-4 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />}
                <span className="min-w-0 flex-1">{c.label}</span>
                {c.onClick && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * As definições de um elemento. `docked`: painel encaixado à direita do mapa (o mapa continua a mexer);
 * sem mapa por trás (ex.: separador Configuração), uma janela.
 */
export function SettingsPanel({
  docked,
  title,
  kicker,
  onClose,
  children,
}: {
  docked: boolean;
  title: string;
  kicker?: string | undefined;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!docked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docked, onClose]);

  if (!docked)
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {kicker && <DialogDescription>{kicker}</DialogDescription>}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );

  return (
    <div role="dialog" aria-label={title} className={cn(SURFACE, "absolute top-3 right-3 bottom-3 z-30 flex w-[380px] max-w-[calc(100%-1.5rem)] flex-col rounded-2xl")}>
      <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          {kicker && <p className="truncate text-xs text-muted-foreground">{kicker}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-gray-100">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
    </div>
  );
}
