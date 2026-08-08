import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

export const CLEANUP_RETRY_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000] as const;

type CleanupSource = {
  ownerTokenIdentifier: string;
  taskId: Id<"tasks">;
  taskImageId: Id<"taskImages">;
  upload: Doc<"taskImageUploads">;
};

async function findTombstone(
  ctx: QueryCtx | MutationCtx,
  uploadRecordId: Id<"taskImageUploads">
) {
  return await ctx.db
    .query("taskImageCleanupTombstones")
    .withIndex("by_upload_record", (q) => q.eq("uploadRecordId", uploadRecordId))
    .first();
}

export async function ensureTaskImageCleanupTombstone(
  ctx: MutationCtx,
  source: CleanupSource,
  now = Date.now()
) {
  const existing = await findTombstone(ctx, source.upload._id);
  if (existing) return existing._id;
  return await ctx.db.insert("taskImageCleanupTombstones", {
    ownerTokenIdentifier: source.ownerTokenIdentifier,
    taskId: source.taskId,
    taskImageId: source.taskImageId,
    uploadRecordId: source.upload._id,
    providerPublicId: source.upload.providerPublicId,
    providerVersion: source.upload.providerVersion,
    state: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export const listDueCleanupTombstones = internalQuery({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskImageCleanupTombstones")
      .withIndex("by_due", (q) => q.eq("state", "pending").lte("nextAttemptAt", args.now))
      .take(args.limit);
  },
});

export const recordCleanupResult = internalMutation({
  args: {
    tombstoneId: v.id("taskImageCleanupTombstones"),
    outcome: v.union(v.literal("deleted"), v.literal("absent"), v.literal("retry")),
    failureCode: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const tombstone = await ctx.db.get(args.tombstoneId);
    if (!tombstone) return { accepted: false as const };
    if (args.outcome === "deleted" || args.outcome === "absent") {
      const image = await ctx.db.get(tombstone.taskImageId);
      if (image && image.uploadRecordId === tombstone.uploadRecordId) await ctx.db.delete(image._id);
      const upload = await ctx.db.get(tombstone.uploadRecordId);
      if (upload && upload.taskImageId === tombstone.taskImageId) await ctx.db.delete(upload._id);
      await ctx.db.delete(tombstone._id);
      return { accepted: true as const, terminal: true as const };
    }

    const attempts = tombstone.attempts + 1;
    const delay = CLEANUP_RETRY_DELAYS_MS[Math.min(attempts - 1, CLEANUP_RETRY_DELAYS_MS.length - 1)];
    await ctx.db.patch(tombstone._id, {
      state: "retry",
      attempts,
      nextAttemptAt: args.now + delay,
      lastFailureCode: args.failureCode ?? "provider_ambiguous",
      updatedAt: args.now,
    });
    return { accepted: true as const, terminal: false as const, nextAttemptAt: args.now + delay };
  },
});

export const promoteDueCleanupRetries = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const due = await ctx.db
      .query("taskImageCleanupTombstones")
      .withIndex("by_due", (q) => q.eq("state", "retry").lte("nextAttemptAt", args.now))
      .take(50);
    for (const tombstone of due) {
      await ctx.db.patch(tombstone._id, { state: "pending", updatedAt: args.now });
    }
    return { promoted: due.length };
  },
});
