/**
 * statsAggregators
 *
 * Pure functions over MobileTask[] that compute the figures shown on the
 * Stats screen. Everything is computed on-device from the data we already
 * have in memory — no extra Convex queries. Functions are deliberately
 * stateless so they're trivial to memoize and to unit-test.
 *
 * Completion time proxy: we don't (yet) store a dedicated `completedAt`
 * field, so for tasks with status="completed" we treat `updatedAt` as the
 * completion timestamp. This is accurate for the common case where the
 * complete mutation is the task's final write; it can drift if a user
 * edits a completed task's title afterwards. Acceptable for v1.
 */

import type { MobileTask } from "../components/TaskCard";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local-date YYYY-MM-DD key for a timestamp. */
function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Midnight of the given timestamp's local day, returned as a Date. */
function startOfLocalDay(ts: number): Date {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Advance a local-midnight Date by `n` calendar days (DST-safe). */
function addCalendarDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

export type DayPoint = { date: string; count: number };

/**
 * Tasks completed per local day, oldest first, with zero-fill so chart
 * x-axis is contiguous. Window is `days` ending at today (inclusive).
 */
export function completionsByDay(
  tasks: MobileTask[],
  now: number,
  days: number,
): DayPoint[] {
  const windowStart = addCalendarDays(startOfLocalDay(now), -(days - 1));
  const cutoff = windowStart.getTime();
  const buckets = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== "completed") continue;
    if (t.updatedAt < cutoff) continue;
    const key = localDateKey(t.updatedAt);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const out: DayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const key = localDateKey(addCalendarDays(windowStart, i).getTime());
    out.push({ date: key, count: buckets.get(key) ?? 0 });
  }
  return out;
}

/**
 * Right-aligned trailing rolling average. window=1 returns the input.
 * For positions where fewer than `window` samples exist, averages only
 * what's available (so the line starts immediately, not after a gap).
 */
export function rollingAverage(series: DayPoint[], window: number): number[] {
  if (window <= 1) return series.map((p) => p.count);
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += series[j].count;
    out.push(sum / (i - start + 1));
  }
  return out;
}

/**
 * Consecutive days, ending at today, with at least one completion. If
 * today has no completions yet we look back from yesterday so the streak
 * doesn't visually reset at midnight.
 */
export function currentStreak(tasks: MobileTask[], now: number): number {
  const days = new Set<string>();
  for (const t of tasks) {
    if (t.status === "completed") days.add(localDateKey(t.updatedAt));
  }
  if (days.size === 0) return 0;

  let cursorDay = startOfLocalDay(now);
  if (!days.has(localDateKey(cursorDay.getTime()))) {
    cursorDay = addCalendarDays(cursorDay, -1);
    if (!days.has(localDateKey(cursorDay.getTime()))) return 0;
  }
  let streak = 0;
  while (days.has(localDateKey(cursorDay.getTime()))) {
    streak++;
    cursorDay = addCalendarDays(cursorDay, -1);
  }
  return streak;
}

export type StatsKpis = {
  streak: number;
  completed7d: number;
  overdue: number;
  inbox: number;
};

/**
 * The four header tiles. Overdue counts tasks scheduled or with a deadline
 * strictly before today, still active (not completed/cancelled).
 */
export function kpis(tasks: MobileTask[], now: number): StatsKpis {
  const todayKey = localDateKey(now);
  const sevenDaysAgo = addCalendarDays(startOfLocalDay(now), -6).getTime();

  let completed7d = 0;
  let overdue = 0;
  let inbox = 0;
  for (const t of tasks) {
    if (t.status === "completed" && t.updatedAt >= sevenDaysAgo) completed7d++;
    if (t.status === "inbox") inbox++;
    const isOverdue =
      t.status !== "completed" &&
      t.status !== "cancelled" &&
      ((t.deadline && t.deadline < todayKey) ||
        (t.scheduledDate && t.scheduledDate < todayKey));
    if (isOverdue) overdue++;
  }
  return {
    streak: currentStreak(tasks, now),
    completed7d,
    overdue,
    inbox,
  };
}
