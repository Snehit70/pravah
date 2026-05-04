import { describe, expect, it } from "vitest";
import { buildTimelineWindow } from "../hooks/useTaskQueries";

describe("useTaskQueries timeline window", () => {
  it("builds a seven-day window from today to weekEnd", () => {
    const base = new Date("2026-05-01T10:30:00.000Z");
    const window = buildTimelineWindow(base);

    expect(window.today).toBe("2026-05-01");
    expect(window.tomorrow).toBe("2026-05-02");
    expect(window.weekEnd).toBe("2026-05-07");
  });

  it("keeps ISO date format stable across month boundaries", () => {
    const base = new Date("2026-01-30T08:00:00.000Z");
    const window = buildTimelineWindow(base);

    expect(window.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.weekEnd).toBe("2026-02-05");
  });

  it("overdueStart is exactly 14 days before today", () => {
    const base = new Date("2026-05-01T10:30:00.000Z");
    const window = buildTimelineWindow(base);

    expect(window.overdueStart).toBe("2026-04-17");
  });

  it("overdueStart is before today so overdue tasks are not filtered out", () => {
    const base = new Date("2026-03-01T00:00:00.000Z");
    const window = buildTimelineWindow(base);

    expect(window.overdueStart < window.today).toBe(true);
    // Specifically 14 days back, crossing a month boundary
    expect(window.overdueStart).toBe("2026-02-15");
  });
});
