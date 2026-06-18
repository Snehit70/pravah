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

/**
 * Pure planner: maps current Tasks to the desired set of Reminder specs.
 *
 * Rules for this slice (issue #78 — tracer bullet):
 *   - Timed Tasks (deadline + time, not completed/cancelled/inbox) → one at-time spec.
 *   - Specs must be strictly after `now` and within REMINDER_WINDOW_DAYS to respect
 *     the iOS 64 pending-notification ceiling.
 *   - No side effects.
 */
export function planReminders(tasks: PlannerTask[], now: Date): ReminderSpec[] {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const specs: ReminderSpec[] = [];

  for (const task of tasks) {
    if (!task.deadline || !task.time) continue;
    if (task.completedAt !== undefined || task.cancelledAt !== undefined) continue;

    const fireAt = parseDeadlineTime(task.deadline, task.time);
    if (!fireAt) continue;

    if (fireAt <= now || fireAt > windowEnd) continue;

    specs.push({
      id: `${REMINDER_ID_PREFIX}${task._id}-${fireAt.getTime()}`,
      fireAt,
      title: "Pravah",
      body: task.title,
    });
  }

  return specs;
}
