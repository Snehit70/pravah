/**
 * Kairo action executor
 *
 * Pure (i.e. UI-free) glue that takes the parsed action list from
 * `extractKairoActions` plus the per-turn idMap from `buildKairoContext` and
 * dispatches each action to the right Convex mutation. We pass mutations in
 * as a struct rather than importing them so the module stays unit-testable.
 *
 * Error policy: failures are *per-action*, not all-or-nothing. A malformed
 * handle skips that action with `{ status: "skipped" }`; a mutation throw
 * surfaces as `{ status: "failed", error }`. Successful actions get
 * `{ status: "applied", undo }` where `undo` runs the inverse mutation(s).
 * The caller renders an action strip from the results, including any
 * skipped/failed entries so the user can see why.
 */

import type { KairoAction, KairoIdMap } from "./kairoApi";

export interface TaskSnapshot {
  _id: string;
  title: string;
  status: "inbox" | "scheduled" | "completed" | "cancelled";
  type: "open" | "deadline";
  scheduledDate?: string;
  priority?: "p1" | "p2" | "p3";
  deadline?: string;
}

export interface KairoMutations {
  addTask: (args: {
    title: string;
    type: "open" | "deadline";
    scheduledDate?: string;
    deadline?: string;
    source: "ai-agent";
  }) => Promise<unknown>;
  moveTask: (args: { taskId: string; targetDate: string }) => Promise<unknown>;
  completeTask: (args: { taskId: string }) => Promise<unknown>;
  reopenTask: (args: { taskId: string }) => Promise<unknown>;
  unscheduleTask: (args: { taskId: string }) => Promise<unknown>;
  updateTask: (args: {
    taskId: string;
    title?: string;
    priority?: "p1" | "p2" | "p3";
    deadline?: string;
  }) => Promise<unknown>;
  /** Soft delete — flips status to "cancelled" and starts the 30-min purge
   *  timer. The default listTasks query hides cancelled rows so the task
   *  disappears from the UI immediately. */
  softDeleteTask: (args: { taskId: string }) => Promise<unknown>;
  /** Restore a soft-deleted task. Sends it back to the inbox (not its prior
   *  scheduled slot — see convex/tasks.ts restoreTask for why). */
  restoreTask: (args: { taskId: string }) => Promise<unknown>;
}

export interface KairoActionEnv {
  mutations: KairoMutations;
  /** Snapshot lookup at the moment the action runs. Used to capture before-
   *  state so we can synthesize an inverse mutation for undo. */
  lookupTask: (taskId: string) => TaskSnapshot | null;
}

export type KairoActionResult =
  | {
      action: KairoAction;
      status: "applied";
      taskId?: string;
      /** Inverse mutation. Null when no meaningful undo exists (e.g. the
       *  before-state was lost). Idempotent — calling twice is harmless. */
      undo: (() => Promise<void>) | null;
    }
  | { action: KairoAction; status: "skipped"; reason: string }
  | { action: KairoAction; status: "failed"; error: string };

function resolveHandle(handle: string, idMap: KairoIdMap): string | null {
  return idMap[handle] ?? null;
}

function buildRescheduleUndo(
  before: TaskSnapshot,
  taskId: string,
  mutations: KairoMutations
): (() => Promise<void>) | null {
  // Restore the task to its prior placement. Three cases worth handling:
  //   - was scheduled on a different date → moveTask back to that date
  //   - was in inbox → unscheduleTask
  //   - was anything else (completed/cancelled) → best-effort: send to inbox
  if (before.status === "scheduled" && before.scheduledDate) {
    const prior = before.scheduledDate;
    return async () => {
      await mutations.moveTask({ taskId, targetDate: prior });
    };
  }
  if (before.status === "inbox") {
    return async () => {
      await mutations.unscheduleTask({ taskId });
    };
  }
  return null;
}

function buildUpdateUndo(
  before: TaskSnapshot,
  taskId: string,
  action: Extract<KairoAction, { kind: "update" }>,
  mutations: KairoMutations
): () => Promise<void> {
  return async () => {
    const restoreArgs: Parameters<typeof mutations.updateTask>[0] = { taskId };
    if (action.title !== undefined) restoreArgs.title = before.title;
    if (action.priority !== undefined) restoreArgs.priority = before.priority;
    // Only include deadline key when the action touched it, so the undo
    // mutation's hasOwnProperty check correctly scopes the field.
    if (action.deadline !== undefined) restoreArgs.deadline = before.deadline;
    await mutations.updateTask(restoreArgs);

    // Convex's updateTask can mutate status/scheduledDate as a side-effect of
    // changing deadline (e.g. clearing the deadline of an auto-scheduled task
    // sends it to inbox; setting a deadline on a scheduled task moves it). After
    // replaying the prior deadline, those side-effects don't necessarily revert
    // — explicitly restore the prior placement.
    if (action.deadline !== undefined) {
      if (before.status === "scheduled" && before.scheduledDate) {
        await mutations.moveTask({ taskId, targetDate: before.scheduledDate });
      } else if (before.status === "inbox") {
        await mutations.unscheduleTask({ taskId });
      }
    }
  };
}

