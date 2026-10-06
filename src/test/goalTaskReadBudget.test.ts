import { describe, expect, it } from "vitest";
import { listGoalTasksForOwner } from "../../convex/goalLinkQueries";
import type { QueryCtx } from "../../convex/_generated/server";

function database() {
  const links = [
    {ownerTokenIdentifier: "owner", goalClientId: "wanted", taskId: "active"},
    {ownerTokenIdentifier: "owner", goalClientId: "wanted", taskId: "done"},
    {ownerTokenIdentifier: "owner", goalClientId: "wanted", taskId: "cancelled"},
    {ownerTokenIdentifier: "owner", goalClientId: "wanted", taskId: "foreign"},
    {ownerTokenIdentifier: "owner", goalClientId: "wanted", taskId: "dangling"},
    {ownerTokenIdentifier: "owner", goalClientId: "wanted", taskId: "invalid"},
    {ownerTokenIdentifier: "owner", goalClientId: "wanted", taskId: "active"},
    ...Array.from({length: 1000}, (_, i) => ({ownerTokenIdentifier: "owner", goalClientId: "unrelated", taskId: `history${i}`})),
    {ownerTokenIdentifier: "other", goalClientId: "wanted", taskId: "private"},
  ];
  const tasks = new Map(["active", "done", "cancelled", "foreign", "private"].map(id => [id, {
    _id: id, title: id, ownerTokenIdentifier: id === "foreign" || id === "private" ? "other" : "owner",
    updatedAt: 1, createdAt: 1, position: 1, createdBy: "test",
    ...(id === "done" ? {status: "completed"} : {}),
    ...(id === "cancelled" ? {cancelledAt: 1} : {}),
  }]));
  let linkReads = 0;
  const taskReads: string[] = [];
  const limits: unknown[] = [];
  const ctx = {db: {
    normalizeId: (_table: string, id: string) => id === "invalid" ? null : id,
    get: async (id: string) => {taskReads.push(id); return tasks.get(id) ?? null;},
    query: () => ({withIndex: (_name: string, fn: (q: unknown) => unknown) => {
      let rows = links;
      const q = {eq: (key: string, value: unknown) => {rows = rows.filter(row => row[key as keyof typeof row] === value); return q;}};
      fn(q);
      return {paginate: async (opts: {numItems: number; cursor: string | null}) => {
        limits.push(opts);
        const start = Number(opts.cursor ?? 0);
        const page = rows.slice(start, start + opts.numItems); linkReads += page.length;
        return {page, isDone: start + page.length >= rows.length, continueCursor: String(start + page.length)};
      }};
    }}),
  }} as unknown as QueryCtx;
  return {ctx, taskReads, limits, linkReads: () => linkReads};
}

describe("selected goal task read budget", () => {
  it("ignores unrelated history, invalid IDs, cancelled and foreign tasks", async () => {
    const db = database();
    const result = await listGoalTasksForOwner(db.ctx, "owner", "wanted", {numItems: 1000, cursor: null});
    expect(result.tasks.map(task => task._id)).toEqual(["active", "done"]);
    expect(result.tasks[1].completedAt).toBe(1);
    expect(db.linkReads()).toBe(7);
    expect(db.taskReads).toHaveLength(5);
    expect(db.taskReads).not.toContain("private");
    expect(db.taskReads).not.toContain("invalid");
    expect(db.limits).toEqual([{numItems: 100, cursor: null, maximumRowsRead: 100, maximumBytesRead: 256 * 1024}]);
  });

  it("bounds each request and provides a cursor rather than truncating results", async () => {
    const db = database();
    const first = await listGoalTasksForOwner(db.ctx, "owner", "wanted", {numItems: 2, cursor: null});
    expect(first.isDone).toBe(false);
    expect(db.linkReads()).toBe(2);
    const second = await listGoalTasksForOwner(db.ctx, "owner", "wanted", {numItems: 2, cursor: first.continueCursor});
    expect(second.isDone).toBe(false);
    expect(db.linkReads()).toBe(4);
  });
});
