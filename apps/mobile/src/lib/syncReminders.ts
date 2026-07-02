import * as Notifications from "expo-notifications";
import { REMINDER_ID_PREFIX, type ReminderSpec } from "./planReminders";
import { REMINDERS_CHANNEL_ID } from "./reminderConstants";

export { REMINDERS_CHANNEL_ID } from "./reminderConstants";

/**
 * Sync layer: diffs planReminders output against currently-scheduled OS
 * notifications, then issues the minimal schedule/cancel calls. Holds no
 * product logic — all behavior lives in planReminders.
 */
export async function syncRemindersAsync(specs: ReminderSpec[]): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const existing = all.filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX));

  const newIds = new Set(specs.map((s) => s.id));
  const existingIds = new Set(existing.map((n) => n.identifier));

  // Cancel notifications no longer in the planner output.
  const toCancel = existing.filter((n) => !newIds.has(n.identifier));
  await Promise.all(
    toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  // Schedule specs not yet in the OS notification list.
  const toSchedule = specs.filter((s) => !existingIds.has(s.id));
  await Promise.all(
    toSchedule.map((spec) =>
      Notifications.scheduleNotificationAsync({
        identifier: spec.id,
        content: {
          title: spec.title,
          body: spec.body,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: spec.fireAt,
          channelId: REMINDERS_CHANNEL_ID,
        },
      })
    )
  );
}

/** Cancel every pravah-managed pending Reminder (used by data reset). */
export async function cancelAllRemindersAsync(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const pravah = all.filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX));
  await Promise.all(
    pravah.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}
