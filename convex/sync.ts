import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireTokenIdentifier } from "./authHelpers";

const providerValidator = v.union(v.literal("google_calendar"), v.literal("gmail"));

function computeContentHash(input: {
  title: string;
  description?: string;
  scheduledDate?: string;
  deadline?: string;
}) {
  return [
    input.title,
    input.description ?? "",
    input.scheduledDate ?? "",
    input.deadline ?? "",
  ].join("|");
}

async function getNextPosition(
  ctx: MutationCtx,
  tokenIdentifier: string,
  scheduledDate?: string
) {
  const latestTask = scheduledDate
    ? await ctx.db
        .query("tasks")
        .withIndex("by_owner_status_date_position", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier)
            .eq("status", "scheduled")
            .eq("scheduledDate", scheduledDate)
        )
        .order("desc")
        .first()
    : await ctx.db
        .query("tasks")
        .withIndex("by_owner_status_position", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "inbox")
        )
        .order("desc")
        .first();

  return (latestTask?.position ?? -1) + 1;
}

export const getIntegrationStatus = query({
  args: { provider: providerValidator },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("provider", args.provider)
      )
      .first();

    const lastRun = await ctx.db
      .query("syncRuns")
      .withIndex("by_owner_provider_started_at", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("provider", args.provider)
      )
      .order("desc")
      .first();

    const pendingReviewItems = (
      await ctx.db
        .query("reviewQueue")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "pending")
        )
        .collect()
    );
    const pendingReviewCount = pendingReviewItems.filter(
      (item) => item.provider === args.provider
    ).length;

    return {
      integration,
      lastRun,
      pendingReviewCount,
    };
  },
});

