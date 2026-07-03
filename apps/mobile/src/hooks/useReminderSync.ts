import { useEffect, useRef } from "react";
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
  // Serialize syncs so overlapping runs can't interleave their native
  // cancel/schedule calls and double-book or drop notifications.
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  const runSync = (logEvent: string) => {
    const specs = planReminders(tasks, prefs, new Date());
    chainRef.current = chainRef.current
      .then(() => syncRemindersAsync(specs))
      .catch((error) => {
        mobileLogger.warn(logEvent, { errorType: classifyError(error) });
      });
  };

  // Sync whenever the task list changes (covers: add, edit, complete, delete).
  // Debounced so a settings tap (e.g. lead time) paints immediately instead
  // of stalling on the reschedule burst; rapid changes coalesce into one run.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const timer = setTimeout(() => runSync("reminder_sync_failed"), 400);
    return () => clearTimeout(timer);
    // runSync reads tasks/prefs from this render's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, prefs, notificationsEnabled]);

  // Also sync on app foreground to roll the 7-day window forward.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      runSync("reminder_sync_foreground_failed");
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, prefs, notificationsEnabled]);
}
