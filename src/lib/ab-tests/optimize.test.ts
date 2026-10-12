import { describe, expect, it } from "vitest";
import { optimizedRecently, planRebalance, roundShares, warmupOver, type Arm } from "./optimize";
import type { Measure } from "./stats";

const rate = (hits: number, n: number): Measure => ({ kind: "rate", hits, n, value: n > 0 ? hits / n : 0 });
const arm = (id: string, traffic: number, hits: number, n: number): Arm => ({ id, label: id.toUpperCase(), traffic, measure: rate(hits, n) });

describe("optimização automática do tráfego", () => {
  it("sem visitantes suficientes não mexe e diz porquê", () => {
    const plan = planRebalance([arm("a", 50, 2, 10), arm("b", 50, 5, 12)]);
    expect(plan.changed).toBe(false);
    expect(plan.reason).toContain("visitantes suficientes");
    expect(plan.next).toEqual({ a: 50, b: 50 });
  });

  it("com uma líder clara move 10 pontos por dia para ela, e para por volta do tecto", () => {
    let arms = [arm("a", 50, 40, 1000), arm("b", 50, 80, 1000)];
    const day1 = planRebalance(arms);
    expect(day1.changed).toBe(true);
    expect(day1.leader?.id).toBe("b");
    expect(day1.next).toEqual({ a: 40, b: 60 });
    expect(day1.reason).toContain("B vai à frente");
    // Vários dias seguidos: nunca passa do tecto nem deixa a outra abaixo do mínimo.
    for (let day = 0; day < 10; day += 1) {
      const plan = planRebalance(arms);
      arms = arms.map((a) => ({ ...a, traffic: plan.next[a.id]! }));
    }
    expect(arms.find((a) => a.id === "b")?.traffic).toBe(90);
    expect(arms.find((a) => a.id === "a")?.traffic).toBe(10);
  });

  it("com uma vantagem fraca a líder só chega a pouco mais de metade", () => {
    const plan = planRebalance([arm("a", 50, 100, 1000), arm("b", 50, 104, 1000)]);
    expect(plan.confidence).toBeLessThan(0.3);
    expect(plan.next["b"]).toBeLessThanOrEqual(60);
    expect(plan.next["a"]! + plan.next["b"]!).toBe(100);
  });

  it("empate não mexe", () => {
    const plan = planRebalance([arm("a", 50, 50, 500), arm("b", 50, 50, 500)]);
    expect(plan.changed).toBe(false);
    expect(plan.reason).toContain("empatadas");
  });

  it("com três variantes as fatias somam sempre 100 e nenhuma cai abaixo do mínimo", () => {
    const plan = planRebalance([arm("a", 34, 30, 500), arm("b", 33, 60, 500), arm("c", 33, 20, 500)]);
    const total = Object.values(plan.next).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
    expect(Math.min(...Object.values(plan.next))).toBeGreaterThanOrEqual(10);
    expect(plan.leader?.id).toBe("b");
  });

  it("arredonda fatias para inteiros que somam 100", () => {
    expect(roundShares({ a: 33.3, b: 33.3, c: 33.4 })).toEqual({ a: 33, b: 33, c: 34 });
    expect(roundShares({ a: 50.5, b: 49.5 })).toEqual({ a: 51, b: 49 });
  });

  it("aquecimento e cadência diária", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    expect(warmupOver("2026-10-01T12:00:00Z", 7, now)).toBe(true);
    expect(warmupOver("2026-10-10T12:00:00Z", 7, now)).toBe(false);
    expect(warmupOver(null, 7, now)).toBe(false);
    expect(optimizedRecently("2026-10-12T02:00:00Z", now)).toBe(true);
    expect(optimizedRecently("2026-10-10T02:00:00Z", now)).toBe(false);
    expect(optimizedRecently(null, now)).toBe(false);
  });
});
