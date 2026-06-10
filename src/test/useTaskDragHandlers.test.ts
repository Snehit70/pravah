import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import { resolveDropTargetDate } from "../hooks/useTaskDragHandlers";

function makeTask(overrides: Partial<Task>): Task {
  return {
    _id: "task_id" as Id<"tasks">,
    title: "Task",
    position: 0,
    scheduledAt: 1,
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("resolveDropTargetDate", () => {
  it("returns a date drop target", () => {
    const source = makeTask({
      _id: "a" as Id<"tasks">,
      deadline: "2026-04-09",
    });

    expect(resolveDropTargetDate(source, "2026-04-10", [source], "2026-04-09")).toBe("2026-04-10");
  });

  it("allows moving a deadline later", () => {
    const source = makeTask({
      _id: "a" as Id<"tasks">,
      deadline: "2026-04-10",
    });

    expect(resolveDropTargetDate(source, "2026-04-11", [source], "2026-04-09")).toBe("2026-04-11");
  });

  it("uses target task date for cross-day card-to-card drops", () => {
    const source = makeTask({
      _id: "source" as Id<"tasks">,
      deadline: "2026-04-12",
    });
    const target = makeTask({
      _id: "target" as Id<"tasks">,
      deadline: "2026-04-10",
    });

    expect(resolveDropTargetDate(source, target._id, [source, target], "2026-04-09")).toBe("2026-04-10");
  });

  it("returns null for same-day card drops so reorder can run", () => {
    const source = makeTask({
      _id: "source" as Id<"tasks">,
      deadline: "2026-04-09",
    });
    const target = makeTask({
      _id: "target" as Id<"tasks">,
      deadline: "2026-04-09",
    });

    expect(resolveDropTargetDate(source, target._id, [source, target], "2026-04-09")).toBeNull();
  });

  it("returns null when dropping on unknown ids", () => {
    const source = makeTask({
      _id: "source" as Id<"tasks">,
      deadline: "2026-04-09",
    });

    expect(resolveDropTargetDate(source, "unknown", [source], "2026-04-09")).toBeNull();
  });

  it("allows moving an overdue task forward", () => {
    const source = makeTask({
      _id: "source" as Id<"tasks">,
      deadline: "2026-04-10",
    });

    expect(resolveDropTargetDate(source, "2026-04-12", [source], "2026-04-15")).toBe("2026-04-12");
  });
});
