/** Design tokens for Pravah Mobile */

export const colors = {
  // Backgrounds
  bg: "#09111f",
  bgCard: "#0d1a2f",
  bgInput: "#101d33",
  bgElevated: "#0e1a2d",

  // Borders
  border: "#1f3655",
  borderSubtle: "#2c3a4f",

  // Text
  textPrimary: "#f1f5f9",
  textSecondary: "#9fb3cc",
  textTertiary: "#8fa8c4",
  textMuted: "#6d7e9a",
  textCompleted: "#8ca2bc",

  // Brand / Accent
  accent: "#7dd3fc",
  accentDim: "#0ea5e91e",

  // Actions
  primary: "#22c55e",
  primaryDark: "#052e16",
  primaryBg: "#133b2a",
  primaryBgHover: "#14532d",
  primaryText: "#bbf7d0",

  // Destructive / Error
  error: "#ef4444",
  errorBg: "#3a1221",
  errorBorder: "#7f1d1d",

  // Info
  infoBg: "#102846",
  infoBorder: "#1e3a8a",
  infoText: "#dbeafe",

  // Interactive
  tabActive: "#1f4ca6",
  chipActive: "#113468",
  chipActiveBorder: "#2e74c0",
  chipBorder: "#20406a",
  ghostBg: "#102646",
  ghostText: "#bfdbfe",

  // Glow
  glowCyan: "#0ea5e91e",
  glowGreen: "#34d39914",

  // Overlay
  backdrop: "#020617cc",
} as const;

export const radii = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 18,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const typography = {
  kicker: {
    fontSize: 12,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.7,
  },
  h1: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 20,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 16,
    fontWeight: "700" as const,
  },
  body: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
  label: {
    fontSize: 12,
    fontWeight: "700" as const,
  },
} as const;
