import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";

export const TASK_IMAGE_VARIANT_SET = "task-image-v1" as const;
export const TASK_IMAGE_POLICY_HASH = "task-image-v1-2026-08-03";

const MAX_STAGED_BYTES = 8 * 1024 * 1024;
const MAX_NORMALIZED_EDGE = 2560;
const MIN_EDGE = 32;
const MAX_ASPECT_RATIO = 20;

type SafeFailureCode =
  | "unsupported_format"
  | "animated_image"
  | "source_too_large"
  | "dimensions_too_large"
  | "aspect_ratio_unsupported"
  | "clipboard_too_large"
  | "storage_unavailable"
  | "memory_unavailable"
  | "normalization_failed"
  | "master_too_large"
  | "variant_too_large"
  | "source_unavailable";

type StageArgs = {
  uploadId: string;
  encodingClass: "jpeg" | "png";
  width: number;
  height: number;
  bytes: number;
};

function validateStagedImage(args: StageArgs): SafeFailureCode | undefined {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.uploadId)) return "normalization_failed";
  if (!Number.isSafeInteger(args.width) || !Number.isSafeInteger(args.height)) {
    return "normalization_failed";
  }
  if (args.width < MIN_EDGE || args.height < MIN_EDGE) return "dimensions_too_large";
  if (args.width > MAX_NORMALIZED_EDGE || args.height > MAX_NORMALIZED_EDGE) {
    return "dimensions_too_large";
  }
  if (Math.max(args.width, args.height) / Math.min(args.width, args.height) > MAX_ASPECT_RATIO) {
    return "aspect_ratio_unsupported";
  }
  if (!Number.isSafeInteger(args.bytes) || args.bytes <= 0 || args.bytes > MAX_STAGED_BYTES) {
    return "master_too_large";
  }
  return undefined;
}

function uploadStateForTaskImage(
  state: Doc<"taskImageUploads">["state"]
): Doc<"taskImages">["state"] {
  if (state === "uploading") return "uploading";
  if (state === "verifying") return "verifying";
  if (state === "ready") return "ready";
  if (state === "failed") return "failed";
  return "pending";
}

async function findOwnedUpload(
  ctx: QueryCtx | MutationCtx,
  ownerTokenIdentifier: string,
  uploadId: string
) {
  return await ctx.db
    .query("taskImageUploads")
    .withIndex("by_owner_upload_id", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("uploadId", uploadId)
    )
    .first();
}

export const stageImageUpload = mutation({
  args: {
    uploadId: v.string(),
    encodingClass: v.union(v.literal("jpeg"), v.literal("png")),
    width: v.number(),
    height: v.number(),
    bytes: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const failure = validateStagedImage(args);
    if (failure) throw new Error(failure);

    const existing = await findOwnedUpload(ctx, ownerTokenIdentifier, args.uploadId);
    if (existing) {
      const matches =
        existing.encodingClass === args.encodingClass &&
        existing.width === args.width &&
        existing.height === args.height &&
        existing.bytes === args.bytes;
      if (!matches) throw new Error("normalization_failed");
      return { uploadId: existing.uploadId, state: uploadStateForTaskImage(existing.state) };
    }

    const now = Date.now();
    await ctx.db.insert("taskImageUploads", {
      uploadId: args.uploadId,
      ownerTokenIdentifier,
      state: "staged",
      encodingClass: args.encodingClass,
      width: args.width,
      height: args.height,
      bytes: args.bytes,
      variantSet: TASK_IMAGE_VARIANT_SET,
      policyHash: TASK_IMAGE_POLICY_HASH,
      providerAttempt: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { uploadId: args.uploadId, state: "pending" as const };
  },
});

export const prepareUploadGrant = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    uploadId: v.string(),
    requestKey: v.string(),
    candidatePublicId: v.string(),
    issuedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(args.requestKey)) {
      throw new Error("invalid_request_key");
    }
    const upload = await findOwnedUpload(ctx, args.ownerTokenIdentifier, args.uploadId);
    if (!upload || !upload.taskImageId) throw new Error("not_found");
    if (upload.state === "ready" || upload.sealedAt) throw new Error("upload_sealed");
    if (upload.state === "failed") throw new Error("upload_failed");

    if (upload.providerPublicId && upload.grantIssuedAt) {
      if (args.issuedAt - upload.grantIssuedAt >= 60 * 60) {
        throw new Error("reconciliation_required");
      }
      return {
        uploadId: upload.uploadId,
        publicId: upload.providerPublicId,
        issuedAt: upload.grantIssuedAt,
        encodingClass: upload.encodingClass,
      };
    }

    const now = args.issuedAt * 1000;
    await ctx.db.patch(upload._id, {
      state: "uploading",
      providerPublicId: args.candidatePublicId,
      providerAttempt: upload.providerAttempt + 1,
      grantRequestKey: args.requestKey,
      grantIssuedAt: args.issuedAt,
      updatedAt: now,
    });
    await ctx.db.patch(upload.taskImageId, { state: "uploading", updatedAt: now });
    return {
      uploadId: upload.uploadId,
      publicId: args.candidatePublicId,
      issuedAt: args.issuedAt,
      encodingClass: upload.encodingClass,
    };
  },
});

