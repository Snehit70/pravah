import type { AccentColor } from "../lib/userPreferences";

/**
 * Widget palette. Mirrors `src/theme/tokens.ts`, but as plain hex because
 * RemoteViews only take `#RRGGBB` / `#RRGGBBAA` strings (no rgba(), no Proxy).
 */
export type WidgetPalette = {
  bg: `#${string}`;
  row: `#${string}`;
  text: `#${string}`;
  textSecondary: `#${string}`;
  textMuted: `#${string}`;
  accent: `#${string}`;
  accentSoft: `#${string}`;
  onAccent: `#${string}`;
  p1: `#${string}`;
  p2: `#${string}`;
  p3: `#${string}`;
  success: `#${string}`;
  successSoft: `#${string}`;
  error: `#${string}`;
  errorSoft: `#${string}`;
  warning: `#${string}`;
};

const light: Omit<WidgetPalette, "accent" | "accentSoft"> = {
  bg: "#fbf7ef",
  row: "#fffaf2",
  text: "#201914",
  textSecondary: "#5b5048",
  textMuted: "#6f6358",
  onAccent: "#fffaf2",
  p1: "#934536",
  p2: "#805712",
  p3: "#8b7e70",
  success: "#226b4b",
  successSoft: "#226b4b1f",
  error: "#a43f32",
  errorSoft: "#a43f321c",
  warning: "#805712",
};

const dark: Omit<WidgetPalette, "accent" | "accentSoft"> = {
  bg: "#1b1b19",
  row: "#262623",
  text: "#f2f0eb",
  textSecondary: "#b8b6b0",
  textMuted: "#97958f",
  onAccent: "#131311",
  p1: "#f09588",
  p2: "#e4b66a",
  p3: "#797973",
  success: "#69cfa0",
  successSoft: "#69cfa026",
  error: "#f28b83",
  errorSoft: "#f28b8326",
  warning: "#e4b66a",
};

const accents: Record<"light" | "dark", Record<AccentColor, { accent: `#${string}`; accentSoft: `#${string}` }>> = {
  light: {
    purple: { accent: "#6753c7", accentSoft: "#6753c724" },
    copper: { accent: "#9a552f", accentSoft: "#9a552f26" },
    teal: { accent: "#28716e", accentSoft: "#28716e26" },
    rose: { accent: "#98516a", accentSoft: "#98516a26" },
  },
  dark: {
    purple: { accent: "#b8b2d9", accentSoft: "#b8b2d926" },
    copper: { accent: "#d0b094", accentSoft: "#d0b09426" },
    teal: { accent: "#9fc6bf", accentSoft: "#9fc6bf24" },
    rose: { accent: "#d0adb9", accentSoft: "#d0adb926" },
  },
};

export function widgetPalette(appearance: "light" | "dark", accent: AccentColor): WidgetPalette {
  return { ...(appearance === "dark" ? dark : light), ...accents[appearance][accent] };
}

/** Font family names match the .ttf files the config plugin copies to assets/fonts. */
export const widgetFonts = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  mono: "GeistMono_500Medium",
} as const;
