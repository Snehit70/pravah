import { describe, expect, it } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import {
  hydrateWorkspaceSnapshot,
  prepareWorkspaceSnapshotForPersist,
} from "../lib/workspace-snapshot";

function makeId(value: string) {
  return value as Id<"tasks">;
}

function makeTask(overrides: Partial<MobileTask> = {}): MobileTask {
  return {
    _id: makeId("task-1"),
    title: "Task",
    status: "inbox",
    position: 0,
    updatedAt: 100,
    ...overrides,
  };
}

describe("workspace snapshot utils", () => {
  it("hydrates a valid snapshot payload", () => {
    const hydrated = hydrateWorkspaceSnapshot(
      JSON.stringify({
        capturedAt: 123,
        inboxTasks: [makeTask()],
        scheduledTasks: [makeTask({ _id: makeId("task-2"), status: "scheduled", scheduledDate: "2026-05-12" })],
        completedTasks: [makeTask({ _id: makeId("task-3"), status: "completed" })],
      })
    );

    expect(hydrated?.capturedAt).toBe(123);
    expect(hydrated?.inboxTasks).toHaveLength(1);
    expect(hydrated?.scheduledTasks).toHaveLength(1);
    expect(hydrated?.completedTasks).toHaveLength(1);
  });

  it("drops invalid tasks during hydration", () => {
    const hydrated = hydrateWorkspaceSnapshot(
      JSON.stringify({
        capturedAt: 123,
        inboxTasks: [makeTask(), { bad: true }],
        scheduledTasks: "wrong",
        completedTasks: [makeTask({ _id: makeId("task-3"), status: "completed" })],
      })
    );

    expect(hydrated?.inboxTasks).toHaveLength(1);
    expect(hydrated?.scheduledTasks).toEqual([]);
    expect(hydrated?.completedTasks).toHaveLength(1);
  });

  it("caps persisted lists to keep boot snapshots bounded", () => {
    const snapshot = prepareWorkspaceSnapshotForPersist({
      capturedAt: 123,
      inboxTasks: Array.from({ length: 140 }, (_, index) => makeTask({ _id: makeId(`inbox-${index}`) })),
      scheduledTasks: Array.from({ length: 180 }, (_, index) =>
        makeTask({ _id: makeId(`scheduled-${index}`), status: "scheduled", scheduledDate: "2026-05-12" })
      ),
      completedTasks: Array.from({ length: 150 }, (_, index) =>
        makeTask({ _id: makeId(`completed-${index}`), status: "completed" })
      ),
    });

    expect(snapshot.inboxTasks).toHaveLength(120);
    expect(snapshot.scheduledTasks).toHaveLength(160);
    expect(snapshot.completedTasks).toHaveLength(120);
  });
});
