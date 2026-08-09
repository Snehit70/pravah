export const TASK_IMAGE_USAGE_WARNING_PERCENT = 70;
export const TASK_IMAGE_USAGE_BLOCK_PERCENT = 85;
export const TASK_IMAGE_USAGE_RESUME_PERCENT = 75;
export const TASK_IMAGE_USAGE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const TASK_IMAGE_USAGE_MAX_SAFE_AGE_MS = 24 * 60 * 60 * 1000;

export type TaskImageBudgetDecision = {
  grantsBlocked: boolean;
  warning: boolean;
  refreshRequired: boolean;
  usageTrusted: boolean;
};

export function evaluateTaskImageBudget({
  pooledPercentage,
  wasBlocked,
  observedAt,
  now,
}: {
  pooledPercentage?: number;
  wasBlocked: boolean;
  observedAt?: number;
  now?: number;
}): TaskImageBudgetDecision {
  const hasSnapshot =
    pooledPercentage !== undefined &&
    Number.isFinite(pooledPercentage) &&
    pooledPercentage >= 0 &&
    observedAt !== undefined;
  const age = hasSnapshot && now !== undefined ? Math.max(0, now - observedAt) : 0;
  const refreshRequired = !hasSnapshot || (now !== undefined && age >= TASK_IMAGE_USAGE_REFRESH_INTERVAL_MS);
  const usageTrusted = hasSnapshot && (now === undefined || age <= TASK_IMAGE_USAGE_MAX_SAFE_AGE_MS);
  const warning = hasSnapshot && pooledPercentage >= TASK_IMAGE_USAGE_WARNING_PERCENT;

  let thresholdBlocked = true;
  if (hasSnapshot) {
    thresholdBlocked = wasBlocked
      ? pooledPercentage >= TASK_IMAGE_USAGE_RESUME_PERCENT
      : pooledPercentage >= TASK_IMAGE_USAGE_BLOCK_PERCENT;
  }

  return {
    grantsBlocked: !usageTrusted || thresholdBlocked || (wasBlocked && refreshRequired),
    warning,
    refreshRequired,
    usageTrusted,
  };
}

async function findProviderState(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("taskImageProviderState")
    .withIndex("by_key", (q) => q.eq("key", "cloudinary"))
    .unique();
}

function decisionForState(
  state: Doc<"taskImageProviderState"> | null,
  now: number
) {
  return evaluateTaskImageBudget({
    pooledPercentage: state?.pooledPercentage,
    wasBlocked: state?.grantsBlocked ?? false,
    observedAt: state?.usageObservedAt,
    now,
  });
}

export const getUsageState = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const state = await findProviderState(ctx);
    return { ...decisionForState(state, args.now), snapshot: state };
  },
});

const usageSnapshotArgs = {
  pooledPercentage: v.number(),
  transformations: v.number(),
  storageBytes: v.number(),
  bandwidthBytes: v.number(),
  observedAt: v.number(),
};

export const recordUsageSnapshot = internalMutation({
  args: usageSnapshotArgs,
  handler: async (ctx, args) => {
    const existing = await findProviderState(ctx);
    const decision = evaluateTaskImageBudget({
      pooledPercentage: args.pooledPercentage,
      wasBlocked: existing?.grantsBlocked ?? false,
      observedAt: args.observedAt,
      now: args.observedAt,
    });
    const value = {
      key: "cloudinary" as const,
      pooledPercentage: args.pooledPercentage,
      transformations: args.transformations,
      storageBytes: args.storageBytes,
      bandwidthBytes: args.bandwidthBytes,
      usageObservedAt: args.observedAt,
      grantsBlocked: decision.grantsBlocked,
      lastRefreshAttemptAt: args.observedAt,
      lastRefreshSucceededAt: args.observedAt,
      lastRefreshFailureCode: undefined,
      updatedAt: args.observedAt,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("taskImageProviderState", value);
    return decision;
  },
});

export const recordUsageRefreshFailure = internalMutation({
  args: { attemptedAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await findProviderState(ctx);
    const decision = decisionForState(existing, args.attemptedAt);
    const value = {
      key: "cloudinary" as const,
      grantsBlocked: decision.grantsBlocked,
      lastRefreshAttemptAt: args.attemptedAt,
      lastRefreshFailureCode: "provider_usage_unavailable" as const,
      updatedAt: args.attemptedAt,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("taskImageProviderState", value);
    return decision;
  },
});

export const getOwnerBudgetStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireTokenIdentifier(ctx);
    const state = await findProviderState(ctx);
    if (!state?.usageObservedAt || state.pooledPercentage === undefined) {
      return {
        status: "unavailable" as const,
        warning: false,
        grantsBlocked: true,
        usage: null,
      };
    }
    const decision = decisionForState(state, Date.now());
    return {
      status: !decision.usageTrusted
        ? ("unavailable" as const)
        : decision.grantsBlocked
          ? ("blocked" as const)
          : decision.warning
            ? ("warning" as const)
            : ("normal" as const),
      warning: decision.warning,
      grantsBlocked: decision.grantsBlocked,
      usage: {
        pooledPercentage: state.pooledPercentage,
        transformations: state.transformations,
        storageBytes: state.storageBytes,
        bandwidthBytes: state.bandwidthBytes,
        observedAt: state.usageObservedAt,
      },
    };
  },
});
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";
