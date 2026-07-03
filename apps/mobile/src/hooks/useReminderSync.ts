import { useEffect } from "react";
import { AppState } from "react-native";
import type { MobileTask } from "../components/TaskCard";
import { planReminders } from "../lib/planReminders";
import { syncRemindersAsync } from "../lib/syncReminders";
import { classifyError, mobileLogger } from "../lib/logger";
import type { UserPreferences } from "../lib/userPreferences";

/**
 * Subscribes to task changes and app-foreground events, running a full
 * reminder sync on each trigger. Re-syncing on task mutations keeps scheduled
 * notifications current without requiring per-mutation notification calls.
 */
export function useReminderSync(
  tasks: MobileTask[],
  prefs: UserPreferences,
  notificationsEnabled: boolean,
): void {
  // Sync whenever the task list changes (covers: add, edit, complete, delete).
  // Debounced and deferred behind interactions so a settings tap (e.g. lead
  // time) paints immediately instead of stalling on the reschedule burst.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const timer = setTimeout(() => {
      const specs = planReminders(tasks, prefs, new Date());
      void syncRemindersAsync(specs).catch((error) => {
        mobileLogger.warn("reminder_sync_failed", { errorType: classifyError(error) });
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [tasks, prefs, notificationsEnabled]);

  // Also sync on app foreground to roll the 7-day window forward.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      const specs = planReminders(tasks, prefs, new Date());
      void syncRemindersAsync(specs).catch((error) => {
        mobileLogger.warn("reminder_sync_foreground_failed", { errorType: classifyError(error) });
      });
    });
    return () => sub.remove();
  }, [tasks, prefs, notificationsEnabled]);
}
