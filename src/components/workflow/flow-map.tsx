import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Focus,
  GitFork,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  MoveVertical,
  PlayCircle,
  Plus,
  Send as SendIcon,
  ShoppingCart,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import platformIcon from "@/assets/brand/novawebinar-icon.png";
import { BrandLogo } from "@/components/ds/brand-icons";
import { FLOW_CHANNEL, RunState } from "@/components/ds/flow";
import { conditionLabel, conditionsSentence, type Condition } from "@/lib/automations";
import { formatDateTime, type Automation, type AutomationStats, type RegistrationForm, type Workflow } from "@/lib/data";
import { cn } from "@/lib/utils";
import {
  audiences,
  negate,
  nodeTitle,
  originParts,
  originTitle,
  PAGE_TYPE_LABEL,
  PAID_ORIGINS,
  readSteps,
  stepLayout,
  triggerTitle,
  type Audience,
  type Canvas,
  type CanvasNode,
  type Channel,
  type LaidStep,
  type Orientation,
  type PageType,
  type Send,
} from "@/lib/workflow";
import { DND, StartEmptyCard, ToolsPanel, type StartEmpty } from "./flow-tools";
import { Glyph, LOOK, lookOf } from "./flow-look";

/* ---------- Eixos: os eventos canónicos por onde a jornada passa ---------- */

export type HubKey = "inscricao" | "webinar" | "fim" | "checkout" | "compra";

/** As partes do lançamento (GLOSSARY): quem chega, o dia do evento, o depois. Cada momento pertence a uma. */
export const PHASES = ["Novas pessoas", "No dia do evento", "Depois do evento"] as const;
/** A cor de cada parte, a mesma das etapas da jornada: antes (cinza), evento (azul-noite), depois (laranja). */
const PHASE_DOT = ["bg-gray-400", "bg-navy", "bg-primary"];

export const HUBS: { key: HubKey; label: string; phase: (typeof PHASES)[number]; icon: LucideIcon; triggers: string[]; addTrigger: string }[] = [
  { key: "inscricao", label: "Inscrição", phase: "Novas pessoas", icon: UserPlus, triggers: ["webinar_registered"], addTrigger: "webinar_registered" },
  {
    key: "webinar",
    label: "Webinar ao vivo",
    phase: "No dia do evento",
    icon: PlayCircle,
    triggers: ["webinar_session_started", "webinar_attended", "offer_viewed", "offer_clicked"],
    addTrigger: "webinar_session_started",
  },
  { key: "fim", label: "Fim da sessão", phase: "Depois do evento", icon: CalendarCheck, triggers: ["webinar_session_ended"], addTrigger: "webinar_session_ended" },
  {
    key: "checkout",
    label: "Checkout",
    phase: "Depois do evento",
    icon: CreditCard,
    triggers: ["checkout_started", "checkout_abandoned", "payment_failed"],
    addTrigger: "checkout_abandoned",
  },
  { key: "compra", label: "Compra", phase: "Depois do evento", icon: ShoppingCart, triggers: ["purchase_approved", "purchase_refunded"], addTrigger: "purchase_approved" },
];

export const CHANNEL_ICON: Record<Channel, LucideIcon> = {
  email: FLOW_CHANNEL.email.icon,
  whatsapp: FLOW_CHANNEL.whatsapp.icon,
  sms: FLOW_CHANNEL.sms.icon,
  webhook: FLOW_CHANNEL.webhook.icon,
};

export type JourneyCounts = {
  registered: number;
  entered: number;
  attended: number;
  checkout: number;
  purchased: number;
  failed: number;
  abandoned: number;
};

/* ---------- Linguagem visual do mapa (estilo ManyChat) ---------- */

const handleClass = "!size-2.5 !border-2 !border-gray-300 !bg-white";
/** Um ponto de ligação. Sem `id` é o da esquerda/direita (desenho horizontal); com `id` ("t" cima, "b" baixo, "l" esquerda) serve o desenho vertical. */
const Side = ({ type, position, top, id }: { type: "source" | "target"; position: Position; top?: number; id?: string }) => (
  <Handle id={id ?? null} type={type} position={position} className={handleClass} isConnectable={false} style={top === undefined ? undefined : { top }} />
);

// Medidas fixas dos cartões: a disposição precisa de saber a altura antes de desenhar.
const CARD_W = 260;
const HEADER_H = 56;
const WAIT_H = 28;
const SEND_H = 52;
const SEND_GAP = 6;
const PAD_B = 12;
const BRANCH_ROW_H = 36;
const BRANCH_GAP = 4;
const LANE_H = 84;

function stepHeight(n: LaidStep["node"], wait: boolean) {
  const top = (wait ? WAIT_H : 0) + HEADER_H + PAD_B;
  if (n.kind === "branch") return top + 2 * BRANCH_ROW_H + BRANCH_GAP;
  const k = Math.max(1, n.sends.length);
  return top + k * SEND_H + (k - 1) * SEND_GAP;
}

