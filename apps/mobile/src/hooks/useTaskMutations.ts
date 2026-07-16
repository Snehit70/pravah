import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { classifyError, createActionId, mobileLogger } from "../lib/logger";
import { feedback } from "../lib/feedback";
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

type SuccessFeedback = "notification" | "light" | "medium" | "taskCompleted";

/** Config for one optimistic mutation. The same builder feeds both an action
 *  and its inverse, so a swipe and its Undo never drift out of sync. */
type RunConfig = {
  optimistic: (current: MobileTask[]) => MobileTask[];
  mutation: () => Promise<void>;
  errorMessage: string;
  actionName: string;
  retryLabel?: string;
  retryPayload?: RetryPayload;
  successFeedback?: SuccessFeedback;
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
      feedback.error();
    },
    [showToast]
  );

  const triggerSuccessFeedback = useCallback((kind: SuccessFeedback) => {
    if (kind === "taskCompleted") { feedback.taskCompleted(); return; }
    if (kind === "notification") { feedback.success(); return; }
    if (kind === "medium") { feedback.medium(); return; }
    feedback.light();
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
  const rescheduleTasksMutation = useMutation(api.tasks.rescheduleTasks);

  const runOptimisticMutation = useCallback(
    async ({
      optimistic,
      mutation,
      errorMessage,
      actionName,
      retryLabel,
      retryPayload,
      successFeedback = "notification",
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
        triggerSuccessFeedback(successFeedback);
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
    [serverTasks, enqueueRetry, setOptimisticTasks, setPendingMutations, showToast, showToastWithHaptic, triggerSuccessFeedback]
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
      successFeedback: "taskCompleted",
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
      successFeedback: "light",
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
      successFeedback: "light",
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
      successFeedback: "light",
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
                  successFeedback: "light",
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
        successFeedback: "medium",
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
      time?: string;
      priority?: "p1" | "p2" | "p3";
    }) => {
      return runOptimisticMutation({
        actionName: "update_task",
        optimistic: (cur) =>
          patchTaskInOptimisticView(cur, data.taskId, {
            title: data.title,
            description: data.description,
            deadline: data.deadline,
            time: data.deadline ? data.time : undefined,
            priority: data.priority,
          }, Date.now()),
        mutation: async () => {
          await updateTaskMutation({
            taskId: data.taskId,
            title: data.title,
            description: data.description,
            deadline: data.deadline,
            time: data.deadline ? data.time : undefined,
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
          time: data.deadline ? data.time : undefined,
          priority: data.priority,
        },
        successFeedback: "medium",
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
        feedback.light();
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
        feedback.light();
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
          feedback.error();
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
        successFeedback: "light",
        taskId,
      });
    },
    [runOptimisticMutation, shiftScheduledTaskPositionMutation, serverTasks, hasPriorityBoundaryViolation, showToast]
  );

  // Quick-schedule: place a task on an explicit date. Inbox tasks have no
  // prior date, so Undo unschedules them back to the inbox — but the Goals
  // sheet reuses this for already-dated tasks, where Undo must restore the
  // date the task had before, not dump it into the inbox.
  const scheduleToDate = useCallback(
    (taskId: Id<"tasks">, targetDate: string) => {
      const priorDeadline = serverTasks.find((task) => task._id === taskId)?.deadline;
      void runOptimisticMutation({
        actionName: "move_task_date",
        optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
        mutation: async () => {
          await moveTaskMutation({ taskId, targetDate });
        },
        errorMessage: "Could not schedule task.",
        retryLabel: "Retry schedule",
        retryPayload: { type: "moveTask", taskId, targetDate },
        successFeedback: "light",
        taskId,
        undo: {
          message: "Scheduled",
          run: () =>
            void runOptimisticMutation(
              priorDeadline
                ? {
                    actionName: "move_task_date_undo",
                    optimistic: (cur) =>
                      patchTaskInOptimisticView(cur, taskId, { deadline: priorDeadline }, Date.now()),
                    mutation: async () => {
                      await moveTaskMutation({ taskId, targetDate: priorDeadline });
                    },
                    errorMessage: "Could not undo.",
                    retryLabel: "Retry reschedule",
                    retryPayload: { type: "moveTask", taskId, targetDate: priorDeadline },
                    successFeedback: "light",
                    taskId,
                  }
                : unscheduleConfig(taskId)
            ),
        },
      });
    },
    [runOptimisticMutation, moveTaskMutation, unscheduleConfig, serverTasks]
  );

  // Inbox bulk complete (also the single-select path). One optimistic removal,
  // one awaited fan-out, one toast whose Undo reopens every task in the batch.
  const markManyDone = useCallback(
    async (taskIds: Id<"tasks">[]): Promise<boolean> => {
      if (taskIds.length === 0) return true;
      const ids = new Set<string>(taskIds.map(String));
      return runOptimisticMutation({
        actionName: "complete_tasks_bulk",
        optimistic: (cur) => cur.filter((task) => !ids.has(String(task._id))),
        mutation: async () => {
          await Promise.all(taskIds.map((taskId) => completeTaskMutation({ taskId })));
        },
        errorMessage:
          taskIds.length === 1
            ? "Could not mark task as done."
            : "Could not mark tasks as done.",
        successFeedback: "taskCompleted",
        undo: {
          message: taskIds.length === 1 ? "Marked done" : `Marked ${taskIds.length} done`,
          run: () =>
            void runOptimisticMutation({
              actionName: "reopen_tasks_bulk",
              optimistic: (cur) => cur,
              mutation: async () => {
                await Promise.all(taskIds.map((taskId) => reopenTaskMutation({ taskId })));
              },
              errorMessage: "Could not undo.",
              successFeedback: "light",
            }),
        },
      });
    },
    [runOptimisticMutation, completeTaskMutation, reopenTaskMutation]
  );

  // Timeline bulk reschedule: move a batch onto one date in a single server
  // call. Tasks keep their time-of-day (rescheduleTasks only patches the
  // deadline); the optimistic view patches deadlines so rows glide to the new
  // section instead of vanishing. Undo replays each task back to the date it
  // left.
  const scheduleManyToDate = useCallback(
    async (taskIds: Id<"tasks">[], targetDate: string): Promise<boolean> => {
      if (taskIds.length === 0) return true;
      const priorDates = new Map<string, string>();
      for (const taskId of taskIds) {
        const prior = serverTasks.find((task) => task._id === taskId)?.deadline;
        if (prior) priorDates.set(String(taskId), prior);
      }
      const patchAll = (view: MobileTask[], dateFor: (taskId: Id<"tasks">) => string | undefined) => {
        const now = Date.now();
        return taskIds.reduce((acc, taskId) => {
          const deadline = dateFor(taskId);
          return deadline ? patchTaskInOptimisticView(acc, taskId, { deadline }, now) : acc;
        }, view);
      };
      return runOptimisticMutation({
        actionName: "reschedule_tasks_bulk",
        optimistic: (cur) => patchAll(cur, () => targetDate),
        mutation: async () => {
          await rescheduleTasksMutation({
            updates: taskIds.map((taskId) => ({ taskId, deadline: targetDate })),
          });
        },
        errorMessage:
          taskIds.length === 1 ? "Could not reschedule task." : "Could not reschedule tasks.",
        successFeedback: "light",
        undo: {
          message: taskIds.length === 1 ? "Rescheduled" : `Rescheduled ${taskIds.length}`,
          run: () =>
            void runOptimisticMutation({
              actionName: "reschedule_tasks_bulk_undo",
              optimistic: (cur) => patchAll(cur, (taskId) => priorDates.get(String(taskId))),
              mutation: async () => {
                const updates = [...priorDates.entries()].map(([taskId, deadline]) => ({
                  taskId: taskId as Id<"tasks">,
                  deadline,
                }));
                if (updates.length > 0) await rescheduleTasksMutation({ updates });
              },
              errorMessage: "Could not undo.",
              successFeedback: "light",
            }),
        },
      });
    },
    [runOptimisticMutation, rescheduleTasksMutation, serverTasks]
  );

  return {
    markDone,
    moveToToday,
    scheduleToDate,
    scheduleManyToDate,
    markManyDone,
    sendToInbox,
    reopenTask,
    deleteTask,
    handleSaveEdits,
    handleInboxDragEnd,
    handleTimelineDragEnd,
    shiftTimelineTask,
  };
}
