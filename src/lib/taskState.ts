import type { Task } from "../types";
import {
  isTaskCancelled,
  isTaskCompleted,
  isTaskInInbox,
  isTaskOnTimeline,
  taskPlacement,
} from "./taskLifecycle";

export {
  isTaskCancelled,
  isTaskCompleted,
  isTaskInInbox,
  isTaskOnTimeline,
};

type TaskLifecycle = Pick<Task, "deadline" | "completedAt" | "cancelledAt">;

export function getTaskState(task: TaskLifecycle): "inbox" | "timeline" | "completed" | "cancelled" {
  return taskPlacement(task);
}
