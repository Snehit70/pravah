import { useCallback, useMemo, useState } from "react";
import * as Haptics from "expo-haptics";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { classifyError, createActionId, mobileLogger } from "../../lib/logger";
import type { GoalDraft, GoalItem } from "../../lib/goalsStorage";
import type { MobileTask } from "../../components/TaskCard";
import type { RetryPayload } from "../../hooks/useRetryQueue";
import type { ToastState } from "../../hooks/useWorkspaceState";
import type {
  ManualTriageTarget,
  OverduePreviewGroup,
  ReflowCommitItem,
} from "./types";
import { bucketOverdue, computeReflow } from "./reflow";

type GoalLinks = Record<string, string>;

type RetryEnqueue = (item: { label: string; payload: RetryPayload }) => void;
type ShowToast = (next: ToastState) => void;

type UpdateGoal = (id: string, draft: GoalDraft) => GoalItem | null;

type RescheduleTasksMutation = (args: {
  updates: { taskId: Id<"tasks">; scheduledDate: string }[];
}) => Promise<unknown>;

type MoveTaskMutation = (args: {
  taskId: Id<"tasks">;
  targetDate: string;
}) => Promise<unknown>;

type SoftDeleteTaskMutation = (args: { taskId: Id<"tasks"> }) => Promise<unknown>;
type RestoreTaskMutation = (args: { taskId: Id<"tasks"> }) => Promise<unknown>;

type UseOverdueTriageControllerOptions = {
  workspaceTaskCorpus: MobileTask[];
  goalLinks: GoalLinks;
  goals: GoalItem[];
  today: string;
  tomorrow: string;
  weekEnd: string;
  rescheduleTasksMutation: RescheduleTasksMutation;
  moveTaskMutation: MoveTaskMutation;
  softDeleteTaskMutation: SoftDeleteTaskMutation;
  restoreTaskMutation: RestoreTaskMutation;
  updateGoal: UpdateGoal;
  showToast: ShowToast;
  enqueueRetry: RetryEnqueue;
};

