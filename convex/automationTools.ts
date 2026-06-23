import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  addTaskForOwner,
  completeTaskForOwner,
  getTimelineForOwner,
  listTasksForOwner,
  moveTaskForOwner,
  reopenTaskForOwner,
  unscheduleTaskForOwner,
  updateTaskForOwner,
} from "./tasks";
import { updateGoalForOwner } from "./goals";
import {
  getIntegrationStatusForOwner,
  listReviewQueueForOwner,
} from "./sync";
import { runIdempotentMutation } from "./automationIdempotency";

const AUTOMATION_UNDO_WINDOW_MS = 30 * 60 * 1000;

const taskStatus = v.union(
  v.literal("inbox"),
  v.literal("timeline"),
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("cancelled")
);

const provider = v.union(v.literal("google_calendar"), v.literal("gmail"));

function makeOperationId() {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function snapshotTask(task: Doc<"tasks"> | null) {
  if (!task) return null;
  return {
    _id: String(task._id),
    title: task.title,
    description: task.description,
    deadline: task.deadline,
    scheduledAt: task.scheduledAt,
    completedAt: task.completedAt,
    position: task.position,
    source: task.source,
    estimatedMinutes: task.estimatedMinutes,
    tags: task.tags,
    priority: task.priority,
    cancelledAt: task.cancelledAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function snapshotGoal(goal: Doc<"goals"> | null) {
  if (!goal) return null;
  return {
    clientId: goal.clientId,
    text: goal.text,
    description: goal.description,
    deadline: goal.deadline,
    priority: goal.priority,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function snapshotGoalLink(link: Doc<"goalLinks"> | null) {
  return link
    ? {
        taskId: link.taskId,
        goalClientId: link.goalClientId,
      }
    : null;
}

async function getOwnedTaskDoc(ctx: MutationCtx, ownerTokenIdentifier: string, taskId: Id<"tasks">) {
  const task = await ctx.db.get(taskId);
  if (!task || task.ownerTokenIdentifier !== ownerTokenIdentifier) {
    throw new Error("Task not found");
  }
  return task;
}

async function getOwnedGoalDoc(ctx: MutationCtx, ownerTokenIdentifier: string, goalClientId: string) {
  return await ctx.db
    .query("goals")
    .withIndex("by_owner_client_id", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("clientId", goalClientId)
    )
    .first();
}

async function getOwnedGoalLinkDoc(ctx: MutationCtx, ownerTokenIdentifier: string, taskId: string) {
  return await ctx.db
    .query("goalLinks")
    .withIndex("by_owner_task", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("taskId", taskId)
    )
    .first();
}

async function recordOperation(
  ctx: MutationCtx,
  input: {
    ownerTokenIdentifier: string;
    operation: string;
    operationGroupId?: string;
    targetType?: string;
    targetId?: string;
    idempotencyKey?: string;
    before: unknown;
    after: unknown;
    undoable?: boolean;
  }
) {
  const now = Date.now();
  const undoAvailable = input.undoable ?? true;
  const undoExpiresAt = undoAvailable
    ? now + AUTOMATION_UNDO_WINDOW_MS
    : undefined;
  const operationId = makeOperationId();
  await ctx.db.insert("automationOperations", {
    ownerTokenIdentifier: input.ownerTokenIdentifier,
    operationId,
    operationGroupId: input.operationGroupId,
    operation: input.operation,
    status: "applied",
    targetType: input.targetType,
    targetId: input.targetId,
    idempotencyKey: input.idempotencyKey,
    beforeJson: JSON.stringify(input.before),
    afterJson: JSON.stringify(input.after),
    undoExpiresAt,
    createdAt: now,
  });
  return {
    operationId,
    operationGroupId: input.operationGroupId,
    undoAvailable,
    undoExpiresAt: undoExpiresAt
      ? new Date(undoExpiresAt).toISOString()
      : undefined,
  };
}

export const listTasks = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    date: v.optional(v.string()),
    status: v.optional(taskStatus),
  },
  handler: (ctx, { ownerTokenIdentifier, status, ...args }) =>
    listTasksForOwner(ctx, ownerTokenIdentifier, {
      ...args,
      status: status === "timeline" ? "scheduled" : status,
    }),
});

export const listGoals = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
  },
  handler: async (ctx, { ownerTokenIdentifier }) => {
    const rows = await ctx.db
      .query("goals")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", ownerTokenIdentifier))
      .collect();

    return rows
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((goal) => ({
        id: goal.clientId,
        text: goal.text,
        description: goal.description,
        deadline: goal.deadline,
        priority: goal.priority,
        createdAt: goal.createdAt,
      }));
  },
});

