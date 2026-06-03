/**
 * Overdue reflow engine — pure, deterministic, testable.
 *
 * Reschedules a goal's slipped plan back onto the calendar. The rules (agreed
 * in design):
 *  - Reflow is per-goal and deadline-anchored. Only goals that have a deadline
 *    and at least one overdue task qualify; everything else is an "orphan"
 *    routed to manual triage.
 *  - A reflow re-spreads the goal's *entire remaining incomplete scheduled
 *    plan* (overdue + still-future), in `position` order, so it never collides
 *    with its own future tasks.
 *  - Shape is hybrid by fit: when the deadline is in the future and the tasks
 *    fit at <=1/day, spread evenly across [today, deadline]. Otherwise (deadline
 *    passed, or more tasks than days left) fall back to a consecutive 1/day
 *    march from today and surface the projected end as a new deadline to offer.
 *
 * No LLM, no network — just arithmetic. Kairo wraps this later.
 */

import type { MobileTask } from "../components/TaskCard";
import type { GoalItem } from "./goalsStorage";
import { addDays, toIsoDate } from "./dates";

export type ReflowAssignment = { taskId: string; scheduledDate: string };

export type ReflowResult = {
  /** New date for every task in the plan (includes unchanged ones). */
  assignments: ReflowAssignment[];
  /** How many assignments actually change a task's date. */
  movedCount: number;
  /** Of the moved tasks, how many were future-dated (not overdue) — the
   *  surprising ones to call out in the preview. */
  futureMovedCount: number;
  /** Last scheduled date produced by the plan. */
  projectedEnd: string;
  mode: "spread" | "march";
  /** True when the plan finishes after the goal's existing deadline. */
  exceedsDeadline: boolean;
  /** A new deadline to offer the user (set when the old one is passed or
   *  exceeded); undefined when the existing deadline still holds. */
  suggestedDeadline?: string;
};

export type ReflowGroup = {
  /** Always has a `deadline` (may be in the past). */
  goal: GoalItem;
  /** Count of overdue tasks — what the sheet displays as the trigger. */
  overdueCount: number;
  /** Whole remaining incomplete scheduled plan, position-sorted. */
  planTasks: MobileTask[];
};

export type OverdueBuckets = {
  groups: ReflowGroup[];
  /** Overdue tasks with no goal, or whose goal has no deadline. */
  orphans: MobileTask[];
  totalOverdue: number;
};

type GoalLinks = Record<string, string>;

// ── Date helpers (local-midnight, matching dates.ts) ─────────────────────

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addIso(iso: string, days: number): string {
  return toIsoDate(addDays(parseIsoLocal(iso), days));
}

/** Whole days from `a` to `b` (b - a). Negative when b precedes a. */
export function daysBetween(a: string, b: string): number {
  const ms = parseIsoLocal(b).getTime() - parseIsoLocal(a).getTime();
  return Math.round(ms / 86_400_000);
}

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

function comparePlan(a: MobileTask, b: MobileTask): number {
  if (a.position !== b.position) return a.position - b.position;
  const ad = a.scheduledDate ?? "";
  const bd = b.scheduledDate ?? "";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return String(a._id) < String(b._id) ? -1 : 1;
}

function isOverdue(task: MobileTask, today: string): boolean {
  return (
    task.status === "scheduled" &&
    !!task.scheduledDate &&
    task.scheduledDate < today
  );
}

// ── Bucketing ────────────────────────────────────────────────────────────

/**
 * Split today's overdue tasks into per-goal reflow groups (goal must have a
 * deadline) and orphans (no goal, or goal without a deadline). Each group
 * carries the goal's whole remaining incomplete scheduled plan, not just the
 * overdue subset.
 */
export function bucketOverdue(
  tasks: MobileTask[],
  goalLinks: GoalLinks,
  goals: GoalItem[],
  today: string
): OverdueBuckets {
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const overdue = tasks.filter((t) => isOverdue(t, today));

  const orphans: MobileTask[] = [];
  const overdueGoalIds = new Set<string>();

  for (const task of overdue) {
    const goalId = goalLinks[String(task._id)];
    const goal = goalId ? goalById.get(goalId) : undefined;
    if (goal && goal.deadline) {
      overdueGoalIds.add(goal.id);
    } else {
      orphans.push(task);
    }
  }

  const groups: ReflowGroup[] = [];
  for (const goalId of overdueGoalIds) {
    const goal = goalById.get(goalId);
    if (!goal) continue;
    const planTasks = tasks
      .filter(
        (t) =>
          goalLinks[String(t._id)] === goalId &&
          t.status === "scheduled" &&
          !!t.scheduledDate
      )
      .sort(comparePlan);
    const overdueCount = planTasks.filter((t) => isOverdue(t, today)).length;
    groups.push({ goal, overdueCount, planTasks });
  }

  // Most urgent goals first: priority, then nearest (or most-overdue) deadline.
  groups.sort((a, b) => {
    const pa = PRIORITY_RANK[a.goal.priority ?? ""] ?? 3;
    const pb = PRIORITY_RANK[b.goal.priority ?? ""] ?? 3;
    if (pa !== pb) return pa - pb;
    const da = a.goal.deadline ?? "";
    const db = b.goal.deadline ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  return { groups, orphans, totalOverdue: overdue.length };
}

// ── The reflow itself ─────────────────────────────────────────────────────

/**
 * Compute new dates for a group's remaining plan. `today` is the ISO date the
 * reflow starts from. The group's goal is guaranteed to have a deadline.
 */
export function computeReflow(group: ReflowGroup, today: string): ReflowResult {
  const tasks = group.planTasks;
  const n = tasks.length;
  const deadline = group.goal.deadline ?? today;

  // Inclusive day budget from today through the deadline.
  const daysAvailable = daysBetween(today, deadline) + 1;
  const deadlineUsable = deadline >= today && n > 0 && n <= daysAvailable;

  const assignments: ReflowAssignment[] = [];
  let mode: "spread" | "march";

  if (deadlineUsable) {
    // Even-spread: first task today, last task on the deadline, the rest
    // distributed across the span.
    mode = "spread";
    const span = daysAvailable - 1;
    for (let i = 0; i < n; i += 1) {
      const offset = n === 1 ? 0 : Math.round((i * span) / (n - 1));
      assignments.push({
        taskId: String(tasks[i]._id),
        scheduledDate: addIso(today, offset),
      });
    }
  } else {
    // Cadence fallback: consecutive 1/day from today, ignore the dead anchor.
    mode = "march";
    for (let i = 0; i < n; i += 1) {
      assignments.push({
        taskId: String(tasks[i]._id),
        scheduledDate: addIso(today, i),
      });
    }
  }

  const projectedEnd = assignments.length
    ? assignments[assignments.length - 1].scheduledDate
    : today;
  const exceedsDeadline = projectedEnd > deadline;
  const suggestedDeadline =
    deadline < today || exceedsDeadline ? projectedEnd : undefined;

  const oldById = new Map(tasks.map((t) => [String(t._id), t.scheduledDate]));
  let movedCount = 0;
  let futureMovedCount = 0;
  for (const a of assignments) {
    const old = oldById.get(a.taskId);
    if (old !== a.scheduledDate) {
      movedCount += 1;
      if (old && old >= today) futureMovedCount += 1;
    }
  }

  return {
    assignments,
    movedCount,
    futureMovedCount,
    projectedEnd,
    mode,
    exceedsDeadline,
    suggestedDeadline,
  };
}
