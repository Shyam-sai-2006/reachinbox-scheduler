import { describe, it, expect } from "vitest";
import { calculateScheduleTimes } from "@reachinbox/shared";

describe("Unit Tests: Schedule Time Calculation", () => {
  it("calculates sequential schedule timestamps accurately", () => {
    const start = new Date("2026-09-29T10:00:00.000Z");
    const delayMs = 2000;
    const count = 5;

    const times = calculateScheduleTimes(start, count, delayMs);

    expect(times).toHaveLength(5);
    expect(times[0].toISOString()).toBe("2026-09-29T10:00:00.000Z");
    expect(times[1].toISOString()).toBe("2026-09-29T10:00:02.000Z");
    expect(times[2].toISOString()).toBe("2026-09-29T10:00:04.000Z");
    expect(times[3].toISOString()).toBe("2026-09-29T10:00:06.000Z");
    expect(times[4].toISOString()).toBe("2026-09-29T10:00:08.000Z");
  });

  it("handles delayMs = 0 (all scheduled for immediate start time)", () => {
    const start = new Date("2026-09-29T12:00:00.000Z");
    const times = calculateScheduleTimes(start, 3, 0);

    expect(times).toHaveLength(3);
    expect(times[0].getTime()).toBe(start.getTime());
    expect(times[1].getTime()).toBe(start.getTime());
    expect(times[2].getTime()).toBe(start.getTime());
  });

  it("calculates 1000 scheduled emails correctly without precision loss", () => {
    const start = new Date("2026-09-29T00:00:00.000Z");
    const delayMs = 1500;
    const count = 1000;

    const times = calculateScheduleTimes(start, count, delayMs);
    expect(times).toHaveLength(1000);
    expect(times[999].getTime()).toBe(start.getTime() + 999 * 1500);
  });
});
