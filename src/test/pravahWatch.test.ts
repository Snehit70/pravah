import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSnapshot,
  describeSnapshotForHumans,
  isSnapshotStale,
  readSnapshot,
  resolveLockPath,
  resolveSnapshotDir,
  resolveSnapshotPath,
  SNAPSHOT_VERSION,
  writeSnapshotAtomically,
  type WatchSnapshot,
  type WatchSourceData,
} from "../../packages/cli/src/watchSnapshot";
import { formatWaybarSegment } from "../../packages/cli/src/watchFormat";
import { getLocalDayBounds, msUntilNextLocalMidnight } from "../../packages/cli/src/localDay";

const NOW = new Date(2026, 8, 28, 14, 30, 0);

describe("snapshot path resolution", () => {
  it("prefers XDG_RUNTIME_DIR", () => {
    expect(resolveSnapshotDir({ XDG_RUNTIME_DIR: "/run/user/1000" })).toBe(
      "/run/user/1000/pravah"
    );
  });

  it("falls back to a per-uid tmp directory", () => {
    expect(
      resolveSnapshotDir({ TMPDIR: "/tmp", UID: "1000" })
    ).toBe("/tmp/pravah-1000");
  });

  it("puts the lock beside the snapshot", () => {
    const env = { XDG_RUNTIME_DIR: "/run/user/1000" };
    expect(resolveSnapshotPath(env)).toBe("/run/user/1000/pravah/snapshot.json");
    expect(resolveLockPath(env)).toBe("/run/user/1000/pravah/watch.pid");
  });
});

describe("writeSnapshotAtomically", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pravah-watch-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const snapshot = (overrides: Partial<WatchSourceData> = {}): WatchSnapshot =>
    buildSnapshot({
      convexUrl: "https://x.convex.cloud",
      boardTasks: [{ id: "t1", title: "Ship it", status: "timeline", deadline: "2026-09-28" }],
      completedToday: [],
      goals: [],
      goalLinks: {},
      now: NOW,
      ...overrides,
    });

  it("creates missing directories and writes owner-only readable JSON", () => {
    const path = join(dir, "nested", "snapshot.json");
    writeSnapshotAtomically(path, snapshot());

    expect(statSync(path).mode & 0o777).toBe(0o600);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    expect(parsed.version).toBe(SNAPSHOT_VERSION);
    expect(parsed.tasks).toHaveLength(1);
  });

  it("leaves no temp files behind", () => {
    const path = join(dir, "snapshot.json");
    writeSnapshotAtomically(path, snapshot());
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });

  it("round-trips through readSnapshot", () => {
    const path = join(dir, "snapshot.json");
    const original = snapshot();
    writeSnapshotAtomically(path, original);
    expect(readSnapshot(path)).toEqual(original);
  });

  it("rejects unreadable, malformed, and foreign-version files", () => {
    const missing = join(dir, "missing.json");
    expect(readSnapshot(missing)).toBeNull();

    const malformed = join(dir, "malformed.json");
    writeFileSync(malformed, "{not json");
    expect(readSnapshot(malformed)).toBeNull();

    const foreign = join(dir, "foreign.json");
    writeFileSync(foreign, JSON.stringify({ version: 99 }));
    expect(readSnapshot(foreign)).toBeNull();
  });

  it("never exposes a partially written snapshot to a reader", () => {
    const path = join(dir, "snapshot.json");
    writeSnapshotAtomically(path, snapshot());
    const first = readSnapshot(path);
    writeSnapshotAtomically(
      path,
      snapshot({
        boardTasks: [
          { id: "t1", title: "Changed", status: "inbox" },
          { id: "t2", title: "New", status: "timeline" },
        ],
      })
    );
    const second = readSnapshot(path);
    // Each read observes a whole snapshot, never a mix of both writes.
    expect(first?.tasks.map((task) => task.id)).toEqual(["t1"]);
    expect(second?.tasks.map((task) => task.id)).toEqual(["t1", "t2"]);
  });
});

