import type { MobileTask } from "../components/TaskCard";
import {
  isTaskCancelled,
  isTaskCompleted,
  isTaskInInbox,
  isTaskOnTimeline,
} from "./taskLifecycle";

export type TaskLifecycle = Pick<MobileTask, "deadline" | "completedAt" | "cancelledAt">;

export {
  isTaskCancelled,
  isTaskCompleted,
  isTaskInInbox,
  isTaskOnTimeline,
};
