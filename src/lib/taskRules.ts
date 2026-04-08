import { arrayMove } from "@dnd-kit/sortable";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";

const DATE_DROP_ID_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isDateDropId(value: string): boolean {
  return DATE_DROP_ID_REGEX.test(value);
}

export function canScheduleTaskOnDate(task: Task, targetDate: string): boolean {
  if (task.type !== "deadline" || !task.deadline) {
    return true;
  }
  return targetDate <= task.deadline;
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
