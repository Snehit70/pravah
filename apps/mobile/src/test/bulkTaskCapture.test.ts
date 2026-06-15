import { describe, expect, it } from "vitest";
import { expandBulkTasks } from "../lib/bulkTaskCapture";

describe("expandBulkTasks", () => {
  it("expands a numbered series across selected goals", () => {
    const tasks = expandBulkTasks({
      baseTitle: "Weekly assignment",
      seriesEnabled: true,
      start: 1,
      end: 3,
      goalIds: ["goal-a", "goal-b"],
      deadline: "2026-06-20",
    });

    expect(tasks).toHaveLength(6);
    expect(tasks.map((task) => [task.title, task.goalClientId])).toEqual([
      ["Weekly assignment 1", "goal-a"],
      ["Weekly assignment 1", "goal-b"],
      ["Weekly assignment 2", "goal-a"],
      ["Weekly assignment 2", "goal-b"],
      ["Weekly assignment 3", "goal-a"],
      ["Weekly assignment 3", "goal-b"],
    ]);
  });

  it("creates an unlinked series and enforces the limit", () => {
    expect(expandBulkTasks({
      baseTitle: "Week",
      seriesEnabled: true,
      start: 1,
      end: 2,
      goalIds: [],
    })).toEqual([
      { title: "Week 1", goalClientId: undefined },
      { title: "Week 2", goalClientId: undefined },
    ]);

    expect(() => expandBulkTasks({
      baseTitle: "Week",
      seriesEnabled: true,
      start: 1,
      end: 51,
      goalIds: ["a", "b"],
    })).toThrow("Maximum is 100 tasks");
  });
});
