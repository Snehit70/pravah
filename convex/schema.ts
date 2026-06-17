import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { automationScopeValidator } from "./automationScopes";

export default defineSchema({
  goals: defineTable({
    clientId: v.string(),
    text: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"))),
    ownerTokenIdentifier: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerTokenIdentifier"])
    .index("by_owner_client_id", ["ownerTokenIdentifier", "clientId"]),
  goalLinks: defineTable({
    taskId: v.string(),
    goalClientId: v.string(),
    ownerTokenIdentifier: v.string(),
  })
    .index("by_owner", ["ownerTokenIdentifier"])
    .index("by_owner_task", ["ownerTokenIdentifier", "taskId"])
    .index("by_owner_goal", ["ownerTokenIdentifier", "goalClientId"]),
  overdueReflowOperations: defineTable({
    ownerTokenIdentifier: v.string(),
    operationId: v.string(),
    status: v.union(v.literal("applied"), v.literal("undone")),
    appliedAt: v.number(),
    undoneAt: v.optional(v.number()),
    taskBefore: v.array(
      v.object({
        taskId: v.id("tasks"),
        scheduledDate: v.string(),
        position: v.number(),
      })
    ),
    taskAfter: v.array(
      v.object({
        taskId: v.id("tasks"),
        scheduledDate: v.string(),
        position: v.number(),
      })
    ),
    goalBefore: v.array(
      v.object({
        goalClientId: v.string(),
        deadline: v.optional(v.string()),
      })
    ),
    goalAfter: v.array(
      v.object({
        goalClientId: v.string(),
        deadline: v.optional(v.string()),
      })
    ),
    dateStatesBefore: v.array(
      v.object({
        date: v.string(),
        entries: v.array(
          v.object({
            taskId: v.id("tasks"),
            position: v.number(),
          })
        ),
      })
    ),
    dateStatesAfter: v.array(
      v.object({
        date: v.string(),
        entries: v.array(
          v.object({
            taskId: v.id("tasks"),
            position: v.number(),
          })
        ),
      })
    ),
  })
    .index("by_owner_operation_id", ["ownerTokenIdentifier", "operationId"])
    .index("by_owner_applied_at", ["ownerTokenIdentifier", "appliedAt"]),
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),
  automationCredentials: defineTable({
    ownerTokenIdentifier: v.string(),
    label: v.string(),
    credentialHash: v.string(),
    credentialPreview: v.string(),
    scopes: v.array(automationScopeValidator),
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerTokenIdentifier"])
    .index("by_owner_label", ["ownerTokenIdentifier", "label"])
    .index("by_owner_status", ["ownerTokenIdentifier", "status"])
    .index("by_credential_hash", ["credentialHash"]),
  automationBootstrapTokens: defineTable({
    ownerTokenIdentifier: v.string(),
    label: v.string(),
    tokenHash: v.string(),
    scopes: v.array(automationScopeValidator),
    status: v.union(v.literal("active"), v.literal("used"), v.literal("expired"), v.literal("revoked")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    usedAt: v.optional(v.number()),
    exchangedCredentialId: v.optional(v.id("automationCredentials")),
    revokedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerTokenIdentifier"])
    .index("by_owner_status", ["ownerTokenIdentifier", "status"])
    .index("by_token_hash", ["tokenHash"]),
  automationAuditEvents: defineTable({
    ownerTokenIdentifier: v.string(),
    credentialId: v.optional(v.id("automationCredentials")),
    bootstrapTokenId: v.optional(v.id("automationBootstrapTokens")),
    eventType: v.union(
      v.literal("bootstrap_issued"),
      v.literal("bootstrap_exchanged"),
      v.literal("credential_revoked"),
      v.literal("credential_used")
    ),
    metadataJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner_created_at", ["ownerTokenIdentifier", "createdAt"])
    .index("by_credential_created_at", ["credentialId", "createdAt"]),
  automationIdempotencyKeys: defineTable({
    ownerTokenIdentifier: v.string(),
    key: v.string(),
    operation: v.string(),
    requestJson: v.string(),
    responseJson: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_owner_key", ["ownerTokenIdentifier", "key"])
    .index("by_expires_at", ["expiresAt"]),
  automationOperations: defineTable({
    ownerTokenIdentifier: v.string(),
    operationId: v.string(),
    operationGroupId: v.optional(v.string()),
    operation: v.string(),
    status: v.union(v.literal("applied"), v.literal("undone")),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    beforeJson: v.string(),
    afterJson: v.string(),
    undoExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    undoneAt: v.optional(v.number()),
  })
    .index("by_owner_operation_id", ["ownerTokenIdentifier", "operationId"])
    .index("by_owner_created_at", ["ownerTokenIdentifier", "createdAt"])
    .index("by_owner_group_created_at", ["ownerTokenIdentifier", "operationGroupId", "createdAt"]),
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    // Legacy fields are cleared for native tasks during the deadline-model cutover.
    // Gmail/Calendar integration tasks may still retain them until those
    // integrations move to the same canonical deadline/timestamp model.
    type: v.optional(v.union(v.literal("open"), v.literal("deadline"))),
    scheduledDate: v.optional(v.string()),
    deadline: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    position: v.number(),
    status: v.optional(
      v.union(
        v.literal("inbox"),
        v.literal("scheduled"),
        v.literal("completed"),
        v.literal("cancelled")
      )
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
    /** Set when a task is soft-deleted. A scheduled cron purges these after a
     *  30-minute grace window so the user can undo. */
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
    .index("by_owner_status_position", ["ownerTokenIdentifier", "status", "position"])
    .index("by_owner_deadline", ["ownerTokenIdentifier", "deadline"])
    .index("by_owner_deadline_position", ["ownerTokenIdentifier", "deadline", "position"])
    .index("by_owner_completed_at", ["ownerTokenIdentifier", "completedAt"])
    .index("by_owner_position", ["ownerTokenIdentifier", "position"]),
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
