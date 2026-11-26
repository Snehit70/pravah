/**
 * Done-section rules shared by the Timeline's carousel cards and list mode.
 *
 * Finished work leaves the open list and collects under a "Done · N" section
 * at the bottom of Today, newest first, so remaining work keeps the top of
 * the surface. Done means "finished today", so only Today has the section,
 * whatever date the task was due. A freshly checked row first settles in place for a beat, which
 * keeps a mistap easy to undo before the row moves.
 */

import type { MobileTask } from "../components/TaskCard";

/** How long a just-checked row stays in place before it moves to Done. */
export const DONE_SETTLE_MS = 1500;

/** The section starts expanded up to this many rows and collapsed beyond. */
export const DONE_SECTION_EXPANDED_MAX = 3;

/** Local-midnight bounds of a "YYYY-MM-DD" day: [startMs, endMs). */
export function localDayBounds(dateKey: string): { startMs: number; endMs: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return {
    startMs: new Date(year, month - 1, day).getTime(),
    endMs: new Date(year, month - 1, day + 1).getTime(),
  };
}

/**
 * Done tasks for one day. Only Today has any: everything completed today,
 * whatever its deadline, minus anything that is open again. Completions
 * stamped outside today are dropped, so a wider source (completed history,
 * a cached snapshot from yesterday) cannot leak in. Locally held completions
 * fill the gap until the server's list catches up. Newest completion first;
 * a task without a timestamp counts as just now.
 */
export function doneTasksForDay(
  dateKey: string,
  today: string,
  completed: readonly MobileTask[],
  held: readonly MobileTask[],
  openIds: ReadonlySet<string>
): MobileTask[] {
  if (dateKey !== today) return [];
  const { startMs, endMs } = localDayBounds(today);
  const seen = new Set<string>();
  const done: MobileTask[] = [];
  for (const task of [...held, ...completed]) {
    const id = String(task._id);
    if (openIds.has(id) || seen.has(id)) continue;
    if (task.completedAt !== undefined && (task.completedAt < startMs || task.completedAt >= endMs)) {
      continue;
    }
    seen.add(id);
    done.push(task);
  }
  return done.sort(
    (a, b) => (b.completedAt ?? Number.MAX_SAFE_INTEGER) - (a.completedAt ?? Number.MAX_SAFE_INTEGER)
  );
}

/** "11:42 AM" for a completion timestamp; null when it is unknown. */
export function formatDoneTime(completedAt: number | undefined): string | null {
  if (completedAt === undefined || !Number.isFinite(completedAt)) return null;
  const date = new Date(completedAt);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix}`;
}
