import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const providerValidator = v.union(v.literal("google_calendar"), v.literal("gmail"));

function computeContentHash(input: {
  title: string;
  description?: string;
  scheduledDate?: string;
  deadline?: string;
}) {
  return JSON.stringify(input);
}

async function getNextPosition(ctx: MutationCtx, scheduledDate?: string) {
  let tasksQuery = ctx.db.query("tasks");
  if (scheduledDate) {
    tasksQuery = tasksQuery.filter((q) =>
      q.and(
        q.eq(q.field("scheduledDate"), scheduledDate),
        q.eq(q.field("status"), "scheduled")
      )
    );
  } else {
    tasksQuery = tasksQuery.filter((q) => q.eq(q.field("status"), "inbox"));
  }

  const tasks = await tasksQuery.collect();
  const maxPosition = tasks.reduce((max: number, task: { position: number }) => {
    return Math.max(max, task.position);
  }, -1);
  return maxPosition + 1;
}

export const getIntegrationStatus = query({
  args: { provider: providerValidator },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();

    const lastRun = await ctx.db
      .query("syncRuns")
      .withIndex("by_provider_started_at", (q) => q.eq("provider", args.provider))
      .order("desc")
      .first();

    const pendingReviewCount = (
      await ctx.db
        .query("reviewQueue")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .collect()
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
    accessToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
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
    return await ctx.db.insert("syncRuns", {
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
    const existing = await ctx.db
      .query("syncCursors")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { cursor: args.cursor, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("syncCursors", {
      provider: args.provider,
      cursor: args.cursor,
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
    const existingPending = await ctx.db
      .query("reviewQueue")
      .withIndex("by_provider_external_id", (q) =>
        q.eq("provider", "gmail").eq("externalId", args.externalId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (existingPending) {
      return {
        reviewId: existingPending._id,
        deduplicated: true,
      };
    }

    const now = Date.now();
    const reviewId = await ctx.db.insert("reviewQueue", {
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
    const limit = args.limit ?? 100;
    if (args.status) {
      return await ctx.db
        .query("reviewQueue")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("reviewQueue").order("desc").take(limit);
  },
});

export const approveReviewItem = mutation({
  args: {
    reviewId: v.id("reviewQueue"),
    scheduledDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reviewItem = await ctx.db.get(args.reviewId);
    if (!reviewItem) {
      throw new Error("Review item not found");
    }
    if (reviewItem.status !== "pending") {
      throw new Error("Review item is not pending");
    }

    const effectiveScheduledDate = args.scheduledDate ?? reviewItem.scheduledDate;
    const position = await getNextPosition(ctx, effectiveScheduledDate);

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
      createdBy: "user",
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
    const reviewItem = await ctx.db.get(args.reviewId);
    if (!reviewItem) {
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
        .withIndex("by_provider_external_id", (q) =>
          q.eq("provider", "google_calendar").eq("externalId", event.externalId)
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
          await ctx.db.patch(mapping.taskId, {
            title: event.title,
            description: event.description,
            scheduledDate: event.scheduledDate,
            deadline: event.deadline,
            status: event.scheduledDate ? "scheduled" : "inbox",
            source: "gcal",
            updatedAt: now,
          });
        } else {
          const position = await getNextPosition(ctx, event.scheduledDate);
          const newTaskId = await ctx.db.insert("tasks", {
            title: event.title,
            description: event.description,
            type: event.deadline ? "deadline" : "open",
            scheduledDate: event.scheduledDate,
            deadline: event.deadline,
            position,
            status: event.scheduledDate ? "scheduled" : "inbox",
            source: "gcal",
            createdBy: "user",
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.patch(mapping._id, { taskId: newTaskId });
        }

        await ctx.db.patch(mapping._id, {
          externalUpdatedAt: event.externalUpdatedAt,
          contentHash,
          isDeleted: false,
          lastSyncedAt: now,
        });
        updatedCount += 1;
        continue;
      }

      const positionKey = event.scheduledDate ?? "__inbox__";
      const nextPosition =
        positionCache.get(positionKey) ??
        (await getNextPosition(ctx, event.scheduledDate));
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
        createdBy: "user",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("externalTaskMappings", {
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

    await ctx.db.patch(args.runId, {
      status: "success",
      importedCount,
      updatedCount,
      skippedCount,
      finishedAt: now,
    });

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
    return await ctx.db
      .query("syncCursors")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();
  },
});
