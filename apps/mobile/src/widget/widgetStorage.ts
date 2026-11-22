import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parseNotice,
  parsePendingCompletions,
  parseWidgetSnapshot,
  type WidgetNotice,
  type WidgetPendingCompletion,
  type WidgetSnapshot,
} from "./widgetModel";

/**
 * Storage shared by the app and the widget's headless task. Both run in the
 * same app process family and read the same AsyncStorage database.
 *
 * Kept apart from the app's retry queue on purpose: the running app owns that
 * key in memory and would overwrite anything the widget wrote to it.
 */
export const WIDGET_SNAPSHOT_KEY = "pravah_widget_snapshot_v1";
export const WIDGET_PENDING_KEY = "pravah_widget_pending_v1";
export const WIDGET_NOTICE_KEY = "pravah_widget_notice_v1";

export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  return parseWidgetSnapshot(await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY));
}

export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function readPendingCompletions(): Promise<WidgetPendingCompletion[]> {
  return parsePendingCompletions(await AsyncStorage.getItem(WIDGET_PENDING_KEY));
}

// The app and the headless task can both edit the pending list. They share
// one JS runtime: the library's HeadlessJsTaskWorker starts widget tasks in
// the app's current ReactContext when one exists, and only boots a new one
// when the app isn't running (so no foreground drain can race it). This chain
// therefore serializes every read-modify-write of the list.
let pendingChain: Promise<unknown> = Promise.resolve();

export function updatePendingCompletions(
  update: (current: WidgetPendingCompletion[]) => WidgetPendingCompletion[],
): Promise<WidgetPendingCompletion[]> {
  const run = pendingChain.then(async () => {
    const next = update(await readPendingCompletions());
    if (next.length === 0) await AsyncStorage.removeItem(WIDGET_PENDING_KEY);
    else await AsyncStorage.setItem(WIDGET_PENDING_KEY, JSON.stringify(next));
    return next;
  });
  pendingChain = run.catch(() => undefined);
  return run;
}

export async function readWidgetNotice(): Promise<WidgetNotice | null> {
  return parseNotice(await AsyncStorage.getItem(WIDGET_NOTICE_KEY));
}

export async function writeWidgetNotice(notice: WidgetNotice | null): Promise<void> {
  if (notice) await AsyncStorage.setItem(WIDGET_NOTICE_KEY, JSON.stringify(notice));
  else await AsyncStorage.removeItem(WIDGET_NOTICE_KEY);
}

/** Sign-out / wipe: nothing from the old account may stay on the home screen. */
export async function clearWidgetStorage(): Promise<void> {
  await AsyncStorage.multiRemove([WIDGET_SNAPSHOT_KEY, WIDGET_PENDING_KEY, WIDGET_NOTICE_KEY]);
}
