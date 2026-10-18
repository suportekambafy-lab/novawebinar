import { describe, expect, it } from "vitest";
import { lifecycleLabel, sessionState, sessionWindow, webinarLifecycle } from "./schedule";

const H = 3_600_000;
const start = Date.parse("2026-10-12T19:00:00Z");
const single = { schedule_mode: "scheduled", scheduled_at: "2026-10-12T19:00:00Z", timezone: "UTC", duration_seconds: 3600 };

describe("ciclo de vida de uma sessão com data única", () => {
  it("agendada antes da hora, em andamento até ao fim, terminada depois", () => {
    expect(lifecycleLabel(webinarLifecycle(single, start - H))).toBe("Agendado");
    expect(lifecycleLabel(webinarLifecycle(single, start + H / 2))).toBe("Em andamento");
    expect(lifecycleLabel(webinarLifecycle(single, start + H))).toBe("Terminado");
  });

  it("a hora de fim definida manda sobre a duração do vídeo", () => {
    const withEnd = { ...single, session_end_time: "21:30" };
    const at = start + 2 * H;
    expect(webinarLifecycle(withEnd, at)).toMatchObject({ kind: "session", state: "live" });
    expect(webinarLifecycle(withEnd, start + 2.5 * H)).toMatchObject({ state: "finished" });
  });

  it("sem duração nem hora de fim não se inventa o fim", () => {
    const unknown = { ...single, duration_seconds: 0 };
    const lifecycle = webinarLifecycle(unknown, start + 10 * H);
    expect(lifecycle).toMatchObject({ kind: "session", state: "live", endMs: null });
    expect(lifecycleLabel(lifecycle)).toBe("Iniciado");
  });

  it("um webinar inactivo não tem sessão a decorrer", () => {
    expect(webinarLifecycle({ ...single, status: "draft" }, start + H / 2)).toEqual({ kind: "draft" });
  });
});

describe("sem sessão global", () => {
  it("sem horário é sob demanda: nunca termina para todos", () => {
    expect(webinarLifecycle({ timezone: "UTC", duration_seconds: 3600 }, start)).toEqual({ kind: "on_demand" });
  });

  it("just in time recomeça para quem chega: não tem um fim global", () => {
    expect(webinarLifecycle({ schedule_mode: "jit", jit_interval_minutes: 15 }, start)).toEqual({
      kind: "jit",
      intervalMinutes: 15,
    });
  });
});

describe("repetição automática", () => {
  it("depois de uma sessão terminar, mostra a próxima e guarda o fim da anterior", () => {
    const daily = {
      recurrence_enabled: true,
      recurrence_pattern: "daily",
      recurrence_start_time: "19:00",
      timezone: "UTC",
      duration_seconds: 3600,
    };
    const lifecycle = webinarLifecycle(daily, start + 2 * H);
    expect(lifecycle).toMatchObject({ kind: "session", state: "scheduled", lastEndedMs: start + H });
    expect(lifecycle.kind === "session" && lifecycle.startMs).toBe(start + 24 * H);
  });
});

describe("contagem depois de começar", () => {
  // O caso do teste A/B do leilão: repete às 20:30, vídeo de 3083 s, 10 min de contagem depois da hora.
  const daily = {
    recurrence_enabled: true,
    recurrence_pattern: "daily",
    recurrence_times: ["19:00"],
    recurrence_end_time: "",
    timezone: "UTC",
    duration_seconds: 3083,
    start_delay_seconds: 600,
  };

  it("a sessão acaba o vídeo depois de a contagem acabar, não à duração do vídeo", () => {
    const window = sessionWindow(daily, start + 60_000);
    expect(window).toMatchObject({ startMs: start, endMs: start + (600 + 3083) * 1000, live: true });
    // Aos 3083 s desde a hora o vídeo ainda vai a 2483 s: a sessão continua.
    expect(webinarLifecycle(daily, start + 3083 * 1000)).toMatchObject({ state: "live" });
    expect(webinarLifecycle(daily, start + 3683 * 1000)).toMatchObject({ state: "scheduled", lastEndedMs: start + 3683 * 1000 });
  });

  it("data única: o fim pela duração também conta a contagem", () => {
    const window = sessionWindow({ ...single, start_delay_seconds: 300 }, start);
    expect(window.endMs).toBe(start + H + 300_000);
  });

  it("uma hora de fim marcada antes de o vídeo acabar não o corta", () => {
    const early = { ...single, session_end_time: "20:00", start_delay_seconds: 600 };
    expect(sessionWindow(early, start).endMs).toBe(start + H + 600_000);
    const late = { ...single, session_end_time: "21:30", start_delay_seconds: 600 };
    expect(sessionWindow(late, start).endMs).toBe(start + 2.5 * H);
  });

  it("sem contagem, tudo fica como estava", () => {
    expect(sessionWindow({ ...single, session_end_time: "19:30" }, start).endMs).toBe(start + H / 2);
    expect(sessionWindow({ ...single, start_delay_seconds: 0 }, start).endMs).toBe(start + H);
  });

  it("sem duração conhecida não se inventa o fim", () => {
    expect(sessionWindow({ ...single, duration_seconds: 0, start_delay_seconds: 600 }, start).endMs).toBeNull();
  });
});

