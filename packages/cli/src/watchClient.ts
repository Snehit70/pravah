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
const listGoalLinks = makeFunctionReference<"query", NoArgs, unknown>(
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
   * Called when authentication fails, including token refresh failures. The
   * caller must stop so a supervisor can restart with a fresh token exchange.
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

  let authenticated = false;
  let authFailureReported = false;
  let unsubscribes: Array<() => void> = [];
  const latest = emptySources();
  // Only publish once every subscription has produced its first value, so a
  // partial snapshot is never written.
  const ready = notReady();
  // Queries currently failing. While any entry is present the snapshot is
  // degraded: healthy heartbeats stop and resume only after every source
  // delivers a fresh value again.
  const sourceErrors = new Map<SourceKey, string>();
  let hasPublished = false;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const publish = () => {
    // Cached query values survive a dropped socket. They cannot prove that
    // the daemon is still receiving updates, nor can an expired auth token.
    if (!authenticated || !client.connectionState().isWebSocketConnected || ownerToken.expiresAt <= now()) return;
    if (!SOURCE_KEYS.every((key) => ready[key])) return;
    hasPublished = true;
    onSnapshot(
      buildSnapshot({
        convexUrl,
        boardTasks: latest.boardTasks,
        completedToday: latest.completedToday,
        goals: latest.goals,
        goalLinks: latest.goalLinks,
        now: new Date(now()),
      })
    );
  };

  // A failing source must be visible in the file, not hidden behind a
  // heartbeat that keeps stamping fresh `generatedAt` on cached data. Emit
  // the last complete snapshot marked with the failing queries; the regular
  // heartbeat path stays gated on `publish`, so it resumes only after fresh
  // results clear every error.
  const publishDegraded = () => {
    // Only ever mark the last complete data, never a partial read: after a
    // re-subscribe the sources are null until each one redelivers.
    if (!hasPublished) return;
    if (!SOURCE_KEYS.every((key) => latest[key] !== null)) return;
    onSnapshot({
      ...buildSnapshot({
        convexUrl,
        boardTasks: latest.boardTasks,
        completedToday: latest.completedToday,
        goals: latest.goals,
        goalLinks: latest.goalLinks,
        now: new Date(now()),
      }),
      errors: SOURCE_KEYS.filter((key) => sourceErrors.has(key)).map(
        (key) => sourceErrors.get(key) as string
      ),
    });
  };

  const track = (name: SourceKey) => (value: unknown) => {
    latest[name] = value;
    ready[name] = true;
    sourceErrors.delete(name);
    publish();
  };

  // Name the Convex query, not the internal key, so the log is actionable.
  const failed = (query: string, key: SourceKey) => (error: unknown) => {
    reportAsync(error);
    log(`watch: ${query} subscription failed`);
    ready[key] = false;
    sourceErrors.set(key, query);
    publishDegraded();
  };

  const scheduleMidnightResubscribe = () => {
    midnightTimer = setTimeout(() => {
      resubscribe();
    }, msUntilNextLocalMidnight(new Date(now())));
    // Do not hold the process open for a midnight rollover.
    midnightTimer.unref?.();
  };

  const subscribe = (): Array<() => void> => {
    const { startMs, endMs } = getLocalDayBounds(new Date(now()));
    return [
      client.onUpdate(
        listBoardTasks,
        {},
        track("boardTasks"),
        failed("tasks:listBoardTasks", "boardTasks")
      ),
      client.onUpdate(
        listTodayCompletedTasks,
        { dayStartMs: startMs, dayEndMs: endMs },
        track("completedToday"),
        failed("tasks:listTodayCompletedTasks", "completedToday")
      ),
      client.onUpdate(
        listGoals,
        {},
        track("goals"),
        failed("goals:list", "goals")
      ),
      client.onUpdate(
        listGoalLinks,
        {},
        track("goalLinks"),
        failed("goals:listLinks", "goalLinks")
      ),
    ];
  };

  // A subscribed query's arguments are fixed for its lifetime, so "today"
  // bounds go stale at local midnight. Re-subscribe instead of serving yesterday.
  const resubscribe = () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
    unsubscribes = [];
    for (const key of SOURCE_KEYS) {
      ready[key] = false;
      latest[key] = null;
    }
    sourceErrors.clear();
    try {
      unsubscribes = subscribe();
    } catch (error) {
      reportAsync(error);
    }
    scheduleMidnightResubscribe();
  };

  const failAuthentication = (error: Error) => {
    authenticated = false;
    if (authFailureReported) return;
    authFailureReported = true;
    if (onAuthError) onAuthError(error);
    else log(`watch: ${error.message}`);
  };

  client.setAuth(async ({ forceRefreshToken }) => {
    if (forceRefreshToken || ownerToken.expiresAt - TOKEN_REFRESH_SKEW_MS <= now()) {
      try {
        ownerToken = await fetchOwnerToken(siteUrl, bearerToken);
      } catch (error) {
        failAuthentication(asAuthError(error) ?? new Error(
          `Pravah watch token refresh failed; restart \`pravah watch\` to retry: ${String(error)}`
        ));
        // A cached JWT disables the SDK's future refresh scheduling. Let it
        // report failure instead; the CLI exits and systemd retries the mint.
        return null;
      }
    }
    return ownerToken.token;
  }, (isAuthenticated) => {
    authenticated = isAuthenticated;
    if (!isAuthenticated) failAuthentication(new Error(
      "Pravah watch authentication failed; restart `pravah watch` to retry."
    ));
  });

  try {
    unsubscribes = subscribe();
  } catch (error) {
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
      if (midnightTimer) clearTimeout(midnightTimer);
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }
      for (const unsubscribe of unsubscribes) unsubscribe();
      unsubscribes = [];
      await client.close();
    },
  };
}
