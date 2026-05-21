/**
 * statsAggregators tests
 *
 * Times use a fixed `now` so day boundaries are deterministic. We construct
 * MobileTask fixtures inline rather than mocking, since the aggregators are
 * pure functions over the shape.
 */

import { describe, expect, it } from "vitest";
import {
  completionsByDay,
  currentStreak,
  kpis,
  rollingAverage,
} from "../lib/statsAggregators";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

// Fixed reference point: 2025-06-15 12:00 local.
const NOW = new Date(2025, 5, 15, 12, 0, 0, 0).getTime();

type TaskOverrides = Omit<Partial<MobileTask>, "_id"> & { _id?: string };
function makeTask(overrides: TaskOverrides): MobileTask {
  const { _id, ...rest } = overrides;
  return {
    _id: (_id ?? "t1") as Id<"tasks">,
    title: "task",
    status: "inbox",
    position: 0,
    updatedAt: NOW,
    ...rest,
  };
}

function daysAgo(n: number, hour = 10): number {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

describe("completionsByDay", () => {
  it("zero-fills empty days across the window", () => {
    const out = completionsByDay([], NOW, 7);
    expect(out).toHaveLength(7);
    expect(out.every((p) => p.count === 0)).toBe(true);
    // Last point should be today's local date.
    expect(out[6].date).toBe("2025-06-15");
    expect(out[0].date).toBe("2025-06-09");
  });

  it("buckets completions by local day, ignoring non-completed", () => {
    const tasks = [
      makeTask({ _id: "a", status: "completed", updatedAt: daysAgo(0) }),
      makeTask({ _id: "b", status: "completed", updatedAt: daysAgo(0, 18) }),
      makeTask({ _id: "c", status: "completed", updatedAt: daysAgo(2) }),
      makeTask({ _id: "d", status: "inbox", updatedAt: daysAgo(0) }),
    ];
    const out = completionsByDay(tasks, NOW, 7);
    const byDate = Object.fromEntries(out.map((p) => [p.date, p.count]));
    expect(byDate["2025-06-15"]).toBe(2);
    expect(byDate["2025-06-13"]).toBe(1);
    expect(byDate["2025-06-14"]).toBe(0);
  });

  it("excludes completions older than the window", () => {
    const tasks = [
      makeTask({ _id: "old", status: "completed", updatedAt: daysAgo(10) }),
      makeTask({ _id: "in", status: "completed", updatedAt: daysAgo(3) }),
    ];
    const out = completionsByDay(tasks, NOW, 7);
    const total = out.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(1);
  });
});

describe("rollingAverage", () => {
  it("returns counts unchanged when window=1", () => {
    const series = [
      { date: "a", count: 1 },
      { date: "b", count: 3 },
      { date: "c", count: 5 },
    ];
    expect(rollingAverage(series, 1)).toEqual([1, 3, 5]);
  });

  it("averages over a trailing window, partial at the start", () => {
    const series = [0, 2, 4, 6].map((count, i) => ({ date: `d${i}`, count }));
    expect(rollingAverage(series, 3)).toEqual([0, 1, 2, 4]);
  });
});

describe("currentStreak", () => {
  it("returns 0 with no completions", () => {
    expect(currentStreak([], NOW)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const tasks = [0, 1, 2].map((n) =>
      makeTask({ _id: `t${n}`, status: "completed", updatedAt: daysAgo(n) }),
    );
    expect(currentStreak(tasks, NOW)).toBe(3);
  });

  it("looks back from yesterday if today is empty", () => {
    const tasks = [1, 2].map((n) =>
      makeTask({ _id: `t${n}`, status: "completed", updatedAt: daysAgo(n) }),
    );
    expect(currentStreak(tasks, NOW)).toBe(2);
  });

  it("breaks on a missing day", () => {
    const tasks = [0, 2].map((n) =>
      makeTask({ _id: `t${n}`, status: "completed", updatedAt: daysAgo(n) }),
    );
    expect(currentStreak(tasks, NOW)).toBe(1);
  });
});

describe("kpis", () => {
  it("counts inbox, 7-day completions, and overdue scheduled/deadline tasks", () => {
    const todayKey = "2025-06-15";
    const yesterdayKey = "2025-06-14";
    const tasks: MobileTask[] = [
      makeTask({ _id: "i1", status: "inbox" }),
      makeTask({ _id: "i2", status: "inbox" }),
      makeTask({ _id: "c1", status: "completed", updatedAt: daysAgo(0) }),
      makeTask({ _id: "c2", status: "completed", updatedAt: daysAgo(6) }),
      makeTask({ _id: "c3", status: "completed", updatedAt: daysAgo(8) }),
      makeTask({
        _id: "od1",
        status: "scheduled",
        scheduledDate: yesterdayKey,
      }),
      makeTask({
        _id: "od2",
        status: "scheduled",
        deadline: yesterdayKey,
      }),
      // Same-day scheduled — not overdue.
      makeTask({ _id: "ok1", status: "scheduled", scheduledDate: todayKey }),
      // Completed yesterday — not overdue even though deadline is past.
      makeTask({
        _id: "done-old",
        status: "completed",
        deadline: yesterdayKey,
        updatedAt: daysAgo(0),
      }),
    ];
    const k = kpis(tasks, NOW);
    expect(k.inbox).toBe(2);
    // c1, c2, and done-old all completed within the 7-day window.
    expect(k.completed7d).toBe(3);
    expect(k.overdue).toBe(2);
    expect(k.streak).toBeGreaterThanOrEqual(1);
  });
});
