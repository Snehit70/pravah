import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
vi.unmock("../../convex/writeServer");
const modules = import.meta.glob("../../convex/**/*.ts");
const test = () => {
  const root = convexTest(schema, modules);
  return {root, t: root.withIdentity({tokenIdentifier: "owner"})};
};

describe("transactional goal progress", () => {
  it("maintains exact progress across idempotent CLI completion and operation undo", async () => {
    const {t} = test();
    const taskId = await t.mutation(api.tasks.addTask, {title: "undo"});
    await t.mutation(api.goals.setLink, {taskId, goalClientId: "goal"});
    await t.mutation(api.goalProgress.prepare, {});
    const args = {ownerTokenIdentifier: "owner", taskId, idempotencyKey: "complete-once"};
    const operation = await t.mutation(internal.automationTools.completeTask, args);
    await t.mutation(internal.automationTools.completeTask, args);
    expect((await t.query(api.goalProgress.list, {})).progress.goal).toEqual({total: 1, done: 1});
    await t.mutation(internal.automationOperations.undo, {
      ownerTokenIdentifier: "owner", operationId: operation.result.operationId, idempotencyKey: "undo-once",
    });
    expect((await t.query(api.goalProgress.list, {})).progress.goal).toEqual({total: 1, done: 0});
  });
  it("limits exact-title resolution to the owner and excludes cancelled tasks", async () => {
    const {t} = test();
    await t.run(async ctx => {
      for (const owner of ["owner", "other"]) {
        for (let i = 0; i < 4; i++) await ctx.db.insert("tasks", {
          title: "Ship", ownerTokenIdentifier: owner, position: i,
          createdAt: 1, updatedAt: 1, createdBy: "test",
          ...(i === 0 ? {cancelledAt: 2} : {}),
        });
      }
    });
    const matches = await t.query(internal.automationTools.resolveTaskTitle, {ownerTokenIdentifier: "owner", title: "Ship"});
    expect(matches).toHaveLength(2);
    expect(matches.every(task => task.ownerTokenIdentifier === "owner" && !task.cancelledAt)).toBe(true);
    expect(await t.query(internal.automationTools.resolveTaskTitle, {ownerTokenIdentifier: "owner", title: "ship"})).toEqual([]);
  });
  it("tracks completion, reopening, moving goals, cancellation, restoration and unlink", async () => {
    const {t} = test();
    const id = await t.mutation(api.tasks.addTask, {title: "one"});
    await t.mutation(api.goals.setLink, {taskId: id, goalClientId: "first"});
    await t.mutation(api.goalProgress.prepare, {});
    const progress = async () => (await t.query(api.goalProgress.list, {})).progress;
    expect(await progress()).toMatchObject({first: {total: 1, done: 0}});
    await t.mutation(api.tasks.completeTask, {taskId: id});
    expect(await progress()).toMatchObject({first: {total: 1, done: 1}});
    await t.mutation(api.goals.setLink, {taskId: id, goalClientId: "second"});
    expect(await progress()).toEqual({first: {total: 0, done: 0}, second: {total: 1, done: 1}});
    await t.mutation(api.tasks.reopenTask, {taskId: id});
    expect(await progress()).toMatchObject({second: {total: 1, done: 0}});
    await t.mutation(api.tasks.softDeleteTask, {taskId: id});
    expect(await progress()).toMatchObject({second: {total: 0, done: 0}});
    await t.mutation(api.tasks.restoreTask, {taskId: id});
    expect(await progress()).toMatchObject({second: {total: 1, done: 0}});
    await t.mutation(api.goals.setLink, {taskId: id, goalClientId: null});
    expect(await progress()).toMatchObject({second: {total: 0, done: 0}});
  });

  it("backfills legacy data idempotently, ignoring foreign, dangling and cancelled links", async () => {
    const {t, root} = test();
    const ids = await t.run(async ctx => {
      const base = {title: "legacy", position: 1, createdAt: 1, updatedAt: 2, createdBy: "test"};
      const done = await ctx.db.insert("tasks", {...base, ownerTokenIdentifier: "owner", status: "completed"});
      const cancelled = await ctx.db.insert("tasks", {...base, ownerTokenIdentifier: "owner", cancelledAt: 2});
      const foreign = await ctx.db.insert("tasks", {...base, ownerTokenIdentifier: "other"});
      for (const taskId of [done, cancelled, foreign, "bad-id"]) await ctx.db.insert("goalLinks", {ownerTokenIdentifier: "owner", taskId, goalClientId: "legacy"});
      return {done, foreign};
    });
    expect((await t.query(api.goalProgress.list, {})).ready).toBe(false);
    await t.mutation(api.goalProgress.prepare, {});
    await t.mutation(api.goalProgress.prepare, {});
    expect(await t.query(api.goalProgress.list, {})).toEqual({ready: true, progress: {legacy: {total: 1, done: 1}}});
    expect(await root.withIdentity({tokenIdentifier: "other"}).query(api.goalProgress.list, {})).toEqual({ready: false, progress: {}});
    await t.mutation(api.tasks.reopenTask, {taskId: ids.done});
    expect((await t.query(api.goalProgress.list, {})).progress.legacy).toEqual({total: 1, done: 0});
  });

  it("interleaves bounded backfill with live changes without double counting", async () => {
    const {t} = test();
    const ids = await t.run(async ctx => {
      const ids = [];
      for (let i = 0; i < 125; i++) {
        const id = await ctx.db.insert("tasks", {title: String(i), ownerTokenIdentifier: "owner", createdBy: "test", position: i, createdAt: 1, updatedAt: 1});
        await ctx.db.insert("goalLinks", {ownerTokenIdentifier: "owner", taskId: id, goalClientId: "all"}); ids.push(id);
      }
      return ids;
    });
    await t.mutation(api.goalProgress.prepare, {});
    expect((await t.query(api.goalProgress.list, {})).ready).toBe(false);
    await t.mutation(api.tasks.completeTask, {taskId: ids[124]});
    await t.mutation(api.goals.setLink, {taskId: ids[0], goalClientId: null});
    await t.mutation(internal.goalProgress.continueBackfill, {owner: "owner"});
    expect((await t.query(api.goalProgress.list, {})).progress.all).toEqual({total: 124, done: 1});
    await t.mutation(internal.goalProgress.continueBackfill, {owner: "owner"});
    expect((await t.query(api.goalProgress.list, {})).progress.all).toEqual({total: 124, done: 1});
  });
});
