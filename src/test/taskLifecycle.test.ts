import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  compareTaskOrder,
  hasPriorityBoundaryViolation,
  isTaskCancelled,
  isTaskCompleted,
  isTaskInInbox,
  isTaskOnTimeline,
  taskPlacement,
  taskPriorityRank,
} from "../lib/taskLifecycle";

function task(overrides: {
  _id?: string;
  deadline?: string;
  completedAt?: number;
  cancelledAt?: number;
  priority?: "p1" | "p2" | "p3";
  position?: number;
}) {
  return {
    _id: (overrides._id ?? "task") as Id<"tasks">,
    position: overrides.position ?? 0,
    ...overrides,
  };
}

describe("taskLifecycle", () => {
  it("classifies Task placement from lifecycle timestamps and deadline", () => {
    expect(taskPlacement(task({ deadline: "2026-06-16" }))).toBe("timeline");
    expect(taskPlacement(task({}))).toBe("inbox");
    expect(taskPlacement(task({ deadline: "2026-06-16", completedAt: 1 }))).toBe("completed");
    expect(taskPlacement(task({ deadline: "2026-06-16", completedAt: 1, cancelledAt: 2 }))).toBe("cancelled");
  });

  it("exposes specific lifecycle predicates through the same interface", () => {
    expect(isTaskOnTimeline(task({ deadline: "2026-06-16" }))).toBe(true);
    expect(isTaskInInbox(task({}))).toBe(true);
    expect(isTaskCompleted(task({ completedAt: 1 }))).toBe(true);
    expect(isTaskCancelled(task({ completedAt: 1, cancelledAt: 2 }))).toBe(true);
  });

  it("orders by priority first and position second", () => {
    const unordered = [
      task({ _id: "late", priority: "p3", position: 0 }),
      task({ _id: "first", priority: "p1", position: 4 }),
      task({ _id: "second", priority: "p1", position: 5 }),
      task({ _id: "last", position: 0 }),
    ];

    expect(unordered.sort(compareTaskOrder).map((entry) => entry._id)).toEqual([
      "first",
      "second",
      "late",
      "last",
    ]);
  });

  it("keeps priority group movement explicit", () => {
    expect(taskPriorityRank("p1")).toBe(0);
    expect(taskPriorityRank("p2")).toBe(1);
    expect(taskPriorityRank("p3")).toBe(2);
    expect(taskPriorityRank(undefined)).toBe(3);

    const p1 = task({ _id: "p1", priority: "p1" });
    const p2 = task({ _id: "p2", priority: "p2" });
    const none = task({ _id: "none" });

    expect(hasPriorityBoundaryViolation([p1, p2, none], [p1, p2, none])).toBe(false);
    expect(hasPriorityBoundaryViolation([p1, p2, none], [p2, p1, none])).toBe(true);
  });
});
