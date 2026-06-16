import { describe, expect, it } from "vitest";
import { addDays, dateLabel, humanDate, isIsoDate, shortDate, toIsoDate } from "../lib/dates";

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

  it("labels overdue/today/tomorrow relatively and later dates by named day", () => {
    const today = "2026-04-14";
    const tomorrow = "2026-04-15";

    expect(dateLabel("2026-04-13", today, tomorrow)).toBe("Overdue");
    expect(dateLabel("2026-04-14", today, tomorrow)).toBe("Today");
    expect(dateLabel("2026-04-15", today, tomorrow)).toBe("Tomorrow");
    // From today+2 onward, every day gets a distinct named-day header.
    expect(dateLabel("2026-04-20", today, tomorrow)).toBe("Mon · Apr 20");
    expect(dateLabel("2026-04-28", today, tomorrow)).toBe("Tue · Apr 28");
  });

  it("formats canonical human dates and short dates", () => {
    expect(humanDate("2026-04-20")).toBe("Apr 20, 2026");
    expect(shortDate("2026-04-20")).toBe("Apr 20");
    expect(humanDate("not-a-date")).toBe("not-a-date");
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
