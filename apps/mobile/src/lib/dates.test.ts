import { describe, expect, it } from "vitest";
import { addDays, dateLabel, isIsoDate, toIsoDate } from "./dates";

describe("mobile dates helpers", () => {
  it("formats Date to YYYY-MM-DD", () => {
    const date = new Date(2026, 3, 14, 10, 20, 30);
    expect(toIsoDate(date)).toBe("2026-04-14");
  });

  it("adds days without mutating the original date", () => {
    const base = new Date(2026, 3, 14);
    const shifted = addDays(base, 3);

    expect(toIsoDate(base)).toBe("2026-04-14");
    expect(toIsoDate(shifted)).toBe("2026-04-17");
  });

  it("labels today, tomorrow, this week, and later dates", () => {
    const today = "2026-04-14";
    const tomorrow = "2026-04-15";
    const weekEnd = "2026-04-21";

    expect(dateLabel("2026-04-14", today, tomorrow, weekEnd)).toBe("Today");
    expect(dateLabel("2026-04-15", today, tomorrow, weekEnd)).toBe("Tomorrow");
    expect(dateLabel("2026-04-20", today, tomorrow, weekEnd)).toBe("This week");
    expect(dateLabel("2026-04-28", today, tomorrow, weekEnd)).toBe("2026-04-28");
  });

  it("validates strict ISO dates", () => {
    expect(isIsoDate("2026-04-14")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-4-14")).toBe(false);
    expect(isIsoDate("14-04-2026")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
  });
});
