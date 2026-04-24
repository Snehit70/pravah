/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import { useTaskMutations } from "../hooks/useTaskMutations";

const useMutationMock = vi.fn();
const impactAsyncMock = vi.fn();
const notificationAsyncMock = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: (...args: unknown[]) => impactAsyncMock(...args),
  notificationAsync: (...args: unknown[]) => notificationAsyncMock(...args),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
  },
  NotificationFeedbackType: {
    Success: "success",
    Error: "error",
  },
}));

vi.mock("../lib/logger", () => ({
  classifyError: () => "network",
  createActionId: () => "mutation-test-action",
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

function makeTask(overrides: Partial<MobileTask> = {}): MobileTask {
  return {
    _id: makeId("task-1"),
    title: "Task",
    status: "scheduled",
    scheduledDate: "2026-04-24",
    position: 0,
    updatedAt: 100,
    ...overrides,
  };
}

describe("useTaskMutations", () => {
  beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    useMutationMock.mockReset();
    impactAsyncMock.mockReset();
    notificationAsyncMock.mockReset();
  });

  it("runs markDone through the optimistic mutation runner", async () => {
    const completeTaskMutation = vi.fn().mockResolvedValue(undefined);
    const moveTaskMutation = vi.fn().mockResolvedValue(undefined);
    const unscheduleTaskMutation = vi.fn().mockResolvedValue(undefined);
    const reopenTaskMutation = vi.fn().mockResolvedValue(undefined);
    const updateTaskMutation = vi.fn().mockResolvedValue(undefined);
    const reorderTasksMutation = vi.fn().mockResolvedValue(undefined);
    const shiftScheduledTaskPositionMutation = vi.fn().mockResolvedValue(undefined);

    const mutationOrder = [
      completeTaskMutation,
      moveTaskMutation,
      unscheduleTaskMutation,
      reopenTaskMutation,
      updateTaskMutation,
      reorderTasksMutation,
      shiftScheduledTaskPositionMutation,
    ];
    let mutationIndex = 0;
    useMutationMock.mockImplementation(() => {
      const next = mutationOrder[mutationIndex % mutationOrder.length];
      mutationIndex += 1;
      return next;
    });

    const serverTasks = [makeTask()];
    let optimisticState: MobileTask[] | null = null;
    let pendingMutations = 0;
    const setOptimisticTasks = vi.fn((update: MobileTask[] | null | ((prev: MobileTask[] | null) => MobileTask[] | null)) => {
      optimisticState =
        typeof update === "function"
          ? (update as (prev: MobileTask[] | null) => MobileTask[] | null)(optimisticState)
          : update;
      return optimisticState;
    });
    const setPendingMutations = vi.fn((update: number | ((prev: number) => number)) => {
      pendingMutations =
        typeof update === "function" ? (update as (prev: number) => number)(pendingMutations) : update;
      return pendingMutations;
    });

    const { result } = renderHook(() =>
      useTaskMutations({
        serverTasks,
        setOptimisticTasks,
        setPendingMutations,
        enqueueRetry: vi.fn(),
        showToast: vi.fn(),
        today: "2026-04-24",
        hasPriorityBoundaryViolation: () => false,
      })
    );

    act(() => {
      result.current.markDone(makeId("task-1"));
    });

    await waitFor(() => {
      expect(completeTaskMutation).toHaveBeenCalledWith({ taskId: makeId("task-1") });
    });
    expect(setOptimisticTasks).toHaveBeenCalled();
    expect(setPendingMutations).toHaveBeenCalled();
    expect(pendingMutations).toBe(0);
  });

  it("rolls back optimistic state when timeline shift mutation fails", async () => {
    const completeTaskMutation = vi.fn().mockResolvedValue(undefined);
    const moveTaskMutation = vi.fn().mockResolvedValue(undefined);
    const unscheduleTaskMutation = vi.fn().mockResolvedValue(undefined);
    const reopenTaskMutation = vi.fn().mockResolvedValue(undefined);
    const updateTaskMutation = vi.fn().mockResolvedValue(undefined);
    const reorderTasksMutation = vi.fn().mockResolvedValue(undefined);
    const shiftScheduledTaskPositionMutation = vi.fn().mockRejectedValue(new Error("network"));

    const mutationOrder = [
      completeTaskMutation,
      moveTaskMutation,
      unscheduleTaskMutation,
      reopenTaskMutation,
      updateTaskMutation,
      reorderTasksMutation,
      shiftScheduledTaskPositionMutation,
    ];
    let mutationIndex = 0;
    useMutationMock.mockImplementation(() => {
      const next = mutationOrder[mutationIndex % mutationOrder.length];
      mutationIndex += 1;
      return next;
    });

    const first = makeTask({ _id: makeId("task-1"), position: 0 });
    const second = makeTask({ _id: makeId("task-2"), position: 1 });
    const serverTasks = [first, second];
    let optimisticState: MobileTask[] | null = null;

    const setOptimisticTasks = vi.fn((update: MobileTask[] | null | ((prev: MobileTask[] | null) => MobileTask[] | null)) => {
      optimisticState =
        typeof update === "function"
          ? (update as (prev: MobileTask[] | null) => MobileTask[] | null)(optimisticState)
          : update;
      return optimisticState;
    });

    const showToast = vi.fn();

    const { result } = renderHook(() =>
      useTaskMutations({
        serverTasks,
        setOptimisticTasks,
        setPendingMutations: vi.fn(),
        enqueueRetry: vi.fn(),
        showToast,
        today: "2026-04-24",
        hasPriorityBoundaryViolation: () => false,
      })
    );

    act(() => {
      result.current.shiftTimelineTask(makeId("task-1"), "2026-04-24", "down");
    });

    await waitFor(() => {
      expect(shiftScheduledTaskPositionMutation).toHaveBeenCalledWith({
        taskId: makeId("task-1"),
        direction: "down",
      });
    });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalled();
    });

    expect(optimisticState).toBeNull();
  });
});
