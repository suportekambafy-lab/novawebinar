import { describe, expect, it } from "vitest";
import { evaluate, normalCdf, parseMetrics, studentTCdf, twoProportionZ, welchT, type VariantMetrics } from "./stats";

const variant = (over: Partial<VariantMetrics>): VariantMetrics => ({
  id: over.id ?? "v",
  label: over.label ?? "A",
  name: "",
  webinarId: null,
  webinarTitle: null,
  traffic: 50,
  position: over.position ?? 0,
  durationSeconds: 3600,
  pitchSeconds: 1800,
  visitors: 0,
  exposures: 0,
  participants: 0,
  started: 0,
  p25: 0,
  p50: 0,
  p75: 0,
  p90: 0,
  completed: 0,
  pitch: 0,
  offerViews: 0,
  clicks: 0,
  buyers: 0,
  revenue: 0,
  revenueSq: 0,
  watchedTotal: 0,
  retention: [],
  devices: {},
  sources: {},
  ...over,
});

const thresholds = { confidenceThreshold: 95, minimumVisitors: 500, minimumConversions: 30, minimumDurationDays: 3 };

describe("distribuições", () => {
  it("a normal padrão bate com os valores de tabela", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("a t de Student aproxima a normal com muitos graus e é mais larga com poucos", () => {
    expect(studentTCdf(1.96, 1_000_000)).toBeCloseTo(0.975, 3);
    // Com 5 graus de liberdade, t = 2,015 deixa 2,5% na cauda (tabela).
    expect(studentTCdf(2.015, 5)).toBeCloseTo(0.95, 2);
  });
});

describe("teste z de duas proporções", () => {
  it("10% contra 15% em 1000 pessoas cada: diferença real, confiança acima de 99%", () => {
    const r = twoProportionZ(100, 1000, 150, 1000);
    expect(r.lift).toBeCloseTo(0.5, 6);
    expect(r.statistic).toBeCloseTo(3.39, 1);
    expect(r.confidence).toBeGreaterThan(99);
  });

  it("taxas iguais não dão confiança nenhuma", () => {
    expect(twoProportionZ(50, 500, 50, 500).confidence).toBe(0);
  });

  it("sem gente não há teste", () => {
    expect(twoProportionZ(0, 0, 3, 10)).toMatchObject({ pValue: 1, confidence: 0 });
  });
});

describe("teste t de Welch", () => {
  it("receita média 10 contra 14 com a mesma dispersão em 200 pessoas: diferença consistente", () => {
    // Soma dos quadrados = n·(média² + variância), com variância 25 (desvio 5).
    const r = welchT(2000, 200 * (100 + 25), 200, 2800, 200 * (196 + 25), 200);
    expect(r.lift).toBeCloseTo(0.4, 6);
    expect(r.statistic).toBeCloseTo(8, 0);
    expect(r.confidence).toBeGreaterThan(99);
  });

  it("com menos de duas pessoas por lado não se conclui nada", () => {
    expect(welchT(10, 100, 1, 20, 400, 1).confidence).toBe(0);
  });
});

describe("veredito", () => {
  const control = variant({ id: "a", label: "A", position: 0, visitors: 1000, participants: 800, started: 600, p50: 300, clicks: 120, buyers: 40, revenue: 4000, revenueSq: 400_000 });
  const better = variant({ id: "b", label: "B", position: 1, visitors: 1000, participants: 820, started: 650, p50: 400, clicks: 200, buyers: 80, revenue: 8000, revenueSq: 800_000 });
  const metrics = { variants: [control, better], assignmentMode: "legacy", computedAt: null };
  const started = new Date(Date.now() - 10 * 86_400_000).toISOString();

  it("com amostra, compras e dias suficientes e confiança alta: resultado consistente para a melhor", () => {
    const e = evaluate(metrics, "conversions", thresholds, started);
    expect(e.verdict).toBe("consistent");
    expect(e.best?.id).toBe("b");
    expect(e.comparison?.lift).toBeCloseTo(1, 6);
  });

  it("abaixo dos mínimos é «dados insuficientes», com as razões", () => {
    const e = evaluate(metrics, "conversions", { ...thresholds, minimumVisitors: 5000 }, started);
    expect(e.verdict).toBe("insufficient");
    expect(e.reasons[0]).toContain("5000 visitantes");
  });

  it("um teste a começar há um dia ainda não conclui", () => {
    const e = evaluate(metrics, "clicks", thresholds, new Date(Date.now() - 86_400_000).toISOString());
    expect(e.verdict).toBe("insufficient");
    expect(e.reasons[0]).toContain("3 dias");
  });

  it("sem diferença entre variantes não há vencedora", () => {
    const same = { ...metrics, variants: [control, { ...control, id: "b", label: "B", position: 1 }] };
    const e = evaluate(same, "conversions", thresholds, started);
    expect(e.verdict).toBe("none");
    expect(e.best).toBeNull();
  });

  it("objectivos de receita usam Welch; os de taxa usam z", () => {
    expect(evaluate(metrics, "revenue", thresholds, started).comparison?.test).toBe("welch");
    expect(evaluate(metrics, "retention", thresholds, started).comparison?.test).toBe("z");
  });
});

describe("leitura das métricas", () => {
  it("lê o JSON da base de dados e ordena as variantes pela posição", () => {
    const m = parseMetrics({
      variants: [
        { id: "b", label: "B", position: 1, visitors: "12", retention: [12, 10, "8"], devices: { mobile: { visitors: 10, buyers: 1 } } },
        { id: "a", label: "A", position: 0, visitors: 20, pitch: null },
      ],
      assignmentMode: "deterministic",
    });
    expect(m.variants.map((v) => v.id)).toEqual(["a", "b"]);
    expect(m.variants[1]).toMatchObject({ visitors: 12, retention: [12, 10, 8], devices: { mobile: { visitors: 10, buyers: 1 } } });
    expect(m.variants[0]?.pitch).toBeNull();
    expect(m.assignmentMode).toBe("deterministic");
  });
});