function Card({ children, className, onClick, dim }: { children: ReactNode; className?: string; onClick: () => void; dim?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative block rounded-2xl bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.06),0_1px_3px_rgba(16,24,40,0.1)] ring-1 ring-gray-200 transition-shadow hover:ring-2 hover:ring-[#3B82F6]/50",
        dim && "opacity-70",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Header({ tile, icon, kicker, title, right }: { tile: string; icon: ReactNode; kicker?: string | undefined; title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5" style={{ height: HEADER_H }}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tile)}>{icon}</span>
      <span className="min-w-0 flex-1">
        {kicker && <span className="block truncate text-[11px] leading-tight text-muted-foreground">{kicker}</span>}
        <span className="block truncate text-[14px] leading-tight font-medium">{title}</span>
      </span>
      {right}
    </div>
  );
}

function WaitStrip({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-gray-100 bg-gray-50 px-3.5 text-[11px] text-muted-foreground" style={{ height: WAIT_H }}>
      <Clock className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </div>
  );
}

/* ---------- Nós da jornada ---------- */

type OriginData = { source: string; placement?: string | undefined; onClick: () => void };
const NETWORK_LOGOS = new Set(["Facebook", "Instagram", "YouTube", "TikTok", "LinkedIn"]);
type PageData = { name: string; url: string; pageType: PageType; image?: string | null; stat?: string | undefined; onClick: () => void };
type GroupData = { name: string; onClick: () => void };
type HubData = {
  label: string;
  icon: LucideIcon;
  logo?: string | undefined;
  detail?: string | undefined;
  count: string;
  highlighted: boolean;
  /** Sem webinar escolhido: o momento convida a escolhê-lo. */
  pick?: (() => void) | undefined;
};

/** A plataforma manda (Meta, Google, TikTok); o sítio onde anuncia é um selo pequeno no canto e vai no título. */
function OriginNode({ data }: NodeProps<Node<OriginData>>) {
  const parts = originParts(data);
  const paid = PAID_ORIGINS.has(parts.platform);
  const kicker = `${paid ? "Tráfego pago" : "Tráfego"}${parts.placement ? "" : " · clique para dizer onde"}`;
  const icon = (
    <span className="relative flex">
      <BrandLogo name={parts.platform} className="size-[18px]" />
      {parts.placement && NETWORK_LOGOS.has(parts.placement) && (
        <span className="absolute -right-2.5 -bottom-2.5 flex size-4 items-center justify-center rounded-full bg-white ring-1 ring-gray-200">
          <BrandLogo name={parts.placement} className="size-2.5" />
        </span>
      )}
    </span>
  );
  return (
    <Card onClick={data.onClick} className="w-[220px]">
      <Header tile="bg-white ring-1 ring-gray-200" icon={icon} kicker={kicker} title={originTitle(data)} />
      <Side type="source" position={Position.Right} />
      <Side id="b" type="source" position={Position.Bottom} />
    </Card>
  );
}

function AddOriginNode({ data }: NodeProps<Node<{ onClick: () => void }>>) {
  return (
    <button
      type="button"
      onClick={data.onClick}
      className="flex w-[220px] items-center gap-2.5 rounded-2xl border border-dashed border-gray-300 px-3.5 text-[13px] text-muted-foreground transition-colors hover:border-[#3B82F6] hover:text-foreground"
      style={{ height: HEADER_H }}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-white ring-1 ring-gray-200">
        <Plus className="size-4" aria-hidden />
      </span>
      Origem do tráfego
    </button>
  );
}

/** Miniatura da página: a capa do webinar quando existe; senão, o esboço do tipo de página. */
function PagePreview({ type, image }: { type: PageType; image?: string | null | undefined }) {
  if (image) return <img src={image} alt="" className="size-full object-cover" />;
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-gray-50 px-6">
      {type === "obrigado" || type === "confirmacao" ? (
        <CheckCircle2 className="size-6 text-success" strokeWidth={1.5} aria-hidden />
      ) : type === "replay" ? (
        <PlayCircle className="size-6 text-gray-500" strokeWidth={1.5} aria-hidden />
      ) : (
        <span className="h-2 w-3/4 rounded-full bg-gray-300" />
      )}
      <span className="h-1.5 w-full rounded-full bg-gray-200" />
      <span className="h-1.5 w-2/3 rounded-full bg-gray-200" />
      {["inscricao", "vendas", "checkout", "upsell", "downsell"].includes(type) && <span className="mt-1 h-3 w-1/2 rounded-sm bg-primary" />}
    </div>
  );
}

function PageNode({ data }: NodeProps<Node<PageData>>) {
  return (
    <Card onClick={data.onClick} className="w-[220px]">
      <Side type="target" position={Position.Left} top={HEADER_H / 2} />
      <Header
        tile="bg-gray-100 text-gray-700"
        icon={<FileText className="size-4" strokeWidth={1.75} aria-hidden />}
        kicker={data.pageType === "outro" ? "Página · clique para dizer qual" : `Página · ${PAGE_TYPE_LABEL[data.pageType]}`}
        title={data.name}
      />
      <div className="mx-3 mb-3 h-28 overflow-hidden rounded-xl ring-1 ring-gray-200">
        <PagePreview type={data.pageType} image={data.image} />
      </div>
      {data.stat && <p className="-mt-1 px-3.5 pb-3 text-[11px] tabular-nums text-muted-foreground">{data.stat}</p>}
      <Side type="source" position={Position.Right} top={HEADER_H / 2} />
      <Side id="t" type="target" position={Position.Top} />
      <Side id="b" type="source" position={Position.Bottom} />
    </Card>
  );
}

function GroupNode({ data }: NodeProps<Node<GroupData>>) {
  return (
    <Card onClick={data.onClick} className="w-[220px]">
      <Side type="target" position={Position.Left} />
      <Header tile={LOOK.whatsapp_group.tile} icon={<Glyph look="whatsapp_group" />} kicker="Grupo de WhatsApp" title={data.name} />
      <Side type="source" position={Position.Right} />
      <Side id="t" type="target" position={Position.Top} />
      <Side id="b" type="source" position={Position.Bottom} />
    </Card>
  );
}

/** Um momento da jornada (inscrição, webinar, fim, checkout, compra): as automações penduram-se por baixo. */
function HubNode({ data }: NodeProps<Node<HubData>>) {
  const Icon = data.icon;
  return (
    <div
      className={cn(
        "w-[220px] rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_1px_3px_rgba(16,24,40,0.1)] ring-1 ring-gray-200",
        data.highlighted && "ring-2 ring-primary/50",
      )}
    >
      <Side type="target" position={Position.Left} top={HEADER_H / 2} />
      <Header
        tile="overflow-hidden bg-navy text-white"
        icon={data.logo ? <img src={data.logo} alt="" className="size-full" /> : <Icon className="size-4" strokeWidth={1.75} aria-hidden />}
        title={data.label}
      />
      {(data.detail || data.count || data.pick) && (
        <div className="space-y-0.5 px-3.5 pb-3 text-[11px] leading-tight">
          {data.detail && <p className="truncate">{data.detail}</p>}
          {data.count && <p className="truncate tabular-nums text-muted-foreground">{data.count}</p>}
          {data.pick && (
            <button type="button" onClick={data.pick} className="font-medium text-primary hover:underline">
              Escolher webinar
            </button>
          )}
        </div>
      )}
      <Side type="source" position={Position.Right} top={HEADER_H / 2} />
      <Handle id="down" type="source" position={Position.Bottom} className={handleClass} isConnectable={false} />
      <Side id="t" type="target" position={Position.Top} />
    </div>
  );
}

