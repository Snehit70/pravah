import { NativeModules, Platform, TurboModuleRegistry } from "react-native";
import { WIDGET_NAMES } from "./widgetNames";

/**
 * The only door from app code into react-native-android-widget.
 *
 * The library looks its native module up with `getEnforcing` at import time,
 * so importing it on iOS, web, tests, or an APK built before the widget shipped
 * throws. Everything here checks for the module first and lazy-requires the
 * library only after that, and swallows every error: the widget is a nice
 * extra and must never take the app down.
 */
export function isWidgetSupported(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    return TurboModuleRegistry.get("AndroidWidget") != null || NativeModules.AndroidWidget != null;
  } catch {
    return false;
  }
}

/** Called once from index.ts, before the app registers its root component. */
export function registerHomeWidgets(): void {
  if (!isWidgetSupported()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy, see above
    const { registerWidgetTaskHandler } = require("react-native-android-widget") as typeof import("react-native-android-widget");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { widgetTaskHandler } = require("./widgetTaskHandler") as typeof import("./widgetTaskHandler");
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // Widget stays inert; the app is unaffected.
  }
}

let inFlight: Promise<void> | null = null;
let rerun = false;

async function redrawAll(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy, see above
  const { requestWidgetUpdate } = require("react-native-android-widget") as typeof import("react-native-android-widget");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadWidgetState, renderWidget } = require("./widgetRender") as typeof import("./widgetRender");
  const state = await loadWidgetState();
  const fallback = { ...state, view: { kind: "signedOut" as const } };
  await Promise.all(
    Object.values(WIDGET_NAMES).map((widgetName) =>
      requestWidgetUpdate({
        widgetName,
        renderWidget: (info) => {
          try {
            return renderWidget(info, state);
          } catch {
            return renderWidget(info, fallback);
          }
        },
      }).catch(() => undefined),
    ),
  );
}

/**
 * Redraws every placed Pravah widget from storage. Safe to call often: calls
 * made while a redraw runs collapse into one more redraw after it, so the
 * last write always reaches the home screen.
 */
export function refreshHomeWidgets(): Promise<void> {
  if (!isWidgetSupported()) return Promise.resolve();
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        rerun = false;
        await redrawAll().catch(() => undefined);
      } while (rerun);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
