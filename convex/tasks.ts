import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listTasks = query({
  args: {
    date: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("tasks");
    
    if (args.date) {
      q = q.filter((q) => q.eq(q.field("scheduledDate"), args.date));
    }
    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }
    
    return await q.collect();
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
    let q = ctx.db.query("tasks");
    
    if (args.scheduledDate) {
      q = q.filter((q) => 
        q.and(
          q.eq(q.field("scheduledDate"), args.scheduledDate),
          q.eq(q.field("status"), "scheduled")
        )
      );
    } else {
      q = q.filter((q) => q.eq(q.field("status"), "inbox"));
    }

    const tasks = await q.collect();
    const maxPosition = tasks.reduce((max, t) => Math.max(max, t.position), -1);

    return await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      type: args.type,
      scheduledDate: args.scheduledDate,
      deadline: args.deadline,
      position: maxPosition + 1,
      status: args.scheduledDate ? "scheduled" : "inbox",
      source: args.source || "manual",
      estimatedMinutes: args.estimatedMinutes,
      tags: args.tags,
      createdBy: "user",
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
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    if (task.type === "deadline" && task.deadline) {
      if (args.targetDate > task.deadline) {
        throw new Error("Cannot move task past its deadline");
      }
    }

    const tasksOnDay = await ctx.db
      .query("tasks")
      .filter((q) =>
        q.and(
          q.eq(q.field("scheduledDate"), args.targetDate),
          q.eq(q.field("status"), "scheduled")
        )
      )
      .collect();

    const newPosition =
      args.position ?? Math.max(...tasksOnDay.map((t) => t.position), -1) + 1;

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
    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task) continue;
      if (task.scheduledDate !== args.date) {
        throw new Error(`Task ${taskId} does not belong to date ${args.date}`);
      }
      await ctx.db.patch(taskId, {
        position: args.taskIds.indexOf(taskId),
        updatedAt: Date.now(),
      });
    }
  },
});

export const completeTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      status: "completed",
      updatedAt: Date.now(),
    });
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
    const { taskId, ...updates } = args;
    await ctx.db.patch(taskId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.taskId);
  },
});

export const getTimeline = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .filter((q) =>
        q.and(
          q.gte(q.field("scheduledDate"), args.startDate),
          q.lte(q.field("scheduledDate"), args.endDate),
          q.eq(q.field("status"), "scheduled")
        )
      )
      .collect();

    const grouped: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      const date = task.scheduledDate!;
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(task);
    }

    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.position - b.position);
    }

    return grouped;
  },
});