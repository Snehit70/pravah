import { describe, expect, it } from "vitest";
import { buildTimelineWindow } from "../hooks/useTaskQueries";

describe("useTaskQueries timeline window", () => {
  it("keeps weekEnd at today+6 and fetches the full forward horizon", () => {
    const base = new Date("2026-05-01T10:30:00.000Z");
    const window = buildTimelineWindow(base);

    expect(window.today).toBe("2026-05-01");
    expect(window.tomorrow).toBe("2026-05-02");
    expect(window.weekEnd).toBe("2026-05-07");
    // No horizon cap: the upper bound is the far-future sentinel.
    expect(window.queryEndDate).toBe("9999-12-31");
  });

  it("keeps ISO date format stable across month boundaries", () => {
    const base = new Date("2026-01-30T08:00:00.000Z");
    const window = buildTimelineWindow(base);

    expect(window.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.weekEnd).toBe("2026-02-05");
    expect(window.queryEndDate).toBe("9999-12-31");
  });
});
