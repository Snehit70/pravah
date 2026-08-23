import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { requireTokenIdentifier } from "./authHelpers";
import {
  buildDeliveryUrl,
  buildUploadGrant,
  checkProviderAssetPresence,
  deleteProviderAsset,
  fetchProviderUsage,
  TASK_IMAGE_CANONICAL_CONVEX_SITE_URL,
  verifyProviderUploadMaster,
  type ProviderUploadResult,
  type TaskImageProviderConfig,
} from "./taskImageProvider";
import { shouldAttemptUsageRefresh } from "./taskImageBudget";
import type {
  TaskImageOperationalCategory,
  TaskImageOperationalCode,
} from "./taskImageOperationalValues";

const listDueCleanupTombstonesRef = makeFunctionReference<
  "query",
  { now: number; limit: number },
  Array<{
    _id: string;
    providerPublicId?: string;
  }>
>("taskImageCleanup:listDueCleanupTombstones");

const promoteDueCleanupRetriesRef = makeFunctionReference<
  "mutation",
  { now: number },
  { promoted: number }
>("taskImageCleanup:promoteDueCleanupRetries");

const recordCleanupResultRef = makeFunctionReference<
  "mutation",
  {
    tombstoneId: string;
    outcome: "deleted" | "absent" | "retry";
    failureCode?: string;
    now: number;
  },
  { accepted: boolean; terminal?: boolean; nextAttemptAt?: number }
>("taskImageCleanup:recordCleanupResult");

declare const process: { env: Record<string, string | undefined> };

const prepareUploadGrantRef = makeFunctionReference<
  "mutation",
  {
    ownerTokenIdentifier: string;
    uploadId: string;
    requestKey: string;
    candidatePublicId: string;
    issuedAt: number;
  },
  {
    uploadId: string;
    publicId: string;
    issuedAt: number;
    encodingClass: "jpeg" | "png";
    providerAttempt: number;
  }
>("taskImages:prepareUploadGrant");

type BudgetDecision = {
  grantsBlocked: boolean;
  warning: boolean;
  refreshRequired: boolean;
  usageTrusted: boolean;
};

const getUsageStateRef = makeFunctionReference<
  "query",
  { now: number },
  BudgetDecision & { snapshot: unknown }
>("taskImageBudget:getUsageState");

const recordUsageSnapshotRef = makeFunctionReference<
  "mutation",
  {
    pooledPercentage: number;
    transformations: number;
    storageBytes: number;
    bandwidthBytes: number;
    observedAt: number;
  },
  BudgetDecision
>("taskImageBudget:recordUsageSnapshot");

const recordUsageRefreshFailureRef = makeFunctionReference<
  "mutation",
  { attemptedAt: number },
  BudgetDecision
>("taskImageBudget:recordUsageRefreshFailure");

const recordOperationalEventRef = makeFunctionReference<
  "mutation",
  {
    category: TaskImageOperationalCategory;
    code: TaskImageOperationalCode;
    now: number;
  },
  { count: number }
>("taskImageOperations:recordOperationalEvent");

const getUploadVerificationContextRef = makeFunctionReference<
  "query",
  { ownerTokenIdentifier: string; uploadId: string },
  null | {
    uploadRecordId: string;
    taskImageId: string;
    publicId: string;
    encodingClass: "jpeg" | "png";
    state: string;
  }
>("taskImages:getUploadVerificationContext");

const getUploadAttemptContextRef = makeFunctionReference<
  "query",
  { ownerTokenIdentifier: string; uploadId: string },
  null | {
    uploadId: string;
    providerPublicId?: string;
    providerAttempt: number;
    state: string;
  }
>("taskImages:getUploadAttemptContext");

const resetUploadAttemptRef = makeFunctionReference<
  "mutation",
  { ownerTokenIdentifier: string; uploadId: string; providerAttempt: number },
  { reset: boolean }
>("taskImages:resetUploadAttempt");

type VerificationMutationArgs = {
  ownerTokenIdentifier: string;
  uploadId: string;
  publicId: string;
  version: number;
  result:
    | { status: "verifying"; master: { format: "jpg" | "png"; width: number; height: number; bytes: number } }
    | {
        status: "ready";
        master: { format: "jpg" | "png"; width: number; height: number; bytes: number };
        card: { format: "webp"; width: number; height: number; bytes: number };
        detail: { format: "webp"; width: number; height: number; bytes: number };
      }
    | { status: "failed"; failureCode: string };
};

