/**
 * Envio por WhatsApp não oficial pelo WAHA (github.com/devlikeapro/waha): um servidor da
 * plataforma (WAHA_URL, WAHA_API_KEY), uma sessão por organização ligada pelo código QR.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_COUNTRY_CODE, whatsappNumber, whatsappReady } from "@/lib/integrations";

export function waha(path: string, init: RequestInit = {}) {
  const base = (process.env["WAHA_URL"] ?? "").replace(/\/+$/, "");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": process.env["WAHA_API_KEY"] ?? "",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
}

export type WhatsappDelivery = {
  ok: boolean;
  transient: boolean;
  status: number | null;
  error: string | null;
  /** Falta configurar o canal (servidor, ligação): nada sai para ninguém até se corrigir. */
  config?: boolean;
};

const fail = (
  error: string,
  transient = false,
  status: number | null = null,
): WhatsappDelivery => ({
  ok: false,
  transient,
  status,
  error,
});

/** O id do grupo (…@g.us): escrito tal e qual, ou procurado pelo nome entre os grupos do número ligado. */
async function groupChatId(session: string, group: string): Promise<string | null> {
  const wanted = group.trim();
  if (/@g\.us$/.test(wanted)) return wanted;
  const res = await waha(`/api/${session}/groups?exclude=participants`);
  if (!res.ok) throw new Error(`grupos: o servidor de WhatsApp respondeu ${res.status}`);
  const body = (await res.json()) as unknown;
  // A forma da resposta muda com o motor do WAHA (WEBJS, NOWEB, GOWS): lista ou mapa por id.
  const list = Array.isArray(body) ? body : Object.values((body ?? {}) as Record<string, unknown>);
  const name = wanted.toLocaleLowerCase("pt");
  for (const item of list as Record<string, unknown>[]) {
    const raw = item["id"] ?? item["JID"];
    const id =
      typeof raw === "string" ? raw : (raw as { _serialized?: string } | null)?._serialized;
    const subject = item["subject"] ?? item["name"] ?? item["Name"];
    if (id && typeof subject === "string" && subject.trim().toLocaleLowerCase("pt") === name)
      return id;
  }
  return null;
}

/**
 * Uma mensagem de texto para o número do contacto ou para um grupo. Erros do servidor e de
 * rede são passageiros (a execução volta a tentar); o resto fica registado como falha.
 */
export async function sendWhatsapp(
  organizationId: string,
  to: { phone: string | null } | { group: string },
  text: string,
): Promise<WhatsappDelivery> {
  if (!process.env["WAHA_URL"])
    return { ...fail("O servidor de WhatsApp (WAHA) não está ligado à plataforma."), config: true };
  const { data: row, error } = await supabaseAdmin
    .from("integrations")
    .select("provider, enabled, settings")
    .eq("organization_id", organizationId)
    .eq("provider", "whatsapp")
    .maybeSingle();
  if (error) return fail(`WhatsApp: ${error.message}`, true);
  if (!whatsappReady(row ?? undefined))
    return { ...fail("O WhatsApp não oficial não está ligado (Integrações › Canais)."), config: true };
  const settings = row!.settings as Record<string, string>;
  // A sessão de cada organização tem nome fixo no servidor de WhatsApp. Calcula-se aqui, nunca se lê das
  // definições (que um membro pode escrever): com o nome de outra organização, enviava pelo número dela.
  const session = `org_${organizationId.replace(/-/g, "")}`;

  try {
    let chatId: string | null;
    if ("group" in to) {
      chatId = await groupChatId(session, to.group);
      if (!chatId) return fail(`O número ligado não está no grupo "${to.group}".`);
    } else {
      const number = whatsappNumber(to.phone, settings["country_code"] || DEFAULT_COUNTRY_CODE);
      if (!number) return fail("O contacto não tem um número de WhatsApp válido.");
      chatId = `${number}@c.us`;
    }
    let res: Response;
    try {
      res = await waha("/api/sendText", {
        method: "POST",
        body: JSON.stringify({ session, chatId, text }),
      });
    } catch (err) {
      // O pedido saiu e a resposta não chegou a tempo: a mensagem pode ter sido entregue. Não se volta a
      // tentar (repetia a mesma mensagem à pessoa); fica registada como enviada, sem confirmação.
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
        return { ok: true, transient: false, status: null, error: "Sem confirmação do servidor de WhatsApp a tempo: não se reenvia para não repetir." };
      throw err;
    }
    if (res.ok) return { ok: true, transient: false, status: res.status, error: null };
    const detail = (await res.text()).slice(0, 200);
    // Telemóvel desligado ou sessão parada: o WAHA recusa com 4xx a falar da sessão. Não é a mensagem que
    // está mal: fica para mais tarde, como um problema de ligação, em vez de se perder para sempre.
    if (res.status === 422 || (res.status < 500 && /session/i.test(detail)))
      return { ...fail(`O WhatsApp não está ligado agora (${res.status}): ${detail}`, true, res.status), config: true };
    return fail(
      `O WhatsApp recusou o envio (${res.status}): ${detail}`,
      res.status >= 500 || res.status === 429,
      res.status,
    );
  } catch (err) {
    return fail(`WhatsApp: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}
