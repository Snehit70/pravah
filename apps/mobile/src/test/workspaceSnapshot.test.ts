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
    scheduledAt: 50,
    position: 0,
    updatedAt: 100,
    createdAt: 50,
    ...overrides,
  };
}

describe("workspace snapshot utils", () => {
  it("hydrates a valid snapshot payload", () => {
    const hydrated = hydrateWorkspaceSnapshot(
      JSON.stringify({
        capturedAt: 123,
        inboxTasks: [makeTask()],
        scheduledTasks: [makeTask({ _id: makeId("task-2"), deadline: "2026-05-12" })],
        completedTasks: [makeTask({ _id: makeId("task-3"), completedAt: 100 })],
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
        completedTasks: [makeTask({ _id: makeId("task-3"), completedAt: 100 })],
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
        makeTask({ _id: makeId(`scheduled-${index}`), deadline: "2026-05-12" })
      ),
      completedTasks: Array.from({ length: 150 }, (_, index) =>
        makeTask({ _id: makeId(`completed-${index}`), completedAt: 100 })
      ),
    });

    expect(snapshot.inboxTasks).toHaveLength(120);
    expect(snapshot.scheduledTasks).toHaveLength(160);
    expect(snapshot.completedTasks).toHaveLength(120);
  });

  it("persists only the active provider-neutral image presentation manifest", () => {
    const snapshot = prepareWorkspaceSnapshotForPersist({
      capturedAt: 123,
      inboxTasks: [
        makeTask({
          imageCollection: {
            revision: 4,
            observedAt: 120,
            active: [
              {
                taskImageId: "image-1",
                position: 0,
                caption: "Reference",
                state: "ready",
                presentation: { width: 800, height: 600, aspectRatio: 4 / 3 },
                url: "https://secret.example/signed",
                uploadId: "upload-secret",
                localPath: "file:///private/source.jpg",
              } as never,
            ],
            recoverable: [
              {
                taskImageId: "image-2",
                caption: "Removed",
                removedAt: 100,
                recoverableUntil: 200,
                previousPosition: 1,
              },
            ],
          },
        }),
      ],
      scheduledTasks: [],
      completedTasks: [],
    });

    expect(snapshot.inboxTasks[0].imageCollection).toEqual({
      revision: 4,
      observedAt: 120,
      active: [
        {
          taskImageId: "image-1",
          position: 0,
          caption: "Reference",
          state: "ready",
          presentation: { width: 800, height: 600, aspectRatio: 4 / 3 },
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/recoverable|secret\.example|upload-secret|file:\/\//i);
  });

  it("hydrates old and malformed image collections as safe empty or degraded manifests", () => {
    const hydrated = hydrateWorkspaceSnapshot(
      JSON.stringify({
        capturedAt: 123,
        inboxTasks: [
          makeTask(),
          makeTask({
            _id: makeId("task-2"),
            imageCollection: {
              revision: 2,
              observedAt: 120,
              active: [
                {
                  taskImageId: "valid",
                  position: 0,
                  state: "failed",
                  failure: {
                    code: "unsupported_format",
                    message: "This image format is not supported.",
                    retryable: false,
                  },
                },
                { taskImageId: "verifying", position: 1, state: "verifying" },
                { taskImageId: "unknown", position: 2, state: "provider_magic" },
                { taskImageId: 7, position: 3, state: "ready" },
              ],
              recoverable: [{ taskImageId: "must-not-hydrate" }],
            } as never,
          }),
        ],
        scheduledTasks: [],
        completedTasks: [],
      })
    );

    expect(hydrated?.inboxTasks[0].imageCollection).toEqual({
      revision: 0,
      observedAt: 123,
      active: [],
    });
    expect(hydrated?.inboxTasks[1].imageCollection).toEqual({
      revision: 2,
      observedAt: 120,
      active: [
        {
          taskImageId: "valid",
          position: 0,
          state: "failed",
          failure: {
            code: "unsupported_format",
            message: "This image format is not supported.",
            retryable: false,
          },
        },
        { taskImageId: "verifying", position: 1, state: "verifying" },
        { taskImageId: "unknown", position: 2, state: "unavailable" },
      ],
    });
  });
});
