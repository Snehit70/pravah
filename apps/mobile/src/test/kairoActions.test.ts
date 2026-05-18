import { describe, expect, it, vi } from "vitest";
import { applyKairoActions, type KairoMutations } from "../lib/kairoActions";
import type { KairoAction } from "../lib/kairoApi";

function makeMutations(overrides: Partial<KairoMutations> = {}): KairoMutations {
  return {
    addTask: vi.fn(async () => "new-id"),
    moveTask: vi.fn(async () => undefined),
    completeTask: vi.fn(async () => undefined),
    unscheduleTask: vi.fn(async () => undefined),
    updateTask: vi.fn(async () => undefined),
    deleteTask: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("applyKairoActions", () => {
  it("dispatches add-task to addTask mutation", async () => {
    const m = makeMutations();
    const actions: KairoAction[] = [
      { kind: "add", title: "x", scheduledDate: "2026-05-20", type: "open" },
    ];
    const results = await applyKairoActions(actions, {}, m);
    expect(m.addTask).toHaveBeenCalledWith({
      title: "x",
      type: "open",
      scheduledDate: "2026-05-20",
      deadline: undefined,
      source: "ai-agent",
    });
    expect(results[0]).toEqual({ action: actions[0], status: "applied", taskId: "new-id" });
  });

  it("passes deadline through for type=deadline adds", async () => {
    const m = makeMutations();
    await applyKairoActions(
      [{ kind: "add", title: "x", scheduledDate: "2026-05-20", type: "deadline" }],
      {},
      m
    );
    expect(m.addTask).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: "2026-05-20", type: "deadline" })
    );
  });

  it("resolves a handle and calls moveTask for reschedule", async () => {
    const m = makeMutations();
    await applyKairoActions(
      [{ kind: "reschedule", handle: "T1", scheduledDate: "2026-05-22" }],
      { T1: "real-1" },
      m
    );
    expect(m.moveTask).toHaveBeenCalledWith({ taskId: "real-1", targetDate: "2026-05-22" });
  });

  it("skips actions whose handle is not in the idMap", async () => {
    const m = makeMutations();
    const actions: KairoAction[] = [{ kind: "complete", handle: "T99" }];
    const results = await applyKairoActions(actions, {}, m);
    expect(m.completeTask).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ status: "skipped" });
  });

  it("captures mutation throws as 'failed' but keeps processing later actions", async () => {
    const m = makeMutations({
      completeTask: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const actions: KairoAction[] = [
      { kind: "complete", handle: "T1" },
      { kind: "delete", handle: "T2" },
    ];
    const results = await applyKairoActions(actions, { T1: "r1", T2: "r2" }, m);
    expect(results[0]).toMatchObject({ status: "failed", error: "boom" });
    expect(results[1]).toMatchObject({ status: "applied", taskId: "r2" });
    expect(m.deleteTask).toHaveBeenCalledWith({ taskId: "r2" });
  });

  it("forwards partial update fields", async () => {
    const m = makeMutations();
    await applyKairoActions(
      [{ kind: "update", handle: "T1", title: "renamed", priority: "p2" }],
      { T1: "r1" },
      m
    );
    expect(m.updateTask).toHaveBeenCalledWith({
      taskId: "r1",
      title: "renamed",
      priority: "p2",
      deadline: undefined,
    });
  });
});