export const getUploadVerificationContext = internalQuery({
  args: { ownerTokenIdentifier: v.string(), uploadId: v.string() },
  handler: async (ctx, args) => {
    const upload = await findOwnedUpload(ctx, args.ownerTokenIdentifier, args.uploadId);
    if (!upload || !upload.taskImageId || !upload.providerPublicId) return null;
    return {
      uploadRecordId: upload._id,
      taskImageId: upload.taskImageId,
      publicId: upload.providerPublicId,
      encodingClass: upload.encodingClass,
      state: upload.state,
    };
  },
});

export const getUploadByProviderPublicId = internalQuery({
  args: { publicId: v.string() },
  handler: async (ctx, { publicId }) => {
    const upload = await ctx.db
      .query("taskImageUploads")
      .withIndex("by_provider_public_id", (q) => q.eq("providerPublicId", publicId))
      .first();
    if (!upload || !upload.taskImageId) return null;
    return {
      ownerTokenIdentifier: upload.ownerTokenIdentifier,
      uploadId: upload.uploadId,
      publicId,
      encodingClass: upload.encodingClass,
      providerVersion: upload.providerVersion,
      master: upload.master,
    };
  },
});

const verifiedMasterValidator = v.object({
  format: v.union(v.literal("jpg"), v.literal("png")),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
});

const verifiedVariantValidator = v.object({
  format: v.literal("webp"),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
});

export const applyUploadVerification = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    uploadId: v.string(),
    publicId: v.string(),
    version: v.number(),
    result: v.union(
      v.object({
        status: v.literal("verifying"),
        master: verifiedMasterValidator,
      }),
      v.object({
        status: v.literal("ready"),
        master: verifiedMasterValidator,
        card: verifiedVariantValidator,
        detail: verifiedVariantValidator,
      }),
      v.object({
        status: v.literal("failed"),
        failureCode: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const upload = await findOwnedUpload(ctx, args.ownerTokenIdentifier, args.uploadId);
    if (
      !upload ||
      !upload.taskImageId ||
      upload.providerPublicId !== args.publicId ||
      upload.state === "ready"
    ) {
      return { accepted: false };
    }
    const now = Date.now();
    if (args.result.status === "failed") {
      await ctx.db.patch(upload._id, {
        state: "failed",
        safeFailureCode: args.result.failureCode,
        updatedAt: now,
      });
      await ctx.db.patch(upload.taskImageId, {
        state: "failed",
        safeFailureCode: args.result.failureCode,
        failureRetryable: undefined,
        updatedAt: now,
      });
      return { accepted: true, state: "failed" as const };
    }

    if (args.result.status === "verifying") {
      await ctx.db.patch(upload._id, {
        state: "verifying",
        providerVersion: args.version,
        master: args.result.master,
        updatedAt: now,
      });
      await ctx.db.patch(upload.taskImageId, { state: "verifying", updatedAt: now });
      return { accepted: true, state: "verifying" as const };
    }

    await ctx.db.patch(upload._id, {
      state: "ready",
      providerVersion: args.version,
      master: args.result.master,
      variants: { card: args.result.card, detail: args.result.detail },
      safeFailureCode: undefined,
      verifiedAt: now,
      sealedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(upload.taskImageId, {
      state: "ready",
      safeFailureCode: undefined,
      failureRetryable: undefined,
      updatedAt: now,
    });
    return { accepted: true, state: "ready" as const };
  },
});

export const getDeliveryContext = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    taskImageId: v.id("taskImages"),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.taskImageId);
    if (!image || image.ownerTokenIdentifier !== args.ownerTokenIdentifier) {
      return { kind: "not_found" as const };
    }
    const task = await ctx.db.get(image.taskId);
    if (
      !task ||
      task.ownerTokenIdentifier !== args.ownerTokenIdentifier ||
      task.cancelledAt !== undefined ||
      task.status === "cancelled"
    ) {
      return { kind: "not_found" as const };
    }
    if (image.state !== "ready" || !image.uploadRecordId) {
      return {
        kind: "state" as const,
        state: image.state,
        failure: safeFailure(image.safeFailureCode, image.failureRetryable),
      };
    }
    const upload = await ctx.db.get(image.uploadRecordId);
    if (
      !upload ||
      upload.ownerTokenIdentifier !== args.ownerTokenIdentifier ||
      upload.state !== "ready" ||
      !upload.providerPublicId ||
      !upload.providerVersion ||
      !upload.variants
    ) {
      return { kind: "state" as const, state: "verifying" as const };
    }
    return {
      kind: "ready" as const,
      publicId: upload.providerPublicId,
      version: upload.providerVersion,
    };
  },
});

