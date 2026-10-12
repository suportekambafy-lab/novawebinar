/**
 * Tempos humanos dentro de uma oportunidade.
 *
 * Depois da fala: a primeira resposta chega 1,5 a 4 s depois do fim do bloco;
 * as seguintes espalham-se entre 2 e 15 s (até 20 a 30 s numa interacção
 * forte), por ordem, sem duas no mesmo instante. Antes da leitura: a mensagem
 * existe 2 a 8 s antes de o apresentador a ler, pela ordem em que ele lê.
 * Livre: espalhadas pelo bloco. Tudo determinístico a partir de uma semente.
 */
import type { Dependency, InteractionSlot } from "./types";

/** Gerador pseudo-aleatório pequeno e determinístico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIRST_ANSWER_MIN_MS = 1500;
export const FIRST_ANSWER_MAX_MS = 4000;
export const ANSWER_SPAN_MS = 15_000;
export const STRONG_SPAN_MS = 28_000;
export const BEFORE_READ_MIN_MS = 2000;
export const BEFORE_READ_MAX_MS = 8000;
export const MIN_SPACING_MS = 900;

function spaced(times: number[], minGap: number, ceiling: number): number[] {
  const out = [...times].sort((a, b) => a - b);
  for (let i = 1; i < out.length; i += 1) {
    if (out[i]! - out[i - 1]! < minGap) out[i] = out[i - 1]! + minGap;
  }
  // Se a cascata passou do tecto, encosta-se ao tecto de trás para a frente.
  for (let i = out.length - 1; i >= 0; i -= 1) {
    const limit = ceiling - (out.length - 1 - i) * minGap;
    if (out[i]! > limit) out[i] = limit;
  }
  return out.map((t) => Math.round(t));
}

/** Instantes (ms) para `count` mensagens desta oportunidade, por ordem. */
export function placeSlot(
  slot: Pick<
    InteractionSlot,
    "dependency" | "blockStartMs" | "blockEndMs" | "windowStartMs" | "windowEndMs" | "strong"
  >,
  count: number,
  seed = 1,
): number[] {
  if (count <= 0) return [];
  const random = rng(seed);
  const start = slot.windowStartMs;
  const end = Math.max(slot.windowEndMs, start + MIN_SPACING_MS);

  if (slot.dependency === "AFTER") {
    const first = Math.min(
      end,
      Math.max(
        start,
        slot.blockEndMs +
          FIRST_ANSWER_MIN_MS +
          random() * (FIRST_ANSWER_MAX_MS - FIRST_ANSWER_MIN_MS),
      ),
    );
    const span = Math.min(end - slot.blockEndMs, slot.strong ? STRONG_SPAN_MS : ANSWER_SPAN_MS);
    const rest: number[] = [];
    for (let i = 1; i < count; i += 1) {
      // Cada pessoa seguinte demora mais: a distribuição concentra-se cedo e rareia no fim.
      const u = random();
      const offset = 2000 + Math.pow(u, 0.75) * Math.max(0, span - 2000);
      rest.push(slot.blockEndMs + offset);
    }
    return spaced([first, ...rest], MIN_SPACING_MS, end);
  }

  if (slot.dependency === "BEFORE") {
    const width = Math.max(0, end - start);
    const times: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const base =
        count === 1 ? start + width * (0.3 + random() * 0.5) : start + (width * (i + 0.5)) / count;
      times.push(base + (random() - 0.5) * Math.min(800, width / Math.max(1, count)));
    }
    return spaced(
      times,
      Math.min(MIN_SPACING_MS, Math.max(300, width / Math.max(1, count))),
      end,
    ).map((t) => Math.max(start, Math.min(end, t)));
  }

  const width = Math.max(0, end - start);
  const times: number[] = [];
  for (let i = 0; i < count; i += 1) times.push(start + random() * width);
  return spaced(times, Math.min(1500, Math.max(500, width / Math.max(1, count))), end);
}

/** A relação (provoca, responde, reage, espontaneo) que o resto do motor já conhece. */
export function kindFor(
  dependency: Dependency,
  expectsResponse: boolean,
): "provoca" | "responde" | "reage" | "espontaneo" {
  if (dependency === "BEFORE") return "provoca";
  if (dependency === "AFTER") return expectsResponse ? "responde" : "reage";
  return "espontaneo";
}
