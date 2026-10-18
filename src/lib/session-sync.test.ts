import { describe, expect, it } from "vitest";
import { sessionEndFor } from "./session-sync";

const start = Date.parse("2026-10-18T19:30:00Z");
const daily = {
  recurrence_enabled: true,
  recurrence_pattern: "daily",
  recurrence_times: ["19:30"],
  timezone: "UTC",
  duration_seconds: 3083,
};

describe("sessionEndFor", () => {
  it("o fim de uma sessão aberta segue o vídeo e a contagem depois de começar", () => {
    expect(sessionEndFor(daily, start)).toBe(start + 3083_000);
    const countdown = { live: { countdown: { afterOn: true, after: 10 } } };
    expect(sessionEndFor({ ...daily, chat_settings: countdown }, start)).toBe(start + 3683_000);
  });

  it("a duração do vídeo da biblioteca manda sobre a do webinar", () => {
    expect(sessionEndFor({ ...daily, duration_seconds: 0, video_sources: { duration_seconds: 4697 } }, start)).toBe(start + 4697_000);
  });

  it("uma hora que já não é sessão do webinar (horário mudado) fica como está", () => {
    expect(sessionEndFor({ ...daily, recurrence_times: ["21:00"] }, start)).toBeUndefined();
  });
});
