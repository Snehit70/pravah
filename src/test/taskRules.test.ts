import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import {
  canScheduleTaskOnDate,
  getPriorityRank,
  getReorderedTaskIdsForDay,
  hasPriorityBoundaryViolation,
  isDateDropId,
} from "../lib/taskRules";

function makeTask(overrides: Partial<Task>): Task {
  return {
    _id: "task_id" as Id<"tasks">,
    title: "Task",
    type: "open",
    position: 0,
    status: "scheduled",
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("taskRules", () => {
  it("detects valid date drop IDs", () => {
    expect(isDateDropId("2026-04-08")).toBe(true);
    expect(isDateDropId("2026-4-8")).toBe(false);
    expect(isDateDropId("task_123")).toBe(false);
  });

  it("enforces deadline scheduling boundary", () => {
    const deadlineTask = makeTask({
      type: "deadline",
      deadline: "2026-04-10",
    });

    expect(canScheduleTaskOnDate(deadlineTask, "2026-04-09")).toBe(true);
    expect(canScheduleTaskOnDate(deadlineTask, "2026-04-10")).toBe(true);
    expect(canScheduleTaskOnDate(deadlineTask, "2026-04-11")).toBe(false);
  });

  it("allows carry-forward only for overdue deadlines", () => {
    const overdueTask = makeTask({
      type: "deadline",
      deadline: "2026-04-10",
    });
    const upcomingTask = makeTask({
      type: "deadline",
      deadline: "2026-04-20",
    });

    expect(
      canScheduleTaskOnDate(overdueTask, "2026-04-12", {
        allowOverdueCarryForward: true,
        currentDate: "2026-04-15",
      })
    ).toBe(true);

    expect(
      canScheduleTaskOnDate(upcomingTask, "2026-04-22", {
        allowOverdueCarryForward: true,
        currentDate: "2026-04-15",
      })
    ).toBe(false);
  });

  it("always allows open tasks to be scheduled", () => {
    const openTask = makeTask({ type: "open" });
    expect(canScheduleTaskOnDate(openTask, "2026-12-31")).toBe(true);
  });

  it("returns stable reorder IDs for same-day drag", () => {
    const first = makeTask({ _id: "a" as Id<"tasks">, position: 0 });
    const second = makeTask({ _id: "b" as Id<"tasks">, position: 1 });
    const third = makeTask({ _id: "c" as Id<"tasks">, position: 2 });

    const reordered = getReorderedTaskIdsForDay(
      [first, second, third],
      first._id,
      third._id
    );

    expect(reordered).toEqual([second._id, third._id, first._id]);
  });

  it("returns null when reorder is not actionable", () => {
    const single = makeTask({ _id: "x" as Id<"tasks"> });
    expect(getReorderedTaskIdsForDay([single], single._id, "missing")).toBeNull();
    expect(getReorderedTaskIdsForDay([single], single._id, single._id)).toBeNull();
  });

  it("ranks priorities consistently with unprioritized tasks last", () => {
    expect(getPriorityRank("p1")).toBe(0);
    expect(getPriorityRank("p2")).toBe(1);
    expect(getPriorityRank("p3")).toBe(2);
    expect(getPriorityRank(undefined)).toBe(3);
  });

  it("detects cross-priority drag boundary violations", () => {
    const p1 = makeTask({ _id: "a" as Id<"tasks">, priority: "p1" });
    const p2 = makeTask({ _id: "b" as Id<"tasks">, priority: "p2" });
    const none = makeTask({ _id: "c" as Id<"tasks">, priority: undefined });

    expect(hasPriorityBoundaryViolation([p1, p2, none], [p1, p2, none])).toBe(false);
    expect(hasPriorityBoundaryViolation([p1, p2, none], [p2, p1, none])).toBe(true);
  });
});
