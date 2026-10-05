import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";
import { ensureTaskImageCleanupTombstone, findTaskImageCleanupTombstone } from "./taskImageCleanup";

export const TASK_IMAGE_VARIANT_SET = "task-image-v1" as const;
export const TASK_IMAGE_POLICY_HASH = "task-image-v1-2026-08-03";
export const MAX_ACTIVE_TASK_IMAGES = 5 as const;
export const TASK_IMAGE_UPLOAD_START_TIMEOUT_MS = 30 * 60 * 1000;
export const TASK_IMAGE_UPLOAD_ATTEMPT_TIMEOUT_MS = 30 * 60 * 1000;
export const TASK_IMAGE_VERIFICATION_TIMEOUT_MS = 10 * 60 * 1000;
const IMAGE_RECOVERY_WINDOW_MS = 30 * 60 * 1000;

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
  | "source_unavailable"
  | "upload_failed"
  | "upload_timeout"
  | "verification_timeout";

const SAFE_FAILURE_CODES = new Set<SafeFailureCode>([
  "unsupported_format",
  "animated_image",
  "source_too_large",
  "dimensions_too_large",
  "aspect_ratio_unsupported",
  "clipboard_too_large",
  "storage_unavailable",
  "memory_unavailable",
  "normalization_failed",
  "master_too_large",
  "variant_too_large",
  "source_unavailable",
  "upload_failed",
  "upload_timeout",
  "verification_timeout",
]);

type StageArgs = {
  uploadId: string;
  encodingClass: "jpeg" | "png";
  width: number;
  height: number;
  bytes: number;
};

type TaskImageClaimInput = {
  uploadId: string;
  caption?: string;
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

export const discardUnclaimedUpload = mutation({
  args: { uploadId: v.string() },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const upload = await findOwnedUpload(ctx, ownerTokenIdentifier, args.uploadId);
    if (!upload || upload.taskImageId) return { accepted: false as const };

    await ensureTaskImageCleanupTombstone(ctx, { ownerTokenIdentifier, upload });
    await ctx.scheduler.runAfter(0, internal.taskImageActions.reconcileCleanup, {});
    return { accepted: true as const };
  },
});

export const markUploadFailed = mutation({
  args: {
    uploadId: v.string(),
    failureCode: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const upload = await findOwnedUpload(ctx, ownerTokenIdentifier, args.uploadId);
    if (!upload || upload.state === "ready" || (args.attempt !== undefined && args.attempt !== upload.providerAttempt)) {
      return { accepted: false as const };
    }
    const failureCode: SafeFailureCode = SAFE_FAILURE_CODES.has(args.failureCode as SafeFailureCode)
      ? args.failureCode as SafeFailureCode
      : "normalization_failed";
    const now = Date.now();
    const failure = safeFailure(failureCode)!;
    await ctx.db.patch(upload._id, {
      state: "failed",
      safeFailureCode: failure.code,
      claimedAt: undefined,
      verificationStartedAt: undefined,
      updatedAt: now,
    });
    if (upload.taskImageId) {
      await ctx.db.patch(upload.taskImageId, {
        state: "failed",
        safeFailureCode: failure.code,
        failureRetryable: failure.retryable,
        updatedAt: now,
      });
    }
    return { accepted: true as const, state: "failed" as const };
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
    if (!upload) throw new Error("not_found");
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
        providerAttempt: upload.providerAttempt,
      };
    }

    const now = args.issuedAt * 1000;
    const nextProviderAttempt = upload.providerAttempt + 1;
    await ctx.db.patch(upload._id, {
      state: "uploading",
      providerPublicId: args.candidatePublicId,
      providerAttempt: nextProviderAttempt,
      grantRequestKey: args.requestKey,
      grantIssuedAt: args.issuedAt,
      claimedAt: undefined,
      verificationStartedAt: undefined,
      updatedAt: now,
    });
    if (upload.taskImageId) {
      await ctx.db.patch(upload.taskImageId, { state: "uploading", updatedAt: now });
    }
    await ctx.scheduler.runAfter(
      TASK_IMAGE_UPLOAD_ATTEMPT_TIMEOUT_MS,
      internal.taskImages.expireTaskImageUploadAttempt,
      {
        uploadRecordId: upload._id,
        providerAttempt: nextProviderAttempt,
        expectedState: "uploading",
        expectedAt: args.issuedAt,
      },
    );
    return {
      uploadId: upload.uploadId,
      publicId: args.candidatePublicId,
      issuedAt: args.issuedAt,
      encodingClass: upload.encodingClass,
      providerAttempt: nextProviderAttempt,
    };
  },
});

