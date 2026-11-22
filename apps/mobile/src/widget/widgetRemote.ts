import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { authClient, authStorageReady, hasCachedAuthSessionHint } from "../lib/auth-client";
import { completionOutcome, type CompletionOutcome } from "./widgetModel";

/** One network call from the headless task never runs longer than this. */
const REQUEST_TIMEOUT_MS = 8_000;

export async function hasWidgetSession(): Promise<boolean> {
  await authStorageReady;
  return hasCachedAuthSessionHint();
}

/**
 * Completes a task from the widget's headless task, without the React tree.
 * Uses the stored better-auth session to mint a Convex JWT, then one HTTP
 * mutation call, each capped at REQUEST_TIMEOUT_MS. Never throws.
 */
export async function completeTaskRemotely(taskId: string): Promise<CompletionOutcome> {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return "retry";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    await authStorageReady;
    if (!hasCachedAuthSessionHint()) return "auth";
    const { data, error } = await authClient.convex.token({
      fetchOptions: { throw: false, signal: controller.signal },
    });
    const token = data?.token;
    if (!token) {
      const status = (error as { status?: number } | null)?.status;
      return status === 401 || status === 403 ? "auth" : "retry";
    }
    const client = new ConvexHttpClient(convexUrl, {
      logger: false,
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    });
    client.setAuth(token);
    return completionOutcome(await client.mutation(api.tasks.completeTaskFromWidget, { taskId }));
  } catch {
    // Offline, timed out, or a server that doesn't have the mutation yet.
    return "retry";
  } finally {
    clearTimeout(timer);
  }
}
