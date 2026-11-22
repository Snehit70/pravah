import { describe, expect, it } from "vitest";

import {
  WIDGET_NOTICE_TTL_MS,
  WIDGET_STALE_AFTER_MS,
  buildWidgetSnapshot,
  buildWidgetView,
  completionOutcome,
  headerDateLabel,
  markSnapshotTaskDone,
  overdueLabel,
  parsePendingCompletions,
  parseWidgetSnapshot,
  rowsThatFit,
  syncedAgoLabel,
  type WidgetSnapshot,
  type WidgetView,
} from "../widget/widgetModel";
import { parseWidgetLink, widgetLink } from "../widget/widgetLinks";

// Sun 22 Nov 2026, 09:30 local time.
const NOW = new Date(2026, 10, 22, 9, 30);

type Source = {
  _id: string;
  title: string;
  deadline?: string;
  time?: string;
  priority?: "p1" | "p2" | "p3";
  completedAt?: number;
  cancelledAt?: number;
};

function task(id: string, deadline: string | undefined, extra: Partial<Source> = {}): Source {
  return { _id: id, title: `Task ${id}`, deadline, ...extra };
}

function snapshot(input: {
  scheduled?: Source[];
  completed?: Source[];
  previous?: WidgetSnapshot | null;
  now?: Date;
  inboxCount?: number;
}): WidgetSnapshot {
  return buildWidgetSnapshot({
    now: input.now ?? NOW,
    accent: "purple",
    theme: "system",
    inboxCount: input.inboxCount ?? 0,
    scheduledTasks: input.scheduled ?? [],
    completedTasks: input.completed ?? [],
    previous: input.previous,
  });
}

function ready(view: WidgetView) {
  if (view.kind !== "ready") throw new Error(`expected ready view, got ${view.kind}`);
  return view;
}

function view(snap: WidgetSnapshot | null, extra: Partial<Parameters<typeof buildWidgetView>[0]> = {}) {
  return buildWidgetView({ snapshot: snap, signedIn: true, pending: [], notice: null, now: NOW, ...extra });
}

describe("buildWidgetSnapshot", () => {
  it("keeps open dated tasks up to the lookahead and drops inbox, cancelled and far tasks", () => {
    const snap = snapshot({
      scheduled: [
        task("a", "2026-11-22"),
        task("b", "2026-11-24"),
        task("far", "2026-11-25"),
        task("inbox", undefined),
        task("cancelled", "2026-11-22", { cancelledAt: 1 }),
        task("overdue", "2026-11-10"),
      ],
    });
    expect(snap.tasks.map((entry) => entry.id)).toEqual(["overdue", "a", "b"]);
  });

  it("keeps only today's completions", () => {
    const dayStart = new Date(2026, 10, 22).getTime();
    const snap = snapshot({
      completed: [
        task("today", "2026-11-22", { completedAt: dayStart + 1000 }),
        task("yesterday", "2026-11-21", { completedAt: dayStart - 1000 }),
      ],
    });
    expect(snap.tasks.map((entry) => entry.id)).toEqual(["today"]);
  });

  it("carries forward today's completions the app no longer subscribes to", () => {
    const at = new Date(2026, 10, 22, 8).getTime();
    const previous = snapshot({ completed: [task("done", "2026-11-22", { completedAt: at })] });
    const next = snapshot({ previous, scheduled: [task("open", "2026-11-22")] });
    expect(next.tasks.map((entry) => entry.id)).toEqual(["open", "done"]);
  });

  it("does not carry forward a completion that was reopened", () => {
    const at = new Date(2026, 10, 22, 8).getTime();
    const previous = snapshot({ completed: [task("x", "2026-11-22", { completedAt: at })] });
    const next = snapshot({ previous, scheduled: [task("x", "2026-11-22")] });
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].id).toBe("x");
    expect(next.tasks[0].completedAt).toBeUndefined();
  });

  it("drops yesterday's carried completions after midnight", () => {
    const previous = snapshot({
      completed: [task("x", "2026-11-22", { completedAt: new Date(2026, 10, 22, 8).getTime() })],
    });
    const next = snapshot({ previous, now: new Date(2026, 10, 23, 0, 5) });
    expect(next.tasks).toEqual([]);
  });

  it("caps titles and ignores malformed times", () => {
    const snap = snapshot({ scheduled: [task("a", "2026-11-22", { title: "x".repeat(400), time: "9am" })] });
    expect(snap.tasks[0].title).toHaveLength(160);
    expect(snap.tasks[0].time).toBeUndefined();
  });
});

