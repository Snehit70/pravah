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
  handler: (ctx, { ownerTokenIdentifier, ...args }) =>
    addTaskForOwner(ctx, ownerTokenIdentifier, args),
});

export const moveTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    taskId: v.id("tasks"),
    targetDate: v.string(),
    position: v.optional(v.number()),
  },
  handler: (ctx, { ownerTokenIdentifier, ...args }) =>
    moveTaskForOwner(ctx, ownerTokenIdentifier, args),
});

export const completeTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    completeTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId),
});

export const reopenTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    reopenTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId),
});

export const unscheduleTask = internalMutation({
  args: {
    ownerTokenIdentifier: v.string(),
    taskId: v.id("tasks"),
  },
  handler: (ctx, args) =>
    unscheduleTaskForOwner(ctx, args.ownerTokenIdentifier, args.taskId),
});
