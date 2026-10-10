import {
  Clock,
  ClipboardList,
  FileText,
  GitFork,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Send,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Linguagem visual do Workflow (novawebinar-design/components/diagram).
 * Só três famílias de cor: azul-noite (eventos, estrutura), cinzas (páginas,
 * condições, esperas com relevo diagonal) e laranja (acções, seleccionado,
 * em curso). Cada tipo distingue-se por ícone + forma + tom, nunca por arco-íris.
 */

export type FlowKind = "source" | "page" | "capture" | "event" | "condition" | "wait" | "action";

export const FLOW_KIND: Record<FlowKind, { label: string; icon: LucideIcon; tile: string }> = {
  source: { label: "Origem", icon: Megaphone, tile: "bg-navy text-white" },
  page: { label: "Página", icon: FileText, tile: "bg-white text-foreground ring-1 ring-hairline" },
  capture: { label: "Captura", icon: ClipboardList, tile: "border border-dashed border-gray-400 bg-white text-foreground" },
  event: { label: "Quando", icon: Zap, tile: "bg-navy text-white" },
  condition: { label: "Condição", icon: GitFork, tile: "bg-chip text-foreground" },
  wait: { label: "Esperar", icon: Clock, tile: "bg-hatch-light text-foreground ring-1 ring-hairline" },
  action: { label: "Acção", icon: Send, tile: "bg-accent text-accent-700" },
};

export type FlowChannel = "email" | "whatsapp" | "whatsapp_group" | "sms" | "webhook";

export const FLOW_CHANNEL: Record<FlowChannel, { label: string; icon: LucideIcon }> = {
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp individual", icon: MessageCircle },
  whatsapp_group: { label: "WhatsApp grupo", icon: Users },
  sms: { label: "SMS", icon: MessageSquare },
  webhook: { label: "Webhook", icon: Webhook },
};

/** Estado de execução de uma automação. */
export function RunState({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-[11px]",
        active ? "bg-success-soft text-success" : "bg-chip text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-gray-400")} aria-hidden />
      {active ? "Activa" : "Rascunho"}
    </span>
  );
}
