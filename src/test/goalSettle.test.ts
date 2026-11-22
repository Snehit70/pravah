import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { planGoalSettle, selectOpenGoalTasks } from "../../convex/goalSettleModel";
vi.unmock("../../convex/writeServer");
const modules = import.meta.glob("../../convex/**/*.ts");

describe("selectOpenGoalTasks", () => {
  const base = { updatedAt: 1 };
  it("keeps only tasks that are neither done nor cancelled", () => {
    const open = { ...base, id: "open" };
    const tasks = [
      open,
      { ...base, id: "done", completedAt: 5 },
      { ...base, id: "legacy-done", status: "completed" },
      { ...base, id: "cancelled", cancelledAt: 5 },
      { ...base, id: "legacy-cancelled", status: "cancelled" },
      { ...base, id: "done-then-cancelled", completedAt: 4, cancelledAt: 5 },
    ];
    expect(selectOpenGoalTasks(tasks)).toEqual([open]);
  });
});

describe("planGoalSettle", () => {
  it("settles directly when nothing is open", () => {
    expect(planGoalSettle(0, {})).toEqual({ action: "settle", completeOpen: false });
    expect(planGoalSettle(0, { completeOpenTasks: true, expectedOpenTaskCount: 3 }))
      .toEqual({ action: "settle", completeOpen: false });
  });
  it("asks before completing open tasks", () => {
    expect(planGoalSettle(2, {})).toEqual({ action: "ask", openTaskCount: 2 });
  });
  it("completes open tasks once confirmed with a matching count", () => {
    expect(planGoalSettle(2, { completeOpenTasks: true, expectedOpenTaskCount: 2 }))
      .toEqual({ action: "settle", completeOpen: true });
    expect(planGoalSettle(2, { completeOpenTasks: true })).toEqual({ action: "settle", completeOpen: true });
  });
  it("asks again when the confirmed count is stale", () => {
    expect(planGoalSettle(3, { completeOpenTasks: true, expectedOpenTaskCount: 2 }))
      .toEqual({ action: "ask", openTaskCount: 3 });
  });
});

describe("goals.settle and goals.reopen", () => {
  const setup = async () => {
    const root = convexTest(schema, modules);
    const t = root.withIdentity({ tokenIdentifier: "owner" });
    await t.mutation(api.goals.upsert, { clientId: "g", text: "Ship it", createdAt: 1 });
    const goal = async () => (await t.query(api.goals.list, {})).find((row) => row.id === "g");
    const task = async (title: string) => {
      const id = await t.mutation(api.tasks.addTask, { title });
      await t.mutation(api.goals.setLink, { taskId: id, goalClientId: "g" });
      return id;
    };
    const getTask = (id: Awaited<ReturnType<typeof task>>) => t.run((ctx) => ctx.db.get(id));
    return { root, t, goal, task, getTask };
  };

  it("settles a goal whose remaining tasks are all done, ignoring cancelled ones", async () => {
    const { t, goal, task } = await setup();
    const done = await task("done");
    const cancelled = await task("cancelled");
    await t.mutation(api.tasks.completeTask, { taskId: done });
    await t.mutation(api.tasks.softDeleteTask, { taskId: cancelled });
    const result = await t.mutation(api.goals.settle, { clientId: "g" });
    expect(result).toMatchObject({ status: "settled", completedTaskCount: 0 });
    expect((await goal())?.completedAt).toEqual(expect.any(Number));
  });

  it("refuses to settle with open tasks until confirmed, then completes them atomically", async () => {
    const { t, goal, task, getTask } = await setup();
    const a = await task("a");
    const b = await task("b");
    const done = await task("done");
    await t.mutation(api.tasks.completeTask, { taskId: done });
    const doneAt = (await getTask(done))?.completedAt;

    expect(await t.mutation(api.goals.settle, { clientId: "g" }))
      .toEqual({ status: "open_tasks", openTaskCount: 2 });
    expect((await goal())?.completedAt).toBeUndefined();
    expect((await getTask(a))?.completedAt).toBeUndefined();

    expect(await t.mutation(api.goals.settle, { clientId: "g", completeOpenTasks: true, expectedOpenTaskCount: 1 }))
      .toEqual({ status: "open_tasks", openTaskCount: 2 });
    expect((await getTask(a))?.completedAt).toBeUndefined();

    const result = await t.mutation(api.goals.settle, { clientId: "g", completeOpenTasks: true, expectedOpenTaskCount: 2 });
    expect(result).toMatchObject({ status: "settled", completedTaskCount: 2 });
    expect((await getTask(a))?.completedAt).toEqual(expect.any(Number));
    expect((await getTask(b))?.completedAt).toEqual(expect.any(Number));
    expect((await getTask(done))?.completedAt).toBe(doneAt);
    expect((await goal())?.completedAt).toEqual(expect.any(Number));

    await t.mutation(api.goalProgress.prepare, {});
    expect((await t.query(api.goalProgress.list, {})).progress.g).toEqual({ total: 3, done: 3 });
  });

  it("reopens a goal without reopening its tasks", async () => {
    const { t, goal, task, getTask } = await setup();
    const a = await task("a");
    await t.mutation(api.goals.settle, { clientId: "g", completeOpenTasks: true });
    expect(await t.mutation(api.goals.reopen, { clientId: "g" })).toEqual({ reopened: true });
    expect((await goal())?.completedAt).toBeUndefined();
    expect((await getTask(a))?.completedAt).toEqual(expect.any(Number));
  });

  it("keeps the settled state when the goal is edited through upsert", async () => {
    const { t, goal } = await setup();
    await t.mutation(api.goals.settle, { clientId: "g" });
    await t.mutation(api.goals.upsert, { clientId: "g", text: "Renamed", createdAt: 1 });
    expect(await goal()).toMatchObject({ text: "Renamed", completedAt: expect.any(Number) });
  });

  it("only acts on the caller's own goals and tasks", async () => {
    const { root, task, goal, getTask } = await setup();
    const a = await task("a");
    const other = root.withIdentity({ tokenIdentifier: "other" });
    expect(await other.mutation(api.goals.settle, { clientId: "g", completeOpenTasks: true }))
      .toEqual({ status: "not_found" });
    expect(await other.mutation(api.goals.reopen, { clientId: "g" })).toEqual({ reopened: false });
    expect((await goal())?.completedAt).toBeUndefined();
    expect((await getTask(a))?.completedAt).toBeUndefined();
  });
});
