import { describe, expect, it } from "vitest";
import { mergeLiveNow, mergeSessions, nowCount, roomNowFrom, type HeartbeatRow } from "./room-now";

const now = Date.parse("2026-10-13T21:07:00Z");
const row = (over: Partial<HeartbeatRow>): HeartbeatRow => ({
  person_id: "p1",
  webinar_id: "w1",
  webinar_title: "Workshop",
  viewing_mode: "live",
  device: "mobile",
  last_progress_at: new Date(now - 20_000).toISOString(),
  ...over,
});

describe("roomNowFrom", () => {
  it("conta quem bateu nos últimos 90 s, uma vez por pessoa e por webinar", () => {
    const r = roomNowFrom(
      [
        row({ person_id: "a" }),
        row({ person_id: "a" }), // a mesma pessoa em dois separadores
        row({ person_id: "b", device: "desktop", viewing_mode: "replay" }),
        row({ person_id: "c", webinar_id: "w2", webinar_title: "Outro" }),
        row({ person_id: "d", last_progress_at: new Date(now - 200_000).toISOString() }), // velho
      ],
      now,
    );
    expect(r.all).toEqual({ total: 3, live: 2, replay: 1, mobile: 2, desktop: 1 });
    expect(r.byWebinar.get("w1")).toEqual({ total: 2, live: 1, replay: 1, mobile: 1, desktop: 1, title: "Workshop" });
    expect(r.byWebinar.get("w2")?.total).toBe(1);
  });
});

describe("nowCount e mergeLiveNow", () => {
  it("fica com o maior das duas fontes, parcela a parcela", () => {
    expect(nowCount(4, 8)).toBe(8);
    expect(nowCount(5, 0)).toBe(5);
    const merged = mergeLiveNow(
      { total: 5, live: 5, replay: 0, mobile: 4, desktop: 1, clicked: 2, onOffer: null, located: 5 },
      { total: 8, live: 7, replay: 1, mobile: 6, desktop: 2 },
    );
    expect(merged).toMatchObject({ total: 8, live: 7, replay: 1, mobile: 6, desktop: 2, clicked: 2, located: 5 });
  });
});

describe("mergeSessions", () => {
  it("sobe os números das sessões da presença e junta as que só os batimentos conhecem", () => {
    const hb = roomNowFrom([row({ person_id: "a" }), row({ person_id: "b" }), row({ person_id: "c", webinar_id: "w2", webinar_title: "Outro" })], now);
    const merged = mergeSessions([{ webinarId: "w1", title: "Workshop", count: 1, live: 1, replay: 0, clicked: 1 }], hb);
    expect(merged.map((s) => [s.webinarId, s.count, s.clicked])).toEqual([["w1", 2, 1], ["w2", 1, 0]]);
  });
});
