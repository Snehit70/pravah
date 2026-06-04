import { useCallback, useMemo, useState } from "react";
import * as Haptics from "expo-haptics";
import { classifyError, createActionId, mobileLogger } from "../../lib/logger";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ToastState } from "../../hooks/useWorkspaceState";
import type {
  ManualTriageTarget,
  OverduePreviewData,
  OverduePreviewGroup,
} from "./types";

type ShowToast = (next: ToastState) => void;

type ApplyReflowMutation = (args: {
  planToken: string;
  today: string;
  goalIdsToMoveDeadlines?: string[];
}) => Promise<{ operationId: string; taskCount: number; goalDeadlineCount: number }>;

type UndoReflowMutation = (args: {
  operationId: string;
}) => Promise<{ taskCount: number; goalDeadlineCount: number }>;

type MoveTaskMutation = (args: {
  taskId: Id<"tasks">;
  targetDate: string;
}) => Promise<unknown>;

type SoftDeleteTaskMutation = (args: { taskId: Id<"tasks"> }) => Promise<unknown>;
type RestoreTaskMutation = (args: { taskId: Id<"tasks"> }) => Promise<unknown>;

type RetryEnqueue = (item: {
  label: string;
  payload: {
    type: "moveTask";
    taskId: Id<"tasks">;
    targetDate: string;
  };
}) => void;

type UseOverdueTriageControllerOptions = {
  previewData: OverduePreviewData | undefined;
  today: string;
  tomorrow: string;
  weekEnd: string;
  applyReflowMutation: ApplyReflowMutation;
  undoReflowMutation: UndoReflowMutation;
  moveTaskMutation: MoveTaskMutation;
  softDeleteTaskMutation: SoftDeleteTaskMutation;
  restoreTaskMutation: RestoreTaskMutation;
  showToast: ShowToast;
  enqueueRetry: RetryEnqueue;
};

export function useOverdueTriageController({
  previewData,
  today,
  tomorrow,
  weekEnd,
  applyReflowMutation,
  undoReflowMutation,
  moveTaskMutation,
  softDeleteTaskMutation,
  restoreTaskMutation,
  showToast,
  enqueueRetry,
}: UseOverdueTriageControllerOptions) {
  const [isOverdueSheetOpen, setIsOverdueSheetOpen] = useState(false);
  const [previewGoalId, setPreviewGoalId] = useState<string | null>(null);
  const [applyDeadline, setApplyDeadline] = useState(false);

  const previewGroups = useMemo(() => previewData?.groups ?? [], [previewData]);
  const overdueBuckets = useMemo(
    () => ({
      totalOverdue: previewData?.totalOverdue ?? 0,
      groups: previewGroups,
      orphans: previewData?.orphans ?? [],
    }),
    [previewData, previewGroups]
  );

  const selectedPreview = useMemo<OverduePreviewGroup | null>(
    () => previewGroups.find((group) => group.goalId === previewGoalId) ?? null,
    [previewGoalId, previewGroups]
  );

  const openOverdue = useCallback(() => {
    mobileLogger.info("overdue_sheet_opened", {
      totalOverdue: previewData?.totalOverdue ?? 0,
    });
    setIsOverdueSheetOpen(true);
  }, [previewData?.totalOverdue]);

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

  const runApply = useCallback(
    async (group: OverduePreviewGroup | null, planToken: string, goalIdsToMoveDeadlines: string[]) => {
      const actionId = createActionId("reflow");
      mobileLogger.info("reflow_commit", {
        actionId,
        taskCount: group?.movedCount ?? previewGroups.reduce((sum, entry) => sum + entry.movedCount, 0),
        goals: group ? 1 : previewGroups.length,
      });
      closeOverdue();

      try {
        const applied = await applyReflowMutation({
          planToken,
          today,
          goalIdsToMoveDeadlines,
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast({
          kind: "info",
          message: `Rescheduled ${applied.taskCount} task${applied.taskCount === 1 ? "" : "s"}`,
          action: {
            label: "Undo last reflow",
            run: () => {
              void undoReflowMutation({ operationId: applied.operationId }).then(() => {
                showToast({ kind: "info", message: "Reflow undone" });
              }).catch((error: unknown) => {
                const errorType = classifyError(error);
                showToast({
                  kind: "error",
                  message:
                    errorType === "network"
                      ? "Reconnect to undo this reflow."
                      : error instanceof Error
                        ? error.message
                        : "Could not undo this reflow.",
                });
              });
            },
          },
        });
      } catch (error) {
        const errorType = classifyError(error);
        showToast({
          kind: "error",
          message:
            errorType === "network"
              ? "Reconnect to apply this plan."
              : error instanceof Error
                ? error.message
                : "Could not reschedule. Please try again.",
        });
        mobileLogger.error("reflow_commit_failed", {
          actionId,
          errorType,
        });
      }
    },
    [applyReflowMutation, closeOverdue, previewGroups, showToast, today, undoReflowMutation]
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
      enqueueRetry,
      moveTaskMutation,
      restoreTaskMutation,
      showToast,
      softDeleteTaskMutation,
      today,
      tomorrow,
      weekEnd,
    ]
  );

  const confirmPreview = useCallback(() => {
    if (!selectedPreview) return;
    void runApply(
      selectedPreview,
      selectedPreview.planToken,
      applyDeadline && selectedPreview.suggestedDeadline ? [selectedPreview.goalId] : []
    );
  }, [applyDeadline, runApply, selectedPreview]);

  const rescheduleAll = useCallback(() => {
    if (!previewData) return;
    const goalIdsToMoveDeadlines = previewGroups
      .filter((group) => group.defaultApplyDeadline && group.suggestedDeadline)
      .map((group) => group.goalId);
    void runApply(null, previewData.planToken, goalIdsToMoveDeadlines);
  }, [previewData, previewGroups, runApply]);

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
