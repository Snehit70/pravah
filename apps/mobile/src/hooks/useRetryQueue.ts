import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "../lib/haptic";
import { classifyError, createActionId, mobileLogger } from "../lib/logger";
import { retryQueueStorage } from "../lib/retry-queue-storage";
import { hydrateRetryQueue, prepareRetryQueueForPersist } from "../lib/retry-queue-utils";
import type { Id } from "../../../../convex/_generated/dataModel";

const RETRY_QUEUE_STORAGE_KEY = "pravah_mobile_retry_queue_v1";

export type RetryPayload =
  | {
      type: "addTask";
      idempotencyKey?: string;
      title: string;
      description?: string;
      deadline?: string;
      time?: string;
      priority?: "p1" | "p2" | "p3";
      goalId?: string;
    }
  | {
      type: "updateTask";
      taskId: Id<"tasks">;
      title: string;
      description?: string;
      deadline?: string | null;
      time?: string | null;
      priority?: "p1" | "p2" | "p3";
    }
  | {
      type: "completeTask";
      taskId: Id<"tasks">;
    }
  | {
      type: "completeTasks";
      taskIds: Id<"tasks">[];
    }
  | {
      type: "deleteInboxTasks";
      taskIds: Id<"tasks">[];
    }
  | {
      type: "moveTask";
      taskId: Id<"tasks">;
      targetDate: string;
    }
  | {
      type: "rescheduleTasks";
      updates: { taskId: Id<"tasks">; deadline: string }[];
    }
  | {
      type: "unscheduleTask";
      taskId: Id<"tasks">;
    }
  | {
      type: "reopenTask";
      taskId: Id<"tasks">;
    };

export type RetryQueueItem = {
  id: string;
  label: string;
  attempts: number;
  payload: RetryPayload;
};

export function useRetryQueue({
  runRetryPayload,
  onRetryComplete,
}: {
  runRetryPayload: (payload: RetryPayload) => Promise<void>;
  onRetryComplete: (message: string) => void;
}) {
  const [retryQueue, setRetryQueue] = useState<RetryQueueItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const lastRetryPersistLogMsRef = useRef<number>(0);
  const replayingRef = useRef(false);
  const persistChainRef = useRef(Promise.resolve());

  const enqueueRetry = useCallback((item: Omit<RetryQueueItem, "id" | "attempts">) => {
    setRetryQueue((current) => {
      const id = createActionId("retry-item");
      const payload = item.payload.type === "addTask"
        ? { ...item.payload, idempotencyKey: item.payload.idempotencyKey ?? id }
        : item.payload;
      const next = [...current, { ...item, id, payload, attempts: 0 }];
      mobileLogger.warn("retry_enqueued", {
        label: item.label,
        nextQueueSize: next.length,
        payloadType: item.payload.type,
      });
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void retryQueueStorage.getItem(RETRY_QUEUE_STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (!raw) {
        setIsHydrated(true);
        return;
      }
      try {
        const hydrated = hydrateRetryQueue(raw);
        setRetryQueue((current) => [...new Map([...hydrated, ...current].map((item) => [item.id, item])).values()]);
        mobileLogger.info("retry_queue_hydrated", { hydratedCount: hydrated.length });
      } catch {
        void retryQueueStorage.removeItem(RETRY_QUEUE_STORAGE_KEY);
        mobileLogger.warn("retry_queue_corrupt_reset");
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    }).catch((error) => {
      // If the storage read itself rejects (transient keychain / AsyncStorage
      // error), we must still flip hydration complete. Otherwise persistence
      // is permanently blocked for this session because the effect that
      // persists on queue changes is gated behind `isHydrated`.
      if (!cancelled) {
        mobileLogger.warn("retry_queue_hydration_read_failed", {
          errorType: classifyError(error),
        });
        setIsHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    // Persist on AsyncStorage first because the retry queue is non-secret
    // operational state, not credential material.
    const toStore = prepareRetryQueueForPersist(retryQueue);
    const stored = JSON.stringify(toStore);
    persistChainRef.current = persistChainRef.current
      .catch(() => undefined)
      .then(() => retryQueueStorage.setItem(RETRY_QUEUE_STORAGE_KEY, stored)).catch((error) => {
      mobileLogger.warn("retry_queue_persist_failed", { errorType: classifyError(error) });
    });

    if (!__DEV__) return;
    const now = Date.now();
    if (now - lastRetryPersistLogMsRef.current < 2000) return;
    lastRetryPersistLogMsRef.current = now;
    mobileLogger.debug("retry_queue_persisted", { queueSize: retryQueue.length, stored: toStore.length });
  }, [isHydrated, retryQueue]);

  const retryQueuedMutations = useCallback(async () => {
    if (!isHydrated || !retryQueue.length || replayingRef.current) return;
    replayingRef.current = true;

    const actionId = createActionId("retry");
    const startedAt = Date.now();
    mobileLogger.info("retry_run_started", { actionId, queueSize: retryQueue.length });

    const snapshot = [...retryQueue];
    let failed = 0;
    try {
      for (const queued of snapshot) {
        try {
          await runRetryPayload(queued.payload);
          // Keep every unacknowledged entry persisted throughout replay.
          setRetryQueue((current) => current.filter((entry) => entry.id !== queued.id));
        } catch {
          failed += 1;
          const nextAttempts = queued.attempts + 1;
          mobileLogger.warn("retry_item_failed", {
            actionId,
            label: queued.label,
            payloadType: queued.payload.type,
            attempts: nextAttempts,
            dropped: false,
          });

          setRetryQueue((current) => current.map((entry) =>
            entry.id === queued.id ? { ...entry, attempts: nextAttempts } : entry));
        }
      }

      if (failed === 0) {
        onRetryComplete("Retry complete");
        haptic.success();
      }

      mobileLogger.info("retry_run_finished", {
        actionId,
        elapsedMs: Date.now() - startedAt,
        attempted: snapshot.length,
        failed,
        succeeded: snapshot.length - failed,
      });
    } finally {
      replayingRef.current = false;
    }
  }, [isHydrated, onRetryComplete, retryQueue, runRetryPayload]);

  return {
    retryQueue,
    enqueueRetry,
    retryQueuedMutations,
  };
}
