/**
 * Assinatura dos avisos da Kambafy (X-Kambafy-Signature: «t=<segundos>,v1=<hex>»).
 *
 * A Kambafy assina no servidor (supabase/functions/_shared/sellerWebhook.ts, desde 25/10/2026):
 * HMAC-SHA256 com o segredo do webhook sobre «<t>.<corpo>». Só quem tem o segredo E o corpo exacto produz
 * a assinatura, e a hora entra nela: um pedido apanhado não serve com outro número de encomenda (o corpo
 * muda) nem mais tarde (a hora sai da janela).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Janela aceite entre a hora da assinatura e a do servidor: 5 minutos para cada lado. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureCheck =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing" | "malformed" | "expired" | "invalid" };

export function verifyKambafySignature(
  secret: string,
  rawBody: string,
  header: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  tolerance = SIGNATURE_TOLERANCE_SECONDS,
): SignatureCheck {
  if (!header?.trim()) return { ok: false, reason: "missing" };
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const at = part.indexOf("=");
      return at > 0 ? [part.slice(0, at).trim(), part.slice(at + 1).trim()] : ["", ""];
    }),
  );
  const timestamp = Number(parts["t"]);
  const signature = parts["v1"] ?? "";
  if (!Number.isInteger(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - timestamp) > tolerance) return { ok: false, reason: "expired" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" };
  return { ok: true, timestamp };
}

/** Assina como a Kambafy: só para os testes. */
export function signLikeKambafy(secret: string, rawBody: string, timestamp: number) {
  const hex = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${hex}`;
}

/**
 * Transição: enquanto KAMBAFY_ALLOW_UNSIGNED não for «off», um aviso sem assinatura ainda passa pelo
 * segredo em claro (contas configuradas antes de 25/10). Com assinatura, ela é sempre obrigatória e certa.
 */
export const unsignedAllowed = () => process.env["KAMBAFY_ALLOW_UNSIGNED"]?.trim().toLowerCase() !== "off";
