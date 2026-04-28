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
  // Support both plain date IDs ("YYYY-MM-DD") and deadline-lane IDs ("deadline:YYYY-MM-DD")
  const dateFromId = isDateDropId(overId)
    ? overId
    : overId.startsWith("deadline:")
    ? overId.slice("deadline:".length)
    : null;

  if (dateFromId && isDateDropId(dateFromId)) {
    // Same-day drop onto a deadline-lane container: the source is already on
    // this date, so treat it as a no-op instead of triggering moveTask.
    const isDeadlineLaneDrop = overId.startsWith("deadline:");
    if (isDeadlineLaneDrop && dateFromId === sourceTask.scheduledDate) {
      return null;
    }
    return canScheduleTaskOnDate(sourceTask, dateFromId, {
      allowOverdueCarryForward: true,
      currentDate,
    })
      ? dateFromId
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
  const getMutationErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return "Failed to update task order. Please try again.";
  };

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

      try {
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

        // Guard: cross-lane drops (open ↔ deadline on the same day) are no-ops.
        // overTask may sit in the deadline lane while sourceTask is open (or vice
        // versa).  Without this check the mixed tasksByDate list gets reordered
        // unexpectedly when the user drags across lanes.
        if (overTask && overTask.scheduledDate === sourceTask.scheduledDate) {
          const srcIsDeadline = sourceTask.type === "deadline";
          const dstIsDeadline = overTask.type === "deadline";
          if (srcIsDeadline !== dstIsDeadline) return;
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
      } catch (error) {
        onInvalidReorder?.(getMutationErrorMessage(error));
      }
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
