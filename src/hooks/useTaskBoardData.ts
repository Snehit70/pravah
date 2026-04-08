import { useMemo } from "react";
import type { Task } from "../types";

export function useTaskBoardData(tasks: Task[] | undefined) {
  const inboxTasks = useMemo(
    () => tasks?.filter((t) => t.status === "inbox") ?? [],
    [tasks]
  );

  const tasksByDate = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    const scheduledTasks = tasks?.filter((t) => t.status === "scheduled") ?? [];

    for (const task of scheduledTasks) {
      if (!task.scheduledDate) continue;
      if (!grouped[task.scheduledDate]) grouped[task.scheduledDate] = [];
      grouped[task.scheduledDate].push(task);
    }

    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.position - b.position);
    }

    return grouped;
  }, [tasks]);

  return {
    inboxTasks,
    tasksByDate,
  };
}
