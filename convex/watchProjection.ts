import { query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";
import { syncWatchTask } from "./watchProjectionModel";
import { listBoardTasksForOwner, listTodayCompletedTasksForOwner } from "./tasks";
import { getTaskState } from "./taskLifecycle";
import { listGoalLinksForOwner } from "./goalLinkQueries";

async function backfill(ctx: MutationCtx, owner: string) {
  const state = await ctx.db.query("watchBackfills")
    .withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner)).unique();
  if (state?.ready) return;
  const page = await ctx.db.query("tasks")
    .withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner))
    .paginate({ cursor: state?.cursor ?? null, numItems: 100, maximumRowsRead: 100, maximumBytesRead: 256 * 1024 });
  for (const task of page.page) await syncWatchTask(ctx, owner, String(task._id), task);
  const value = { ready: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  if (state) await ctx.db.patch(state._id, value);
  else await ctx.db.insert("watchBackfills", { ownerTokenIdentifier: owner, ...value });
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.watchProjection.prepareForOwner, { owner });
}

export const prepareForOwner = internalMutation({
  args: { owner: v.string() },
  handler: (ctx, { owner }) => backfill(ctx, owner),
});

const sourcePart = v.optional(v.union(v.literal("inbox"), v.literal("timeline")));

/**
 * Without `part`, returns the whole board (the contract older watchers use).
 * With `part`, returns one disjoint half: "inbox" holds undated active tasks and
 * "timeline" holds dated active tasks plus today's completions. Each half reads
 * its own index range, so a write to an inbox task does not re-read the
 * timeline and vice versa. Merging both halves equals the unsplit result.
 */
export const sources = query({
  args: { dayStartMs: v.number(), dayEndMs: v.number(), part: sourcePart },
  handler: async (ctx, { dayStartMs, dayEndMs, part }) => {
    if (!Number.isFinite(dayStartMs) || !Number.isFinite(dayEndMs) ||
        dayEndMs <= dayStartMs || dayEndMs - dayStartMs > 26 * 60 * 60 * 1000) {
      throw new Error("Invalid watch day window");
    }
    const owner = await requireTokenIdentifier(ctx);
    const state = await ctx.db.query("watchBackfills")
      .withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner)).unique();
    // A partly populated read model must never undercount the board.
    if (!state?.ready) {
      const [allBoardTasks, allCompletedToday] = await Promise.all([
        listBoardTasksForOwner(ctx, owner),
        listTodayCompletedTasksForOwner(ctx, owner, dayStartMs, dayEndMs),
      ]);
      const boardTasks = part === undefined ? allBoardTasks
        : allBoardTasks.filter(task => (getTaskState(task) === "inbox") === (part === "inbox"));
      const completedToday = part === "inbox" ? [] : allCompletedToday;
      const ids = [...new Set([...boardTasks, ...completedToday].map(task => String(task._id)))];
      const goalLinks: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 500) {
        Object.assign(goalLinks, await listGoalLinksForOwner(ctx, owner, ids.slice(i, i + 500)));
      }
      return { boardTasks, completedToday, goalLinks };
    }
    const activeRows = (range: "inbox" | "timeline" | "all") => ctx.db.query("watchTasks")
      .withIndex("by_owner_completion_status", q => {
        const active = q.eq("ownerTokenIdentifier", owner).eq("completedAt", undefined);
        if (range === "inbox") return active.eq("status", "inbox");
        // "scheduled" and any legacy "completed" row without a completion time.
        if (range === "timeline") return active.gt("status", "inbox");
        return active;
      }).collect();
    const [active, done] = await Promise.all([
      activeRows(part ?? "all"),
      part === "inbox" ? Promise.resolve([]) : ctx.db.query("watchTasks").withIndex("by_owner_completion_status", q =>
        q.eq("ownerTokenIdentifier", owner).gte("completedAt", dayStartMs).lt("completedAt", dayEndMs)).collect(),
    ]);
    const shape = (row: typeof active[number]) => {
      const { _id: _, _creationTime: __, ownerTokenIdentifier: ___, taskId, ...fields } = row;
      return { _id: taskId, ...fields };
    };
    return {
      boardTasks: active.map(shape),
      completedToday: done.map(shape),
      goalLinks: Object.fromEntries([...active, ...done].filter(row => row.goalId).map(row => [row.taskId, row.goalId!])),
    };
  },
});
