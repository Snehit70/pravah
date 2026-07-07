/**
 * Axis construction for the comfortable-mode day carousel: overdue card
 * first, task days only, landing rules, held-date insertion.
 */

import { describe, expect, it } from "vitest";
import {
  buildDayCards,
  cardKey,
  findLandingIndex,
  OVERDUE_CARD_KEY,
} from "../lib/timelineCarousel";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

const TODAY = "2026-07-05";

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

function sectionsOf(...days: [string, number][]): [string, MobileTask[]][] {
  return days.map(([dateKey, count]) => [
    dateKey,
    Array.from({ length: count }, (_, i) => task(`${dateKey}-${i}`, dateKey)),
  ]);
}

describe("buildDayCards", () => {
  it("creates one card per task day and no filler days", () => {
    const { cards } = buildDayCards({
      sections: sectionsOf([TODAY, 2], ["2026-07-08", 1]),
      today: TODAY,
      includeOverdueCard: true,
    });
    expect(cards.map(cardKey)).toEqual([TODAY, "2026-07-08"]);
  });

  it("collapses overdue sections into a single leftmost card", () => {
    const { cards } = buildDayCards({
      sections: sectionsOf(["2026-07-01", 2], ["2026-07-03", 1], [TODAY, 1]),
      today: TODAY,
      includeOverdueCard: true,
    });
    expect(cards[0]).toEqual({ kind: "overdue", count: 3 });
    expect(cards.map(cardKey)).toEqual([OVERDUE_CARD_KEY, TODAY]);
  });

  it("prefers the workspace-wide overdue count when provided", () => {
    const { cards } = buildDayCards({
      sections: sectionsOf(["2026-07-01", 1], [TODAY, 1]),
      today: TODAY,
      overdueCount: 9,
      includeOverdueCard: true,
    });
    expect(cards[0]).toEqual({ kind: "overdue", count: 9 });
  });

  it("omits the overdue card when triage is unavailable", () => {
    const { cards } = buildDayCards({
      sections: sectionsOf(["2026-07-01", 2], [TODAY, 1]),
      today: TODAY,
      includeOverdueCard: false,
    });
    expect(cards.map(cardKey)).toEqual([TODAY]);
  });

  it("lands on today when today has tasks", () => {
    const { landingIndex, cards } = buildDayCards({
      sections: sectionsOf(["2026-07-01", 1], [TODAY, 1], ["2026-07-09", 1]),
      today: TODAY,
      includeOverdueCard: true,
    });
    expect(cardKey(cards[landingIndex])).toBe(TODAY);
  });

  it("lands on the first upcoming day when today is clear", () => {
    const { landingIndex, cards } = buildDayCards({
      sections: sectionsOf(["2026-07-01", 1], ["2026-07-08", 1], ["2026-07-11", 1]),
      today: TODAY,
      includeOverdueCard: true,
    });
    expect(cardKey(cards[landingIndex])).toBe("2026-07-08");
  });

  it("lands on the overdue card only when it is the sole card", () => {
    const { landingIndex, cards } = buildDayCards({
      sections: sectionsOf(["2026-07-01", 2]),
      today: TODAY,
      includeOverdueCard: true,
    });
    expect(cards).toHaveLength(1);
    expect(landingIndex).toBe(0);
    expect(cards[0].kind).toBe("overdue");
  });

  it("keeps a held date on the axis at its sorted position", () => {
    const { cards } = buildDayCards({
      sections: sectionsOf([TODAY, 1], ["2026-07-09", 1]),
      today: TODAY,
      includeOverdueCard: true,
      heldDateKey: "2026-07-07",
    });
    expect(cards.map(cardKey)).toEqual([TODAY, "2026-07-07", "2026-07-09"]);
    const held = cards[1];
    expect(held.kind === "day" && held.tasks).toEqual([]);
  });

  it("does not duplicate a held date that still has tasks", () => {
    const { cards } = buildDayCards({
      sections: sectionsOf([TODAY, 1]),
      today: TODAY,
      includeOverdueCard: true,
      heldDateKey: TODAY,
    });
    expect(cards.map(cardKey)).toEqual([TODAY]);
    const card = cards[0];
    expect(card.kind === "day" && card.tasks).toHaveLength(1);
  });

  it("never holds a past date (overdue bucketing owns it after rollover)", () => {
    const { cards } = buildDayCards({
      sections: sectionsOf([TODAY, 1]),
      today: TODAY,
      includeOverdueCard: true,
      heldDateKey: "2026-07-01",
    });
    expect(cards.map(cardKey)).toEqual([TODAY]);
  });
});

describe("findLandingIndex", () => {
  it("returns 0 for an empty axis", () => {
    expect(findLandingIndex([], TODAY)).toBe(0);
  });
});
