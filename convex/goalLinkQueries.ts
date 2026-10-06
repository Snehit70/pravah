import type { QueryCtx } from "./_generated/server";
import { isCancelledTask, toCanonicalTaskShape } from "./taskLifecycle";
import type { PaginationOptions } from "convex/server";

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

/** Goal details need linked tasks only, never the owner's unrelated history. */
export async function listGoalTasksForOwner(ctx: QueryCtx, owner: string, goalClientId: string | undefined, options: PaginationOptions) {
  const query = goalClientId === undefined
    ? ctx.db.query("goalLinks").withIndex("by_owner", q => q.eq("ownerTokenIdentifier", owner))
    : ctx.db.query("goalLinks").withIndex("by_owner_goal", q => q.eq("ownerTokenIdentifier", owner).eq("goalClientId", goalClientId));
  const { page, ...pagination } = await query.paginate({ ...options,
    numItems: Math.max(1, Math.min(100, options.numItems)), maximumRowsRead: 100, maximumBytesRead: 256 * 1024 });
  const links = Object.fromEntries(page.map(row => [row.taskId, row.goalClientId]));
  const tasks = [];
  for (const taskId of Object.keys(links)) {
    // Old imports can contain dangling/non-Convex IDs. Preserve links but do
    // not throw or expose a task belonging to another owner.
    const id = ctx.db.normalizeId("tasks", taskId);
    if (!id) continue;
    const task = await ctx.db.get(id);
    if (!task || task.ownerTokenIdentifier !== owner || isCancelledTask(task)) continue;
    tasks.push(toCanonicalTaskShape(task));
  }
  return { tasks, links, ...pagination };
}
