import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal("open"), v.literal("deadline")),
    scheduledDate: v.optional(v.string()),
    deadline: v.optional(v.string()),
    position: v.number(),
    status: v.union(
      v.literal("inbox"),
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    source: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("ai-agent"),
        v.literal("gmail"),
        v.literal("gcal")
      )
    ),
    estimatedMinutes: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    priority: v.optional(v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"))),
    createdBy: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Set when a task is soft-deleted (status="cancelled"). A scheduled
     *  cron purges these after a 30-minute grace window so the user can undo.
     *  Older cancelled rows from before this column exists will be missing
     *  this field — the purger ignores them. */
    cancelledAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerTokenIdentifier"])
    .index("by_status", ["status"])
    .index("by_scheduled_date", ["scheduledDate"])
    .index("by_status_and_date", ["status", "scheduledDate"])
    .index("by_status_position", ["status", "position"])
    .index("by_status_date_position", ["status", "scheduledDate", "position"])
    .index("by_owner_status", ["ownerTokenIdentifier", "status"])
    .index("by_owner_status_date", ["ownerTokenIdentifier", "status", "scheduledDate"])
    .index("by_owner_status_date_position", ["ownerTokenIdentifier", "status", "scheduledDate", "position"])
    .index("by_owner_status_position", ["ownerTokenIdentifier", "status", "position"]),
  integrations: defineTable({
    provider: v.union(v.literal("google_calendar"), v.literal("gmail")),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error")
    ),
    syncEnabled: v.boolean(),
    accountEmail: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    ownerTokenIdentifier: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_owner_provider", ["ownerTokenIdentifier", "provider"]),
  syncCursors: defineTable({
    provider: v.union(v.literal("google_calendar"), v.literal("gmail")),
    cursor: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_owner_provider", ["ownerTokenIdentifier", "provider"]),
  externalTaskMappings: defineTable({
    provider: v.union(v.literal("google_calendar"), v.literal("gmail")),
    externalId: v.string(),
    taskId: v.id("tasks"),
    externalUpdatedAt: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    isDeleted: v.boolean(),
    ownerTokenIdentifier: v.optional(v.string()),
    lastSyncedAt: v.number(),
  })
    .index("by_provider_external_id", ["provider", "externalId"])
    .index("by_task_id", ["taskId"])
    .index("by_owner_provider_external_id", ["ownerTokenIdentifier", "provider", "externalId"]),
  reviewQueue: defineTable({
    provider: v.union(v.literal("gmail"), v.literal("google_calendar")),
    sourceType: v.union(v.literal("gmail_candidate")),
    externalId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    deadline: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    rejectionReason: v.optional(v.string()),
    payloadJson: v.optional(v.string()),
    ownerTokenIdentifier: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_provider_external_id", ["provider", "externalId"])
    .index("by_owner_status", ["ownerTokenIdentifier", "status"])
    .index("by_owner_provider_external_id", ["ownerTokenIdentifier", "provider", "externalId"]),
  syncRuns: defineTable({
    provider: v.union(v.literal("google_calendar"), v.literal("gmail")),
    direction: v.union(v.literal("import")),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failed")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    importedCount: v.number(),
    updatedCount: v.number(),
    skippedCount: v.number(),
    errorMessage: v.optional(v.string()),
    ownerTokenIdentifier: v.optional(v.string()),
  })
    .index("by_provider_started_at", ["provider", "startedAt"])
    .index("by_status", ["status"])
    .index("by_owner_provider_started_at", ["ownerTokenIdentifier", "provider", "startedAt"])
    .index("by_owner_status", ["ownerTokenIdentifier", "status"]),
});
