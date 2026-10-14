/**
 * O motor estatístico dos testes A/B: sem bibliotecas. Taxas (conversão, cliques, retenção) comparam-se
 * com o teste z de duas proporções; receitas por pessoa com o teste t de Welch (variâncias diferentes).
 * O veredito é uma frase, não um número: «Dados insuficientes», «Tendência favorável» ou «Resultado
 * consistente» (quando a confiança chega ao limiar do teste, p. ex. 95%).
 */

export type Objective =
  | "conversions"
  | "revenue"
  | "revenue_per_participant"
  | "registrations"
  | "attendance"
  | "retention"
  | "pitch"
  | "clicks";

export const OBJECTIVES: readonly { id: Objective; label: string; hint: string; kind: "rate" | "mean" }[] = [
  { id: "conversions", label: "Conversões (vendas)", hint: "Compradores entre quem abriu o endereço.", kind: "rate" },
  { id: "revenue", label: "Receita média por visitante", hint: "Receita dividida por quem abriu o endereço.", kind: "mean" },
  { id: "revenue_per_participant", label: "Receita por participante", hint: "Receita dividida por quem se inscreveu.", kind: "mean" },
  { id: "registrations", label: "Inscrições", hint: "Inscritos entre quem abriu o endereço.", kind: "rate" },
  { id: "attendance", label: "Presença", hint: "Quem começou a ver, entre os inscritos.", kind: "rate" },
  { id: "retention", label: "Retenção", hint: "Quem chegou a metade do vídeo, entre os que começaram.", kind: "rate" },
  { id: "pitch", label: "Chegada ao pitch", hint: "Quem chegou ao minuto do pitch, entre os que começaram.", kind: "rate" },
  { id: "clicks", label: "Cliques na oferta", hint: "Quem clicou na oferta, entre os inscritos.", kind: "rate" },
];

export const objectiveInfo = (id: string) => OBJECTIVES.find((o) => o.id === id) ?? OBJECTIVES[0]!;

/** As métricas de uma variante, como a função ab_test_metrics as devolve. */
export type VariantMetrics = {
  id: string;
  label: string;
  name: string;
  webinarId: string | null;
  webinarTitle: string | null;
  traffic: number;
  position: number;
  durationSeconds: number;
  pitchSeconds: number | null;
  visitors: number;
  exposures: number;
  participants: number;
  started: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  completed: number;
  pitch: number | null;
  offerViews: number;
  clicks: number;
  buyers: number;
  revenue: number;
  revenueSq: number;
  watchedTotal: number;
  /** 21 pontos (0%, 5%, … 100% do vídeo): quantos ainda estavam a ver. */
  retention: number[];
  devices: Record<string, { visitors: number; buyers: number }>;
  sources: Record<string, { visitors: number; buyers: number }>;
};

export type TestMetrics = { variants: VariantMetrics[]; assignmentMode: string; computedAt: string | null };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : num(v));
const counts = (v: unknown): Record<string, { visitors: number; buyers: number }> => {
  const out: Record<string, { visitors: number; buyers: number }> = {};
  if (typeof v !== "object" || v === null) return out;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    out[k] = { visitors: num(r["visitors"]), buyers: num(r["buyers"]) };
  }
  return out;
};

/** Lê o JSON da função ab_test_metrics; o que faltar fica a zero. */
export function parseMetrics(raw: unknown): TestMetrics {
  const root = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(root["variants"]) ? (root["variants"] as unknown[]) : [];
  const variants = list.map((item) => {
    const v = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const retention = Array.isArray(v["retention"]) ? (v["retention"] as unknown[]).map(num) : [];
    return {
      id: String(v["id"] ?? ""),
      label: String(v["label"] ?? ""),
      name: String(v["name"] ?? ""),
      webinarId: typeof v["webinarId"] === "string" ? v["webinarId"] : null,
      webinarTitle: typeof v["webinarTitle"] === "string" ? v["webinarTitle"] : null,
      traffic: num(v["traffic"]),
      position: num(v["position"]),
      durationSeconds: Math.max(1, num(v["durationSeconds"])),
      pitchSeconds: numOrNull(v["pitchSeconds"]),
      visitors: num(v["visitors"]),
      exposures: num(v["exposures"]),
      participants: num(v["participants"]),
      started: num(v["started"]),
      p25: num(v["p25"]),
      p50: num(v["p50"]),
      p75: num(v["p75"]),
      p90: num(v["p90"]),
      completed: num(v["completed"]),
      pitch: numOrNull(v["pitch"]),
      offerViews: num(v["offerViews"]),
      clicks: num(v["clicks"]),
      buyers: num(v["buyers"]),
      revenue: num(v["revenue"]),
      revenueSq: num(v["revenueSq"]),
      watchedTotal: num(v["watchedTotal"]),
      retention,
      devices: counts(v["devices"]),
      sources: counts(v["sources"]),
    } satisfies VariantMetrics;
  });
  variants.sort((a, b) => a.position - b.position);
  return {
    variants,
    assignmentMode: String(root["assignmentMode"] ?? "legacy"),
    computedAt: typeof root["computedAt"] === "string" ? root["computedAt"] : null,
  };
}