export const listGoalLinks = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
  },
  handler: async (ctx, { ownerTokenIdentifier }) => {
    const links = await ctx.db
      .query("goalLinks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", ownerTokenIdentifier))
      .collect();

    return Object.fromEntries(links.map((link) => [link.taskId, link.goalClientId]));
  },
});

export const getTimeline = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.string(),
  },
  handler: (ctx, { ownerTokenIdentifier, ...args }) =>
    getTimelineForOwner(ctx, ownerTokenIdentifier, args),
});

export const getIntegrationStatus = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    provider,
  },
  handler: (ctx, args) =>
    getIntegrationStatusForOwner(ctx, args.ownerTokenIdentifier, args.provider),
});

export const listReviewQueue = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))
    ),
    provider: v.optional(provider),
    limit: v.optional(v.number()),
  },
  handler: (ctx, { ownerTokenIdentifier, ...args }) =>
    listReviewQueueForOwner(ctx, ownerTokenIdentifier, args),
});

export const addTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.string()),
    time: v.optional(v.string()),
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
  },
  handler: (ctx, { ownerTokenIdentifier, idempotencyKey, operationGroupId, ...args }) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier,
      idempotencyKey,
      operation: "tasks.add",
      request: { ...args, operationGroupId },
      execute: async () => {
        const taskId = await addTaskForOwner(ctx, ownerTokenIdentifier, args);
        const task = await getOwnedTaskDoc(ctx, ownerTokenIdentifier, taskId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier,
          operation: "tasks.add",
          operationGroupId,
          targetType: "task",
          targetId: String(taskId),
          idempotencyKey,
          before: { tasks: [] },
          after: { tasks: [snapshotTask(task)] },
        });
        return { taskId, ...operation };
      },
    }),
});

export const moveTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    taskId: v.id("tasks"),
    targetDate: v.string(),
    position: v.optional(v.number()),
  },
  handler: (ctx, { ownerTokenIdentifier, idempotencyKey, operationGroupId, ...args }) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier,
      idempotencyKey,
      operation: "tasks.move",
      request: { ...args, operationGroupId },
      execute: async () => {
        const before = await getOwnedTaskDoc(ctx, ownerTokenIdentifier, args.taskId);
        await moveTaskForOwner(ctx, ownerTokenIdentifier, args);
        const after = await getOwnedTaskDoc(ctx, ownerTokenIdentifier, args.taskId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier,
          operation: "tasks.move",
          operationGroupId,
          targetType: "task",
          targetId: String(args.taskId),
          idempotencyKey,
          before: { tasks: [snapshotTask(before)] },
          after: { tasks: [snapshotTask(after)] },
        });
        return { success: true, ...operation };
      },
    }),
});

export const completeTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "tasks.complete",
      request: { taskId: args.taskId, operationGroupId: args.operationGroupId },
      execute: async () => {
        const before = await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        await completeTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId);
        const after = await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier: args.ownerTokenIdentifier,
          operation: "tasks.complete",
          operationGroupId: args.operationGroupId,
          targetType: "task",
          targetId: String(args.taskId),
          idempotencyKey: args.idempotencyKey,
          before: { tasks: [snapshotTask(before)] },
          after: { tasks: [snapshotTask(after)] },
        });
        return { success: true, ...operation };
      },
    }),
});

export const reopenTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "tasks.reopen",
      request: { taskId: args.taskId, operationGroupId: args.operationGroupId },
      execute: async () => {
        const before = await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        await reopenTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId);
        const after = await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier: args.ownerTokenIdentifier,
          operation: "tasks.reopen",
          operationGroupId: args.operationGroupId,
          targetType: "task",
          targetId: String(args.taskId),
          idempotencyKey: args.idempotencyKey,
          before: { tasks: [snapshotTask(before)] },
          after: { tasks: [snapshotTask(after)] },
        });
        return { success: true, ...operation };
      },
    }),
});

