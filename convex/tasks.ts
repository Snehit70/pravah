import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTokenIdentifier } from "./authHelpers";

type TaskCtx = QueryCtx | MutationCtx;
type LegacyTaskStatus = "inbox" | "scheduled" | "completed" | "cancelled";
type ListTasksArgs = {
  date?: string;
  status?: LegacyTaskStatus;
};
type AddTaskArgs = {
  title: string;
  description?: string;
  deadline?: string;
  source?: "manual" | "ai-agent" | "gmail" | "gcal";
  estimatedMinutes?: number;
  tags?: string[];
  priority?: "p1" | "p2" | "p3";
};
type MoveTaskArgs = {
  taskId: Id<"tasks">;
  targetDate: string;
  position?: number;
};

function getPriorityRank(priority?: string): number {
  if (priority === "p1") return 0;
  if (priority === "p2") return 1;
  if (priority === "p3") return 2;
  return 3;
}

function isNativeTask(task: {
  source?: "manual" | "ai-agent" | "gmail" | "gcal";
}) {
  return task.source !== "gmail" && task.source !== "gcal";
}

function getTaskDeadline(task: {
  deadline?: string;
  scheduledDate?: string;
}) {
  return task.deadline ?? task.scheduledDate;
}

function getTaskCompletedAt(task: {
  completedAt?: number;
  status?: string;
  updatedAt: number;
}) {
  if (typeof task.completedAt === "number") return task.completedAt;
  if (task.status === "completed") return task.updatedAt;
  return undefined;
}

function getTaskCancelledAt(task: {
  cancelledAt?: number;
  status?: string;
  updatedAt: number;
}) {
  if (typeof task.cancelledAt === "number") return task.cancelledAt;
  if (task.status === "cancelled") return task.updatedAt;
  return undefined;
}

function isCancelledTask(task: {
  cancelledAt?: number;
  status?: string;
  updatedAt: number;
}) {
  return typeof getTaskCancelledAt(task) === "number";
}

function isCompletedTask(task: {
  completedAt?: number;
  status?: string;
  updatedAt: number;
  cancelledAt?: number;
}) {
  return !isCancelledTask(task) && typeof getTaskCompletedAt(task) === "number";
}

function isTimelineTask(task: {
  deadline?: string;
  scheduledDate?: string;
  completedAt?: number;
  status?: string;
  updatedAt: number;
  cancelledAt?: number;
}) {
  return !isCancelledTask(task) && !isCompletedTask(task) && !!getTaskDeadline(task);
}

function isInboxTask(task: {
  deadline?: string;
  scheduledDate?: string;
  completedAt?: number;
  status?: string;
  updatedAt: number;
  cancelledAt?: number;
}) {
  return !isCancelledTask(task) && !isCompletedTask(task) && !getTaskDeadline(task);
}

function getTaskState(task: {
  deadline?: string;
  scheduledDate?: string;
  completedAt?: number;
  status?: string;
  updatedAt: number;
  cancelledAt?: number;
}): LegacyTaskStatus {
  if (isCancelledTask(task)) return "cancelled";
  if (isCompletedTask(task)) return "completed";
  return getTaskDeadline(task) ? "scheduled" : "inbox";
}

function toCanonicalTaskShape(task: Doc<"tasks">) {
  return {
    _id: task._id,
    _creationTime: task._creationTime,
    title: task.title,
    description: task.description,
    deadline: getTaskDeadline(task),
    scheduledAt: task.scheduledAt ?? task.createdAt,
    completedAt: getTaskCompletedAt(task),
    cancelledAt: getTaskCancelledAt(task),
    position: task.position,
    source: task.source,
    estimatedMinutes: task.estimatedMinutes,
    tags: task.tags,
    priority: task.priority,
    createdBy: task.createdBy,
    ownerTokenIdentifier: task.ownerTokenIdentifier,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
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

async function listOwnedTasks(ctx: TaskCtx, tokenIdentifier: string) {
  const byOwner = ctx.db
    .query("tasks")
    .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier));
  if ("collect" in byOwner && typeof byOwner.collect === "function") {
    return await byOwner.collect();
  }
  return [];
}

