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
 * Transitional aliases were kept through the middle of the redesign so the
 * untouched components could keep compiling. Step 13 removes the aliases the
 * finished mobile UI no longer uses.
 */
export const colors = {
  // Backgrounds — warm near-black to warm near-newsprint
  bg: "#0f0e0d", // ink — global app background, never #000
  bgCard: "#171513", // only when enclosure is justified (modal sheet, input)
  bgInput: "#1a1816", // text input fill

  // Borders — warm grey, not blue
  border: "#2a2622",
  borderSubtle: "#211f1c", // hairline dividers; almost invisible

  // Text — warm off-white through warm mid-grey
  textPrimary: "#ece6db", // newsprint white
  textSecondary: "#b0a89a", // warm ash
  textMuted: "#6c6559",
  textCompleted: "#817a6e", // reads "checked off", not "disabled"

  // Brand / accent — single copper, used for urgency and the active underline
  accent: "#c77b3a",
  accentSoft: "#c77b3a26", // ~15% — sparse halo / hover wash (8-digit hex incl. alpha)

  // Priority semantics — derived from the accent + neutrals
  priorityP1: "#c77b3a", // urgent = accent
  priorityP2: "#b0a89a", // normal = warm ash
  priorityP3: "#6c6559", // low   = warm mid-grey

  // Completion green — mossy, lived-in, never fire-engine
  primary: "#6c9c7a",
  primaryDark: "#0e1f15",
  primaryInk: "#0e1f15", // text/ink rendered on top of primary

  // Destructive / error — rust, not fire-engine
  error: "#c76a52",

  // Glow — single warm halo (replaces the two saturated blur circles)
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
 * The finished redesign now uses only the editorial roles below.
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
} as const;