export const unscheduleTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "tasks.unschedule",
      request: { taskId: args.taskId, operationGroupId: args.operationGroupId },
      execute: async () => {
        const before = await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        await unscheduleTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId);
        const after = await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier: args.ownerTokenIdentifier,
          operation: "tasks.unschedule",
          operationGroupId: args.operationGroupId,
          targetType: "task",
          targetId: String(args.taskId),
          idempotencyKey: args.idempotencyKey,
          before: { tasks: [snapshotTask(before)] },
          after: { tasks: [snapshotTask(after)] },
        });
        return { success: true, ...operation };
      },
    }),
});

export const updateTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    deadline: v.optional(v.union(v.string(), v.null())),
    time: v.optional(v.union(v.string(), v.null())),
    estimatedMinutes: v.optional(v.union(v.number(), v.null())),
    tags: v.optional(v.union(v.array(v.string()), v.null())),
    priority: v.optional(
      v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"), v.null())
    ),
  },
  handler: (ctx, { ownerTokenIdentifier, idempotencyKey, operationGroupId, ...args }) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier,
      idempotencyKey,
      operation: "tasks.update",
      request: { ...args, operationGroupId },
      execute: async () => {
        const before = await getOwnedTaskDoc(ctx, ownerTokenIdentifier, args.taskId);
        const patch: Parameters<typeof updateTaskForOwner>[2] = {
          taskId: args.taskId,
        };
        if (Object.prototype.hasOwnProperty.call(args, "title")) {
          patch.title = args.title;
        }
        if (Object.prototype.hasOwnProperty.call(args, "description")) {
          patch.description = args.description ?? undefined;
        }
        if (Object.prototype.hasOwnProperty.call(args, "deadline")) {
          patch.deadline = args.deadline ?? undefined;
        }
        if (Object.prototype.hasOwnProperty.call(args, "time")) {
          patch.time = args.time ?? undefined;
        }
        if (Object.prototype.hasOwnProperty.call(args, "estimatedMinutes")) {
          patch.estimatedMinutes = args.estimatedMinutes ?? undefined;
        }
        if (Object.prototype.hasOwnProperty.call(args, "tags")) {
          patch.tags = args.tags ?? undefined;
        }
        if (Object.prototype.hasOwnProperty.call(args, "priority")) {
          patch.priority = args.priority ?? undefined;
        }
        await updateTaskForOwner(ctx, ownerTokenIdentifier, {
          ...patch,
        });
        const after = await getOwnedTaskDoc(ctx, ownerTokenIdentifier, args.taskId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier,
          operation: "tasks.update",
          operationGroupId,
          targetType: "task",
          targetId: String(args.taskId),
          idempotencyKey,
          before: { tasks: [snapshotTask(before)] },
          after: { tasks: [snapshotTask(after)] },
        });
        return { success: true, ...operation };
      },
    }),
});

export const deleteTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "tasks.delete",
      request: { taskId: args.taskId, operationGroupId: args.operationGroupId },
      execute: async () => {
        const before = await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        await ctx.db.patch(args.taskId, {
          cancelledAt: Date.now(),
          completedAt: undefined,
          updatedAt: Date.now(),
        });
        const after = await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier: args.ownerTokenIdentifier,
          operation: "tasks.delete",
          operationGroupId: args.operationGroupId,
          targetType: "task",
          targetId: String(args.taskId),
          idempotencyKey: args.idempotencyKey,
          before: { tasks: [snapshotTask(before)] },
          after: { tasks: [snapshotTask(after)] },
        });
        return { success: true, ...operation };
      },
    }),
});

export const setGoalLink = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    taskId: v.id("tasks"),
    goalClientId: v.union(v.string(), v.null()),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: args.goalClientId === null ? "tasks.unlinkGoal" : "tasks.linkGoal",
      request: {
        taskId: args.taskId,
        goalClientId: args.goalClientId,
        operationGroupId: args.operationGroupId,
      },
      execute: async () => {
        await getOwnedTaskDoc(ctx, args.ownerTokenIdentifier, args.taskId);
        if (args.goalClientId !== null) {
          const goal = await getOwnedGoalDoc(ctx, args.ownerTokenIdentifier, args.goalClientId);
          if (!goal) throw new Error("Goal not found");
        }
        const before = await getOwnedGoalLinkDoc(
          ctx,
          args.ownerTokenIdentifier,
          String(args.taskId)
        );
        if (args.goalClientId === null) {
          if (before) await ctx.db.delete(before._id);
        } else if (before) {
          await ctx.db.patch(before._id, { goalClientId: args.goalClientId });
        } else {
          await ctx.db.insert("goalLinks", {
            taskId: String(args.taskId),
            goalClientId: args.goalClientId,
            ownerTokenIdentifier: args.ownerTokenIdentifier,
          });
        }
        const after = await getOwnedGoalLinkDoc(
          ctx,
          args.ownerTokenIdentifier,
          String(args.taskId)
        );
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier: args.ownerTokenIdentifier,
          operation: args.goalClientId === null ? "tasks.unlinkGoal" : "tasks.linkGoal",
          operationGroupId: args.operationGroupId,
          targetType: "goalLink",
          targetId: String(args.taskId),
          idempotencyKey: args.idempotencyKey,
          before: { goalLinks: before ? [snapshotGoalLink(before)] : [] },
          after: { goalLinks: after ? [snapshotGoalLink(after)] : [] },
        });
        return { success: true, ...operation };
      },
    }),
});

