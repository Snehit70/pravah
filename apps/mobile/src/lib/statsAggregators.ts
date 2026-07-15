/**
 * statsAggregators
 *
 * Pure functions over MobileTask[] that compute the figures shown on the
 * Stats screen. Everything is computed on-device from the data we already
 * have in memory — no extra Convex queries. Functions are deliberately
 * stateless so they're trivial to memoize and to unit-test.
 *
 * Historical metrics use immutable `scheduledAt` and `completedAt` timestamps.
 */

import type { MobileTask } from "../components/TaskCard";
import { isTaskCompleted, isTaskInInbox, isTaskOnTimeline } from "./taskState";

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
    if (!isTaskCompleted(t) || t.completedAt === undefined) continue;
    if (t.completedAt < cutoff) continue;
    const key = localDateKey(t.completedAt);
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
 * Centered weighted rolling average (radius = floor(window/2)). window=1 returns
 * the input. Unlike a trailing average, it introduces no directional lag — a
 * real peak stays plotted on its own day rather than drifting later — so the
 * smoothed hero line reads calm *and* honest. Edges weight only the samples that
 * exist, so the line starts immediately rather than after a gap.
 *
 * The kernel is **triangular** (weight `radius + 1 - |i - j|`), not a boxcar.
 * A boxcar weights every day in the window equally, which makes the curve hold a
 * value and then step as a single busy day enters and leaves the window — those
 * flat shelves are an artefact of the kernel, not a fact about the data. A
 * triangular kernel is the convolution of two boxcars, so its output is
 * continuous in the first derivative: no shelves, no kinks. It stays a true
 * centred average (symmetric weights ⇒ no lag) and needs no wider window.
 */
export function rollingAverage(series: DayPoint[], window: number): number[] {
  if (window <= 1) return series.map((p) => p.count);
  const radius = Math.floor(window / 2);
  const n = series.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - radius);
    const end = Math.min(n - 1, i + radius);
    let sum = 0;
    let weight = 0;
    for (let j = start; j <= end; j++) {
      const w = radius + 1 - Math.abs(i - j);
      sum += series[j].count * w;
      weight += w;
    }
    out.push(sum / weight);
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
    if (isTaskCompleted(t) && t.completedAt !== undefined) days.add(localDateKey(t.completedAt));
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
    if (isTaskCompleted(t) && (t.completedAt ?? 0) >= sevenDaysAgo) completed7d++;
    if (isTaskInInbox(t)) inbox++;
    const isOverdue = isTaskOnTimeline(t) && !!t.deadline && t.deadline < todayKey;
    if (isOverdue) overdue++;
  }
  return {
    streak: currentStreak(tasks, now),
    completed7d,
    overdue,
    inbox,
  };
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Among completions inside the trailing `days` window, which weekday saw
 * the most done. Returns null when the window has fewer than 3 completions
 * — single-day spikes aren't a "pattern".
 */
export function bestWeekday(
  tasks: MobileTask[],
  now: number,
  days: number,
): { weekday: number; label: string; count: number } | null {
  const cutoff = addCalendarDays(startOfLocalDay(now), -(days - 1)).getTime();
  const counts = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const t of tasks) {
    if (!isTaskCompleted(t) || t.completedAt === undefined) continue;
    if (t.completedAt < cutoff) continue;
    const w = new Date(t.completedAt).getDay();
    counts[w]++;
    total++;
  }
  if (total < 3) return null;
  let best = 0;
  for (let i = 1; i < 7; i++) if (counts[i] > counts[best]) best = i;
  if (counts[best] === 0) return null;
  return { weekday: best, label: WEEKDAY_LABELS[best], count: counts[best] };
}

/**
 * Hour-of-day with the most completions in the window. Returned as a 24h
 * value so the caller can format ("10 AM", "14:00"). null when the sample
 * is too thin to be a pattern.
 */
export function peakHour(
  tasks: MobileTask[],
  now: number,
  days: number,
): { hour: number; count: number } | null {
  const cutoff = addCalendarDays(startOfLocalDay(now), -(days - 1)).getTime();
  const buckets = new Array<number>(24).fill(0);
  let total = 0;
  for (const t of tasks) {
    if (!isTaskCompleted(t) || t.completedAt === undefined) continue;
    if (t.completedAt < cutoff) continue;
    const h = new Date(t.completedAt).getHours();
    buckets[h]++;
    total++;
  }
  if (total < 3) return null;
  let best = 0;
  for (let i = 1; i < 24; i++) if (buckets[i] > buckets[best]) best = i;
  return { hour: best, count: buckets[best] };
}

/**
 * Full weekday distribution of completions inside the trailing `days` window,
 * indexed Sun(0)..Sat(6) to match WEEKDAY_LABELS. Unlike `bestWeekday`, this
 * returns every bucket with no significance gating — the rhythm mini-chart
 * renders all seven bars and the presentation layer decides how to treat a
 * thin sample. `total` is provided so callers can show a low-data state.
 */