/** O rótulo de uma parte do lançamento, na espinha, antes do seu primeiro momento. */
function PhaseNode({ data }: NodeProps<Node<{ label: string }>>) {
  const i = PHASES.indexOf(data.label as (typeof PHASES)[number]);
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-pill bg-white px-4 text-[17px] font-semibold whitespace-nowrap shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-gray-200">
      <span className={cn("size-2.5 rounded-full", PHASE_DOT[i])} aria-hidden />
      {data.label}
    </span>
  );
}

/** O fluxo sem automações: começa-se por um gatilho do menu ou pelo modelo. Nada entra sozinho. */
function EmptyStart({ onOpenTools, onUseModel, className }: { onOpenTools: () => void; onUseModel?: (() => void) | undefined; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-center", className)}>
      <p className="text-[15px] font-semibold">O fluxo está vazio</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Junte um gatilho e as mensagens, ou comece pelo modelo.</p>
      <div className="mt-3 grid gap-2">
        <button type="button" onClick={onOpenTools} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-medium text-white hover:bg-navy/90">
          <Zap className="size-4" aria-hidden /> Escolher um gatilho
        </button>
        {onUseModel && (
          <button type="button" onClick={onUseModel} className="h-10 rounded-xl bg-white text-sm font-medium ring-1 ring-gray-200 hover:bg-gray-50">
            Usar modelo
          </button>
        )}
      </div>
    </div>
  );
}

type EmptyData = { onOpenTools: () => void; onUseModel?: (() => void) | undefined };
function EmptyNode({ data }: NodeProps<Node<EmptyData>>) {
  return (
    <div className="w-[280px]">
      <Side id="l" type="target" position={Position.Left} top={HEADER_H / 2} />
      <Handle type="target" position={Position.Top} className={handleClass} isConnectable={false} />
      <EmptyStart onOpenTools={data.onOpenTools} onUseModel={data.onUseModel} />
    </div>
  );
}

/* ---------- A automação no mapa: início, mensagens por canal, condições ---------- */

type LaneData = { automation: Automation; stats: AutomationStats; showTrigger: boolean; onOpen: () => void };
type StepData = { node: LaidStep["node"]; wait?: string | undefined; onOpen: () => void };

/** O início de cada automação (como o «Starting step» do ManyChat): quando entra e em que estado está. */
function LaneNode({ data }: NodeProps<Node<LaneData>>) {
  const a = data.automation;
  const s = data.stats;
  return (
    <Card onClick={data.onOpen} dim={!a.active} className="w-[260px]">
      <div style={{ height: LANE_H }}>
        <Handle type="target" position={Position.Top} className={handleClass} isConnectable={false} />
        <Side id="l" type="target" position={Position.Left} top={HEADER_H / 2} />
        <Header
          tile="bg-accent text-accent-700"
          icon={<Zap className="size-4" strokeWidth={1.75} aria-hidden />}
          kicker={data.showTrigger ? `Quando: ${triggerTitle(a.trigger_event)}` : undefined}
          title={a.name}
        />
        <div className="flex items-center justify-between gap-2 px-3.5">
          <p className="truncate text-[11px] tabular-nums text-muted-foreground">
            {s.pending > 0 && <span className="text-primary">{s.pending} em curso · </span>}
            {s.done} {s.done === 1 ? "feita" : "feitas"}
            {s.failed > 0 && <span className="text-destructive"> · {s.failed} {s.failed === 1 ? "falha" : "falhas"}</span>}
          </p>
          <RunState active={a.active} />
        </div>
        <Side type="source" position={Position.Right} top={HEADER_H / 2} />
      </div>
    </Card>
  );
}

/** Um envio dentro da mensagem: o canal (cor e ícone) e o início do que vai sair. */
function SendRow({ send }: { send: Send }) {
  const look = lookOf(send);
  const preview = (send.channel === "email" ? send.subject || send.message : send.message)?.trim();
  const title = look === "whatsapp_group" && send.group?.trim() ? `Grupo «${send.group.trim()}»` : LOOK[look].label;
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-gray-50 px-2.5" style={{ height: SEND_H }}>
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", LOOK[look].tile)}>
        <Glyph look={look} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] leading-4 font-medium">{title}</span>
        <span className={cn("block truncate text-[11px] leading-4", preview || look === "webhook" ? "text-muted-foreground" : "text-warning")}>
          {preview || (look === "webhook" ? "Para o seu Zapier, Make ou CRM" : "Mensagem por escrever")}
        </span>
      </span>
    </div>
  );
}

function MessageNode({ data }: NodeProps<Node<StepData>>) {
  const n = data.node;
  if (n.kind !== "action") return null;
  const top = (data.wait ? WAIT_H : 0) + HEADER_H / 2;
  return (
    <Card onClick={data.onOpen} className="w-[260px]">
      <Side type="target" position={Position.Left} top={top} />
      {data.wait && <WaitStrip text={data.wait} />}
      <Header tile="bg-gray-100 text-gray-700" icon={<SendIcon className="size-4" strokeWidth={1.75} aria-hidden />} kicker="Mensagem" title={nodeTitle(n)} />
      <div className="px-3" style={{ paddingBottom: PAD_B, display: "grid", gap: SEND_GAP }}>
        {n.sends.length === 0 && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 text-[11px] text-muted-foreground" style={{ height: SEND_H }}>
            Escolha o canal
          </div>
        )}
        {n.sends.map((s, i) => (
          <SendRow key={i} send={s} />
        ))}
      </div>
      <Side type="source" position={Position.Right} top={top} />
    </Card>
  );
}

