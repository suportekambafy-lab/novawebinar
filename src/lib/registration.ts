/**
 * Captura externa: a página de inscrição fica fora do Novawebinar (WordPress, Framer,
 * HTML...). Chega aqui por um formulário embed (script) ou pela API pública, sempre com o
 * identificador do formulário: é ele que diz o webinar e, por ele, a organização.
 * Aqui ficam as regras puras: validação, normalização, UTM, origem e limite de ritmo.
 */
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional().nullable();

export const registrationSchema = z.object({
  /** O formulário diz o webinar e a organização; sem formulário (API), o webinar diz a organização. */
  form_id: z.string().uuid("Formulário inválido.").optional().nullable(),
  webinar_id: z.string().uuid("Webinar inválido.").optional().nullable(),
  /** Nome, e-mail e WhatsApp: quais são obrigatórios e as regras vêm dos campos do webinar (validateEntry), como na sala. */
  // Limites largos: validateEntry corta o nome e as respostas e recusa um e-mail longo, com mensagens claras.
  name: text(200),
  email: text(200),
  phone: text(60),
  /** Os campos novos da página, pelo id de cada um. */
  answers: z.record(z.string().max(40), z.string().max(1000)).optional().nullable(),
  consent: z.boolean().optional().nullable(),
  submission_id: z.string().trim().min(8).max(100).optional().nullable(),
  utm_source: text(120),
  utm_medium: text(120),
  utm_campaign: text(120),
  utm_content: text(120),
  utm_term: text(120),
  referrer: text(500),
  page_url: text(2000),
  device: z.enum(["mobile", "desktop"]).optional().nullable(),
  /** Armadilha para robôs: um campo escondido que as pessoas nunca preenchem. */
  website: text(200),
}).refine((v) => v.form_id || v.webinar_id, { message: "Indique o formulário ou o webinar.", path: ["form_id"] });
export type RegistrationInput = z.infer<typeof registrationSchema>;

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

/** Telefone/WhatsApp: só dígitos, com o "+" inicial quando existe. null quando não serve. */
/**
 * A sala e o formulário juntam o indicativo escolhido ao que a pessoa escreveu. Quem escreve o número já com o
 * indicativo («+244 923…», sem o «+», que o campo tira) ficava com ele duas vezes: «+244 244923456789».
 * Só se tira a repetição quando o resto é comprido demais para um número nacional (12+ dígitos): um número
 * brasileiro de 11 dígitos com o DDD 55 fica como está.
 */
export function withoutRepeatedDial(raw: string | null | undefined): string | null | undefined {
  if (!raw) return raw;
  const match = /^\s*\+(\d{1,4})\s+(.*)$/.exec(raw);
  if (!match) return raw;
  const dial = match[1]!;
  const rest = match[2]!.replace(/\D/g, "");
  if (rest.length >= 12 && rest.startsWith(dial)) return `+${dial} ${rest.slice(dial.length)}`;
  return raw;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${trimmed.startsWith("+") || trimmed.startsWith("00") ? "+" : ""}${digits.replace(/^00/, "")}`;
}

/** As UTM da página onde o formulário está, quando não vêm explícitas. */
export function utmFromUrl(url: string | null | undefined): Utm {
  if (!url) return {};
  try {
    const params = new URL(url).searchParams;
    const out: Utm = {};
    for (const key of UTM_KEYS) {
      const value = params.get(key)?.trim();
      if (value) out[key] = value.slice(0, 120);
    }
    return out;
  } catch {
    return {};
  }
}

/** Explícito ganha; senão, o que vem no endereço da página. source e medium em minúsculas. */
export function resolveUtm(input: Partial<Record<(typeof UTM_KEYS)[number], string | null | undefined>>, pageUrl: string | null | undefined): Utm {
  const fromPage = utmFromUrl(pageUrl);
  const out: Utm = {};
  for (const key of UTM_KEYS) {
    const value = (input[key] ?? "").trim() || fromPage[key];
    if (value) out[key] = key === "utm_source" || key === "utm_medium" ? value.toLowerCase() : value;
  }
  return out;
}

/** A origem do pedido pode usar o formulário? Lista vazia: qualquer uma (com limite de ritmo). */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!allowed.length) return true;
  if (!origin) return true; // chamadas de servidor (API) não trazem origem
  let host: string;
  try {
    host = new URL(origin).origin;
  } catch {
    return false;
  }
  return allowed.some((entry) => {
    const rule = entry.trim().replace(/\/+$/, "");
    if (rule.includes("*.")) {
      const [scheme, domain] = rule.split("*.");
      return host.startsWith(scheme ?? "") && (host.endsWith(`.${domain}`) || host === `${scheme}${domain}`);
    }
    try {
      return new URL(rule).origin === host;
    } catch {
      return false;
    }
  });
}

/**
 * Limite de ritmo em memória (janela deslizante).
 * ponytail: por instância do servidor; com várias instâncias o limite multiplica-se.
 * Passar a uma contagem na base de dados se a captura correr em mais de um processo.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  allow(key: string, now = Date.now()) {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    // Reinserida no fim: o Map fica ordenado da chave usada há mais tempo para a mais recente.
    this.hits.delete(key);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(now);
    return true;
  }

  /** Cheio: saem as chaves fora da janela e, se não chegar, as usadas há mais tempo. Nunca todas. */
  private prune(now: number) {
    for (const [key, times] of this.hits) if (now - (times.at(-1) ?? 0) >= this.windowMs) this.hits.delete(key);
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(key);
    }
  }
}

/**
 * Lê o corpo de um pedido até `max` bytes; null quando passa. Pára de ler nesse ponto, sem
 * guardar o resto: um corpo enorme nunca fica inteiro em memória.
 */
export async function readLimitedBody(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

const INTERNAL_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * O IP do visitante, para o limite de ritmo. O X-Forwarded-For só conta quando quem liga ao
 * servidor é um proxy da rede interna (ou não há socket, como em serverless). Nesse caso vale,
 * da direita para a esquerda, o primeiro endereço que não é interno: o que o nosso proxy viu.
 * O que fica à esquerda foi escrito pelo cliente e nunca conta.
 */
export function clientIp(socketIp: string | null | undefined, forwardedFor: string | null): string {
  const internal = (ip: string) => INTERNAL_IP.test(ip.replace(/^::ffff:/i, ""));
  if (socketIp && !internal(socketIp)) return socketIp;
  const hops = (forwardedFor ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i -= 1) if (!internal(hops[i]!)) return hops[i]!;
  return socketIp || hops[0] || "local";
}

export type RegistrationError = { status: 400 | 403 | 404 | 409 | 429 | 500; code: string; message: string; fields?: Record<string, string> };

/**
 * Valida a forma do pedido e junta as UTM. Os campos da pessoa (nome, e-mail, WhatsApp, respostas)
 * validam-se depois, com os campos do webinar (registerFromCapture).
 */
export function parseRegistration(body: unknown):
  | { ok: true; value: RegistrationInput & { utm: Utm } }
  | { ok: false; error: RegistrationError } {
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: { status: 400, code: "invalid", message: "Dados inválidos.", fields } };
  }
  return { ok: true, value: { ...parsed.data, utm: resolveUtm(parsed.data, parsed.data.page_url) } };
}
