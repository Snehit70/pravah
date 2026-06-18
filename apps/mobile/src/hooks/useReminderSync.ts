import { useEffect } from "react";
import { AppState } from "react-native";
import type { MobileTask } from "../components/TaskCard";
import { planReminders } from "../lib/planReminders";
import { syncRemindersAsync } from "../lib/syncReminders";
import { classifyError, mobileLogger } from "../lib/logger";

/**
 * Subscribes to task changes and app-foreground events, running a full
 * reminder sync on each trigger. Re-syncing on task mutations keeps scheduled
 * notifications current without requiring per-mutation notification calls.
 */
export function useReminderSync(tasks: MobileTask[], notificationsEnabled: boolean): void {
  // Sync whenever the task list changes (covers: add, edit, complete, delete).
  useEffect(() => {
    if (!notificationsEnabled) return;
    const specs = planReminders(tasks, new Date());
    void syncRemindersAsync(specs).catch((error) => {
      mobileLogger.warn("reminder_sync_failed", { errorType: classifyError(error) });
    });
  }, [tasks, notificationsEnabled]);

  // Also sync on app foreground to roll the 7-day window forward.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      const specs = planReminders(tasks, new Date());
      void syncRemindersAsync(specs).catch((error) => {
        mobileLogger.warn("reminder_sync_foreground_failed", { errorType: classifyError(error) });
      });
    });
    return () => sub.remove();
  }, [tasks, notificationsEnabled]);
}
