import type { AccentColor } from "../lib/userPreferences";
import {
  configureThemedValueResolver,
  getThemeRuntimeSnapshot,
  setThemeRuntime,
  type ResolvedAppearance,
} from "./themeRuntime";

/** Design tokens for Pravah mobile.
 *
 * Mobile now leads the redesign direction: warm light-neutral by default,
 * restrained purple as an intelligence accent, and functional colors for
 * trust-building task states.
 */

/**
 * Font family names. These match the postScriptName-style identifiers exposed
 * by @expo-google-fonts/* — they only resolve at runtime once `useFonts` has
 * loaded the matching font asset. Until then RN falls back to the system font,
 * so we gate the UI on font loading in App.tsx to avoid the FOUT.
 *
 * Web uses Geist Variable (sans + mono) for everything. Mobile follows suit:
 * a single sans family handles display, body, and UI; mono is reserved for
 * uppercase metadata, numerics, and log lines.
 *
 * The `serif` slot is preserved as an alias for a sans weight so existing
 * call sites that asked for "editorial display" type keep compiling during
 * the transition. New code should reach for `sansSemibold` directly.
 */
export const fonts = {
  serif: "Geist_500Medium",
  sans: "Geist_400Regular",
  sansSemibold: "Geist_600SemiBold",
  sansBold: "Geist_700Bold",
  mono: "GeistMono_500Medium",
} as const;

const lightColors = {
  // ── Background layers ────────────────────────────────────────────────
  bg: "#f7f1e8",
  bgSurface: "#fbf7ef",
  bgCard: "#fffaf2",
  bgFloating: "#fffdf7",
  bgCardGlass: "rgba(74,54,35,0.035)",
  bgInput: "rgba(74,54,35,0.045)",
  backdrop: "rgba(39,30,22,0.32)",

  // ── Borders ─────────────────────────────────────────────────────────
  border: "rgba(78,62,43,0.18)",
  borderSubtle: "rgba(78,62,43,0.09)",
  borderFocus: "rgba(43,32,22,0.46)",

  // ── Text ────────────────────────────────────────────────────────────
  textPrimary: "#201914",
  textSecondary: "#5b5048",
  textMuted: "#6f6358",
  textDim: "#76695e",
  textInverse: "#fffaf2",
  textCompleted: "#76695e",

  // ── Accent ──────────────────────────────────────────────────────────
  accent: "#6753c7",
  accentHover: "#5844b8",
  accentSoft: "rgba(103,83,199,0.16)",
  accentGlow: "rgba(103,83,199,0.28)",
  accentDim: "rgba(103,83,199,0.07)",

  // ── Priority semantics ──────────────────────────────────────────────
  // One canonical, fixed (accent-independent) muted hue ramp — red → amber →
  // neutral — so P1/P2/P3 are distinguishable at a glance during triage. The
  // previous values (accent purple + two near-identical grays) made P2 and P3
  // indistinguishable and tied P1 to the themeable accent. Intentionally
  // diverges from web here; mobile is the triage-heavy surface.
  priorityP1: "#934536",
  priorityP2: "#805712",
  priorityP3: "#5e6662",

  // ── Status semantics ────────────────────────────────────────────────
  success: "#226b4b",
  successMuted: "rgba(34,107,75,0.13)",
  warning: "#805712",
  warningMuted: "rgba(128,87,18,0.14)",
  deadline: "#98502d",
  deadlineMuted: "rgba(152,80,45,0.16)",
  error: "#a43f32",
  errorMuted: "rgba(164,63,50,0.13)",

  // ── Legacy aliases (kept so untouched call sites keep compiling) ────
  /** @deprecated Use `success`. */
  primary: "#226b4b",
  /** @deprecated Use `bg`. */
  primaryDark: "#f7f1e8",
  /** @deprecated Use `textInverse`. */
  primaryInk: "#fffaf2",
  /** @deprecated Halo replaced by GridBackground; soft accent wash kept for back-compat. */
  haloCopper: "rgba(43,32,22,0.07)",
} as const;

