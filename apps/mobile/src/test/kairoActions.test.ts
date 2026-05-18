import { describe, expect, it, vi } from "vitest";
import {
  applyKairoActions,
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
    updateTask: vi.fn(async () => undefined),
    softDeleteTask: vi.fn(async () => undefined),
    restoreTask: vi.fn(async () => undefined),
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
  it("dispatches add-task and returns an undo that soft-deletes the new task", async () => {
    const m = makeMutations();
    const actions: KairoAction[] = [
      { kind: "add", title: "x", scheduledDate: "2026-05-20", type: "open" },
    ];
    const results = await applyKairoActions(actions, {}, envFrom(m));
    expect(m.addTask).toHaveBeenCalledWith({
      title: "x",
      type: "open",
      scheduledDate: "2026-05-20",
      deadline: undefined,
      source: "ai-agent",
    });
    expect(results[0]).toMatchObject({ status: "applied", taskId: "new-id" });
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.softDeleteTask).toHaveBeenCalledWith({ taskId: "new-id" });
  });

  it("passes deadline through for type=deadline adds", async () => {
    const m = makeMutations();
    await applyKairoActions(
      [{ kind: "add", title: "x", scheduledDate: "2026-05-20", type: "deadline" }],
      {},
      envFrom(m)
    );
    expect(m.addTask).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: "2026-05-20", type: "deadline" })
    );
  });

  it("resolves a handle and calls moveTask for reschedule, with undo moving it back", async () => {
    const m = makeMutations();
    const env = envFrom(m, {
      "real-1": {
        _id: "real-1",
        title: "x",
        status: "scheduled",
        type: "open",
        scheduledDate: "2026-05-10",
      },
    });
    const results = await applyKairoActions(
      [{ kind: "reschedule", handle: "T1", scheduledDate: "2026-05-22" }],
      { T1: "real-1" },
      env
    );
    expect(m.moveTask).toHaveBeenCalledWith({ taskId: "real-1", targetDate: "2026-05-22" });
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.moveTask).toHaveBeenLastCalledWith({ taskId: "real-1", targetDate: "2026-05-10" });
  });

  it("reschedule undo unschedules when the task was previously in the inbox", async () => {
    const m = makeMutations();
    const env = envFrom(m, {
      r1: { _id: "r1", title: "x", status: "inbox", type: "open" },
    });
    const results = await applyKairoActions(
      [{ kind: "reschedule", handle: "T1", scheduledDate: "2026-05-22" }],
      { T1: "r1" },
      env
    );
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.unscheduleTask).toHaveBeenCalledWith({ taskId: "r1" });
  });

  it("complete + undo reopens the task and restores its scheduled placement", async () => {
    const m = makeMutations();
    const env = envFrom(m, {
      r1: { _id: "r1", title: "x", status: "scheduled", type: "open", scheduledDate: "2026-05-15" },
    });
    const results = await applyKairoActions(
      [{ kind: "complete", handle: "T1" }],
      { T1: "r1" },
      env
    );
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.reopenTask).toHaveBeenCalledWith({ taskId: "r1" });
    expect(m.moveTask).toHaveBeenCalledWith({ taskId: "r1", targetDate: "2026-05-15" });
  });

  it("delete routes to soft delete and undo calls restore", async () => {
    const m = makeMutations();
    const env = envFrom(m, { r1: { _id: "r1", title: "x", status: "scheduled", type: "open" } });
    const results = await applyKairoActions(
      [{ kind: "delete", handle: "T1" }],
      { T1: "r1" },
      env
    );
    expect(m.softDeleteTask).toHaveBeenCalledWith({ taskId: "r1" });
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.restoreTask).toHaveBeenCalledWith({ taskId: "r1" });
  });

  it("update + undo restores only the fields that were actually changed", async () => {
    const m = makeMutations();
    const env = envFrom(m, {
      r1: { _id: "r1", title: "Old", status: "inbox", type: "open", priority: "p3" },
    });
    const results = await applyKairoActions(
      [{ kind: "update", handle: "T1", title: "New", priority: "p1" }],
      { T1: "r1" },
      env
    );
    expect(m.updateTask).toHaveBeenLastCalledWith({
      taskId: "r1",
      title: "New",
      priority: "p1",
      deadline: undefined,
    });
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.updateTask).toHaveBeenLastCalledWith({
      taskId: "r1",
      title: "Old",
      priority: "p3",
      deadline: undefined,
    });
  });

  it("skips actions whose handle is not in the idMap", async () => {
    const m = makeMutations();
    const actions: KairoAction[] = [{ kind: "complete", handle: "T99" }];
    const results = await applyKairoActions(actions, {}, envFrom(m));
    expect(m.completeTask).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ status: "skipped" });
  });

  it("captures mutation throws as 'failed' but keeps processing later actions", async () => {
    const m = makeMutations({
      completeTask: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const env = envFrom(m, { r1: { _id: "r1", title: "a", status: "scheduled", type: "open" } });
    const actions: KairoAction[] = [
      { kind: "complete", handle: "T1" },
      { kind: "delete", handle: "T2" },
    ];
    const results = await applyKairoActions(actions, { T1: "r1", T2: "r2" }, env);
    expect(results[0]).toMatchObject({ status: "failed", error: "boom" });
    expect(results[1]).toMatchObject({ status: "applied", taskId: "r2" });
    expect(m.softDeleteTask).toHaveBeenCalledWith({ taskId: "r2" });
  });
});
