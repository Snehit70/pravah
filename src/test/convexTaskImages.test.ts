import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { addTask } from "../../convex/tasks";
import {
  addTaskImages,
  getTaskImageCollection,
  removeTaskImage,
  reorderTaskImages,
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

const addTaskHandler = (
  addTask as unknown as Handler<
    { title: string; imageUploadId?: string; imageUploadIds?: string[] },
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

const addTaskImagesHandler = (
  addTaskImages as unknown as Handler<
    { taskId: Id<"tasks">; uploadIds: string[]; expectedRevision?: number },
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

describe("Convex Task-image contract", () => {
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
    expect(firstCollection.primary).toEqual(firstCollection.active[0]);
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

  it("keeps existing Tasks valid with an empty collection and denies cross-owner claims safely", async () => {
    const db = createMemoryDb();
    const owner = authedCtx(db, "owner-1");
    const otherOwner = authedCtx(db, "owner-2");

    const emptyTaskId = await addTaskHandler(owner, { title: "Text-only Task" });
    await expect(collectionHandler(owner, { taskId: emptyTaskId })).resolves.toMatchObject({
      active: [],
      primary: undefined,
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
      imageUploadIds: uploadIds.slice(0, 5),
    });
    const initial = await collectionHandler(owner, { taskId });
    expect(initial.active).toHaveLength(5);
    expect(initial.active.map((image) => image.position)).toEqual([0, 1, 2, 3, 4]);
    expect(initial.primary).toEqual(initial.active[0]);

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
    expect((await collectionHandler(owner, { taskId })).primary?.taskImageId).toBe(
      initial.active[4].taskImageId
    );

    const captioned = await updateTaskImageCaptionHandler(owner, {
      taskImageId: initial.active[4].taskImageId as Id<"taskImages">,
      caption: "  Primary reference  ",
      expectedRevision: 2,
    });
    expect(captioned).toMatchObject({ revision: 3, stale: false });
    expect((await collectionHandler(owner, { taskId })).primary?.caption).toBe("Primary reference");

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
});
