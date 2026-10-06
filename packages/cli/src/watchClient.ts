/// <reference types="node" />
import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { callConvexApi, ConvexHttpError } from "./automationHttpClient";
import { getLocalDayBounds, msUntilNextLocalMidnight } from "./localDay";
import { buildSnapshot, type WatchSnapshot } from "./watchSnapshot";

/**
 * The public queries `pravah watch` subscribes to. `makeFunctionReference` is
 * used instead of importing the generated api so the published CLI bundle does
 * not pull in the backend's generated module graph.
 */
type NoArgs = Record<string, never>;

const listBoardTasks = makeFunctionReference<"query", NoArgs, unknown>(
  "tasks:listBoardTasks"
);
const listTodayCompletedTasks = makeFunctionReference<
  "query",
  { dayStartMs: number; dayEndMs: number },
  unknown
>("tasks:listTodayCompletedTasks");
const listGoals = makeFunctionReference<"query", NoArgs, unknown>("goals:list");
const listGoalLinks = makeFunctionReference<"query", { taskIds: string[] }, unknown>(
  "goals:listLinks"
);

export interface OwnerToken {
  token: string;
  expiresAt: number;
  convexUrl: string;
  siteUrl: string;
  label: string;
}

/** Refresh a little before expiry so a long-lived socket is never left unauthenticated. */
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

/**
 * Re-publish the latest snapshot this often even when no query changed, so a
 * healthy but idle websocket still advances `generatedAt` and the widget can
 * tell "alive" apart from "daemon died right after publishing".
 */
export const WATCH_HEARTBEAT_MS = 60 * 1000;

export async function fetchOwnerToken(
  siteUrl: string,
  bearerToken: string
): Promise<OwnerToken> {
  const response = await callConvexApi({
    convexUrl: siteUrl,
    endpoint: "/automation/convex-token",
    method: "POST",
    bearerToken,
  });

  if (
    !response ||
    typeof response !== "object" ||
    typeof (response as OwnerToken).token !== "string" ||
    typeof (response as OwnerToken).expiresAt !== "number" ||
    typeof (response as OwnerToken).convexUrl !== "string"
  ) {
    throw new Error("Convex token response is invalid");
  }
  return response as OwnerToken;
}

export class WatchAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchAuthError";
  }
}

type SourceKey = "boardTasks" | "completedToday" | "goals" | "goalLinks";

const SOURCE_KEYS: SourceKey[] = [
  "boardTasks",
  "completedToday",
  "goals",
  "goalLinks",
];

const emptySources = (): Record<SourceKey, unknown> => ({
  boardTasks: null,
  completedToday: null,
  goals: null,
  goalLinks: null,
});

const notReady = (): Record<SourceKey, boolean> => ({
  boardTasks: false,
  completedToday: false,
  goals: false,
  goalLinks: false,
});

export type WatchLogger = (message: string) => void;

export interface RunWatchOptions {
  siteUrl: string;
  bearerToken: string;
  onSnapshot: (snapshot: WatchSnapshot) => void;
  /**
   * Called when the credential stops being authorized. The subscription cannot
   * recover from this, so the caller is expected to shut down; throwing from
   * inside a websocket callback would only produce an unhandled rejection.
   */
  onAuthError?: (error: Error) => void;
  log?: WatchLogger;
  now?: () => number;
}

export interface WatchHandle {
  close(): Promise<void>;
}

/**
 * Opens one Convex websocket as the credential's owner and re-emits a snapshot
 * whenever any subscribed query changes.
 *
 * The automation bearer is never put on the socket. It is exchanged for a short
 * lived Convex token over HTTP, and only that token is handed to `setAuth`.
 */