export const getUploadVerificationContext = internalQuery({
  args: { ownerTokenIdentifier: v.string(), uploadId: v.string() },
  handler: async (ctx, args) => {
    const upload = await findOwnedUpload(ctx, args.ownerTokenIdentifier, args.uploadId);
    if (!upload) return null;
    return {
      uploadRecordId: upload._id,
      taskImageId: upload.taskImageId,
      publicId: upload.providerPublicId,
      encodingClass: upload.encodingClass,
      state: upload.state,
    };
  },
});

export const getUploadAttemptContext = internalQuery({
  args: { ownerTokenIdentifier: v.string(), uploadId: v.string() },
  handler: async (ctx, args) => {
    const upload = await findOwnedUpload(ctx, args.ownerTokenIdentifier, args.uploadId);
    if (!upload) return null;
    const image = upload.taskImageId ? await ctx.db.get(upload.taskImageId) : null;
    return {
      uploadId: upload.uploadId,
      providerPublicId: upload.providerPublicId,
      providerAttempt: upload.providerAttempt,
      encodingClass: upload.encodingClass,
      state: upload.state,
      safeFailureCode: upload.safeFailureCode,
      failureRetryable: image?.failureRetryable,
    };
  },
});

export const resetUploadAttempt = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    uploadId: v.string(),
    providerAttempt: v.number(),
  },
  handler: async (ctx, args) => {
    const upload = await findOwnedUpload(ctx, args.ownerTokenIdentifier, args.uploadId);
    if (!upload || upload.providerAttempt !== args.providerAttempt) {
      return { reset: false as const };
    }
    if (upload.state === "ready" || upload.sealedAt) return { reset: false as const };
    const now = Date.now();
    await ctx.db.patch(upload._id, {
      state: upload.taskImageId ? "claimed" : "staged",
      claimedAt: upload.taskImageId ? now : undefined,
      providerPublicId: undefined,
      providerVersion: undefined,
      grantRequestKey: undefined,
      grantIssuedAt: undefined,
      master: undefined,
      pendingEager: undefined,
      providerReconciledAt: undefined,
      variants: undefined,
      verifiedAt: undefined,
      safeFailureCode: undefined,
      verificationStartedAt: undefined,
      updatedAt: now,
    });
    if (upload.taskImageId) {
      await ctx.db.patch(upload.taskImageId, {
        state: "pending",
        safeFailureCode: undefined,
        failureRetryable: undefined,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        TASK_IMAGE_UPLOAD_START_TIMEOUT_MS,
        internal.taskImages.expireTaskImageUploadAttempt,
        {
          uploadRecordId: upload._id,
          providerAttempt: upload.providerAttempt,
          expectedState: "claimed",
          expectedAt: now,
        },
      );
    }
    return { reset: true as const };
  },
});

export const getUploadByProviderPublicId = internalQuery({
  args: { publicId: v.string() },
  handler: async (ctx, { publicId }) => {
    const upload = await ctx.db
      .query("taskImageUploads")
      .withIndex("by_provider_public_id", (q) => q.eq("providerPublicId", publicId))
      .first();
    if (!upload) return null;
    return {
      ownerTokenIdentifier: upload.ownerTokenIdentifier,
      uploadId: upload.uploadId,
      publicId,
      encodingClass: upload.encodingClass,
      providerVersion: upload.providerVersion,
      master: upload.master,
      pendingEager: upload.pendingEager,
    };
  },
});

export const reserveProviderReconciliation = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    uploadId: v.string(),
    publicId: v.string(),
  },
  handler: async (ctx, args) => {
    const upload = await findOwnedUpload(
      ctx,
      args.ownerTokenIdentifier,
      args.uploadId,
    );
    const now = Date.now();
    if (
      !upload ||
      upload.providerPublicId !== args.publicId ||
      upload.sealedAt ||
      (upload.providerReconciledAt !== undefined &&
        now - upload.providerReconciledAt < 30_000)
    )
      return false;
    await ctx.db.patch(upload._id, { providerReconciledAt: now });
    return true;
  },
});

