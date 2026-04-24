import { arrayMove } from "@dnd-kit/sortable";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";

const DATE_DROP_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const INBOX_DROP_ID = "inbox";

interface DeadlineScheduleOptions {
  allowOverdueCarryForward?: boolean;
  currentDate?: string;
}

export function isDateDropId(value: string): boolean {
  return DATE_DROP_ID_REGEX.test(value);
}

export function isInboxDropId(value: string): boolean {
  return value === INBOX_DROP_ID;
}

export function canScheduleTaskOnDate(
  task: Task,
  targetDate: string,
  options: DeadlineScheduleOptions = {}
): boolean {
  if (task.type !== "deadline" || !task.deadline) {
    return true;
  }

  if (targetDate <= task.deadline) {
    return true;
  }

  if (!options.allowOverdueCarryForward) {
    return false;
  }

  const currentDate = options.currentDate ?? new Date().toISOString().slice(0, 10);
  return task.deadline < currentDate;
}

export function getReorderedTaskIdsForDay(
  dayTasks: Task[],
  activeId: Id<"tasks">,
  overId: string
): Id<"tasks">[] | null {
  const oldIndex = dayTasks.findIndex((t) => t._id === activeId);
  const newIndex = dayTasks.findIndex((t) => t._id === overId);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return null;
  }

  return arrayMove(dayTasks, oldIndex, newIndex).map((t) => t._id);
}

export function getPriorityRank(priority?: "p1" | "p2" | "p3"): number {
  if (priority === "p1") return 0;
  if (priority === "p2") return 1;
  if (priority === "p3") return 2;
  return 3;
}

export function hasPriorityBoundaryViolation(original: Task[], reordered: Task[]): boolean {
  if (original.length !== reordered.length) return true;

  for (let index = 0; index < original.length; index += 1) {
    if (getPriorityRank(original[index]?.priority) !== getPriorityRank(reordered[index]?.priority)) {
      return true;
    }
  }

  return false;
}