/** Condição com uma saída por resposta, como no ManyChat: cada caminho sai da sua linha. */
function ConditionNode({ data }: NodeProps<Node<StepData>>) {
  const n = data.node;
  if (n.kind !== "branch") return null;
  const purchase = n.condition.fact === "purchased";
  const base = (data.wait ? WAIT_H : 0) + HEADER_H;
  const rows = [
    { id: "yes", label: conditionLabel(n.condition), answer: "Sim" },
    { id: "no", label: conditionLabel(negate(n.condition)), answer: "Não" },
  ];
  return (
    <Card onClick={data.onOpen} className="w-[260px]">
      <Side type="target" position={Position.Left} top={base - HEADER_H / 2} />
      {data.wait && <WaitStrip text={data.wait} />}
      <Header
        tile={purchase ? "bg-success-soft text-success" : "bg-amber-50 text-amber-700"}
        icon={purchase ? <DollarSign className="size-4" strokeWidth={2} aria-hidden /> : <GitFork className="size-4" strokeWidth={1.75} aria-hidden />}
        kicker="Condição"
        title={nodeTitle(n)}
      />
      <div className="px-3" style={{ paddingBottom: PAD_B, display: "grid", gap: BRANCH_GAP }}>
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 text-[12px]" style={{ height: BRANCH_ROW_H }}>
            <span className="truncate">{r.label}</span>
            <span className="text-[11px] text-muted-foreground">{r.answer}</span>
          </div>
        ))}
      </div>
      {rows.map((r, i) => (
        <Handle
          key={r.id}
          id={r.id}
          type="source"
          position={Position.Right}
          className={handleClass}
          isConnectable={false}
          style={{ top: base + i * (BRANCH_ROW_H + BRANCH_GAP) + BRANCH_ROW_H / 2 }}
        />
      ))}
    </Card>
  );
}

const nodeTypes = {
  origin: OriginNode,
  addOrigin: AddOriginNode,
  page: PageNode,
  waGroup: GroupNode,
  hub: HubNode,
  phase: PhaseNode,
  empty: EmptyNode,
  lane: LaneNode,
  message: MessageNode,
  condition: ConditionNode,
};

/* ---------- Disposição ---------- */

const COL = 300;
/** Cada automação: o início (260px) e, à direita, os passos em colunas; cada ramo numa linha. */
const STEP_COL = CARD_W + 90;
const LANE_GAP = 40;
const ROW_GAP = 28;
const LANE_TOP = 230;
/** Desenho vertical: as automações à direita da espinha, e a altura prevista de cada nó da espinha. */
const LANE_X = 300;
const SPINE_GAP = 56;
/** O espaço do rótulo de cada parte do lançamento, antes do seu primeiro momento. */
const PHASE_H = 56;
const NODE_H: Record<string, number> = { origin: 60, page: 206, waGroup: 60, hub: 100 };

/** O que se mostra no momento: as pessoas que lá chegaram. */
function hubCount(key: HubKey, c: JourneyCounts | null) {
  if (!c) return "";
  if (key === "inscricao") return `${c.registered} pessoas`;
  if (key === "webinar") return `${c.entered} entraram · ${c.attended} assistiram`;
  if (key === "fim") return `${c.registered - c.entered} não entraram`;
  if (key === "checkout") return `${c.checkout} iniciaram · ${c.failed} falharam`;
  return `${c.purchased} compraram`;
}

const pathsOf = (a: Automation) => audiences(readSteps(a.steps), (a.conditions ?? []) as Condition[]);
const line = (active: boolean) =>
  active ? { strokeWidth: 1.5, stroke: "#64748B" } : { strokeWidth: 1.5, stroke: "#CBD5E1", strokeDasharray: "5 5" };