export async function claimStagedImageForTask(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  taskId: Id<"tasks">,
  uploadId: string
) {
  const upload = await findOwnedUpload(ctx, ownerTokenIdentifier, uploadId);
  const now = Date.now();

  if (!upload || upload.taskImageId) {
    const failedImageId = await ctx.db.insert("taskImages", {
      ownerTokenIdentifier,
      taskId,
      position: 0,
      state: "failed",
      safeFailureCode: "source_unavailable",
      failureRetryable: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(taskId, { imageCollectionRevision: 1 });
    return failedImageId;
  }

  const taskImageId = await ctx.db.insert("taskImages", {
    ownerTokenIdentifier,
    taskId,
    uploadRecordId: upload._id,
    position: 0,
    state: uploadStateForTaskImage(upload.state),
    safeFailureCode: upload.safeFailureCode,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(upload._id, {
    taskImageId,
    state: upload.state === "staged" ? "claimed" : upload.state,
    updatedAt: now,
  });
  await ctx.db.patch(taskId, { imageCollectionRevision: 1 });
  return taskImageId;
}

function safeFailure(code: string | undefined, retryableOverride?: boolean) {
  if (!code) return undefined;
  return {
    code,
    retryable: retryableOverride ?? ![
      "unsupported_format",
      "animated_image",
      "source_too_large",
      "dimensions_too_large",
      "aspect_ratio_unsupported",
      "clipboard_too_large",
      "source_unavailable",
    ].includes(code),
  };
}

async function serializeTaskImage(ctx: QueryCtx, image: Doc<"taskImages">) {
  const upload = image.uploadRecordId ? await ctx.db.get(image.uploadRecordId) : null;
  const presentation = upload
    ? {
        width: upload.width,
        height: upload.height,
        aspectRatio: upload.width / upload.height,
        hasTransparency: upload.encodingClass === "png",
        variantSet: TASK_IMAGE_VARIANT_SET,
      }
    : undefined;
  return {
    taskImageId: image._id,
    position: image.position,
    state: image.state,
    failure: safeFailure(image.safeFailureCode, image.failureRetryable),
    presentation,
  };
}

export const getTaskImageCollection = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const task = await ctx.db.get(taskId);
    if (!task || task.ownerTokenIdentifier !== ownerTokenIdentifier) {
      throw new Error("Task not found");
    }
    const images = await ctx.db
      .query("taskImages")
      .withIndex("by_owner_task", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("taskId", taskId)
      )
      .collect();
    images.sort((a, b) => a.position - b.position);
    const active = await Promise.all(images.map((image) => serializeTaskImage(ctx, image)));
    return {
      revision: task.imageCollectionRevision ?? 0,
      active,
      primary: active[0],
    };
  },
});

export async function getClaimedTaskForUpload(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  uploadId: string
) {
  const upload = await findOwnedUpload(ctx, ownerTokenIdentifier, uploadId);
  if (!upload?.taskImageId) return null;
  const image = await ctx.db.get(upload.taskImageId);
  if (!image || image.ownerTokenIdentifier !== ownerTokenIdentifier) return null;
  const task = await ctx.db.get(image.taskId);
  return task?.ownerTokenIdentifier === ownerTokenIdentifier ? task._id : null;
}

export const listWorkspaceImageCollections = query({
  args: {},
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const images = await ctx.db
      .query("taskImages")
      .withIndex("by_owner_task", (q) => q.eq("ownerTokenIdentifier", ownerTokenIdentifier))
      .collect();
    const byTask = new Map<Id<"tasks">, Doc<"taskImages">[]>();
    for (const image of images) {
      const taskId = image.taskId;
      const taskImages = byTask.get(taskId) ?? [];
      taskImages.push(image);
      byTask.set(taskId, taskImages);
    }
    const collections = await Promise.all(
      [...byTask.entries()].map(async ([taskId, taskImages]) => {
        const task = await ctx.db.get(taskId);
        if (!task || task.ownerTokenIdentifier !== ownerTokenIdentifier) return null;
        taskImages.sort((left, right) => left.position - right.position);
        const active = await Promise.all(
          taskImages.map((image) => serializeTaskImage(ctx, image))
        );
        return {
          taskId,
          collection: {
            revision: task.imageCollectionRevision ?? 0,
            active,
            primary: active[0],
          },
        };
      })
    );
    return collections.filter((collection) => collection !== null);
  },
});