export const upsertIntegration = mutation({
  args: {
    provider: providerValidator,
    status: v.union(v.literal("connected"), v.literal("disconnected"), v.literal("error")),
    syncEnabled: v.boolean(),
    accountEmail: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("provider", args.provider)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("integrations", {
      ...args,
      ownerTokenIdentifier: tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const startSyncRun = mutation({
  args: {
    provider: providerValidator,
    direction: v.union(v.literal("import")),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    return await ctx.db.insert("syncRuns", {
      ownerTokenIdentifier: tokenIdentifier,
      provider: args.provider,
      direction: args.direction,
      status: "running",
      startedAt: Date.now(),
      importedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
    });
  },
});

export const completeSyncRun = mutation({
  args: {
    runId: v.id("syncRuns"),
    status: v.union(v.literal("success"), v.literal("failed")),
    importedCount: v.number(),
    updatedCount: v.number(),
    skippedCount: v.number(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerTokenIdentifier !== tokenIdentifier) {
      throw new Error("Sync run not found");
    }
    await ctx.db.patch(args.runId, {
      status: args.status,
      importedCount: args.importedCount,
      updatedCount: args.updatedCount,
      skippedCount: args.skippedCount,
      errorMessage: args.errorMessage,
      finishedAt: Date.now(),
    });
  },
});

export const updateSyncCursor = mutation({
  args: {
    provider: providerValidator,
    cursor: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const existing = await ctx.db
      .query("syncCursors")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("provider", args.provider)
      )
      .first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { cursor: args.cursor, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("syncCursors", {
      provider: args.provider,
      cursor: args.cursor,
      ownerTokenIdentifier: tokenIdentifier,
      updatedAt: now,
    });
  },
});

export const enqueueGmailCandidate = mutation({
  args: {
    externalId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    payloadJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const existingItem = await ctx.db
      .query("reviewQueue")
      .withIndex("by_owner_provider_external_id", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier)
          .eq("provider", "gmail")
          .eq("externalId", args.externalId)
      )
      .first();

    if (existingItem) {
      return {
        reviewId: existingItem._id,
        deduplicated: true,
      };
    }

    const now = Date.now();
    const reviewId = await ctx.db.insert("reviewQueue", {
      ownerTokenIdentifier: tokenIdentifier,
      provider: "gmail",
      sourceType: "gmail_candidate",
      externalId: args.externalId,
      title: args.title,
      description: args.description,
      deadline: args.deadline,
      estimatedMinutes: args.estimatedMinutes,
      tags: args.tags,
      status: "pending",
      payloadJson: args.payloadJson,
      createdAt: now,
      updatedAt: now,
    });

    return { reviewId, deduplicated: false };
  },
});

export const listReviewQueue = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const limit = args.limit ?? 100;
    if (args.status) {
      return await ctx.db
        .query("reviewQueue")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", args.status!)
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("reviewQueue")
      .filter((q) => q.eq(q.field("ownerTokenIdentifier"), tokenIdentifier))
      .order("desc")
      .take(limit);
  },
});

export const approveReviewItem = mutation({
  args: {
    reviewId: v.id("reviewQueue"),
    scheduledDate: v.optional(v.string()),
    // When true, force the approved task into the Inbox even if the review
    // item carries a suggested scheduledDate. Without this, an omitted
    // `scheduledDate` falls back to the suggested one, which makes an
    // "Inbox" override on the client unrepresentable.
    clearScheduledDate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const reviewItem = await ctx.db.get(args.reviewId);
    if (!reviewItem || reviewItem.ownerTokenIdentifier !== tokenIdentifier) {
      throw new Error("Review item not found");
    }
    if (reviewItem.status !== "pending") {
      throw new Error("Review item is not pending");
    }

    const effectiveScheduledDate = args.clearScheduledDate
      ? undefined
      : (args.scheduledDate ?? reviewItem.scheduledDate);
    if (reviewItem.deadline && effectiveScheduledDate && effectiveScheduledDate > reviewItem.deadline) {
      throw new Error("Cannot schedule task past its deadline");
    }
    const position = await getNextPosition(ctx, tokenIdentifier, effectiveScheduledDate);

    const now = Date.now();
    const taskId = await ctx.db.insert("tasks", {
      title: reviewItem.title,
      description: reviewItem.description,
      type: reviewItem.deadline ? "deadline" : "open",
      scheduledDate: effectiveScheduledDate,
      deadline: reviewItem.deadline,
      position,
      status: effectiveScheduledDate ? "scheduled" : "inbox",
      source: reviewItem.provider === "gmail" ? "gmail" : "gcal",
      estimatedMinutes: reviewItem.estimatedMinutes,
      tags: reviewItem.tags,
      createdBy: tokenIdentifier,
      ownerTokenIdentifier: tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.reviewId, {
      status: "approved",
      reviewedAt: now,
      updatedAt: now,
    });

    return { taskId };
  },
});

export const rejectReviewItem = mutation({
  args: {
    reviewId: v.id("reviewQueue"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const reviewItem = await ctx.db.get(args.reviewId);
    if (!reviewItem || reviewItem.ownerTokenIdentifier !== tokenIdentifier) {
      throw new Error("Review item not found");
    }
    if (reviewItem.status !== "pending") {
      throw new Error("Review item is not pending");
    }

    const now = Date.now();
    await ctx.db.patch(args.reviewId, {
      status: "rejected",
      rejectionReason: args.reason,
      reviewedAt: now,
      updatedAt: now,
    });
  },
});

export const importGoogleCalendarEvents = mutation({
  args: {
    runId: v.id("syncRuns"),
    events: v.array(
      v.object({
        externalId: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        scheduledDate: v.optional(v.string()),
        deadline: v.optional(v.string()),
        externalUpdatedAt: v.optional(v.string()),
        cancelled: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const now = Date.now();
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let maxUpdatedAt: string | undefined;
    const positionCache = new Map<string, number>();

    for (const event of args.events) {
      if (event.externalUpdatedAt && (!maxUpdatedAt || event.externalUpdatedAt > maxUpdatedAt)) {
        maxUpdatedAt = event.externalUpdatedAt;
      }

      const mapping = await ctx.db
        .query("externalTaskMappings")
        .withIndex("by_owner_provider_external_id", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier)
            .eq("provider", "google_calendar")
            .eq("externalId", event.externalId)
        )
        .first();

      if (event.cancelled) {
        if (!mapping) {
          skippedCount += 1;
          continue;
        }

        await ctx.db.patch(mapping.taskId, {
          status: "cancelled",
          updatedAt: now,
        });
        await ctx.db.patch(mapping._id, {
          isDeleted: true,
          externalUpdatedAt: event.externalUpdatedAt,
          lastSyncedAt: now,
        });
        updatedCount += 1;
        continue;
      }

      const contentHash = computeContentHash({
        title: event.title,
        description: event.description,
        scheduledDate: event.scheduledDate,
        deadline: event.deadline,
      });

      if (mapping) {
        const mappedTask = await ctx.db.get(mapping.taskId);
        if (mappedTask) {
          const isContentChanged = mapping.contentHash !== contentHash || mapping.isDeleted;
          if (isContentChanged) {
            const nextStatus = event.scheduledDate ? "scheduled" : "inbox";
            const laneChanged =
              mappedTask.status !== nextStatus ||
              mappedTask.scheduledDate !== event.scheduledDate;
            const nextPosition = laneChanged
              ? await getNextPosition(ctx, tokenIdentifier, event.scheduledDate)
              : mappedTask.position;

            await ctx.db.patch(mapping.taskId, {
              title: event.title,
              description: event.description,
              scheduledDate: event.scheduledDate,
              deadline: event.deadline,
              status: nextStatus,
              position: nextPosition,
              source: "gcal",
              updatedAt: now,
            });
            updatedCount += 1;
          } else {
            skippedCount += 1;
          }
        } else {
          const position = await getNextPosition(ctx, tokenIdentifier, event.scheduledDate);
          const newTaskId = await ctx.db.insert("tasks", {
            title: event.title,
            description: event.description,
            type: event.deadline ? "deadline" : "open",
            scheduledDate: event.scheduledDate,
            deadline: event.deadline,
            position,
            status: event.scheduledDate ? "scheduled" : "inbox",
            source: "gcal",
            createdBy: tokenIdentifier,
            ownerTokenIdentifier: tokenIdentifier,
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.patch(mapping._id, { taskId: newTaskId });
          updatedCount += 1;
        }

        await ctx.db.patch(mapping._id, {
          externalUpdatedAt: event.externalUpdatedAt,
          contentHash,
          isDeleted: false,
          lastSyncedAt: now,
        });
        continue;
      }

      const positionKey = event.scheduledDate ?? "__inbox__";
      const nextPosition =
        positionCache.get(positionKey) ??
        (await getNextPosition(ctx, tokenIdentifier, event.scheduledDate));
      positionCache.set(positionKey, nextPosition + 1);

      const taskId = await ctx.db.insert("tasks", {
        title: event.title,
        description: event.description,
        type: event.deadline ? "deadline" : "open",
        scheduledDate: event.scheduledDate,
        deadline: event.deadline,
        position: nextPosition,
        status: event.scheduledDate ? "scheduled" : "inbox",
        source: "gcal",
        createdBy: tokenIdentifier,
        ownerTokenIdentifier: tokenIdentifier,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("externalTaskMappings", {
        ownerTokenIdentifier: tokenIdentifier,
        provider: "google_calendar",
        externalId: event.externalId,
        taskId,
        externalUpdatedAt: event.externalUpdatedAt,
        contentHash,
        isDeleted: false,
        lastSyncedAt: now,
      });
      importedCount += 1;
    }

    return {
      importedCount,
      updatedCount,
      skippedCount,
      maxUpdatedAt,
    };
  },
});

export const getCursor = query({
  args: { provider: providerValidator },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    return await ctx.db
      .query("syncCursors")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("provider", args.provider)
      )
      .first();
  },
});
