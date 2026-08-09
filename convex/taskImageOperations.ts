import { internalMutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";
import { TASK_IMAGE_USAGE_WARNING_PERCENT } from "./taskImageBudget";
import {
  TASK_IMAGE_SAFE_FAILURE_CODES,
  taskImageOperationalCategoryValidator,
  taskImageOperationalCodeValidator,
  type TaskImageOperationalCategory,
  type TaskImageOperationalCode,
} from "./taskImageOperationalValues";

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
    category: taskImageOperationalCategoryValidator,
    code: taskImageOperationalCodeValidator,
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
        const failureCode = TASK_IMAGE_SAFE_FAILURE_CODES.has(upload.safeFailureCode as TaskImageOperationalCode)
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
