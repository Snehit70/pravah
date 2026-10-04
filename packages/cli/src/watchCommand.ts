/// <reference types="node" />
import { readOption } from "./args";
import { emitSuccess, successEnvelope } from "./envelope";
import { loadStoredCredential } from "./authStore";
import { resolveStoredCredentialSiteUrl } from "./liveClient";
import { formatWaybarSegment } from "./watchFormat";
import { runWatch } from "./watchClient";
import { acquireWatchLock } from "./watchLock";
import {
  describeSnapshotForHumans,
  isSnapshotStale,
  readSnapshot,
  resolveLockPath,
  resolveSnapshotPath,
  type WatchSnapshot,
  writeSnapshotAtomically,
} from "./watchSnapshot";
import type { ParsedArgs } from "./types";

const COMMAND = "watch";

export type WatchFormat = "snapshot" | "waybar";

export interface WatchCommandPlan {
  mode: "print" | "stream";
  format: WatchFormat;
  json: boolean;
  printPath: boolean;
}

export function resolveWatchFormat(value: string | undefined): WatchFormat {
  if (value === undefined) return "snapshot";
  if (value === "waybar") return "waybar";
  if (value === "snapshot" || value === "json") return "snapshot";
  throw new Error(`Unsupported --format ${value}. Supported: snapshot, waybar`);
}

export function planWatchCommand(args: ParsedArgs): WatchCommandPlan {
  const json = args.options.json === true;
  const format = resolveWatchFormat(readOption(args.options, "format"));
  const printPath = args.options.path === true;
  const print = args.options.print === true;
  return {
    mode: print || printPath ? "print" : "stream",
    format,
    json: format === "snapshot" ? json : false,
    printPath,
  };
}

function requireStoredCredential() {
  const credential = loadStoredCredential();
  if (!credential) {
    throw new Error(
      "Pravah CLI is not authenticated. Run `pravah auth login --bootstrap-token <token>`."
    );
  }
  // Stored credentials from before the production migration still point at the
  // legacy deployment. Every other command migrates them through
  // `resolveStoredCredentialSiteUrl`; `watch` must do the same or it opens its
  // websocket against a deployment that no longer serves the token route.
  const siteUrl = resolveStoredCredentialSiteUrl(credential.siteUrl);
  if (!siteUrl) {
    throw new Error("Stored Pravah credential has no site URL. Run `pravah auth login` again.");
  }
  return { secret: credential.secret, siteUrl };
}

function writeStreamLine(snapshot: WatchSnapshot, plan: WatchCommandPlan) {
  if (plan.format === "waybar") {
    process.stdout.write(`${JSON.stringify(formatWaybarSegment(snapshot))}\n`);
    return;
  }
  // Deliberately not `emitSuccess`, which exits: this stream outlives the
  // first snapshot and the process must stay up to keep serving updates.
  process.stdout.write(`${JSON.stringify(successEnvelope(COMMAND, snapshot))}\n`);
}

/**
 * `--path` reports where the snapshot lives without reading it. A widget uses
 * this once at startup so it can watch the file directly, instead of spawning
 * the CLI on every update or duplicating the XDG resolution rules in QML.
 */
function runPrintPath() {
  process.stdout.write(`${resolveSnapshotPath()}\n`);
}

/**
 * `--print` reads the snapshot the daemon already writes and never opens a
 * socket, so a widget can render without a second authenticated connection.
 */
function runPrint(plan: WatchCommandPlan) {
  if (plan.printPath) {
    runPrintPath();
    return;
  }
  const snapshotPath = resolveSnapshotPath();
  const snapshot = readSnapshot(snapshotPath);
  if (!snapshot) {
    throw new Error(
      `No watch snapshot at ${snapshotPath}. Start one with \`pravah watch\`.`
    );
  }
  if (plan.format === "waybar") {
    process.stdout.write(`${JSON.stringify(formatWaybarSegment(snapshot))}\n`);
    return;
  }
  const stale = isSnapshotStale(snapshot);
  if (plan.json) {
    emitSuccess(COMMAND, { ...snapshot, snapshotPath, stale }, stale ? 1 : 0);
    return;
  }
  const suffix = stale ? "  (stale)" : "";
  process.stdout.write(`${describeSnapshotForHumans(snapshot)}${suffix}\n`);
}

export async function runWatchCommand(args: ParsedArgs): Promise<void> {
  const plan = planWatchCommand(args);
  if (plan.mode === "print") {
    runPrint(plan);
    return;
  }

  const credential = requireStoredCredential();

  const snapshotPath = resolveSnapshotPath();
  const lock = acquireWatchLock(resolveLockPath());

  // The snapshot file is the product of the daemon; stdout is only a stream for
  // whoever asked for one.
  const onSnapshot = (snapshot: WatchSnapshot) => {
    writeSnapshotAtomically(snapshotPath, snapshot);
    if (plan.format === "waybar" || plan.json) writeStreamLine(snapshot, plan);
  };

  let handle: Awaited<ReturnType<typeof runWatch>> | null = null;
  const shutdown = async (code: number, message?: string) => {
    try {
      await handle?.close();
    } finally {
      lock.release();
      if (message) process.stderr.write(`Error: ${message}\n`);
      process.exit(code);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(0);
    });
  }

  try {
    handle = await runWatch({
      siteUrl: credential.siteUrl,
      bearerToken: credential.secret,
      onSnapshot,
      // Stop on auth failure so a supervisor retries the token exchange instead
      // of leaving a live process with an unauthenticated subscription.
      onAuthError: (error) => {
        void shutdown(1, error.message);
      },
      log: (message) => process.stderr.write(`${message}\n`),
    });
  } catch (error) {
    lock.release();
    throw error;
  }

  if (plan.format !== "waybar" && !plan.json) {
    process.stderr.write(`pravah watch writing ${snapshotPath} — Ctrl-C to stop\n`);
  }
}