const applyUploadVerificationRef = makeFunctionReference<
  "mutation",
  VerificationMutationArgs,
  { accepted: boolean; state?: "failed" | "verifying" | "ready" }
>("taskImages:applyUploadVerification");

const getDeliveryContextRef = makeFunctionReference<
  "query",
  { ownerTokenIdentifier: string; taskImageId: string },
  | { kind: "not_found" }
  | { kind: "state"; state: string; failure?: { code: string; retryable: boolean } }
  | { kind: "ready"; publicId: string; version: number }
>("taskImages:getDeliveryContext");

const providerVariantValidator = v.object({
  transformation: v.string(),
  format: v.string(),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
});

const providerResultArgs = {
  uploadId: v.string(),
  publicId: v.string(),
  version: v.number(),
  signature: v.string(),
  resourceType: v.string(),
  deliveryType: v.string(),
  format: v.string(),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
  eager: v.array(providerVariantValidator),
};

function readProviderConfig(): TaskImageProviderConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (
    !cloudName ||
    !apiKey ||
    !apiSecret ||
    siteUrl !== TASK_IMAGE_CANONICAL_CONVEX_SITE_URL
  ) {
    throw new Error("provider_unavailable");
  }
  return {
    cloudName,
    apiKey,
    apiSecret,
    callbackUrl: `${siteUrl.replace(/\/$/, "")}/cloudinary/task-image-callback`,
  };
}

function randomProviderPublicId() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const opaque = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `pravah-task-images/${opaque}`;
}

export const issueUploadGrant = action({
  args: { uploadId: v.string(), requestKey: v.string() },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const now = Date.now();
    let provider: TaskImageProviderConfig;
    try {
      provider = readProviderConfig();
    } catch (error) {
      try {
        await ctx.runMutation(recordOperationalEventRef, {
          category: "grant",
          code: "provider_unavailable",
          now,
        });
      } catch {
        // Aggregate diagnostics must never change the provider failure outcome.
      }
      throw error;
    }
    let budget = await ctx.runQuery(getUsageStateRef, { now });
    const lastRefreshAttemptAt =
      budget.snapshot && typeof budget.snapshot === "object" && "lastRefreshAttemptAt" in budget.snapshot
        ? (budget.snapshot as { lastRefreshAttemptAt?: unknown }).lastRefreshAttemptAt
        : undefined;
    if (
      budget.refreshRequired &&
      shouldAttemptUsageRefresh(typeof lastRefreshAttemptAt === "number" ? lastRefreshAttemptAt : undefined, now)
    ) {
      try {
        const usage = await fetchProviderUsage(provider);
        budget = {
          ...(await ctx.runMutation(recordUsageSnapshotRef, {
            ...usage,
            observedAt: now,
          })),
          snapshot: usage,
        };
      } catch {
        budget = {
          ...(await ctx.runMutation(recordUsageRefreshFailureRef, { attemptedAt: now })),
          snapshot: budget.snapshot,
        };
        try {
          await ctx.runMutation(recordOperationalEventRef, {
            category: "grant",
            code: "provider_usage_unavailable",
            now,
          });
        } catch {
          // Aggregate diagnostics must not weaken the fail-closed grant state.
        }
      }
    }
    if (budget.grantsBlocked) {
      try {
        await ctx.runMutation(recordOperationalEventRef, {
          category: "grant",
          code: "usage_blocked",
          now,
        });
      } catch {
        // Aggregate diagnostics must never change the blocked grant outcome.
      }
      throw new ConvexError({ code: "usage_blocked", retryable: true });
    }
    const prepared = await ctx.runMutation(prepareUploadGrantRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
      requestKey: args.requestKey,
      candidatePublicId: randomProviderPublicId(),
      issuedAt: Math.floor(now / 1000),
    });
    const grant = {
      ...(await buildUploadGrant({
        provider,
        publicId: prepared.publicId,
        timestamp: prepared.issuedAt,
        encodingClass: prepared.encodingClass,
      })),
      attempt: prepared.providerAttempt,
    };
    try {
      await ctx.runMutation(recordOperationalEventRef, {
        category: "grant",
        code: "success",
        now,
      });
    } catch {
      // Aggregate diagnostics must never change a successful grant outcome.
    }
    return grant;
  },
});

