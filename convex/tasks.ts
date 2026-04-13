import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTokenIdentifier } from "./authHelpers";

type TaskCtx = QueryCtx | MutationCtx;

async function getOwnedTask(
  ctx: TaskCtx,
  taskId: Id<"tasks">,
  tokenIdentifier: string
) {
  const task = await ctx.db.get(taskId);
  if (!task || task.ownerTokenIdentifier !== tokenIdentifier) {
    throw new Error("Task not found");
  }
  return task;
}

async function getNextPositionForStatus(
  ctx: TaskCtx,
  tokenIdentifier: string,
  status: "inbox" | "scheduled",
  scheduledDate?: string
) {
  if (status === "scheduled" && scheduledDate) {
    const latestTask = await ctx.db
      .query("tasks")
      .withIndex("by_owner_status_date_position", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier)
          .eq("status", "scheduled")
          .eq("scheduledDate", scheduledDate)
      )
      .order("desc")
      .first();
    return (latestTask?.position ?? -1) + 1;
  }

  const latestTask = await ctx.db
    .query("tasks")
    .withIndex("by_owner_status_position", (q) =>
      q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "inbox")
    )
    .order("desc")
    .first();

  return (latestTask?.position ?? -1) + 1;
}

export const listTasks = query({
  args: {
    date: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("inbox"),
        v.literal("scheduled"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);

    if (args.date && args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_owner_status_date", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier)
            .eq("status", args.status!)
            .eq("scheduledDate", args.date!)
        )
        .collect();
    }

    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", args.status!)
        )
        .collect();
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();

    return args.date
      ? tasks.filter((task) => task.scheduledDate === args.date)
      : tasks;
  },
});

export const addTask = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const scheduledDate =
      args.scheduledDate ??
      (args.type === "deadline" ? args.deadline : undefined);

    const position = await getNextPositionForStatus(
      ctx,
      tokenIdentifier,
      scheduledDate ? "scheduled" : "inbox",
      scheduledDate
    );

    return await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      type: args.type,
      scheduledDate,
      deadline: args.deadline,
      position,
      status: scheduledDate ? "scheduled" : "inbox",
      source: args.source || "manual",
      estimatedMinutes: args.estimatedMinutes,
      tags: args.tags,
      createdBy: tokenIdentifier,
      ownerTokenIdentifier: tokenIdentifier,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const moveTask = mutation({
  args: {
    taskId: v.id("tasks"),
    targetDate: v.string(),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const task = await getOwnedTask(ctx, args.taskId, tokenIdentifier);

    if (task.type === "deadline" && task.deadline && args.targetDate > task.deadline) {
      throw new Error("Cannot move task past its deadline");
    }

    const newPosition =
      args.position ??
      (await getNextPositionForStatus(ctx, tokenIdentifier, "scheduled", args.targetDate));

    await ctx.db.patch(args.taskId, {
      scheduledDate: args.targetDate,
      position: newPosition,
      status: "scheduled",
      updatedAt: Date.now(),
    });
  },
});

export const reorderTasks = mutation({
  args: {
    date: v.string(),
    taskIds: v.array(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);

    for (const [position, taskId] of args.taskIds.entries()) {
      const task = await getOwnedTask(ctx, taskId, tokenIdentifier);
      if (task.scheduledDate !== args.date) {
        throw new Error(`Task ${taskId} does not belong to date ${args.date}`);
      }
      await ctx.db.patch(taskId, {
        position,
        updatedAt: Date.now(),
      });
    }
  },
});

export const completeTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    await getOwnedTask(ctx, args.taskId, tokenIdentifier);
    await ctx.db.patch(args.taskId, {
      status: "completed",
      updatedAt: Date.now(),
    });
  },
});

export const reopenTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const task = await getOwnedTask(ctx, args.taskId, tokenIdentifier);
    if (task.status !== "completed") {
      throw new Error("Task is not completed");
    }

    const position = await getNextPositionForStatus(ctx, tokenIdentifier, "inbox");

    await ctx.db.patch(args.taskId, {
      status: "inbox",
      scheduledDate: undefined,
      position,
      updatedAt: Date.now(),
    });
  },
});

export const unscheduleTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const task = await getOwnedTask(ctx, args.taskId, tokenIdentifier);
    if (task.status !== "scheduled") {
      throw new Error("Task is not scheduled");
    }

    const position = await getNextPositionForStatus(ctx, tokenIdentifier, "inbox");

    await ctx.db.patch(args.taskId, {
      status: "inbox",
      scheduledDate: undefined,
      position,
      updatedAt: Date.now(),
    });
  },
});

export const backfillDeadlineTasksToDeadlineDate = mutation({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();
    const positionByDate = new Map<string, number>();

    for (const task of allTasks) {
      if (task.status !== "scheduled" || !task.scheduledDate) continue;
      const currentMax = positionByDate.get(task.scheduledDate) ?? -1;
      positionByDate.set(task.scheduledDate, Math.max(currentMax, task.position));
    }

    const candidates = allTasks
      .filter(
        (task) =>
          task.type === "deadline" &&
          !!task.deadline &&
          task.status !== "completed" &&
          task.status !== "cancelled" &&
          (task.scheduledDate !== task.deadline || task.status !== "scheduled")
      )
      .sort((a, b) => a.createdAt - b.createdAt);

    const updatedTaskIds: Id<"tasks">[] = [];
    const now = Date.now();

    for (const task of candidates) {
      const targetDate = task.deadline!;
      const nextPosition = (positionByDate.get(targetDate) ?? -1) + 1;
      positionByDate.set(targetDate, nextPosition);

      await ctx.db.patch(task._id, {
        scheduledDate: targetDate,
        status: "scheduled",
        position: nextPosition,
        updatedAt: now,
      });
      updatedTaskIds.push(task._id);
    }

    return {
      updatedCount: updatedTaskIds.length,
      updatedTaskIds,
    };
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    deadline: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const { taskId, ...updates } = args;
    await getOwnedTask(ctx, taskId, tokenIdentifier);
    await ctx.db.patch(taskId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    await getOwnedTask(ctx, args.taskId, tokenIdentifier);
    await ctx.db.delete(args.taskId);
  },
});

export const bulkReschedule = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
    targetDate: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    let nextPosition = await getNextPositionForStatus(
      ctx,
      tokenIdentifier,
      "scheduled",
      args.targetDate
    );
    const skippedTaskIds: Id<"tasks">[] = [];

    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task || task.ownerTokenIdentifier !== tokenIdentifier) {
        skippedTaskIds.push(taskId);
        continue;
      }
      if (task.status !== "inbox" && task.status !== "scheduled") {
        skippedTaskIds.push(taskId);
        continue;
      }
      if (task.type === "deadline" && task.deadline && args.targetDate > task.deadline) {
        skippedTaskIds.push(taskId);
        continue;
      }

      await ctx.db.patch(taskId, {
        status: "scheduled",
        scheduledDate: args.targetDate,
        position: nextPosition,
        updatedAt: Date.now(),
      });
      nextPosition += 1;
    }

    return {
      movedCount: args.taskIds.length - skippedTaskIds.length,
      skippedTaskIds,
    };
  },
});

export const getTimeline = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "scheduled")
      )
      .collect();

    const grouped: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      const date = task.scheduledDate;
      if (!date || date < args.startDate || date > args.endDate) continue;
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(task);
    }

    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.position - b.position);
    }

    return grouped;
  },
});
