import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import type { AccentColor } from "../lib/userPreferences";

export type ResolvedAppearance = "light" | "dark";

let appearance: ResolvedAppearance = "light";
let accent: AccentColor = "purple";
let resolveValue: (value: unknown) => unknown = (value) => value;

export function setThemeRuntime(
  nextAppearance: ResolvedAppearance,
  nextAccent: AccentColor,
): void {
  appearance = nextAppearance;
  accent = nextAccent;
}

export function getThemeRuntimeSnapshot(): {
  appearance: ResolvedAppearance;
  accent: AccentColor;
} {
  return { appearance, accent };
}

export function configureThemedValueResolver(
  resolver: (value: unknown) => unknown,
): void {
  resolveValue = resolver;
}

type NamedStyle = ViewStyle | TextStyle | ImageStyle;

export function createThemedStyles<T extends Record<string, NamedStyle>>(styles: T): T {
  const registered = styles;
  const cache = new Map<string, {
    appearance: ResolvedAppearance;
    accent: AccentColor;
    value: NamedStyle;
  }>();

  return new Proxy(registered, {
    get(target, property: string) {
      const style = target[property];
      if (!style || typeof style !== "object") return style;
      const previous = cache.get(property);
      if (
        previous?.appearance === appearance
        && previous.accent === accent
      ) {
        return previous.value;
      }
      const value = Object.fromEntries(
        Object.entries(style).map(([key, entry]) => [key, resolveValue(entry)]),
      ) as NamedStyle;
      cache.set(property, { appearance, accent, value });
      return value;
    },
  });
}