// Only a signature-verified provider callback can enter this internal seam.
export const storeEagerNotification = internalMutation({
  args: {
    publicId: v.string(),
    version: v.optional(v.number()),
    eager: v.array(
      v.object({
        transformation: v.string(),
        format: v.string(),
        width: v.number(),
        height: v.number(),
        bytes: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db
      .query("taskImageUploads")
      .withIndex("by_provider_public_id", (q) =>
        q.eq("providerPublicId", args.publicId),
      )
      .first();
    if (
      !upload ||
      upload.sealedAt ||
      upload.state === "ready" ||
      upload.state === "failed"
    )
      return { accepted: false };
    if (
      args.eager.length !== 2 ||
      (args.version !== undefined &&
        upload.providerVersion !== undefined &&
        args.version !== upload.providerVersion)
    )
      return { accepted: false };
    await ctx.db.patch(upload._id, {
      pendingEager: { version: args.version, eager: args.eager },
    });
    await ctx.scheduler.runAfter(
      0,
      internal.taskImageActions.verifyPendingEager,
      { publicId: args.publicId },
    );
    return { accepted: true };
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
    recoverTimedOut: v.optional(v.boolean()),
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
      upload.providerPublicId !== args.publicId ||
      upload.state === "ready"
    ) {
      return { accepted: false };
    }
    const now = Date.now();
    if (args.result.status === "failed") {
      const failure = safeFailure(args.result.failureCode, true)!;
      await ctx.db.patch(upload._id, {
        state: "failed",
        safeFailureCode: failure.code,
        claimedAt: undefined,
        verificationStartedAt: undefined,
        updatedAt: now,
      });
      if (upload.taskImageId) {
        await ctx.db.patch(upload.taskImageId, {
          state: "failed",
          safeFailureCode: failure.code,
          failureRetryable: failure.retryable,
          updatedAt: now,
        });
      }
      return { accepted: true, state: "failed" as const };
    }

    if (args.result.status === "verifying") {
      // Master-only upload notifications must not resurrect a failed verification.
      // That left rows as state=verifying with a stale safeFailureCode, and the
      // client showed "Verifying image" forever with no Retry.
      if (upload.state === "failed" && !(args.recoverTimedOut && ["upload_timeout", "verification_timeout", "upload_failed"].includes(upload.safeFailureCode ?? ""))) {
        return { accepted: false, state: "failed" as const };
      }
      const shouldScheduleVerificationExpiry = upload.state !== "verifying" || upload.verificationStartedAt === undefined;
      const verificationStartedAt = upload.state === "verifying" && upload.verificationStartedAt
        ? upload.verificationStartedAt
        : now;
      await ctx.db.patch(upload._id, {
        state: "verifying",
        claimedAt: undefined,
        providerVersion: args.version,
        master: args.result.master,
        safeFailureCode: undefined,
        verificationStartedAt,
        updatedAt: now,
      });
      if (upload.taskImageId) {
        await ctx.db.patch(upload.taskImageId, {
          state: "verifying",
          safeFailureCode: undefined,
          failureRetryable: undefined,
          updatedAt: now,
        });
      }
      if (shouldScheduleVerificationExpiry) {
        await ctx.scheduler.runAfter(
          TASK_IMAGE_VERIFICATION_TIMEOUT_MS,
          internal.taskImages.expireTaskImageUploadAttempt,
          {
            uploadRecordId: upload._id,
            providerAttempt: upload.providerAttempt,
            expectedState: "verifying",
            expectedAt: verificationStartedAt,
          },
        );
      }
      if (upload.pendingEager) {
        await ctx.scheduler.runAfter(0, internal.taskImageActions.verifyPendingEager, { publicId: args.publicId });
      }
      return { accepted: true, state: "verifying" as const };
    }

    await ctx.db.patch(upload._id, {
      state: "ready",
      claimedAt: undefined,
      providerVersion: args.version,
      master: args.result.master,
      variants: { card: args.result.card, detail: args.result.detail },
      pendingEager: undefined,
      safeFailureCode: undefined,
      verificationStartedAt: undefined,
      verifiedAt: now,
      sealedAt: now,
      updatedAt: now,
    });
    if (upload.taskImageId) {
      await ctx.db.patch(upload.taskImageId, {
        state: "ready",
        safeFailureCode: undefined,
        failureRetryable: undefined,
        updatedAt: now,
      });
    }
    return { accepted: true, state: "ready" as const };
  },
});

/** Expire one exact upload attempt without allowing an old timer to affect a retry. */
export const expireTaskImageUploadAttempt = internalMutation({
  args: {
    uploadRecordId: v.id("taskImageUploads"),
    providerAttempt: v.number(),
    expectedState: v.union(v.literal("claimed"), v.literal("uploading"), v.literal("verifying")),
    expectedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadRecordId);
    if (!upload || upload.providerAttempt !== args.providerAttempt || upload.state !== args.expectedState) {
      return { expired: false as const };
    }
    const currentStateAt = args.expectedState === "claimed"
      ? upload.claimedAt
      : args.expectedState === "uploading"
        ? upload.grantIssuedAt
        : upload.verificationStartedAt;
    if (currentStateAt !== args.expectedAt) return { expired: false as const };

    const now = Date.now();
    const timeoutMs = args.expectedState === "claimed"
      ? TASK_IMAGE_UPLOAD_START_TIMEOUT_MS
      : args.expectedState === "uploading"
        ? TASK_IMAGE_UPLOAD_ATTEMPT_TIMEOUT_MS
        : TASK_IMAGE_VERIFICATION_TIMEOUT_MS;
    const expectedAtMs = args.expectedState === "uploading" ? args.expectedAt * 1000 : args.expectedAt;
    const remainingMs = expectedAtMs + timeoutMs - now;
    if (remainingMs > 0) {
      await ctx.scheduler.runAfter(
        remainingMs,
        internal.taskImages.expireTaskImageUploadAttempt,
        args,
      );
      return { expired: false as const };
    }

    const failureCode = args.expectedState === "verifying" ? "verification_timeout" : "upload_timeout";
    await ctx.db.patch(upload._id, {
      state: "failed",
      safeFailureCode: failureCode,
      claimedAt: undefined,
      verificationStartedAt: undefined,
      updatedAt: now,
    });
    if (upload.taskImageId && await ctx.db.get(upload.taskImageId)) {
      await ctx.db.patch(upload.taskImageId, {
        state: "failed",
        safeFailureCode: failureCode,
        failureRetryable: true,
        updatedAt: now,
      });
    }
    return { expired: true as const, failureCode };
  },
});

/** Recover attempts created before durable per-attempt deadlines were deployed. */
export const failStaleTaskImageUploads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const uploadsByState = await Promise.all(
      (["claimed", "uploading", "verifying"] as const).map((state) =>
        ctx.db
          .query("taskImageUploads")
          .withIndex("by_state_updated_at", (q) => q.eq("state", state))
          .collect()
      ),
    );
    const uploads = uploadsByState.flat();
    let failed = 0;
    for (const upload of uploads) {
      if (upload.state !== "claimed" && upload.state !== "uploading" && upload.state !== "verifying") continue;
      const startedAt = upload.state === "claimed"
        ? upload.claimedAt ?? upload.updatedAt
        : upload.state === "uploading"
          ? (upload.grantIssuedAt === undefined ? upload.updatedAt : upload.grantIssuedAt * 1000)
          : upload.verificationStartedAt ?? upload.updatedAt;
      const timeoutMs = upload.state === "verifying"
        ? TASK_IMAGE_VERIFICATION_TIMEOUT_MS
        : upload.state === "claimed"
          ? TASK_IMAGE_UPLOAD_START_TIMEOUT_MS
          : TASK_IMAGE_UPLOAD_ATTEMPT_TIMEOUT_MS;
      if (now - startedAt < timeoutMs) continue;

      const failureCode = upload.state === "verifying" ? "verification_timeout" : "upload_timeout";
      await ctx.db.patch(upload._id, {
        state: "failed",
        safeFailureCode: failureCode,
        claimedAt: undefined,
        verificationStartedAt: undefined,
        updatedAt: now,
      });
      if (upload.taskImageId && await ctx.db.get(upload.taskImageId)) {
        await ctx.db.patch(upload.taskImageId, {
          state: "failed",
          safeFailureCode: failureCode,
          failureRetryable: true,
          updatedAt: now,
        });
      }
      failed += 1;
    }
    return { failed };
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
      task.status === "cancelled" ||
      image.removedAt !== undefined
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

async function listTaskImages(
  ctx: QueryCtx | MutationCtx,
  ownerTokenIdentifier: string,
  taskId: Id<"tasks">
) {
  const images = await ctx.db
    .query("taskImages")
    .withIndex("by_owner_task", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("taskId", taskId)
    )
    .collect();
  return images.sort((a, b) => a.position - b.position);
}

export async function claimStagedImagesForTask(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  taskId: Id<"tasks">,
  inputs: TaskImageClaimInput[]
) {
  const activeImages = (await listTaskImages(ctx, ownerTokenIdentifier, taskId)).filter(
    (image) => image.removedAt === undefined
  );
  if (activeImages.length + inputs.length > MAX_ACTIVE_TASK_IMAGES) {
    throw new Error("Task image collection is full");
  }

  const uniqueUploadIds = new Set(inputs.map((input) => input.uploadId));
  if (uniqueUploadIds.size !== inputs.length) throw new Error("duplicate_task_image");
  const captions = inputs.map((input) => input.caption?.trim() ?? "");
  if (captions.some((caption) => caption.length > 500)) throw new Error("caption_too_long");

  const now = Date.now();
  const claimedIds = [];
  for (const [offset, input] of inputs.entries()) {
    const upload = await findOwnedUpload(ctx, ownerTokenIdentifier, input.uploadId);
    const cleanupTombstone = upload
      ? await findTaskImageCleanupTombstone(ctx, upload._id)
      : undefined;
    const caption = captions[offset] || undefined;
    if (!upload || upload.taskImageId || cleanupTombstone) {
      claimedIds.push(await ctx.db.insert("taskImages", {
        ownerTokenIdentifier,
        taskId,
        position: activeImages.length + offset,
        caption,
        state: "failed",
        safeFailureCode: "source_unavailable",
        failureRetryable: true,
        createdAt: now,
        updatedAt: now,
      }));
      continue;
    }

    const taskImageId = await ctx.db.insert("taskImages", {
      ownerTokenIdentifier,
      taskId,
      uploadRecordId: upload._id,
      position: activeImages.length + offset,
      caption,
      state: uploadStateForTaskImage(upload.state),
      safeFailureCode: upload.safeFailureCode,
      createdAt: now,
      updatedAt: now,
    });
    const claimedAt = upload.state === "staged" ? now : undefined;
    await ctx.db.patch(upload._id, {
      taskImageId,
      state: upload.state === "staged" ? "claimed" : upload.state,
      claimedAt,
      updatedAt: now,
    });
    if (claimedAt !== undefined) {
      await ctx.scheduler.runAfter(
        TASK_IMAGE_UPLOAD_START_TIMEOUT_MS,
        internal.taskImages.expireTaskImageUploadAttempt,
        {
          uploadRecordId: upload._id,
          providerAttempt: upload.providerAttempt,
          expectedState: "claimed",
          expectedAt: claimedAt,
        },
      );
    }
    claimedIds.push(taskImageId);
  }

  const task = await ctx.db.get(taskId);
  await ctx.db.patch(taskId, {
    imageCollectionRevision: (task?.imageCollectionRevision ?? 0) + 1,
    updatedAt: now,
  });
  return claimedIds;
}

export async function claimStagedImageForTask(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  taskId: Id<"tasks">,
  uploadId: string
) {
  const [taskImageId] = await claimStagedImagesForTask(ctx, ownerTokenIdentifier, taskId, [{ uploadId }]);
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

async function serializeTaskImage(ctx: QueryCtx | MutationCtx, image: Doc<"taskImages">) {
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
  // Heal inconsistent rows: verifying + failure code meant the eager webhook
  // failed, then a later master notification flipped state back to verifying.
  const state =
    image.state === "verifying" && image.safeFailureCode ? "failed" : image.state;
  return {
    taskImageId: image._id,
    position: image.position,
    caption: image.caption,
    state,
    attempt: upload?.providerAttempt,
    failure: safeFailure(
      image.safeFailureCode,
      state === "failed" ? image.failureRetryable ?? true : image.failureRetryable
    ),
    presentation,
  };
}

function serializeRecoverableTaskImage(image: Doc<"taskImages">) {
  return {
    taskImageId: image._id,
    caption: image.caption,
    removedAt: image.removedAt,
    recoverableUntil: image.recoverableUntil,
    previousPosition: image.previousPosition,
  };
}

export async function getTaskImageCollectionForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerTokenIdentifier: string,
  taskId: Id<"tasks">
) {
  const task = await ctx.db.get(taskId);
  if (!task || task.ownerTokenIdentifier !== ownerTokenIdentifier) {
    throw new Error("Task not found");
  }
  const images = await listTaskImages(ctx, ownerTokenIdentifier, taskId);
  const observedAt = Date.now();
  const activeImages = images.filter((image) => image.removedAt === undefined);
  const active = await Promise.all(activeImages.map((image) => serializeTaskImage(ctx, image)));
  return {
    revision: task.imageCollectionRevision ?? 0,
    observedAt,
    active,
    recoverable: images
      .filter(
        (image) =>
          image.removedAt !== undefined && (image.recoverableUntil ?? 0) > observedAt
      )
      .map(serializeRecoverableTaskImage),
  };
}

export async function getTaskImageSummaryForOwner(
  ctx: QueryCtx,
  ownerTokenIdentifier: string,
  taskId: Id<"tasks">
) {
  return (await getTaskImageSummariesForOwner(ctx, ownerTokenIdentifier, [taskId])).get(
    taskId
  )!;
}

export async function getTaskImageSummariesForOwner(
  ctx: QueryCtx,
  ownerTokenIdentifier: string,
  taskIds: Id<"tasks">[]
) {
  const summaries = new Map(
    taskIds.map((taskId) => [
      taskId,
      { activeCount: 0, readyCount: 0, failedCount: 0 },
    ])
  );
  if (taskIds.length === 0) return summaries;
  const images = (await Promise.all([...new Set(taskIds)].map((taskId) =>
    ctx.db.query("taskImages").withIndex("by_owner_task", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("taskId", taskId)
    ).collect()
  ))).flat();
  for (const image of images) {
    if (image.removedAt !== undefined) continue;
    const summary = summaries.get(image.taskId)!;
    summary.activeCount += 1;
    if (image.state === "ready") summary.readyCount += 1;
    if (
      image.state === "failed" ||
      (image.state === "verifying" && image.safeFailureCode)
    ) {
      summary.failedCount += 1;
    }
  }
  return summaries;
}

async function getOwnedActiveTaskImage(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  taskImageId: Id<"taskImages">
) {
  const image = await ctx.db.get(taskImageId);
  if (!image || image.ownerTokenIdentifier !== ownerTokenIdentifier || image.removedAt !== undefined) {
    throw new Error("Task image not found");
  }
  const task = await ctx.db.get(image.taskId);
  if (!task || task.ownerTokenIdentifier !== ownerTokenIdentifier) throw new Error("Task not found");
  return { image, task };
}

async function getOwnedRecoverableTaskImage(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  taskImageId: Id<"taskImages">
) {
  const image = await ctx.db.get(taskImageId);
  if (
    !image ||
    image.ownerTokenIdentifier !== ownerTokenIdentifier ||
    image.removedAt === undefined
  ) {
    throw new Error("Task image not found");
  }
  const task = await ctx.db.get(image.taskId);
  if (!task || task.ownerTokenIdentifier !== ownerTokenIdentifier) throw new Error("Task not found");
  if (task.cancelledAt !== undefined || task.status === "cancelled") {
    throw new Error("Task is cancelled");
  }
  if (image.recoverableUntil === undefined || image.recoverableUntil <= Date.now()) {
    throw new Error("Task image recovery window expired");
  }
  return { image, task };
}

async function staleCollection(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  taskId: Id<"tasks">,
  expectedRevision: number
) {
  const current = await getTaskImageCollectionForOwner(ctx, ownerTokenIdentifier, taskId);
  return current.revision !== expectedRevision ? { stale: true as const, ...current } : null;
}

export const addTaskImages = mutation({
  args: {
    taskId: v.id("tasks"),
    uploadIds: v.optional(v.array(v.string())),
    imageInputs: v.optional(
      v.array(v.object({ uploadId: v.string(), caption: v.optional(v.string()) }))
    ),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const stale = await staleCollection(ctx, ownerTokenIdentifier, args.taskId, args.expectedRevision);
    if (stale) return stale;
    const inputs = [
      ...(args.imageInputs ?? []),
      ...(args.uploadIds ?? []).map((uploadId) => ({ uploadId })),
    ];
    if (inputs.length === 0) {
      return { stale: false as const, ...(await getTaskImageCollectionForOwner(ctx, ownerTokenIdentifier, args.taskId)) };
    }
    await claimStagedImagesForTask(ctx, ownerTokenIdentifier, args.taskId, inputs);
    return {
      stale: false as const,
      ...(await getTaskImageCollectionForOwner(ctx, ownerTokenIdentifier, args.taskId)),
    };
  },
});

export const reorderTaskImages = mutation({
  args: {
    taskId: v.id("tasks"),
    orderedTaskImageIds: v.array(v.id("taskImages")),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const stale = await staleCollection(ctx, ownerTokenIdentifier, args.taskId, args.expectedRevision);
    if (stale) return stale;
    const images = (await listTaskImages(ctx, ownerTokenIdentifier, args.taskId)).filter(
      (image) => image.removedAt === undefined
    );
    const expected = new Set(images.map((image) => image._id));
    if (
      args.orderedTaskImageIds.length !== images.length ||
      new Set(args.orderedTaskImageIds).size !== args.orderedTaskImageIds.length ||
      args.orderedTaskImageIds.some((id) => !expected.has(id))
    ) {
      throw new Error("invalid_task_image_order");
    }
    const byId = new Map(images.map((image) => [image._id, image]));
    const now = Date.now();
    for (const [position, taskImageId] of args.orderedTaskImageIds.entries()) {
      const image = byId.get(taskImageId);
      if (image && image.position !== position) await ctx.db.patch(image._id, { position, updatedAt: now });
    }
    const task = await ctx.db.get(args.taskId);
    await ctx.db.patch(args.taskId, {
      imageCollectionRevision: (task?.imageCollectionRevision ?? 0) + 1,
      updatedAt: now,
    });
    return {
      stale: false as const,
      ...(await getTaskImageCollectionForOwner(ctx, ownerTokenIdentifier, args.taskId)),
    };
  },
});

export const updateTaskImageCaption = mutation({
  args: {
    taskImageId: v.id("taskImages"),
    caption: v.optional(v.string()),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const { image, task } = await getOwnedActiveTaskImage(ctx, ownerTokenIdentifier, args.taskImageId);
    const stale = await staleCollection(ctx, ownerTokenIdentifier, task._id, args.expectedRevision);
    if (stale) return stale;
    const caption = args.caption?.trim() ?? "";
    if (caption.length > 500) throw new Error("caption_too_long");
    const now = Date.now();
    await ctx.db.patch(image._id, { caption: caption || undefined, updatedAt: now });
    await ctx.db.patch(task._id, {
      imageCollectionRevision: (task.imageCollectionRevision ?? 0) + 1,
      updatedAt: now,
    });
    return {
      stale: false as const,
      ...(await getTaskImageCollectionForOwner(ctx, ownerTokenIdentifier, task._id)),
    };
  },
});

export const removeTaskImage = mutation({
  args: {
    taskImageId: v.id("taskImages"),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const { image, task } = await getOwnedActiveTaskImage(ctx, ownerTokenIdentifier, args.taskImageId);
    const stale = await staleCollection(ctx, ownerTokenIdentifier, task._id, args.expectedRevision);
    if (stale) return stale;
    const now = Date.now();
    await ctx.db.patch(image._id, {
      removedAt: now,
      recoverableUntil: now + IMAGE_RECOVERY_WINDOW_MS,
      previousPosition: image.position,
      updatedAt: now,
    });
    const active = (await listTaskImages(ctx, ownerTokenIdentifier, task._id)).filter(
      (candidate) => candidate._id !== image._id && candidate.removedAt === undefined
    );
    for (const [position, candidate] of active.entries()) {
      if (candidate.position !== position) await ctx.db.patch(candidate._id, { position, updatedAt: now });
    }
    await ctx.db.patch(task._id, {
      imageCollectionRevision: (task.imageCollectionRevision ?? 0) + 1,
      updatedAt: now,
    });
    return {
      stale: false as const,
      ...(await getTaskImageCollectionForOwner(ctx, ownerTokenIdentifier, task._id)),
    };
  },
});

export const restoreTaskImage = mutation({
  args: {
    taskImageId: v.id("taskImages"),
    replaceTaskImageId: v.optional(v.id("taskImages")),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const { image, task } = await getOwnedRecoverableTaskImage(
      ctx,
      ownerTokenIdentifier,
      args.taskImageId
    );
    const stale = await staleCollection(ctx, ownerTokenIdentifier, task._id, args.expectedRevision);
    if (stale) return stale;
    const active = (await listTaskImages(ctx, ownerTokenIdentifier, task._id)).filter(
      (candidate) => candidate.removedAt === undefined
    );
    const replacement = args.replaceTaskImageId
      ? active.find((candidate) => candidate._id === args.replaceTaskImageId)
      : undefined;
    if (args.replaceTaskImageId && !replacement) throw new Error("Task image not found");
    if (active.length >= MAX_ACTIVE_TASK_IMAGES && !replacement) {
      throw new Error("Task image collection is full");
    }

    const now = Date.now();
    const remaining = replacement ? active.filter((candidate) => candidate._id !== replacement._id) : active;
    const position = replacement
      ? replacement.position
      : Math.min(image.previousPosition ?? remaining.length, remaining.length);
    const ordered = [...remaining];
    ordered.splice(position, 0, image);

    if (replacement) {
      await ctx.db.patch(replacement._id, {
        removedAt: now,
        recoverableUntil: now + IMAGE_RECOVERY_WINDOW_MS,
        previousPosition: replacement.position,
        updatedAt: now,
      });
    }
    await ctx.db.patch(image._id, {
      removedAt: undefined,
      recoverableUntil: undefined,
      previousPosition: undefined,
      position,
      updatedAt: now,
    });
    for (const [nextPosition, candidate] of ordered.entries()) {
      if (candidate._id !== image._id && candidate.position !== nextPosition) {
        await ctx.db.patch(candidate._id, { position: nextPosition, updatedAt: now });
      }
    }
    await ctx.db.patch(task._id, {
      imageCollectionRevision: (task.imageCollectionRevision ?? 0) + 1,
      updatedAt: now,
    });
    return {
      stale: false as const,
      ...(await getTaskImageCollectionForOwner(ctx, ownerTokenIdentifier, task._id)),
    };
  },
});

export const getTaskImageCollection = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    return getTaskImageCollectionForOwner(ctx, ownerTokenIdentifier, taskId);
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
  args: { observedAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    // New clients pass a 5-minute bucket. A missing value is an older app,
    // which still has to read the clock once so the recoverable window works.
    const observedAt =
      args.observedAt ??
      Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000);
    const images = await ctx.db
      .query("taskImages")
      .withIndex("by_owner_task", (q) => q.eq("ownerTokenIdentifier", ownerTokenIdentifier))
      .collect();
    const taskIds = [...new Set(images.map((image) => image.taskId))];
    const tasks = (
      await Promise.all(taskIds.map((taskId) => ctx.db.get(taskId)))
    ).filter((task): task is Doc<"tasks"> => task !== null);
    const byTask = new Map<Id<"tasks">, Doc<"taskImages">[]>();
    for (const image of images) {
      const taskId = image.taskId;
      const taskImages = byTask.get(taskId) ?? [];
      taskImages.push(image);
      byTask.set(taskId, taskImages);
    }
    const collections = await Promise.all(
      tasks.map(async (task) => {
        const taskId = task._id;
        const taskImages = byTask.get(taskId) ?? [];
        const activeTaskImages = taskImages
          .filter((image) => image.removedAt === undefined)
          .sort((left, right) => left.position - right.position);
        const active = await Promise.all(
          activeTaskImages.map((image) => serializeTaskImage(ctx, image))
        );
        return {
          taskId,
          collection: {
            revision: task.imageCollectionRevision ?? 0,
            observedAt,
            active,
            recoverable: taskImages
              .filter(
                (image) =>
                  image.removedAt !== undefined &&
                  (image.recoverableUntil ?? 0) > observedAt
              )
              .sort(
                (left, right) =>
                  (left.previousPosition ?? Number.MAX_SAFE_INTEGER) -
                    (right.previousPosition ?? Number.MAX_SAFE_INTEGER) ||
                  String(left._id).localeCompare(String(right._id))
              )
              .map(serializeRecoverableTaskImage),
          },
        };
      })
    );
    return collections;
  },
});
