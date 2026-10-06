import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Subscription {
  name: string;
  args: unknown;
  onValue: (value: unknown) => void;
  onError: (error: Error) => void;
}

/**
 * Hoisted with the `vi.mock` factory below, which Vitest lifts to the top of
 * the file; a plain class declaration would not be initialised yet.
 */
const { FakeConvexClient } = vi.hoisted(() => {
  class FakeConvexClient {
    static instances: FakeConvexClient[] = [];

    readonly url: string;
    authFetcher: (() => Promise<string>) | null = null;
    subscriptions: Subscription[] = [];
    closed = false;
    onUpdateCalls = 0;

    constructor(url: string) {
      this.url = url;
      FakeConvexClient.instances.push(this);
    }

    setAuth(fetcher: () => Promise<string>) {
      this.authFetcher = fetcher;
    }

    onUpdate(
      reference: unknown,
      args: unknown,
      onValue: (value: unknown) => void,
      onError: (error: Error) => void
    ) {
      this.onUpdateCalls += 1;
      const entry: Subscription = {
        name: (reference as Record<symbol, string>)[Symbol.for("functionName")],
        args,
        onValue,
        onError,
      };
      this.subscriptions.push(entry);
      return () => {
        this.subscriptions = this.subscriptions.filter((s) => s !== entry);
      };
    }

    async close() {
      this.closed = true;
    }

    named(name: string) {
      return this.subscriptions.filter((s) => s.name === name);
    }
  }
  return { FakeConvexClient };
});

vi.mock("convex/browser", () => ({ ConvexClient: FakeConvexClient }));

import { runWatch, WatchAuthError } from "../../packages/cli/src/watchClient";
import type { WatchSnapshot } from "../../packages/cli/src/watchSnapshot";

const SITE_URL = "https://x.eu-west-1.convex.site";
const CONVEX_URL = "https://x.eu-west-1.convex.cloud";
const BEARER = "pravah_cred_secret";

const MINT_URL = `${SITE_URL}/automation/convex-token`;

let tokenCalls: Array<{ token: string; expiresAt: number }> = [];
let fetchMock: ReturnType<typeof vi.fn>;

function respondWithToken(token: string, expiresAt: number) {
  tokenCalls.push({ token, expiresAt });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      token,
      expiresAt,
      convexUrl: CONVEX_URL,
      siteUrl: SITE_URL,
      label: "Laptop",
    }),
  });
}

function respondWithStatus(status: number) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => "nope",
  });
}

/** 2026-09-28 23:59:30 local, so the next local midnight is 30s away. */
const LATE = new Date(2026, 8, 28, 23, 59, 30).getTime();

const BOARD = [{ id: "t1", title: "Ship", status: "timeline", deadline: "2026-09-28" }];
const DONE = [{ id: "t2", title: "Done", status: "completed" }];
const GOALS = [{ id: "g1", text: "Ship v2" }];
const LINKS = { t2: "g1" };

