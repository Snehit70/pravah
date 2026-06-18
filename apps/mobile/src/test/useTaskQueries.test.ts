import { describe, expect, it } from "vitest";
import {
  buildScheduledTasks,
  buildTimelineWindow,
  mapTaskDoc,
} from "../hooks/useTaskQueries";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

function makeTask(id: string, overrides: Partial<MobileTask> = {}): MobileTask {
  return {
    _id: id as Id<"tasks">,
    title: id,
    scheduledAt: 0,
    position: 0,
    updatedAt: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe("useTaskQueries timeline window", () => {
  it("keeps weekEnd at today+6 and fetches the full forward horizon", () => {
    const base = new Date("2026-05-01T10:30:00.000Z");
    const window = buildTimelineWindow(base);

    expect(window.today).toBe("2026-05-01");
    expect(window.tomorrow).toBe("2026-05-02");
    expect(window.weekEnd).toBe("2026-05-07");
    // No horizon cap: the upper bound is the far-future sentinel.
    expect(window.queryEndDate).toBe("9999-12-31");
  });

  it("keeps ISO date format stable across month boundaries", () => {
    const base = new Date("2026-01-30T08:00:00.000Z");
    const window = buildTimelineWindow(base);

    expect(window.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.weekEnd).toBe("2026-02-05");
    expect(window.queryEndDate).toBe("9999-12-31");
  });
});

describe("mapTaskDoc", () => {
  it("preserves the time-of-day field through mapping", () => {
    // Regression guard: the Timeline within-day sort reads `time`, so mapping
    // must carry it. Dropping it here silently disables ordering in the UI.
    const mapped = mapTaskDoc(
      makeTask("t", { deadline: "2026-06-20", time: "09:30" })
    );
    expect(mapped.time).toBe("09:30");
  });
});

describe("buildScheduledTasks — real Timeline data path", () => {
  it("orders timed tasks chronologically within a deadline day", () => {
    // Exercises the FULL pipeline (mapTaskDoc -> sort). A dropped `time` field
    // in mapping is caught here even though the isolated comparator test passes,
    // because without `time` these would fall back to manual position order.
    const docs = [
      makeTask("afternoon", { deadline: "2026-06-20", time: "15:00", position: 1 }),
      makeTask("morning", { deadline: "2026-06-20", time: "08:00", position: 2 }),
      makeTask("dateonly", { deadline: "2026-06-20", position: 0 }),
    ];
    const result = buildScheduledTasks(docs);
    expect(result.map((t) => t._id)).toEqual(["morning", "afternoon", "dateonly"]);
  });

  it("orders across days by deadline date before time-of-day", () => {
    const docs = [
      makeTask("day2-early", { deadline: "2026-06-21", time: "08:00" }),
      makeTask("day1-late", { deadline: "2026-06-20", time: "23:00" }),
    ];
    const result = buildScheduledTasks(docs);
    expect(result.map((t) => t._id)).toEqual(["day1-late", "day2-early"]);
  });
});
