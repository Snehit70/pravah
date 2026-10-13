import { query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";
import { syncWatchTask } from "./watchProjectionModel";
import { listBoardTasksForOwner, listTodayCompletedTasksForOwner } from "./tasks";
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

export const sources = query({
  args: { dayStartMs: v.number(), dayEndMs: v.number() },
  handler: async (ctx, { dayStartMs, dayEndMs }) => {
    if (!Number.isFinite(dayStartMs) || !Number.isFinite(dayEndMs) ||
        dayEndMs <= dayStartMs || dayEndMs - dayStartMs > 26 * 60 * 60 * 1000) {
      throw new Error("Invalid watch day window");
    }
    const owner = await requireTokenIdentifier(ctx);
    const state = await ctx.db.query("watchBackfills")
      .withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner)).unique();
    // A partly populated read model must never undercount the board.
    if (!state?.ready) {
      const [boardTasks, completedToday] = await Promise.all([
        listBoardTasksForOwner(ctx, owner),
        listTodayCompletedTasksForOwner(ctx, owner, dayStartMs, dayEndMs),
      ]);
      const ids = [...new Set([...boardTasks, ...completedToday].map(task => String(task._id)))];
      const goalLinks: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 500) {
        Object.assign(goalLinks, await listGoalLinksForOwner(ctx, owner, ids.slice(i, i + 500)));
      }
      return { boardTasks, completedToday, goalLinks };
    }
    const [active, done] = await Promise.all([
      ctx.db.query("watchTasks").withIndex("by_owner_completion", q =>
        q.eq("ownerTokenIdentifier", owner).eq("completedAt", undefined)).collect(),
      ctx.db.query("watchTasks").withIndex("by_owner_completion", q =>
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
