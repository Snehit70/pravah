import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { authClient, authStorageReady, hasCachedAuthSessionHint } from "../lib/auth-client";
import { completionOutcome, type CompletionOutcome } from "./widgetModel";

/** A whole completeTaskRemotely call never runs longer than this. */
export const WIDGET_REQUEST_TIMEOUT_MS = 8_000;
/** Reuse a minted Convex token until this close to its expiry. */
const TOKEN_REUSE_MARGIN_MS = 60_000;

export async function hasWidgetSession(): Promise<boolean> {
  await authStorageReady;
  return hasCachedAuthSessionHint();
}

// Kept in memory only (never written to storage). The headless JS runtime is
// often reused between widget taps, so a burst of ticks costs one token mint
// instead of one each, sparing the auth session reads behind every mint.
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Drops the in-memory token, e.g. on sign-out. */
export function forgetWidgetToken(): void {
  cachedToken = null;
}

function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

type TokenResult = { token: string; cached: boolean } | "auth" | "retry";

async function convexToken(signal: AbortSignal): Promise<TokenResult> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REUSE_MARGIN_MS > Date.now()) {
    return { token: cachedToken.token, cached: true };
  }
  cachedToken = null;
  const { data, error } = await authClient.convex.token({ fetchOptions: { throw: false, signal } });
  const token = data?.token;
  if (!token) {
    const status = (error as { status?: number } | null)?.status;
    return status === 401 || status === 403 ? "auth" : "retry";
  }
  const expiresAt = tokenExpiry(token);
  if (expiresAt !== null) cachedToken = { token, expiresAt };
  return { token, cached: false };
}

/**
 * Completes a task from the widget's headless task, without the React tree.
 * Uses the stored better-auth session to mint (or reuse) a Convex JWT, then
 * one HTTP mutation call, all within WIDGET_REQUEST_TIMEOUT_MS. Never throws.
 */
export async function completeTaskRemotely(taskId: string): Promise<CompletionOutcome> {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return "retry";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WIDGET_REQUEST_TIMEOUT_MS);
  try {
    await authStorageReady;
    if (controller.signal.aborted) return "retry";
    if (!hasCachedAuthSessionHint()) {
      forgetWidgetToken();
      return "auth";
    }
    const client = new ConvexHttpClient(convexUrl, {
      logger: false,
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const minted = await convexToken(controller.signal);
      if (typeof minted === "string") return minted;
      client.setAuth(minted.token);
      const outcome = completionOutcome(await client.mutation(api.tasks.completeTaskFromWidget, { taskId }));
      // A reused token the server no longer accepts: mint a fresh one once
      // rather than telling a signed-in user to sign in again.
      if (outcome === "auth" && minted.cached) {
        forgetWidgetToken();
        continue;
      }
      return outcome;
    }
    return "retry";
  } catch {
    // Offline, timed out, or a server that doesn't have the mutation yet.
    return "retry";
  } finally {
    clearTimeout(timer);
  }
}
