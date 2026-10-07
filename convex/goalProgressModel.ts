import type { MutationCtx } from "./_generated/server";
import { isCancelledTask, isCompletedTask } from "./taskLifecycle";

/** Idempotent per-task contribution makes live writes and backfill commute. */
export async function syncGoalProgress(ctx: MutationCtx, owner: string, taskId: string) {
  const previous = await ctx.db.query("goalProgressContributions")
    .withIndex("by_owner_task", q => q.eq("ownerTokenIdentifier", owner).eq("taskId", taskId)).unique();
  const id = ctx.db.normalizeId("tasks", taskId);
  const task = id ? await ctx.db.get(id) : null;
  const link = task && task.ownerTokenIdentifier === owner && !isCancelledTask(task)
    ? await ctx.db.query("goalLinks").withIndex("by_owner_task", q =>
        q.eq("ownerTokenIdentifier", owner).eq("taskId", taskId)).order("desc").first() : null;
  const next = link && task ? { goalClientId: link.goalClientId, done: isCompletedTask(task) } : null;
  if (previous?.goalClientId === next?.goalClientId && previous?.done === next?.done) return;
  for (const [value, delta] of [[previous, -1], [next, 1]] as const) {
    if (!value) continue;
    const count = await ctx.db.query("goalProgress").withIndex("by_owner_goal", q =>
      q.eq("ownerTokenIdentifier", owner).eq("goalClientId", value.goalClientId)).unique();
    const total = (count?.total ?? 0) + delta;
    const done = (count?.done ?? 0) + (value.done ? delta : 0);
    if (total < 0 || done < 0 || done > total) throw new Error("Invalid goal progress contribution");
    if (count) await ctx.db.patch(count._id, { total, done });
    else await ctx.db.insert("goalProgress", { ownerTokenIdentifier: owner, goalClientId: value.goalClientId, total, done });
  }
  if (!next) { if (previous) await ctx.db.delete(previous._id); }
  else if (previous) await ctx.db.patch(previous._id, next);
  else await ctx.db.insert("goalProgressContributions", { ownerTokenIdentifier: owner, taskId, ...next });
}
