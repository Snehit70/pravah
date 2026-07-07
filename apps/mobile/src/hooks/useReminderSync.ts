import { useEffect } from "react";
import { AppState } from "react-native";
import type { MobileTask } from "../components/TaskCard";
import { planReminders } from "../lib/planReminders";
import { queueReminderSync } from "../lib/syncReminders";
import { classifyError, mobileLogger } from "../lib/logger";
import type { UserPreferences } from "../lib/userPreferences";

/**
 * Subscribes to task changes and app-foreground events, queueing a full
 * reminder sync on each trigger. Debouncing, coalescing, and serialization
 * live in the sync layer (queueReminderSync); this hook only signals intent.
 */
export function useReminderSync(
  tasks: MobileTask[],
  prefs: UserPreferences,
  notificationsEnabled: boolean,
): void {
  // Queue whenever the task list or reminder prefs change (covers: add,
  // edit, complete, delete, lead-time/digest/quiet-hours changes).
  useEffect(() => {
    if (!notificationsEnabled) return;
    queueReminderSync(
      () => planReminders(tasks, prefs, new Date()),
      (error) => {
        mobileLogger.warn("reminder_sync_failed", { errorType: classifyError(error) });
      },
    );
  }, [tasks, prefs, notificationsEnabled]);

  // Also sync on app foreground to roll the 7-day window forward. No
  // debounce: the window should refresh as soon as the app is visible.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      queueReminderSync(
        () => planReminders(tasks, prefs, new Date()),
        (error) => {
          mobileLogger.warn("reminder_sync_foreground_failed", {
            errorType: classifyError(error),
          });
        },
        0,
      );
    });
    return () => sub.remove();
  }, [tasks, prefs, notificationsEnabled]);
}
