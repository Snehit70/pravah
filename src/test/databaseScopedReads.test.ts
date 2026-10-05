import { describe, expect, it } from "vitest";
import { listGoalLinksForOwner } from "../../convex/goalLinkQueries";
import { getTaskImageSummariesForOwner } from "../../convex/taskImages";
import type { QueryCtx } from "../../convex/_generated/server";
import type { Id } from "../../convex/_generated/dataModel";

function database() {
  let reads = 0;
  const db = { query: (_table: string) => ({ withIndex: (_index: string, range: (q: unknown) => unknown) => {
    const predicates: [string, unknown][] = []; const q = {eq: (key: string, value: unknown) => { predicates.push([key,value]); return q; }}; range(q);
    const rows = [{ownerTokenIdentifier:"owner",taskId:"wanted",goalClientId:"goal",state:"ready"},
      {ownerTokenIdentifier:"other",taskId:"wanted",goalClientId:"other",state:"failed"},
      ...Array.from({length:1000},(_,i)=>({ownerTokenIdentifier:"owner",taskId:`history-${i}`,goalClientId:"history",state:"ready"}))];
    return { collect: async () => { const found = rows.filter((r)=>predicates.every(([k,v])=>(r as Record<string,unknown>)[k]===v)); reads+=found.length; return found; }};
  } }) };
  return {ctx:{db} as unknown as QueryCtx, reads:()=>reads};
}
describe("task-scoped related reads", () => {
  it("does not read 1,000 historical links or another owner's matching link", async () => {
    const d=database(); expect(await listGoalLinksForOwner(d.ctx,"owner",["wanted","wanted"])).toEqual({wanted:"goal"}); expect(d.reads()).toBe(1);
  });
  it("distinguishes empty selection from complete history", async () => {
    const d=database(); expect(await listGoalLinksForOwner(d.ctx,"owner",[])).toEqual({}); expect(d.reads()).toBe(0);
    expect(Object.keys(await listGoalLinksForOwner(d.ctx,"owner"))).toHaveLength(1001);
  });
  it("does not read another task's image rows", async () => {
    const d=database(); const result = await getTaskImageSummariesForOwner(d.ctx,"owner",["wanted","wanted"] as Id<"tasks">[]);
    expect(result.get("wanted" as Id<"tasks">)).toEqual({activeCount:1,readyCount:1,failedCount:0}); expect(d.reads()).toBe(1);
  });
});
