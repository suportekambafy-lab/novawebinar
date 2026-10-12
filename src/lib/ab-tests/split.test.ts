import { describe, expect, it } from "vitest";
import { bucketOf, pickVariant, simulateSplit } from "./split";

const A = { id: "a", traffic_percentage: 50 };
const B = { id: "b", traffic_percentage: 50 };

describe("divisão do tráfego", () => {
  it("a mesma pessoa cai sempre no mesmo grupo, e pessoas diferentes espalham-se", () => {
    expect(bucketOf("v1", "t1")).toBe(bucketOf("v1", "t1"));
    const buckets = new Set(Array.from({ length: 200 }, (_, i) => bucketOf(`v${i}`, "t1")));
    expect(buckets.size).toBeGreaterThan(60);
  });

  it("50/50 dá perto de metade a cada variante em mil visitantes", () => {
    const counts = simulateSplit([A, B], "t1");
    expect(counts.get(A)).toBeGreaterThan(430);
    expect(counts.get(B)).toBeGreaterThan(430);
  });

  it("as fatias mandam: 90/10 dá quase tudo à primeira", () => {
    const counts = simulateSplit([{ id: "a", traffic_percentage: 90 }, { id: "b", traffic_percentage: 10 }], "t2");
    expect(counts.get(counts.keys().next().value!)).toBeGreaterThan(0);
    const a = [...counts.entries()].find(([v]) => v.id === "a")?.[1] ?? 0;
    expect(a).toBeGreaterThan(850);
  });

  it("uma variante a 0% nunca recebe ninguém; com a vencedora a 100%, todos vão para ela", () => {
    const counts = simulateSplit([{ id: "a", traffic_percentage: 0 }, { id: "b", traffic_percentage: 100 }], "t3");
    expect([...counts.entries()].find(([v]) => v.id === "a")).toBeUndefined();
    expect(pickVariant([{ id: "a", traffic_percentage: 0 }, { id: "b", traffic_percentage: 100 }], 0).id).toBe("b");
  });

  it("fatias que não somam 100 entregam o resto à última com tráfego", () => {
    expect(pickVariant([{ id: "a", traffic_percentage: 30 }, { id: "b", traffic_percentage: 30 }], 99).id).toBe("b");
  });
});
