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

import type { MobileTask } from "../../components/TaskCard";
import type { GoalItem } from "../../lib/goalsStorage";
import { addDays, toIsoDate } from "../../lib/dates";
import { isTaskOnTimeline } from "../../lib/taskState";

export type ReflowAssignment = { taskId: string; deadline: string };

export type ReflowResult = {
  assignments: ReflowAssignment[];
  movedCount: number;
  futureMovedCount: number;
  projectedEnd: string;
  mode: "spread" | "march";
  exceedsDeadline: boolean;
  suggestedDeadline?: string;
};

export type ReflowGroup = {
  goal: GoalItem;
  overdueCount: number;
  planTasks: MobileTask[];
};

export type OverdueBuckets = {
  groups: ReflowGroup[];
  orphans: MobileTask[];
  totalOverdue: number;
};

type GoalLinks = Record<string, string>;

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addIso(iso: string, days: number): string {
  return toIsoDate(addDays(parseIsoLocal(iso), days));
}

export function daysBetween(a: string, b: string): number {
  const ms = parseIsoLocal(b).getTime() - parseIsoLocal(a).getTime();
  return Math.round(ms / 86_400_000);
}

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

function comparePlan(a: MobileTask, b: MobileTask): number {
  const ad = a.deadline ?? "";
  const bd = b.deadline ?? "";
  if (ad !== bd) return ad < bd ? -1 : 1;
  if (a.position !== b.position) return a.position - b.position;
  return String(a._id) < String(b._id) ? -1 : 1;
}

function isOverdue(task: MobileTask, today: string): boolean {
  return isTaskOnTimeline(task) && !!task.deadline && task.deadline < today;
}

export function bucketOverdue(
  tasks: MobileTask[],
  goalLinks: GoalLinks,
  goals: GoalItem[],
  today: string
): OverdueBuckets {
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const overdue = tasks.filter((task) => isOverdue(task, today));

  const orphans: MobileTask[] = [];
  const overdueGoalIds = new Set<string>();

  for (const task of overdue) {
    const goalId = goalLinks[String(task._id)];
    const goal = goalId ? goalById.get(goalId) : undefined;
    if (goal && goal.deadline) overdueGoalIds.add(goal.id);
    else orphans.push(task);
  }

  const groups: ReflowGroup[] = [];
  for (const goalId of overdueGoalIds) {
    const goal = goalById.get(goalId);
    if (!goal) continue;
    const planTasks = tasks
      .filter(
        (task) =>
          goalLinks[String(task._id)] === goalId &&
          isTaskOnTimeline(task)
      )
      .sort(comparePlan);
    const overdueCount = planTasks.filter((task) => isOverdue(task, today)).length;
    groups.push({ goal, overdueCount, planTasks });
  }

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

export function computeReflow(group: ReflowGroup, today: string): ReflowResult {
  const tasks = group.planTasks;
  const n = tasks.length;
  const deadline = group.goal.deadline ?? today;
  const daysAvailable = daysBetween(today, deadline) + 1;
  const deadlineUsable = deadline >= today && n > 0 && n <= daysAvailable;

  const assignments: ReflowAssignment[] = [];
  let mode: "spread" | "march";

  if (deadlineUsable) {
    mode = "spread";
    const span = daysAvailable - 1;
    for (let i = 0; i < n; i += 1) {
      const offset = n === 1 ? 0 : Math.round((i * span) / (n - 1));
      assignments.push({
        taskId: String(tasks[i]._id),
        deadline: addIso(today, offset),
      });
    }
  } else {
    mode = "march";
    for (let i = 0; i < n; i += 1) {
      assignments.push({
        taskId: String(tasks[i]._id),
        deadline: addIso(today, i),
      });
    }
  }

  const projectedEnd = assignments.reduce(
    (max, assignment) => (assignment.deadline > max ? assignment.deadline : max),
    today
  );
  const exceedsDeadline = projectedEnd > deadline;
  const suggestedDeadline = deadline < today || exceedsDeadline ? projectedEnd : undefined;

  const oldById = new Map(tasks.map((task) => [String(task._id), task.deadline]));
  let movedCount = 0;
  let futureMovedCount = 0;
  for (const assignment of assignments) {
    const old = oldById.get(assignment.taskId);
    if (old !== assignment.deadline) {
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
