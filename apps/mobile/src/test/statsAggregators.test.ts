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
  completionsByHour,
  completionsByWeekday,
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
    scheduledAt: NOW - 1_000,
    position: 0,
    updatedAt: NOW,
    createdAt: NOW - 1_000,
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
      makeTask({ _id: "a", completedAt: daysAgo(0), updatedAt: daysAgo(4) }),
      makeTask({ _id: "b", completedAt: daysAgo(0, 18), updatedAt: daysAgo(4) }),
      makeTask({ _id: "c", completedAt: daysAgo(2), updatedAt: daysAgo(4) }),
      makeTask({ _id: "d", updatedAt: daysAgo(0) }),
    ];
    const out = completionsByDay(tasks, NOW, 7);
    const byDate = Object.fromEntries(out.map((p) => [p.date, p.count]));
    expect(byDate["2025-06-15"]).toBe(2);
    expect(byDate["2025-06-13"]).toBe(1);
    expect(byDate["2025-06-14"]).toBe(0);
  });

  it("excludes completions older than the window", () => {
    const tasks = [
      makeTask({ _id: "old", completedAt: daysAgo(10) }),
      makeTask({ _id: "in", completedAt: daysAgo(3) }),
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

  it("weights the centre day double its neighbours, partial at both edges", () => {
    // window=3 → radius 1 → triangular weights [1,2,1]: the centre day counts
    // twice, so the smooth has no directional lag (a peak stays on its real day)
    // and no boxcar shelf as a busy day enters or leaves the window.
    const series = [0, 2, 4, 6].map((count, i) => ({ date: `d${i}`, count }));
    // i0:(0*2+2*1)/3      i1:(0*1+2*2+4*1)/4=2
    // i2:(2*1+4*2+6*1)/4=4  i3:(4*1+6*2)/3
    expect(rollingAverage(series, 3)).toEqual([2 / 3, 2, 4, 16 / 3]);
  });

  it("leaves a flat run flat — weighting never invents a slope", () => {
    const series = [3, 3, 3, 3].map((count, i) => ({ date: `d${i}`, count }));
    expect(rollingAverage(series, 3)).toEqual([3, 3, 3, 3]);
  });

  it("is symmetric — a centered spike smooths without directional lag", () => {
    const series = [0, 0, 9, 0, 0].map((count, i) => ({ date: `d${i}`, count }));
    const avg = rollingAverage(series, 3);
    // A trailing average would drift the spike's weight to the right, breaking
    // this mirror symmetry; a centered one keeps it balanced on the real day.
    expect(avg).toEqual([...avg].reverse());
    expect(Math.max(...avg)).toBe(avg[2]);
  });
});

describe("currentStreak", () => {
  it("returns 0 with no completions", () => {
    expect(currentStreak([], NOW)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const tasks = [0, 1, 2].map((n) =>
      makeTask({ _id: `t${n}`, completedAt: daysAgo(n) }),
    );
    expect(currentStreak(tasks, NOW)).toBe(3);
  });

  it("looks back from yesterday if today is empty", () => {
    const tasks = [1, 2].map((n) =>
      makeTask({ _id: `t${n}`, completedAt: daysAgo(n) }),
    );
    expect(currentStreak(tasks, NOW)).toBe(2);
  });

  it("breaks on a missing day", () => {
    const tasks = [0, 2].map((n) =>
      makeTask({ _id: `t${n}`, completedAt: daysAgo(n) }),
    );
    expect(currentStreak(tasks, NOW)).toBe(1);
  });
});

describe("completionsByWeekday", () => {
  it("returns seven zeroed buckets with an empty task list", () => {
    const { counts, total } = completionsByWeekday([], NOW, 30);
    expect(counts).toHaveLength(7);
    expect(counts.every((c) => c === 0)).toBe(true);
    expect(total).toBe(0);
  });

  it("buckets by local weekday, ungated, ignoring non-completed and out-of-window", () => {
    // NOW is Sunday 2025-06-15 (getDay 0); daysAgo(2) is Friday (getDay 5).
    const tasks = [
      makeTask({ _id: "a", completedAt: daysAgo(0) }),
      makeTask({ _id: "b", completedAt: daysAgo(0, 18) }),
      makeTask({ _id: "c", completedAt: daysAgo(2) }),
      makeTask({ _id: "active", updatedAt: daysAgo(0) }),
      makeTask({ _id: "old", completedAt: daysAgo(40) }),
    ];
    const { counts, total } = completionsByWeekday(tasks, NOW, 30);
    expect(counts[0]).toBe(2); // Sunday
    expect(counts[5]).toBe(1); // Friday
    expect(total).toBe(3);
  });
});

describe("completionsByHour", () => {
  it("returns 24 zeroed buckets with an empty task list", () => {
    const { counts, total } = completionsByHour([], NOW, 30);
    expect(counts).toHaveLength(24);
    expect(counts.every((c) => c === 0)).toBe(true);
    expect(total).toBe(0);
  });

  it("buckets by local hour, ignoring non-completed and out-of-window", () => {
    const tasks = [
      makeTask({ _id: "a", completedAt: daysAgo(0, 9) }),
      makeTask({ _id: "b", completedAt: daysAgo(1, 9) }),
      makeTask({ _id: "c", completedAt: daysAgo(0, 18) }),
      makeTask({ _id: "active", updatedAt: daysAgo(0) }),
      makeTask({ _id: "old", completedAt: daysAgo(40, 9) }),
    ];
    const { counts, total } = completionsByHour(tasks, NOW, 30);
    expect(counts[9]).toBe(2);
    expect(counts[18]).toBe(1);
    expect(total).toBe(3);
  });
});

describe("kpis", () => {
  it("counts inbox, 7-day completions, and overdue scheduled/deadline tasks", () => {
    const todayKey = "2025-06-15";
    const yesterdayKey = "2025-06-14";
    const tasks: MobileTask[] = [
      makeTask({ _id: "i1" }),
      makeTask({ _id: "i2" }),
      makeTask({ _id: "c1", completedAt: daysAgo(0) }),
      makeTask({ _id: "c2", completedAt: daysAgo(6) }),
      makeTask({ _id: "c3", completedAt: daysAgo(8) }),
      makeTask({
        _id: "od1",
        deadline: yesterdayKey,
      }),
      makeTask({
        _id: "od2",
        deadline: yesterdayKey,
      }),
      // Same-day scheduled — not overdue.
      makeTask({ _id: "ok1", deadline: todayKey }),
      // Completed yesterday — not overdue even though deadline is past.
      makeTask({
        _id: "done-old",
        deadline: yesterdayKey,
        completedAt: daysAgo(0),
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
