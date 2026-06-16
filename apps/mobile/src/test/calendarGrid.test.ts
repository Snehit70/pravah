import { describe, expect, it } from "vitest";
import { buildMonthGrid } from "../lib/calendarGrid";

const flatDays = (grid: (number | null)[][]): number[] =>
  grid.flat().filter((d): d is number => d !== null);

describe("buildMonthGrid", () => {
  it("starts the week on Monday with no leading blank when the 1st is a Monday", () => {
    const grid = buildMonthGrid(2026, 5); // June 2026 — the 1st is a Monday
    expect(grid[0][0]).toBe(1);
    expect(flatDays(grid)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("pads leading blanks and handles a leap February", () => {
    const grid = buildMonthGrid(2024, 1); // Feb 2024 — the 1st is a Thursday (3 blanks)
    expect(grid[0].slice(0, 3)).toEqual([null, null, null]);
    expect(grid[0][3]).toBe(1);
    expect(flatDays(grid)).toHaveLength(29);
    expect(flatDays(grid)[28]).toBe(29);
  });

  it("always returns rows of exactly 7 cells", () => {
    const grid = buildMonthGrid(2026, 0);
    for (const row of grid) expect(row).toHaveLength(7);
  });
});
