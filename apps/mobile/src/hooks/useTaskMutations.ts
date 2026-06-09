import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { haptic } from "../lib/haptic";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { classifyError, createActionId, mobileLogger } from "../lib/logger";
import type { MobileTask } from "../components/TaskCard";
import { isTaskInInbox, isTaskOnTimeline } from "../lib/taskState";
import {
  patchTaskInOptimisticView,
  removeTaskFromOptimisticView,
  reorderScopedTasksInOptimisticView,
  shiftTaskWithinScopedOptimisticView,
} from "../lib/task-optimistic";
import type { RetryPayload } from "./useRetryQueue";
import type { ToastState } from "./useWorkspaceState";

type UndoSpec = { message: string; run: () => void };

type UseTaskMutationsOptions = {
  serverTasks: MobileTask[];
  setOptimisticTasks: Dispatch<SetStateAction<MobileTask[] | null>>;
  setPendingMutations: Dispatch<SetStateAction<number>>;
  enqueueRetry: (item: { label: string; payload: RetryPayload }) => void;
  showToast: (next: ToastState) => void;
  today: string;
  hasPriorityBoundaryViolation: (original: MobileTask[], reordered: MobileTask[]) => boolean;
};

type SuccessHaptic = "notification" | "light" | "medium";

/** Config for one optimistic mutation. The same builder feeds both an action
 *  and its inverse, so a swipe and its Undo never drift out of sync. */
type RunConfig = {
  optimistic: (current: MobileTask[]) => MobileTask[];
  mutation: () => Promise<void>;
  errorMessage: string;
  actionName: string;
  retryLabel?: string;
  retryPayload?: RetryPayload;
  successHaptic?: SuccessHaptic;
  taskId?: Id<"tasks">;
};

