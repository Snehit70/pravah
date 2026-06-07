import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  addTaskForOwner,
  completeTaskForOwner,
  getTimelineForOwner,
  listTasksForOwner,
  moveTaskForOwner,
  reopenTaskForOwner,
  unscheduleTaskForOwner,
} from "./tasks";
import {
  getIntegrationStatusForOwner,
  listReviewQueueForOwner,
} from "./sync";
import { runIdempotentMutation } from "./automationIdempotency";

const taskStatus = v.union(
  v.literal("inbox"),
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("cancelled")
);

const provider = v.union(v.literal("google_calendar"), v.literal("gmail"));

export const listTasks = internalQuery({
  args: {
    ownerTokenIdentifier: v.string(),
    date: v.optional(v.string()),
    status: v.optional(taskStatus),
  },
  handler: (ctx, { ownerTokenIdentifier, ...args }) =>
    listTasksForOwner(ctx, ownerTokenIdentifier, args),
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
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal("open"), v.literal("deadline")),
    scheduledDate: v.optional(v.string()),
    deadline: v.optional(v.string()),
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
  handler: (ctx, { ownerTokenIdentifier, idempotencyKey, ...args }) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier,
      idempotencyKey,
      operation: "tasks.add",
      request: args,
      execute: () => addTaskForOwner(ctx, ownerTokenIdentifier, args),
    }),
});

export const moveTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    taskId: v.id("tasks"),
    targetDate: v.string(),
    position: v.optional(v.number()),
  },
  handler: (ctx, { ownerTokenIdentifier, idempotencyKey, ...args }) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier,
      idempotencyKey,
      operation: "tasks.move",
      request: args,
      execute: async () => {
        await moveTaskForOwner(ctx, ownerTokenIdentifier, args);
        return { success: true };
      },
    }),
});

export const completeTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "tasks.complete",
      request: { taskId: args.taskId },
      execute: async () => {
        await completeTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId);
        return { success: true };
      },
    }),
});

export const reopenTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "tasks.reopen",
      request: { taskId: args.taskId },
      execute: async () => {
        await reopenTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId);
        return { success: true };
      },
    }),
});

export const unscheduleTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    idempotencyKey: v.optional(v.string()),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    runIdempotentMutation(ctx, {
      ownerTokenIdentifier: args.ownerTokenIdentifier,
      idempotencyKey: args.idempotencyKey,
      operation: "tasks.unschedule",
      request: { taskId: args.taskId },
      execute: async () => {
        await unscheduleTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId);
        return { success: true };
      },
    }),
});
