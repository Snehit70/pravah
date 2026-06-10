import type { MobileTask } from "../components/TaskCard";

type TaskLifecycle = Pick<MobileTask, "deadline" | "completedAt" | "cancelledAt">;

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
