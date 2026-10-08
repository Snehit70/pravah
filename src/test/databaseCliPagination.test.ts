import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveClient } from "../../packages/cli/src/liveClient";
import { executeLiveCommand } from "../../packages/cli/src/liveCommands";
import { ConvexHttpError } from "../../packages/cli/src/automationHttpClient";
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
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({status:"active", before: expect.any(String)}));
    expect(spy).toHaveBeenLastCalledWith({status:"inbox"});
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

describe("CLI selected goal reads", () => {
  it("resolves exact titles without collection reads and preserves ambiguity", async () => {
    const fetch = responses([{_id: "a", title: "Ship"}, {_id: "b", title: "Ship"}]);
    const cli = client();
    await expect(executeLiveCommand(cli, "tasks show", {positionals: ["tasks", "show", "Ship"], options: {}})).rejects.toMatchObject({code: "ambiguous_target"});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe("/tasks/resolve");
  });
  it("rejects malformed title responses without falling back to a full read", async () => {
    const fetch = responses([{_id: "a", title: "Other"}]);
    await expect(client().resolveTaskTitle!("Ship")).rejects.toThrow("Invalid task title resolution");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("falls back only when an older backend lacks the title route", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("missing", {status: 404}))
      .mockResolvedValueOnce(new Response(JSON.stringify({page: [{_id: "a", title: "Ship"}], isDone: true, continueCursor: "end"})));
    vi.stubGlobal("fetch", fetch);
    expect(await client().resolveTaskTitle!("Ship")).toEqual([{_id: "a", title: "Ship"}]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reads only the resolved goal and preserves exact progress semantics", async () => {
    const cli = client();
    vi.spyOn(cli, "listGoals").mockResolvedValue([{id: "g1", text: "Ship"}, {id: "g2", text: "Other"}]);
    const selected = vi.spyOn(cli, "listGoalTasks").mockResolvedValue({tasks: [
      {_id: "a", title: "Active"}, {_id: "b", title: "Done", completedAt: 1},
    ], links: {a: "g1", b: "g1"}});
    const all = vi.spyOn(cli, "listTasks");
    const links = vi.spyOn(cli, "listGoalLinks");
    const result = await executeLiveCommand(cli, "goals show", {positionals: ["goals", "show", "Ship"], options: {}});
    expect(selected).toHaveBeenCalledWith("g1");
    expect(all).not.toHaveBeenCalled();
    expect(links).not.toHaveBeenCalled();
    expect(result).toMatchObject({goal: {id: "g1", progress: {completed: 1, active: 2}, historicalTaskCount: 1, activeTasks: [{id: "a"}]}});
  });

  it("follows empty pages, preserves all results, and deduplicates repeated task IDs", async () => {
    const fetch = responses(
      {tasks: [{_id: "a", title: "Before"}], links: {a: "g"}, isDone: false, continueCursor: "one"},
      {tasks: [], links: {}, isDone: false, continueCursor: "two"},
      {tasks: [{_id: "a", title: "After"}, {_id: "b"}], links: {b: "g"}, isDone: true, continueCursor: "end"},
    );
    expect(await client().listGoalTasks!("g")).toEqual({tasks: [{_id: "a", title: "After"}, {_id: "b"}], links: {a: "g", b: "g"}});
    expect(String(fetch.mock.calls[0][0])).toContain("/goals/tasks?goalId=g");
    expect(String(fetch.mock.calls[2][0])).toContain("cursor=two");
  });

  it("does not replace an authentication failure with full history", async () => {
    const cli = client();
    vi.spyOn(cli, "listGoals").mockResolvedValue([]);
    vi.spyOn(cli, "listGoalTasks").mockRejectedValue(new ConvexHttpError(403, "Forbidden"));
    const all = vi.spyOn(cli, "listTasks");
    await expect(executeLiveCommand(cli, "goals list", {positionals: ["goals", "list"], options: {}})).rejects.toThrow("Forbidden");
    expect(all).not.toHaveBeenCalled();
  });

  it("rejects repeating cursors and missing routes after the first page", async () => {
    responses({tasks: [], links: {}, isDone: false, continueCursor: "one"}, {tasks: [], links: {}, isDone: false, continueCursor: "one"});
    await expect(client().listGoalTasks!()).rejects.toThrow("did not advance");
    const fetch = responses({tasks: [], links: {}, isDone: false, continueCursor: "one"});
    fetch.mockResolvedValueOnce(new Response("Not found", {status: 404}));
    await expect(client().listGoalTasks!()).rejects.toThrow("after the first page");
  });
});
