import { describe, expect, it } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import { hydrateRetryQueue, prepareRetryQueueForPersist } from "../lib/retry-queue-utils";
import {
  patchTaskInOptimisticView,
  removeTaskFromOptimisticView,
  reorderScopedTasksInOptimisticView,
} from "../lib/task-optimistic";

function makeId(value: string) {
  return value as Id<"tasks">;
}

function makeTask(overrides: Partial<MobileTask> = {}): MobileTask {
  return {
    _id: makeId("task-1"),
    title: "Task",
    scheduledAt: 50,
    position: 0,
    updatedAt: 100,
    createdAt: 50,
    ...overrides,
  };
}

describe("retry queue utils", () => {
  it("hydrates only valid retry queue items", () => {
    const hydrated = hydrateRetryQueue(
      JSON.stringify([
        {
          id: "retry-1",
          label: "Retry task",
          attempts: 0,
          payload: { type: "completeTask", taskId: makeId("task-1") },
        },
        { id: 1, label: "bad", attempts: 0, payload: {} },
      ])
    );

    expect(hydrated).toEqual([
      {
        id: "retry-1",
        label: "Retry task",
        attempts: 0,
        payload: { type: "completeTask", taskId: makeId("task-1") },
      },
    ]);
  });

  it("keeps only the most recent retry items for persistence", () => {
    const queue = Array.from({ length: 25 }, (_, index) => ({
      id: `retry-${index}`,
      label: `Retry ${index}`,
      attempts: 0,
      payload: { type: "completeTask" as const, taskId: makeId(`task-${index}`) },
    }));

    const persisted = prepareRetryQueueForPersist(queue);

    expect(persisted).toHaveLength(20);
    expect(persisted[0]?.id).toBe("retry-5");
    expect(persisted.at(-1)?.id).toBe("retry-24");
  });
});

describe("optimistic task utils", () => {
  it("removes a task from the optimistic view", () => {
    const tasks = [makeTask({ _id: makeId("task-1") }), makeTask({ _id: makeId("task-2") })];

    expect(removeTaskFromOptimisticView(tasks, makeId("task-1"))).toEqual([
      makeTask({ _id: makeId("task-2") }),
    ]);
  });

  it("patches one task in the optimistic view", () => {
    const tasks = [makeTask({ _id: makeId("task-1") }), makeTask({ _id: makeId("task-2") })];

    expect(
      patchTaskInOptimisticView(tasks, makeId("task-2"), { title: "Updated", priority: "p1" }, 500)
    ).toEqual([
      makeTask({ _id: makeId("task-1") }),
      makeTask({ _id: makeId("task-2"), title: "Updated", priority: "p1", updatedAt: 500 }),
    ]);
  });

  it("reorders only tasks inside the scoped predicate", () => {
    const tasks = [
      makeTask({ _id: makeId("task-1"), deadline: "2026-04-24", position: 0 }),
      makeTask({ _id: makeId("task-2"), deadline: "2026-04-24", position: 1 }),
      makeTask({ _id: makeId("task-3"), position: 9 }),
    ];

    const reordered = reorderScopedTasksInOptimisticView(
      tasks,
      [makeId("task-2"), makeId("task-1")],
      (task) => task.deadline === "2026-04-24",
      900
    );

    expect(reordered).toEqual([
      makeTask({
        _id: makeId("task-1"),
        deadline: "2026-04-24",
        position: 1,
        updatedAt: 900,
      }),
      makeTask({
        _id: makeId("task-2"),
        deadline: "2026-04-24",
        position: 0,
        updatedAt: 900,
      }),
      makeTask({ _id: makeId("task-3"), position: 9 }),
    ]);
  });
});