export async function runWatch({
  siteUrl,
  bearerToken,
  onSnapshot,
  onAuthError,
  log = () => {},
  now = Date.now,
}: RunWatchOptions): Promise<WatchHandle> {
  const asAuthError = (error: unknown): Error | null => {
    const status = error instanceof ConvexHttpError ? error.status : null;
    if (status === 401 || status === 403) {
      return new WatchAuthError(
        "Pravah CLI credential is no longer authorized. Run `pravah auth login --bootstrap-token <token>`."
      );
    }
    return null;
  };

  // The opening mint is awaited, so a revoked credential fails here. Report it
  // the same way the other commands do rather than surfacing raw HTTP text.
  let ownerToken: OwnerToken;
  try {
    ownerToken = await fetchOwnerToken(siteUrl, bearerToken);
  } catch (error) {
    const authError = asAuthError(error);
    if (authError) {
      if (onAuthError) onAuthError(authError);
      throw authError;
    }
    throw error;
  }

  const convexUrl = ownerToken.convexUrl;
  const client = new ConvexClient(convexUrl);

  // Invoked from Convex callbacks, where throwing would surface as an unhandled
  // rejection rather than a message the user can act on.
  const reportAsync = (error: unknown) => {
    const authError = asAuthError(error);
    if (authError) {
      if (onAuthError) onAuthError(authError);
      else log(`watch: ${authError.message}`);
      return;
    }
    log(`watch: ${String(error)}`);
  };

  // Used from awaited setup code, where a throw is the right control flow.
  const throwOnAuthError = (error: unknown): never => {
    const authError = asAuthError(error);
    if (authError) throw authError;
    throw error;
  };

  client.setAuth(async () => {
    if (ownerToken.expiresAt - TOKEN_REFRESH_SKEW_MS <= now()) {
      try {
        ownerToken = await fetchOwnerToken(siteUrl, bearerToken);
      } catch (error) {
        reportAsync(error);
        // Returning a token we already hold keeps the socket usable while the
        // caller shuts down; the next refresh attempt reports the real reason.
        return ownerToken.token;
      }
    }
    return ownerToken.token;
  });

  const unsubscribes: Array<() => void> = [];
  const latest = emptySources();
  // Only publish once every subscription has produced its first value, so a
  // partial snapshot is never written.
  const ready = notReady();
  // Queries currently failing. While any entry is present the snapshot is
  // degraded: healthy heartbeats stop and resume only after every source
  // delivers a fresh value again.
  const sourceErrors = new Map<SourceKey, string>();
  let lastComplete: WatchSnapshot | undefined;
  let closed = false;
  let linkGeneration = 0;
  let linkSelection: string | undefined;
  let linkUnsubscribes: Array<() => void> = [];
  let todayUnsubscribe: (() => void) | undefined;
  let dayGeneration = 0;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const publish = () => {
    if (!SOURCE_KEYS.every((key) => ready[key])) return;
    if (closed) return;
    lastComplete = buildSnapshot({
      convexUrl,
      boardTasks: latest.boardTasks,
      completedToday: latest.completedToday,
      goals: latest.goals,
      goalLinks: latest.goalLinks,
      now: new Date(now()),
    });
    onSnapshot(lastComplete);
  };

  // A failing source must be visible in the file, not hidden behind a
  // heartbeat that keeps stamping fresh `generatedAt` on cached data. Emit
  // the last complete snapshot marked with the failing queries; the regular
  // heartbeat path stays gated on `publish`, so it resumes only after fresh
  // results clear every error.
  const publishDegraded = () => {
    // Keep the original data and timestamp while replacement feeds are pending.
    if (!lastComplete || closed) return;
    onSnapshot({
      ...lastComplete,
      errors: SOURCE_KEYS.filter((key) => sourceErrors.has(key)).map(
        (key) => sourceErrors.get(key) as string
      ),
    });
  };

  const track = (name: SourceKey) => (value: unknown) => {
    if (closed) return;
    latest[name] = value;
    ready[name] = true;
    sourceErrors.delete(name);
    if (name === "boardTasks" || name === "completedToday") refreshLinks();
    publish();
  };

  // Name the Convex query, not the internal key, so the log is actionable.
  const failed = (query: string, key: SourceKey) => (error: unknown) => {
    if (closed) return;
    reportAsync(error);
    log(`watch: ${query} subscription failed`);
    ready[key] = false;
    sourceErrors.set(key, query);
    publishDegraded();
  };

  // Link queries depend on both task feeds. Never publish a new task set with
  // associations from the previous set, and never fall back to all history.
  const refreshLinks = () => {
    if (!ready.boardTasks || !ready.completedToday) return;
    const ids = new Set<string>();
    for (const source of [latest.boardTasks, latest.completedToday]) {
      if (!Array.isArray(source)) continue;
      for (const row of source) {
        const id = row?.id ?? row?._id ?? row?.clientId;
        if (typeof id === "string" && id) ids.add(id);
      }
    }
    const taskIds = [...ids].sort();
    const selection = JSON.stringify(taskIds);
    if (selection === linkSelection) return;
    linkSelection = selection;
    const generation = ++linkGeneration;
    for (const unsubscribe of linkUnsubscribes) unsubscribe();
    linkUnsubscribes = [];
    ready.goalLinks = false;
    sourceErrors.delete("goalLinks");
    if (taskIds.length === 0) {
      latest.goalLinks = {};
      ready.goalLinks = true;
      return;
    }
    const chunks: string[][] = [];
    for (let i = 0; i < taskIds.length; i += 500) chunks.push(taskIds.slice(i, i + 500));
    const results = new Map<number, Record<string, string>>();
    const errors = new Set<number>();
    let subscribing = true;
    const publishLinks = (emit = true) => {
      if (subscribing || closed || generation !== linkGeneration) return;
      if (errors.size || results.size !== chunks.length) return;
      latest.goalLinks = Object.assign({}, ...chunks.map((_, index) => results.get(index)));
      ready.goalLinks = true;
      sourceErrors.delete("goalLinks");
      if (emit) publish();
    };
    try {
      for (const [index, chunk] of chunks.entries()) {
        linkUnsubscribes.push(client.onUpdate(listGoalLinks, { taskIds: chunk }, (value) => {
          if (closed || generation !== linkGeneration) return;
          results.set(index, value as Record<string, string>);
          errors.delete(index);
          publishLinks();
        }, (error) => {
          if (closed || generation !== linkGeneration) return;
          errors.add(index);
          failed("goals:listLinks", "goalLinks")(error);
        }));
      }
    } catch (error) {
      failed("goals:listLinks", "goalLinks")(error);
      // Allow the next task delivery to retry setup after a synchronous failure.
      linkSelection = undefined;
    } finally {
      subscribing = false;
    }
    // The task delivery calls publish after this returns. Cached callbacks
    // may have completed synchronously, so do not emit the same snapshot twice.
    publishLinks(false);
  };

  const scheduleMidnightResubscribe = () => {
    midnightTimer = setTimeout(() => {
      if (closed) return;
      ready.completedToday = false;
      try {
        subscribeToday();
      } catch (error) {
        failed("tasks:listTodayCompletedTasks", "completedToday")(error);
      }
      scheduleMidnightResubscribe();
    }, msUntilNextLocalMidnight(new Date(now())));
    // Do not hold the process open for a midnight rollover.
    midnightTimer.unref?.();
  };

  const subscribeToday = () => {
    const generation = ++dayGeneration;
    todayUnsubscribe?.();
    const { startMs, endMs } = getLocalDayBounds(new Date(now()));
    todayUnsubscribe = client.onUpdate(
      listTodayCompletedTasks,
      { dayStartMs: startMs, dayEndMs: endMs },
      (value) => { if (generation === dayGeneration) track("completedToday")(value); },
      (error) => { if (generation === dayGeneration) failed("tasks:listTodayCompletedTasks", "completedToday")(error); }
    );
  };

  const subscribe = () => {
    subscribeToday();
    unsubscribes.push(client.onUpdate(
        listBoardTasks,
        {},
        track("boardTasks"),
        failed("tasks:listBoardTasks", "boardTasks")
      ));
    unsubscribes.push(client.onUpdate(
        listGoals,
        {},
        track("goals"),
        failed("goals:list", "goals")
      ));
  };

  try {
    subscribe();
  } catch (error) {
    closed = true;
    todayUnsubscribe?.();
    for (const unsubscribe of unsubscribes) unsubscribe();
    for (const unsubscribe of linkUnsubscribes) unsubscribe();
    await client.close();
    throwOnAuthError(error);
  }
  scheduleMidnightResubscribe();
  heartbeatTimer = setInterval(() => {
    publish();
  }, WATCH_HEARTBEAT_MS);
  // Do not hold the process open for a heartbeat tick.
  heartbeatTimer.unref?.();

  return {
    async close() {
      closed = true;
      ++linkGeneration;
      ++dayGeneration;
      todayUnsubscribe?.();
      if (midnightTimer) clearTimeout(midnightTimer);
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
      for (const unsubscribe of unsubscribes) unsubscribe();
      for (const unsubscribe of linkUnsubscribes) unsubscribe();
      linkUnsubscribes = [];
      unsubscribes.length = 0;
      await client.close();
    },
  };
}
