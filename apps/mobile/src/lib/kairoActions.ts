import type { KairoAction, KairoIdMap } from "./kairoApi";

export interface TaskSnapshot {
  _id: string;
  title: string;
  deadline?: string;
  completedAt?: number;
  cancelledAt?: number;
}

export interface KairoMutations {
  addTask: (args: {
    title: string;
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
  if (before?.deadline) {
    return async () => {
      await mutations.moveTask({ taskId, targetDate: before.deadline! });
    };
  }
  if (
    before &&
    !before.deadline &&
    before.completedAt === undefined &&
    before.cancelledAt === undefined
  ) {
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
            deadline: action.deadline ?? undefined,
            source: "ai-agent",
          })) as string | undefined;
          if (taskId) {
            snapshots.set(taskId, {
              _id: taskId,
              title: action.title,
              deadline: action.deadline ?? undefined,
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
            await mutations.moveTask({ taskId, targetDate: action.deadline });
            if (before) {
              snapshots.set(taskId, {
                ...before,
                deadline: action.deadline,
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
            if (before) snapshots.set(taskId, { ...before, completedAt: Date.now() });
            return {
              action,
              status: "applied",
              taskId,
              undo: async () => {
                await mutations.reopenTask({ taskId });
              },
            };
          case "reopen":
            await mutations.reopenTask({ taskId });
            if (before) {
              snapshots.set(taskId, { ...before, completedAt: undefined });
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
              snapshots.set(taskId, { ...before, deadline: undefined });
            }
            return {
              action,
              status: "applied",
              taskId,
              undo:
                before?.deadline
                  ? async () => {
                      await mutations.moveTask({ taskId, targetDate: before.deadline! });
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
