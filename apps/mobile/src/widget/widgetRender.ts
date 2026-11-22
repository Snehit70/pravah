"use no memo";
import { createElement, type ReactElement } from "react";
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
type WidgetElement = { type: unknown; props: Record<string, unknown>; key?: string | null };
type WidgetComponent = ((props: unknown) => WidgetElement | null) & { __name__?: string };

/**
 * Resolves every plain component down to the library's primitives, keeping
 * the child structure its tree builder expects. The builder runs later, out
 * of our hands; expanding here makes a bad tree (null return, fragment,
 * thrown error) throw inside renderWidget, where callers can fall back.
 */
export function expandWidgetElement(element: unknown): ReactElement {
  let current = element as WidgetElement | null;
  while (current && typeof current.type === "function" && !(current.type as WidgetComponent).__name__) {
    current = (current.type as WidgetComponent)(current.props);
  }
  if (!current || typeof current.type !== "function") throw new Error("Unsupported widget node");
  const { children, ...props } = current.props;
  if (children === undefined || children === null) return current as unknown as ReactElement;
  const list = Array.isArray(children) ? children : [children];
  if (list.filter(Boolean).flat(1).some((child) => !child)) throw new Error("Unsupported widget child");
  const expandChild = (child: unknown): unknown =>
    Array.isArray(child) ? child.map(expandChild) : child ? expandWidgetElement(child) : child;
  return createElement(
    current.type as WidgetComponent,
    { ...props, key: current.key ?? undefined },
    ...(list.map(expandChild) as ReactElement[]),
  );
}

export function renderWidget(info: Pick<WidgetInfo, "widgetName" | "width" | "height">, state: WidgetState): WidgetRepresentation {
  const size = { width: info.width, height: info.height };
  const lightAppearance = state.theme === "dark" ? "dark" : "light";
  const darkAppearance = state.theme === "light" ? "light" : "dark";
  return {
    light: expandWidgetElement(
      renderWidgetByName(info.widgetName, {
        view: state.view,
        palette: widgetPalette(lightAppearance, state.accent),
        size,
      }),
    ),
    dark: expandWidgetElement(
      renderWidgetByName(info.widgetName, {
        view: state.view,
        palette: widgetPalette(darkAppearance, state.accent),
        size,
      }),
    ),
  };
}
