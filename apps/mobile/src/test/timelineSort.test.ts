import { describe, expect, it } from "vitest";
import { compareTasksWithinDay, compareTaskOrder } from "../lib/taskLifecycle";
import type { Id } from "../../../../convex/_generated/dataModel";

type SortableTask = {
  _id: Id<"tasks">;
  time?: string;
  priority?: "p1" | "p2" | "p3";
  position: number;
};

function makeTask(id: string, overrides: Partial<SortableTask> = {}): SortableTask {
  return { _id: id as Id<"tasks">, position: 0, ...overrides };
}

/** Sort tasks within a single deadline day using the same comparator chain
 *  used in useTaskQueries: compareTasksWithinDay, then compareTaskOrder. */
function sortWithinDay(tasks: SortableTask[]): SortableTask[] {
  return [...tasks].sort(
    (a, b) => compareTasksWithinDay(a, b) || compareTaskOrder(a, b)
  );
}

describe("compareTasksWithinDay — within-day Timeline ordering", () => {
  it("timed tasks appear before date-only tasks", () => {
    const tasks = [
      makeTask("date-only", { position: 0 }),
      makeTask("timed", { time: "09:00", position: 1 }),
    ];
    const result = sortWithinDay(tasks);
    expect(result[0]._id).toBe("timed");
    expect(result[1]._id).toBe("date-only");
  });

  it("timed tasks sort chronologically", () => {
    const tasks = [
      makeTask("t3", { time: "17:00" }),
      makeTask("t1", { time: "08:30" }),
      makeTask("t2", { time: "13:00" }),
    ];
    const result = sortWithinDay(tasks);
    expect(result.map((t) => t._id)).toEqual(["t1", "t2", "t3"]);
  });

  it("date-only tasks retain their manual position relative to each other", () => {
    const tasks = [
      makeTask("d2", { position: 2 }),
      makeTask("d0", { position: 0 }),
      makeTask("d1", { position: 1 }),
    ];
    const result = sortWithinDay(tasks);
    expect(result.map((t) => t._id)).toEqual(["d0", "d1", "d2"]);
  });

  it("mixed: timed tasks appear first, then date-only in manual order", () => {
    const tasks = [
      makeTask("d1", { position: 1 }),
      makeTask("t2", { time: "14:00" }),
      makeTask("d0", { position: 0 }),
      makeTask("t1", { time: "09:00" }),
    ];
    const result = sortWithinDay(tasks);
    expect(result.map((t) => t._id)).toEqual(["t1", "t2", "d0", "d1"]);
  });

  it("day with only date-only tasks is unaffected by time comparator", () => {
    const tasks = [
      makeTask("d2", { position: 2 }),
      makeTask("d0", { position: 0 }),
    ];
    const result = sortWithinDay(tasks);
    expect(result.map((t) => t._id)).toEqual(["d0", "d2"]);
  });

  it("day with only timed tasks sorts chronologically", () => {
    const tasks = [
      makeTask("noon", { time: "12:00" }),
      makeTask("morning", { time: "07:00" }),
      makeTask("evening", { time: "19:30" }),
    ];
    const result = sortWithinDay(tasks);
    expect(result.map((t) => t._id)).toEqual(["morning", "noon", "evening"]);
  });

  it("midnight (00:00) sorts before all other timed tasks", () => {
    const tasks = [
      makeTask("later", { time: "01:00" }),
      makeTask("midnight", { time: "00:00" }),
    ];
    const result = sortWithinDay(tasks);
    expect(result[0]._id).toBe("midnight");
  });

  it("compareTasksWithinDay returns 0 for two date-only tasks (falls through to compareTaskOrder)", () => {
    expect(compareTasksWithinDay({ time: undefined }, { time: undefined })).toBe(0);
  });
});
