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
 * `{ status: "applied" }`. The caller renders an action strip from the
 * results, including any skipped/failed entries so the user can see why.
 */

import type { KairoAction, KairoIdMap } from "./kairoApi";

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
  unscheduleTask: (args: { taskId: string }) => Promise<unknown>;
  updateTask: (args: {
    taskId: string;
    title?: string;
    priority?: "p1" | "p2" | "p3";
    deadline?: string;
  }) => Promise<unknown>;
  deleteTask: (args: { taskId: string }) => Promise<unknown>;
}

export type KairoActionResult =
  | { action: KairoAction; status: "applied"; taskId?: string }
  | { action: KairoAction; status: "skipped"; reason: string }
  | { action: KairoAction; status: "failed"; error: string };

function resolveHandle(handle: string, idMap: KairoIdMap): string | null {
  return idMap[handle] ?? null;
}

export async function applyKairoActions(
  actions: KairoAction[],
  idMap: KairoIdMap,
  mutations: KairoMutations
): Promise<KairoActionResult[]> {
  const results: KairoActionResult[] = [];

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
        results.push({ action, status: "applied", taskId });
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

      switch (action.kind) {
        case "reschedule":
          await mutations.moveTask({ taskId, targetDate: action.scheduledDate });
          break;
        case "complete":
          await mutations.completeTask({ taskId });
          break;
        case "unschedule":
          await mutations.unscheduleTask({ taskId });
          break;
        case "update":
          await mutations.updateTask({
            taskId,
            title: action.title,
            priority: action.priority,
            deadline: action.deadline ?? undefined,
          });
          break;
        case "delete":
          await mutations.deleteTask({ taskId });
          break;
      }
      results.push({ action, status: "applied", taskId });
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
