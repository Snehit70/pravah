import { describe, expect, it, vi } from "vitest";
import {
  applyKairoActions,
  createKairoActionExecutor,
  type KairoActionEnv,
  type KairoMutations,
  type TaskSnapshot,
} from "../lib/kairoActions";
import type { KairoAction } from "../lib/kairoApi";

function makeMutations(overrides: Partial<KairoMutations> = {}): KairoMutations {
  return {
    addTask: vi.fn(async () => "new-id"),
    moveTask: vi.fn(async () => undefined),
    completeTask: vi.fn(async () => undefined),
    reopenTask: vi.fn(async () => undefined),
    unscheduleTask: vi.fn(async () => undefined),
    softDeleteTask: vi.fn(async () => undefined),
    ...overrides,
  };
}

function envFrom(
  mutations: KairoMutations,
  snapshots: Record<string, TaskSnapshot> = {}
): KairoActionEnv {
  return {
    mutations,
    lookupTask: (id) => snapshots[id] ?? null,
  };
}

describe("applyKairoActions", () => {
  it("adds a task and returns a soft-delete undo", async () => {
    const mutations = makeMutations();
    const results = await applyKairoActions(
      [{ kind: "add", title: "Plan launch", scheduledDate: "2026-06-08", type: "deadline" }],
      { taskIdMap: {} },
      envFrom(mutations)
    );

    expect(mutations.addTask).toHaveBeenCalledWith({
      title: "Plan launch",
      type: "deadline",
      scheduledDate: "2026-06-08",
      deadline: "2026-06-08",
      source: "ai-agent",
    });
    expect(results[0]).toMatchObject({ status: "applied", taskId: "new-id" });
    if (results[0]?.status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(mutations.softDeleteTask).toHaveBeenCalledWith({ taskId: "new-id" });
  });

  it("reschedules a task and restores its prior placement on undo", async () => {
    const mutations = makeMutations();
    const results = await applyKairoActions(
      [{ kind: "reschedule", handle: "T1", scheduledDate: "2026-06-10" }],
      { taskIdMap: { T1: "task-1" } },
      envFrom(mutations, {
        "task-1": {
          _id: "task-1",
          title: "Review",
          status: "scheduled",
          type: "open",
          scheduledDate: "2026-06-05",
        },
      })
    );

    expect(mutations.moveTask).toHaveBeenCalledWith({
      taskId: "task-1",
      targetDate: "2026-06-10",
    });
    if (results[0]?.status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(mutations.moveTask).toHaveBeenLastCalledWith({
      taskId: "task-1",
      targetDate: "2026-06-05",
    });
  });

  it("completes a task and undo reopens its prior scheduled placement", async () => {
    const mutations = makeMutations();
    const results = await applyKairoActions(
      [{ kind: "complete", handle: "T1" }],
      { taskIdMap: { T1: "task-1" } },
      envFrom(mutations, {
        "task-1": {
          _id: "task-1",
          title: "Review",
          status: "scheduled",
          type: "open",
          scheduledDate: "2026-06-05",
        },
      })
    );

    if (results[0]?.status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(mutations.reopenTask).toHaveBeenCalledWith({ taskId: "task-1" });
    expect(mutations.moveTask).toHaveBeenCalledWith({
      taskId: "task-1",
      targetDate: "2026-06-05",
    });
  });

  it("reopens a completed task and undo completes it again", async () => {
    const mutations = makeMutations();
    const results = await applyKairoActions(
      [{ kind: "reopen", handle: "T1" }],
      { taskIdMap: { T1: "task-1" } },
      envFrom(mutations, {
        "task-1": { _id: "task-1", title: "Review", status: "completed", type: "open" },
      })
    );

    expect(mutations.reopenTask).toHaveBeenCalledWith({ taskId: "task-1" });
    if (results[0]?.status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(mutations.completeTask).toHaveBeenCalledWith({ taskId: "task-1" });
  });

  it("unschedules a task and restores the date on undo", async () => {
    const mutations = makeMutations();
    const results = await applyKairoActions(
      [{ kind: "unschedule", handle: "T1" }],
      { taskIdMap: { T1: "task-1" } },
      envFrom(mutations, {
        "task-1": {
          _id: "task-1",
          title: "Review",
          status: "scheduled",
          type: "open",
          scheduledDate: "2026-06-05",
        },
      })
    );

    expect(mutations.unscheduleTask).toHaveBeenCalledWith({ taskId: "task-1" });
    if (results[0]?.status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(mutations.moveTask).toHaveBeenCalledWith({
      taskId: "task-1",
      targetDate: "2026-06-05",
    });
  });

  it("skips unknown handles and continues after per-action failures", async () => {
    const mutations = makeMutations({
      completeTask: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const actions: KairoAction[] = [
      { kind: "complete", handle: "T1" },
      { kind: "unschedule", handle: "T2" },
      { kind: "reopen", handle: "T99" },
    ];
    const results = await applyKairoActions(
      actions,
      { taskIdMap: { T1: "task-1", T2: "task-2" } },
      envFrom(mutations)
    );

    expect(results[0]).toMatchObject({ status: "failed", error: "boom" });
    expect(results[1]).toMatchObject({ status: "applied", taskId: "task-2" });
    expect(results[2]).toMatchObject({ status: "skipped" });
  });

  it("keeps post-action snapshots across individually confirmed actions", async () => {
    const mutations = makeMutations();
    const executor = createKairoActionExecutor(
      { taskIdMap: { T1: "task-1" } },
      envFrom(mutations, {
        "task-1": {
          _id: "task-1",
          title: "Review",
          status: "scheduled",
          type: "open",
          scheduledDate: "2026-06-05",
        },
      })
    );

    await executor.apply({ kind: "complete", handle: "T1" });
    const reopened = await executor.apply({ kind: "reopen", handle: "T1" });
    if (reopened.status !== "applied") throw new Error("unreachable");
    await reopened.undo?.();

    expect(mutations.completeTask).toHaveBeenCalledTimes(2);
  });
});