export function completionsByWeekday(
  tasks: MobileTask[],
  now: number,
  days: number,
): { counts: number[]; total: number } {
  const cutoff = addCalendarDays(startOfLocalDay(now), -(days - 1)).getTime();
  const counts = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const t of tasks) {
    if (!isTaskCompleted(t) || t.completedAt === undefined) continue;
    if (t.completedAt < cutoff) continue;
    counts[new Date(t.completedAt).getDay()]++;
    total++;
  }
  return { counts, total };
}

/**
 * Full hour-of-day distribution of completions inside the trailing `days`
 * window, indexed 0..23 (local hour). Companion to `completionsByWeekday`
 * for the "focus by hour" curve; returns every bucket, ungated.
 */
export function completionsByHour(
  tasks: MobileTask[],
  now: number,
  days: number,
): { counts: number[]; total: number } {
  const cutoff = addCalendarDays(startOfLocalDay(now), -(days - 1)).getTime();
  const counts = new Array<number>(24).fill(0);
  let total = 0;
  for (const t of tasks) {
    if (!isTaskCompleted(t) || t.completedAt === undefined) continue;
    if (t.completedAt < cutoff) continue;
    counts[new Date(t.completedAt).getHours()]++;
    total++;
  }
  return { counts, total };
}

/**
 * Median elapsed days from scheduledAt to completedAt for tasks completed in
 * the window. Returns null when fewer than
 * 3 samples exist (median over 1–2 points is noise).
 */
export function medianCycleTimeDays(
  tasks: MobileTask[],
  now: number,
  days: number,
): number | null {
  const cutoff = addCalendarDays(startOfLocalDay(now), -(days - 1)).getTime();
  const elapsed: number[] = [];
  for (const t of tasks) {
    if (!isTaskCompleted(t) || t.completedAt === undefined) continue;
    if (t.completedAt < cutoff) continue;
    const ms = t.completedAt - t.scheduledAt;
    if (ms < 0) continue;
    elapsed.push(ms / (1000 * 60 * 60 * 24));
  }
  if (elapsed.length < 3) return null;
  elapsed.sort((a, b) => a - b);
  const mid = Math.floor(elapsed.length / 2);
  return elapsed.length % 2 === 0
    ? (elapsed[mid - 1] + elapsed[mid]) / 2
    : elapsed[mid];
}

/**
 * Longest run of consecutive local days with at least one completion, ever.
 * Useful as a "personal best" alongside the current streak.
 */
export function longestStreak(tasks: MobileTask[]): number {
  const days = new Set<string>();
  for (const t of tasks) {
    if (isTaskCompleted(t) && t.completedAt !== undefined) days.add(localDateKey(t.completedAt));
  }
  if (days.size === 0) return 0;
  const sorted = Array.from(days).sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const cur = new Date(sorted[i]);
    const diffDays = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }
  return longest;
}

export type ActiveBreakdown = {
  totalActive: number;
  p1: number;
  p2: number;
  p3: number;
  unprioritized: number;
  scheduled: number;
  inbox: number;
};

/** Snapshot of what's still on the user's plate, sliced by priority + lane. */
export function activeBreakdown(tasks: MobileTask[]): ActiveBreakdown {
  const out: ActiveBreakdown = {
    totalActive: 0,
    p1: 0,
    p2: 0,
    p3: 0,
    unprioritized: 0,
    scheduled: 0,
    inbox: 0,
  };
  for (const t of tasks) {
    if (!isTaskInInbox(t) && !isTaskOnTimeline(t)) continue;
    out.totalActive++;
    if (t.priority === "p1") out.p1++;
    else if (t.priority === "p2") out.p2++;
    else if (t.priority === "p3") out.p3++;
    else out.unprioritized++;
    if (isTaskInInbox(t)) out.inbox++;
    else if (isTaskOnTimeline(t)) out.scheduled++;
  }
  return out;
}

/**
 * Last 7 days incl. today vs. previous 7 days completion
 * counts and percent delta. null delta when the prior week is zero
 * (avoid divide-by-zero / infinity styling edge case).
 */
export function weekOverWeek(
  tasks: MobileTask[],
  now: number,
): { thisWeek: number; lastWeek: number; deltaPct: number | null } {
  const today0 = startOfLocalDay(now);
  const thisStart = addCalendarDays(today0, -6).getTime();
  const lastStart = addCalendarDays(today0, -13).getTime();
  const lastEnd = thisStart;
  let thisWeek = 0;
  let lastWeek = 0;
  for (const t of tasks) {
    if (!isTaskCompleted(t) || t.completedAt === undefined) continue;
    if (t.completedAt >= thisStart) thisWeek++;
    else if (t.completedAt >= lastStart && t.completedAt < lastEnd) lastWeek++;
  }
  const deltaPct = lastWeek === 0 ? null : ((thisWeek - lastWeek) / lastWeek) * 100;
  return { thisWeek, lastWeek, deltaPct };
}