async function getNextPositionForLane(
  ctx: TaskCtx,
  tokenIdentifier: string,
  deadline?: string
) {
  const deadlineIndex = deadline
    ? ctx.db
        .query("tasks")
        .withIndex("by_owner_deadline_position", (q) =>
          q.eq("ownerTokenIdentifier", tokenIdentifier).eq("deadline", deadline)
        )
    : null;
  if (
    deadlineIndex &&
    "order" in deadlineIndex &&
    typeof deadlineIndex.order === "function"
  ) {
    const latestTask = await deadlineIndex.order("desc").first();
    return (latestTask?.position ?? -1) + 1;
  }

  const tasks = await listOwnedTasks(ctx, tokenIdentifier);
  let maxPosition = -1;
  for (const task of tasks) {
    if (isCancelledTask(task) || isCompletedTask(task)) continue;
    if (deadline) {
      if (getTaskDeadline(task) !== deadline) continue;
    } else if (!isInboxTask(task)) {
      continue;
    }
    maxPosition = Math.max(maxPosition, task.position);
  }
  return maxPosition + 1;
}

async function migrateNativeTaskRows(
  ctx: MutationCtx,
  tasks: Doc<"tasks">[]
) {
  const migratedTaskIds: Id<"tasks">[] = [];

  for (const task of tasks) {
    if (!isNativeTask(task)) continue;
    const nextDeadline = task.scheduledDate ?? task.deadline;
    const nextCompletedAt = getTaskCompletedAt(task);
    const nextCancelledAt = getTaskCancelledAt(task);

    await ctx.db.patch(task._id, {
      deadline: nextDeadline,
      scheduledAt: task.scheduledAt ?? task.createdAt,
      completedAt: nextCompletedAt,
      cancelledAt: nextCancelledAt,
      scheduledDate: undefined,
      status: undefined,
      type: undefined,
      updatedAt: task.updatedAt,
    });
    migratedTaskIds.push(task._id);
  }

  return {
    migratedCount: migratedTaskIds.length,
    migratedTaskIds,
  };
}

async function migrateNativeTasksForOwner(
  ctx: MutationCtx,
  tokenIdentifier: string
) {
  return migrateNativeTaskRows(ctx, await listOwnedTasks(ctx, tokenIdentifier));
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
    return listTasksForOwner(ctx, tokenIdentifier, args);
  },
});

export async function listTasksForOwner(
  ctx: QueryCtx,
  tokenIdentifier: string,
  args: ListTasksArgs
) {
  const tasks = await listOwnedTasks(ctx, tokenIdentifier);
  const visible = tasks
    .filter((task) => {
      const state = getTaskState(task);
      if (args.status && state !== args.status) return false;
      if (args.date && getTaskDeadline(task) !== args.date) return false;
      if (!args.status && state === "cancelled") return false;
      return true;
    })
    .map(toCanonicalTaskShape);

  if (args.status === "completed") {
    visible.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return visible;
  }

  visible.sort(
    (a, b) =>
      (a.deadline ?? "").localeCompare(b.deadline ?? "") ||
      getPriorityRank(a.priority) - getPriorityRank(b.priority) ||
      a.position - b.position
  );
  return visible;
}

export const listBoardTasks = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const tasks = await listOwnedTasks(ctx, tokenIdentifier);
    return tasks
      .filter((task) => isInboxTask(task) || isTimelineTask(task))
      .map(toCanonicalTaskShape);
  },
});

export const listTodayCompletedTasks = query({
  args: {
    dayStartMs: v.number(),
    dayEndMs: v.number(),
  },
  handler: async (ctx, { dayStartMs, dayEndMs }) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const tasks = await listOwnedTasks(ctx, tokenIdentifier);
    return tasks
      .filter((task) => {
        const completedAt = getTaskCompletedAt(task);
        if (!isCompletedTask(task) || completedAt === undefined) return false;
        return completedAt >= dayStartMs && completedAt < dayEndMs;
      })
      .map(toCanonicalTaskShape);
  },
});

export const addTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
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
    return addTaskForOwner(ctx, tokenIdentifier, args);
  },
});

export async function addTaskForOwner(
  ctx: MutationCtx,
  tokenIdentifier: string,
  args: AddTaskArgs
) {
  const deadline = args.deadline;
  const position = await getNextPositionForLane(ctx, tokenIdentifier, deadline);
  const now = Date.now();

  return await ctx.db.insert("tasks", {
    title: args.title,
    description: args.description,
    deadline,
    scheduledAt: now,
    completedAt: undefined,
    position,
    source: args.source || "manual",
    estimatedMinutes: args.estimatedMinutes,
    tags: args.tags,
    priority: args.priority,
    createdBy: tokenIdentifier,
    ownerTokenIdentifier: tokenIdentifier,
    createdAt: now,
    updatedAt: now,
    cancelledAt: undefined,
  });
}

export const moveTask = mutation({
  args: {
    taskId: v.id("tasks"),
    targetDate: v.string(),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    await moveTaskForOwner(ctx, tokenIdentifier, args);
  },
});