export function buildFlow(input: {
  automations: Automation[];
  canvas: Canvas;
  forms: RegistrationForm[];
  webinar: Workflow["webinars"];
  counts: JourneyCounts | null;
  stats: (id: string) => AutomationStats;
  onOpenAutomation: (id: string) => void;
  onOpenStep: (automationId: string, nodeId: string) => void;
  onAddAutomation: (trigger: string) => void;
  onEditCanvasNode: (node: CanvasNode) => void;
  onOpenCapture: () => void;
  /** Sem webinar: o momento «Webinar ao vivo» leva à configuração. */
  onPickWebinar?: (() => void) | undefined;
  /** Fluxo vazio: abrir os gatilhos no menu, ou usar o modelo. */
  onOpenTools?: (() => void) | undefined;
  onUseModel?: (() => void) | undefined;
}) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const vertical = input.canvas.orientation !== "horizontal";
  const pages = input.canvas.nodes.filter((n): n is Extract<CanvasNode, { kind: "page" }> => n.kind === "page");
  const origins = input.canvas.nodes.filter((n): n is Extract<CanvasNode, { kind: "origin" }> => n.kind === "origin");
  const groups = input.canvas.nodes.filter((n): n is Extract<CanvasNode, { kind: "group" }> => n.kind === "group");
  const c = input.counts;
  const w = input.webinar;
  const cover = w?.registration_cover_url || w?.cover_url || null;
  const edge = (source: string, target: string, extra: Partial<Edge> = {}) =>
    edges.push({ id: `${source}->${target}${extra.sourceHandle ?? ""}`, source, target, type: "default", style: line(true), ...extra });
  // No desenho vertical a espinha liga por baixo e por cima; no horizontal, pela direita e pela esquerda.
  const down = (from: Node): Partial<Edge> => (vertical ? { sourceHandle: from.type === "hub" ? "down" : "b", targetHandle: "t" } : {});

  // A posição que a pessoa escolheu (arrastando) vale mais do que a disposição automática.
  const pos = (id: string, x: number, y: number) => input.canvas.positions[id] ?? { x, y };

  // A espinha, pela ordem de um lançamento, e as automações penduradas em cada momento. As posições calculam-se no fim, conforme o sentido.
  type Lane = { a: Automation; layout: ReturnType<typeof stepLayout>; waits: Map<string, string>; rowY: number[]; height: number; cols: number; showTrigger: boolean };
  // `row`: nós lado a lado no mesmo ponto da espinha (os grupos de WhatsApp correm em paralelo, não um depois do outro).
  // `phase`: a parte do lançamento que começa neste ponto da espinha.
  const spine: { node: Node; row: Node[]; lanes: Lane[]; phase?: string | undefined }[] = [];
  const place = (node: Node, row = [node], phase?: string) => {
    const entry = { node, row, lanes: [] as Lane[], phase };
    spine.push(entry);
    return entry;
  };
  /** Os nós lado a lado à volta do eixo da espinha: em x no desenho vertical, em y no horizontal. */
  const spread = (i: number, n: number, gap: number) => (i - (n - 1) / 2) * gap;

  // Origens: todas a convergir na página de inscrição; o "+" no fim.
  const originNodes: Node[] = origins.map((o) => ({
    id: `origin:${o.id}`,
    type: "origin",
    position: { x: 0, y: 0 },
    data: { source: o.source, placement: o.placement, onClick: () => input.onEditCanvasNode(o) } satisfies OriginData,
  }));
  originNodes.push({
    id: "origin:add",
    type: "addOrigin",
    position: { x: 0, y: 0 },
    data: { onClick: () => input.onEditCanvasNode({ id: `origem-${Date.now().toString(36)}`, kind: "origin", source: "Meta" }) },
  });

  // A página de inscrição: a do formulário ou, sem página própria, a do webinar na plataforma.
  const inscription = input.forms[0];
  place(
    {
      id: "page:inscricao",
      type: "page",
      position: { x: 0, y: 0 },
      data: {
        name: inscription?.page_name || "Página de inscrição",
        url: inscription?.page_url || (w ? `/w/${w.slug}` : ""),
        pageType: "inscricao",
        image: cover,
        stat: c ? `${c.registered} inscritos` : undefined,
        onClick: input.onOpenCapture,
      } satisfies PageData,
    },
    undefined,
    PHASES[0],
  );

  const pageNode = (p: Extract<CanvasNode, { kind: "page" }>) =>
    place({ id: `page:${p.id}`, type: "page", position: { x: 0, y: 0 }, data: { name: p.name, url: p.url, pageType: p.pageType, onClick: () => input.onEditCanvasNode(p) } satisfies PageData });
  const pagesOf = (type: PageType) => pages.filter((p) => p.pageType === type);

  pagesOf("confirmacao").forEach(pageNode);
  const groupNodes: Node[] = groups.map((g) => ({ id: `group:${g.id}`, type: "waGroup", position: { x: 0, y: 0 }, data: { name: g.name, onClick: () => input.onEditCanvasNode(g) } satisfies GroupData }));
  if (groupNodes.length) place(groupNodes[0]!, groupNodes);

  let phase: string = PHASES[0];
  for (const hub of HUBS) {
    if (hub.key === "checkout") [...pagesOf("vendas"), ...pagesOf("checkout")].forEach(pageNode);
    // O webinar configurado vê-se no momento: o ícone da plataforma, o título e a data.
    const live = hub.key === "webinar" && w;
    const starts = hub.phase !== phase;
    phase = hub.phase;
    const entry = place(
      {
        id: `hub:${hub.key}`,
        type: "hub",
        position: { x: 0, y: 0 },
        data: {
          label: hub.label,
          icon: hub.icon,
          logo: live ? platformIcon : undefined,
          detail: live
            ? [w.public_title || w.internal_name, w.scheduled_at && formatDateTime(w.scheduled_at)].filter(Boolean).join(" · ")
            : hub.key === "webinar" && !w
              ? "Por escolher: as horas contam a partir dele"
              : undefined,
          count: hubCount(hub.key, c),
          highlighted: hub.key === "webinar",
          pick: hub.key === "webinar" && !w ? input.onPickWebinar : undefined,
        } satisfies HubData,
      },
      undefined,
      starts ? hub.phase : undefined,
    );

    // As automações deste momento: o início e, à direita, os passos em colunas; cada ramo numa linha.
    for (const a of input.automations.filter((a) => hub.triggers.includes(a.trigger_event))) {
      const layout = stepLayout(readSteps(a.steps));
      const waits = new Map(layout.edges.filter((e) => e.wait).map((e) => [e.to, e.wait!]));
      // Cada linha (ramo) tem a altura do cartão mais alto que leva.
      const rowH = Array.from({ length: layout.rows }, (_, r): number => (r === 0 ? LANE_H : 0));
      for (const it of layout.items) rowH[it.row] = Math.max(rowH[it.row]!, stepHeight(it.node, waits.has(it.node.id)));
      const rowY = rowH.map((_, r) => rowH.slice(0, r).reduce((sum, h) => sum + h + ROW_GAP, 0));
      const cols = layout.items.length ? Math.max(...layout.items.map((i) => i.col)) + 1 : 0;
      // Num momento com um só gatilho, o «Quando» repete o momento: não se mostra.
      entry.lanes.push({ a, layout, waits, rowY, height: rowY.at(-1)! + rowH.at(-1)!, cols, showTrigger: hub.triggers.length > 1 });
    }

    if (hub.key === "fim") {
      pagesOf("replay").forEach(pageNode);
      // Replay ligado no webinar e sem página própria no fluxo: a da plataforma.
      if (w?.replay_enabled && !pagesOf("replay").length)
        place({
          id: "page:replay-plataforma",
          type: "page",
          position: { x: 0, y: 0 },
          data: {
            name: "Replay",
            url: `/w/${w.slug}?replay=1`,
            pageType: "replay",
            image: w.cover_url,
            onClick: () => window.open(`/w/${w.slug}?replay=1`, "_blank", "noopener"),
          } satisfies PageData,
        });
    }
    if (hub.key === "compra") [...pagesOf("upsell"), ...pagesOf("downsell"), ...pagesOf("obrigado")].forEach(pageNode);
  }
  pagesOf("outro").forEach(pageNode);

  /* ---- Posições ---- */

  const laneNodes = (lane: Lane, x: number, y: number, hubId: string) => {
    const { a } = lane;
    const at = pos(`auto:${a.id}`, x, y);
    const onOpen = () => input.onOpenAutomation(a.id);
    nodes.push({ id: `auto:${a.id}`, type: "lane", position: at, data: { automation: a, stats: input.stats(a.id), showTrigger: lane.showTrigger, onOpen } satisfies LaneData });
    edge(hubId, `auto:${a.id}`, { ...(vertical ? { targetHandle: "l" } : { sourceHandle: "down" }), type: "smoothstep", animated: a.active, style: line(a.active) });
    for (const it of lane.layout.items)
      nodes.push({
        id: `step:${a.id}:${it.node.id}`,
        type: it.node.kind === "branch" ? "condition" : "message",
        // Os passos seguem o início da automação, salvo se a pessoa os arrastou.
        position: pos(`step:${a.id}:${it.node.id}`, at.x + STEP_COL * (it.col + 1), at.y + lane.rowY[it.row]!),
        data: { node: it.node, wait: lane.waits.get(it.node.id), onOpen: () => input.onOpenStep(a.id, it.node.id) } satisfies StepData,
      });
    for (const e of lane.layout.edges)
      edges.push({
        id: `${a.id}:${e.from ?? "in"}->${e.to}:${e.handle ?? ""}`,
        source: e.from ? `step:${a.id}:${e.from}` : `auto:${a.id}`,
        target: `step:${a.id}:${e.to}`,
        ...(e.handle ? { sourceHandle: e.handle } : {}),
        type: "default",
        style: line(a.active),
      });
  };

  const phaseNode = (label: string, x: number, y: number) =>
    nodes.push({ id: `phase:${label}`, type: "phase", position: { x, y }, draggable: false, selectable: false, data: { label } });
  const column = originNodes.length;
  if (!vertical) {
    // Da esquerda para a direita: origens empilhadas, a espinha numa linha, as automações penduradas por baixo de cada momento.
    const originY = (i: number) => (i - (column - 1) / 2) * 72 + 30;
    originNodes.forEach((n, i) => nodes.push({ ...n, position: pos(n.id, 0, originY(i)) }));
    // As automações não se sobrepõem: cada uma desce até haver espaço livre na sua faixa horizontal.
    const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const fitLane = (x0: number, x1: number, height: number) => {
      let y = LANE_TOP;
      for (let moved = true; moved; ) {
        moved = false;
        for (const r of taken)
          if (x0 < r.x1 && r.x0 < x1 && y < r.y1 && r.y0 < y + height) {
            y = r.y1 + LANE_GAP;
            moved = true;
          }
      }
      taken.push({ x0, x1, y0: y, y1: y + height });
      return y;
    };
    spine.forEach((entry, i) => {
      const x = COL * (i + 1);
      if (entry.phase) phaseNode(entry.phase, x, spread(0, entry.row.length, 80) - PHASE_H);
      entry.row.forEach((n, j) => nodes.push({ ...n, position: pos(n.id, x, spread(j, entry.row.length, 80)) }));
      for (const lane of entry.lanes) {
        const x0 = x - (CARD_W - 220) / 2;
        laneNodes(lane, x0, fitLane(x0, x0 + STEP_COL * (lane.cols + 1), lane.height), entry.node.id);
      }
    });
  } else {
    // De cima para baixo (como no Sellflux): origens lado a lado no topo; cada momento numa linha, com as suas automações à direita.
    originNodes.forEach((n, i) => nodes.push({ ...n, position: pos(n.id, (i - (column - 1) / 2) * 240, 0) }));
    let y = 140;
    for (const entry of spine) {
      if (entry.phase) {
        phaseNode(entry.phase, 0, y);
        y += PHASE_H;
      }
      entry.row.forEach((n, j) => nodes.push({ ...n, position: pos(n.id, spread(j, entry.row.length, 240), y) }));
      let laneY = y;
      for (const lane of entry.lanes) {
        laneNodes(lane, LANE_X, laneY, entry.node.id);
        laneY += lane.height + LANE_GAP;
      }
      y = Math.max(y + (NODE_H[entry.node.type ?? "hub"] ?? 100), laneY) + SPINE_GAP;
    }
  }

  // Sem automações: o cartão para começar fica onde a primeira automação da inscrição ficaria.
  const inscricao = nodes.find((n) => n.id === "hub:inscricao");
  if (!input.automations.length && inscricao && input.onOpenTools) {
    const at = vertical ? { x: inscricao.position.x + LANE_X, y: inscricao.position.y } : { x: inscricao.position.x - 30, y: inscricao.position.y + LANE_TOP };
    nodes.push({ id: "empty", type: "empty", position: at, draggable: false, selectable: false, data: { onOpenTools: input.onOpenTools, onUseModel: input.onUseModel } satisfies EmptyData });
    edge("hub:inscricao", "empty", { ...(vertical ? { targetHandle: "l" } : { sourceHandle: "down" }), type: "smoothstep", style: line(false) });
  }

  for (const o of originNodes) if (o.id !== "origin:add") edge(o.id, "page:inscricao", vertical ? { sourceHandle: "b", targetHandle: "t" } : {});
  for (let i = 0; i < spine.length - 1; i += 1)
    for (const from of spine[i]!.row) for (const to of spine[i + 1]!.row) edge(from.id, to.id, down(from));
  return { nodes, edges };
}