const darkColors: ColorPalette = {
  bg: "#151118",
  bgSurface: "#1c1720",
  bgCard: "#241d28",
  bgFloating: "#2b2230",
  bgCardGlass: "rgba(236,218,240,0.045)",
  bgInput: "rgba(236,218,240,0.075)",
  backdrop: "rgba(8,5,10,0.68)",

  border: "rgba(231,213,235,0.40)",
  borderSubtle: "rgba(231,213,235,0.12)",
  borderFocus: "rgba(231,213,235,0.48)",

  textPrimary: "#f3eaf5",
  textSecondary: "#cbbdce",
  textMuted: "#b3a5b6",
  textDim: "#9d8fa1",
  textInverse: "#18121b",
  textCompleted: "#9d8fa1",

  accent: "#a995ff",
  accentHover: "#bcaeff",
  accentSoft: "rgba(169,149,255,0.22)",
  accentGlow: "rgba(169,149,255,0.34)",
  accentDim: "rgba(169,149,255,0.12)",

  priorityP1: "#f09588",
  priorityP2: "#e4b66a",
  priorityP3: "#9db1aa",

  success: "#69cfa0",
  successMuted: "rgba(105,207,160,0.17)",
  warning: "#e4b66a",
  warningMuted: "rgba(228,182,106,0.17)",
  deadline: "#ee9a78",
  deadlineMuted: "rgba(238,154,120,0.18)",
  error: "#f28b83",
  errorMuted: "rgba(242,139,131,0.17)",

  primary: "#69cfa0",
  primaryDark: "#151118",
  primaryInk: "#18121b",
  haloCopper: "rgba(169,149,255,0.12)",
};

export type ColorPalette = { [K in keyof typeof lightColors]: string };
const accentPalettes: Record<ResolvedAppearance, Record<AccentColor, {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentGlow: string;
  accentDim: string;
}>> = {
  light: {
    purple: {
      accent: "#6753c7",
      accentHover: "#5844b8",
      accentSoft: "rgba(103,83,199,0.16)",
      accentGlow: "rgba(103,83,199,0.28)",
      accentDim: "rgba(103,83,199,0.07)",
    },
    copper: {
      accent: "#9a552f",
      accentHover: "#814522",
      accentSoft: "rgba(154,85,47,0.16)",
      accentGlow: "rgba(154,85,47,0.27)",
      accentDim: "rgba(154,85,47,0.07)",
    },
    teal: {
      accent: "#28716e",
      accentHover: "#205e5c",
      accentSoft: "rgba(40,113,110,0.16)",
      accentGlow: "rgba(40,113,110,0.27)",
      accentDim: "rgba(40,113,110,0.07)",
    },
    rose: {
      accent: "#98516a",
      accentHover: "#814258",
      accentSoft: "rgba(152,81,106,0.16)",
      accentGlow: "rgba(152,81,106,0.27)",
      accentDim: "rgba(152,81,106,0.07)",
    },
  },
  dark: {
    purple: {
      accent: "#a995ff",
      accentHover: "#bcaeff",
      accentSoft: "rgba(169,149,255,0.22)",
      accentGlow: "rgba(169,149,255,0.34)",
      accentDim: "rgba(169,149,255,0.12)",
    },
    copper: {
      accent: "#e5a078",
      accentHover: "#f0b18c",
      accentSoft: "rgba(229,160,120,0.21)",
      accentGlow: "rgba(229,160,120,0.32)",
      accentDim: "rgba(229,160,120,0.11)",
    },
    teal: {
      accent: "#72c9c4",
      accentHover: "#8bd8d3",
      accentSoft: "rgba(114,201,196,0.20)",
      accentGlow: "rgba(114,201,196,0.31)",
      accentDim: "rgba(114,201,196,0.11)",
    },
    rose: {
      accent: "#e69ab3",
      accentHover: "#f0adc3",
      accentSoft: "rgba(230,154,179,0.21)",
      accentGlow: "rgba(230,154,179,0.32)",
      accentDim: "rgba(230,154,179,0.11)",
    },
  },
};

export function accentColorFor(
  appearance: ResolvedAppearance,
  accent: AccentColor,
): string {
  return accentPalettes[appearance][accent].accent;
}

function activeColors(): ColorPalette {
  const { appearance, accent } = getThemeRuntimeSnapshot();
  const base = appearance === "dark" ? darkColors : lightColors;
  return { ...base, ...accentPalettes[appearance][accent] };
}

export function getResolvedAppearance(): ResolvedAppearance {
  return getThemeRuntimeSnapshot().appearance;
}

export { setThemeRuntime };

/** Reads resolve at render time so inline SVG and component props follow live theme changes. */
export const colors = new Proxy(lightColors as ColorPalette, {
  get(_target, property: keyof ColorPalette) {
    return activeColors()[property];
  },
});

function themedValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value === "#2c2118") {
    return getResolvedAppearance() === "dark" ? "#08050a" : value;
  }
  const palette = activeColors();
  const lightPalette = {
    ...lightColors,
    ...accentPalettes.light.purple,
  };
  const key = (Object.keys(lightPalette) as Array<keyof ColorPalette>).find(
    (candidate) => lightPalette[candidate] === value,
  );
  return key ? palette[key] : value;
}

configureThemedValueResolver(themedValue);

/**
 * Web's --radius-* scale. Chunky pills are out except for FAB and circular
 * avatars (full).
 */
export const radii = {
  /** --radius-sm */
  sm: 4,
  /** --radius-md */
  md: 6,
  /** --radius-lg */
  lg: 10,
  /** --radius-xl */
  xl: 16,
  full: 9999,
} as const;

/**
 * Web's --space-* scale, plus mobile-only row aliases. Step sizes match web
 * exactly so layouts read at parity density.
 */
export const spacing = {
  /** --space-1 */
  xs: 4,
  /** --space-2 */
  sm: 8,
  /** --space-3 */
  md: 12,
  /** --space-4 */
  lg: 16,
  /** --space-5 */
  xl: 20,
  /** --space-6 */
  xxl: 24,
  /** --space-8 — vertical gap between major sections */
  section: 32,
  /** Vertical padding for a single task row */
  rowY: 12,
} as const;

/**
 * Layered shadows. RN doesn't render box-shadow — values below pick the
 * dominant offset/blur from each web shadow token and translate into RN's
 * shadow* props plus elevation for Android.
 *
 * Use `shadow.glow` on the primary button to get the accent halo seen on
 * web's primary action.
 */