describe("regra do fim, igual à do varrimento da base de dados", () => {
  it("termina exactamente à hora prevista", () => {
    expect(sessionState(start, start + H, start + H - 1)).toBe("live");
    expect(sessionState(start, start + H, start + H)).toBe("finished");
    expect(sessionState(start, null, start + 100 * H)).toBe("live");
  });
});

describe("repetição em vários dias e horas", () => {
  // 12/10/2026 é segunda-feira.
  const base = {
    recurrence_enabled: true,
    recurrence_days: [2, 4],
    recurrence_times: ["20:00", "10:00"],
    timezone: "UTC",
    duration_seconds: 3600,
  };

  it("a próxima sessão é o primeiro dia e hora escolhidos que ainda não passaram", () => {
    const monday = Date.parse("2026-10-12T12:00:00Z");
    expect(sessionWindow(base, monday).startMs).toBe(Date.parse("2026-10-13T10:00:00Z"));
    const tuesdayNoon = Date.parse("2026-10-13T12:00:00Z");
    expect(sessionWindow(base, tuesdayNoon).startMs).toBe(Date.parse("2026-10-13T20:00:00Z"));
    const tuesdayNight = Date.parse("2026-10-13T22:00:00Z");
    expect(sessionWindow(base, tuesdayNight).startMs).toBe(Date.parse("2026-10-15T10:00:00Z"));
  });

  it("a meio de uma sessão, está a decorrer", () => {
    const during = Date.parse("2026-10-13T20:30:00Z");
    expect(sessionWindow(base, during)).toMatchObject({ live: true, startMs: Date.parse("2026-10-13T20:00:00Z") });
  });

  it("sem dias escolhidos segue a regra antiga (todos os dias à hora de início)", () => {
    const daily = { recurrence_enabled: true, recurrence_start_time: "09:00", timezone: "UTC", duration_seconds: 600 };
    expect(sessionWindow(daily, Date.parse("2026-10-12T12:00:00Z")).startMs).toBe(Date.parse("2026-10-13T09:00:00Z"));
  });
});

describe("just in time sem noites", () => {
  const jit = { schedule_mode: "jit", jit_interval_minutes: 15, jit_skip_night: true, timezone: "Africa/Luanda" };

  it("entre as 22:00 e as 07:00 a sessão seguinte é às 07:00", () => {
    // 23:10 em Luanda (UTC+1) = 22:10 UTC.
    const night = Date.parse("2026-10-12T22:10:00Z");
    expect(sessionWindow(jit, night)).toMatchObject({ live: false, startMs: Date.parse("2026-10-13T06:00:00Z") });
  });

  it("de dia recomeça de 15 em 15 minutos como sempre", () => {
    const day = Date.parse("2026-10-12T14:05:00Z");
    expect(sessionWindow(jit, day).startMs).toBe(Date.parse("2026-10-12T14:15:00Z"));
  });
});

describe("hora de fim no dia seguinte, na noite de mudança de hora", () => {
  it("Lisboa, 28→29 de março: começa às 23:00 e acaba às 03:00 locais (02:00 UTC)", () => {
    const night = {
      schedule_mode: "scheduled",
      scheduled_at: "2026-03-28T23:00:00Z",
      session_end_time: "03:00",
      timezone: "Europe/Lisbon",
      duration_seconds: 3600,
    };
    expect(sessionWindow(night, Date.parse("2026-03-28T23:30:00Z")).endMs).toBe(Date.parse("2026-03-29T02:00:00Z"));
  });
});
