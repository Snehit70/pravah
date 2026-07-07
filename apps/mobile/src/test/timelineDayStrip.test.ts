/**
 * Day-strip week model (ADR-0009): builds an honest Sun–Sat week around the
 * viewed card, marking which days are reachable, which carry live tasks, and
 * which holds the active marker.
 */

import { describe, expect, it } from "vitest";
import { buildDayStrip } from "../lib/timelineDayStrip";
import type { DayCarouselCard } from "../lib/timelineCarousel";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

const TODAY = "2026-07-05"; // a Sunday — its week is Jul 5..11

function task(id: string, deadline: string): MobileTask {
  return {
    _id: id as Id<"tasks">,
    title: `Task ${id}`,
    deadline,
    scheduledAt: 0,
    position: 0,
    updatedAt: 0,
    createdAt: 0,
  };
}

function dayCard(dateKey: string, count: number): DayCarouselCard {
  return {
    kind: "day",
    dateKey,
    tasks: Array.from({ length: count }, (_, i) => task(`${dateKey}-${i}`, dateKey)),
  };
}

describe("buildDayStrip", () => {
  it("returns null when there are no cards", () => {
    expect(buildDayStrip({ cards: [], currentIndex: null, today: TODAY })).toBeNull();
  });

  it("builds a Sun–Sat week around the current day card", () => {
    const week = buildDayStrip({
      cards: [dayCard(TODAY, 2), dayCard("2026-07-08", 1)],
      currentIndex: 0,
      today: TODAY,
    });
    expect(week?.cells.map((c) => c.dateKey)).toEqual([
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
    ]);
    expect(week?.cells.map((c) => c.weekdayLetter)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(week?.containsToday).toBe(true);
  });

  it("marks card-bearing days reachable with a presence dot, empty days as dead cells", () => {
    const week = buildDayStrip({
      cards: [dayCard(TODAY, 2), dayCard("2026-07-08", 1)],
      currentIndex: 0,
      today: TODAY,
    });
    const today = week?.cells[0];
    const empty = week?.cells[2]; // 2026-07-07, no card
    const other = week?.cells[3]; // 2026-07-08, has a card
    expect(today).toMatchObject({ cardIndex: 0, hasTasks: true, isToday: true, isActive: true });
    expect(empty).toMatchObject({ cardIndex: null, hasTasks: false, isActive: false });
    expect(other).toMatchObject({ cardIndex: 1, hasTasks: true, isActive: false });
  });

  it("keeps a held Day-clear day reachable but without a dot", () => {
    const week = buildDayStrip({
      cards: [dayCard(TODAY, 1), dayCard("2026-07-07", 0)],
      currentIndex: 1,
      today: TODAY,
    });
    const held = week?.cells[2]; // 2026-07-07, held with 0 tasks
    expect(held).toMatchObject({ cardIndex: 1, hasTasks: false, isActive: true });
  });

  it("anchors on today's week with no active cell when the Overdue card is current", () => {
    const week = buildDayStrip({
      cards: [{ kind: "overdue", count: 3 }, dayCard(TODAY, 1)],
      currentIndex: 0,
      today: TODAY,
    });
    expect(week?.containsToday).toBe(true);
    expect(week?.cells.some((c) => c.isActive)).toBe(false);
    // Today still shows as reachable behind the (unmarked) strip.
    expect(week?.cells[0]).toMatchObject({ cardIndex: 1, hasTasks: true });
  });

  it("slides to the viewed card's week and reports today off-strip", () => {
    const week = buildDayStrip({
      cards: [dayCard(TODAY, 1), dayCard("2026-07-20", 1)],
      currentIndex: 1,
      today: TODAY,
    });
    // 2026-07-20 is a Monday — its week starts Sunday 2026-07-19.
    expect(week?.cells[0].dateKey).toBe("2026-07-19");
    expect(week?.containsToday).toBe(false);
    expect(week?.cells[1]).toMatchObject({ dateKey: "2026-07-20", isActive: true });
  });
});
