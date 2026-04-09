import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import { deriveTaskBoardData } from "../hooks/useTaskBoardData";

function makeTask(overrides: Partial<Task>): Task {
  return {
    _id: "task_id" as Id<"tasks">,
    title: "Task",
    type: "open",
    position: 0,
    status: "inbox",
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("deriveTaskBoardData", () => {
  it("sorts inbox tasks by position for stable ordering", () => {
    const tasks: Task[] = [
      makeTask({ _id: "b" as Id<"tasks">, title: "Second", position: 2, status: "inbox" }),
      makeTask({ _id: "a" as Id<"tasks">, title: "First", position: 0, status: "inbox" }),
      makeTask({ _id: "c" as Id<"tasks">, title: "Third", position: 1, status: "inbox" }),
    ];

    const { inboxTasks } = deriveTaskBoardData(tasks);
    expect(inboxTasks.map((task) => task._id)).toEqual([
      "a" as Id<"tasks">,
      "c" as Id<"tasks">,
      "b" as Id<"tasks">,
    ]);
  });

  it("groups scheduled tasks by date and sorts each day by position", () => {
    const tasks: Task[] = [
      makeTask({
        _id: "d2" as Id<"tasks">,
        title: "Later task",
        status: "scheduled",
        scheduledDate: "2026-04-10",
        position: 3,
      }),
      makeTask({
        _id: "d1" as Id<"tasks">,
        title: "Earlier task",
        status: "scheduled",
        scheduledDate: "2026-04-10",
        position: 0,
      }),
      makeTask({
        _id: "d3" as Id<"tasks">,
        title: "Other day task",
        status: "scheduled",
        scheduledDate: "2026-04-11",
        position: 1,
      }),
      makeTask({
        _id: "completed" as Id<"tasks">,
        title: "Completed",
        status: "completed",
        scheduledDate: "2026-04-10",
        position: 10,
      }),
    ];

    const { tasksByDate } = deriveTaskBoardData(tasks);

    expect(Object.keys(tasksByDate)).toEqual(["2026-04-10", "2026-04-11"]);
    expect(tasksByDate["2026-04-10"].map((task) => task._id)).toEqual([
      "d1" as Id<"tasks">,
      "d2" as Id<"tasks">,
    ]);
    expect(tasksByDate["2026-04-11"].map((task) => task._id)).toEqual([
      "d3" as Id<"tasks">,
    ]);
  });

  it("returns empty board sections when no tasks are provided", () => {
    const { inboxTasks, tasksByDate } = deriveTaskBoardData(undefined);
    expect(inboxTasks).toEqual([]);
    expect(tasksByDate).toEqual({});
  });
});