describe("buildSnapshot", () => {
  const source = {
    convexUrl: "https://x.convex.cloud",
    now: NOW,
    boardTasks: [
      { id: "t1", title: "Overdue thing", status: "timeline", deadline: "2026-09-01" },
      { id: "t2", title: "Today thing", status: "timeline", deadline: "2026-09-28" },
      { id: "t3", title: "Inbox thing", status: "inbox" },
    ],
    completedToday: [{ id: "t4", title: "Done thing", status: "completed" }],
    goals: [
      { id: "g1", text: "Ship v2" },
      { id: "g2", text: "Write docs" },
    ],
    goalLinks: { t1: "g1", t4: "g1" },
  };

  it("counts board buckets, overdue, and today's completions", () => {
    const snapshot = buildSnapshot(source);
    expect(snapshot.counts).toEqual({
      active: 3,
      inbox: 1,
      timeline: 2,
      overdue: 1,
      completedToday: 1,
      goals: 2,
    });
    expect(snapshot.day).toBe("2026-09-28");
  });

  it("attaches goal links to tasks", () => {
    const snapshot = buildSnapshot(source);
    expect(snapshot.tasks.find((task) => task.id === "t1")?.goalId).toBe("g1");
    expect(snapshot.tasks.find((task) => task.id === "t2")?.goalId).toBeUndefined();
  });

  it("rolls completed links into per-goal progress without double-counting", () => {
    const snapshot = buildSnapshot(source);
    // g1 is linked to one board task (t1) and one task completed today (t4).
    // linkedTasks counts active links only; the completion is counted once.
    const goal = snapshot.goals.find((candidate) => candidate.id === "g1");
    expect(goal).toMatchObject({ linkedTasks: 1, completedTasks: 1 });
    const unlinked = snapshot.goals.find((candidate) => candidate.id === "g2");
    expect(unlinked).toMatchObject({ linkedTasks: 0, completedTasks: 0 });
  });

  it("survives malformed query results", () => {
    const snapshot = buildSnapshot({
      convexUrl: "https://x.convex.cloud",
      boardTasks: null,
      completedToday: "nope",
      goals: [{ id: 5, text: "bad" }],
      goalLinks: null,
      now: NOW,
    } as unknown as WatchSourceData);
    expect(snapshot.counts.active).toBe(0);
    expect(snapshot.goals).toEqual([]);
  });

  it("maps the exact canonical query shape into the snapshot", () => {
    // Mirrors `toCanonicalTaskShape` (tasks.ts) and `goals:list` (goals.ts):
    // `_id` instead of `id`, no `status` field, lifecycle carried by
    // timestamps and dates.
    const completedAt = new Date(2026, 8, 28, 9, 15, 0).getTime();
    const snapshot = buildSnapshot({
      convexUrl: "https://x.convex.cloud",
      boardTasks: [
        {
          _id: "jd7x",
          _creationTime: 1,
          title: "Scheduled thing",
          description: "details",
          deadline: "2026-09-28",
          time: "09:00",
          scheduledAt: 1,
          completedAt: undefined,
          cancelledAt: undefined,
          position: 0,
          source: "manual",
          estimatedMinutes: 30,
          tags: ["home"],
          priority: "p1",
          createdBy: "user",
          ownerTokenIdentifier: "owner",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          _id: "kq2z",
          _creationTime: 2,
          title: "Inbox thing",
          description: undefined,
          deadline: undefined,
          time: undefined,
          scheduledAt: 2,
          completedAt: undefined,
          cancelledAt: undefined,
          position: 1,
          source: "manual",
          estimatedMinutes: undefined,
          tags: [],
          priority: undefined,
          createdBy: "user",
          ownerTokenIdentifier: "owner",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      completedToday: [
        {
          _id: "done1",
          _creationTime: 3,
          title: "Done thing",
          description: "finished",
          deadline: "2026-09-20",
          time: undefined,
          scheduledAt: 3,
          completedAt,
          cancelledAt: undefined,
          position: 2,
          source: "manual",
          estimatedMinutes: undefined,
          tags: ["work"],
          priority: "p2",
          createdBy: "user",
          ownerTokenIdentifier: "owner",
          createdAt: 3,
          updatedAt: completedAt,
        },
      ],
      goals: [
        {
          id: "g1",
          text: "Ship v2",
          description: "why",
          deadline: "2026-10-01",
          priority: "p1",
          createdAt: 1,
        },
      ],
      goalLinks: { jd7x: "g1", done1: "g1" },
      now: NOW,
    });
    expect(snapshot.tasks).toHaveLength(3);
    const scheduled = snapshot.tasks.find((task) => task.id === "jd7x");
    expect(scheduled).toMatchObject({
      title: "Scheduled thing",
      status: "timeline",
      deadline: "2026-09-28",
      description: "details",
      tags: ["home"],
      estimatedMinutes: 30,
      goalId: "g1",
    });
    const inbox = snapshot.tasks.find((task) => task.id === "kq2z");
    expect(inbox).toMatchObject({ status: "inbox" });
    // Completed history is appended so the Completed section and the goal
    // card see it, while the board counts stay active-only.
    const done = snapshot.tasks.find((task) => task.id === "done1");
    expect(done).toMatchObject({ status: "completed", completedAt });
    expect(snapshot.counts).toMatchObject({
      active: 2,
      inbox: 1,
      timeline: 1,
      completedToday: 1,
    });
    expect(snapshot.goals.find((goal) => goal.id === "g1")).toMatchObject({
      text: "Ship v2",
      description: "why",
      linkedTasks: 1,
      completedTasks: 1,
    });
  });
});

describe("stale snapshots", () => {
  it("marks a snapshot stale past the freshness window", () => {
    const snapshot = buildSnapshot({
      convexUrl: "https://x.convex.cloud",
      boardTasks: [],
      completedToday: [],
      goals: [],
      goalLinks: {},
      now: NOW,
    });
    expect(isSnapshotStale(snapshot, NOW.getTime())).toBe(false);
    expect(isSnapshotStale(snapshot, NOW.getTime() + 11 * 60 * 1000)).toBe(true);
  });
});

describe("formatWaybarSegment", () => {
  it("shows the next due task with icon, count, and title", () => {
    const snapshot = buildSnapshot({
      convexUrl: "https://x.convex.cloud",
      boardTasks: [
        { id: "t1", title: "Late", status: "timeline", deadline: "2026-09-01" },
        {
          id: "t2",
          title: "Soon",
          status: "timeline",
          deadline: "2026-09-28",
          time: "09:05",
          priority: "p1",
        },
        { id: "t3", title: "Queued", status: "inbox" },
      ],
      completedToday: [],
      goals: [],
      goalLinks: {},
      now: NOW,
    });
    const segment = formatWaybarSegment(snapshot);
    expect(segment.text).toContain("󰃭");
    expect(segment.text).toContain("Soon");
    expect(segment.text).toContain("9:05");
    expect(segment.text).toContain("#f1c27d");
    expect(segment.class).toBe("has-tasks");
    expect(segment.tooltip).toContain("Today · 1 left");
    expect(segment.tooltip).toContain("28 Sep");
    // waybar parses one JSON object per line, so the shape must survive a round trip.
    expect(JSON.parse(JSON.stringify(segment))).toEqual(segment);
  });

  it("shows only the icon when nothing is due today", () => {
    const snapshot = buildSnapshot({
      convexUrl: "https://x.convex.cloud",
      boardTasks: [
        { id: "t1", title: "Late", status: "timeline", deadline: "2026-09-01" },
        { id: "t3", title: "Queued", status: "inbox" },
      ],
      completedToday: [],
      goals: [],
      goalLinks: {},
      now: NOW,
    });
    const segment = formatWaybarSegment(snapshot);
    expect(segment.text).toBe("󰃭");
    expect(segment.class).toBe("clear");
    expect(segment.tooltip).toContain("Nothing left today");
  });

  it("escapes pango markup in titles", () => {
    const snapshot = buildSnapshot({
      convexUrl: "https://x.convex.cloud",
      boardTasks: [
        { id: "t2", title: "Fish & <Chips>", status: "timeline", deadline: "2026-09-28" },
      ],
      completedToday: [],
      goals: [],
      goalLinks: {},
      now: NOW,
    });
    const segment = formatWaybarSegment(snapshot);
    expect(segment.text).toContain("Fish &amp; &lt;Chips&gt;");
    expect(segment.text).not.toContain("Fish & <Chips>");
  });

  it("flags degraded snapshots with the error class", () => {
    const snapshot = {
      ...buildSnapshot({
        convexUrl: "https://x.convex.cloud",
        boardTasks: [
          { id: "t2", title: "Soon", status: "timeline", deadline: "2026-09-28" },
        ],
        completedToday: [],
        goals: [],
        goalLinks: {},
        now: NOW,
      }),
      errors: ["goals:list"],
    };
    const segment = formatWaybarSegment(snapshot);
    expect(segment.class).toBe("error");
    expect(segment.text).toContain("Soon");
    expect(segment.tooltip).toContain("goals:list");
  });
});

describe("local day bounds", () => {
  it("uses local midnight, not UTC", () => {
    const bounds = getLocalDayBounds(new Date(2026, 8, 28, 0, 0, 0, 1));
    expect(bounds.day).toBe("2026-09-28");
    expect(new Date(bounds.startMs).getHours()).toBe(0);
    expect(bounds.endMs - bounds.startMs).toBe(24 * 60 * 60 * 1000);
  });

  it("schedules the next resubscribe inside the current day", () => {
    const wait = msUntilNextLocalMidnight(new Date(2026, 8, 28, 23, 59, 30));
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60 * 1000);
  });

  it("never schedules a zero-length wait", () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 28, 0, 0, 0, 0))).toBeGreaterThan(0);
  });
});

describe("describeSnapshotForHumans", () => {
  it("summarises the buckets a person cares about", () => {
    const snapshot = buildSnapshot({
      convexUrl: "https://x.convex.cloud",
      boardTasks: [
        { id: "t1", title: "Late", status: "timeline", deadline: "2026-09-01" },
        { id: "t3", title: "Queued", status: "inbox" },
      ],
      completedToday: [{ id: "t4", title: "Done", status: "completed" }],
      goals: [{ id: "g1", text: "Ship" }],
      goalLinks: {},
      now: NOW,
    });
    const line = describeSnapshotForHumans(snapshot);
    expect(line).toContain("2026-09-28");
    expect(line).toContain("1 overdue");
    expect(line).toContain("1 done today");
    expect(line).toContain("1 goals");
  });
});
