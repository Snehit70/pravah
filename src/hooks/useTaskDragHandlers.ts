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
import { isTaskInInbox, isTaskOnTimeline } from "../lib/taskState";

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

function getTaskDate(task: Task): string | undefined {
  return task.deadline;
}

export function resolveDropTargetDate(
  sourceTask: Task,
  overId: string,
  tasks: Task[] | undefined,
  _currentDate: string
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
    if (isDeadlineLaneDrop && dateFromId === getTaskDate(sourceTask)) {
      return null;
    }
    return canScheduleTaskOnDate(sourceTask, dateFromId) ? dateFromId : null;
  }

  const overTask = tasks?.find((t) => t._id === overId);
  const overTaskDate = overTask ? getTaskDate(overTask) : undefined;
  if (!overTaskDate) {
    return null;
  }

  if (overTaskDate === getTaskDate(sourceTask)) {
    return null;
  }

  return canScheduleTaskOnDate(sourceTask, overTaskDate) ? overTaskDate : null;
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
          isTaskOnTimeline(sourceTask) &&
          (isInboxDropId(overId) || (overTask && isTaskInInbox(overTask)))
        ) {
          await unscheduleTask({ taskId: activeId });
          return;
        }

        if (isTaskInInbox(sourceTask)) {
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

        const sourceTaskDate = getTaskDate(sourceTask);
        if (!sourceTaskDate) {
          return;
        }

        const dayTasks = tasksByDate[sourceTaskDate] ?? [];
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
          date: sourceTaskDate,
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