describe("runWatch", () => {
  let clock: number;
  let snapshots: WatchSnapshot[];
  let logs: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeConvexClient.instances = [];
    tokenCalls = [];
    snapshots = [];
    logs = [];
    clock = new Date(2026, 8, 28, 12, 0, 0).getTime();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const start = async (overrides: Partial<Parameters<typeof runWatch>[0]> = {}) => {
    respondWithToken("token-1", clock + 15 * 60 * 1000);
    return runWatch({
      siteUrl: SITE_URL,
      bearerToken: BEARER,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      log: (message) => logs.push(message),
      now: () => clock,
      ...overrides,
    });
  };

  const client = () => FakeConvexClient.instances[0]!;

  it("mints a token over HTTP and points the socket at the cloud url", async () => {
    await start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(MINT_URL);
    expect(client().url).toBe(CONVEX_URL);
  });

  it("subscribes to task and goal feeds before requesting selected links", async () => {
    await start();
    client().named("tasks:listBoardTasks")[0]!.onValue(BOARD);
    client().named("tasks:listTodayCompletedTasks")[0]!.onValue(DONE);
    const names = client().subscriptions.map((s) => s.name).sort();
    expect(names).toEqual([
      "goals:list",
      "goals:listLinks",
      "tasks:listBoardTasks",
      "tasks:listTodayCompletedTasks",
    ]);
  });

  it("bounds the completed-tasks query to the local day", async () => {
    await start();
    const day = client().named("tasks:listTodayCompletedTasks")[0]!;
    const startMs = new Date(2026, 8, 28).getTime();
    const endMs = new Date(2026, 8, 29).getTime();
    expect(day.args).toEqual({ dayStartMs: startMs, dayEndMs: endMs });
  });

  it("does not publish until every subscription has delivered once", async () => {
    await start();
    const push = (name: string, value: unknown) =>
      client().named(name)[0]!.onValue(value);

    push("tasks:listBoardTasks", BOARD);
    push("goals:list", GOALS);
    expect(snapshots).toHaveLength(0);

    expect(client().named("goals:listLinks")).toHaveLength(0);
    push("tasks:listTodayCompletedTasks", DONE);
    expect(snapshots).toHaveLength(0);
    push("goals:listLinks", LINKS);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.counts).toMatchObject({
      active: 1,
      completedToday: 1,
      goals: 1,
    });
  });

  it("re-publishes when any subscription changes", async () => {
    await start();
    for (const [name, value] of [
      ["tasks:listBoardTasks", BOARD],
      ["tasks:listTodayCompletedTasks", DONE],
      ["goals:list", GOALS],
      ["goals:listLinks", LINKS],
    ] as const) {
      client().named(name)[0]!.onValue(value);
    }
    expect(snapshots).toHaveLength(1);

    client().named("tasks:listBoardTasks")[0]!.onValue([
      ...BOARD,
      { id: "t3", title: "New", status: "inbox" },
    ]);
    expect(snapshots).toHaveLength(1);
    client().named("goals:listLinks")[0]!.onValue({ ...LINKS, t3: "g1" });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]!.counts.active).toBe(2);
    expect(snapshots[1]!.tasks.find(t => t.id === "t3")?.goalId).toBe("g1");
  });

  it("re-publishes a heartbeat when idle so generatedAt keeps advancing", async () => {
    await start();
    for (const [name, value] of [
      ["tasks:listBoardTasks", BOARD],
      ["tasks:listTodayCompletedTasks", DONE],
      ["goals:list", GOALS],
      ["goals:listLinks", LINKS],
    ] as const) {
      client().named(name)[0]!.onValue(value);
    }
    expect(snapshots).toHaveLength(1);

    clock += 61 * 1000;
    vi.advanceTimersByTime(61 * 1000);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]!.generatedAt).toBeGreaterThan(snapshots[0]!.generatedAt);
    expect(snapshots[1]!.counts).toEqual(snapshots[0]!.counts);
  });

  it("stops the heartbeat on close", async () => {
    const handle = await start();
    for (const [name, value] of [
      ["tasks:listBoardTasks", BOARD],
      ["tasks:listTodayCompletedTasks", DONE],
      ["goals:list", GOALS],
      ["goals:listLinks", LINKS],
    ] as const) {
      client().named(name)[0]!.onValue(value);
    }
    expect(snapshots).toHaveLength(1);
    await handle.close();
    clock += 10 * 60 * 1000;
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(snapshots).toHaveLength(1);
  });

  it("marks the snapshot degraded on subscription error and withholds heartbeats until fresh results", async () => {
    await start();
    for (const [name, value] of [
      ["tasks:listBoardTasks", BOARD],
      ["tasks:listTodayCompletedTasks", DONE],
      ["goals:list", GOALS],
      ["goals:listLinks", LINKS],
    ] as const) {
      client().named(name)[0]!.onValue(value);
    }
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.errors ?? []).toEqual([]);

    client().named("goals:list")[0]!.onError(new Error("boom"));
    expect(snapshots).toHaveLength(2);
    // The failure is visible in the file with the last complete data, not a
    // fresh timestamp on silently cached rows.
    expect(snapshots[1]!.errors).toEqual(["goals:list"]);
    expect(snapshots[1]!.tasks).toEqual(snapshots[0]!.tasks);

    // No healthy heartbeat while the source is failing.
    clock += 61 * 1000;
    vi.advanceTimersByTime(61 * 1000);
    expect(snapshots).toHaveLength(2);

    // A fresh value clears the error and resumes normal publishes.
    client().named("goals:list")[0]!.onValue(GOALS);
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]!.errors ?? []).toEqual([]);

    clock += 61 * 1000;
    vi.advanceTimersByTime(61 * 1000);
    expect(snapshots).toHaveLength(4);
    expect(snapshots[3]!.errors ?? []).toEqual([]);
  });

  it("withholds a degraded snapshot until the first complete data arrives", async () => {
    await start();
    // An error before every source delivers must not publish a partial board.
    client().named("goals:list")[0]!.onError(new Error("early"));
    expect(snapshots).toHaveLength(0);

    for (const [name, value] of [
      ["tasks:listBoardTasks", BOARD],
      ["tasks:listTodayCompletedTasks", DONE],
      ["goals:list", GOALS],
      ["goals:listLinks", LINKS],
    ] as const) {
      client().named(name)[0]!.onValue(value);
    }
    // The redelivery clears the error, so this is healthy, not degraded.
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.errors ?? []).toEqual([]);
  });

  it("refreshes the token before it expires and hands the new one to the socket", async () => {
    await start();
    const fetchToken = client().authFetcher!;
    expect(await fetchToken()).toBe("token-1");
    expect(tokenCalls).toHaveLength(1);

    // Still comfortably valid: no new call.
    clock += 10 * 60 * 1000;
    expect(await fetchToken()).toBe("token-1");
    expect(tokenCalls).toHaveLength(1);

    // Inside the refresh skew: mint again.
    clock = tokenCalls[0]!.expiresAt - 30 * 1000;
    respondWithToken("token-2", clock + 15 * 60 * 1000);
    expect(await fetchToken()).toBe("token-2");
    expect(tokenCalls).toHaveLength(2);
  });

  it("keeps the current token when a refresh fails, so the socket survives", async () => {
    await start();
    const fetchToken = client().authFetcher!;
    clock = tokenCalls[0]!.expiresAt - 30 * 1000;
    respondWithStatus(503);
    expect(await fetchToken()).toBe("token-1");
  });

  it("reports a revoked credential without throwing from the callback", async () => {
    const authErrors: Error[] = [];
    await start({ onAuthError: (error) => authErrors.push(error) });
    clock = tokenCalls[0]!.expiresAt - 30 * 1000;
    respondWithStatus(401);
    await client().authFetcher!();
    expect(authErrors).toHaveLength(1);
    expect(authErrors[0]).toBeInstanceOf(WatchAuthError);
    expect(authErrors[0]!.message).toContain("no longer authorized");
  });

  it("fails to start with an actionable error when the credential is unauthorized", async () => {
    respondWithStatus(401);
    const attempt = start();
    await expect(attempt).rejects.toBeInstanceOf(WatchAuthError);
    await expect(attempt).rejects.toThrow(/no longer authorized/);
  });

  it("surfaces a non-auth startup failure unchanged", async () => {
    respondWithStatus(503);
    await expect(start()).rejects.toThrow(/503/);
  });

  it("logs a non-auth subscription error without tearing down", async () => {
    const authErrors: Error[] = [];
    await start({ onAuthError: (error) => authErrors.push(error) });
    client().named("goals:list")[0]!.onError(new Error("transient"));
    expect(authErrors).toHaveLength(0);
    // The log names the Convex query so the failure is traceable.
    expect(logs.join("\n")).toContain("goals:list");
  });

  it("re-subscribes at local midnight with the new day bounds", async () => {
    clock = LATE;
    await start();
    const before = client().named("tasks:listTodayCompletedTasks")[0]!;
    expect(before.args).toEqual({
      dayStartMs: new Date(2026, 8, 28).getTime(),
      dayEndMs: new Date(2026, 8, 29).getTime(),
    });

    clock = new Date(2026, 8, 29, 0, 0, 5).getTime();
    vi.advanceTimersByTime(31 * 1000);

    const after = client().named("tasks:listTodayCompletedTasks")[0]!;
    expect(after).not.toBe(before);
    expect(after.args).toEqual({
      dayStartMs: new Date(2026, 8, 29).getTime(),
      dayEndMs: new Date(2026, 8, 30).getTime(),
    });
  });

  it("refreshes only today at midnight and reuses unchanged links", async () => {
    clock = LATE;
    await start();
    for (const [name, value] of [
      ["tasks:listBoardTasks", BOARD],
      ["tasks:listTodayCompletedTasks", DONE],
      ["goals:list", GOALS],
      ["goals:listLinks", LINKS],
    ] as const) {
      client().named(name)[0]!.onValue(value);
    }
    expect(snapshots).toHaveLength(1);

    clock = new Date(2026, 8, 29, 0, 0, 5).getTime();
    vi.advanceTimersByTime(31 * 1000);

    // A partial redelivery must not overwrite the board with half a day.
    client().named("goals:list")[0]!.onValue([]);
    expect(snapshots).toHaveLength(1);

    const calls = client().onUpdateCalls;
    client().named("tasks:listTodayCompletedTasks")[0]!.onValue(DONE);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]!.day).toBe("2026-09-29");
    expect(client().onUpdateCalls).toBe(calls);
  });

  it("unsubscribes the old queries at the rollover", async () => {
    clock = LATE;
    await start();
    expect(client().subscriptions).toHaveLength(3);

    clock = new Date(2026, 8, 29, 0, 0, 5).getTime();
    vi.advanceTimersByTime(31 * 1000);
    // Base subscriptions are renewed; links wait for both task feeds.
    expect(client().subscriptions).toHaveLength(3);
  });

  it("unsubscribes everything and closes the socket on close", async () => {
    const handle = await start();
    await handle.close();
    expect(client().subscriptions).toHaveLength(0);
    expect(client().closed).toBe(true);
  });

  it("deduplicates and sorts canonical task IDs and excludes historical links", async () => {
    await start();
    client().named("tasks:listBoardTasks")[0]!.onValue([{ _id: "b" }, { _id: "a" }]);
    client().named("tasks:listTodayCompletedTasks")[0]!.onValue([{ _id: "a" }]);
    const links = client().named("goals:listLinks")[0]!;
    expect(links.args).toEqual({ taskIds: ["a", "b"] });
    client().named("tasks:listBoardTasks")[0]!.onValue([{ _id: "a", title: "Changed" }, { _id: "b" }]);
    expect(client().named("goals:listLinks")[0]).toBe(links);
  });

  it("publishes empty workspaces without a goal-link read", async () => {
    await start();
    client().named("tasks:listBoardTasks")[0]!.onValue([]);
    client().named("tasks:listTodayCompletedTasks")[0]!.onValue([]);
    client().named("goals:list")[0]!.onValue([]);
    expect(client().named("goals:listLinks")).toHaveLength(0);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.counts.active).toBe(0);
  });

  it("handles synchronous cached link deliveries without duplicate snapshots", async () => {
    await start();
    const current = client();
    const onUpdate = current.onUpdate.bind(current);
    current.onUpdate = (reference, args, onValue, onError) => {
      const unsubscribe = onUpdate(reference, args, onValue, onError);
      if ((reference as Record<symbol, string>)[Symbol.for("functionName")] === "goals:listLinks") onValue(LINKS);
      return unsubscribe;
    };
    current.named("goals:list")[0]!.onValue(GOALS);
    current.named("tasks:listBoardTasks")[0]!.onValue(BOARD);
    current.named("tasks:listTodayCompletedTasks")[0]!.onValue(DONE);
    expect(snapshots).toHaveLength(1);
  });

  it("chunks more than 500 tasks and waits for all chunks, including recovery", async () => {
    await start();
    client().named("tasks:listBoardTasks")[0]!.onValue(Array.from({length: 501}, (_, i) => ({id: `t${i}`, title: "Task"})));
    client().named("tasks:listTodayCompletedTasks")[0]!.onValue([]);
    client().named("goals:list")[0]!.onValue(GOALS);
    const [first, second] = client().named("goals:listLinks");
    expect((first!.args as {taskIds: string[]}).taskIds).toHaveLength(500);
    expect((second!.args as {taskIds: string[]}).taskIds).toHaveLength(1);
    first!.onValue({t0: "g1"});
    expect(snapshots).toHaveLength(0);
    second!.onValue({t99: "g1"});
    expect(snapshots).toHaveLength(1);
    first!.onError(new Error("first failed"));
    second!.onValue({});
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]!.errors).toEqual(["goals:listLinks"]);
    first!.onValue({t0: "g1"});
    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]!.errors ?? []).toEqual([]);
  });

  it("ignores stale link callbacks after selection changes and close", async () => {
    const handle = await start();
    client().named("tasks:listBoardTasks")[0]!.onValue(BOARD);
    client().named("tasks:listTodayCompletedTasks")[0]!.onValue(DONE);
    client().named("goals:list")[0]!.onValue(GOALS);
    const old = client().named("goals:listLinks")[0]!;
    old.onValue(LINKS);
    client().named("tasks:listTodayCompletedTasks")[0]!.onValue([]);
    old.onValue({t1: "wrong"});
    old.onError(new Error("obsolete"));
    expect(snapshots).toHaveLength(1);
    const current = client().named("goals:listLinks")[0]!;
    current.onValue({t1: "g1"});
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]!.tasks[0]!.goalId).toBe("g1");
    await handle.close();
    current.onValue({t1: "wrong"});
    expect(snapshots).toHaveLength(2);
  });

  it("does not fire the rollover after close", async () => {
    clock = LATE;
    const handle = await start();
    const callsBefore = client().onUpdateCalls;
    await handle.close();
    clock = new Date(2026, 8, 29, 0, 0, 5).getTime();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(client().onUpdateCalls).toBe(callsBefore);
  });

  it("does not keep the process alive waiting for the rollover", async () => {
    // Real timers here: the fake-timer handle is not a real Timeout, so the
    // unref call that keeps the daemon from lingering is only observable with
    // the real one. Without unref, a `pravah watch` whose close path was skipped
    // would keep the event loop alive until local midnight.
    vi.useRealTimers();
    const unrefCalls: unknown[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((handler: TimerHandler, timeout?: number, ...rest: unknown[]) => {
        const handle = realSetTimeout(handler, timeout, ...rest) as unknown as {
          unref?: () => unknown;
        };
        if (handle && typeof handle.unref === "function") {
          const original = handle.unref.bind(handle);
          handle.unref = () => {
            unrefCalls.push(handle);
            return original();
          };
        }
        return handle;
      }) as unknown as typeof globalThis.setTimeout);

    try {
      const handle = await start();
      expect(unrefCalls.length).toBeGreaterThan(0);
      await handle.close();
    } finally {
      spy.mockRestore();
    }
  });
});