describe("buildWidgetView", () => {
  it("is signed out without a session and loading without a snapshot", () => {
    expect(buildWidgetView({ snapshot: null, signedIn: false, pending: [], notice: null, now: NOW }).kind).toBe(
      "signedOut",
    );
    expect(view(null).kind).toBe("loading");
  });

  it("buckets overdue, today, tomorrow and sorts timed before untimed by priority", () => {
    const snap = snapshot({
      scheduled: [
        task("untimed-p3", "2026-11-22", { priority: "p3" }),
        task("untimed-p1", "2026-11-22", { priority: "p1" }),
        task("late", "2026-11-22", { time: "14:00" }),
        task("early", "2026-11-22", { time: "08:00" }),
        task("tomorrow", "2026-11-23"),
        task("overdue", "2026-11-21"),
      ],
    });
    const result = ready(view(snap));
    expect(result.overdue.map((row) => row.id)).toEqual(["overdue"]);
    expect(result.overdue[0].meta).toBe("Yday");
    expect(result.today.map((row) => row.id)).toEqual(["early", "late", "untimed-p1", "untimed-p3"]);
    expect(result.tomorrow.map((row) => row.id)).toEqual(["tomorrow"]);
    expect(result.remaining).toBe(5);
    // 08:00 has passed at 09:30, so the next timed task is 14:00.
    expect(result.nextTimed?.id).toBe("late");
  });

  it("re-buckets against the current clock so midnight rolls tasks over", () => {
    const snap = snapshot({ scheduled: [task("t", "2026-11-23"), task("d", "2026-11-22")] });
    const nextDay = ready(view(snap, { now: new Date(2026, 10, 23, 0, 10) }));
    expect(nextDay.today.map((row) => row.id)).toEqual(["t"]);
    expect(nextDay.overdue.map((row) => row.id)).toEqual(["d"]);
    expect(nextDay.dateLabel).toBe("Mon 23 Nov");
  });

  it("shows widget ticks as done and saving until the server confirms", () => {
    const snap = snapshot({ scheduled: [task("a", "2026-11-22"), task("b", "2026-11-22")] });
    const result = ready(view(snap, { pending: [{ taskId: "a", title: "Task a", at: NOW.getTime() }] }));
    expect(result.today.map((row) => row.id)).toEqual(["b"]);
    expect(result.done).toEqual([expect.objectContaining({ id: "a", done: true, saving: true })]);
    expect(result.savingCount).toBe(1);
    expect(result.remaining).toBe(1);
  });

  it("marks a confirmed tick done in the snapshot", () => {
    const snap = snapshot({ scheduled: [task("a", "2026-11-22")] });
    const confirmed = markSnapshotTaskDone(snap, "a", NOW.getTime());
    const result = ready(view(confirmed));
    expect(result.today).toEqual([]);
    expect(result.done).toEqual([expect.objectContaining({ id: "a", saving: false })]);
  });

  it("flags stale snapshots and expires notices", () => {
    const old = snapshot({ now: new Date(NOW.getTime() - WIDGET_STALE_AFTER_MS - 60_000) });
    expect(ready(view(old)).stale).toBe(true);
    expect(ready(view(snapshot({}))).stale).toBe(false);

    const fresh = ready(view(snapshot({}), { notice: { message: "nope", at: NOW.getTime() - 1000 } }));
    expect(fresh.notice).toBe("nope");
    const expired = ready(
      view(snapshot({}), { notice: { message: "nope", at: NOW.getTime() - WIDGET_NOTICE_TTL_MS - 1 } }),
    );
    expect(expired.notice).toBeNull();
  });
});

