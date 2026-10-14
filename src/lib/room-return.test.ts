import { describe, expect, it } from "vitest";
import { keepOriginalSession, viewerPlan, type ViewerState } from "./room-return";

const NOW = Date.parse("2026-10-09T14:17:00Z");
const opts = { nowMs: NOW, durationSeconds: 3600, replayEnabled: true, schedule: { schedule_mode: "jit" } };
const state = (startsAt: string, extra: Partial<ViewerState> = {}): ViewerState => ({
  session: { startsAt, endsAt: null },
  watchedSeconds: 0,
  bought: false,
  ...extra,
});

describe("a sala segue a sessão de cada pessoa", () => {
  it("just in time: inscrita para as 14:15, volta às 14:17 e entra ao vivo na sessão dela (não na das 14:30)", () => {
    expect(viewerPlan(state("2026-10-09T14:15:00Z"), opts)).toEqual({ kind: "session", startMs: Date.parse("2026-10-09T14:15:00Z") });
  });

  it("a sessão dela ainda não começou: espera por ela", () => {
    expect(viewerPlan(state("2026-10-10T20:00:00Z"), opts).kind).toBe("session");
  });

  it("data única: a sessão dela acabou, «terminou» (o replay só pelo link do replay, e a sala diz se existe); quem comprou tem acesso", () => {
    const past = state("2026-10-08T20:00:00Z", { watchedSeconds: 1240 });
    const single = { ...opts, schedule: { scheduled_at: "2026-10-08T20:00:00Z" } };
    const startMs = Date.parse("2026-10-08T20:00:00Z");
    expect(viewerPlan(past, single)).toEqual({ kind: "ended", startMs, replayAvailable: true });
    expect(viewerPlan(past, { ...single, replayEnabled: false })).toEqual({ kind: "ended", startMs, replayAvailable: false });
    expect(viewerPlan({ ...past, bought: true }, single)).toEqual({ kind: "bought" });
  });

  it("webinar que repete: a sessão dela acabou e volta pelo link de sempre: a live seguinte, não o replay (quem comprou tem acesso)", () => {
    const past = state("2026-10-08T20:00:00Z", { watchedSeconds: 1240 });
    expect(viewerPlan(past, opts)).toEqual({ kind: "global" });
    expect(viewerPlan(past, { ...opts, schedule: { recurrence_enabled: true } })).toEqual({ kind: "global" });
    expect(viewerPlan({ ...past, bought: true }, opts)).toEqual({ kind: "bought" });
  });

  it("o fim gravado na sessão manda sobre a duração do vídeo", () => {
    const s = { session: { startsAt: "2026-10-09T13:00:00Z", endsAt: "2026-10-09T15:00:00Z" }, watchedSeconds: 0, bought: false };
    expect(viewerPlan(s, opts).kind).toBe("session");
  });

  it("just in time sem replay: quem nunca viu a sessão dela entra na seguinte (não fica preso em «terminou»)", () => {
    const missed = state("2026-10-08T20:00:00Z");
    expect(viewerPlan(missed, { ...opts, replayEnabled: false })).toEqual({ kind: "global" });
    // Data única: a sessão dela era a única; terminou mesmo.
    const single = { ...opts, replayEnabled: false, schedule: { scheduled_at: "2026-10-08T20:00:00Z" } };
    expect(viewerPlan(missed, single).kind).toBe("ended");
  });

  it("data única remarcada ou agora sempre disponível: a sessão antiga já não conta, segue a do webinar", () => {
    const old = state("2026-10-10T20:00:00Z");
    expect(viewerPlan(old, { ...opts, schedule: { scheduled_at: "2026-10-17T20:00:00Z" } })).toEqual({ kind: "global" });
    expect(viewerPlan(old, { ...opts, schedule: { scheduled_at: null } })).toEqual({ kind: "global" });
    expect(viewerPlan(old, { ...opts, schedule: { scheduled_at: "2026-10-10T20:00:00.000+00:00" } }).kind).toBe("session");
    expect(viewerPlan(old, { ...opts, schedule: { recurrence_enabled: true } }).kind).toBe("session");
  });

  it("sem sessão própria (replay pelo link, teste): a sala de sempre", () => {
    expect(viewerPlan(null, opts)).toEqual({ kind: "global" });
    expect(viewerPlan({ session: null, watchedSeconds: 0, bought: false }, opts)).toEqual({ kind: "global" });
  });
});

describe("segunda inscrição", () => {
  it("fica na sessão original enquanto não acabou, ou se já viu; quem nunca entrou numa sessão acabada vai para a seguinte", () => {
    expect(keepOriginalSession(null, false, NOW)).toBe(true);
    expect(keepOriginalSession(NOW + 60_000, false, NOW)).toBe(true);
    expect(keepOriginalSession(NOW - 60_000, true, NOW)).toBe(true);
    expect(keepOriginalSession(NOW - 60_000, false, NOW)).toBe(false);
    // Num webinar que repete, a sessão acabada não prende ninguém, mesmo quem já viu.
    expect(keepOriginalSession(NOW - 60_000, true, NOW, true)).toBe(false);
    expect(keepOriginalSession(NOW + 60_000, true, NOW, true)).toBe(true);
  });
});
