"use no memo";
import type { WidgetTaskHandler, WidgetTaskHandlerProps } from "react-native-android-widget";
import { WIDGET_PENDING_MAX_AGE_MS, completionNotice, headerDateLabel, markSnapshotTaskDone } from "./widgetModel";
import { COMPLETE_ACTION } from "./widgetNames";
import { completeTaskRemotely } from "./widgetRemote";
import { loadWidgetState, renderWidget } from "./widgetRender";
import {
  readPendingCompletions,
  readWidgetSnapshot,
  updatePendingCompletions,
  writeWidgetNotice,
  writeWidgetSnapshot,
} from "./widgetStorage";

async function draw(props: WidgetTaskHandlerProps) {
  props.renderWidget(renderWidget(props.widgetInfo, await loadWidgetState()));
}

/**
 * Sends one tick and settles it in storage. Returns false while it should
 * stay pending; a tick that has failed for longer than
 * WIDGET_PENDING_MAX_AGE_MS is dropped with a notice instead.
 */
async function settleRemote(taskId: string, queuedAt: number): Promise<boolean> {
  const outcome = await completeTaskRemotely(taskId);
  if (outcome === "retry" && Date.now() - queuedAt < WIDGET_PENDING_MAX_AGE_MS) return false;
  if (outcome === "done") {
    const snapshot = await readWidgetSnapshot();
    if (snapshot) await writeWidgetSnapshot(markSnapshotTaskDone(snapshot, taskId, Date.now()));
  } else {
    await writeWidgetNotice({
      message: completionNotice(outcome === "retry" ? "expired" : outcome),
      at: Date.now(),
    });
  }
  await updatePendingCompletions((current) => current.filter((entry) => entry.taskId !== taskId));
  return true;
}

/**
 * Tick from the widget: show it done straight away ("Saving…"), then try the
 * server. Offline keeps it pending for the app (or the next periodic update)
 * to retry; a server rejection drops it and shows a notice so the row comes
 * back honestly.
 */
async function completeFromWidget(props: WidgetTaskHandlerProps) {
  const taskId = props.clickActionData?.taskId;
  const title = props.clickActionData?.title;
  if (typeof taskId !== "string" || !taskId) return draw(props);

  let queuedAt = Date.now();
  await updatePendingCompletions((current) => {
    const existing = current.find((entry) => entry.taskId === taskId);
    if (existing) {
      queuedAt = existing.at;
      return current;
    }
    return [...current, { taskId, title: typeof title === "string" ? title : "", at: queuedAt }];
  });
  await draw(props);
  if (await settleRemote(taskId, queuedAt)) await draw(props);
}

/**
 * Headless tasks get 30s. A retry is two calls of up to 8s each, so only
 * start one while enough of this budget is left, keeping room for a redraw.
 */
const RETRY_BUDGET_MS = 20_000;
const RETRY_COST_MS = 16_000;

/** Periodic update: retry ticks still waiting, oldest first, within budget. */
async function retryPending(props: WidgetTaskHandlerProps) {
  const pending = await readPendingCompletions();
  if (pending.length === 0) return;
  const started = Date.now();
  let changed = false;
  for (const entry of pending) {
    if (Date.now() - started + RETRY_COST_MS > RETRY_BUDGET_MS) break;
    if (await settleRemote(entry.taskId, entry.at)) changed = true;
    else break; // Still offline; don't spend the budget on the rest.
  }
  if (changed) await draw(props);
}

export const widgetTaskHandler: WidgetTaskHandler = async (props) => {
  try {
    switch (props.widgetAction) {
      case "WIDGET_UPDATE":
        await draw(props);
        await retryPending(props);
        return;
      case "WIDGET_ADDED":
      case "WIDGET_RESIZED":
        await draw(props);
        return;
      case "WIDGET_CLICK":
        if (props.clickAction === COMPLETE_ACTION) await completeFromWidget(props);
        else await draw(props);
        return;
      case "WIDGET_DELETED":
      default:
        return;
    }
  } catch {
    // A widget must never crash the headless task. Fall back to the plain
    // loading render so a bad snapshot cannot leave the widget blank, and
    // without telling a signed-in user they are signed out.
    try {
      props.renderWidget(
        renderWidget(props.widgetInfo, {
          view: { kind: "loading", dateLabel: headerDateLabel(new Date()) },
          accent: "purple",
          theme: "system",
        }),
      );
    } catch {
      // Nothing left to draw with.
    }
  }
};
