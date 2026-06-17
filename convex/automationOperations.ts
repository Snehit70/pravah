import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { runIdempotentMutation } from "./automationIdempotency";

const UNDO_WINDOW_MS = 30 * 60 * 1000;

const operationSummaryFields = (operation: Doc<"automationOperations">) => ({
  operationId: operation.operationId,
  operationGroupId: operation.operationGroupId,
  operation: operation.operation,
  status: operation.status,
  targetType: operation.targetType,
  targetId: operation.targetId,
  undoAvailable:
    operation.status === "applied" &&
    operation.undoExpiresAt !== undefined &&
    operation.undoExpiresAt > Date.now(),
  undoExpiresAt: operation.undoExpiresAt
    ? new Date(operation.undoExpiresAt).toISOString()
    : undefined,
  createdAt: operation.createdAt,
  undoneAt: operation.undoneAt,
});

function operationId() {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseSnapshot(value: string): {
  tasks?: Array<Partial<Doc<"tasks">> & { _id?: string }>;
  goals?: Array<Partial<Doc<"goals">>>;
  goalLinks?: Array<Partial<Doc<"goalLinks">>>;
} {
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === "object" ? parsed : {};
}

async function getRestorePositionForTask(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  task: Partial<Doc<"tasks">> & { _id?: string }
) {
  const restoresActiveTask =
    task.completedAt === undefined &&
    task.cancelledAt === undefined;
  if (!restoresActiveTask) {
    return task.position;
  }

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_owner_position", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier)
    )
    .collect();
  let maxPosition = -1;
  for (const existingTask of tasks) {
    const isActiveTaskInSameLane =
      existingTask.deadline === task.deadline &&
      existingTask.completedAt === undefined &&
      existingTask.cancelledAt === undefined;
    if (!isActiveTaskInSameLane) continue;
    maxPosition = Math.max(maxPosition, existingTask.position);
  }
  return maxPosition + 1;
}

async function restoreSnapshot(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  beforeJson: string
) {
  const snapshot = parseSnapshot(beforeJson);

  for (const task of snapshot.tasks ?? []) {
    if (!task._id) continue;
    const existing = await ctx.db.get(task._id as Id<"tasks">);
    if (!existing || existing.ownerTokenIdentifier !== ownerTokenIdentifier) continue;
    const position = await getRestorePositionForTask(ctx, ownerTokenIdentifier, task);
    await ctx.db.patch(task._id as Id<"tasks">, {
      title: task.title,
      description: task.description,
      deadline: task.deadline,
      scheduledAt: task.scheduledAt,
      completedAt: task.completedAt,
      position: position ?? existing.position,
      source: task.source,
      estimatedMinutes: task.estimatedMinutes,
      tags: task.tags,
      priority: task.priority,
      cancelledAt: task.cancelledAt,
      updatedAt: Date.now(),
    });
  }

  for (const goal of snapshot.goals ?? []) {
    if (!goal.clientId) continue;
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_owner_client_id", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("clientId", goal.clientId!)
      )
      .first();
    const doc = {
      clientId: goal.clientId,
      text: goal.text ?? "",
      description: goal.description,
      deadline: goal.deadline,
      priority: goal.priority,
      ownerTokenIdentifier,
      createdAt: goal.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("goals", doc);
    }
  }

  for (const link of snapshot.goalLinks ?? []) {
    if (!link.taskId || !link.goalClientId) continue;
    const existing = await ctx.db
      .query("goalLinks")
      .withIndex("by_owner_task", (q) =>
        q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("taskId", link.taskId!)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { goalClientId: link.goalClientId });
    } else {
      await ctx.db.insert("goalLinks", {
        taskId: link.taskId,
        goalClientId: link.goalClientId,
        ownerTokenIdentifier,
      });
    }
  }
}