export const updateGoal = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    goalClientId: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    deadline: v.optional(v.union(v.string(), v.null())),
    priority: v.optional(
      v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"), v.null())
    ),
  },
  handler: (ctx, { ownerTokenIdentifier, idempotencyKey, operationGroupId, goalClientId, description, deadline, priority }) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier,
      idempotencyKey,
      operation: "goals.update",
      request: { goalClientId, description, deadline, priority, operationGroupId },
      execute: async () => {
        const before = await getOwnedGoalDoc(ctx, ownerTokenIdentifier, goalClientId);
        if (!before) return { updated: false };
        const result = await updateGoalForOwner(ctx, ownerTokenIdentifier, goalClientId, {
          description,
          deadline,
          priority,
        });
        const after = await getOwnedGoalDoc(ctx, ownerTokenIdentifier, goalClientId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier,
          operation: "goals.update",
          operationGroupId,
          targetType: "goal",
          targetId: goalClientId,
          idempotencyKey,
          before: { goals: [snapshotGoal(before)] },
          after: { goals: after ? [snapshotGoal(after)] : [] },
        });
        return { ...result, ...operation };
      },
    }),
});

export const createGoal = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    clientId: v.string(),
    text: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"))),
  },
  handler: (ctx, { ownerTokenIdentifier, idempotencyKey, operationGroupId, ...args }) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier,
      idempotencyKey,
      operation: "goals.create",
      request: { ...args, operationGroupId },
      execute: async () => {
        const existing = await getOwnedGoalDoc(ctx, ownerTokenIdentifier, args.clientId);
        if (existing) throw new Error("Goal already exists");
        const now = Date.now();
        await ctx.db.insert("goals", {
          clientId: args.clientId,
          text: args.text,
          description: args.description,
          deadline: args.deadline,
          priority: args.priority,
          ownerTokenIdentifier,
          createdAt: now,
          updatedAt: now,
        });
        const after = await getOwnedGoalDoc(ctx, ownerTokenIdentifier, args.clientId);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier,
          operation: "goals.create",
          operationGroupId,
          targetType: "goal",
          targetId: args.clientId,
          idempotencyKey,
          before: { goals: [] },
          after: { goals: after ? [snapshotGoal(after)] : [] },
        });
        return { goalId: args.clientId, ...operation };
      },
    }),
});

export const deleteGoal = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    operationGroupId: v.optional(v.string()),
    goalClientId: v.string(),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "goals.delete",
      request: { goalClientId: args.goalClientId, operationGroupId: args.operationGroupId },
      execute: async () => {
        const goal = await getOwnedGoalDoc(ctx, args.ownerTokenIdentifier, args.goalClientId);
        if (!goal) throw new Error("Goal not found");
        const links = await ctx.db
          .query("goalLinks")
          .withIndex("by_owner_goal", (q) =>
            q
              .eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
              .eq("goalClientId", args.goalClientId)
          )
          .collect();
        for (const link of links) await ctx.db.delete(link._id);
        await ctx.db.delete(goal._id);
        const operation = await recordOperation(ctx, {
          ownerTokenIdentifier: args.ownerTokenIdentifier,
          operation: "goals.delete",
          operationGroupId: args.operationGroupId,
          targetType: "goal",
          targetId: args.goalClientId,
          idempotencyKey: args.idempotencyKey,
          before: {
            goals: [snapshotGoal(goal)],
            goalLinks: links.map(snapshotGoalLink),
          },
          after: { goals: [], goalLinks: [] },
        });
        return { deleted: true, goalId: args.goalClientId, ...operation };
      },
    }),
});
