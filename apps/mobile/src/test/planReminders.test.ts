import { describe, expect, it } from "vitest";
import { REMINDER_ID_PREFIX, REMINDER_WINDOW_DAYS, planReminders } from "../lib/planReminders";

describe("planReminders", () => {
  const now = new Date(2026, 5, 18, 9, 0, 0, 0);

  it("emits one at-time reminder for a timed task inside the rolling window", () => {
    const specs = planReminders(
      [{ _id: "task-1", title: "Call back", deadline: "2026-06-18", time: "14:30" }],
      now,
    );

    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      id: `${REMINDER_ID_PREFIX}task-1-${new Date(2026, 5, 18, 14, 30, 0, 0).getTime()}`,
      title: "Pravah",
      body: "Call back",
    });
    expect(specs[0].fireAt.toISOString()).toBe(new Date(2026, 5, 18, 14, 30, 0, 0).toISOString());
  });

  it("excludes inbox, completed, and cancelled tasks", () => {
    const specs = planReminders(
      [
        { _id: "inbox", title: "Inbox", time: "10:00" },
        { _id: "done", title: "Done", deadline: "2026-06-18", time: "10:00", completedAt: 1 },
        { _id: "cancelled", title: "Cancelled", deadline: "2026-06-18", time: "10:00", cancelledAt: 1 },
      ],
      now,
    );

    expect(specs).toEqual([]);
  });

  it("excludes past reminders and reminders beyond the 7-day window", () => {
    const beyondWindow = new Date(
      now.getTime() + (REMINDER_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000,
    );
    const futureYear = beyondWindow.getFullYear();
    const futureMonth = `${beyondWindow.getMonth() + 1}`.padStart(2, "0");
    const futureDay = `${beyondWindow.getDate()}`.padStart(2, "0");

    const specs = planReminders(
      [
        { _id: "past", title: "Past", deadline: "2026-06-18", time: "08:59" },
        {
          _id: "far",
          title: "Far",
          deadline: `${futureYear}-${futureMonth}-${futureDay}`,
          time: "09:01",
        },
      ],
      now,
    );

    expect(specs).toEqual([]);
  });

  it("ignores malformed deadline or time values", () => {
    const specs = planReminders(
      [
        { _id: "bad-time", title: "Bad time", deadline: "2026-06-18", time: "xx:yy" },
        { _id: "bad-date", title: "Bad date", deadline: "2026-99-99", time: "10:00" },
      ],
      now,
    );

    expect(specs).toEqual([]);
  });
});
