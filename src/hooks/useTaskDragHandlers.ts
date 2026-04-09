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
      const overTask = tasks?.find((t) => t._id === overId);

      if (isDateDropId(overId)) {
        if (!canScheduleTaskOnDate(sourceTask, overId)) {
          return;
        }
        await moveTask({ taskId: activeId, targetDate: overId });
        return;
      }

      // Dropping on a task card from another day should still move across days.
      if (overTask?.scheduledDate && overTask.scheduledDate !== sourceTask.scheduledDate) {
        if (!canScheduleTaskOnDate(sourceTask, overTask.scheduledDate)) {
          return;
        }
        await moveTask({ taskId: activeId, targetDate: overTask.scheduledDate });
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
