import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DUE_SOON_DAYS,
  daysBetween,
  formatDay,
  formatDeadline,
  generateDateRange,
  getLocalDateString,
  parseLocalDate,
} from "../lib/utils";

describe("utils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns local date strings in YYYY-MM-DD format", () => {
    const date = new Date(2026, 3, 9, 20, 30, 0);
    expect(getLocalDateString(date)).toBe("2026-04-09");
  });

  it("parses local dates without UTC rollover issues", () => {
    const parsed = parseLocalDate("2026-04-09");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(3);
    expect(parsed.getDate()).toBe(9);
  });

  it("formats day metadata consistently", () => {
    const formatted = formatDay("2026-04-09");
    expect(formatted.dayName).toBe("Thu");
    expect(formatted.dayNum).toBe(9);
    expect(formatted.monthShort).toBe("Apr");
  });

  it("calculates day differences correctly", () => {
    expect(daysBetween("2026-04-09", "2026-04-09")).toBe(0);
    expect(daysBetween("2026-04-09", "2026-04-12")).toBe(3);
    expect(daysBetween("2026-04-12", "2026-04-09")).toBe(-3);
  });

  it("formats deadline states for overdue, near-term, and far dates", () => {
    expect(formatDeadline("2026-04-08", "2026-04-09")).toBe("Overdue");
    expect(formatDeadline("2026-04-09", "2026-04-09")).toBe("Due today");
    expect(formatDeadline("2026-04-10", "2026-04-09")).toBe("Due tomorrow");
    expect(formatDeadline("2026-04-11", "2026-04-09")).toBe("Due in 2d");
    expect(formatDeadline("2026-04-25", "2026-04-09")).toBe("Due Apr 25");
  });

  it("keeps due soon threshold at expected UX boundary", () => {
    expect(DUE_SOON_DAYS).toBe(3);
    expect(daysBetween("2026-04-09", "2026-04-12")).toBeLessThanOrEqual(DUE_SOON_DAYS);
    expect(daysBetween("2026-04-09", "2026-04-13")).toBeGreaterThan(DUE_SOON_DAYS);
  });

  it("generates a stable date window around today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 9, 9, 0, 0));

    const dates = generateDateRange(2, 3);
    expect(dates).toEqual([
      "2026-04-07",
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
      "2026-04-11",
    ]);
  });
});
