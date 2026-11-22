import { isCancelledTask, isCompletedTask } from "./taskLifecycle";

type LifecycleTask = Parameters<typeof isCompletedTask>[0];

/**
 * Tasks that block a goal from settling: linked, not cancelled, not done.
 * Cancelled tasks never count, matching goal progress.
 */
export function selectOpenGoalTasks<T extends LifecycleTask>(tasks: T[]): T[] {
  return tasks.filter((task) => !isCancelledTask(task) && !isCompletedTask(task));
}

export type SettleGoalResult =
  | { status: "settled"; completedAt: number; completedTaskCount: number }
  | { status: "open_tasks"; openTaskCount: number }
  | { status: "not_found" };

/**
 * Decide what a settle request does once the open tasks are known.
 *
 * Without `completeOpenTasks` a goal settles only when nothing is open. With
 * it, the caller has confirmed completing a specific number of tasks; a
 * different live count means the confirmation is stale, so nothing changes
 * and the caller can ask again with the new count.
 */
export function planGoalSettle(
  openTaskCount: number,
  options: { completeOpenTasks?: boolean; expectedOpenTaskCount?: number },
): { action: "settle"; completeOpen: boolean } | { action: "ask"; openTaskCount: number } {
  if (openTaskCount === 0) return { action: "settle", completeOpen: false };
  if (!options.completeOpenTasks) return { action: "ask", openTaskCount };
  if (
    options.expectedOpenTaskCount !== undefined &&
    options.expectedOpenTaskCount !== openTaskCount
  ) {
    return { action: "ask", openTaskCount };
  }
  return { action: "settle", completeOpen: true };
}
