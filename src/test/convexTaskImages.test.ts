import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { addTask } from "../../convex/tasks";
import {
  addTaskImages,
  applyUploadVerification,
  getTaskImageCollection,
  getTaskImageSummaryForOwner,
  getDeliveryContext,
  markUploadFailed,
  prepareUploadGrant,
  removeTaskImage,
  reorderTaskImages,
  restoreTaskImage,
  stageImageUpload,
  updateTaskImageCaption,
} from "../../convex/taskImages";

type Handler<TArgs, TResult> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

type StoredDoc = Record<string, unknown> & { _id: string };

function createMemoryDb() {
  const tables = new Map<string, StoredDoc[]>();
  let sequence = 0;

  const rows = (table: string) => {
    const existing = tables.get(table) ?? [];
    tables.set(table, existing);
    return existing;
  };

  return {
    rows,
    insert: vi.fn(async (table: string, value: Record<string, unknown>) => {
      const id = `${table}-${++sequence}`;
      rows(table).push({ _id: id, ...value });
      return id;
    }),
    get: vi.fn(async (id: string) => {
      for (const tableRows of tables.values()) {
        const found = tableRows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    }),
    patch: vi.fn(async (id: string, value: Record<string, unknown>) => {
      for (const tableRows of tables.values()) {
        const found = tableRows.find((row) => row._id === id);
        if (found) Object.assign(found, value);
      }
    }),
    query: vi.fn((table: string) => ({
      withIndex: vi.fn((_index: string, build: (q: unknown) => unknown) => {
        const filters: Array<[string, unknown]> = [];
        const q = {
          eq(field: string, value: unknown) {
            filters.push([field, value]);
            return q;
          },
        };
        build(q);
        const matching = () =>
          rows(table).filter((row) => filters.every(([field, value]) => row[field] === value));
        return {
          collect: vi.fn(async () => matching()),
          first: vi.fn(async () => matching()[0] ?? null),
          order: vi.fn(() => ({ first: vi.fn(async () => matching().at(-1) ?? null) })),
        };
      }),
    })),
  };
}

function authedCtx(db: ReturnType<typeof createMemoryDb>, owner = "owner-1") {
  return {
    db,
    auth: {
      getUserIdentity: vi.fn(async () => ({ tokenIdentifier: owner })),
    },
  };
}

const stageHandler = (
  stageImageUpload as unknown as Handler<
    {
      uploadId: string;
      encodingClass: "jpeg" | "png";
      width: number;
      height: number;
      bytes: number;
    },
    { uploadId: string; state: string }
  >
)._handler;

const prepareUploadGrantHandler = (
  prepareUploadGrant as unknown as Handler<
    {
      ownerTokenIdentifier: string;
      uploadId: string;
      requestKey: string;
      candidatePublicId: string;
      issuedAt: number;
    },
    { uploadId: string; publicId: string; providerAttempt: number }
  >
)._handler;

const applyUploadVerificationHandler = (
  applyUploadVerification as unknown as Handler<
    {
      ownerTokenIdentifier: string;
      uploadId: string;
      publicId: string;
      version: number;
      result: {
        status: "ready";
        master: { format: "jpg"; width: number; height: number; bytes: number };
        card: { format: "webp"; width: number; height: number; bytes: number };
        detail: { format: "webp"; width: number; height: number; bytes: number };
      };
    },
    { accepted: boolean; state?: string }
  >
)._handler;

const addTaskHandler = (
  addTask as unknown as Handler<
    {
      title: string;
      imageUploadId?: string;
      imageUploadIds?: string[];
      imageInputs?: Array<{ uploadId: string; caption?: string }>;
    },
    Id<"tasks">
  >
)._handler;

const collectionHandler = (
  getTaskImageCollection as unknown as Handler<
    { taskId: Id<"tasks"> },
    {
      active: Array<Record<string, unknown>>;
      primary?: Record<string, unknown>;
      recoverable?: Array<Record<string, unknown>>;
    }
  >
)._handler;

const deliveryContextHandler = (
  getDeliveryContext as unknown as Handler<
    { ownerTokenIdentifier: string; taskImageId: Id<"taskImages"> },
    unknown
  >
)._handler;

const addTaskImagesHandler = (
  addTaskImages as unknown as Handler<
    { taskId: Id<"tasks">; uploadIds: string[]; expectedRevision?: number },
    unknown
  >
)._handler;

const markUploadFailedHandler = (
  markUploadFailed as unknown as Handler<
    { uploadId: string; failureCode: string },
    unknown
  >
)._handler;

const reorderTaskImagesHandler = (
  reorderTaskImages as unknown as Handler<
    { taskId: Id<"tasks">; orderedTaskImageIds: string[]; expectedRevision: number },
    unknown
  >
)._handler;

const updateTaskImageCaptionHandler = (
  updateTaskImageCaption as unknown as Handler<
    { taskImageId: Id<"taskImages">; caption?: string; expectedRevision: number },
    unknown
  >
)._handler;

const removeTaskImageHandler = (
  removeTaskImage as unknown as Handler<
    { taskImageId: Id<"taskImages">; expectedRevision: number },
    unknown
  >
)._handler;

const restoreTaskImageHandler = (
  restoreTaskImage as unknown as Handler<
    { taskImageId: Id<"taskImages">; replaceTaskImageId?: Id<"taskImages">; expectedRevision: number },
    unknown
  >
)._handler;

describe("Convex Task-image contract", () => {
  it("issues an upload grant while an image is staged before its Task is saved", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);
    await stageHandler(owner, {
      uploadId: "upload_presave_1",
      encodingClass: "jpeg",
      width: 1200,
      height: 900,
      bytes: 500_000,
    });

    const prepared = await prepareUploadGrantHandler(owner, {
      ownerTokenIdentifier: "owner-1",
      uploadId: "upload_presave_1",
      requestKey: "grant_presave_1",
      candidatePublicId: "pravah-task-images/opaque-presave-1",
      issuedAt: 1_786_500_000,
    });
    expect(prepared).toMatchObject({
      uploadId: "upload_presave_1",
      publicId: "pravah-task-images/opaque-presave-1",
      providerAttempt: 1,
    });

    await expect(applyUploadVerificationHandler(owner, {
      ownerTokenIdentifier: "owner-1",
      uploadId: "upload_presave_1",
      publicId: prepared.publicId,
      version: 1,
      result: {
        status: "ready",
        master: { format: "jpg", width: 1200, height: 900, bytes: 500_000 },
        card: { format: "webp", width: 640, height: 480, bytes: 80_000 },
        detail: { format: "webp", width: 1200, height: 900, bytes: 180_000 },
      },
    })).resolves.toEqual({ accepted: true, state: "ready" });

    const taskId = await addTaskHandler(owner, {
      title: "Save after the image is ready",
      imageUploadId: "upload_presave_1",
    });
    await expect(collectionHandler(owner, { taskId })).resolves.toMatchObject({
      active: [{ state: "ready", position: 0 }],
    });
  });

  it("denies delivery as soon as the parent Task enters recoverable deletion", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);
    await stageHandler(owner, {
      uploadId: "upl_delivery_1",
      encodingClass: "jpeg",
      width: 1200,
      height: 900,
      bytes: 500_000,
    });
    const taskId = await addTaskHandler(owner, { title: "Deny deleted delivery", imageUploadId: "upl_delivery_1" });
    const image = db.rows("taskImages")[0];
    const upload = db.rows("taskImageUploads")[0];
    Object.assign(db.rows("tasks")[0], { cancelledAt: Date.now() });
    Object.assign(image, { state: "ready" });
    Object.assign(upload, { state: "ready", providerPublicId: "private-id", providerVersion: 1, variants: {} });

    await expect(
      deliveryContextHandler(owner, {
        ownerTokenIdentifier: "owner-1",
        taskImageId: image._id as Id<"taskImages">,
      })
    ).resolves.toEqual({ kind: "not_found" });
    expect(taskId).toBeDefined();
  });

  it("claims one staged upload exactly once and exposes a redacted derived primary", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);

    await stageHandler(owner, {
      uploadId: "upl_stable_1",
      encodingClass: "jpeg",
      width: 1600,
      height: 1200,
      bytes: 2_000_000,
    });

    const firstTaskId = await addTaskHandler(owner, {
      title: "Keep the visual context",
      imageUploadId: "upl_stable_1",
    });
    const firstCollection = await collectionHandler(owner, { taskId: firstTaskId });

    expect(firstCollection).toMatchObject({ revision: 1 });
    expect(firstCollection.active).toHaveLength(1);
    expect(firstCollection).not.toHaveProperty("primary");
    expect(firstCollection.active[0]).toMatchObject({
      position: 0,
      state: "pending",
      presentation: {
        width: 1600,
        height: 1200,
        aspectRatio: 4 / 3,
        hasTransparency: false,
        variantSet: "task-image-v1",
      },
    });

    const upload = db.rows("taskImageUploads")[0];
    Object.assign(upload, {
      providerPublicId: "pravah/private/provider-secret-id",
      providerVersion: 123,
      deliveryUrl: "https://secret.example/signed",
      localPath: "file:///private/staged.jpg",
    });
    expect(JSON.stringify(await collectionHandler(owner, { taskId: firstTaskId }))).not.toMatch(
      /provider-secret-id|secret\.example|file:\/\/|upl_stable_1/
    );

    const replayedTaskId = await addTaskHandler(owner, {
      title: "Repeated save returns the original Task",
      imageUploadId: "upl_stable_1",
    });
    expect(replayedTaskId).toBe(firstTaskId);
    expect(db.rows("tasks")).toHaveLength(1);
    expect(db.rows("taskImages")).toHaveLength(1);
    expect(db.rows("taskImageUploads")[0].taskImageId).toBe(
      firstCollection.active[0].taskImageId
    );

    Object.assign(db.rows("taskImages")[0], { updatedAt: Date.now() + 10_000 });
    expect(await collectionHandler(owner, { taskId: firstTaskId })).toMatchObject({ revision: 1 });
  });

  it("serializes freshness without persisting a primary pointer", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);
    const now = 1_785_730_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    await stageHandler(owner, {
      uploadId: "upload_manifest_1",
      encodingClass: "jpeg",
      width: 1200,
      height: 800,
      bytes: 400_000,
    });
    const taskId = await addTaskHandler(owner, {
      title: "Manifest task",
      imageInputs: [{ uploadId: "upload_manifest_1", caption: "Safe caption" }],
    });

    const collection = await collectionHandler(owner, { taskId });

    expect(collection).toMatchObject({
      revision: 1,
      observedAt: now,
      active: [
        {
          taskImageId: expect.any(String),
          position: 0,
          caption: "Safe caption",
          state: "pending",
          presentation: {
            width: 1200,
            height: 800,
            aspectRatio: 1.5,
            variantSet: "task-image-v1",
          },
        },
      ],
      recoverable: [],
    });
    expect(collection).not.toHaveProperty("primary");
    expect(JSON.stringify(collection)).not.toMatch(/upload_manifest_1|provider|url|path/i);
  });

  it("claims an unattached ready upload without downgrading its state", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);
    await stageHandler(owner, {
      uploadId: "upload_ready_1",
      encodingClass: "jpeg",
      width: 1200,
      height: 800,
      bytes: 400_000,
    });
    const upload = db.rows("taskImageUploads")[0];
    Object.assign(upload, {
      state: "ready",
      providerPublicId: "private/provider-ready",
      providerVersion: 7,
      variants: { master: { width: 1200, height: 800, bytes: 400_000 } },
    });

    const taskId = await addTaskHandler(owner, {
      title: "Restored image task",
      imageInputs: [{ uploadId: "upload_ready_1", caption: "Restored reference" }],
    });

    expect(db.rows("taskImageUploads")[0]).toMatchObject({
      state: "ready",
      taskImageId: expect.any(String),
    });
    expect(db.rows("taskImages")[0]).toMatchObject({
      taskId,
      state: "ready",
      caption: "Restored reference",
    });
  });

  it("keeps existing Tasks valid with an empty collection and denies cross-owner claims safely", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db, "owner-1");
    const otherOwner = authedCtx(db, "owner-2");

    const emptyTaskId = await addTaskHandler(owner, { title: "Text-only Task" });
    await expect(collectionHandler(owner, { taskId: emptyTaskId })).resolves.toMatchObject({
      active: [],
      recoverable: [],
    });

    await stageHandler(owner, {
      uploadId: "upl_owner_1",
      encodingClass: "png",
      width: 800,
      height: 600,
      bytes: 500_000,
    });
    const otherTaskId = await addTaskHandler(otherOwner, {
      title: "Other owner's Task",
      imageUploadId: "upl_owner_1",
    });
    const otherCollection = await collectionHandler(otherOwner, { taskId: otherTaskId });

    expect(otherCollection.active[0]).toMatchObject({
      state: "failed",
      failure: { code: "source_unavailable", retryable: true },
    });
    expect(db.rows("taskImageUploads")[0]).not.toHaveProperty("taskImageId");
    await expect(collectionHandler(otherOwner, { taskId: emptyTaskId })).rejects.toThrow(
      "Task not found"
    );
  });

  it("returns additive image counts without manifest identifiers on list reads", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);
    await stageHandler(owner, {
      uploadId: "upload_summary_1",
      encodingClass: "jpeg",
      width: 640,
      height: 480,
      bytes: 100_000,
    });
    const taskId = await addTaskHandler(owner, {
      title: "Summary task",
      imageUploadId: "upload_summary_1",
    });
    Object.assign(db.rows("taskImages")[0], { state: "failed" });

    const summary = await getTaskImageSummaryForOwner(owner as never, "owner-1", taskId);

    expect(summary).toEqual({ activeCount: 1, readyCount: 0, failedCount: 1 });
    expect(JSON.stringify(summary)).not.toMatch(/taskImageId|caption|upload|provider|url/i);
  });

  it("manages an ordered five-image collection with derived primary, captions, stale revisions, and replacement", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);
    const uploadIds = ["upl_a_1234", "upl_b_1234", "upl_c_1234", "upl_d_1234", "upl_e_1234", "upl_f_1234"];

    for (const uploadId of uploadIds) {
      await stageHandler(owner, {
        uploadId,
        encodingClass: "jpeg",
        width: 1200,
        height: 900,
        bytes: 500_000,
      });
    }

    const taskId = await addTaskHandler(owner, {
      title: "Manage the gallery",
      imageInputs: uploadIds.slice(0, 5).map((uploadId, index) => ({
        uploadId,
        ...(index === 0 ? { caption: " Initial caption " } : {}),
      })),
    });
    const initial = await collectionHandler(owner, { taskId });
    expect(initial.active).toHaveLength(5);
    expect(initial.active.map((image) => image.position)).toEqual([0, 1, 2, 3, 4]);
    expect(initial.active[0].caption).toBe("Initial caption");
    expect(initial).not.toHaveProperty("primary");

    await expect(markUploadFailedHandler(owner, {
      uploadId: uploadIds[0],
      failureCode: "storage_unavailable",
    })).resolves.toEqual({ accepted: true, state: "failed" });
    expect((await collectionHandler(owner, { taskId })).active[0]).toMatchObject({
      state: "failed",
      failure: { code: "storage_unavailable", retryable: true },
    });

    await expect(
      addTaskImagesHandler(owner, {
        taskId,
        uploadIds: [uploadIds[5]],
        expectedRevision: 1,
      })
    ).rejects.toThrow("Task image collection is full");
    expect((await collectionHandler(owner, { taskId })).active).toHaveLength(5);

    const reordered = await reorderTaskImagesHandler(owner, {
      taskId,
      orderedTaskImageIds: initial.active.map((image) => String(image.taskImageId)).reverse(),
      expectedRevision: 1,
    });
    expect(reordered).toMatchObject({ revision: 2, stale: false });
    expect((await collectionHandler(owner, { taskId })).active[0]?.taskImageId).toBe(
      initial.active[4].taskImageId
    );

    const captioned = await updateTaskImageCaptionHandler(owner, {
      taskImageId: initial.active[4].taskImageId as Id<"taskImages">,
      caption: "  Primary reference  ",
      expectedRevision: 2,
    });
    expect(captioned).toMatchObject({ revision: 3, stale: false });
    expect((await collectionHandler(owner, { taskId })).active[0]?.caption).toBe("Primary reference");

    const removed = await removeTaskImageHandler(owner, {
      taskImageId: initial.active[4].taskImageId as Id<"taskImages">,
      expectedRevision: 3,
    });
    expect(removed).toMatchObject({ revision: 4, stale: false });
    const afterRemoval = await collectionHandler(owner, { taskId });
    expect(afterRemoval.active).toHaveLength(4);
    expect(afterRemoval.active.map((image) => image.position)).toEqual([0, 1, 2, 3]);
    expect(afterRemoval.recoverable).toMatchObject([
      { caption: "Primary reference", previousPosition: 0 },
    ]);

    const replacement = await addTaskImagesHandler(owner, {
      taskId,
      uploadIds: [uploadIds[5]],
      expectedRevision: 4,
    });
    expect(replacement).toMatchObject({ revision: 5, stale: false });
    expect((await collectionHandler(owner, { taskId })).active).toHaveLength(5);

    const stale = await reorderTaskImagesHandler(owner, {
      taskId,
      orderedTaskImageIds: afterRemoval.active.map((image) => String(image.taskImageId)),
      expectedRevision: 4,
    });
    expect(stale).toMatchObject({ revision: 5, stale: true });

    await expect(
      updateTaskImageCaptionHandler(owner, {
        taskImageId: initial.active[0].taskImageId as Id<"taskImages">,
        caption: "x".repeat(501),
        expectedRevision: 5,
      })
    ).rejects.toThrow("caption_too_long");
  });

  it("restores an individual image in its prior position and preserves its upload state", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);
    const uploadIds = ["upl_restore_a", "upl_restore_b", "upl_restore_c"];
    for (const uploadId of uploadIds) {
      await stageHandler(owner, {
        uploadId,
        encodingClass: "jpeg",
        width: 1200,
        height: 900,
        bytes: 500_000,
      });
    }

    const taskId = await addTaskHandler(owner, {
      title: "Restore image order",
      imageUploadIds: uploadIds,
    });
    const initial = await collectionHandler(owner, { taskId });
    const removedId = initial.active[1]?.taskImageId as Id<"taskImages">;
    const removed = await removeTaskImageHandler(owner, {
      taskImageId: removedId,
      expectedRevision: 1,
    });
    expect(removed).toMatchObject({ revision: 2, stale: false });

    await expect(
      restoreTaskImageHandler(owner, { taskImageId: removedId, expectedRevision: 1 })
    ).resolves.toMatchObject({ stale: true, revision: 2 });

    const upload = db.rows("taskImageUploads").find((row) => row.uploadId === uploadIds[1]);
    expect(upload).toBeDefined();
    upload!.state = "ready";
    const image = db.rows("taskImages").find((row) => row._id === removedId);
    image!.state = "ready";

    const restored = await restoreTaskImageHandler(owner, { taskImageId: removedId, expectedRevision: 2 });
    expect(restored).toMatchObject({ revision: 3, stale: false });
    expect((await collectionHandler(owner, { taskId })).active.map((entry) => entry.taskImageId)).toEqual(
      initial.active.map((entry) => entry.taskImageId)
    );
    expect(image).toMatchObject({ state: "ready", removedAt: undefined, recoverableUntil: undefined });
    expect(upload).toMatchObject({ state: "ready" });
  });

  it("atomically replaces an active image when restoring into a full collection", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db);
    const uploadIds = Array.from({ length: 6 }, (_, index) => `upl_swap_${index}`);
    for (const uploadId of uploadIds) {
      await stageHandler(owner, {
        uploadId,
        encodingClass: "jpeg",
        width: 1200,
        height: 900,
        bytes: 500_000,
      });
    }
    const taskId = await addTaskHandler(owner, {
      title: "Swap a removed image",
      imageUploadIds: uploadIds.slice(0, 5),
    });
    const initial = await collectionHandler(owner, { taskId });
    const removedId = initial.active[0]?.taskImageId as Id<"taskImages">;
    await removeTaskImageHandler(owner, { taskImageId: removedId, expectedRevision: 1 });
    const replacementId = initial.active[4]?.taskImageId as Id<"taskImages">;
    await addTaskImagesHandler(owner, {
      taskId,
      uploadIds: [uploadIds[5]],
      expectedRevision: 2,
    });

    const restored = await restoreTaskImageHandler(owner, {
      taskImageId: removedId,
      replaceTaskImageId: replacementId,
      expectedRevision: 3,
    });
    expect(restored).toMatchObject({ revision: 4, stale: false });
    const collection = await collectionHandler(owner, { taskId });
    expect(collection.active).toHaveLength(5);
    expect(collection.active.map((entry) => entry.taskImageId)).toEqual([
      ...initial.active.slice(1, 4).map((entry) => entry.taskImageId),
      removedId,
      expect.any(String),
    ]);
    expect(collection.active.map((entry) => entry.taskImageId)).not.toContain(replacementId);
    expect(collection.recoverable).toEqual([
      expect.objectContaining({ taskImageId: replacementId, previousPosition: 3 }),
    ]);
  });
});
