/**
 * Kairo ↔ overdue-reflow bridge
 *
 * Wraps the deterministic reflow engine (./reflow) so Kairo's agentic loop can
 * drive it conversationally. Two pure entry points:
 *   - `planOverdueReflow` — a read-only preview: per-goal "here's what I'd do",
 *     plus orphans (no goal / no deadline) for manual triage. Changes nothing.
 *   - `buildReflowActions` — expands a reflow request into the exact list of
 *     `KairoAction`s to apply (reschedules + optional goal-deadline moves).
 *
 * The intelligence (deciding *to* reflow, explaining it, handling orphans) is
 * the model's; the math stays in the engine. The model only chooses to call —
 * it never transcribes dates, so a reflow is always deterministic regardless of
 * how the conversation goes. Actions run through the existing
 * `applyKairoActions` executor, so undo/chips are unchanged.
 *
 * The engine needs `position` (plan order) and the goal corpus, which the thin
 * read env doesn't carry — so the caller binds these functions to the real
 * MobileTask corpus + goal links and injects them as a runtime into the agent.
 */

import type { MobileTask } from "../components/TaskCard";
import type { GoalItem } from "./goalsStorage";
import type { KairoAction } from "./kairoApi";
import type { HandleRegistry } from "./kairoTools";
import { bucketOverdue, computeReflow } from "./reflow";

export interface KairoReflowEnv {
  /** The full MobileTask corpus (with `position`) — same data the timeline
   *  uses, not the thin read env which lacks plan order. */
  tasks: MobileTask[];
  goals: GoalItem[];
  /** taskId → goalId. */
  goalLinks: Record<string, string>;
  today: string;
  registry: HandleRegistry;
}

export interface ReflowApplyArgs {
  /** Limit the reflow to a single goal handle (e.g. "G2"). */
  goalHandle?: string;
  /** Move each goal's deadline to the new projected end. When omitted, only
   *  already-passed deadlines are moved (mirrors the triage sheet default);
   *  false never touches a deadline. */
  extendDeadlines?: boolean;
}

/** Cap on how many per-task before→after rows the preview returns per goal, so
 *  a giant slipped plan can't blow the tool-result token budget. */
const PREVIEW_CHANGES_CAP = 40;

function deadlinePassed(goal: GoalItem, today: string): boolean {
  return (goal.deadline ?? "") < today;
}

/**
 * Read-only preview of a goal-aware reschedule. Registers a handle for every
 * task/goal it surfaces so the model can act on them in a later round (e.g.
 * triage orphans with reschedule_task). Changes nothing.
 */
export function planOverdueReflow(env: KairoReflowEnv) {
  const { tasks, goals, goalLinks, today, registry } = env;
  const buckets = bucketOverdue(tasks, goalLinks, goals, today);

  const goalsOut = buckets.groups.map((group) => {
    const result = computeReflow(group, today);
    const oldById = new Map(group.planTasks.map((t) => [String(t._id), t.scheduledDate]));
    const titleById = new Map(group.planTasks.map((t) => [String(t._id), t.title]));
    const changes = result.assignments
      .filter((a) => oldById.get(a.taskId) !== a.scheduledDate)
      .slice(0, PREVIEW_CHANGES_CAP)
      .map((a) => ({
        handle: registry.handleForTask(a.taskId),
        title: titleById.get(a.taskId) ?? "",
        from: oldById.get(a.taskId) ?? null,
        to: a.scheduledDate,
      }));

    return {
      goalHandle: registry.handleForGoal(group.goal.id),
      goal: group.goal.text,
      deadline: group.goal.deadline ?? null,
      deadlinePassed: deadlinePassed(group.goal, today),
      overdueCount: group.overdueCount,
      mode: result.mode,
      rescheduleCount: result.movedCount,
      futureMovedCount: result.futureMovedCount,
      projectedEnd: result.projectedEnd,
      exceedsDeadline: result.exceedsDeadline,
      suggestedDeadline: result.suggestedDeadline ?? null,
      changes,
    };
  });

  const orphans = buckets.orphans.map((t) => ({
    handle: registry.handleForTask(String(t._id)),
    title: t.title,
    scheduledDate: t.scheduledDate ?? null,
  }));

  return { totalOverdue: buckets.totalOverdue, goals: goalsOut, orphans };
}

export interface ReflowApplyPlanGoal {
  goal: string;
  mode: "spread" | "march";
  rescheduleCount: number;
  projectedEnd: string;
  suggestedDeadline: string | null;
  deadlineMoved: boolean;
}

export interface ReflowApplyPlan {
  goals: ReflowApplyPlanGoal[];
  totalRescheduled: number;
}

/**
 * Expand a reflow request into the concrete `KairoAction`s to apply. Only
 * date-changing reschedules are emitted (unchanged tasks are skipped), plus an
 * `updateGoal` per goal when its deadline should move. Returns the actions and
 * a plan summary the agent folds into the tool result for the model to relay.
 */
export function buildReflowActions(
  env: KairoReflowEnv,
  args: ReflowApplyArgs
): { actions: KairoAction[]; plan: ReflowApplyPlan } {
  const { tasks, goals, goalLinks, today, registry } = env;
  const buckets = bucketOverdue(tasks, goalLinks, goals, today);

  let groups = buckets.groups;
  if (args.goalHandle) {
    const goalId = registry.goalIdMap[args.goalHandle];
    groups = goalId ? groups.filter((g) => g.goal.id === goalId) : [];
  }

  const actions: KairoAction[] = [];
  const planGoals: ReflowApplyPlanGoal[] = [];

  for (const group of groups) {
    const result = computeReflow(group, today);
    const oldById = new Map(group.planTasks.map((t) => [String(t._id), t.scheduledDate]));

    let rescheduleCount = 0;
    for (const a of result.assignments) {
      if (oldById.get(a.taskId) === a.scheduledDate) continue; // unchanged
      actions.push({
        kind: "reschedule",
        handle: registry.handleForTask(a.taskId),
        scheduledDate: a.scheduledDate,
      });
      rescheduleCount += 1;
    }

    const shouldMoveDeadline =
      result.suggestedDeadline !== undefined &&
      (args.extendDeadlines === true ||
        (args.extendDeadlines === undefined && deadlinePassed(group.goal, today)));

    let deadlineMoved = false;
    if (shouldMoveDeadline && result.suggestedDeadline) {
      actions.push({
        kind: "updateGoal",
        handle: registry.handleForGoal(group.goal.id),
        deadline: result.suggestedDeadline,
      });
      deadlineMoved = true;
    }

    planGoals.push({
      goal: group.goal.text,
      mode: result.mode,
      rescheduleCount,
      projectedEnd: result.projectedEnd,
      suggestedDeadline: result.suggestedDeadline ?? null,
      deadlineMoved,
    });
  }

  const totalRescheduled = actions.reduce(
    (n, a) => (a.kind === "reschedule" ? n + 1 : n),
    0
  );
  return { actions, plan: { goals: planGoals, totalRescheduled } };
}
