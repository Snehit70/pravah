/**
 * Pure helpers for presenting integration sync state honestly.
 *
 * Kept dependency-free (no React / native modules) so the display logic can be
 * unit-tested in isolation and reused by both the settings hook and the UI.
 */

export type SyncHealth = "healthy" | "error" | "paused" | "disconnected";

/** Reduce a raw backend error (often an uncaught Error with a stack trace) to
 *  one human-readable line, so the UI never shows an uppercased stack dump. */
export function summarizeSyncError(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (/too many documents read/i.test(raw)) {
    return "The last sync was too large to finish in one pass. Retry the sync.";
  }
  const firstLine = raw
    .split("\n")[0]
    .replace(/^Uncaught\s+/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
  return firstLine || "The last sync didn't finish.";
}

/** Collapse the separate connection/enabled/error fields into one honest health
 *  state. An unresolved lastError outranks everything: a green "Connected" while
 *  sync is silently failing is the dishonesty this exists to prevent. */
export function deriveSyncHealth(input: {
  status: string;
  syncEnabled: boolean;
  hasAccount: boolean;
  lastError?: string;
}): SyncHealth {
  if (input.lastError) return "error";
  if (input.status === "disconnected") return "disconnected";
  if (!input.syncEnabled) return "paused";
  return "healthy";
}