/* ---------- Telemóvel: o mapa não cabe; as etapas de cima para baixo ---------- */

/** Ícone de um canal; o WhatsApp leva o logótipo da marca. */
function ChannelIcon({ channel }: { channel: Channel }) {
  if (channel === "whatsapp") return <BrandLogo name="WhatsApp" className="size-3.5" />;
  const Icon = CHANNEL_ICON[channel];
  return <Icon className="size-3.5" strokeWidth={1.5} aria-label={FLOW_CHANNEL[channel].label} />;
}

const MAX_PATHS = 3;

/** A automação em cartão: quando entra, quem recebe o quê (um caminho por linha) e o estado das execuções. */
function AutomationCard({
  automation: a,
  showTrigger,
  paths,
  stats,
  onOpen,
}: {
  automation: Automation;
  showTrigger: boolean;
  paths: Audience[];
  stats: AutomationStats;
  onOpen: () => void;
}) {
  return (
    <Card onClick={onOpen} dim={!a.active} className="w-full">
      <Header
        tile="bg-accent text-accent-700"
        icon={<Zap className="size-4" strokeWidth={1.75} aria-hidden />}
        kicker={showTrigger ? `Quando: ${triggerTitle(a.trigger_event)}` : undefined}
        title={a.name}
        right={<RunState active={a.active} />}
      />
      <div className="space-y-1 px-3 pb-3">
        {paths.length === 0 && <p className="text-[11px] text-muted-foreground">Sem mensagens</p>}
        {paths.slice(0, MAX_PATHS).map((p, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px]">{p.who.length ? conditionsSentence(p.who) : "Todos"}</span>
            <span className="flex items-center gap-1">
              {p.channels.map((ch) => (
                <ChannelIcon key={ch} channel={ch} />
              ))}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{p.messages} msg</span>
          </div>
        ))}
        {paths.length > MAX_PATHS && <p className="text-[11px] text-muted-foreground">+{paths.length - MAX_PATHS} caminhos</p>}
        <p className="pt-1 text-right text-[11px] tabular-nums text-muted-foreground">
          {stats.pending > 0 && <span className="text-primary">{stats.pending} em curso · </span>}
          {stats.done} {stats.done === 1 ? "feita" : "feitas"}
        </p>
      </div>
    </Card>
  );
}

/**
 * Telemóvel e tablet: as três partes do lançamento de cima para baixo, cada momento da jornada com as suas
 * automações e um botão claro para acrescentar outra. As peças abrem-se no botão «Juntar peças».
 */
