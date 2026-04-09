import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import { resolveDropTargetDate } from "../hooks/useTaskDragHandlers";

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

describe("resolveDropTargetDate", () => {
  it("returns a date drop target when deadline allows it", () => {
    const source = makeTask({
      _id: "a" as Id<"tasks">,
      type: "deadline",
      deadline: "2026-04-12",
      scheduledDate: "2026-04-09",
    });

    expect(resolveDropTargetDate(source, "2026-04-10", [source])).toBe("2026-04-10");
  });

  it("blocks date drop target when deadline would be violated", () => {
    const source = makeTask({
      _id: "a" as Id<"tasks">,
      type: "deadline",
      deadline: "2026-04-10",
      scheduledDate: "2026-04-09",
    });

    expect(resolveDropTargetDate(source, "2026-04-11", [source])).toBeNull();
  });

  it("uses target task date for cross-day card-to-card drops", () => {
    const source = makeTask({
      _id: "source" as Id<"tasks">,
      scheduledDate: "2026-04-09",
    });
    const target = makeTask({
      _id: "target" as Id<"tasks">,
      scheduledDate: "2026-04-10",
    });

    expect(resolveDropTargetDate(source, target._id, [source, target])).toBe("2026-04-10");
  });

  it("returns null for same-day card drops so reorder can run", () => {
    const source = makeTask({
      _id: "source" as Id<"tasks">,
      scheduledDate: "2026-04-09",
    });
    const target = makeTask({
      _id: "target" as Id<"tasks">,
      scheduledDate: "2026-04-09",
    });

    expect(resolveDropTargetDate(source, target._id, [source, target])).toBeNull();
  });

  it("returns null when dropping on unknown ids", () => {
    const source = makeTask({
      _id: "source" as Id<"tasks">,
      scheduledDate: "2026-04-09",
    });

    expect(resolveDropTargetDate(source, "unknown", [source])).toBeNull();
  });
});