export const refreshProviderUsage = internalAction({
  args: {},
  handler: async (ctx) => {
    const attemptedAt = Date.now();
    let usage;
    try {
      usage = await fetchProviderUsage(readProviderConfig());
    } catch {
      const decision = await ctx.runMutation(recordUsageRefreshFailureRef, { attemptedAt });
      try {
        await ctx.runMutation(recordOperationalEventRef, {
          category: "grant",
          code: "provider_usage_unavailable",
          now: attemptedAt,
        });
      } catch {
        // Aggregate diagnostics must never weaken the fail-closed usage state.
      }
      return { status: "unavailable" as const, ...decision };
    }
    const decision = await ctx.runMutation(recordUsageSnapshotRef, {
      ...usage,
      observedAt: attemptedAt,
    });
    try {
      await ctx.runMutation(recordOperationalEventRef, {
        category: "grant",
        code: "usage_refresh_success",
        now: attemptedAt,
      });
    } catch {
      // The trusted snapshot remains authoritative if diagnostics are unavailable.
    }
    return { status: "updated" as const, ...decision };
  },
});

export const reconcileUploadAttempt = action({
  args: {
    uploadId: v.string(),
    attempt: v.number(),
    restartAttempt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const provider = readProviderConfig();
    const context = await ctx.runQuery(getUploadAttemptContextRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
    });
    if (!context) return { status: "absent" as const };
    if (context.state === "ready") return { status: "ready" as const };
    const providerAttempt = context.providerAttempt;
    if (!context.providerPublicId) return { status: "absent" as const, attempt: providerAttempt };

    const presence = await checkProviderAssetPresence({
      provider,
      publicId: context.providerPublicId,
    });
    if (presence === "unknown") return { status: "unknown" as const };
    if (presence === "present") {
      if (args.restartAttempt === true) {
        if (args.attempt !== providerAttempt) return { status: "unknown" as const };
        const cleanup = await deleteProviderAsset({
          provider,
          publicId: context.providerPublicId,
        });
        if (cleanup !== "deleted" && cleanup !== "absent") {
          return { status: "unknown" as const };
        }
        await ctx.runMutation(resetUploadAttemptRef, {
          ownerTokenIdentifier,
          uploadId: args.uploadId,
          providerAttempt,
        });
        return { status: "absent" as const, attempt: providerAttempt };
      }
      return {
        status: context.state === "verifying" ? ("verifying" as const) : ("uploading" as const),
        attempt: providerAttempt,
      };
    }
    await ctx.runMutation(resetUploadAttemptRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
      providerAttempt,
    });
    return { status: "absent" as const, attempt: providerAttempt };
  },
});

export const submitUploadResult = action({
  args: providerResultArgs,
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const provider = readProviderConfig();
    const context = await ctx.runQuery(getUploadVerificationContextRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
    });
    if (!context || context.publicId !== args.publicId) throw new Error("not_found");

    const response: ProviderUploadResult = args;
    const expected = {
      apiSecret: provider.apiSecret,
      expectedPublicId: context.publicId,
      expectedEncodingClass: context.encodingClass,
    };
    // Cloudinary's upload response signature authenticates public_id and version,
    // not client-forwarded eager metadata. Only the signed webhook may attest the
    // fixed variants and transition this upload to ready.
    const verified = await verifyProviderUploadMaster(response, expected);

    if (!verified.ok) {
      await ctx.runMutation(applyUploadVerificationRef, {
        ownerTokenIdentifier,
        uploadId: args.uploadId,
        publicId: args.publicId,
        version: args.version,
        result: { status: "failed", failureCode: verified.failureCode },
      });
      try {
        await ctx.runMutation(recordOperationalEventRef, {
          category: "verification",
          code: verified.failureCode,
          now: Date.now(),
        });
      } catch {
        // The committed verification failure must still reach the client.
      }
      return { state: "failed" as const, failure: { code: verified.failureCode } };
    }

    await ctx.runMutation(applyUploadVerificationRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
      publicId: args.publicId,
      version: verified.version,
      result: { status: "verifying", master: verified.master },
    });
    return { state: "verifying" as const };
  },
});

