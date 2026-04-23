/** Design tokens for Pravah Mobile */

/**
 * Font family names. These match the postScriptName-style identifiers exposed
 * by @expo-google-fonts/* — they only resolve at runtime once `useFonts` has
 * loaded the matching font asset. Until then RN falls back to the system font,
 * so we gate the UI on font loading in App.tsx to avoid the FOUT.
 */
export const fonts = {
  // Editorial serif — wordmark, view titles, empty-state headlines
  serif: "Fraunces_300Light",
  serifMedium: "Fraunces_500Medium",

  // Humanist sans — body, UI labels, task titles
  sans: "Manrope_500Medium",
  sansSemibold: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",

  // Mono — counts, dates, uppercase metadata, code-like accents
  mono: "JetBrainsMono_500Medium",
} as const;

/**
 * Warm graphite palette. The thesis is "a calm list, not a dashboard": a single
 * copper accent does all the urgency work, green is demoted to "completed only",
 * and every neutral is warm (yellowed) rather than blue. Hex values intentionally
 * avoid #000 / #fff so the surface always reads as printed paper, never as a
 * raw OLED black.
 *
 * Legacy keys (chipBorder, ghostBg, glowCyan, etc.) are kept as transitional
 * aliases that point at the new palette so step-2 doesn't break components I
 * haven't rewritten yet. They get deleted in step 13.
 */
export const colors = {
  // Backgrounds — warm near-black to warm near-newsprint
  bg: "#0f0e0d", // ink — global app background, never #000
  bgCard: "#171513", // only when enclosure is justified (modal sheet, input)
  bgInput: "#1a1816", // text input fill
  bgElevated: "#171513", // alias of bgCard for transitional code paths

  // Borders — warm grey, not blue
  border: "#2a2622",
  borderSubtle: "#211f1c", // hairline dividers; almost invisible

  // Text — warm off-white through warm mid-grey
  textPrimary: "#ece6db", // newsprint white
  textSecondary: "#b0a89a", // warm ash
  textTertiary: "#9c9486", // alias close to secondary for transitional code
  textMuted: "#6c6559",
  textCompleted: "#817a6e", // reads "checked off", not "disabled"

  // Brand / accent — single copper, used for urgency and the active underline
  accent: "#c77b3a",
  accentSoft: "#c77b3a26", // ~15% — sparse halo / hover wash (8-digit hex incl. alpha)
  accentDim: "#c77b3a14", // ~8%  — softer wash; legacy alias kept for transitional use

  // Priority semantics — derived from the accent + neutrals
  priorityP1: "#c77b3a", // urgent = accent
  priorityP2: "#b0a89a", // normal = warm ash
  priorityP3: "#6c6559", // low   = warm mid-grey

  // Completion green — mossy, lived-in, never fire-engine
  primary: "#6c9c7a",
  primaryDark: "#0e1f15",
  primaryInk: "#0e1f15", // text/ink rendered on top of primary
  primaryBg: "#1f2a22", // muted backdrop for completed-state surfaces
  primaryBgHover: "#243027",
  primaryText: "#cfe2d4",

  // Destructive / error — rust, not fire-engine
  error: "#c76a52",
  errorBg: "#2a1612",
  errorBorder: "#5b261c",

  // Info — used for the toast info tone; warm rather than blue
  infoBg: "#1d1916",
  infoBorder: "#2a2622",
  infoText: "#ece6db",

  // Interactive transitional aliases — point at the new neutrals so any
  // remaining "chip"-style component doesn't visually break before step 10.
  tabActive: "#c77b3a", // active tab marker is the copper accent
  chipActive: "#1f1c19",
  chipActiveBorder: "#2a2622",
  chipBorder: "#211f1c",
  ghostBg: "#1a1816",
  ghostText: "#b0a89a",

  // Glow — single warm halo (replaces the two saturated blur circles)
  glowCyan: "#c77b3a14", // legacy alias → soft copper wash
  glowGreen: "#c77b3a14", // legacy alias → soft copper wash
  haloCopper: "#c77b3a26", // canonical halo color used by the new background

  // Overlay — modal scrim, slightly warm
  backdrop: "#0a0908d9",
} as const;

/**
 * Smaller radii. The redesign reads as printed/editorial; rounded chunky cards
 * are out. The pill FAB uses `full` directly.
 */
export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  /** Vertical gap between major sections (header → list, settings sections). */
  section: 32,
  /** Vertical padding for a single task row. */
  rowY: 14,
} as const;

/**
 * Typography scale. Each entry is a complete RN text style — `fontFamily` is
 * required (not `fontWeight`) because Google fonts only render the weight
 * variant that's actually loaded under that family name.
 *
 * The legacy keys (`kicker`, `h1`–`h3`, `body`, `bodySmall`, `caption`,
 * `label`) are kept so existing components keep compiling. The new editorial
 * roles (`display`, `headline`, `title`, `bodyLg`, `bodyMd`, `micro`,
 * `numeric`) drive the rebuilt header / rows / sheets in steps 4–12.
 */
export const typography = {
  // ── New editorial scale ───────────────────────────────────────────────
  /** Fraunces 300, view-title scale. Used for "Inbox", "Timeline", etc. */
  display: {
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
  },
  /** Fraunces 300, empty-state and modal-title scale. */
  headline: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  /** Manrope 600, task title and primary UI heading. */
  title: {
    fontFamily: fonts.sansSemibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  /** Manrope 500, body copy. */
  bodyLg: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  /** Manrope 500, secondary body / one-liner descriptions. */
  bodyMd: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  /** JetBrains Mono 500, uppercase metadata: "TODAY", "DUE 04-30", "P1". */
  micro: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },
  /** JetBrains Mono 500, numeric metadata that does not want uppercase. */
  numeric: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 14,
  },

  // ── Legacy aliases (kept until step 13) ──────────────────────────────
  // These keep components that haven't been rewritten yet visually consistent
  // with the new system. They map onto the closest editorial role above.
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
  },
  h1: {
    fontFamily: fonts.serif,
    fontSize: 30,
    letterSpacing: -0.8,
  },
  h2: {
    fontFamily: fonts.sansSemibold,
    fontSize: 19,
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  bodySmall: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  caption: {
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.4,
  },
} as const;
