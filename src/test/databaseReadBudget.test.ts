import { describe, expect, it } from "vitest";
import { getTaskCounts, getTimelineForOwner, listBoardTasks, listTasksForOwner, listTasksPageForOwner } from "../../convex/tasks";
import type { QueryCtx } from "../../convex/_generated/server";

// Apply the index range BEFORE charging visited rows, just as Convex does.
// Counts are regression budgets, not a substitute for production usageStats.
function database(history: number) {
  const row = (id: string, fields: Record<string, unknown> = {}) => ({
    _id: id, _creationTime: 1, title: id, position: 1, createdAt: 1,
    updatedAt: 1, createdBy: "test", ownerTokenIdentifier: "owner", ...fields,
  });
  const rows = [row("inbox"), row("today", { deadline: "2026-10-05" }),
    row("later", { deadline: "2026-10-10" }),
    row("legacy", { status: "scheduled", scheduledDate: "2026-10-05" }),
    row("legacy-completed", { status: "completed" }),
    row("other", { ownerTokenIdentifier: "other", deadline: "2026-10-05" }),
    ...Array.from({ length: history }, (_, i) => row(`done-${i}`, {
      completedAt: 10, status: "scheduled", deadline: i % 2 ? "2026-10-05" : undefined,
    })),
    ...Array.from({ length: history }, (_, i) => row(`cancelled-${i}`, {
      cancelledAt: 10, deadline: "2026-10-05",
    })),
  ];
  let reads = 0;
  const pageLimits: {numItems: number; maximumRowsRead?: number; maximumBytesRead?: number}[] = [];
  const ctx = {
    auth: { getUserIdentity: async () => ({ tokenIdentifier: "owner" }) },
    db: { query: () => {
      let selected = rows;
      const query = { withIndex: (_name: string, range: (q: unknown) => unknown) => {
        const q = Object.fromEntries(["eq", "gte", "lte", "lt", "gt"].map((op) => [op,
          (field: string, value: unknown) => {
            selected = selected.filter((r) => {
              const actual = (r as Record<string, unknown>)[field];
              if (op === "eq") return actual === value;
              if (actual === undefined) return false;
              const a = actual as string; const b = value as string;
              return op === "gte" ? a >= b : op === "lte" ? a <= b : op === "gt" ? a > b : a < b;
            });
            return q;
          }]));
        range(q); return query;
      }, collect: async () => { reads += selected.length; return selected; },
        order: (direction: string) => { if (direction === "desc") selected = [...selected].reverse(); return query; },
        paginate: async (opts: {cursor: string | null; numItems: number; maximumRowsRead?: number; maximumBytesRead?: number}) => {
          pageLimits.push(opts); const start = Number(opts.cursor ?? 0);
          const page = selected.slice(start,start+opts.numItems); reads += page.length;
          return {page,isDone:start+page.length>=selected.length,continueCursor:String(start+page.length)};
        },
      };
      return query;
    } },
  } as unknown as QueryCtx;
  return { ctx, reads: () => reads, pageLimits, add: (fields: Record<string, unknown>) => rows.push(row("extra", fields)) };
}

