import { useCallback } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import {
  canScheduleTaskOnDate,
  getReorderedTaskIdsForDay,
  isDateDropId,
} from "../lib/taskRules";

type MoveTaskMutation = (args: {
  taskId: Id<"tasks">;
  targetDate: string;
  position?: number;
}) => Promise<unknown>;

type ReorderTasksMutation = (args: {
  date: string;
  taskIds: Id<"tasks">[];
}) => Promise<unknown>;

interface UseTaskDragHandlersOptions {
  tasks: Task[] | undefined;
  tasksByDate: Record<string, Task[]>;
  moveTask: MoveTaskMutation;
  reorderTasks: ReorderTasksMutation;
  setDraggedTask: (task: Task | null) => void;
}

export function resolveDropTargetDate(
  sourceTask: Task,
  overId: string,
  tasks: Task[] | undefined
): string | null {
  if (isDateDropId(overId)) {
    return canScheduleTaskOnDate(sourceTask, overId) ? overId : null;
  }

  const overTask = tasks?.find((t) => t._id === overId);
  if (!overTask?.scheduledDate) {
    return null;
  }

  if (overTask.scheduledDate === sourceTask.scheduledDate) {
    return null;
  }

  return canScheduleTaskOnDate(sourceTask, overTask.scheduledDate)
    ? overTask.scheduledDate
    : null;
}

export function useTaskDragHandlers({
  tasks,
  tasksByDate,
  moveTask,
  reorderTasks,
  setDraggedTask,
}: UseTaskDragHandlersOptions) {
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks?.find((t) => t._id === event.active.id);
      if (task) setDraggedTask(task);
    },
    [tasks, setDraggedTask]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setDraggedTask(null);

      if (!over) return;

      const activeId = active.id as Id<"tasks">;
      const overId = over.id as string;
      const sourceTask = tasks?.find((t) => t._id === activeId);
      if (!sourceTask) return;

      const targetDate = resolveDropTargetDate(sourceTask, overId, tasks);
      if (targetDate) {
        await moveTask({ taskId: activeId, targetDate });
        return;
      }

      if (!sourceTask.scheduledDate) {
        return;
      }

      const dayTasks = tasksByDate[sourceTask.scheduledDate] ?? [];
      const reorderedTaskIds = getReorderedTaskIdsForDay(dayTasks, activeId, overId);
      if (!reorderedTaskIds) {
        return;
      }

      await reorderTasks({
        date: sourceTask.scheduledDate,
        taskIds: reorderedTaskIds,
      });
    },
    [tasks, tasksByDate, moveTask, reorderTasks, setDraggedTask]
  );

  return {
    handleDragStart,
    handleDragEnd,
  };
}
