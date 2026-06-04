/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import type { GoalItem } from "../lib/goalsStorage";
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

function makeId(value: string) {
  return value as Id<"tasks">;
}

function task(partial: Partial<MobileTask> & { id: string }): MobileTask {
  const { id, ...rest } = partial;
  return {
    _id: makeId(id),
    title: rest.title ?? id,
    status: rest.status ?? "scheduled",
    position: rest.position ?? 0,
    updatedAt: 0,
    ...rest,
  } as MobileTask;
}

function goal(partial: Partial<GoalItem> & { id: string; text: string }): GoalItem {
  return {
    createdAt: 1,
    ...partial,
  };
}

describe("useOverdueTriageController", () => {
  beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it("preserves selected deadline updates in offline reflow retry payloads", async () => {
    const enqueueRetry = vi.fn();
    const showToast = vi.fn();
    const updateGoal = vi.fn();
    const rescheduleTasksMutation = vi.fn().mockRejectedValue(new Error("offline"));

    const goals = [goal({ id: "g1", text: "Ship beta", deadline: "2026-06-01", priority: "p1" })];
    const workspaceTaskCorpus = [
      task({ id: "t1", scheduledDate: "2026-05-30", position: 0 }),
      task({ id: "t2", scheduledDate: "2026-05-31", position: 1 }),
    ];

    const { result } = renderHook(() =>
      useOverdueTriageController({
        workspaceTaskCorpus,
        goalLinks: { t1: "g1", t2: "g1" },
        goals,
        today: "2026-06-03",
        tomorrow: "2026-06-04",
        weekEnd: "2026-06-09",
        rescheduleTasksMutation,
        moveTaskMutation: vi.fn(),
        softDeleteTaskMutation: vi.fn(),
        restoreTaskMutation: vi.fn(),
        updateGoal,
        showToast,
        enqueueRetry,
      })
    );

    act(() => {
      result.current.openPreview("g1");
      result.current.setApplyDeadline(true);
    });

    act(() => {
      result.current.confirmPreview();
    });

    await waitFor(() => {
      expect(enqueueRetry).toHaveBeenCalledTimes(1);
    });

    expect(enqueueRetry).toHaveBeenCalledWith({
      label: "Reschedule 2 tasks",
      payload: {
        type: "rescheduleTasks",
        updates: [
          { taskId: makeId("t1"), scheduledDate: "2026-06-03" },
          { taskId: makeId("t2"), scheduledDate: "2026-06-04" },
        ],
        goalUpdates: [
          {
            goalId: "g1",
            draft: {
              text: "Ship beta",
              description: undefined,
              deadline: "2026-06-04",
              priority: "p1",
            },
          },
        ],
      },
    });
    expect(updateGoal).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({
      kind: "error",
      message: "Offline. Reschedule queued for retry.",
    });
  });
});
