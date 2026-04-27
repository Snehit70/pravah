/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useRetryQueue } from "../hooks/useRetryQueue";

const notificationAsyncMock = vi.fn();
const storageGetItemMock = vi.fn();
const storageSetItemMock = vi.fn();
const storageRemoveItemMock = vi.fn();

vi.mock("expo-haptics", () => ({
  default: {},
  notificationAsync: (...args: unknown[]) => notificationAsyncMock(...args),
  NotificationFeedbackType: {
    Success: "success",
  },
}));

vi.mock("../lib/logger", () => ({
  classifyError: () => "network",
  createActionId: () => "retry-test-action",
  mobileLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../lib/retry-queue-storage", () => ({
  retryQueueStorage: {
    getItem: (...args: unknown[]) => storageGetItemMock(...args),
    setItem: (...args: unknown[]) => storageSetItemMock(...args),
    removeItem: (...args: unknown[]) => storageRemoveItemMock(...args),
  },
}));

function makeId(value: string) {
  return value as Id<"tasks">;
}

describe("useRetryQueue", () => {
  beforeEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    notificationAsyncMock.mockReset();
    storageGetItemMock.mockReset();
    storageSetItemMock.mockReset();
    storageRemoveItemMock.mockReset();
    storageGetItemMock.mockResolvedValue(null);
    storageSetItemMock.mockResolvedValue(undefined);
    storageRemoveItemMock.mockResolvedValue(undefined);
  });

  it("enqueues retry payloads with attempts initialized to zero", async () => {
    const runRetryPayload = vi.fn().mockResolvedValue(undefined);
    const onRetryComplete = vi.fn();

    const { result } = renderHook(() =>
      useRetryQueue({
        runRetryPayload,
        onRetryComplete,
      })
    );

    act(() => {
      result.current.enqueueRetry({
        label: "Retry completion",
        payload: { type: "completeTask", taskId: makeId("task-1") },
      });
    });

    await waitFor(() => {
      expect(result.current.retryQueue).toHaveLength(1);
    });
    expect(result.current.retryQueue[0]?.attempts).toBe(0);
  });

  it("retries queued mutations and clears the queue on success", async () => {
    const runRetryPayload = vi.fn().mockResolvedValue(undefined);
    const onRetryComplete = vi.fn();

    const { result } = renderHook(() =>
      useRetryQueue({
        runRetryPayload,
        onRetryComplete,
      })
    );

    act(() => {
      result.current.enqueueRetry({
        label: "Retry reopen",
        payload: { type: "reopenTask", taskId: makeId("task-2") },
      });
    });

    await act(async () => {
      await result.current.retryQueuedMutations();
    });

    expect(runRetryPayload).toHaveBeenCalledWith({
      type: "reopenTask",
      taskId: makeId("task-2"),
    });
    expect(onRetryComplete).toHaveBeenCalledWith("Retry complete");
    expect(notificationAsyncMock).toHaveBeenCalled();
    expect(result.current.retryQueue).toHaveLength(0);
  });

  it("requeues failed mutations with incremented attempts", async () => {
    const runRetryPayload = vi.fn().mockRejectedValue(new Error("network down"));
    const onRetryComplete = vi.fn();

    const { result } = renderHook(() =>
      useRetryQueue({
        runRetryPayload,
        onRetryComplete,
      })
    );

    act(() => {
      result.current.enqueueRetry({
        label: "Retry move",
        payload: { type: "moveTask", taskId: makeId("task-3"), targetDate: "2026-04-25" },
      });
    });

    await act(async () => {
      await result.current.retryQueuedMutations();
    });

    await waitFor(() => {
      expect(result.current.retryQueue).toHaveLength(1);
    });
    expect(result.current.retryQueue[0]?.attempts).toBe(1);
    expect(onRetryComplete).not.toHaveBeenCalled();
  });
});