export async function moveTaskForOwner(
  ctx: MutationCtx,
  tokenIdentifier: string,
  args: MoveTaskArgs
) {
  const task = await getOwnedTask(ctx, args.taskId, tokenIdentifier);

  if (isCancelledTask(task)) {
    throw new Error("Task is cancelled");
  }
  if (isCompletedTask(task)) {
    throw new Error("Task is completed");
  }

  const newPosition =
    args.position ??
    (await getNextPositionForLane(ctx, tokenIdentifier, args.targetDate));

  await ctx.db.patch(args.taskId, {
    deadline: args.targetDate,
    position: newPosition,
    updatedAt: Date.now(),
  });
}

export const rescheduleTasks = mutation({
  args: {
    updates: v.array(
      v.object({ taskId: v.id("tasks"), deadline: v.string() })
    ),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const positionByDate = new Map<string, number>();
    const changed: Id<"tasks">[] = [];

    for (const { taskId, deadline } of args.updates) {
      let task;
      try {
        task = await getOwnedTask(ctx, taskId, tokenIdentifier);
      } catch {
        continue;
      }
      if (isCompletedTask(task) || isCancelledTask(task)) continue;

      const target = deadline;
      if (getTaskDeadline(task) === target) {
        continue;
      }

      let position = positionByDate.get(target);
      if (position === undefined) {
        position = await getNextPositionForLane(ctx, tokenIdentifier, target);
      }

      await ctx.db.patch(taskId, {
        deadline: target,
        position,
        updatedAt: Date.now(),
      });
      positionByDate.set(target, position + 1);
      changed.push(taskId);
    }

    return { changed };
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
      if (getTaskDeadline(task) !== args.date || isCompletedTask(task) || isCancelledTask(task)) {
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
    const deadline = getTaskDeadline(task);

    if (!deadline || isCompletedTask(task) || isCancelledTask(task)) {
      throw new Error("Task is not scheduled");
    }

    const tasksForDate = (await listOwnedTasks(ctx, tokenIdentifier))
      .filter(
        (candidate) =>
          !isCompletedTask(candidate) &&
          !isCancelledTask(candidate) &&
          getTaskDeadline(candidate) === deadline
      )
      .sort(
        (a, b) =>
          getPriorityRank(a.priority) - getPriorityRank(b.priority) ||
          a.position - b.position
      );

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
      if (!isInboxTask(task)) {
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
    await completeTaskForOwner(ctx, tokenIdentifier, args.taskId);
  },
});

export async function completeTaskForOwner(
  ctx: MutationCtx,
  tokenIdentifier: string,
  taskId: Id<"tasks">
) {
  const task = await getOwnedTask(ctx, taskId, tokenIdentifier);
  if (isCancelledTask(task)) {
    throw new Error("Task is cancelled");
  }
  if (isCompletedTask(task)) {
    return;
  }
  const now = Date.now();
  await ctx.db.patch(taskId, {
    completedAt: now,
    updatedAt: now,
  });
}

export const reopenTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    await reopenTaskForOwner(ctx, tokenIdentifier, args.taskId);
  },
});

export async function reopenTaskForOwner(
  ctx: MutationCtx,
  tokenIdentifier: string,
  taskId: Id<"tasks">
) {
  const task = await getOwnedTask(ctx, taskId, tokenIdentifier);
  if (!isCompletedTask(task)) {
    throw new Error("Task is not completed");
  }

  const deadline = getTaskDeadline(task);
  const updates: {
    completedAt: undefined;
    position?: number;
    updatedAt: number;
  } = {
    completedAt: undefined,
    updatedAt: Date.now(),
  };

  if (!deadline) {
    updates.position = await getNextPositionForLane(ctx, tokenIdentifier, undefined);
  }

  await ctx.db.patch(taskId, updates);
}

export const unscheduleTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    await unscheduleTaskForOwner(ctx, tokenIdentifier, args.taskId);
  },
});

export async function unscheduleTaskForOwner(
  ctx: MutationCtx,
  tokenIdentifier: string,
  taskId: Id<"tasks">
) {
  const task = await getOwnedTask(ctx, taskId, tokenIdentifier);
  if (!isTimelineTask(task)) {
    throw new Error("Task is not scheduled");
  }

  const position = await getNextPositionForLane(ctx, tokenIdentifier, undefined);

  await ctx.db.patch(taskId, {
    deadline: undefined,
    position,
    updatedAt: Date.now(),
  });
}