export const resolveTaskImage = action({
  args: {
    taskImageId: v.id("taskImages"),
    variant: v.union(v.literal("card"), v.literal("detail")),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const context = await ctx.runQuery(getDeliveryContextRef, {
      ownerTokenIdentifier,
      taskImageId: args.taskImageId,
    });
    if (context.kind !== "ready") return context;
    const now = Date.now();
    let result: { kind: "ready"; url: string };
    try {
      const provider = readProviderConfig();
      result = {
        kind: "ready" as const,
        url: await buildDeliveryUrl({
          cloudName: provider.cloudName,
          apiSecret: provider.apiSecret,
          publicId: context.publicId,
          version: context.version,
          variant: args.variant,
        }),
      };
    } catch (error) {
      try {
        await ctx.runMutation(recordOperationalEventRef, {
          category: "resolution",
          code: "provider_unavailable",
          now,
        });
      } catch {
        // Preserve the provider operation's original failure.
      }
      throw error;
    }
    try {
      await ctx.runMutation(recordOperationalEventRef, {
        category: "resolution",
        code: "success",
        now,
      });
    } catch {
      // Delivery remains successful when aggregate diagnostics are unavailable.
    }
    return result;
  },
});

const failStaleVerifyingUploadsRef = makeFunctionReference<
  "mutation",
  { olderThanMs?: number; now?: number },
  { failed: number }
>("taskImages:failStaleVerifyingUploads");

export const reconcileCleanup = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    await ctx.runMutation(promoteDueCleanupRetriesRef, { now });
    await ctx.runMutation(failStaleVerifyingUploadsRef, {
      now,
      olderThanMs: 10 * 60 * 1000,
    });
    const tombstones = await ctx.runQuery(listDueCleanupTombstonesRef, { now, limit: 50 });
    let terminal = 0;
    let retried = 0;
    let providerUnavailable = false;
    let nextAttemptAt: number | undefined;
    let provider: TaskImageProviderConfig | undefined;
    try {
      provider = readProviderConfig();
    } catch {
      provider = undefined;
    }
    for (const tombstone of tombstones) {
      if (!provider && tombstone.providerPublicId) {
        providerUnavailable = true;
        nextAttemptAt = Math.min(nextAttemptAt ?? Infinity, now + 30 * 60 * 1000);
        continue;
      }
      try {
        const outcome = !tombstone.providerPublicId
          ? "absent" as const
          : await deleteProviderAsset({ provider: provider!, publicId: tombstone.providerPublicId });
        const result = await ctx.runMutation(recordCleanupResultRef, {
          tombstoneId: tombstone._id,
          outcome,
          failureCode: outcome === "retry" ? "provider_ambiguous" : undefined,
          now,
        });
        if (outcome === "retry") retried += 1;
        else terminal += 1;
        try {
          await ctx.runMutation(recordOperationalEventRef, {
            category: "cleanup",
            code: outcome === "retry" ? "provider_ambiguous" : "success",
            now,
          });
        } catch {
          // Cleanup state and retry scheduling remain authoritative.
        }
        if (result.nextAttemptAt !== undefined) {
          nextAttemptAt = Math.min(nextAttemptAt ?? Infinity, result.nextAttemptAt);
        }
      } catch {
        retried += 1;
        try {
          await ctx.runMutation(recordOperationalEventRef, {
            category: "cleanup",
            code: "provider_ambiguous",
            now,
          });
        } catch {
          // Cleanup state and retry scheduling remain authoritative.
        }
        nextAttemptAt = Math.min(nextAttemptAt ?? Infinity, now + 5 * 60 * 1000);
      }
    }
    if (providerUnavailable) {
      try {
        await ctx.runMutation(recordOperationalEventRef, {
          category: "cleanup",
          code: "provider_unavailable",
          now,
        });
      } catch {
        // Provider outage retries must not depend on aggregate diagnostics.
      }
    }
    if (!providerUnavailable && tombstones.length === 50) {
      await ctx.scheduler.runAfter(0, internal.taskImageActions.reconcileCleanup, {});
    }
    if (nextAttemptAt !== undefined) {
      await ctx.scheduler.runAfter(
        Math.max(0, nextAttemptAt - now),
        internal.taskImageActions.reconcileCleanup,
        {}
      );
    }
    return { inspected: tombstones.length, terminal, retried, providerUnavailable };
  },
});
