import { useMemo } from "react";
import type { Task } from "../types";
import { getPriorityRank } from "../lib/taskRules";

export function deriveTaskBoardData(tasks: Task[] | undefined) {
  const inboxTasks = (tasks?.filter((t) => t.status === "inbox") ?? []).sort(
    (a, b) => getPriorityRank(a.priority) - getPriorityRank(b.priority) || a.position - b.position
  );

  const grouped: Record<string, Task[]> = {};
  const scheduledTasks = tasks?.filter((t) => t.status === "scheduled") ?? [];

  for (const task of scheduledTasks) {
    if (!task.scheduledDate) continue;
    if (!grouped[task.scheduledDate]) grouped[task.scheduledDate] = [];
    grouped[task.scheduledDate].push(task);
  }

  for (const date of Object.keys(grouped)) {
    grouped[date].sort(
      (a, b) => getPriorityRank(a.priority) - getPriorityRank(b.priority) || a.position - b.position
    );
  }

  return {
    inboxTasks,
    tasksByDate: grouped,
  };
}

export function useTaskBoardData(tasks: Task[] | undefined) {
  return useMemo(() => deriveTaskBoardData(tasks), [tasks]);
}