export const migrateNativeTasksToDeadlineModel = mutation({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    return await migrateNativeTasksForOwner(ctx, tokenIdentifier);
  },
});

export const migrateAllNativeTasksToDeadlineModel = internalMutation({
  args: {},
  handler: async (ctx) => {
    return migrateNativeTaskRows(ctx, await ctx.db.query("tasks").collect());
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
    const task = await getOwnedTask(ctx, args.taskId, tokenIdentifier);

    const updates: Partial<{
      title: string;
      description: string | undefined;
      deadline: string | undefined;
      estimatedMinutes: number | undefined;
      tags: string[] | undefined;
      priority: "p1" | "p2" | "p3" | undefined;
      position: number;
      updatedAt: number;
    }> = {};

    if (Object.prototype.hasOwnProperty.call(args, "title")) {
      updates.title = args.title;
    }
    if (Object.prototype.hasOwnProperty.call(args, "description")) {
      updates.description = args.description;
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

    const deadlineProvided = Object.prototype.hasOwnProperty.call(args, "deadline");
    if (deadlineProvided) {
      const previousDeadline = getTaskDeadline(task);
      const nextDeadline = args.deadline;
      updates.deadline = nextDeadline;

      if (!isCompletedTask(task) && !isCancelledTask(task)) {
        if (nextDeadline) {
          const staysInSameSlot = previousDeadline === nextDeadline;
          updates.position = staysInSameSlot
            ? task.position
            : await getNextPositionForLane(ctx, tokenIdentifier, nextDeadline);
        } else if (previousDeadline) {
          updates.position = await getNextPositionForLane(ctx, tokenIdentifier, undefined);
        }
      }
    }

    await ctx.db.patch(args.taskId, {
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

export const softDeleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    await getOwnedTask(ctx, args.taskId, tokenIdentifier);
    await ctx.db.patch(args.taskId, {
      cancelledAt: Date.now(),
      completedAt: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const restoreTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const task = await getOwnedTask(ctx, args.taskId, tokenIdentifier);
    if (!isCancelledTask(task)) {
      throw new Error("Task is not pending deletion");
    }
    const deadline = getTaskDeadline(task);
    const position = await getNextPositionForLane(ctx, tokenIdentifier, deadline);
    await ctx.db.patch(args.taskId, {
      cancelledAt: undefined,
      position,
      updatedAt: Date.now(),
    });
  },
});

const PURGE_GRACE_MS = 30 * 60 * 1000;
export const purgeExpiredCancelledTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PURGE_GRACE_MS;
    const tasks = await ctx.db.query("tasks").collect();

    let purged = 0;
    for (const task of tasks) {
      const cancelledAt = getTaskCancelledAt(task);
      if (cancelledAt !== undefined && cancelledAt < cutoff) {
        await ctx.db.delete(task._id);
        purged += 1;
      }
    }
    return { purged };
  },
});

export const bulkReschedule = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
    targetDate: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    let nextPosition = await getNextPositionForLane(
      ctx,
      tokenIdentifier,
      args.targetDate
    );
    const skippedTaskIds: Id<"tasks">[] = [];

    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task || task.ownerTokenIdentifier !== tokenIdentifier) {
        skippedTaskIds.push(taskId);
        continue;
      }
      if (!isInboxTask(task) && !isTimelineTask(task)) {
        skippedTaskIds.push(taskId);
        continue;
      }

      await ctx.db.patch(taskId, {
        deadline: args.targetDate,
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
    startDate: v.optional(v.string()),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    return getTimelineForOwner(ctx, tokenIdentifier, args);
  },
});

export async function getTimelineForOwner(
  ctx: QueryCtx,
  tokenIdentifier: string,
  args: { startDate?: string; endDate: string }
) {
  const tasks = (await listOwnedTasks(ctx, tokenIdentifier))
    .filter((task) => {
      const deadline = getTaskDeadline(task);
      if (!isTimelineTask(task) || !deadline) return false;
      if (args.startDate && deadline < args.startDate) return false;
      return deadline <= args.endDate;
    })
    .map(toCanonicalTaskShape);

  const grouped: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    const date = task.deadline;
    if (!date) continue;
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(task);
  }

  for (const date of Object.keys(grouped)) {
    grouped[date].sort((a, b) => a.position - b.position);
  }

  return grouped;
}

export const getTaskCounts = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const tasks = await listOwnedTasks(ctx, tokenIdentifier);

    return {
      inboxCount: tasks.filter(isInboxTask).length,
      timelineCount: tasks.filter(isTimelineTask).length,
      completedCount: tasks.filter(isCompletedTask).length,
    };
  },
});