async function undoOperationSnapshot(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  beforeJson: string,
  afterJson: string
) {
  const before = parseSnapshot(beforeJson);
  const after = parseSnapshot(afterJson);

  if ((before.tasks ?? []).length === 0) {
    for (const task of after.tasks ?? []) {
      if (!task._id) continue;
      const existing = await ctx.db.get(task._id as Id<"tasks">);
      if (!existing || existing.ownerTokenIdentifier !== ownerTokenIdentifier) continue;
      await ctx.db.patch(task._id as Id<"tasks">, {
        cancelledAt: Date.now(),
        completedAt: undefined,
        updatedAt: Date.now(),
      });
    }
  }

  if ((before.goals ?? []).length === 0) {
    for (const goal of after.goals ?? []) {
      if (!goal.clientId) continue;
      const existing = await ctx.db
        .query("goals")
        .withIndex("by_owner_client_id", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("clientId", goal.clientId!)
        )
        .first();
      if (existing) {
        const links = await ctx.db
          .query("goalLinks")
          .withIndex("by_owner_goal", (q) =>
            q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("goalClientId", goal.clientId!)
          )
          .collect();
        for (const link of links) await ctx.db.delete(link._id);
        await ctx.db.delete(existing._id);
      }
    }
  }

  if ((before.goalLinks ?? []).length === 0) {
    for (const link of after.goalLinks ?? []) {
      if (!link.taskId) continue;
      const existing = await ctx.db
        .query("goalLinks")
        .withIndex("by_owner_task", (q) =>
          q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("taskId", link.taskId!)
        )
        .first();
      if (existing) await ctx.db.delete(existing._id);
    }
  }

  await restoreSnapshot(ctx, ownerTokenIdentifier, beforeJson);
}

export const record = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    operation: v.string(),
    operationGroupId: v.optional(v.string()),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    beforeJson: v.string(),
    afterJson: v.string(),
    undoable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = operationId();
    await ctx.db.insert("automationOperations", {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      operationId: id,
      operationGroupId: args.operationGroupId,
      operation: args.operation,
      status: "applied",
      targetType: args.targetType,
      targetId: args.targetId,
      idempotencyKey: args.idempotencyKey,
      beforeJson: args.beforeJson,
      afterJson: args.afterJson,
      undoExpiresAt: args.undoable ? now + UNDO_WINDOW_MS : undefined,
      createdAt: now,
    });
    return {
      operationId: id,
      operationGroupId: args.operationGroupId,
      undoAvailable: args.undoable,
      undoExpiresAt: args.undoable
        ? new Date(now + UNDO_WINDOW_MS).toISOString()
        : undefined,
    };
  },
});

export const list = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    limit: v.optional(v.number()),
    operationGroupId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);
    const rows = args.operationGroupId
      ? await ctx.db
          .query("automationOperations")
          .withIndex("by_owner_group_created_at", (q) =>
            q
              .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
              .eq("operationGroupId", args.operationGroupId)
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("automationOperations")
          .withIndex("by_owner_created_at", (q) =>
            q.eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          )
          .order("desc")
          .take(limit);
    return rows.map(operationSummaryFields);
  },
});

export const get = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const operation = await ctx.db
      .query("automationOperations")
      .withIndex("by_owner_operation_id", (q) =>
        q
          .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
          .eq("operationId", args.operationId)
      )
      .first();
    return operation ? operationSummaryFields(operation) : null;
  },
});

export const undo = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationId: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "operations.undo",
      request: {
        operationId: args.operationId,
        operationGroupId: args.operationGroupId,
      },
      execute: async () => {
        if (!args.operationId && !args.operationGroupId) {
          throw new Error("Missing operation identifier");
        }
        const operations = args.operationGroupId
          ? await ctx.db
              .query("automationOperations")
              .withIndex("by_owner_group_created_at", (q) =>
                q
                  .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
                  .eq("operationGroupId", args.operationGroupId)
              )
              .order("desc")
              .collect()
          : [
              await ctx.db
                .query("automationOperations")
                .withIndex("by_owner_operation_id", (q) =>
                  q
                    .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
                    .eq("operationId", args.operationId!)
                )
                .first(),
            ].filter((operation): operation is Doc<"automationOperations"> => operation !== null);

        if (operations.length === 0) {
          throw new Error("Operation not found");
        }

        const now = Date.now();
        for (const operation of operations) {
          if (operation.status !== "applied") {
            throw new Error("Operation is already undone");
          }
          if (!operation.undoExpiresAt || operation.undoExpiresAt <= now) {
            throw new Error("Operation undo is unavailable");
          }
        }

        for (const operation of operations) {
          await undoOperationSnapshot(
            ctx,
            args.ownerTokenIdentifier,
            operation.beforeJson,
            operation.afterJson
          );
          await ctx.db.patch(operation._id, {
            status: "undone",
            undoneAt: now,
          });
        }

        return {
          undone: operations.map((operation) => operation.operationId),
          operationGroupId: args.operationGroupId,
        };
      },
    });
  },
});