describe("parsing stored data", () => {
  it("round-trips a snapshot and rejects garbage", () => {
    const snap = snapshot({ scheduled: [task("a", "2026-11-22", { time: "10:00", priority: "p2" })], inboxCount: 3 });
    expect(parseWidgetSnapshot(JSON.stringify(snap))).toEqual(snap);
    expect(parseWidgetSnapshot(null)).toBeNull();
    expect(parseWidgetSnapshot("{")).toBeNull();
    expect(parseWidgetSnapshot(JSON.stringify({ ...snap, version: 99 }))).toBeNull();
  });

  it("drops malformed snapshot entries and unknown enum values", () => {
    const raw = JSON.stringify({
      version: 1,
      capturedAt: 1,
      accent: "neon",
      theme: "sepia",
      inboxCount: -4,
      tasks: [null, { id: 1 }, { id: "a", title: "A", deadline: "bad" }, { id: "b", title: "B", deadline: "2026-11-22" }],
    });
    const parsed = parseWidgetSnapshot(raw);
    expect(parsed).toMatchObject({ accent: "purple", theme: "system", inboxCount: 0 });
    expect(parsed?.tasks.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("filters malformed pending entries", () => {
    const raw = JSON.stringify([{ taskId: "a", title: "A", at: 1 }, { taskId: 2 }, null]);
    expect(parsePendingCompletions(raw)).toEqual([{ taskId: "a", title: "A", at: 1 }]);
    expect(parsePendingCompletions("nope")).toEqual([]);
  });
});

describe("labels and sizing", () => {
  it("formats dates and sync ages", () => {
    expect(headerDateLabel(NOW)).toBe("Sun 22 Nov");
    expect(overdueLabel("2026-11-19", NOW)).toBe("Thu");
    expect(overdueLabel("2026-11-02", NOW)).toBe("2 Nov");
    expect(syncedAgoLabel(NOW.getTime() - 30_000, NOW.getTime())).toBe("just now");
    expect(syncedAgoLabel(NOW.getTime() - 6 * 3_600_000, NOW.getTime())).toBe("6h ago");
  });

  it("always fits at least one row", () => {
    expect(rowsThatFit(40, 76, 33)).toBe(1);
    expect(rowsThatFit(180, 76, 33)).toBe(3);
  });
});

describe("widget links", () => {
  it("round-trips every target", () => {
    expect(parseWidgetLink(widgetLink("capture"))).toEqual({ kind: "capture" });
    expect(parseWidgetLink(widgetLink("today"))).toEqual({ kind: "today" });
    expect(parseWidgetLink(widgetLink("inbox"))).toEqual({ kind: "inbox" });
    expect(parseWidgetLink(widgetLink("task", "abc/123"))).toEqual({ kind: "task", taskId: "abc/123" });
  });

  it("ignores other schemes and unknown paths", () => {
    expect(parseWidgetLink("https://pravah.app/today")).toBeNull();
    expect(parseWidgetLink("pravah://settings")).toBeNull();
    expect(parseWidgetLink("pravah://task/")).toBeNull();
    expect(parseWidgetLink("pravah://task/%E0%A4%A")).toBeNull();
    expect(parseWidgetLink(null)).toBeNull();
  });
});

describe("completionOutcome", () => {
  it("drops only answers that won't change on retry", () => {
    expect(completionOutcome("done")).toBe("done");
    expect(completionOutcome("not_found")).toBe("rejected");
    expect(completionOutcome("cancelled")).toBe("rejected");
    expect(completionOutcome("unauthenticated")).toBe("auth");
  });

  it("retries anything it doesn't recognise", () => {
    expect(completionOutcome(undefined)).toBe("retry");
    expect(completionOutcome(null)).toBe("retry");
    expect(completionOutcome("something_new")).toBe("retry");
  });
});
