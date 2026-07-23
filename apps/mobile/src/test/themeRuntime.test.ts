import { beforeEach, describe, expect, it } from "vitest";
import { colors } from "../theme/tokens";
import {
  createThemedStyles,
  setThemeRuntime,
} from "../theme/themeRuntime";

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  return rgb(hex)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("mobile theme runtime", () => {
  beforeEach(() => {
    setThemeRuntime("light", "purple");
  });

  it("re-resolves module-level styles when appearance changes", () => {
    const styles = createThemedStyles({
      surface: {
        backgroundColor: colors.bg,
        borderColor: colors.border,
        color: colors.textPrimary,
      },
    });

    expect(styles.surface.backgroundColor).toBe("#f7f1e8");

    setThemeRuntime("dark", "purple");

    expect(styles.surface.backgroundColor).toBe("#151118");
    expect(styles.surface.color).toBe("#f3eaf5");
    expect(styles.surface.borderColor).toBe("rgba(231,213,235,0.40)");
  });

  it("changes interactive emphasis without recoloring dark surfaces", () => {
    setThemeRuntime("dark", "purple");
    const background = colors.bg;
    const purple = colors.accent;

    setThemeRuntime("dark", "teal");

    expect(colors.bg).toBe(background);
    expect(colors.accent).not.toBe(purple);
    expect(colors.accent).toBe("#72c9c4");
  });

  it("keeps dark text and accent roles above the agreed contrast floor", () => {
    setThemeRuntime("dark", "purple");
    const background = colors.bg;

    expect(contrast(colors.textPrimary, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textSecondary, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textMuted, background)).toBeGreaterThanOrEqual(4.5);

    for (const accent of ["purple", "copper", "teal", "rose"] as const) {
      setThemeRuntime("dark", accent);
      expect(contrast(colors.accent, background)).toBeGreaterThanOrEqual(3);
      expect(contrast(colors.textInverse, colors.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
