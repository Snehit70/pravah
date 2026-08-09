import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import { buildTaskMetadataExport } from "../lib/task-metadata-export";

function task(overrides: Partial<MobileTask> = {}): MobileTask {
  return {
    _id: "task-1" as Id<"tasks">,
    title: "Visual task",
    scheduledAt: 10,
    position: 0,
    createdAt: 10,
    updatedAt: 20,
    imageCollection: { revision: 1, observedAt: 20, active: [] },
    ...overrides,
  };
}

describe("Task metadata export", () => {
  it("declares its limits and includes only loaded non-cancelled Task metadata", async () => {
    const loadImageCollection = vi.fn(async () => ({
      revision: 1,
      observedAt: 30,
      active: [
        {
          taskImageId: "image-1",
          position: 0,
          caption: "Reference",
          state: "ready",
          presentation: { width: 800, height: 600 },
          url: "https://secret.example/signed",
          providerPublicId: "provider-secret",
        },
      ],
      recoverable: [
        {
          taskImageId: "image-2",
          caption: "Removed",
          removedAt: 21,
          recoverableUntil: 100,
          previousPosition: 1,
          cleanupTombstoneId: "cleanup-secret",
        },
      ],
    }));

    const exported = await buildTaskMetadataExport({
      tasks: [
        task(),
        task({ _id: "task-2" as Id<"tasks">, completedAt: 19 }),
        task({ _id: "task-3" as Id<"tasks">, cancelledAt: 18 }),
      ],
      loadImageCollection,
      now: () => 40,
    });

    expect(exported).toMatchObject({
      version: 2,
      exportKind: "task-metadata",
      scope: "loaded-workspace",
      includedTaskStates: ["inbox", "timeline", "completed"],
      counts: { inbox: 1, timeline: 0, completed: 1, total: 2 },
      isCompleteBackup: false,
      includesImageBinaries: false,
      restorableImageContent: false,
      exportedAtMs: 40,
      tasks: [
        {
          _id: "task-1",
          imageManifestStatus: "captured",
          imageCollection: {
            active: [{ taskImageId: "image-1", caption: "Reference" }],
            recoverable: [{ taskImageId: "image-2", caption: "Removed" }],
          },
        },
        { _id: "task-2", imageManifestStatus: "captured" },
      ],
    });
    expect(JSON.stringify(exported)).not.toMatch(
      /secret\.example|provider-secret|cleanup-secret|localPath/i
    );
  });

  it("retries one changed revision and marks a persistently unstable manifest", async () => {
    const collections = [2, 3].map((revision) => ({
      revision,
      observedAt: revision,
      active: [],
      recoverable: [],
    }));
    const loadImageCollection = vi
      .fn()
      .mockResolvedValueOnce(collections[0])
      .mockResolvedValueOnce(collections[1]);

    const exported = await buildTaskMetadataExport({
      tasks: [task()],
      loadImageCollection,
      now: () => 40,
    });

    expect(loadImageCollection).toHaveBeenCalledTimes(2);
    expect(exported.tasks[0]).toMatchObject({
      imageManifestStatus: "unstable",
      imageCollection: null,
    });
  });
});
