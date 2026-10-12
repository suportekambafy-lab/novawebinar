/**
 * A optimização automática do tráfego de um teste A/B, sem base de dados.
 *
 * Nos primeiros dias (o aquecimento) as fatias ficam como o organizador as pôs. Depois, uma vez por dia, o
 * tráfego desloca-se para a variante que vai à frente no objectivo, em passos pequenos e com um mínimo para
 * cada variante continuar a receber gente (senão nunca se saberia se a outra recuperava). Quanto mais segura
 * a vantagem, maior a fatia que a líder pode chegar a ter. Tudo explicável numa frase, que fica no histórico.
 */
import { compare, type Comparison, type Measure } from "./stats";

export type Arm = { id: string; label: string; traffic: number; measure: Measure };

export type RebalanceOptions = {
  /** Fatia mínima de cada variante enquanto o teste corre (pontos percentuais). */
  floor?: number;
  /** Fatia máxima da líder (pontos percentuais). */
  ceiling?: number;
  /** O máximo que cada variante muda por dia (pontos percentuais). */
  step?: number;
  /** Visitantes por variante antes de se mexer no tráfego. */
  minVisitorsPerArm?: number;
};

export type RebalancePlan = {
  /** Mudou alguma fatia? */
  changed: boolean;
  /** As fatias a aplicar, por id de variante (somam 100). */
  next: Record<string, number>;
  /** A variante à frente, ou null quando não há dados para decidir. */
  leader: Arm | null;
  /** 0 a 1: a confiança média de que a líder bate as outras. */
  confidence: number;
  /** Em palavras, para o histórico. */
  reason: string;
};

const DEFAULTS = { floor: 10, ceiling: 90, step: 10, minVisitorsPerArm: 30 };

const visitorsOf = (m: Measure) => m.n;

/** Arredonda fatias para inteiros que somam 100, dando o resto à maior. */
export function roundShares(shares: Record<string, number>): Record<string, number> {
  const ids = Object.keys(shares);
  const floored = Object.fromEntries(ids.map((id) => [id, Math.floor(shares[id]!)]));
  let rest = 100 - ids.reduce((sum, id) => sum + floored[id]!, 0);
  const order = [...ids].sort((a, b) => shares[b]! - floored[b]! - (shares[a]! - floored[a]!));
  for (const id of order) {
    if (rest <= 0) break;
    floored[id] = floored[id]! + 1;
    rest -= 1;
  }
  return floored;
}

/**
 * O plano de hoje: para onde vai o tráfego e porquê. Com menos de duas variantes com tráfego, ou sem
 * visitantes suficientes, não mexe.
 */
export function planRebalance(arms: readonly Arm[], options: RebalanceOptions = {}): RebalancePlan {
  const o = { ...DEFAULTS, ...options };
  const current = Object.fromEntries(arms.map((a) => [a.id, a.traffic]));
  const same = (reason: string): RebalancePlan => ({ changed: false, next: current, leader: null, confidence: 0, reason });
  if (arms.length < 2) return same("O teste precisa de duas variantes.");
  const thin = arms.filter((a) => visitorsOf(a.measure) < o.minVisitorsPerArm);
  if (thin.length) return same(`Ainda sem visitantes suficientes: ${thin.map((a) => `${a.label} tem ${visitorsOf(a.measure)}`).join(", ")} (mínimo ${o.minVisitorsPerArm}).`);

  const leader = arms.reduce((best, a) => (a.measure.value > best.measure.value ? a : best), arms[0]!);
  const others = arms.filter((a) => a !== leader);
  if (others.every((a) => a.measure.value === leader.measure.value)) return same("As variantes estão empatadas: o tráfego fica como está.");

  // A confiança de que a líder bate cada uma das outras, em média.
  const confidences = others.map((a) => compare(a.measure, leader.measure)).map((c: Comparison) => Math.max(0, Math.min(1, c.confidence / 100)));
  const confidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;

  // A fatia alvo da líder cresce com a confiança: metade sem certeza nenhuma, o tecto com certeza total.
  const equal = 100 / arms.length;
  const leaderTarget = Math.min(o.ceiling, equal + (o.ceiling - equal) * confidence);
  // As outras repartem o resto na proporção do que valem (nunca abaixo do mínimo).
  const remainder = 100 - leaderTarget;
  const weights = others.map((a) => Math.max(a.measure.value, 1e-9));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const target: Record<string, number> = { [leader.id]: leaderTarget };
  others.forEach((a, i) => {
    target[a.id] = Math.max(o.floor, remainder * (weights[i]! / weightSum));
  });

  // Um passo por dia, no máximo `step` pontos por variante, e as fatias voltam a somar 100.
  const stepped: Record<string, number> = {};
  for (const a of arms) {
    const delta = Math.max(-o.step, Math.min(o.step, target[a.id]! - a.traffic));
    stepped[a.id] = Math.max(o.floor, Math.min(o.ceiling, a.traffic + delta));
  }
  const total = Object.values(stepped).reduce((sum, v) => sum + v, 0);
  const next = roundShares(Object.fromEntries(Object.entries(stepped).map(([id, v]) => [id, (v / total) * 100])));
  const changed = arms.some((a) => next[a.id] !== a.traffic);
  const pctText = (v: number) => `${Math.round(v * 100)}%`;
  const reason = changed
    ? `A variante ${leader.label} vai à frente (confiança ${pctText(confidence)}): tráfego ${arms.map((a) => `${a.label} ${a.traffic}→${next[a.id]}%`).join(", ")}.`
    : `A variante ${leader.label} vai à frente (confiança ${pctText(confidence)}), mas o tráfego já está no ponto certo.`;
  return { changed, next, leader, confidence, reason };
}

/** Já passou o aquecimento? Conta a partir do início do teste. */
export function warmupOver(startedAt: string | null, afterDays: number, nowMs = Date.now()): boolean {
  if (!startedAt) return false;
  return nowMs - Date.parse(startedAt) >= afterDays * 86_400_000;
}

/** Já se optimizou hoje? Uma vez por dia chega: as fatias só mudam em passos pequenos. */
export function optimizedRecently(optimizedAt: string | null, nowMs = Date.now()): boolean {
  if (!optimizedAt) return false;
  return nowMs - Date.parse(optimizedAt) < 86_400_000;
}
