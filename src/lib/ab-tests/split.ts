/**
 * A divisão do tráfego de um teste A/B, sem base de dados: a mesma pessoa cai sempre no mesmo grupo, e os
 * grupos seguem as fatias das variantes. Fica à parte do servidor para se testar à vontade.
 */
import { createHash } from "node:crypto";

/** 0 a 99, sempre o mesmo para a mesma pessoa no mesmo teste: a variante não muda entre visitas. */
export function bucketOf(visitor: string, testId: string): number {
  const hash = createHash("sha256").update(`${testId}:${visitor}`).digest();
  return hash.readUInt32BE(0) % 100;
}

/** A variante que a fatia de tráfego dá a este número de 0 a 99 (as fatias somam 100 na ordem das variantes). */
export function pickVariant<T extends { traffic_percentage: number }>(variants: readonly T[], bucket: number): T {
  let edge = 0;
  for (const variant of variants) {
    edge += variant.traffic_percentage;
    if (bucket < edge) return variant;
  }
  // Fatias que não somam 100: o resto vai para a última com tráfego, senão para a primeira.
  return [...variants].reverse().find((v) => v.traffic_percentage > 0) ?? variants[0]!;
}

/** Quantos de `n` visitantes aleatórios caem em cada variante (para confirmar que a divisão é a esperada). */
export function simulateSplit<T extends { traffic_percentage: number }>(variants: readonly T[], testId: string, n = 1000) {
  const counts = new Map<T, number>();
  for (let i = 0; i < n; i += 1) {
    const variant = pickVariant(variants, bucketOf(`sim-${i}`, testId));
    counts.set(variant, (counts.get(variant) ?? 0) + 1);
  }
  return counts;
}
