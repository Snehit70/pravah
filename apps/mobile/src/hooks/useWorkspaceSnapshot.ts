import { useCallback, useEffect, useState } from "react";
import type { MobileTask } from "../components/TaskCard";
import { retryQueueStorage } from "../lib/retry-queue-storage";
import { classifyError, mobileLogger } from "../lib/logger";
import {
  hydrateWorkspaceSnapshot,
  prepareWorkspaceSnapshotForPersist,
  type WorkspaceSnapshot,
} from "../lib/workspace-snapshot";

const WORKSPACE_SNAPSHOT_STORAGE_KEY = "pravah_mobile_workspace_snapshot_v1";

type UseWorkspaceSnapshotOptions = {
  canHydrate: boolean;
  shouldPersist: boolean;
  inboxTasks: MobileTask[];
  scheduledTasks: MobileTask[];
  completedTasks: MobileTask[];
};

export function useWorkspaceSnapshot({
  canHydrate,
  shouldPersist,
  inboxTasks,
  scheduledTasks,
  completedTasks,
}: UseWorkspaceSnapshotOptions) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void retryQueueStorage
      .getItem(WORKSPACE_SNAPSHOT_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (!canHydrate || !raw) {
          setIsHydrated(true);
          return;
        }
        const next = hydrateWorkspaceSnapshot(raw);
        if (next) {
          setSnapshot(next);
          mobileLogger.info("workspace_snapshot_hydrated", {
            inboxCount: next.inboxTasks.length,
            timelineCount: next.scheduledTasks.length,
            completedCount: next.completedTasks.length,
          });
        }
        setIsHydrated(true);
      })
      .catch((error) => {
        if (cancelled) return;
        mobileLogger.warn("workspace_snapshot_hydration_failed", {
          errorType: classifyError(error),
        });
        setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [canHydrate]);

  useEffect(() => {
    if (!shouldPersist) return;
    const next = prepareWorkspaceSnapshotForPersist({
      capturedAt: Date.now(),
      inboxTasks,
      scheduledTasks,
      completedTasks,
    });
    void retryQueueStorage
      .setItem(WORKSPACE_SNAPSHOT_STORAGE_KEY, JSON.stringify(next))
      .catch((error) => {
        mobileLogger.warn("workspace_snapshot_persist_failed", {
          errorType: classifyError(error),
        });
      });
  }, [completedTasks, inboxTasks, scheduledTasks, shouldPersist]);

  const clearSnapshot = useCallback(async () => {
    setSnapshot(null);
    try {
      await retryQueueStorage.removeItem(WORKSPACE_SNAPSHOT_STORAGE_KEY);
    } catch (error) {
      mobileLogger.warn("workspace_snapshot_clear_failed", {
        errorType: classifyError(error),
      });
    }
  }, []);

  return {
    snapshot,
    isHydrated,
    clearSnapshot,
  };
}
