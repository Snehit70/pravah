import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { classifyError, createActionId, mobileLogger } from "../lib/logger";
import { retryQueueStorage } from "../lib/retry-queue-storage";
import { hydrateRetryQueue, prepareRetryQueueForPersist } from "../lib/retry-queue-utils";
import type { Id } from "../../../../convex/_generated/dataModel";

const RETRY_QUEUE_STORAGE_KEY = "pravah_mobile_retry_queue_v1";
const MAX_RETRY_ATTEMPTS = 5;

export type RetryPayload =
  | {
      type: "addTask";
      title: string;
      description?: string;
      deadline?: string;
      scheduledDate?: string;
      priority?: "p1" | "p2" | "p3";
    }
  | {
      type: "updateTask";
      taskId: Id<"tasks">;
      title: string;
      description?: string;
      deadline?: string;
      priority?: "p1" | "p2" | "p3";
    }
  | {
      type: "completeTask";
      taskId: Id<"tasks">;
    }
  | {
      type: "moveTask";
      taskId: Id<"tasks">;
      targetDate: string;
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
  const lastRetryPersistLogMsRef = useRef<number>(0);

  const enqueueRetry = useCallback((item: Omit<RetryQueueItem, "id" | "attempts">) => {
    setRetryQueue((current) => {
      const next = [...current, { id: `${Date.now()}-${current.length}`, attempts: 0, ...item }];
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
      if (cancelled || !raw) return;
      try {
        const hydrated = hydrateRetryQueue(raw);
        setRetryQueue(hydrated);
        mobileLogger.info("retry_queue_hydrated", { hydratedCount: hydrated.length });
      } catch {
        void retryQueueStorage.removeItem(RETRY_QUEUE_STORAGE_KEY);
        mobileLogger.warn("retry_queue_corrupt_reset");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Persist on AsyncStorage first because the retry queue is non-secret
    // operational state, not credential material.
    const toStore = prepareRetryQueueForPersist(retryQueue);
    void retryQueueStorage.setItem(RETRY_QUEUE_STORAGE_KEY, JSON.stringify(toStore)).catch((error) => {
      mobileLogger.warn("retry_queue_persist_failed", { errorType: classifyError(error) });
    });

    if (!__DEV__) return;
    const now = Date.now();
    if (now - lastRetryPersistLogMsRef.current < 2000) return;
    lastRetryPersistLogMsRef.current = now;
    mobileLogger.debug("retry_queue_persisted", { queueSize: retryQueue.length, stored: toStore.length });
  }, [retryQueue]);

  const retryQueuedMutations = useCallback(async () => {
    if (!retryQueue.length) return;

    const actionId = createActionId("retry");
    const startedAt = Date.now();
    mobileLogger.info("retry_run_started", { actionId, queueSize: retryQueue.length });

    const snapshot = [...retryQueue];
    setRetryQueue([]);
    let failed = 0;

    for (const queued of snapshot) {
      try {
        await runRetryPayload(queued.payload);
      } catch {
        failed += 1;
        const nextAttempts = queued.attempts + 1;
        mobileLogger.warn("retry_item_failed", {
          actionId,
          label: queued.label,
          payloadType: queued.payload.type,
          attempts: nextAttempts,
          dropped: nextAttempts >= MAX_RETRY_ATTEMPTS,
        });

        if (nextAttempts < MAX_RETRY_ATTEMPTS) {
          setRetryQueue((current) => [...current, { ...queued, attempts: nextAttempts }]);
        }
      }
    }

    if (failed === 0) {
      onRetryComplete("Retry complete");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    mobileLogger.info("retry_run_finished", {
      actionId,
      elapsedMs: Date.now() - startedAt,
      attempted: snapshot.length,
      failed,
      succeeded: snapshot.length - failed,
    });
  }, [onRetryComplete, retryQueue, runRetryPayload]);

  return {
    retryQueue,
    enqueueRetry,
    retryQueuedMutations,
  };
}
