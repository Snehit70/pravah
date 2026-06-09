import { useMemo } from "react";
import type { Task } from "../types";
import { getPriorityRank } from "../lib/taskRules";
import { isTaskInInbox, isTaskOnTimeline } from "../lib/taskState";

export function deriveTaskBoardData(tasks: Task[] | undefined) {
  const inboxTasks = (tasks?.filter(isTaskInInbox) ?? []).sort(
    (a, b) => getPriorityRank(a.priority) - getPriorityRank(b.priority) || a.position - b.position
  );

  const grouped: Record<string, Task[]> = {};
  const scheduledTasks = tasks?.filter(isTaskOnTimeline) ?? [];

  for (const task of scheduledTasks) {
    const date = task.deadline;
    if (!date) continue;
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(task);
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
