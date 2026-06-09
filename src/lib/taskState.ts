import type { Task } from "../types";

type TaskLifecycle = Pick<Task, "deadline" | "completedAt" | "cancelledAt">;

export function isTaskCancelled(task: TaskLifecycle): boolean {
  return task.cancelledAt !== undefined;
}

export function isTaskCompleted(task: TaskLifecycle): boolean {
  return !isTaskCancelled(task) && task.completedAt !== undefined;
}

export function isTaskOnTimeline(task: TaskLifecycle): boolean {
  return !isTaskCancelled(task) && !isTaskCompleted(task) && task.deadline !== undefined;
}

export function isTaskInInbox(task: TaskLifecycle): boolean {
  return !isTaskCancelled(task) && !isTaskCompleted(task) && task.deadline === undefined;
}

export function getTaskState(task: TaskLifecycle): "inbox" | "timeline" | "completed" | "cancelled" {
  if (isTaskCancelled(task)) return "cancelled";
  if (isTaskCompleted(task)) return "completed";
  return task.deadline ? "timeline" : "inbox";
}
