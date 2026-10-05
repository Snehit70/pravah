import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveClient } from "../../packages/cli/src/liveClient";
import { executeLiveCommand } from "../../packages/cli/src/liveCommands";
vi.mock("../../packages/cli/src/authStore", () => ({ loadStoredCredential: () => null }));
const client = () => createLiveClient({ PRAVAH_HTTP_URL: "https://example.convex.site", CONVEX_HTTP_API_KEY: "test" })!;
function responses(...pages: unknown[]) {
  const fetch = vi.fn(); for (const page of pages) fetch.mockResolvedValueOnce({ ok: true, json: async () => page });
  vi.stubGlobal("fetch", fetch); return fetch;
}
afterEach(() => vi.unstubAllGlobals());
describe("CLI bounded task reads", () => {
  it("follows empty intermediate pages and preserves all matching rows", async () => {
    const fetch = responses({page:[{_id:"a"}],isDone:false,continueCursor:"one"}, {page:[],isDone:false,continueCursor:"two"}, {page:[{_id:"b"}],isDone:true,continueCursor:"end"});
    expect(await client().listTasks({status:"completed"})).toEqual([{_id:"a"},{_id:"b"}]);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://example.convex.site/tasks/page?status=completed",
      "https://example.convex.site/tasks/page?status=completed&cursor=one",
      "https://example.convex.site/tasks/page?status=completed&cursor=two"]);
  });
  it("fails explicitly when a cursor repeats instead of hanging or returning partial results", async () => {
    responses({page:[],isDone:false,continueCursor:"one"},{page:[],isDone:false,continueCursor:"one"});
    await expect(client().listTasks({})).rejects.toThrow("did not advance");
  });
  it("supports an older backend only when the first page route is absent", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("Not found",{status:404}))
      .mockResolvedValueOnce({ok:true,json:async()=>[{_id:"active"},{_id:"done",completedAt:1}]});
    vi.stubGlobal("fetch",fetch);
    expect(await client().listTasks({status:"active"})).toEqual([{_id:"active"}]);
    expect(String(fetch.mock.calls[1][0])).toBe("https://example.convex.site/tasks?");
  });
  it("does not mask authentication failures with a legacy full read", async () => {
    const fetch=vi.fn().mockResolvedValue(new Response("Forbidden",{status:403}));vi.stubGlobal("fetch",fetch);
    await expect(client().listTasks({status:"active"})).rejects.toThrow("403");expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps exact dates on the selective endpoint", async () => {
    const fetch = responses([]); await client().listTasks({date:"2026-10-05",status:"active"});
    expect(fetch.mock.calls[0][0]).toBe("https://example.convex.site/tasks?status=scheduled&date=2026-10-05");
  });
  it("pushes default active and horizon filters to the server", async () => {
    const cli = client(); const spy = vi.spyOn(cli,"listTasks").mockResolvedValue([]);
    await executeLiveCommand(cli,"overdue",{positionals:["overdue"],options:{}});
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({status:"timeline",before:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)}));
    await executeLiveCommand(cli,"tasks list",{positionals:["tasks","list"],options:{}});
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({status:"active"}));
  });
  it("reads exact IDs directly and scopes goal links to that task", async () => {
    const cli = client(); const id = "a".repeat(32);
    const list = vi.spyOn(cli,"listTasks"); const get = vi.spyOn(cli,"getTask").mockResolvedValue({_id:id,title:"Test",position:1});
    vi.spyOn(cli,"listGoals").mockResolvedValue([]); const links = vi.spyOn(cli,"listGoalLinks").mockResolvedValue({});
    await executeLiveCommand(cli,"tasks show",{positionals:["tasks","show",id],options:{}});
    expect(list).not.toHaveBeenCalled(); expect(get).toHaveBeenCalledWith(id); expect(links).toHaveBeenCalledWith([id]);
  });
  it("chunks links into bounded owner-scoped requests and skips empty sets", async () => {
    const fetch = responses({a:"goal"},{b:"goal"});
    const cli = client(); expect(await cli.listGoalLinks([])).toEqual({}); expect(fetch).not.toHaveBeenCalled();
    expect(await cli.listGoalLinks(Array.from({length:101},(_,i)=>`id${i}`))).toEqual({a:"goal",b:"goal"});
    expect(fetch.mock.calls).toHaveLength(2);
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("taskIds")!.split(",")).toHaveLength(100);
  });
});