export function useOverdueTriageController({
  workspaceTaskCorpus,
  goalLinks,
  goals,
  today,
  tomorrow,
  weekEnd,
  rescheduleTasksMutation,
  moveTaskMutation,
  softDeleteTaskMutation,
  restoreTaskMutation,
  updateGoal,
  showToast,
  enqueueRetry,
}: UseOverdueTriageControllerOptions) {
  const [isOverdueSheetOpen, setIsOverdueSheetOpen] = useState(false);
  const [previewGoalId, setPreviewGoalId] = useState<string | null>(null);
  const [applyDeadline, setApplyDeadline] = useState(false);

  const overdueBuckets = useMemo(
    () => bucketOverdue(workspaceTaskCorpus, goalLinks, goals, today),
    [workspaceTaskCorpus, goalLinks, goals, today]
  );

  const previewGroups = useMemo<OverduePreviewGroup[]>(
    () =>
      overdueBuckets.groups.map((group) => {
        const result = computeReflow(group, today);
        const defaultApplyDeadline =
          Boolean(group.goal.deadline && group.goal.deadline < today && result.suggestedDeadline);
        return {
          goalId: group.goal.id,
          goalText: group.goal.text,
          goalDeadline: group.goal.deadline,
          overdueCount: group.overdueCount,
          movedCount: result.movedCount,
          futureMovedCount: result.futureMovedCount,
          mode: result.mode,
          projectedEnd: result.projectedEnd,
          suggestedDeadline: result.suggestedDeadline,
          defaultApplyDeadline,
          assignments: result.assignments,
          tasks: group.planTasks.map((task) => {
            const next = result.assignments.find((assignment) => assignment.taskId === String(task._id));
            const nextDate = next?.scheduledDate ?? task.scheduledDate ?? today;
            return {
              taskId: String(task._id),
              title: task.title,
              currentDate: task.scheduledDate,
              nextDate,
              changed: nextDate !== task.scheduledDate,
            };
          }),
        };
      }),
    [overdueBuckets.groups, today]
  );

  const selectedPreview = useMemo(
    () => previewGroups.find((group) => group.goalId === previewGoalId) ?? null,
    [previewGoalId, previewGroups]
  );

  const openOverdue = useCallback(() => {
    mobileLogger.info("overdue_sheet_opened", { totalOverdue: overdueBuckets.totalOverdue });
    setIsOverdueSheetOpen(true);
  }, [overdueBuckets.totalOverdue]);

  const closeOverdue = useCallback(() => {
    setIsOverdueSheetOpen(false);
    setPreviewGoalId(null);
  }, []);

  const openPreview = useCallback(
    (goalId: string) => {
      const preview = previewGroups.find((group) => group.goalId === goalId);
      if (!preview) return;
      setApplyDeadline(preview.defaultApplyDeadline);
      setPreviewGoalId(goalId);
    },
    [previewGroups]
  );

  const closePreview = useCallback(() => {
    setPreviewGoalId(null);
  }, []);

  const handleCommitReflow = useCallback(
    (items: ReflowCommitItem[]) => {
      const assignments = items.flatMap((item) => item.assignments);
      if (assignments.length === 0) {
        closeOverdue();
        return;
      }

      const dateById = new Map(
        workspaceTaskCorpus.map((task) => [String(task._id), task.scheduledDate])
      );
      const updates = assignments.map((assignment) => ({
        taskId: assignment.taskId as Id<"tasks">,
        scheduledDate: assignment.scheduledDate,
      }));
      const undoUpdates = assignments
        .filter((assignment) => dateById.get(assignment.taskId))
        .map((assignment) => ({
          taskId: assignment.taskId as Id<"tasks">,
          scheduledDate: dateById.get(assignment.taskId) as string,
        }));

      const deadlineUpdates: { id: string; draft: GoalDraft }[] = [];
      const deadlineUndo: { id: string; draft: GoalDraft }[] = [];
      for (const item of items) {
        if (!item.newDeadline) continue;
        const goal = goals.find((entry) => entry.id === item.goalId);
        if (!goal) continue;
        const baseDraft: GoalDraft = {
          text: goal.text,
          description: goal.description,
          deadline: goal.deadline,
          priority: goal.priority,
        };
        deadlineUndo.push({ id: goal.id, draft: baseDraft });
        deadlineUpdates.push({
          id: goal.id,
          draft: { ...baseDraft, deadline: item.newDeadline },
        });
      }

      const actionId = createActionId("reflow");
      mobileLogger.info("reflow_commit", {
        actionId,
        taskCount: updates.length,
        goals: items.length,
      });
      closeOverdue();

      void (async () => {
        try {
          await rescheduleTasksMutation({ updates });
          for (const item of deadlineUpdates) updateGoal(item.id, item.draft);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast({
            kind: "info",
            message: `Rescheduled ${updates.length} task${updates.length === 1 ? "" : "s"}`,
            action: {
              label: "Undo",
              run: () => {
                if (undoUpdates.length) void rescheduleTasksMutation({ updates: undoUpdates });
                for (const item of deadlineUndo) updateGoal(item.id, item.draft);
              },
            },
          });
        } catch (error) {
          if (classifyError(error) === "network") {
            enqueueRetry({
              label: `Reschedule ${updates.length} tasks`,
              payload: { type: "rescheduleTasks", updates },
            });
            showToast({ kind: "error", message: "Offline. Reschedule queued for retry." });
          } else {
            showToast({ kind: "error", message: "Could not reschedule. Please try again." });
          }
          mobileLogger.error("reflow_commit_failed", {
            actionId,
            errorType: classifyError(error),
          });
        }
      })();
    },
    [workspaceTaskCorpus, goals, rescheduleTasksMutation, updateGoal, showToast, enqueueRetry, closeOverdue]
  );

  const handleManualTriage = useCallback(
    (taskId: string, target: ManualTriageTarget) => {
      const id = taskId as Id<"tasks">;
      if (target === "drop") {
        void (async () => {
          try {
            await softDeleteTaskMutation({ taskId: id });
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            showToast({
              kind: "info",
              message: "Task dropped",
              action: {
                label: "Undo",
                run: () => void restoreTaskMutation({ taskId: id }),
              },
            });
          } catch {
            showToast({ kind: "error", message: "Could not drop task." });
          }
        })();
        return;
      }

      const targetDate = target === "today" ? today : target === "tomorrow" ? tomorrow : weekEnd;
      void (async () => {
        try {
          await moveTaskMutation({ taskId: id, targetDate });
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (error) {
          if (classifyError(error) === "network") {
            enqueueRetry({
              label: "Move task",
              payload: { type: "moveTask", taskId: id, targetDate },
            });
            showToast({ kind: "error", message: "Offline. Move queued for retry." });
          } else {
            showToast({ kind: "error", message: "Could not move task." });
          }
        }
      })();
    },
    [
      today,
      tomorrow,
      weekEnd,
      moveTaskMutation,
      softDeleteTaskMutation,
      restoreTaskMutation,
      showToast,
      enqueueRetry,
    ]
  );

  const confirmPreview = useCallback(() => {
    if (!selectedPreview) return;
    handleCommitReflow([
      {
        goalId: selectedPreview.goalId,
        goalText: selectedPreview.goalText,
        assignments: selectedPreview.assignments,
        newDeadline:
          applyDeadline && selectedPreview.suggestedDeadline
            ? selectedPreview.suggestedDeadline
            : undefined,
      },
    ]);
  }, [selectedPreview, applyDeadline, handleCommitReflow]);

  const rescheduleAll = useCallback(() => {
    handleCommitReflow(
      previewGroups.map((group) => ({
        goalId: group.goalId,
        goalText: group.goalText,
        assignments: group.assignments,
        newDeadline: group.defaultApplyDeadline ? group.suggestedDeadline : undefined,
      }))
    );
  }, [previewGroups, handleCommitReflow]);

  return {
    isOverdueSheetOpen,
    setIsOverdueSheetOpen,
    overdueBuckets,
    previewGroups,
    selectedPreview,
    applyDeadline,
    setApplyDeadline,
    openOverdue,
    closeOverdue,
    openPreview,
    closePreview,
    confirmPreview,
    rescheduleAll,
    handleManualTriage,
  };
}