export const shadow = {
  sm: {
    shadowColor: "#2c2118",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: "#2c2118",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  lg: {
    shadowColor: "#2c2118",
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  xl: {
    shadowColor: "#2c2118",
    shadowOpacity: 0.2,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 40 },
    elevation: 16,
  },
  glow: {
    shadowColor: "#2c2118",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/**
 * Typography scale.
 *
 * Web's body is 13px — too small for thumb-distance reading. Mobile bumps
 * each role up one step while keeping the hierarchy intact. The mono
 * uppercase roles are unchanged because they're already at minimum
 * legible size on web.
 */
export const typography = {
  /** Geist 600, view title scale ("Inbox", "Timeline"). */
  display: {
    fontFamily: fonts.sansSemibold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  /** Geist 600, modal titles + empty-state headlines. */
  headline: {
    fontFamily: fonts.sansSemibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  /** Geist 600, task title and primary UI heading. */
  title: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  /** Geist 400, body copy. */
  bodyLg: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  /** Geist 400, secondary body / one-liner descriptions. */
  bodyMd: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  /** GeistMono 500, uppercase metadata: "TODAY", "DUE 04-30", "P1". */
  micro: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },
  /** GeistMono 500, numeric metadata that does not want uppercase. */
  numeric: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 14,
  },
} as const;

/**
 * Chart tokens for the Progress screen.
 *
 * Colors are not eyeballed. Text in charts always wears the ink text tokens
 * above — a mark's color carries identity, never the number beside it.
 *
 * ── Gradient stops ──────────────────────────────────────────────────────
 * Area fills are expressed as a solid `*AreaColor` plus a numeric
 * `*AreaTopOpacity` / `*AreaBottomOpacity`, NOT as `rgba()` strings.
 * react-native-svg reads a gradient stop's alpha from `stopOpacity`; an alpha
 * baked into an `rgba()` passed to `stopColor` is dropped, so the fill renders
 * fully opaque and the chart turns into a solid black blob. `FlowingWaves` and
 * `GridBackground` already use the split form — these tokens make it the rule.
 *
 * ── Heatmap ramp ────────────────────────────────────────────────────────
 * A validated single-hue ordinal scale in copper (hue 52°, chroma held at
 * 0.115, contrast 2.07 / 3.11 / 4.62 / 6.63 on `bg`).
 *
 * Two earlier ramps failed here, and both failures are measurable:
 *
 *  - tan→brown→black: bucket 1 missed the 2:1 floor at 1.79:1, and bucket 4 sat
 *    1.48:1 from `textPrimary` — the darkest cell *was* the ink used for text.
 *  - `success` green: passed every check, but imports a hue the warm palette
 *    doesn't own.
 *
 * The trap is that every warm hue here is already reserved (`warning`,
 * `deadline`, `error`, `priorityP1`) and the accent is ink, which leaves only
 * neutral tan — and neutral tan at full intensity IS text ink. Copper escapes by
 * holding chroma instead of darkening: mud is what a warm hue becomes when you
 * take its chroma away, so keep C ≥ 0.10 on every bucket. The darkest step stays
 * 2.36:1 off `textPrimary`, and copper's nearest reserved neighbour
 * (`priorityP1`, ΔE 4.6) never renders on the Progress tab. `warning` and
 * `error` do — they live in Goals below the grid — so a ramp must stay off those
 * two; that is what ruled out amber (ΔE 3.7 from `warning`).
 *
 * The empty cell stays warm, which is what keeps the grid tied to the page.
 */
type ChartPalette = {
  heatmapEmpty: string;
  heatmapRamp: readonly [string, string, string, string];
  line: string;
  areaColor: string;
  areaTopOpacity: number;
  areaBottomOpacity: number;
  heroAreaColor: string;
  heroAreaTopOpacity: number;
  heroAreaBottomOpacity: number;
  bar: string;
  grid: string;
  cursor: string;
};

const lightChart: ChartPalette = {
  /** Empty/no-completion heatmap cell — faint warm track, distinct from bucket 1. */
  heatmapEmpty: "rgba(78,62,43,0.07)",
  /** 4-bucket copper intensity ramp, light → dark. Monotone ordinal ramp. */
  heatmapRamp: ["#e69867", "#c27746", "#a35a28", "#844417"] as const,
  /** Hero line + rhythm bars — the single-series mark. */
  line: lightColors.accent,
  /** Sparkline area fill; the line carries the contrast. */
  areaColor: lightColors.accent,
  areaTopOpacity: 0.12,
  areaBottomOpacity: 0,
  /**
   * Hero area fill — a pale wash under a crisp line, not a filled silhouette.
   * The line is the mark; the fill only gives the trend a body to sit in.
   */
  heroAreaColor: lightColors.accent,
  heroAreaTopOpacity: 0.16,
  heroAreaBottomOpacity: 0,
  /**
   * Rhythm bars — one mark, one colour. Every bar wears this, including the
   * peak: bar height already says which day won, so tinting the peak spends the
   * colour channel re-encoding what length shows. The peak is called out with a
   * direct count label instead. (The previous `opacity: 0.5` on the non-peak
   * bars composited ink over cream into a dead grey — an alpha channel making a
   * colour decision, the same mistake as an rgba() gradient stop.)
   */
  bar: lightColors.accent,
  /** Recessive gridlines / baselines. */
  grid: lightColors.borderSubtle,
  /** Scrub crosshair + focus dot. */
  cursor: lightColors.accent,
};

const darkChart: ChartPalette = {
  ...lightChart,
  heatmapEmpty: "rgba(231,213,235,0.09)",
  heatmapRamp: ["#6f4a65", "#955b79", "#bf718e", "#e68ba5"],
  line: darkColors.accent,
  areaColor: darkColors.accent,
  heroAreaColor: darkColors.accent,
  bar: darkColors.accent,
  grid: darkColors.borderSubtle,
  cursor: darkColors.accent,
};

export const chart = new Proxy(lightChart, {
  get(_target, property: keyof typeof lightChart) {
    const palette = getResolvedAppearance() === "dark" ? darkChart : lightChart;
    if (
      property === "line"
      || property === "areaColor"
      || property === "heroAreaColor"
      || property === "bar"
      || property === "cursor"
    ) {
      return colors.accent;
    }
    return palette[property];
  },
});

/**
 * Motion tokens. Mirror web's src/lib/motion.ts so animation feel is shared.
 */
export const motion = {
  duration: {
    instant: 120,
    fast: 200,
    base: 280,
    slow: 360,
    deliberate: 520,
  },
  easing: {
    /** cubic-bezier(0.16, 1, 0.3, 1) — web's --ease-out-expo */
    outExpo: [0.16, 1, 0.3, 1] as const,
    /** cubic-bezier(0.22, 1, 0.36, 1) — web's --ease-out-quart */
    outQuart: [0.22, 1, 0.36, 1] as const,
    /** cubic-bezier(0.83, 0, 0.17, 1) — web's --ease-in-out-quart */
    inOutQuart: [0.83, 0, 0.17, 1] as const,
  },
} as const;
