import { TRIGGER_LABEL, type TriggerEvent } from "@/lib/automations";
import { useIntegrations, useWorkspace } from "@/lib/data";
import { whatsappReady } from "@/lib/integrations";

export const triggerLabel = (trigger: string) => TRIGGER_LABEL[trigger as TriggerEvent] ?? trigger;

/** O destino da acção: o webhook de saída do webinar do fluxo (Integrações, âmbito «este webinar») ou, sem ele, o da conta. */
export function useWebhookDestination(organizationId: string | undefined, webinarId?: string | null) {
  const { data: integrations = [], isLoading } = useIntegrations(organizationId);
  const { data: workspace } = useWorkspace();
  const hooks = integrations.filter((i) => i.provider === "outgoing_webhook");
  const hook = (webinarId && hooks.find((i) => i.webinar_id === webinarId)) || hooks.find((i) => !i.webinar_id);
  const url = (hook?.settings as { url?: string } | null)?.url;
  let host: string | null = null;
  if (typeof url === "string" && url.startsWith("https://")) {
    try {
      host = new URL(url).host;
    } catch {
      host = null;
    }
  }
  return {
    isLoading,
    /** Pronto a receber: ligado e com endereço https. */
    ready: Boolean(hook?.enabled && host),
    enabled: Boolean(hook?.enabled),
    host,
    /** Conta de teste: o envio é simulado no servidor e nada sai da plataforma. */
    simulated: Boolean(workspace?.isTest),
    /** O WhatsApp não oficial já ligado pelo código QR (lido da mesma lista de integrações). */
    whatsappReady: whatsappReady(integrations.find((i) => i.provider === "whatsapp" && !i.webinar_id)),
  };
}
