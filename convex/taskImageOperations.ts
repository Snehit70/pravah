import { internalMutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";
import { TASK_IMAGE_USAGE_WARNING_PERCENT } from "./taskImageBudget";

const operationalCategoryValidator = v.union(
  v.literal("grant"),
  v.literal("verification"),
  v.literal("resolution"),
  v.literal("cleanup"),
  v.literal("normalization"),
  v.literal("resource")
);
const operationalCodeValidator = v.union(
  v.literal("success"),
  v.literal("usage_blocked"),
  v.literal("provider_unavailable"),
  v.literal("provider_usage_unavailable"),
  v.literal("provider_ambiguous"),
  v.literal("normalization_failed"),
  v.literal("master_too_large"),
  v.literal("variant_too_large"),
  v.literal("unsupported_format"),
  v.literal("animated_image"),
  v.literal("source_too_large"),
  v.literal("dimensions_too_large"),
  v.literal("aspect_ratio_unsupported"),
  v.literal("clipboard_too_large"),
  v.literal("storage_unavailable"),
  v.literal("memory_unavailable"),
  v.literal("source_unavailable"),
  v.literal("authorization_failed"),
  v.literal("network_error"),
  v.literal("upload_failed")
);

export type TaskImageOperationalCategory =
  | "grant"
  | "verification"
  | "resolution"
  | "cleanup"
  | "normalization"
  | "resource";
export type TaskImageOperationalCode =
  | "success"
  | "usage_blocked"
  | "provider_unavailable"
  | "provider_usage_unavailable"
  | "provider_ambiguous"
  | "normalization_failed"
  | "master_too_large"
  | "variant_too_large"
  | "unsupported_format"
  | "animated_image"
  | "source_too_large"
  | "dimensions_too_large"
  | "aspect_ratio_unsupported"
  | "clipboard_too_large"
  | "storage_unavailable"
  | "memory_unavailable"
  | "source_unavailable"
  | "authorization_failed"
  | "network_error"
  | "upload_failed";

const SAFE_FAILURE_CODES = new Set<TaskImageOperationalCode>([
  "normalization_failed",
  "master_too_large",
  "variant_too_large",
  "unsupported_format",
  "animated_image",
  "source_too_large",
  "dimensions_too_large",
  "aspect_ratio_unsupported",
  "clipboard_too_large",
  "storage_unavailable",
  "memory_unavailable",
  "source_unavailable",
  "authorization_failed",
  "network_error",
  "upload_failed",
]);

export async function incrementOperationalCounter(
  ctx: MutationCtx,
  category: TaskImageOperationalCategory,
  code: TaskImageOperationalCode,
  now = Date.now()
) {
  const key = `${category}:${code}`;
  const existing = await ctx.db
    .query("taskImageOperationalCounters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const count = (existing?.count ?? 0) + 1;
  if (existing) await ctx.db.patch(existing._id, { count, updatedAt: now });
  else {
    await ctx.db.insert("taskImageOperationalCounters", {
      key,
      category,
      code,
      count,
      updatedAt: now,
    });
  }
  return { count };
}

export const recordOperationalEvent = internalMutation({
  args: {
    category: operationalCategoryValidator,
    code: operationalCodeValidator,
    now: v.number(),
  },
  handler: (ctx, args) => incrementOperationalCounter(ctx, args.category, args.code, args.now),
});

async function ownerRows(ctx: QueryCtx, ownerTokenIdentifier: string) {
  return await Promise.all([
    ctx.db
      .query("taskImageUploads")
      .withIndex("by_owner_state", (q) => q.eq("ownerTokenIdentifier", ownerTokenIdentifier))
      .collect(),
    ctx.db
      .query("taskImageCleanupTombstones")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", ownerTokenIdentifier))
      .collect(),
  ]);
}

export const getOperationalDiagnostics = query({
  args: {},
  handler: async (ctx) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const [providerState, [uploads, cleanup], counters] = await Promise.all([
      ctx.db
        .query("taskImageProviderState")
        .withIndex("by_key", (q) => q.eq("key", "cloudinary"))
        .unique(),
      ownerRows(ctx, ownerTokenIdentifier),
      ctx.db.query("taskImageOperationalCounters").collect(),
    ]);
    const uploadStates: Record<string, number> = {};
    const failures: Record<string, number> = {};
    let orphanedAttempts = 0;
    for (const upload of uploads) {
      uploadStates[upload.state] = (uploadStates[upload.state] ?? 0) + 1;
      if (upload.providerPublicId && !upload.taskImageId) orphanedAttempts += 1;
      if (upload.safeFailureCode) {
        const failureCode = SAFE_FAILURE_CODES.has(upload.safeFailureCode as TaskImageOperationalCode)
          ? upload.safeFailureCode
          : "normalization_failed";
        failures[failureCode] = (failures[failureCode] ?? 0) + 1;
      }
    }
    const pooledPercentage = providerState?.pooledPercentage;
    return {
      usage:
        providerState && pooledPercentage !== undefined
          ? {
              pooledPercentage,
              transformations: providerState.transformations,
              storageBytes: providerState.storageBytes,
              bandwidthBytes: providerState.bandwidthBytes,
              observedAt: providerState.usageObservedAt,
            }
          : null,
      grants: {
        blocked: providerState?.grantsBlocked ?? true,
        warning:
          pooledPercentage !== undefined &&
          pooledPercentage >= TASK_IMAGE_USAGE_WARNING_PERCENT,
      },
      uploads: uploadStates,
      failures,
      backlog: { orphanedAttempts, cleanup: cleanup.length },
      events: counters.map(({ category, code, count }) => ({ category, code, count })),
    };
  },
});
