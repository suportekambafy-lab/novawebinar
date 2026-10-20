import { describe, expect, it } from "vitest";

import { computeDuration, fixCausality } from "./ai-comments.functions";
import type { PlacementReport } from "./temporal/placement";

type Ctx = Parameters<typeof fixCausality>[0];
type Comment = Parameters<typeof fixCausality>[1][number];

const DURATION = 329;

function context(overrides: Partial<Ctx> = {}): Ctx {
  return {
    webinar: {
      public_title: "Teste",
      description: null,
      duration_seconds: 0,
      cta_text: null,
      cta_start_seconds: null,
      cta_price_now: null,
      host_name: null,
      sourceDuration: DURATION,
    },
    settings: {} as never,
    transcript: Array.from({ length: 33 }, (_, i) => ({ at: i * 10, text: `fala ${i}` })),
    duration: DURATION,
    start: 0,
    end: DURATION,
    ...overrides,
  };
}

function comment(at: number, index: number, extra: Partial<Comment> = {}): Comment {
  return {
    at,
    atMs: at * 1000,
    author: `Pessoa ${index}`,
    message: `Mensagem ${index}`,
    moment: "explicacao",
    kind: "espontaneo",
    anchor: null,
    reason: `razão ${index}`,
    slot: `s${index}`,
    ...extra,
  };
}

describe("fixCausality com vídeo de 329 s", () => {
  it("com segundos repetidos, nada fica depois do fim e os dois campos coincidem", () => {
    const input: Comment[] = [];
    let index = 0;
    for (const second of [0, 0, 0, 100, 100, 100, 100, 250, 250, 320, 325, 328, 329]) {
      for (let k = 0; k < 8; k += 1) input.push(comment(second, index++));
    }
    const report: PlacementReport<Comment> = { dropped: [] };
    const kept = fixCausality(context(), input, report);

    expect(kept.length).toBeGreaterThan(0);
    for (const c of kept) {
      expect(c.at).toBeLessThanOrEqual(DURATION);
      expect(c.atMs!).toBeLessThanOrEqual(DURATION * 1000);
      expect(c.at).toBe(Math.round(c.atMs! / 1000));
    }
    for (let i = 1; i < kept.length; i += 1) expect(kept[i]!.at).toBeGreaterThan(kept[i - 1]!.at);
    expect(kept.length + report.dropped.length).toBeLessThanOrEqual(input.length);
    expect(report.dropped.length).toBeGreaterThan(0);
    for (const d of report.dropped) {
      expect(["sem_espaco", "depois_do_fim", "causa_depois_do_fim"]).toContain(d.reason);
      expect(d.comment.message).toMatch(/^Mensagem/);
    }
    // Metadados intactos nos comentários mantidos.
    for (const c of kept) {
      expect(c.reason).toBe(`razão ${c.message.replace("Mensagem ", "")}`);
      expect(c.slot).toBe(`s${c.message.replace("Mensagem ", "")}`);
    }
  });

  it("uma resposta cuja pergunta só permite um instante depois do fim é descartada e rastreada", () => {
    const input = [
      comment(328, 1, { kind: "responde", anchor: 328 }), // precisa de 331 s > 329 s
      comment(100, 2, { kind: "responde", anchor: 100 }), // vai para 103 s
    ];
    const report: PlacementReport<Comment> = { dropped: [] };
    const kept = fixCausality(context(), input, report);

    expect(kept.map((c) => c.message)).toEqual(["Mensagem 2"]);
    expect(kept[0]!.at).toBe(103);
    expect(kept[0]!.atMs).toBe(103_000);
    expect(report.dropped).toHaveLength(1);
    expect(report.dropped[0]!.reason).toBe("causa_depois_do_fim");
    expect(report.dropped[0]!.comment.message).toBe("Mensagem 1");
  });

  it("um comentário de oferta antes do CTA vai para depois do CTA, nunca para depois do fim", () => {
    const ctx = context({ webinar: { ...context().webinar, cta_start_seconds: 300 } });
    const input = [
      comment(50, 1, { moment: "oferta" }), // 306 s
      comment(60, 2, { moment: "oferta" }), // 308 s (afastamento)
    ];
    const report: PlacementReport<Comment> = { dropped: [] };
    const kept = fixCausality(ctx, input, report);
    expect(kept.map((c) => c.at)).toEqual([306, 308]);
    expect(kept.map((c) => c.atMs)).toEqual([306_000, 308_000]);
    expect(report.dropped).toHaveLength(0);
  });
});

describe("computeDuration respeita a duração real do vídeo", () => {
  it("a duração do ficheiro manda sobre a transcrição", () => {
    const webinar = context().webinar;
    const transcript = [{ at: 0, text: "a" }, { at: 322, text: "b" }];
    expect(computeDuration(webinar, transcript)).toBe(329);
  });

  it("só estima pela transcrição quando não há duração real", () => {
    const webinar = { ...context().webinar, sourceDuration: 0, duration_seconds: 0 };
    expect(computeDuration(webinar, [{ at: 322, text: "b" }])).toBe(382);
    expect(computeDuration(webinar, [])).toBe(1800);
  });

  it("uma transcrição mais longa do que o ficheiro corrige a duração para cima", () => {
    const webinar = { ...context().webinar, sourceDuration: 300 };
    expect(computeDuration(webinar, [{ at: 322, text: "b" }])).toBe(322);
  });
});