export function useTaskMutations({
  serverTasks,
  setOptimisticTasks,
  setPendingMutations,
  enqueueRetry,
  showToast,
  today,
  hasPriorityBoundaryViolation,
}: UseTaskMutationsOptions) {
  const busyTaskIdsRef = useRef<Set<string>>(new Set());

  const showToastWithHaptic = useCallback(
    (message: string, canRetry: boolean) => {
      showToast({
        kind: "error",
        message: canRetry ? `${message} Queued for retry.` : message,
      });
      haptic.error();
    },
    [showToast]
  );

  const triggerSuccessHaptic = useCallback((kind: SuccessHaptic) => {
    if (kind === "notification") { haptic.success(); return; }
    if (kind === "medium") { haptic.medium(); return; }
    haptic.light();
  }, []);

  const completeTaskMutation = useMutation(api.tasks.completeTask);
  const moveTaskMutation = useMutation(api.tasks.moveTask);
  const unscheduleTaskMutation = useMutation(api.tasks.unscheduleTask);
  const reopenTaskMutation = useMutation(api.tasks.reopenTask);
  const updateTaskMutation = useMutation(api.tasks.updateTask);
  const reorderTasksMutation = useMutation(api.tasks.reorderTasks);
  const reorderInboxTasksMutation = useMutation(api.tasks.reorderInboxTasks);
  const shiftScheduledTaskPositionMutation = useMutation(api.tasks.shiftScheduledTaskPosition);
  // Order-sensitive: useTaskMutations.test.ts mocks useMutation by call index.
  // Keep new mutations appended at the end of this list.
  const deleteTaskMutation = useMutation(api.tasks.deleteTask);

  const runOptimisticMutation = useCallback(
    async ({
      optimistic,
      mutation,
      errorMessage,
      actionName,
      retryLabel,
      retryPayload,
      successHaptic = "notification",
      taskId,
      undo,
    }: RunConfig & { undo?: UndoSpec }): Promise<boolean> => {
      if (taskId && busyTaskIdsRef.current.has(taskId)) {
        mobileLogger.warn("mutation_ignored_busy_task", { actionName, taskId });
        return false;
      }
      if (taskId) busyTaskIdsRef.current.add(taskId);

      const actionId = createActionId("mutation");
      const startedAt = Date.now();
      mobileLogger.info("mutation_started", { actionId, actionName });
      setPendingMutations((count) => count + 1);

      const stateRef: { current: MobileTask[] | null } = { current: null };
      setOptimisticTasks((cur) => {
        stateRef.current = cur;
        return optimistic(cur ?? serverTasks);
      });

      try {
        await mutation();
        triggerSuccessHaptic(successHaptic);
        if (undo) {
          showToast({
            kind: "info",
            message: undo.message,
            action: { label: "Undo", run: undo.run },
          });
        }
        mobileLogger.info("mutation_succeeded", {
          actionId,
          actionName,
          elapsedMs: Date.now() - startedAt,
        });
        return true;
      } catch (error) {
        setOptimisticTasks(stateRef.current);
        const canRetry = Boolean(retryLabel && retryPayload && classifyError(error) === "network");
        if (canRetry) enqueueRetry({ label: retryLabel!, payload: retryPayload! });
        mobileLogger.error("mutation_failed", {
          actionId,
          actionName,
          elapsedMs: Date.now() - startedAt,
          errorType: classifyError(error),
          retriable: canRetry,
        });
        showToastWithHaptic(errorMessage, canRetry);
        return false;
      } finally {
        if (taskId) busyTaskIdsRef.current.delete(taskId);
        setPendingMutations((count) => Math.max(0, count - 1));
      }
    },
    [serverTasks, enqueueRetry, setOptimisticTasks, setPendingMutations, showToast, showToastWithHaptic, triggerSuccessHaptic]
  );

  // Reusable per-operation configs. Each swipe action below pairs one of these
  // with its inverse so the Undo replays the exact opposite mutation.
  const completeConfig = useCallback(
    (taskId: Id<"tasks">): RunConfig => ({
      actionName: "complete_task",
      optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
      mutation: async () => {
        await completeTaskMutation({ taskId });
      },
      errorMessage: "Could not mark task as done.",
      retryLabel: "Retry done",
      retryPayload: { type: "completeTask", taskId },
      taskId,
    }),
    [completeTaskMutation]
  );

  const reopenConfig = useCallback(
    (taskId: Id<"tasks">): RunConfig => ({
      actionName: "reopen_task",
      optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
      mutation: async () => {
        await reopenTaskMutation({ taskId });
      },
      errorMessage: "Could not reopen task.",
      retryLabel: "Retry reopen",
      retryPayload: { type: "reopenTask", taskId },
      successHaptic: "light",
      taskId,
    }),
    [reopenTaskMutation]
  );

  const todayConfig = useCallback(
    (taskId: Id<"tasks">): RunConfig => ({
      actionName: "move_task_today",
      optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
      mutation: async () => {
        await moveTaskMutation({ taskId, targetDate: today });
      },
      errorMessage: "Could not move task to today.",
      retryLabel: "Retry move to today",
      retryPayload: { type: "moveTask", taskId, targetDate: today },
      successHaptic: "light",
      taskId,
    }),
    [moveTaskMutation, today]
  );

  const unscheduleConfig = useCallback(
    (taskId: Id<"tasks">): RunConfig => ({
      actionName: "move_task_inbox",
      optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
      mutation: async () => {
        await unscheduleTaskMutation({ taskId });
      },
      errorMessage: "Could not move task back to inbox.",
      retryLabel: "Retry move to inbox",
      retryPayload: { type: "unscheduleTask", taskId },
      successHaptic: "light",
      taskId,
    }),
    [unscheduleTaskMutation]
  );

  const markDone = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        ...completeConfig(taskId),
        undo: {
          message: "Marked done",
          run: () => void runOptimisticMutation(reopenConfig(taskId)),
        },
      });
    },
    [runOptimisticMutation, completeConfig, reopenConfig]
  );

  const moveToToday = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        ...todayConfig(taskId),
        undo: { message: "Moved to Today", run: () => void runOptimisticMutation(unscheduleConfig(taskId)) },
      });
    },
    [runOptimisticMutation, todayConfig, unscheduleConfig]
  );

  const sendToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      // Capture the date the task is leaving so Undo can put it back there.
      const priorDate = serverTasks.find((t) => t._id === taskId)?.deadline;
      void runOptimisticMutation({
        ...unscheduleConfig(taskId),
        undo: priorDate
          ? {
              message: "Moved to Inbox",
              run: () =>
                void runOptimisticMutation({
                  actionName: "move_task_date",
                  optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
                  mutation: async () => {
                    await moveTaskMutation({ taskId, targetDate: priorDate });
                  },
                  errorMessage: "Could not undo.",
                  successHaptic: "light",
                  taskId,
                }),
            }
          : undefined,
      });
    },
    [runOptimisticMutation, unscheduleConfig, serverTasks, moveTaskMutation]
  );

  const reopenTask = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        ...reopenConfig(taskId),
        undo: { message: "Task reopened", run: () => void runOptimisticMutation(completeConfig(taskId)) },
      });
    },
    [runOptimisticMutation, reopenConfig, completeConfig]
  );

  const deleteTask = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "delete_task",
        optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
        mutation: async () => {
          await deleteTaskMutation({ taskId });
        },
        errorMessage: "Could not delete task.",
        successHaptic: "medium",
        taskId,
      });
    },
    [runOptimisticMutation, deleteTaskMutation]
  );

  const handleSaveEdits = useCallback(
    async (data: {
      taskId: Id<"tasks">;
      title: string;
      description?: string;
      deadline?: string;
      priority?: "p1" | "p2" | "p3";
    }) => {
      return runOptimisticMutation({
        actionName: "update_task",
        optimistic: (cur) =>
          patchTaskInOptimisticView(cur, data.taskId, {
            title: data.title,
            description: data.description,
            deadline: data.deadline,
            priority: data.priority,
          }, Date.now()),
        mutation: async () => {
          await updateTaskMutation({
            taskId: data.taskId,
            title: data.title,
            description: data.description,
            deadline: data.deadline,
            priority: data.priority,
          });
        },
        errorMessage: "Could not save task details.",
        retryLabel: `Update "${data.title}"`,
        retryPayload: {
          type: "updateTask",
          taskId: data.taskId,
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          priority: data.priority,
        },
        successHaptic: "medium",
        taskId: data.taskId,
      });
    },
    [runOptimisticMutation, updateTaskMutation]
  );

  const handleTimelineDragEnd = useCallback(
    async (dateKey: string, original: MobileTask[], data: MobileTask[]) => {
      if (hasPriorityBoundaryViolation(original, data)) {
        showToast({ kind: "error", message: "Drag only within the same priority group." });
        return;
      }

      const taskIds = data.map((task) => task._id);
      const now = Date.now();
      const stateRef: { current: MobileTask[] | null } = { current: null };
      setPendingMutations((count) => count + 1);
      setOptimisticTasks((current) =>
        {
          stateRef.current = current;
          return reorderScopedTasksInOptimisticView(
            current ?? serverTasks,
            taskIds,
            (task) => isTaskOnTimeline(task) && task.deadline === dateKey,
            now
          );
        }
      );

      try {
        await reorderTasksMutation({ date: dateKey, taskIds });
        haptic.light();
      } catch {
        setOptimisticTasks(stateRef.current);
        showToast({ kind: "error", message: "Could not save timeline order." });
      } finally {
        setPendingMutations((count) => Math.max(0, count - 1));
      }
    },
    [hasPriorityBoundaryViolation, reorderTasksMutation, serverTasks, setOptimisticTasks, setPendingMutations, showToast]
  );

  const handleInboxDragEnd = useCallback(
    async (original: MobileTask[], data: MobileTask[]) => {
      if (hasPriorityBoundaryViolation(original, data)) {
        showToast({ kind: "error", message: "Drag only within the same priority group." });
        return;
      }

      const taskIds = data.map((task) => task._id);
      const now = Date.now();
      const stateRef: { current: MobileTask[] | null } = { current: null };
      setPendingMutations((count) => count + 1);
      setOptimisticTasks((current) => {
        stateRef.current = current;
        return reorderScopedTasksInOptimisticView(
          current ?? serverTasks,
          taskIds,
          isTaskInInbox,
          now
        );
      });

      try {
        await reorderInboxTasksMutation({ taskIds });
        haptic.light();
      } catch {
        setOptimisticTasks(stateRef.current);
        showToast({ kind: "error", message: "Could not save inbox order." });
      } finally {
        setPendingMutations((count) => Math.max(0, count - 1));
      }
    },
    [
      hasPriorityBoundaryViolation,
      reorderInboxTasksMutation,
      serverTasks,
      setOptimisticTasks,
      setPendingMutations,
      showToast,
    ]
  );

  const shiftTimelineTask = useCallback(
    (taskId: Id<"tasks">, deadline: string, direction: "up" | "down") => {
      const scopePredicate = (task: MobileTask) =>
        isTaskOnTimeline(task) && task.deadline === deadline;
      const scoped = serverTasks.filter(scopePredicate).slice().sort((a, b) => a.position - b.position);
      const idx = scoped.findIndex((t) => t._id === taskId);
      const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx !== -1 && neighborIdx >= 0 && neighborIdx < scoped.length) {
        const reordered = scoped.slice();
        const [moved] = reordered.splice(idx, 1);
        reordered.splice(neighborIdx, 0, moved);
        if (hasPriorityBoundaryViolation(scoped, reordered)) {
          showToast({ kind: "error", message: "Drag only within the same priority group." });
          haptic.error();
          return;
        }
      }

      void runOptimisticMutation({
        actionName: direction === "up" ? "shift_task_up" : "shift_task_down",
        optimistic: (cur) =>
          shiftTaskWithinScopedOptimisticView(
            cur,
            taskId,
            scopePredicate,
            direction,
            Date.now()
          ),
        mutation: async () => {
          await shiftScheduledTaskPositionMutation({ taskId, direction });
        },
        errorMessage: `Could not move task ${direction}.`,
        successHaptic: "light",
        taskId,
      });
    },
    [runOptimisticMutation, shiftScheduledTaskPositionMutation, serverTasks, hasPriorityBoundaryViolation, showToast]
  );

  return {
    markDone,
    moveToToday,
    sendToInbox,
    reopenTask,
    deleteTask,
    handleSaveEdits,
    handleInboxDragEnd,
    handleTimelineDragEnd,
    shiftTimelineTask,
  };
}