/* ---------- O que cada objectivo mede ---------- */

/** Uma taxa: `hits` em `n`; ou uma média: `sum` e `sumSq` sobre `n` pessoas. */
export type Measure =
  | { kind: "rate"; hits: number; n: number; value: number }
  | { kind: "mean"; sum: number; sumSq: number; n: number; value: number };

const rate = (hits: number, n: number): Measure => ({ kind: "rate", hits, n, value: n > 0 ? hits / n : 0 });
const mean = (sum: number, sumSq: number, n: number): Measure => ({ kind: "mean", sum, sumSq, n, value: n > 0 ? sum / n : 0 });

export function measureOf(v: VariantMetrics, objective: Objective): Measure {
  switch (objective) {
    case "conversions":
      return rate(v.buyers, v.visitors);
    case "revenue":
      return mean(v.revenue, v.revenueSq, v.visitors);
    case "revenue_per_participant":
      return mean(v.revenue, v.revenueSq, v.participants);
    case "registrations":
      return rate(v.participants, v.visitors);
    case "attendance":
      return rate(v.started, v.participants);
    case "retention":
      return rate(v.p50, v.started);
    case "pitch":
      return rate(v.pitch ?? 0, v.started);
    case "clicks":
      return rate(v.clicks, v.participants);
  }
}

/* ---------- Distribuições ---------- */

/** A função de distribuição da normal padrão (erro máximo 1,5e-7; Abramowitz e Stegun 7.1.26). */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  // Φ(z) = ½·(1 + erf(z/√2)); a aproximação é de erf(x) para x ≥ 0.
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  const p = 0.5 * (1 + erf);
  return z >= 0 ? p : 1 - p;
}

/** A confiança em percentagem, limpa do ruído da aproximação (4 casas). */
const confidenceOf = (pValue: number) => Math.round(Math.max(0, Math.min(100, (1 - pValue) * 100)) * 1e4) / 1e4;

function logGamma(x: number): number {
  // Lanczos (g = 7, n = 9).
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i += 1) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fracção contínua da beta incompleta (Numerical Recipes, betacf). */
function betaContinued(a: number, b: number, x: number): number {
  const MAX = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** A beta incompleta regularizada I_x(a, b). */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinued(a, b, x)) / a : 1 - (front * betaContinued(b, a, 1 - x)) / b;
}

/** A função de distribuição da t de Student com `df` graus de liberdade. */
export function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  if (df <= 0) return 0.5;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/* ---------- Os testes ---------- */

export type Comparison = {
  /** Diferença relativa da variante face ao controlo (0,25 = +25%). */
  lift: number;
  /** Estatística do teste (z ou t). */
  statistic: number;
  /** Probabilidade de uma diferença assim por acaso (bilateral). */
  pValue: number;
  /** 0 a 100: a confiança de que a diferença é real. */
  confidence: number;
  test: "z" | "welch";
};

/** Teste z de duas proporções: controlo (x1 em n1) contra variante (x2 em n2). */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): Comparison {
  const p1 = n1 > 0 ? x1 / n1 : 0;
  const p2 = n2 > 0 ? x2 / n2 : 0;
  const lift = p1 > 0 ? (p2 - p1) / p1 : p2 > 0 ? Infinity : 0;
  if (n1 === 0 || n2 === 0) return { lift, statistic: 0, pValue: 1, confidence: 0, test: "z" };
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { lift, statistic: 0, pValue: 1, confidence: 0, test: "z" };
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { lift, statistic: z, pValue, confidence: confidenceOf(pValue), test: "z" };
}

/** Teste t de Welch para médias com variâncias diferentes, a partir de somas e somas de quadrados. */
export function welchT(sum1: number, sumSq1: number, n1: number, sum2: number, sumSq2: number, n2: number): Comparison {
  const m1 = n1 > 0 ? sum1 / n1 : 0;
  const m2 = n2 > 0 ? sum2 / n2 : 0;
  const lift = m1 > 0 ? (m2 - m1) / m1 : m2 > 0 ? Infinity : 0;
  if (n1 < 2 || n2 < 2) return { lift, statistic: 0, pValue: 1, confidence: 0, test: "welch" };
  const var1 = Math.max(0, (sumSq1 - n1 * m1 * m1) / (n1 - 1));
  const var2 = Math.max(0, (sumSq2 - n2 * m2 * m2) / (n2 - 1));
  const a = var1 / n1;
  const b = var2 / n2;
  const se = Math.sqrt(a + b);
  if (se === 0) return { lift, statistic: 0, pValue: 1, confidence: 0, test: "welch" };
  const t = (m2 - m1) / se;
  const df = (a + b) ** 2 / ((a * a) / (n1 - 1) + (b * b) / (n2 - 1));
  const pValue = 2 * (1 - studentTCdf(Math.abs(t), df));
  return { lift, statistic: t, pValue, confidence: confidenceOf(pValue), test: "welch" };
}

