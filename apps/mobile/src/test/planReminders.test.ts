import { describe, expect, it } from "vitest";
import { REMINDER_ID_PREFIX, REMINDER_WINDOW_DAYS, planReminders } from "../lib/planReminders";

describe("planReminders", () => {
  const now = new Date(2026, 5, 18, 9, 0, 0, 0);
  const prefs = { reminderLeadTimeMinutes: 15, morningDigestTime: "09:00" } as const;

  it("emits a lead-time reminder and an at-time reminder for a timed task inside the rolling window", () => {
    const specs = planReminders(
      [{ _id: "task-1", title: "Call back", deadline: "2026-06-18", time: "14:30" }],
      prefs,
      now,
    );

    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({
      id: `${REMINDER_ID_PREFIX}task-1-lead-15-${new Date(2026, 5, 18, 14, 15, 0, 0).getTime()}`,
      title: "Pravah",
      body: "Upcoming: Call back",
    });
    expect(specs[1]).toMatchObject({
      id: `${REMINDER_ID_PREFIX}task-1-at-${new Date(2026, 5, 18, 14, 30, 0, 0).getTime()}`,
      title: "Pravah",
      body: "Call back",
    });
    expect(specs[0].fireAt.toISOString()).toBe(new Date(2026, 5, 18, 14, 15, 0, 0).toISOString());
    expect(specs[1].fireAt.toISOString()).toBe(new Date(2026, 5, 18, 14, 30, 0, 0).toISOString());
  });

  it("excludes inbox, completed, and cancelled tasks", () => {
    const specs = planReminders(
      [
        { _id: "inbox", title: "Inbox", time: "10:00" },
        { _id: "done", title: "Done", deadline: "2026-06-18", time: "10:00", completedAt: 1 },
        { _id: "cancelled", title: "Cancelled", deadline: "2026-06-18", time: "10:00", cancelledAt: 1 },
      ],
      prefs,
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
      prefs,
      now,
    );

    expect(specs).toEqual([]);
  });

  it("omits the lead-time spec when it falls outside the window but keeps the at-time spec", () => {
    const specs = planReminders(
      [{ _id: "task-1", title: "Standup", deadline: "2026-06-18", time: "09:10" }],
      prefs,
      now,
    );

    expect(specs).toHaveLength(1);
    expect(specs[0]?.body).toBe("Standup");
    expect(specs[0]?.id).toContain("-at-");
  });

  it("ignores malformed deadline or time values", () => {
    const specs = planReminders(
      [
        { _id: "bad-time", title: "Bad time", deadline: "2026-06-18", time: "xx:yy" },
        { _id: "bad-date", title: "Bad date", deadline: "2026-99-99", time: "10:00" },
      ],
      prefs,
      now,
    );

    expect(specs).toEqual([]);
  });

  it("groups date-only tasks due on the same day into one morning digest", () => {
    const specs = planReminders(
      [
        { _id: "d1", title: "Plan sprint", deadline: "2026-06-19" },
        { _id: "d2", title: "Write notes", deadline: "2026-06-19" },
        { _id: "timed", title: "Call", deadline: "2026-06-19", time: "15:00" },
      ],
      prefs,
      now,
    );

    const digest = specs.find((spec) => spec.id.includes("digest-2026-06-19"));
    expect(digest).toMatchObject({
      title: "Pravah",
      body: "2 Tasks due today",
    });
    expect(digest?.fireAt.toISOString()).toBe(new Date(2026, 5, 19, 9, 0, 0, 0).toISOString());
  });

  it("emits no digest for a day with no date-only tasks", () => {
    const specs = planReminders(
      [{ _id: "timed", title: "Call", deadline: "2026-06-19", time: "15:00" }],
      prefs,
      now,
    );

    expect(specs.some((spec) => spec.id.includes("digest-"))).toBe(false);
  });
});
