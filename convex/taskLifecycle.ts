import type { Doc } from "./_generated/dataModel";

export type LegacyTaskStatus = "inbox" | "scheduled" | "completed" | "cancelled";
export type TaskPriority = "p1" | "p2" | "p3";

type LegacyLifecycleInput = {
  deadline?: string;
  scheduledDate?: string;
  completedAt?: number;
  cancelledAt?: number;
  status?: string;
  updatedAt: number;
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  p1: 0,
  p2: 1,
  p3: 2,
};

export function getPriorityRank(priority?: string): number {
  return priority === "p1" || priority === "p2" || priority === "p3"
    ? PRIORITY_RANK[priority]
    : 3;
}

export function getTaskDeadline(task: {
  deadline?: string;
  scheduledDate?: string;
}) {
  return task.deadline ?? task.scheduledDate;
}

export function getTaskCompletedAt(task: {
  completedAt?: number;
  status?: string;
  updatedAt: number;
}) {
  if (typeof task.completedAt === "number") return task.completedAt;
  if (task.status === "completed") return task.updatedAt;
  return undefined;
}

export function getTaskCancelledAt(task: {
  cancelledAt?: number;
  status?: string;
  updatedAt: number;
}) {
  if (typeof task.cancelledAt === "number") return task.cancelledAt;
  if (task.status === "cancelled") return task.updatedAt;
  return undefined;
}

export function isCancelledTask(task: LegacyLifecycleInput) {
  return typeof getTaskCancelledAt(task) === "number";
}

export function isCompletedTask(task: LegacyLifecycleInput) {
  return !isCancelledTask(task) && typeof getTaskCompletedAt(task) === "number";
}

export function isTimelineTask(task: LegacyLifecycleInput) {
  return !isCancelledTask(task) && !isCompletedTask(task) && !!getTaskDeadline(task);
}

export function isInboxTask(task: LegacyLifecycleInput) {
  return !isCancelledTask(task) && !isCompletedTask(task) && !getTaskDeadline(task);
}

export function getTaskState(task: LegacyLifecycleInput): LegacyTaskStatus {
  if (isCancelledTask(task)) return "cancelled";
  if (isCompletedTask(task)) return "completed";
  return getTaskDeadline(task) ? "scheduled" : "inbox";
}

export function toCanonicalTaskShape(task: Doc<"tasks">) {
  return {
    _id: task._id,
    _creationTime: task._creationTime,
    title: task.title,
    description: task.description,
    deadline: getTaskDeadline(task),
    scheduledAt: task.scheduledAt ?? task.createdAt,
    completedAt: getTaskCompletedAt(task),
    cancelledAt: getTaskCancelledAt(task),
    position: task.position,
    source: task.source,
    estimatedMinutes: task.estimatedMinutes,
    tags: task.tags,
    priority: task.priority,
    createdBy: task.createdBy,
    ownerTokenIdentifier: task.ownerTokenIdentifier,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
