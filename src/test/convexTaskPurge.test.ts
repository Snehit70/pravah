import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { purgeExpiredCancelledTasks, restoreTask } from "../../convex/tasks";

type Handler<TArgs, TResult> = { _handler: (ctx: unknown, args: TArgs) => Promise<TResult> };

const purgeHandler = (
  purgeExpiredCancelledTasks as unknown as Handler<Record<string, never>, { purged: number }>
)._handler;
const restoreHandler = (
  restoreTask as unknown as Handler<{ taskId: Id<"tasks"> }, unknown>
)._handler;

function makeDb(rows: Record<string, Array<Record<string, unknown>>>) {
  const byId = new Map(
    Object.values(rows)
      .flat()
      .map((row) => [String(row._id), row])
  );
  let sequence = 0;
  const query = vi.fn((table: string) => {
    const values = () => rows[table] ?? [];
    const queryObject = {
      collect: vi.fn(async () => values()),
      withIndex: vi.fn((_index: string, build: (q: unknown) => unknown) => {
        const q = {
          eq: () => q,
          gte: () => q,
          lte: () => q,
          lt: () => q,
        };
        build(q);
        return {
          collect: vi.fn(async () => values()),
          first: vi.fn(async () => values()[0] ?? null),
          take: vi.fn(async (limit: number) => values().slice(0, limit)),
        };
      }),
    };
    return queryObject;
  });
  return {
    query,
    get: vi.fn(async (id: string) => byId.get(String(id)) ?? null),
    insert: vi.fn(async (table: string, value: Record<string, unknown>) => {
      const id = `${table}-${++sequence}`;
      const row = { _id: id, ...value };
      rows[table] ??= [];
      rows[table].push(row);
      byId.set(id, row);
      return id;
    }),
    delete: vi.fn(async (id: string) => {
      byId.delete(String(id));
      for (const tableRows of Object.values(rows)) {
        const index = tableRows.findIndex((row) => String(row._id) === String(id));
        if (index >= 0) tableRows.splice(index, 1);
      }
    }),
    patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const target = byId.get(String(id));
      if (target) Object.assign(target, patch);
    }),
  };
}

function ctx(db: unknown) {
  return {
    db,
    auth: { getUserIdentity: vi.fn().mockResolvedValue({ tokenIdentifier: "owner-1" }) },
    scheduler: { runAfter: vi.fn() },
  };
}

describe("expired Task-image lifecycle cleanup", () => {
  it("creates a tombstone before purging the parent Task and retains child records", async () => {
    const expiredAt = 1_000;
    const taskId = "task-expired" as Id<"tasks">;
    const imageId = "image-expired" as Id<"taskImages">;
    const uploadId = "upload-expired" as Id<"taskImageUploads">;
    const db = makeDb({
      tasks: [{ _id: taskId, ownerTokenIdentifier: "owner-1", cancelledAt: expiredAt, createdAt: 1, updatedAt: expiredAt }],
      taskImages: [{ _id: imageId, taskId, uploadRecordId: uploadId, position: 0 }],
      taskImageUploads: [{ _id: uploadId, ownerTokenIdentifier: "owner-1", taskImageId: imageId, providerPublicId: "private-asset", providerAttempt: 1 }],
      taskImageCleanupTombstones: [],
    });
    vi.spyOn(Date, "now").mockReturnValue(expiredAt + 30 * 60 * 1000 + 1);

    await expect(purgeHandler(ctx(db), {})).resolves.toEqual({ purged: 1 });
    expect(db.insert).toHaveBeenCalledWith(
      "taskImageCleanupTombstones",
      expect.objectContaining({ taskId, taskImageId: imageId, uploadRecordId: uploadId, providerPublicId: "private-asset" })
    );
    expect(db.delete).toHaveBeenCalledWith(taskId);
    expect(db.delete).not.toHaveBeenCalledWith(imageId);
    expect(db.delete).not.toHaveBeenCalledWith(uploadId);
    vi.restoreAllMocks();
  });

  it("enqueues an expired individually removed image while its Task remains active", async () => {
    const removedAt = 1_000;
    const taskId = "task-active" as Id<"tasks">;
    const imageId = "image-removed" as Id<"taskImages">;
    const uploadId = "upload-removed" as Id<"taskImageUploads">;
    const db = makeDb({
      tasks: [{ _id: taskId, ownerTokenIdentifier: "owner-1", createdAt: 1, updatedAt: 2 }],
      taskImages: [{ _id: imageId, taskId, uploadRecordId: uploadId, removedAt, recoverableUntil: removedAt + 1, position: 0 }],
      taskImageUploads: [{ _id: uploadId, ownerTokenIdentifier: "owner-1", taskImageId: imageId, providerPublicId: "private-removed", providerAttempt: 1 }],
      taskImageCleanupTombstones: [],
    });
    vi.spyOn(Date, "now").mockReturnValue(10_000);

    await expect(purgeHandler(ctx(db), {})).resolves.toEqual({ purged: 0 });
    expect(db.insert).toHaveBeenCalledWith(
      "taskImageCleanupTombstones",
      expect.objectContaining({ taskId, taskImageId: imageId, providerPublicId: "private-removed" })
    );
    expect(db.delete).not.toHaveBeenCalledWith(taskId);
    vi.restoreAllMocks();
  });

  it("does not restore a Task after the purge wins the recovery race", async () => {
    const taskId = "task-race" as Id<"tasks">;
    const db = makeDb({
      tasks: [{ _id: taskId, ownerTokenIdentifier: "owner-1", cancelledAt: 1_000, position: 0 }],
      taskImages: [],
      taskImageUploads: [],
      taskImageCleanupTombstones: [],
    });
    vi.spyOn(Date, "now").mockReturnValue(1_000 + 30 * 60 * 1000 + 1);

    await expect(purgeHandler(ctx(db), {})).resolves.toEqual({ purged: 1 });
    await expect(restoreHandler(ctx(db), { taskId })).rejects.toThrow("Task not found");

    vi.restoreAllMocks();
  });
});
