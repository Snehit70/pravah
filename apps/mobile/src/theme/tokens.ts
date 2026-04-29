/** Design tokens for Pravah.
 *
 * Mirrors the web app's design system at src/index.css so the two surfaces
 * read as one product. Mobile is denser-paint than dense-desktop, so the
 * typography scale is bumped one step versus web while colors, radii, and
 * accent semantics match exactly.
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

/**
 * Web-aligned palette. Values that exist as web CSS variables are noted so
 * the parity is auditable.
 *
 * Web uses oklch() for accent + semantics; RN doesn't accept oklch, so the
 * hex values below are sRGB approximations that round-trip within ~1 ΔE for
 * typical mobile displays.
 */
export const colors = {
  // ── Background layers ────────────────────────────────────────────────
  /** --color-bg-base — page floor */
  bg: "#0a0a0b",
  /** --color-bg-surface — base sections */
  bgSurface: "#101013",
  /** --color-bg-elevated — opaque card surface */
  bgCard: "#17171b",
  /** --color-bg-floating — popovers, sheets, drag overlay */
  bgFloating: "#1c1c20",
  /** --color-card-bg — translucent card tint that sits over the grid */
  bgCardGlass: "rgba(255,255,255,0.025)",
  /** Translucent input fill (matches web Input bg) */
  bgInput: "rgba(255,255,255,0.025)",
  /** --color-bg-overlay — modal scrim */
  backdrop: "rgba(0,0,0,0.6)",

  // ── Borders ─────────────────────────────────────────────────────────
  /** --color-border-default */
  border: "rgba(255,255,255,0.13)",
  /** --color-border-subtle — hairline dividers */
  borderSubtle: "rgba(255,255,255,0.07)",
  /** --color-border-focus — accent ring on focused inputs */
  borderFocus: "rgba(139,125,232,0.45)",

  // ── Text ────────────────────────────────────────────────────────────
  /** --color-text-primary */
  textPrimary: "#ededef",
  /** --color-text-secondary */
  textSecondary: "#c2c2c8",
  /** --color-text-muted */
  textMuted: "#6b6b72",
  /** --color-text-dim — disabled / inactive */
  textDim: "#45454a",
  /** Inverse / on-accent text */
  textInverse: "#0a0a0b",
  /** Completed task text — reads "checked off", not "disabled" */
  textCompleted: "#6b6b72",

  // ── Accent (indigo, oklch 0.78 0.14 260) ────────────────────────────
  /** --color-accent-primary */
  accent: "#8b7de8",
  /** --color-accent-primary-hover */
  accentHover: "#7866dc",
  /** --color-accent-primary-muted (~20% alpha) */
  accentSoft: "rgba(139,125,232,0.20)",
  /** --color-accent-glow (~35% alpha) — used for shadows */
  accentGlow: "rgba(139,125,232,0.35)",
  /** --color-accent-dim (~8% alpha) — barely-there wash */
  accentDim: "rgba(139,125,232,0.08)",

  // ── Priority semantics — same colors as web TaskCard accent bar ─────
  priorityP1: "#8b7de8",
  priorityP2: "#c2c2c8",
  priorityP3: "#6b6b72",

  // ── Status semantics ────────────────────────────────────────────────
  /** --color-success — mossy mint (oklch 0.78 0.18 150) */
  success: "#5dd39e",
  successMuted: "rgba(93,211,158,0.18)",
  /** --color-warning — amber (oklch 0.78 0.15 60) */
  warning: "#d9b870",
  warningMuted: "rgba(217,184,112,0.18)",
  /** --color-deadline — orange (oklch 0.72 0.16 30) */
  deadline: "#d38560",
  deadlineMuted: "rgba(211,133,96,0.22)",
  /** --color-error — red-orange (oklch 0.72 0.20 25) */
  error: "#dd6e53",
  errorMuted: "rgba(221,110,83,0.18)",

  // ── Legacy aliases (kept so untouched call sites keep compiling) ────
  /** @deprecated Use `success`. */
  primary: "#5dd39e",
  /** @deprecated Use `bg`. */
  primaryDark: "#0a0a0b",
  /** @deprecated Use `textInverse`. */
  primaryInk: "#0a0a0b",
  /** @deprecated Halo replaced by GridBackground; soft accent wash kept for back-compat. */
  haloCopper: "rgba(139,125,232,0.06)",
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
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  xl: {
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 40 },
    elevation: 16,
  },
  glow: {
    shadowColor: "#8b7de8",
    shadowOpacity: 0.4,
    shadowRadius: 20,
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