export function compare(control: Measure, variant: Measure): Comparison {
  if (control.kind === "rate" && variant.kind === "rate") return twoProportionZ(control.hits, control.n, variant.hits, variant.n);
  if (control.kind === "mean" && variant.kind === "mean")
    return welchT(control.sum, control.sumSq, control.n, variant.sum, variant.sumSq, variant.n);
  return { lift: 0, statistic: 0, pValue: 1, confidence: 0, test: "z" };
}

/* ---------- O veredito ---------- */

export type Verdict = "insufficient" | "none" | "trend" | "consistent";

export const VERDICT_LABEL: Record<Verdict, string> = {
  insufficient: "Dados insuficientes",
  none: "Sem diferença clara",
  trend: "Tendência favorável",
  consistent: "Resultado consistente",
};

export type Thresholds = {
  confidenceThreshold: number;
  minimumVisitors: number;
  minimumConversions: number;
  minimumDurationDays: number;
};

export type Evaluation = {
  objective: Objective;
  control: VariantMetrics | null;
  /** A melhor variante (pode ser o controlo), ou null sem dados ou em empate. */
  best: VariantMetrics | null;
  comparison: Comparison | null;
  verdict: Verdict;
  /** Por que o veredito é «dados insuficientes», em palavras. */
  reasons: string[];
  measures: { variant: VariantMetrics; measure: Measure; comparison: Comparison | null }[];
};

/**
 * Avalia o teste: cada variante contra a primeira (o controlo, «A»). A melhor é a de maior valor no
 * objectivo; o veredito usa a confiança dessa comparação e os mínimos do teste.
 */
export function evaluate(
  metrics: TestMetrics,
  objective: Objective,
  thresholds: Thresholds,
  startedAt: string | null,
  nowMs = Date.now(),
): Evaluation {
  const variants = metrics.variants;
  const control = variants[0] ?? null;
  if (!control || variants.length < 2) {
    return { objective, control, best: null, comparison: null, verdict: "insufficient", reasons: ["O teste precisa de duas variantes."], measures: [] };
  }
  const controlMeasure = measureOf(control, objective);
  const measures = variants.map((variant) => {
    const measure = measureOf(variant, objective);
    return { variant, measure, comparison: variant === control ? null : compare(controlMeasure, measure) };
  });
  const challengers = measures.filter((m) => m.comparison);
  const bestChallenger = challengers.reduce<(typeof challengers)[number] | null>(
    (acc, m) => (acc === null || m.measure.value > acc.measure.value ? m : acc),
    null,
  );
  // A melhor pode ser o próprio controlo: aí compara-se o controlo com a melhor desafiante (o ganho
  // é o dele) e o teste conclui a favor de A, em vez de ficar para sempre em «sem diferença clara».
  const controlWins = bestChallenger !== null && bestChallenger.measure.value <= controlMeasure.value;
  const top = controlWins
    ? { variant: control, measure: controlMeasure, comparison: compare(bestChallenger.measure, controlMeasure) }
    : bestChallenger;
  const comparison = top?.comparison ?? null;
  // Iguais ao controlo não são uma vitória de A: fica sem vencedora.
  const tie = controlWins && bestChallenger.measure.value === controlMeasure.value;

  const reasons: string[] = [];
  const minVisitors = Math.min(...variants.map((v) => v.visitors));
  if (minVisitors < thresholds.minimumVisitors)
    reasons.push(`Cada variante precisa de ${thresholds.minimumVisitors} visitantes; a menor tem ${minVisitors}.`);
  if (objective === "conversions" || objective === "revenue" || objective === "revenue_per_participant") {
    const minBuyers = Math.min(...variants.map((v) => v.buyers));
    if (minBuyers < thresholds.minimumConversions)
      reasons.push(`Cada variante precisa de ${thresholds.minimumConversions} compras; a menor tem ${minBuyers}.`);
  }
  if (startedAt) {
    const days = (nowMs - Date.parse(startedAt)) / 86_400_000;
    if (days < thresholds.minimumDurationDays)
      reasons.push(`O teste tem de correr ${thresholds.minimumDurationDays} dias; vai em ${Math.max(0, Math.floor(days))}.`);
  }

  let verdict: Verdict;
  if (reasons.length > 0) verdict = "insufficient";
  else if (!comparison || !top || tie) verdict = "none";
  else if (comparison.confidence >= thresholds.confidenceThreshold) verdict = "consistent";
  else if (comparison.confidence >= 80) verdict = "trend";
  else verdict = "none";

  return { objective, control, best: tie ? null : (top?.variant ?? null), comparison, verdict, reasons, measures };
}

/** «12,5%», «3,2 €»: o valor de uma medida em texto. */
export function formatMeasure(measure: Measure, currency = "EUR"): string {
  if (measure.kind === "rate") return `${(measure.value * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 2 }).format(measure.value);
  } catch {
    return `${measure.value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${currency}`;
  }
}
