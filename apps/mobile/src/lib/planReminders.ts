import { isWithinQuietHours } from "./notifications";
import type { ReminderLeadTimeMinutes } from "./userPreferences";

export const REMINDER_ID_PREFIX = "pravah-reminder-";
export const REMINDER_WINDOW_DAYS = 7;

export type ReminderSpec = {
  /** Stable identifier including fireAt ms, so a time change produces a new ID. */
  id: string;
  fireAt: Date;
  title: string;
  body: string;
};

type PlannerTask = {
  _id: string;
  title: string;
  deadline?: string;
  time?: string;
  completedAt?: number;
  cancelledAt?: number;
};

type PlannerPreferences = {
  morningDigestTime: string;
  reminderLeadTimeMinutes: ReminderLeadTimeMinutes;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

function parseTimeToMinutes(value: string): number | null {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTime(value: number): string {
  const minutes = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`;
}

function clampDigestTimeOutsideQuietHours(prefs: PlannerPreferences): string {
  if (
    !isWithinQuietHours(prefs.morningDigestTime, {
      enabled: prefs.quietHoursEnabled,
      start: prefs.quietHoursStart,
      end: prefs.quietHoursEnd,
    })
  ) {
    return prefs.morningDigestTime;
  }

  const digestMin = parseTimeToMinutes(prefs.morningDigestTime);
  const startMin = parseTimeToMinutes(prefs.quietHoursStart);
  const endMin = parseTimeToMinutes(prefs.quietHoursEnd);
  if (digestMin === null || startMin === null || endMin === null || startMin === endMin) {
    return prefs.morningDigestTime;
  }

  if (startMin < endMin) {
    const minutesToStart = digestMin - (startMin - 1);
    const minutesToEnd = endMin - digestMin;
    return minutesToEnd <= minutesToStart
      ? minutesToTime(endMin)
      : minutesToTime(startMin - 1);
  }

  if (digestMin < endMin) {
    return minutesToTime(endMin);
  }

  return minutesToTime(startMin - 1);
}

function parseDeadlineTime(deadline: string, time: string): Date | null {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const [yStr, moStr, dStr] = deadline.split("-");
  const y = Number(yStr);
  const mo = Number(moStr) - 1;
  const d = Number(dStr);
  if (Number.isNaN(y) || Number.isNaN(mo + 1) || Number.isNaN(d)) return null;
  return new Date(y, mo, d, h, m, 0, 0);
}

function formatDigestBody(count: number): string {
  return `${count} ${count === 1 ? "Task" : "Tasks"} due today`;
}

/**
 * Pure planner: maps current Tasks to the desired set of Reminder specs.
 *
 * Rules for this slice (issue #80):
 *   - Timed Tasks (deadline + time, not completed/cancelled/inbox) → one lead-time
 *     spec plus one at-time spec.
 *   - Date-only Tasks (deadline with no time) collapse into one morning digest spec
 *     per day at the configured digest time.
 *   - Specs must be strictly after `now` and within REMINDER_WINDOW_DAYS to respect
 *     the iOS 64 pending-notification ceiling.
 *   - No side effects.
 */
export function planReminders(
  tasks: PlannerTask[],
  prefs: PlannerPreferences,
  now: Date,
): ReminderSpec[] {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const specs: ReminderSpec[] = [];
  const digestCounts = new Map<string, number>();

  function maybePushSpec(task: PlannerTask, fireAt: Date, suffix: string, body: string): void {
    if (fireAt <= now || fireAt > windowEnd) return;
    specs.push({
      id: `${REMINDER_ID_PREFIX}${task._id}-${suffix}-${fireAt.getTime()}`,
      fireAt,
      title: "Pravah",
      body,
    });
  }

  for (const task of tasks) {
    if (!task.deadline) continue;
    if (task.completedAt !== undefined || task.cancelledAt !== undefined) continue;

    if (!task.time) {
      digestCounts.set(task.deadline, (digestCounts.get(task.deadline) ?? 0) + 1);
      continue;
    }

    const fireAt = parseDeadlineTime(task.deadline, task.time);
    if (!fireAt) continue;

    const leadFireAt = new Date(fireAt.getTime() - prefs.reminderLeadTimeMinutes * 60 * 1000);
    maybePushSpec(
      task,
      leadFireAt,
      `lead-${prefs.reminderLeadTimeMinutes}`,
      `Upcoming: ${task.title}`,
    );
    maybePushSpec(task, fireAt, "at", task.title);
  }

  for (const [deadline, count] of digestCounts) {
    const fireAt = parseDeadlineTime(deadline, clampDigestTimeOutsideQuietHours(prefs));
    if (!fireAt) continue;
    if (fireAt <= now || fireAt > windowEnd) continue;
    specs.push({
      id: `${REMINDER_ID_PREFIX}digest-${deadline}-${fireAt.getTime()}`,
      fireAt,
      title: "Pravah",
      body: formatDigestBody(count),
    });
  }

  return specs.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
