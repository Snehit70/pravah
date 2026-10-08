import { query, internalMutation } from "./_generated/server";
import { mutation } from "./writeServer";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";
import { syncGoalProgress } from "./goalProgressModel";
import type { MutationCtx } from "./_generated/server";

export const list = query({ args: {}, handler: async ctx => {
  const owner = await requireTokenIdentifier(ctx);
  const state = await ctx.db.query("goalProgressBackfills").withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner)).unique();
  if (!state?.ready) return { ready: false, progress: {} as Record<string, {total: number; done: number}> };
  const counts = await ctx.db.query("goalProgress").withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner)).collect();
  return { ready: true, progress: Object.fromEntries(counts.map(row => [row.goalClientId, {total: row.total, done: row.done}])) };
} });

async function backfillOwner(ctx: MutationCtx, owner: string) {
  const state = await ctx.db.query("goalProgressBackfills").withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner)).unique();
  if (state?.ready) return;
  const page = await ctx.db.query("goalLinks").withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner))
    .paginate({numItems: 100, cursor: state?.cursor ?? null, maximumRowsRead: 100});
  for (const taskId of new Set(page.page.map(link => link.taskId))) await syncGoalProgress(ctx, owner, taskId);
  const value = {ready: page.isDone, cursor: page.isDone ? null : page.continueCursor};
  if (state) await ctx.db.patch(state._id, value);
  else await ctx.db.insert("goalProgressBackfills", {ownerTokenIdentifier: owner, ...value});
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.goalProgress.continueBackfill, {owner});
}
export const prepare = mutation({args: {}, handler: async ctx => backfillOwner(ctx, await requireTokenIdentifier(ctx))});
export const continueBackfill = internalMutation({args: {owner: v.string()}, handler: (ctx, {owner}) => backfillOwner(ctx, owner)});
