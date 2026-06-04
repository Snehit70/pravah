import type { OverduePreviewData } from "../features/overdue-triage/types";
import type { HandleRegistry } from "./kairoTools";

export interface KairoReflowEnv {
  preview: OverduePreviewData | undefined;
  registry: HandleRegistry;
  today: string;
}

export interface ReflowApplyArgs {
  goalHandle?: string;
  extendDeadlines?: boolean;
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

const PREVIEW_CHANGES_CAP = 40;

export function planOverdueReflow(env: KairoReflowEnv) {
  if (!env.preview) {
    return {
      ok: false,
      error: "Overdue reflow is unavailable right now.",
      totalOverdue: 0,
      goals: [],
      orphans: [],
    };
  }

  return {
    ok: true,
    totalOverdue: env.preview.totalOverdue,
    goals: env.preview.groups.map((group) => ({
      goalHandle: env.registry.handleForGoal(group.goalId),
      goal: group.goalText,
      deadline: group.goalDeadline ?? null,
      deadlinePassed: Boolean(group.goalDeadline && group.goalDeadline < env.today),
      overdueCount: group.overdueCount,
      mode: group.mode,
      rescheduleCount: group.movedCount,
      futureMovedCount: group.futureMovedCount,
      projectedEnd: group.projectedEnd,
      exceedsDeadline: Boolean(group.suggestedDeadline),
      suggestedDeadline: group.suggestedDeadline ?? null,
      changes: group.tasks
        .filter((task) => task.changed)
        .slice(0, PREVIEW_CHANGES_CAP)
        .map((task) => ({
          handle: env.registry.handleForTask(task.taskId),
          title: task.title,
          from: task.currentDate ?? null,
          to: task.nextDate,
        })),
    })),
    orphans: env.preview.orphans.map((task) => ({
      handle: env.registry.handleForTask(task.taskId),
      title: task.title,
      scheduledDate: task.scheduledDate ?? null,
    })),
  };
}

export function buildReflowApply(
  env: KairoReflowEnv,
  args: ReflowApplyArgs
): {
  planToken: string;
  goalIdsToMoveDeadlines: string[];
  plan: ReflowApplyPlan;
} {
  if (!env.preview) {
    throw new Error("Overdue reflow is unavailable right now.");
  }

  let groups = env.preview.groups;
  if (args.goalHandle) {
    const goalId = env.registry.goalIdMap[args.goalHandle];
    groups = goalId ? groups.filter((group) => group.goalId === goalId) : [];
  }

  if (groups.length === 0) {
    return {
      planToken: env.preview.planToken,
      goalIdsToMoveDeadlines: [],
      plan: { goals: [], totalRescheduled: 0 },
    };
  }

  const singleGroup = groups.length === 1 ? groups[0] : null;
  const planToken = singleGroup?.planToken ?? env.preview.planToken;
  const goalIdsToMoveDeadlines = groups
    .filter((group) => {
      if (!group.suggestedDeadline) return false;
      if (args.extendDeadlines === true) return true;
      if (args.extendDeadlines === false) return false;
      return group.defaultApplyDeadline;
    })
    .map((group) => group.goalId);

  return {
    planToken,
    goalIdsToMoveDeadlines,
    plan: {
      goals: groups.map((group) => ({
        goal: group.goalText,
        mode: group.mode,
        rescheduleCount: group.movedCount,
        projectedEnd: group.projectedEnd,
        suggestedDeadline: group.suggestedDeadline ?? null,
        deadlineMoved: goalIdsToMoveDeadlines.includes(group.goalId),
      })),
      totalRescheduled: groups.reduce((sum, group) => sum + group.movedCount, 0),
    },
  };
}
