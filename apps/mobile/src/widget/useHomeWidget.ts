import { useCallback, useEffect, useRef } from "react";
import { AppState, Linking } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { MobileTask } from "../components/TaskCard";
import { classifyError, mobileLogger } from "../lib/logger";
import type { AccentColor, ThemePreference } from "../lib/userPreferences";
import { isWidgetSupported, refreshHomeWidgets } from "./widgetBridge";
import { parseWidgetLink, type WidgetLinkTarget } from "./widgetLinks";
import {
  WIDGET_PENDING_MAX_AGE_MS,
  buildWidgetSnapshot,
  completionNotice,
  completionOutcome,
  markSnapshotTaskDone,
} from "./widgetModel";
import {
  clearWidgetStorage,
  readPendingCompletions,
  readWidgetNotice,
  readWidgetSnapshot,
  updatePendingCompletions,
  writeWidgetNotice,
  writeWidgetSnapshot,
} from "./widgetStorage";

const SNAPSHOT_DEBOUNCE_MS = 800;
const WIDGET_LINK_HOLD_MS = 30_000;

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
};

/**
 * Keeps the Android home-screen widget in step with the app:
 * - writes a snapshot after live data changes (debounced) and redraws;
 * - signs the widget out when the session ends;
 * - once live data is in (so Convex auth is set) and on foreground, sends
 *   ticks the widget couldn't deliver itself.
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

  const completeFromWidget = useMutation(api.tasks.completeTaskFromWidget);
  const completeRef = useRef(completeFromWidget);
  useEffect(() => {
    completeRef.current = completeFromWidget;
  }, [completeFromWidget]);
  const drainingRef = useRef(false);

  const drainPending = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    const startedAt = Date.now();
    try {
      const pending = await readPendingCompletions();
      const settled = new Set<string>();
      const confirmed: string[] = [];
      let notice: string | null = null;
      for (const entry of pending) {
        let outcome: ReturnType<typeof completionOutcome>;
        try {
          outcome = completionOutcome(await completeRef.current({ taskId: entry.taskId }));
        } catch {
          outcome = "retry";
        }
        if (outcome === "retry" && Date.now() - entry.at < WIDGET_PENDING_MAX_AGE_MS) continue;
        settled.add(entry.taskId);
        if (outcome === "done") confirmed.push(entry.taskId);
        else notice = completionNotice(outcome === "retry" ? "expired" : outcome);
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
      if (notice) {
        await writeWidgetNotice({ message: notice, at: Date.now() });
      } else {
        // Opening the app answers an earlier notice, but not one the widget
        // wrote while this drain was running.
        const current = await readWidgetNotice();
        if (current && current.at < startedAt) await writeWidgetNotice(null);
      }
      await refreshHomeWidgets();
    } catch (error) {
      mobileLogger.warn("home_widget_drain_failed", { errorType: classifyError(error) });
    } finally {
      drainingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Live data means the Convex client is authenticated; a cached session
    // alone is not enough.
    if (!supported || !signedIn || !hasLiveData) return;
    void drainPending();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void drainPending();
    });
    return () => subscription.remove();
  }, [drainPending, hasLiveData, signedIn, supported]);
}

/**
 * Delivers widget deep links (cold start and while running). The handler
 * returns false when the app can't act on a link yet (e.g. still showing the
 * cached workspace); the link then waits and is offered again whenever the
 * handler changes. Only the latest link is kept, and only briefly: one that
 * is still waiting after WIDGET_LINK_HOLD_MS is dropped rather than yanking
 * the user somewhere long after the tap.
 */
export function useWidgetDeepLinks(onLink: (target: WidgetLinkTarget) => boolean): void {
  const pendingRef = useRef<{ target: WidgetLinkTarget; at: number } | null>(null);
  const onLinkRef = useRef(onLink);

  const deliver = useCallback((target: WidgetLinkTarget | null) => {
    if (!target) return;
    pendingRef.current = onLinkRef.current(target) ? null : { target, at: Date.now() };
  }, []);

  useEffect(() => {
    onLinkRef.current = onLink;
    const held = pendingRef.current;
    if (!held) return;
    if (Date.now() - held.at > WIDGET_LINK_HOLD_MS || onLink(held.target)) pendingRef.current = null;
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
