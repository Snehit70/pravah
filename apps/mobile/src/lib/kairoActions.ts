import type { KairoAction, KairoIdMap } from "./kairoApi";

export interface TaskSnapshot {
  _id: string;
  title: string;
  status: "inbox" | "scheduled" | "completed" | "cancelled";
  type: "open" | "deadline";
  scheduledDate?: string;
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
  softDeleteTask: (args: { taskId: string }) => Promise<unknown>;
}

export interface KairoActionEnv {
  mutations: KairoMutations;
  lookupTask: (taskId: string) => TaskSnapshot | null;
}

export type KairoActionResult =
  | {
      action: KairoAction;
      status: "applied";
      taskId?: string;
      undo: (() => Promise<void>) | null;
    }
  | { action: KairoAction; status: "skipped"; reason: string }
  | { action: KairoAction; status: "failed"; error: string };

export interface KairoActionExecutor {
  apply: (action: KairoAction) => Promise<KairoActionResult>;
}

function buildPlacementUndo(
  before: TaskSnapshot | null,
  taskId: string,
  mutations: KairoMutations
): (() => Promise<void>) | null {
  if (before?.status === "scheduled" && before.scheduledDate) {
    return async () => {
      await mutations.moveTask({ taskId, targetDate: before.scheduledDate! });
    };
  }
  if (before?.status === "inbox") {
    return async () => {
      await mutations.unscheduleTask({ taskId });
    };
  }
  return null;
}

export function createKairoActionExecutor(
  maps: { taskIdMap: KairoIdMap },
  env: KairoActionEnv
): KairoActionExecutor {
  const snapshots = new Map<string, TaskSnapshot>();
  const lookupCurrent = (taskId: string) => snapshots.get(taskId) ?? env.lookupTask(taskId);

  return {
    async apply(action) {
      const { mutations } = env;
      try {
        if (action.kind === "add") {
          const taskId = (await mutations.addTask({
            title: action.title,
            type: action.type,
            scheduledDate: action.scheduledDate ?? undefined,
            deadline: action.type === "deadline" ? action.scheduledDate ?? undefined : undefined,
            source: "ai-agent",
          })) as string | undefined;
          if (taskId) {
            snapshots.set(taskId, {
              _id: taskId,
              title: action.title,
              status: action.scheduledDate ? "scheduled" : "inbox",
              type: action.type,
              scheduledDate: action.scheduledDate ?? undefined,
            });
          }
          return {
            action,
            status: "applied",
            taskId,
            undo: taskId
              ? async () => {
                  await mutations.softDeleteTask({ taskId });
                }
              : null,
          };
        }

        const taskId = maps.taskIdMap[action.handle];
        if (!taskId) {
          return {
            action,
            status: "skipped",
            reason: `Unknown task handle "${action.handle}"`,
          };
        }

        const before = lookupCurrent(taskId);
        switch (action.kind) {
          case "reschedule":
            await mutations.moveTask({ taskId, targetDate: action.scheduledDate });
            if (before) {
              snapshots.set(taskId, {
                ...before,
                status: "scheduled",
                scheduledDate: action.scheduledDate,
              });
            }
            return {
              action,
              status: "applied",
              taskId,
              undo: buildPlacementUndo(before, taskId, mutations),
            };
          case "complete":
            await mutations.completeTask({ taskId });
            if (before) snapshots.set(taskId, { ...before, status: "completed" });
            return {
              action,
              status: "applied",
              taskId,
              undo: async () => {
                await mutations.reopenTask({ taskId });
                if (before?.status === "scheduled" && before.scheduledDate) {
                  await mutations.moveTask({ taskId, targetDate: before.scheduledDate });
                }
              },
            };
          case "reopen":
            await mutations.reopenTask({ taskId });
            if (before) {
              snapshots.set(taskId, { ...before, status: "inbox", scheduledDate: undefined });
            }
            return {
              action,
              status: "applied",
              taskId,
              undo: async () => {
                await mutations.completeTask({ taskId });
              },
            };
          case "unschedule":
            await mutations.unscheduleTask({ taskId });
            if (before) {
              snapshots.set(taskId, { ...before, status: "inbox", scheduledDate: undefined });
            }
            return {
              action,
              status: "applied",
              taskId,
              undo:
                before?.status === "scheduled" && before.scheduledDate
                  ? async () => {
                      await mutations.moveTask({ taskId, targetDate: before.scheduledDate! });
                    }
                  : null,
            };
        }
      } catch (error) {
        return {
          action,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export async function applyKairoActions(
  actions: KairoAction[],
  maps: { taskIdMap: KairoIdMap },
  env: KairoActionEnv
): Promise<KairoActionResult[]> {
  const executor = createKairoActionExecutor(maps, env);
  const results: KairoActionResult[] = [];
  for (const action of actions) {
    results.push(await executor.apply(action));
  }
  return results;
}
