import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getTaskDeadline, getTaskCompletedAt, getTaskState, isCancelledTask } from "./taskLifecycle";

export function watchFields(task: Doc<"tasks">) {
  return {
    title: task.title,
    status: getTaskState(task),
    deadline: getTaskDeadline(task),
    time: task.time,
    completedAt: getTaskCompletedAt(task),
    priority: task.priority,
    description: task.description,
    tags: task.tags,
    estimatedMinutes: task.estimatedMinutes,
  };
}

export function affectsWatch(previous: Doc<"tasks"> | null, next: Doc<"tasks"> | null) {
  return !previous || !next || previous.ownerTokenIdentifier !== next.ownerTokenIdentifier ||
    JSON.stringify(watchFields(previous)) !== JSON.stringify(watchFields(next));
}

export async function syncWatchTask(
  ctx: MutationCtx, owner: string, taskId: string, task: Doc<"tasks"> | null,
) {
  const row = await ctx.db.query("watchTasks")
    .withIndex("by_owner_task", q => q.eq("ownerTokenIdentifier", owner).eq("taskId", taskId)).unique();
  if (!task || task.ownerTokenIdentifier !== owner || isCancelledTask(task)) {
    if (row) await ctx.db.delete(row._id);
    return;
  }
  const link = await ctx.db.query("goalLinks")
    .withIndex("by_owner_task", q => q.eq("ownerTokenIdentifier", owner).eq("taskId", taskId)).order("desc").first();
  const fields = {
    ...watchFields(task),
    status: getTaskState(task) as "inbox" | "scheduled" | "completed",
    goalId: link?.goalClientId,
  };
  if (row) {
    const { _id: _, _creationTime: __, ownerTokenIdentifier: ___, taskId: ____, ...oldFields } = row;
    // Convex omits undefined fields; avoid writes and subscription invalidation
    // when a metadata-only update leaves the watcher contract unchanged.
    const nextFields = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (JSON.stringify(Object.entries(oldFields).sort()) === JSON.stringify(nextFields.sort())) return;
    await ctx.db.patch(row._id, fields);
  } else {
    await ctx.db.insert("watchTasks", { ownerTokenIdentifier: owner, taskId, ...fields });
  }
}