function JourneyList(
  props: Omit<Parameters<typeof buildFlow>[0], "onOpenTools"> & { onOpenTools: (section?: string | null) => void; startEmpty?: StartEmpty | undefined },
) {
  const groups = props.canvas.nodes.filter((n): n is Extract<CanvasNode, { kind: "group" }> => n.kind === "group");
  return (
    <div className="h-full space-y-6 overflow-auto p-3 sm:p-4 lg:hidden">
      {props.startEmpty && <StartEmptyCard {...props.startEmpty} />}
      {props.automations.length ? (
        <button
          type="button"
          onClick={() => props.onOpenTools()}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-navy text-sm font-medium text-white hover:bg-navy/90"
        >
          <Plus className="size-4" aria-hidden /> Juntar peças
        </button>
      ) : (
        <EmptyStart onOpenTools={() => props.onOpenTools("gatilhos")} onUseModel={props.onUseModel} className="mx-auto max-w-sm" />
      )}
      {PHASES.map((phase) => (
        <section key={phase} className="space-y-3">
          <h3 className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{phase}</h3>
          {HUBS.filter((h) => h.phase === phase).map((hub) => {
            const Icon = hub.icon;
            const list = props.automations.filter((a) => hub.triggers.includes(a.trigger_event));
            return (
              <div key={hub.key} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-navy text-white">
                    <Icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-5 font-medium">{hub.label}</span>
                    <span className="block truncate text-[12px] tabular-nums text-muted-foreground">{hubCount(hub.key, props.counts) || "\u00a0"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => props.onAddAutomation(hub.addTrigger)}
                    aria-label={`Nova automação: ${hub.label}`}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 text-[13px] font-medium ring-1 ring-gray-200 hover:bg-gray-50"
                  >
                    <Plus className="size-4" aria-hidden /> Automação
                  </button>
                </div>
                {list.map((a) => (
                  <AutomationCard
                    key={a.id}
                    automation={a}
                    // Num momento com um só gatilho, o «Quando» repete o momento: não se mostra.
                    showTrigger={hub.triggers.length > 1}
                    paths={pathsOf(a)}
                    stats={props.stats(a.id)}
                    onOpen={() => props.onOpenAutomation(a.id)}
                  />
                ))}
              </div>
            );
          })}
          {phase === PHASES[0] && groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => props.onEditCanvasNode(g)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-white px-3 text-[13px] ring-1 ring-gray-200"
                >
                  <Glyph look="whatsapp_group" className="size-3.5 text-emerald-700" />
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/* ---------- Menu de componentes, pela ordem do lançamento ---------- */

export type XY = { x: number; y: number };
export type FlowComponent =
  | { kind: "automation"; key: string }
  | { kind: "page"; pageType: PageType }
  /** Com `id`: um grupo que já está no fluxo (abre as definições dele). */
  | { kind: "group"; id?: string | undefined }
  | { kind: "origin"; source: string; placement?: string | undefined }
  /** Um disparo, espera ou condição (chave da paleta): entra no fim de uma automação. */
  | { kind: "step"; key: string }
  /** Uma automação nova, vazia, que começa neste gatilho. */
  | { kind: "trigger"; trigger: string };

/* ---------- O mapa ---------- */

/** Vista inicial: legível, com o início da jornada à direita do menu das peças. */
const HOME_ZOOM = 0.8;
const HOME_LEFT = 360;
/** Com o menu recolhido, a barra de ícones ocupa menos. */
const HOME_LEFT_SLIM = 110;
const HOME_TOP = 76;
const TOOL = "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] text-gray-700 hover:bg-gray-100 hover:text-foreground";
const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

export function FlowMap(
  props: Parameters<typeof buildFlow>[0] & {
    onAddComponent: (component: FlowComponent, at?: XY, automationId?: string) => void;
    onMoveNodes: (moves: Record<string, XY>) => void;
    onResetLayout: () => void;
    /** Ecrã inteiro: o mapa ocupa a janela toda para se trabalhar à vontade. */
    full?: boolean | undefined;
    onToggleFull?: (() => void) | undefined;
    /** Nó a mostrar ao abrir (quem chega por uma ligação a uma automação). */
    focusId?: string | undefined;
    /** Sentido do desenho: de cima para baixo ou da esquerda para a direita. As posições arrastadas recomeçam. */
    onSetOrientation?: ((orientation: Orientation) => void) | undefined;
    /** Secção do menu aberta ao entrar (verificação visual). */
    initialSection?: string | undefined;
    /** Um fluxo antigo com automações do modelo por mexer: «Começar vazio» tira-as. */
    startEmpty?: StartEmpty | undefined;
  },
) {
  const [mounted, setMounted] = useState(false);
  // O menu das peças: aberto no computador, recolhido no telemóvel e no tablet (abre por cima da lista).
  const [toolsOpen, setToolsOpen] = useState(false);
  // Abre com as secções fechadas: vêem-se todas as peças de uma vez (grupos, aquecimento, recuperação…).
  const [section, setSection] = useState<string | null>(props.initialSection ?? null);
  useEffect(() => {
    setMounted(true);
    setToolsOpen(wide() || Boolean(props.initialSection));
  }, [props.initialSection]);
  const openTools = (key: string | null = null) => {
    setSection(key);
    setToolsOpen(true);
  };
  const built = useMemo(
    () => buildFlow({ ...props, onOpenTools: () => openTools("gatilhos") }),
    // openTools só usa setters estáveis.
    [props],
  );
  const vertical = props.canvas.orientation !== "horizontal";
  const groups = useMemo(
    () => props.canvas.nodes.filter((n): n is Extract<CanvasNode, { kind: "group" }> => n.kind === "group"),
    [props.canvas.nodes],
  );
  // As automações que já estão no fluxo, pelo nome: o menu e o modelo não as repetem.
  const present = useMemo(() => new Set(props.automations.map((a) => a.name)), [props.automations]);
  // Os nós movem-se com o rato; ao largar, a posição grava-se e volta pelo canvas.
  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setNodes(built.nodes);
  }, [built, setNodes]);
  const flow = useRef<ReactFlowInstance | null>(null);
  // A última automação onde se clicou: uma mensagem clicada no menu entra nela.
  const lastAutomation = useRef<string | undefined>(undefined);
  const automationOf = (nodeId: string | undefined) => (nodeId && /^(auto|step):/.test(nodeId) ? nodeId.split(":")[1] : undefined);
  // Abre legível no início da jornada, ao lado do menu; o resto vê-se a deslizar (roda do rato) ou a arrastar o fundo.
  const builtRef = useRef(built);
  builtRef.current = built;
  // Com o menu aberto ou recolhido em mente está a vista agora: abrir ou recolher desliza o desenho na mesma medida.
  const laidFor = useRef(false);
  const home = (duration = 300) => {
    const all = builtRef.current.nodes;
    if (!flow.current || !all.length) return;
    const left = Math.min(...all.map((n) => n.position.x));
    const top = Math.min(...all.map((n) => n.position.y));
    laidFor.current = toolsOpen;
    void flow.current.setViewport({ x: (toolsOpen ? HOME_LEFT : HOME_LEFT_SLIM) - left * HOME_ZOOM, y: HOME_TOP - top * HOME_ZOOM, zoom: HOME_ZOOM }, { duration });
  };
  // Recolher o menu no computador não deixa uma faixa vazia à esquerda, e abri-lo não tapa o desenho; o sítio onde se estava fica.
  useEffect(() => {
    if (!flow.current || laidFor.current === toolsOpen || !wide()) return;
    laidFor.current = toolsOpen;
    const vp = flow.current.getViewport();
    void flow.current.setViewport({ ...vp, x: vp.x + (toolsOpen ? 1 : -1) * (HOME_LEFT - HOME_LEFT_SLIM) }, { duration: 200 });
  }, [toolsOpen]);
  /** Volta ao início da jornada; com atraso quando as posições ainda estão a mudar. */
  const fit = (delay = 0) => window.setTimeout(() => home(), delay);
  // Um elemento novo (clicado no menu ou largado) fica à vista: o mapa desliza até ele.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(built.nodes.map((n) => n.id));
    const before = seen.current;
    seen.current = ids;
    if (!before) return;
    const added = built.nodes.filter((n) => !before.has(n.id) && n.id !== "origin:add" && n.id !== "empty").map((n) => ({ id: n.id }));
    if (!added.length) return;
    window.setTimeout(() => void flow.current?.fitView({ nodes: added, padding: 0.4, maxZoom: Math.max(0.9, flow.current?.getZoom() ?? 0), duration: 400 }), 120);
  }, [built]);
  // No telemóvel o menu tapa a lista: fecha-se depois de escolher, para se ver o que entrou.
  const add = (c: FlowComponent) => {
    props.onAddComponent(c, undefined, lastAutomation.current);
    if (!wide()) setToolsOpen(false);
  };
  if (!mounted) return <div className="h-full w-full animate-pulse rounded-card bg-chip/60" />;
  return (
    <>
      <div className="relative hidden h-full lg:block">
        <ReactFlow
          nodes={nodes}
          edges={built.edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onInit={(instance) => {
            flow.current = instance;
            home(0);
            const focus = props.focusId;
            if (focus) window.setTimeout(() => void instance.fitView({ nodes: [{ id: focus }], padding: 0.6, maxZoom: 0.9 }), 150);
          }}
          onNodeClick={(_, node) => {
            lastAutomation.current = automationOf(node.id) ?? lastAutomation.current;
          }}
          onNodeDragStart={() => {
            dragging.current = true;
          }}
          onNodeDragStop={(_, __, moved) => {
            dragging.current = false;
            props.onMoveNodes(Object.fromEntries(moved.map((n) => [n.id, n.position])));
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DND)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(DND);
            if (!raw || !flow.current) return;
            e.preventDefault();
            const at = flow.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            // Largado em cima de uma automação (início ou passo): é nela que entra.
            const hit = flow.current.getIntersectingNodes({ ...at, width: 1, height: 1 }).find((n) => automationOf(n.id));
            props.onAddComponent(JSON.parse(raw) as FlowComponent, at, automationOf(hit?.id));
          }}
          // A roda do rato desliza o desenho (como numa página); amplia-se com Ctrl/Cmd + roda, o toque de pinça ou os botões.
          panOnScroll
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          minZoom={0.35}
          maxZoom={1.5}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          className="rounded-card bg-[#F7F8FA]"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#D5D9E0" />
          <Controls showInteractive={false} position="bottom-right" className="!overflow-hidden !rounded-xl !border-0 !shadow-pop" />
        </ReactFlow>
        {/* As ferramentas do desenho numa só barra: sentido, centrar, organizar e ecrã inteiro. */}
        <div role="toolbar" aria-label="Desenho" className="absolute top-3 right-3 z-10 flex h-10 items-center gap-0.5 rounded-xl bg-white p-1 shadow-pop ring-1 ring-gray-200">
          {props.onSetOrientation &&
            (
              [
                ["vertical", MoveVertical, "De cima para baixo"],
                ["horizontal", MoveHorizontal, "Da esquerda para a direita"],
              ] as const
            ).map(([o, Icon, label]) => (
              <button
                key={o}
                type="button"
                aria-pressed={vertical === (o === "vertical")}
                title={label}
                aria-label={label}
                onClick={() => {
                  props.onSetOrientation?.(o);
                  fit(350);
                }}
                className={cn(TOOL, vertical === (o === "vertical") && "bg-gray-100 text-foreground")}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />
          <button type="button" onClick={() => fit()} title="Centrar o desenho" aria-label="Centrar o desenho" className={TOOL}>
            <Focus className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              props.onResetLayout();
              fit(350);
            }}
            title="Volta a pôr tudo no sítio automático"
            className={cn(TOOL, "px-2.5")}
          >
            Organizar
          </button>
          {props.onToggleFull && (
            <button
              type="button"
              onClick={props.onToggleFull}
              title={props.full ? "Sair do ecrã inteiro (Esc)" : "Ecrã inteiro"}
              aria-label={props.full ? "Sair do ecrã inteiro" : "Ecrã inteiro"}
              className={TOOL}
            >
              {props.full ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
            </button>
          )}
        </div>
      </div>
      <JourneyList
        {...props}
        onOpenTools={openTools}
        onOpenAutomation={(id) => {
          lastAutomation.current = id;
          props.onOpenAutomation(id);
        }}
      />
      <ToolsPanel
        onAdd={add}
        groups={groups}
        present={present}
        startEmpty={props.startEmpty}
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        section={section}
        onSection={setSection}
      />
    </>
  );
}
