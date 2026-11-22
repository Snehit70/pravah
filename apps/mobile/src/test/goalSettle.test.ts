import { describe, expect, it, vi } from "vitest";
import {
  isGoalSettled,
  partitionSettledLast,
  settleConfirmOptions,
  settleGoalWithConfirm,
  type SettleGoalResult,
} from "../lib/goalSettle";

const settled: SettleGoalResult = { status: "settled", completedAt: 10, completedTaskCount: 0 };

describe("goal settle helpers", () => {
  it("treats only a numeric completedAt as settled", () => {
    expect(isGoalSettled({})).toBe(false);
    expect(isGoalSettled({ completedAt: 0 })).toBe(true);
  });

  it("sinks settled goals below open ones without reordering either group", () => {
    const goals = [{ id: "a", completedAt: 1 }, { id: "b" }, { id: "c", completedAt: 2 }, { id: "d" }];
    expect(partitionSettledLast(goals).map((g) => g.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("states the exact task count in destructive confirm copy", () => {
    expect(settleConfirmOptions("Ship", 1)).toMatchObject({
      title: "Complete 1 open task and settle?",
      confirmLabel: "Complete 1 & settle",
      destructive: true,
    });
    const many = settleConfirmOptions("Ship", 4);
    expect(many.title).toBe("Complete 4 open tasks and settle?");
    expect(many.message).toContain("All 4 open tasks will be marked done");
  });
});

describe("settleGoalWithConfirm", () => {
  it("settles without asking when nothing is open", async () => {
    const settle = vi.fn(async () => settled);
    const confirm = vi.fn(async () => true);
    expect(await settleGoalWithConfirm({ goalId: "g", goalText: "Ship", settle, confirm }))
      .toEqual({ kind: "settled", completedTaskCount: 0 });
    expect(confirm).not.toHaveBeenCalled();
    expect(settle).toHaveBeenCalledWith("g");
  });

  it("asks with the open count and completes exactly that many once confirmed", async () => {
    const settle = vi.fn()
      .mockResolvedValueOnce({ status: "open_tasks", openTaskCount: 3 })
      .mockResolvedValueOnce({ ...settled, completedTaskCount: 3 });
    const confirm = vi.fn(async () => true);
    expect(await settleGoalWithConfirm({ goalId: "g", goalText: "Ship", settle, confirm }))
      .toEqual({ kind: "settled", completedTaskCount: 3 });
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Complete 3 open tasks and settle?" }));
    expect(settle).toHaveBeenLastCalledWith("g", { completeOpenTasks: true, expectedOpenTaskCount: 3 });
  });

  it("leaves the goal open when the user declines", async () => {
    const settle = vi.fn(async (): Promise<SettleGoalResult> => ({ status: "open_tasks", openTaskCount: 2 }));
    const confirm = vi.fn(async () => false);
    expect(await settleGoalWithConfirm({ goalId: "g", goalText: "Ship", settle, confirm }))
      .toEqual({ kind: "cancelled" });
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("asks again with the new count when tasks changed after confirming", async () => {
    const settle = vi.fn()
      .mockResolvedValueOnce({ status: "open_tasks", openTaskCount: 1 })
      .mockResolvedValueOnce({ status: "open_tasks", openTaskCount: 2 })
      .mockResolvedValueOnce({ ...settled, completedTaskCount: 2 });
    const confirm = vi.fn(async () => true);
    await settleGoalWithConfirm({ goalId: "g", goalText: "Ship", settle, confirm });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({ confirmLabel: "Complete 2 & settle" }));
  });
});
