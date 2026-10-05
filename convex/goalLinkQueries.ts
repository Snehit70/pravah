import type { QueryCtx } from "./_generated/server";

/** Omitted selection is the complete history contract; an empty set reads nothing. */
export async function listGoalLinksForOwner(ctx: QueryCtx, owner: string, taskIds?: string[]) {
  if (taskIds && taskIds.length > 500) throw new Error("At most 500 task IDs per query");
  const links = taskIds ? (await Promise.all([...new Set(taskIds)].map((taskId) =>
    ctx.db.query("goalLinks").withIndex("by_owner_task", (q) =>
      q.eq("ownerTokenIdentifier", owner).eq("taskId", taskId)).collect()
  ))).flat() : await ctx.db.query("goalLinks")
    .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", owner)).collect();
  return Object.fromEntries(links.map((link) => [link.taskId, link.goalClientId]));
}
