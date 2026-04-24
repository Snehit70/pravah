import { useCallback, useRef } from "react";
import * as Haptics from "expo-haptics";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { classifyError, createActionId, mobileLogger } from "../lib/logger";
import type { MobileTask } from "../components/TaskCard";
import {
  patchTaskInOptimisticView,
  removeTaskFromOptimisticView,
  reorderScopedTasksInOptimisticView,
} from "../lib/task-optimistic";
import type { RetryPayload } from "./useRetryQueue";

type ToastState = { kind: "error" | "info"; message: string };

type UseTaskMutationsOptions = {
  serverTasks: MobileTask[];
  setOptimisticTasks: React.Dispatch<React.SetStateAction<MobileTask[] | null>>;
  retryQueue: RetryPayload[];
  enqueueRetry: (item: { label: string; payload: RetryPayload }) => void;
  showToast: (next: ToastState) => void;
};

type SuccessHaptic = "notification" | "light" | "medium";

export function useTaskMutations({
  serverTasks,
  setOptimisticTasks,
  enqueueRetry,
  showToast,
}: UseTaskMutationsOptions) {
  const busyTaskIdsRef = useRef<Set<string>>(new Set());

  const showToastWithHaptic = useCallback(
    (message: string, canRetry: boolean) => {
      showToast({
        kind: "error",
        message: canRetry ? `${message} Queued for retry.` : message,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    [showToast]
  );

  const triggerSuccessHaptic = useCallback((kind: SuccessHaptic) => {
    if (kind === "notification") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    void Haptics.impactAsync(
      kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
  }, []);

  const completeTaskMutation = useMutation(api.tasks.completeTask);
  const moveTaskMutation = useMutation(api.tasks.moveTask);
  const unscheduleTaskMutation = useMutation(api.tasks.unscheduleTask);
  const reopenTaskMutation = useMutation(api.tasks.reopenTask);
  const updateTaskMutation = useMutation(api.tasks.updateTask);
  const reorderTasksMutation = useMutation(api.tasks.reorderTasks);

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
    }: {
      optimistic: (current: MobileTask[]) => MobileTask[];
      mutation: () => Promise<void>;
      errorMessage: string;
      actionName: string;
      retryLabel?: string;
      retryPayload?: RetryPayload;
      successHaptic?: SuccessHaptic;
      taskId?: Id<"tasks">;
    }): Promise<boolean> => {
      if (taskId && busyTaskIdsRef.current.has(taskId)) {
        mobileLogger.warn("mutation_ignored_busy_task", { actionName, taskId });
        return false;
      }
      if (taskId) busyTaskIdsRef.current.add(taskId);

      const actionId = createActionId("mutation");
      const startedAt = Date.now();
      mobileLogger.info("mutation_started", { actionId, actionName });

      const stateRef: { current: MobileTask[] | null } = { current: null };
      setOptimisticTasks((cur) => {
        stateRef.current = cur;
        return optimistic(cur ?? serverTasks);
      });

      try {
        await mutation();
        triggerSuccessHaptic(successHaptic);
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
      }
    },
    [serverTasks, enqueueRetry, showToastWithHaptic, triggerSuccessHaptic]
  );

  const markDone = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "complete_task",
        optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
        mutation: async () => {
          await completeTaskMutation({ taskId });
        },
        errorMessage: "Could not mark task as done.",
        retryLabel: "Retry done",
        retryPayload: { type: "completeTask", taskId },
        taskId,
      });
    },
    [runOptimisticMutation, completeTaskMutation]
  );

  const moveToToday = useCallback(
    (taskId: Id<"tasks">, today: string) => {
      void runOptimisticMutation({
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
      });
    },
    [runOptimisticMutation, moveTaskMutation]
  );

  const sendToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
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
      });
    },
    [runOptimisticMutation, unscheduleTaskMutation]
  );

  const reopenToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
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
      });
    },
    [runOptimisticMutation, reopenTaskMutation]
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
          }),
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
      const taskIds = data.map((task) => task._id);
      const now = Date.now();
      setOptimisticTasks((current) =>
        reorderScopedTasksInOptimisticView(current ?? serverTasks, taskIds, (task) => task.status === "scheduled" && task.scheduledDate === dateKey, now)
      );

      try {
        await reorderTasksMutation({ date: dateKey, taskIds });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        setOptimisticTasks(null);
        showToast({ kind: "error", message: "Could not save timeline order." });
      }
    },
    [reorderTasksMutation, serverTasks, showToast]
  );

  return {
    markDone,
    moveToToday,
    sendToInbox,
    reopenToInbox,
    handleSaveEdits,
    handleTimelineDragEnd,
  };
}