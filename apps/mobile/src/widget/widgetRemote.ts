import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { authClient, authStorageReady, hasCachedAuthSessionHint } from "../lib/auth-client";
import { classifyError } from "../lib/logger";

export type RemoteCompletionResult =
  | { kind: "done" }
  /** Offline or a transient failure: keep it pending and retry later. */
  | { kind: "retry" }
  /** The server said no (deleted, cancelled, not ours, signed out): drop it. */
  | { kind: "rejected"; reason: "auth" | "server" };

export async function hasWidgetSession(): Promise<boolean> {
  await authStorageReady;
  return hasCachedAuthSessionHint();
}

/**
 * Completes a task from the widget's headless task, without the React tree.
 * Uses the stored better-auth session to mint a Convex JWT, then one HTTP
 * mutation call. Never throws.
 */
export async function completeTaskRemotely(taskId: string): Promise<RemoteCompletionResult> {
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!convexUrl) return { kind: "retry" };
  try {
    await authStorageReady;
    if (!hasCachedAuthSessionHint()) return { kind: "rejected", reason: "auth" };
    const { data, error } = await authClient.convex.token({ fetchOptions: { throw: false } });
    const token = data?.token;
    if (!token) {
      const status = (error as { status?: number } | null)?.status;
      return status === 401 || status === 403 ? { kind: "rejected", reason: "auth" } : { kind: "retry" };
    }
    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(token);
    await client.mutation(api.tasks.completeTask, { taskId: taskId as Id<"tasks"> });
    return { kind: "done" };
  } catch (error) {
    const kind = classifyError(error);
    if (kind === "network") return { kind: "retry" };
    if (kind === "auth") return { kind: "rejected", reason: "auth" };
    return { kind: "rejected", reason: "server" };
  }
}
