import { useCallback, useEffect, useRef } from "react";
import { AppState, Linking } from "react-native";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import { classifyError, mobileLogger } from "../lib/logger";
import type { AccentColor, ThemePreference } from "../lib/userPreferences";
import { isWidgetSupported, refreshHomeWidgets } from "./widgetBridge";
import { parseWidgetLink, type WidgetLinkTarget } from "./widgetLinks";
import {
  WIDGET_PENDING_MAX_AGE_MS,
  buildWidgetSnapshot,
  classifyCompletionFailure,
  markSnapshotTaskDone,
} from "./widgetModel";
import {
  clearWidgetStorage,
  readPendingCompletions,
  readWidgetSnapshot,
  updatePendingCompletions,
  writeWidgetNotice,
  writeWidgetSnapshot,
} from "./widgetStorage";

const SNAPSHOT_DEBOUNCE_MS = 800;

/** Signs the home-screen widget out and redraws it. Never throws. */
export async function clearHomeWidgets(): Promise<void> {
  if (!isWidgetSupported()) return;
  try {
    await clearWidgetStorage();
  } catch {
    // Storage failure leaves stale data; the signed-out check still hides it.
  }
  await refreshHomeWidgets();
}

type SyncOptions = {
  signedIn: boolean;
  sessionLoading: boolean;
  /** True once inbox, timeline and completed queries are live (not cached). */
  hasLiveData: boolean;
  inboxTasks: readonly MobileTask[];
  scheduledTasks: readonly MobileTask[];
  completedTasks: readonly MobileTask[];
  accent: AccentColor;
  theme: ThemePreference;
  completeTask: (args: { taskId: Id<"tasks"> }) => Promise<unknown>;
};

/**
 * Keeps the Android home-screen widget in step with the app:
 * - writes a snapshot after live data changes (debounced) and redraws;
 * - signs the widget out when the session ends;
 * - on foreground, sends ticks made from the widget while offline.
 * Does nothing where the widget module is not installed.
 */
export function useHomeWidgetSync(options: SyncOptions): void {
  const supported = isWidgetSupported();
  const {
    signedIn,
    sessionLoading,
    hasLiveData,
    inboxTasks,
    scheduledTasks,
    completedTasks,
    accent,
    theme,
    completeTask,
  } = options;

  // Guards a debounced write that is still in flight when the session ends,
  // so it cannot land after the sign-out clear.
  const signedInRef = useRef(signedIn);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  useEffect(() => {
    if (!supported || !signedIn || !hasLiveData) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const previous = await readWidgetSnapshot();
          if (!signedInRef.current) return;
          await writeWidgetSnapshot(
            buildWidgetSnapshot({
              now: new Date(),
              accent,
              theme,
              inboxCount: inboxTasks.length,
              scheduledTasks,
              completedTasks,
              previous,
            }),
          );
          await refreshHomeWidgets();
        } catch (error) {
          mobileLogger.warn("home_widget_snapshot_failed", { errorType: classifyError(error) });
        }
      })();
    }, SNAPSHOT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [accent, completedTasks, hasLiveData, inboxTasks, scheduledTasks, signedIn, supported, theme]);

  useEffect(() => {
    if (!supported || sessionLoading || signedIn) return;
    void clearHomeWidgets();
  }, [sessionLoading, signedIn, supported]);

  const completeTaskRef = useRef(completeTask);
  useEffect(() => {
    completeTaskRef.current = completeTask;
  }, [completeTask]);
  const drainingRef = useRef(false);

  const drainPending = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const pending = await readPendingCompletions();
      const settled = new Set<string>();
      const confirmed: string[] = [];
      let notice: string | null = null;
      for (const entry of pending) {
        try {
          await completeTaskRef.current({ taskId: entry.taskId as Id<"tasks"> });
          settled.add(entry.taskId);
          confirmed.push(entry.taskId);
        } catch (error) {
          const failure = classifyCompletionFailure(error);
          if (failure === "retry" && Date.now() - entry.at < WIDGET_PENDING_MAX_AGE_MS) continue;
          settled.add(entry.taskId);
          notice = failure === "auth" ? "Sign in again to sync" : "Couldn't complete · tap to open";
        }
      }
      if (settled.size > 0) {
        await updatePendingCompletions((current) => current.filter((entry) => !settled.has(entry.taskId)));
      }
      if (confirmed.length > 0) {
        // Show the ticks as done now; the next live snapshot write agrees.
        const snapshot = await readWidgetSnapshot();
        if (snapshot) {
          const at = Date.now();
          await writeWidgetSnapshot(confirmed.reduce((next, taskId) => markSnapshotTaskDone(next, taskId, at), snapshot));
        }
      }
      // Opening the app answers any earlier notice; only a fresh rejection shows one.
      await writeWidgetNotice(notice ? { message: notice, at: Date.now() } : null);
      await refreshHomeWidgets();
    } catch (error) {
      mobileLogger.warn("home_widget_drain_failed", { errorType: classifyError(error) });
    } finally {
      drainingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!supported || !signedIn) return;
    void drainPending();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void drainPending();
    });
    return () => subscription.remove();
  }, [drainPending, signedIn, supported]);
}

/**
 * Delivers widget deep links (cold start and while running). The handler
 * returns false when the app can't act on a link yet (e.g. still showing the
 * cached workspace); the link then waits and is offered again whenever the
 * handler changes. Only the latest link is kept.
 */
export function useWidgetDeepLinks(onLink: (target: WidgetLinkTarget) => boolean): void {
  const pendingRef = useRef<WidgetLinkTarget | null>(null);
  const onLinkRef = useRef(onLink);

  const deliver = useCallback((target: WidgetLinkTarget | null) => {
    if (!target) return;
    pendingRef.current = onLinkRef.current(target) ? null : target;
  }, []);

  useEffect(() => {
    onLinkRef.current = onLink;
    const target = pendingRef.current;
    if (target) pendingRef.current = onLink(target) ? null : target;
  }, [onLink]);

  useEffect(() => {
    let cancelled = false;
    Linking.getInitialURL()
      .then((url) => {
        if (!cancelled) deliver(parseWidgetLink(url));
      })
      .catch(() => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) => deliver(parseWidgetLink(url)));
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [deliver]);
}
