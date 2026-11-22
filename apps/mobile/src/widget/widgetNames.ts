/**
 * Widget identifiers. Kept free of library imports so app code can use them
 * without loading react-native-android-widget. Names must match the `widgets`
 * entries in app.config.ts; renaming one orphans already-placed widgets.
 */
export const WIDGET_NAMES = {
  focus: "PravahFocus",
  today: "PravahToday",
  agenda: "PravahAgenda",
  capture: "PravahCapture",
  captureIcon: "PravahCaptureIcon",
} as const;

export type WidgetName = (typeof WIDGET_NAMES)[keyof typeof WIDGET_NAMES];

/** Custom click action for the tick circle; handled headlessly. */
export const COMPLETE_ACTION = "PRAVAH_COMPLETE_TASK";
