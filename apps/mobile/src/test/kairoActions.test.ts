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
    rescheduleTasks: vi.fn(async () => undefined),
    completeTask: vi.fn(async () => undefined),
    reopenTask: vi.fn(async () => undefined),
    unscheduleTask: vi.fn(async () => undefined),
    updateTask: vi.fn(async () => undefined),
    softDeleteTask: vi.fn(async () => undefined),
    restoreTask: vi.fn(async () => undefined),
    addGoal: vi.fn(async () => "goal-new"),
    updateGoal: vi.fn(async () => undefined),
    deleteGoal: vi.fn(async () => undefined),
    setGoalLink: vi.fn(async () => undefined),
    ...overrides,
  };
}

function envFrom(
  mutations: KairoMutations,
  snapshots: Record<string, TaskSnapshot> = {},
  goals: Record<string, { id: string; text: string; description?: string; deadline?: string; priority?: "p1" | "p2" | "p3" }> = {},
  links: Record<string, string | null> = {}
): KairoActionEnv {
  return {
    mutations,
    lookupTask: (id) => snapshots[id] ?? null,
    lookupGoal: (id) => goals[id] ?? null,
    lookupTaskGoalLink: (taskId) => links[taskId] ?? null,
  };
}

describe("applyKairoActions", () => {
  it("dispatches add-task and returns an undo that soft-deletes the new task", async () => {
    const m = makeMutations();
    const actions: KairoAction[] = [
      { kind: "add", title: "x", scheduledDate: "2026-05-20", type: "open" },
    ];
    const results = await applyKairoActions(actions, { taskIdMap: {}, goalIdMap: {} }, envFrom(m));
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
      { taskIdMap: {}, goalIdMap: {} },
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
      { taskIdMap: { T1: "real-1" }, goalIdMap: {} },
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
      { taskIdMap: { T1: "r1" }, goalIdMap: {} },
      env
    );
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.unscheduleTask).toHaveBeenCalledWith({ taskId: "r1" });
  });

  it("uses the bulk reschedule mutation for batched reflow moves", async () => {
    const m = makeMutations();
    const env = envFrom(m, {
      r1: { _id: "r1", title: "one", status: "scheduled", type: "open", scheduledDate: "2026-05-10" },
      r2: { _id: "r2", title: "two", status: "inbox", type: "open" },
    });
    const results = await applyKairoActions(
      [
        { kind: "reschedule", handle: "T1", scheduledDate: "2026-06-03", batchId: "reflow:g1" },
        { kind: "reschedule", handle: "T2", scheduledDate: "2026-06-04", batchId: "reflow:g1" },
      ],
      { taskIdMap: { T1: "r1", T2: "r2" }, goalIdMap: {} },
      env
    );

    expect(m.rescheduleTasks).toHaveBeenCalledWith({
      updates: [
        { taskId: "r1", scheduledDate: "2026-06-03" },
        { taskId: "r2", scheduledDate: "2026-06-04" },
      ],
    });
    expect(m.moveTask).not.toHaveBeenCalled();
    expect(results.map((result) => result.status)).toEqual(["applied", "applied"]);

    if (results[0]?.status !== "applied" || results[1]?.status !== "applied") {
      throw new Error("unreachable");
    }
    await results[0].undo?.();
    await results[1].undo?.();
    expect(m.moveTask).toHaveBeenCalledWith({ taskId: "r1", targetDate: "2026-05-10" });
    expect(m.unscheduleTask).toHaveBeenCalledWith({ taskId: "r2" });
  });

  it("complete + undo reopens the task and restores its scheduled placement", async () => {
    const m = makeMutations();
    const env = envFrom(m, {
      r1: { _id: "r1", title: "x", status: "scheduled", type: "open", scheduledDate: "2026-05-15" },
    });
    const results = await applyKairoActions(
      [{ kind: "complete", handle: "T1" }],
      { taskIdMap: { T1: "r1" }, goalIdMap: {} },
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
      { taskIdMap: { T1: "r1" }, goalIdMap: {} },
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
      { taskIdMap: { T1: "r1" }, goalIdMap: {} },
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
    const results = await applyKairoActions(actions, { taskIdMap: {}, goalIdMap: {} }, envFrom(m));
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
    const results = await applyKairoActions(
      actions,
      { taskIdMap: { T1: "r1", T2: "r2" }, goalIdMap: {} },
      env
    );
    expect(results[0]).toMatchObject({ status: "failed", error: "boom" });
    expect(results[1]).toMatchObject({ status: "applied", taskId: "r2" });
    expect(m.softDeleteTask).toHaveBeenCalledWith({ taskId: "r2" });
  });

  it("adds a goal and undo deletes it", async () => {
    const m = makeMutations();
    const results = await applyKairoActions(
      [{ kind: "addGoal", text: "Ship v1", priority: "p1" }],
      { taskIdMap: {}, goalIdMap: {} },
      envFrom(m)
    );
    expect(m.addGoal).toHaveBeenCalledWith({
      text: "Ship v1",
      description: undefined,
      deadline: undefined,
      priority: "p1",
    });
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.deleteGoal).toHaveBeenCalledWith({ goalId: "goal-new" });
  });

  it("updates a goal and undo restores prior values", async () => {
    const m = makeMutations();
    const results = await applyKairoActions(
      [{ kind: "updateGoal", handle: "G1", text: "New goal", priority: null }],
      { taskIdMap: {}, goalIdMap: { G1: "g1" } },
      envFrom(
        m,
        {},
        { g1: { id: "g1", text: "Old goal", priority: "p2", description: "x", deadline: "2026-06-01" } }
      )
    );
    expect(m.updateGoal).toHaveBeenCalledWith({
      goalId: "g1",
      text: "New goal",
      priority: undefined,
    });
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.updateGoal).toHaveBeenLastCalledWith({
      goalId: "g1",
      text: "Old goal",
      priority: "p2",
    });
  });

  it("links and unlinks task-goal with undo", async () => {
    const m = makeMutations();
    const linkResults = await applyKairoActions(
      [{ kind: "linkTaskGoal", taskHandle: "T1", goalHandle: "G1" }],
      { taskIdMap: { T1: "t1" }, goalIdMap: { G1: "g1" } },
      envFrom(m, {}, {}, { t1: null })
    );
    expect(m.setGoalLink).toHaveBeenCalledWith({ taskId: "t1", goalId: "g1" });
    if (linkResults[0].status !== "applied") throw new Error("unreachable");
    await linkResults[0].undo?.();
    expect(m.setGoalLink).toHaveBeenLastCalledWith({ taskId: "t1", goalId: null });

    const unlinkResults = await applyKairoActions(
      [{ kind: "unlinkTaskGoal", taskHandle: "T1" }],
      { taskIdMap: { T1: "t1" }, goalIdMap: {} },
      envFrom(m, {}, {}, { t1: "g1" })
    );
    expect(m.setGoalLink).toHaveBeenCalledWith({ taskId: "t1", goalId: null });
    if (unlinkResults[0].status !== "applied") throw new Error("unreachable");
    await unlinkResults[0].undo?.();
    expect(m.setGoalLink).toHaveBeenLastCalledWith({ taskId: "t1", goalId: "g1" });
  });

  it("skips goal actions with unknown goal handles", async () => {
    const m = makeMutations();
    const results = await applyKairoActions(
      [
        { kind: "updateGoal", handle: "G99", text: "x" },
        { kind: "deleteGoal", handle: "G98" },
        { kind: "linkTaskGoal", taskHandle: "T1", goalHandle: "G97" },
      ],
      { taskIdMap: { T1: "t1" }, goalIdMap: {} },
      envFrom(m)
    );
    expect(results[0]).toMatchObject({ status: "skipped" });
    expect(results[1]).toMatchObject({ status: "skipped" });
    expect(results[2]).toMatchObject({ status: "skipped" });
    expect(m.updateGoal).not.toHaveBeenCalled();
    expect(m.deleteGoal).not.toHaveBeenCalled();
    expect(m.setGoalLink).not.toHaveBeenCalled();
  });

  it("delete-goal undo re-creates goal and restores linked task relations", async () => {
    const m = makeMutations({
      addGoal: vi.fn(async () => "g-restored"),
    });
    const results = await applyKairoActions(
      [{ kind: "deleteGoal", handle: "G1" }],
      {
        taskIdMap: { T1: "t1", T2: "t2" },
        goalIdMap: { G1: "g1" },
      },
      envFrom(
        m,
        {},
        { g1: { id: "g1", text: "Roadmap", priority: "p1" } },
        { t1: "g1", t2: null }
      )
    );
    expect(m.deleteGoal).toHaveBeenCalledWith({ goalId: "g1" });
    if (results[0].status !== "applied") throw new Error("unreachable");
    await results[0].undo?.();
    expect(m.addGoal).toHaveBeenCalledWith({
      text: "Roadmap",
      description: undefined,
      deadline: undefined,
      priority: "p1",
    });
    expect(m.setGoalLink).toHaveBeenCalledWith({ taskId: "t1", goalId: "g-restored" });
  });
});
