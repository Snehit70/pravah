import { useCallback } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import {
  canScheduleTaskOnDate,
  getReorderedTaskIdsForDay,
  hasPriorityBoundaryViolation,
  isInboxDropId,
  isDateDropId,
} from "../lib/taskRules";
import { getLocalDateString } from "../lib/utils";

type MoveTaskMutation = (args: {
  taskId: Id<"tasks">;
  targetDate: string;
  position?: number;
}) => Promise<unknown>;

type ReorderTasksMutation = (args: {
  date: string;
  taskIds: Id<"tasks">[];
}) => Promise<unknown>;

type ReorderInboxTasksMutation = (args: {
  taskIds: Id<"tasks">[];
}) => Promise<unknown>;

type UnscheduleTaskMutation = (args: {
  taskId: Id<"tasks">;
}) => Promise<unknown>;

interface UseTaskDragHandlersOptions {
  tasks: Task[] | undefined;
  tasksByDate: Record<string, Task[]>;
  inboxTasks: Task[];
  moveTask: MoveTaskMutation;
  reorderTasks: ReorderTasksMutation;
  reorderInboxTasks: ReorderInboxTasksMutation;
  unscheduleTask: UnscheduleTaskMutation;
  setDraggedTask: (task: Task | null) => void;
  onInvalidReorder?: (message: string) => void;
}

export function resolveDropTargetDate(
  sourceTask: Task,
  overId: string,
  tasks: Task[] | undefined,
  currentDate: string
): string | null {
  if (isDateDropId(overId)) {
    return canScheduleTaskOnDate(sourceTask, overId, {
      allowOverdueCarryForward: true,
      currentDate,
    })
      ? overId
      : null;
  }

  const overTask = tasks?.find((t) => t._id === overId);
  if (!overTask?.scheduledDate) {
    return null;
  }

  if (overTask.scheduledDate === sourceTask.scheduledDate) {
    return null;
  }

  return canScheduleTaskOnDate(sourceTask, overTask.scheduledDate, {
    allowOverdueCarryForward: true,
    currentDate,
  })
    ? overTask.scheduledDate
    : null;
}

export function useTaskDragHandlers({
  tasks,
  tasksByDate,
  inboxTasks,
  moveTask,
  reorderTasks,
  reorderInboxTasks,
  unscheduleTask,
  setDraggedTask,
  onInvalidReorder,
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

      const currentDate = getLocalDateString();
      const targetDate = resolveDropTargetDate(sourceTask, overId, tasks, currentDate);
      if (targetDate) {
        await moveTask({ taskId: activeId, targetDate });
        return;
      }

      const overTask = tasks?.find((t) => t._id === overId);
      if (
        sourceTask.status === "scheduled" &&
        (isInboxDropId(overId) || overTask?.status === "inbox")
      ) {
        await unscheduleTask({ taskId: activeId });
        return;
      }

      if (sourceTask.status === "inbox") {
        const reorderedInboxTaskIds = getReorderedTaskIdsForDay(inboxTasks, activeId, overId);
        if (!reorderedInboxTaskIds) {
          return;
        }

        const reorderedInboxTasks = reorderedInboxTaskIds
          .map((taskId) => inboxTasks.find((task) => task._id === taskId))
          .filter((task): task is Task => Boolean(task));
        if (hasPriorityBoundaryViolation(inboxTasks, reorderedInboxTasks)) {
          onInvalidReorder?.("Drag only within the same priority group.");
          return;
        }

        await reorderInboxTasks({ taskIds: reorderedInboxTaskIds });
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

      const reorderedDayTasks = reorderedTaskIds
        .map((taskId) => dayTasks.find((task) => task._id === taskId))
        .filter((task): task is Task => Boolean(task));
      if (hasPriorityBoundaryViolation(dayTasks, reorderedDayTasks)) {
        onInvalidReorder?.("Drag only within the same priority group.");
        return;
      }

      await reorderTasks({
        date: sourceTask.scheduledDate,
        taskIds: reorderedTaskIds,
      });
    },
    [
      tasks,
      tasksByDate,
      inboxTasks,
      moveTask,
      reorderTasks,
      reorderInboxTasks,
      unscheduleTask,
      setDraggedTask,
      onInvalidReorder,
    ]
  );

  return {
    handleDragStart,
    handleDragEnd,
  };
}
