"use no memo";
import type { WidgetTaskHandler, WidgetTaskHandlerProps } from "react-native-android-widget";
import { markSnapshotTaskDone } from "./widgetModel";
import { COMPLETE_ACTION } from "./widgetNames";
import { completeTaskRemotely } from "./widgetRemote";
import { loadWidgetState, renderWidget } from "./widgetRender";
import {
  readWidgetSnapshot,
  updatePendingCompletions,
  writeWidgetNotice,
  writeWidgetSnapshot,
} from "./widgetStorage";

async function draw(props: WidgetTaskHandlerProps) {
  props.renderWidget(renderWidget(props.widgetInfo, await loadWidgetState()));
}

/**
 * Tick from the widget: show it done straight away ("Saving…"), then try the
 * server. Offline keeps it pending for the app to drain on next open; a server
 * rejection drops it and shows a notice so the row comes back honestly.
 */
async function completeFromWidget(props: WidgetTaskHandlerProps) {
  const taskId = props.clickActionData?.taskId;
  const title = props.clickActionData?.title;
  if (typeof taskId !== "string" || !taskId) return draw(props);

  await updatePendingCompletions((current) =>
    current.some((entry) => entry.taskId === taskId)
      ? current
      : [...current, { taskId, title: typeof title === "string" ? title : "", at: Date.now() }],
  );
  await draw(props);

  const result = await completeTaskRemotely(taskId);
  if (result.kind === "retry") return;

  if (result.kind === "done") {
    const snapshot = await readWidgetSnapshot();
    if (snapshot) await writeWidgetSnapshot(markSnapshotTaskDone(snapshot, taskId, Date.now()));
  } else {
    await writeWidgetNotice({
      message: result.reason === "auth" ? "Sign in again to sync" : "Couldn't complete · tap to open",
      at: Date.now(),
    });
  }
  await updatePendingCompletions((current) => current.filter((entry) => entry.taskId !== taskId));
  await draw(props);
}

export const widgetTaskHandler: WidgetTaskHandler = async (props) => {
  try {
    switch (props.widgetAction) {
      case "WIDGET_ADDED":
      case "WIDGET_UPDATE":
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
    // A widget must never crash the headless task. Fall back to a plain
    // render so a bad snapshot cannot leave the widget blank.
    try {
      props.renderWidget(
        renderWidget(props.widgetInfo, { view: { kind: "signedOut" }, accent: "purple", theme: "system" }),
      );
    } catch {
      // Nothing left to draw with.
    }
  }
};
