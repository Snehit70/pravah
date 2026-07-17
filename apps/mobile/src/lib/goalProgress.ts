/**
 * goalProgress
 *
 * Pure derivation of per-goal completion from the local goals + goal-links
 * stores against the in-memory task list. Mirrors the logic GoalsScreen uses
 * (linked tasks done / total) so the Progress page reports identical ratios,
 * without either screen reaching into the other.
 */

import type { MobileTask } from "../components/TaskCard";
import type { GoalItem } from "./goalsStorage";
import type { GoalLinkMap } from "./goalLinks";
import { isTaskCompleted } from "./taskState";

export type GoalProgressRow = {
  goal: GoalItem;
  total: number;
  done: number;
  ratio: number;
};

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

/** Progress for every goal, in the goals' given order. */
export function computeGoalProgress(
  goals: GoalItem[],
  links: GoalLinkMap,
  tasks: MobileTask[],
): GoalProgressRow[] {
  const taskById = new Map(tasks.map((t) => [String(t._id), t]));
  const byGoal = new Map<string, MobileTask[]>();
  for (const [taskId, goalId] of Object.entries(links)) {
    const t = taskById.get(taskId);
    if (!t) continue;
    const list = byGoal.get(goalId);
    if (list) list.push(t);
    else byGoal.set(goalId, [t]);
  }
  return goals.map((goal) => {
    const list = byGoal.get(goal.id) ?? [];
    const total = list.length;
    const done = list.filter(isTaskCompleted).length;
    return { goal, total, done, ratio: total === 0 ? 0 : done / total };
  });
}

/**
 * Goals worth surfacing on Progress: those with linked tasks still in flight
 * (not yet fully done). Sorted by nearest deadline first, then priority, then
 * furthest-along — so the most pressing movement leads.
 */
export function goalsInMotion(rows: GoalProgressRow[]): GoalProgressRow[] {
  return rows
    .filter((r) => r.total > 0 && r.done < r.total)
    .sort((a, b) => {
      const ad = a.goal.deadline;
      const bd = b.goal.deadline;
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      const pr =
        (PRIORITY_RANK[a.goal.priority ?? ""] ?? 3) -
        (PRIORITY_RANK[b.goal.priority ?? ""] ?? 3);
      if (pr !== 0) return pr;
      return b.ratio - a.ratio;
    });
}
