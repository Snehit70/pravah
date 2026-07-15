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

export const colors = {
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

  // ── Accent (warm ink — monochrome; reads as bold on every warm surface) ──
  accent: "#2b2016",
  accentHover: "#1c140d",
  accentSoft: "rgba(43,32,22,0.16)",
  accentGlow: "rgba(43,32,22,0.28)",
  accentDim: "rgba(43,32,22,0.07)",

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
 * A validated single-hue ordinal scale in the app's own `success` green
 * (hue 141°→151°, monotone lightness 0.41 → 0.27 → 0.16 → 0.08, each step gap
 * ≥ 1.4×). The lightest bucket clears 2:1 on the warm `bg`; the darkest clears
 * 7:1. Green rather than the old tan→brown→black ramp: that one ran the
 * intensity scale straight into the ink used for text and read as dirt. The
 * empty cell stays warm, which is what keeps the grid tied to the page.
 */
export const chart = {
  /** Empty/no-completion heatmap cell — faint warm track, distinct from bucket 1. */
  heatmapEmpty: "rgba(78,62,43,0.07)",
  /** 4-bucket green intensity ramp, light → dark. Monotone ordinal ramp. */
  heatmapRamp: ["#82b795", "#559c74", "#2f7f56", "#1a5c3c"] as const,
  /** Hero line + rhythm bars — the single-series mark. */
  line: colors.accent,
  /** Sparkline area fill; the line carries the contrast. */
  areaColor: colors.accent,
  areaTopOpacity: 0.12,
  areaBottomOpacity: 0,
  /**
   * Hero area fill — a pale wash under a crisp line, not a filled silhouette.
   * The line is the mark; the fill only gives the trend a body to sit in.
   */
  heroAreaColor: colors.accent,
  heroAreaTopOpacity: 0.16,
  heroAreaBottomOpacity: 0,
  /** Rhythm bars: active vs. the empty-bucket track. */
  bar: colors.accent,
  barTrack: "rgba(43,32,22,0.12)",
  /** Recessive gridlines / baselines. */
  grid: colors.borderSubtle,
  /** Scrub crosshair + focus dot. */
  cursor: colors.accent,
} as const;

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