export async function applyKairoActions(
  actions: KairoAction[],
  idMap: KairoIdMap,
  env: KairoActionEnv
): Promise<KairoActionResult[]> {
  const { mutations, lookupTask } = env;
  const results: KairoActionResult[] = [];
  // Local snapshot cache updated after each mutation so multi-action sequences
  // on the same task build undo closures from the correct post-mutation state
  // rather than the stale pre-turn snapshot.
  const localSnapshots = new Map<string, TaskSnapshot>();
  const lookupCurrent = (taskId: string): TaskSnapshot | null =>
    localSnapshots.get(taskId) ?? lookupTask(taskId);

  for (const action of actions) {
    try {
      if (action.kind === "add") {
        const taskId = (await mutations.addTask({
          title: action.title,
          type: action.type,
          scheduledDate: action.scheduledDate ?? undefined,
          deadline:
            action.type === "deadline" ? action.scheduledDate ?? undefined : undefined,
          source: "ai-agent",
        })) as string | undefined;
        // Undo for an add is a soft delete on the newly created task. If the
        // mutation didn't return an id we can't undo (shouldn't happen with
        // Convex, but keep the type honest).
        const undo = taskId
          ? async () => {
              await mutations.softDeleteTask({ taskId });
            }
          : null;
        results.push({ action, status: "applied", taskId, undo });
        continue;
      }

      const taskId = resolveHandle(action.handle, idMap);
      if (!taskId) {
        results.push({
          action,
          status: "skipped",
          reason: `Unknown task handle "${action.handle}"`,
        });
        continue;
      }

      const before = lookupCurrent(taskId);
      let undo: (() => Promise<void>) | null = null;

      switch (action.kind) {
        case "reschedule":
          await mutations.moveTask({ taskId, targetDate: action.scheduledDate });
          if (before) undo = buildRescheduleUndo(before, taskId, mutations);
          if (before) localSnapshots.set(taskId, { ...before, status: "scheduled", scheduledDate: action.scheduledDate });
          break;
        case "complete":
          await mutations.completeTask({ taskId });
          undo = async () => {
            await mutations.reopenTask({ taskId });
            // reopenTask sends the task back to the inbox. If it was scheduled
            // before completing, restore that placement too.
            if (before?.status === "scheduled" && before.scheduledDate) {
              await mutations.moveTask({ taskId, targetDate: before.scheduledDate });
            }
          };
          if (before) localSnapshots.set(taskId, { ...before, status: "completed" });
          break;
        case "unschedule":
          await mutations.unscheduleTask({ taskId });
          if (before?.status === "scheduled" && before.scheduledDate) {
            const prior = before.scheduledDate;
            undo = async () => {
              await mutations.moveTask({ taskId, targetDate: prior });
            };
          }
          if (before) localSnapshots.set(taskId, { ...before, status: "inbox", scheduledDate: undefined });
          break;
        case "update": {
          // Only include keys the parser explicitly set. The Convex mutation
          // uses hasOwnProperty for title, priority, and deadline, so a
          // present-but-undefined key is interpreted as "clear this field".
          const updateArgs: Parameters<typeof mutations.updateTask>[0] = { taskId };
          if (action.title !== undefined) updateArgs.title = action.title;
          if (action.priority !== undefined) updateArgs.priority = action.priority;
          if (action.deadline !== undefined) {
            // null → clear (key present, value undefined); string → set
            updateArgs.deadline = action.deadline ?? undefined;
          }
          await mutations.updateTask(updateArgs);
          if (before) undo = buildUpdateUndo(before, taskId, action, mutations);
          if (before) {
            const nextDeadline =
              action.deadline !== undefined ? action.deadline ?? undefined : before.deadline;
            const snap: TaskSnapshot = {
              ...before,
              title: action.title !== undefined ? action.title : before.title,
              priority: action.priority !== undefined ? action.priority : before.priority,
              deadline: nextDeadline,
            };
            // Mirror convex/tasks.ts updateTask side-effects so a later action
            // in the same turn sees the post-mutation scheduling state. The
            // convex checks are type-sensitive (shouldPreserveInboxOpenTask
            // requires type === "open"; wasAutoScheduledByDeadline requires
            // type === "deadline"), so include type in the mirror.
            if (action.deadline !== undefined) {
              if (action.deadline) {
                const shouldPreserveInboxOpen =
                  before.status === "inbox" &&
                  before.type === "open" &&
                  !before.scheduledDate;
                if (shouldPreserveInboxOpen) {
                  snap.type = "open";
                  snap.status = "inbox";
                  snap.scheduledDate = undefined;
                } else {
                  snap.type = "deadline";
                  if (before.status !== "completed" && before.status !== "cancelled") {
                    snap.status = "scheduled";
                    snap.scheduledDate = action.deadline;
                  }
                }
              } else {
                snap.type = "open";
                const wasAutoScheduledByDeadline =
                  before.status === "scheduled" &&
                  before.type === "deadline" &&
                  !!before.deadline &&
                  before.scheduledDate === before.deadline;
                if (wasAutoScheduledByDeadline) {
                  snap.status = "inbox";
                  snap.scheduledDate = undefined;
                }
              }
            }
            localSnapshots.set(taskId, snap);
          }
          break;
        }
        case "delete":
          await mutations.softDeleteTask({ taskId });
          undo = async () => {
            await mutations.restoreTask({ taskId });
          };
          if (before) localSnapshots.set(taskId, { ...before, status: "cancelled" });
          break;
      }
      results.push({ action, status: "applied", taskId, undo });
    } catch (error) {
      results.push({
        action,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
