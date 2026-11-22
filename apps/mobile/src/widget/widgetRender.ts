"use no memo";
import type { WidgetInfo, WidgetRepresentation } from "react-native-android-widget";
import { buildWidgetView, type WidgetView } from "./widgetModel";
import { renderWidgetByName } from "./PravahWidgets";
import { hasWidgetSession } from "./widgetRemote";
import { readPendingCompletions, readWidgetNotice, readWidgetSnapshot } from "./widgetStorage";
import { widgetPalette } from "./widgetTheme";
import type { AccentColor, ThemePreference } from "../lib/userPreferences";

type WidgetState = {
  view: WidgetView;
  accent: AccentColor;
  theme: ThemePreference;
};

/** Reads everything a widget needs from storage. Never throws. */
export async function loadWidgetState(now = new Date()): Promise<WidgetState> {
  try {
    const [signedIn, snapshot, pending, notice] = await Promise.all([
      hasWidgetSession(),
      readWidgetSnapshot(),
      readPendingCompletions(),
      readWidgetNotice(),
    ]);
    return {
      view: buildWidgetView({ snapshot, signedIn, pending, notice, now }),
      accent: snapshot?.accent ?? "purple",
      theme: snapshot?.theme ?? "system",
    };
  } catch {
    return { view: { kind: "signedOut" }, accent: "purple", theme: "system" };
  }
}

/**
 * Builds the light and dark trees. Android picks one from the system night
 * mode; a forced app theme renders the same palette into both.
 */
export function renderWidget(info: Pick<WidgetInfo, "widgetName" | "width" | "height">, state: WidgetState): WidgetRepresentation {
  const size = { width: info.width, height: info.height };
  const lightAppearance = state.theme === "dark" ? "dark" : "light";
  const darkAppearance = state.theme === "light" ? "light" : "dark";
  return {
    light: renderWidgetByName(info.widgetName, {
      view: state.view,
      palette: widgetPalette(lightAppearance, state.accent),
      size,
    }),
    dark: renderWidgetByName(info.widgetName, {
      view: state.view,
      palette: widgetPalette(darkAppearance, state.accent),
      size,
    }),
  };
}
