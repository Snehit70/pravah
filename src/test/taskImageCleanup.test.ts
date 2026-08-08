import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { recordCleanupResult } from "../../convex/taskImageCleanup";

type Handler<TArgs, TResult> = { _handler: (ctx: unknown, args: TArgs) => Promise<TResult> };

const recordCleanupResultHandler = (
  recordCleanupResult as unknown as Handler<
    {
      tombstoneId: Id<"taskImageCleanupTombstones">;
      outcome: "deleted" | "absent" | "retry";
      failureCode?: string;
      now: number;
    },
    unknown
  >
)._handler;

describe("Task-image cleanup tombstones", () => {
  it.each(["deleted", "absent"] as const)(
    "removes image records only after provider outcome is confirmed as %s",
    async (outcome) => {
      const tombstoneId = "tombstone-1" as Id<"taskImageCleanupTombstones">;
      const imageId = "image-1" as Id<"taskImages">;
      const uploadId = "upload-1" as Id<"taskImageUploads">;
      const tombstone = {
        _id: tombstoneId,
        taskImageId: imageId,
        uploadRecordId: uploadId,
        attempts: 0,
      };
      const docs = new Map<string, unknown>([
        [tombstoneId, tombstone],
        [imageId, { _id: imageId, uploadRecordId: uploadId }],
        [uploadId, { _id: uploadId, taskImageId: imageId }],
      ]);
      const db = {
        get: vi.fn(async (id: string) => docs.get(id) ?? null),
        delete: vi.fn(async (id: string) => docs.delete(id)),
        patch: vi.fn(),
      };

      await expect(
        recordCleanupResultHandler({ db, scheduler: { runAfter: vi.fn() } }, { tombstoneId, outcome, now: 10_000 })
      ).resolves.toMatchObject({ accepted: true, terminal: true });
      expect(db.delete).toHaveBeenCalledWith(imageId);
      expect(db.delete).toHaveBeenCalledWith(uploadId);
      expect(db.delete).toHaveBeenCalledWith(tombstoneId);
    }
  );

  it("keeps the tombstone and schedules a later attempt after an ambiguous provider result", async () => {
    const tombstoneId = "tombstone-retry" as Id<"taskImageCleanupTombstones">;
    const tombstone = { _id: tombstoneId, attempts: 0 };
    const db = {
      get: vi.fn(async () => tombstone),
      delete: vi.fn(),
      patch: vi.fn(),
    };
    const scheduler = { runAfter: vi.fn() };

    await expect(
      recordCleanupResultHandler({ db, scheduler }, {
        tombstoneId,
        outcome: "retry",
        failureCode: "provider_timeout",
        now: 10_000,
      })
    ).resolves.toMatchObject({ accepted: true, terminal: false });
    expect(db.patch).toHaveBeenCalledWith(
      tombstoneId,
      expect.objectContaining({ state: "retry", attempts: 1, lastFailureCode: "provider_timeout" })
    );
    expect(db.delete).not.toHaveBeenCalled();
    expect(scheduler.runAfter).toHaveBeenCalledWith(5 * 60 * 1000, expect.anything(), {});
  });
});
