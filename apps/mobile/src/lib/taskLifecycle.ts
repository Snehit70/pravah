import type { Id } from "../../../../convex/_generated/dataModel";

export type TaskPriority = "p1" | "p2" | "p3";
export type TaskPlacement = "inbox" | "timeline" | "completed" | "cancelled";

export type TaskLifecycleInput = {
  deadline?: string;
  completedAt?: number;
  cancelledAt?: number;
};

export type OrderedTaskInput = TaskLifecycleInput & {
  _id: Id<"tasks">;
  priority?: TaskPriority;
  position: number;
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  p1: 0,
  p2: 1,
  p3: 2,
};

export function taskPriorityRank(priority?: TaskPriority): number {
  return priority ? PRIORITY_RANK[priority] : 3;
}

export function compareTaskOrder(
  a: Pick<OrderedTaskInput, "priority" | "position">,
  b: Pick<OrderedTaskInput, "priority" | "position">
): number {
  return taskPriorityRank(a.priority) - taskPriorityRank(b.priority) || a.position - b.position;
}

export function taskPlacement(task: TaskLifecycleInput): TaskPlacement {
  if (task.cancelledAt !== undefined) return "cancelled";
  if (task.completedAt !== undefined) return "completed";
  return task.deadline !== undefined ? "timeline" : "inbox";
}

export function isTaskCancelled(task: TaskLifecycleInput): boolean {
  return taskPlacement(task) === "cancelled";
}

export function isTaskCompleted(task: TaskLifecycleInput): boolean {
  return taskPlacement(task) === "completed";
}

export function isTaskOnTimeline(task: TaskLifecycleInput): boolean {
  return taskPlacement(task) === "timeline";
}

export function isTaskInInbox(task: TaskLifecycleInput): boolean {
  return taskPlacement(task) === "inbox";
}

/**
 * Secondary sort key within a single Deadline day:
 * - Timed tasks (with a `time` field) sort before date-only tasks.
 * - Among timed tasks, sort chronologically ("HH:MM" compares lexically).
 * - Among date-only tasks, return 0 (caller falls through to compareTaskOrder).
 */
export function compareTasksWithinDay(a: { time?: string }, b: { time?: string }): number {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return 0;
}

export function hasPriorityBoundaryViolation<T extends { priority?: TaskPriority }>(
  original: T[],
  reordered: T[]
): boolean {
  if (original.length !== reordered.length) return true;

  for (let index = 0; index < original.length; index += 1) {
    if (taskPriorityRank(original[index]?.priority) !== taskPriorityRank(reordered[index]?.priority)) {
      return true;
    }
  }

  return false;
}