describe("active query read budgets", () => {
  it("reuses inbox candidates for legacy timeline counts without reading the range twice", async () => {
    const d = database(10);
    const handler = (getTaskCounts as unknown as {_handler: (ctx: QueryCtx, args: object) => Promise<unknown>})._handler;
    expect(await handler(d.ctx, {})).toEqual({inboxCount: 1, timelineCount: 3, completedCount: 11});
    // Three timestamp-free inbox candidates + two canonical timeline tasks +
    // ten timestamped completions + one legacy completion.
    expect(d.reads()).toBe(16);
  });
  for (const history of [10, 1000]) {
    it(`board ignores ${history} completed and cancelled rows`, async () => {
      const db = database(history);
      const handler = (listBoardTasks as unknown as { _handler: (ctx: QueryCtx, args: object) => Promise<{ _id: string }[]> })._handler;
      const result = await handler(db.ctx, {});
      expect(result.map((r) => r._id).sort()).toEqual(["inbox", "later", "legacy", "today"]);
      expect(db.reads()).toBeLessThanOrEqual(6);
    });
    it(`inbox and timeline exclude ${history} historical rows from their ranges`, async () => {
      const inbox = database(history);
      expect((await listTasksForOwner(inbox.ctx, "owner", { status: "inbox" })).map((r) => r._id)).toEqual(["inbox"]);
      expect(inbox.reads()).toBeLessThanOrEqual(4);
      const timeline = database(history);
      const result = await getTimelineForOwner(timeline.ctx, "owner", { endDate: "2026-10-05" });
      expect(result["2026-10-05"].map((r) => r._id).sort()).toEqual(["legacy", "today"]);
      // Includes the timestamp-free legacy completed row for compatibility.
      expect(timeline.reads()).toBeLessThanOrEqual(4);
    });
  }
});

describe("bounded history pagination", () => {
  it("bounds dates before reading pages and excludes unrelated inbox/future tasks", async () => {
    const d = database(1000);
    for (let i = 0; i < 1000; i++) d.add({title: `unrelated-${i}`});
    d.add({deadline: "2099-01-01"});
    let cursor: string | null = null;
    const ids: string[] = [];
    for (let page = 0; page < 10; page++) {
      const result = await listTasksPageForOwner(d.ctx, "owner", {status: "active", after: "2026-10-04", before: "2026-10-06"}, {numItems: 1, cursor});
      ids.push(...result.page.map(task => String(task._id)));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(ids.sort()).toEqual(["legacy", "today"]);
    expect(d.reads()).toBe(2);
  });
  it("legacy timeline lookup does not read unrelated inbox rows", async () => {
    const d = database(1000);
    for (let i = 0; i < 1000; i++) d.add({title: `inbox-${i}`});
    expect((await getTimelineForOwner(d.ctx, "owner", {endDate: "2026-10-05"}))["2026-10-05"]).toHaveLength(2);
    expect(d.reads()).toBe(2);
  });
  it("reads completed rows and legacy completions without scanning cancelled/active tasks", async () => {
    const d=database(1000); let cursor: string | null=null; const ids: string[]=[];
    for(let page=0;page<30;page++) {
      const result = await listTasksPageForOwner(d.ctx,"owner",{status:"completed"},{numItems:100,cursor});
      ids.push(...result.page.map((t)=>String(t._id))); if(result.isDone) break; cursor=result.continueCursor;
    }
    expect(ids).toHaveLength(1001); expect(new Set(ids).size).toBe(1001);
    expect(ids).toContain("legacy-completed"); expect(d.reads()).toBe(1001);
    expect(d.pageLimits.every((limit)=>limit.numItems<=100 && limit.maximumRowsRead===100 && limit.maximumBytesRead===256*1024)).toBe(true);
  });
  it("returns every active task while avoiding timestamped history", async () => {
    const d=database(1000); let cursor: string|null=null;const ids:string[]=[];
    for(let page=0;page<10;page++) {
      const result=await listTasksPageForOwner(d.ctx,"owner",{status:"active"},{numItems:2,cursor});
      ids.push(...result.page.map((t)=>String(t._id)));if(result.isDone) break;cursor=result.continueCursor;
    }
    expect(ids.sort()).toEqual(["inbox","later","legacy","today"]);expect(d.reads()).toBe(5);
  });
});

it("preserves completed legacy integration tasks in the unfiltered date contract", async () => {
  const d=database(10);d.add({status:"scheduled",scheduledDate:"2026-10-05",completedAt:10});
  const all=await listTasksForOwner(d.ctx,"owner",{date:"2026-10-05"});expect(all.map((t)=>String(t._id))).toContain("extra");
  const active=await listTasksForOwner(d.ctx,"owner",{date:"2026-10-05",status:"active"});expect(active.map((t)=>String(t._id))).not.toContain("extra");
});
