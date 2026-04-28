import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTokenIdentifier } from "./authHelpers";

type TaskCtx = QueryCtx | MutationCtx;

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPriorityRank(priority?: string): number {
  if (priority === "p1") return 0;
  if (priority === "p2") return 1;
  if (priority === "p3") return 2;
  return 3;
}

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

export const listBoardTasks = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);

    const inboxTasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner_status_position", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "inbox")
      )
      .collect();

    const scheduledTasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "scheduled")
      )
      .collect();

    return [...inboxTasks, ...scheduledTasks];
  },
});

/**
 * Returns completed tasks whose scheduledDate matches today (local time on
 * the server). Used by the "done today" counter in the Timeline header without
 * pulling all tasks into the board query.
 */
export const listTodayCompletedTasks = query({
  args: {
    // Client passes its local date string (YYYY-MM-DD) so results are
    // consistent with task dates written by the frontend, even when the
    // Convex server clock is in a different timezone or crosses midnight.
    clientDate: v.string(),
  },
  handler: async (ctx, { clientDate }) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    return await ctx.db
      .query("tasks")
      .withIndex("by_owner_status_date", (q) =>
        q
          .eq("ownerTokenIdentifier", tokenIdentifier)
          .eq("status", "completed")
          .eq("scheduledDate", clientDate)
      )
      .collect();
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
    priority: v.optional(v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"))),
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
      priority: args.priority,
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
      const today = getTodayDateString();
      const canCarryForwardOverdueDeadline = task.deadline < today;
      if (!canCarryForwardOverdueDeadline) {
        throw new Error("Cannot move task past its deadline");
      }
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

export const shiftScheduledTaskPosition = mutation({
  args: {
    taskId: v.id("tasks"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const task = await getOwnedTask(ctx, args.taskId, tokenIdentifier);

    if (task.status !== "scheduled" || !task.scheduledDate) {
      throw new Error("Task is not scheduled");
    }

    const tasksForDate = await ctx.db
      .query("tasks")
      .withIndex("by_owner_status_date_position", (q) =>
        q
          .eq("ownerTokenIdentifier", tokenIdentifier)
          .eq("status", "scheduled")
          .eq("scheduledDate", task.scheduledDate)
      )
      .collect();

    tasksForDate.sort((a, b) => getPriorityRank(a.priority) - getPriorityRank(b.priority) || a.position - b.position);

    const currentIndex = tasksForDate.findIndex((candidate) => candidate._id === task._id);
    if (currentIndex === -1) {
      throw new Error("Task is not in its scheduled lane");
    }

    const targetIndex = args.direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= tasksForDate.length) {
      return;
    }

    const currentTask = tasksForDate[currentIndex];
    const targetTask = tasksForDate[targetIndex];
    const now = Date.now();

    await ctx.db.patch(currentTask._id, {
      position: targetTask.position,
      updatedAt: now,
    });
    await ctx.db.patch(targetTask._id, {
      position: currentTask.position,
      updatedAt: now,
    });
  },
});

export const reorderInboxTasks = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);

    for (const [position, taskId] of args.taskIds.entries()) {
      const task = await getOwnedTask(ctx, taskId, tokenIdentifier);
      if (task.status !== "inbox" || task.scheduledDate) {
        throw new Error(`Task ${taskId} does not belong to inbox`);
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
    priority: v.optional(v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"))),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const { taskId } = args;
    const task = await getOwnedTask(ctx, taskId, tokenIdentifier);

    const updates: Partial<{
      title: string;
      description: string | undefined;
      deadline: string | undefined;
      estimatedMinutes: number | undefined;
      tags: string[] | undefined;
      priority: "p1" | "p2" | "p3" | undefined;
      type: "open" | "deadline";
      scheduledDate: string | undefined;
      status: "inbox" | "scheduled" | "completed" | "cancelled";
      position: number;
      updatedAt: number;
    }> = {};

    if (Object.prototype.hasOwnProperty.call(args, "title")) {
      updates.title = args.title;
    }
    if (Object.prototype.hasOwnProperty.call(args, "description")) {
      updates.description = args.description;
    }
    const deadlineProvided = Object.prototype.hasOwnProperty.call(args, "deadline");
    if (deadlineProvided) {
      updates.deadline = args.deadline;
    }
    if (Object.prototype.hasOwnProperty.call(args, "estimatedMinutes")) {
      updates.estimatedMinutes = args.estimatedMinutes;
    }
    if (Object.prototype.hasOwnProperty.call(args, "tags")) {
      updates.tags = args.tags;
    }
    if (Object.prototype.hasOwnProperty.call(args, "priority")) {
      updates.priority = args.priority;
    }

    const nextDeadline = args.deadline;
    const shouldPreserveInboxOpenTask =
      task.status === "inbox" &&
      task.type === "open" &&
      !task.scheduledDate;

    if (nextDeadline) {
      if (shouldPreserveInboxOpenTask) {
        updates.type = "open";
        updates.status = "inbox";
        updates.scheduledDate = undefined;
      } else {
        updates.type = "deadline";
      }

      if (!shouldPreserveInboxOpenTask && task.status !== "completed" && task.status !== "cancelled") {
        const staysInSameSlot =
          task.status === "scheduled" && task.scheduledDate === nextDeadline;
        updates.status = "scheduled";
        updates.scheduledDate = nextDeadline;
        updates.position = staysInSameSlot
          ? task.position
          : await getNextPositionForStatus(ctx, tokenIdentifier, "scheduled", nextDeadline);
      }
    } else if (deadlineProvided) {
      updates.type = "open";

      const wasAutoScheduledByDeadline =
        task.status === "scheduled" &&
        task.type === "deadline" &&
        !!task.deadline &&
        task.scheduledDate === task.deadline;

      if (wasAutoScheduledByDeadline) {
        updates.status = "inbox";
        updates.scheduledDate = undefined;
        updates.position = await getNextPositionForStatus(ctx, tokenIdentifier, "inbox");
      }
    }

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
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner_status_date_position", (q) =>
        q
          .eq("ownerTokenIdentifier", tokenIdentifier)
          .eq("status", "scheduled")
          .lte("scheduledDate", args.endDate)
      )
      .collect();

    const grouped: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      const date = task.scheduledDate;
      if (!date) continue;
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(task);
    }

    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.position - b.position);
    }

    return grouped;
  },
});

export const getTaskCounts = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);

    const [inbox, scheduled, completed] = await Promise.all([
      ctx.db
        .query("tasks")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "inbox")
        )
        .collect(),
      ctx.db
        .query("tasks")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "scheduled")
        )
        .collect(),
      ctx.db
        .query("tasks")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier).eq("status", "completed")
        )
        .collect(),
    ]);

    return {
      inboxCount: inbox.length,
      timelineCount: scheduled.length,
      completedCount: completed.length,
    };
  },
});
