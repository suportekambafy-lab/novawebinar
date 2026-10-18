import { afterEach, describe, expect, it } from "vitest";
import { clockOffset, serverNow, setClockOffset } from "./server-clock";

describe("relógio do servidor", () => {
  afterEach(() => setClockOffset(0));

  it("um telemóvel 5 minutos adiantado corrige-se", () => {
    const local = 1_000_000_000;
    // O servidor respondeu 5 min antes da hora do telemóvel, numa ida e volta de 200 ms.
    const offset = clockOffset(local - 300_000 + 100, local, local + 200);
    expect(offset).toBe(-300_000);
    setClockOffset(offset);
    expect(serverNow(local)).toBe(local - 300_000);
  });

  it("diferenças pequenas ou absurdas ficam a zero", () => {
    expect(clockOffset(1_000_500, 1_000_000, 1_000_200)).toBe(0);
    expect(clockOffset(Number.NaN, 0, 10)).toBe(0);
    expect(clockOffset(10 * 24 * 3600_000, 0, 10)).toBe(0);
  });
});
