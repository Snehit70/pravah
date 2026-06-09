/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOverdueTriageController } from "../features/overdue-triage/controller";

vi.mock("expo-haptics", () => ({
  default: {},
  notificationAsync: vi.fn(),
  impactAsync: vi.fn(),
  NotificationFeedbackType: {
    Success: "success",
  },
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
  },
}));

vi.mock("../lib/logger", () => ({
  classifyError: () => "network",
  createActionId: () => "reflow-test-action",
  mobileLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("useOverdueTriageController", () => {
  beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it("does not queue stale-sensitive reflows for offline retry", async () => {
    const enqueueRetry = vi.fn();
    const showToast = vi.fn();
    const applyReflowMutation = vi.fn().mockRejectedValue(new Error("offline"));

    const previewData = {
      totalOverdue: 2,
      planToken: "all-token",
      orphans: [],
      groups: [
        {
          goalId: "g1",
          goalText: "Ship beta",
          goalDeadline: "2026-06-01",
          overdueCount: 2,
          movedCount: 2,
          futureMovedCount: 0,
          mode: "march" as const,
          projectedEnd: "2026-06-04",
          suggestedDeadline: "2026-06-04",
          defaultApplyDeadline: true,
          assignments: [
            { taskId: "t1", deadline: "2026-06-03" },
            { taskId: "t2", deadline: "2026-06-04" },
          ],
          planToken: "g1-token",
          tasks: [
            {
              taskId: "t1",
              title: "Task 1",
              currentDate: "2026-05-30",
              nextDate: "2026-06-03",
              changed: true,
            },
            {
              taskId: "t2",
              title: "Task 2",
              currentDate: "2026-05-31",
              nextDate: "2026-06-04",
              changed: true,
            },
          ],
        },
      ],
    };

    const { result } = renderHook(() =>
      useOverdueTriageController({
        previewData,
        today: "2026-06-03",
        tomorrow: "2026-06-04",
        weekEnd: "2026-06-09",
        applyReflowMutation,
        undoReflowMutation: vi.fn(),
        moveTaskMutation: vi.fn(),
        softDeleteTaskMutation: vi.fn(),
        restoreTaskMutation: vi.fn(),
        showToast,
        enqueueRetry,
      })
    );

    act(() => {
      result.current.openPreview("g1");
    });

    await waitFor(() => {
      expect(result.current.selectedPreview?.goalId).toBe("g1");
    });

    act(() => {
      result.current.setApplyDeadline(true);
      result.current.confirmPreview();
    });

    await waitFor(() => {
      expect(applyReflowMutation).toHaveBeenCalledWith({
        planToken: "g1-token",
        today: "2026-06-03",
        goalIdsToMoveDeadlines: ["g1"],
      });
    });

    expect(enqueueRetry).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({
      kind: "error",
      message: "Reconnect to apply this plan.",
    });
  });
});
