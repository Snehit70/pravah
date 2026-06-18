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
};

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
    const fireAt = parseDeadlineTime(deadline, prefs.morningDigestTime);
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
