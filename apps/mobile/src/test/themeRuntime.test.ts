import { beforeEach, describe, expect, it } from "vitest";
import { chart, colors } from "../theme/tokens";
import { goalPillFor, priorityPillFor, progressPillFor } from "../theme/pills";
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

    expect(styles.surface.backgroundColor).toBe("#141413");
    expect(styles.surface.color).toBe("#f2f0eb");
    expect(styles.surface.borderColor).toBe("#3d3d37");
  });

  it("follows theme changes when styles were initialized in dark rose appearance", () => {
    setThemeRuntime("dark", "rose");
    const styles = createThemedStyles({
      surface: {
        backgroundColor: colors.bgCard,
        borderColor: colors.borderControl,
        color: colors.accent,
      },
      media: { color: colors.textOnMedia },
      button: { backgroundColor: colors.accent, color: colors.textInverse },
      metadata: { color: colors.textMuted },
    });

    setThemeRuntime("light", "teal");
    expect(styles.surface.backgroundColor).toBe(colors.bgCard);
    expect(styles.surface.borderColor).toBe(colors.borderControl);
    expect(styles.surface.color).toBe(colors.accent);
    expect(styles.media.color).toBe(colors.textOnMedia);
    expect(styles.button.color).toBe(colors.textInverse);
    expect(styles.metadata.color).toBe(colors.textMuted);

    setThemeRuntime("dark", "copper");
    expect(styles.surface.backgroundColor).toBe(colors.bgCard);
    expect(styles.surface.color).toBe(colors.accent);
    expect(styles.media.color).toBe(colors.textOnMedia);
    expect(styles.button.color).toBe(colors.textInverse);
    expect(styles.metadata.color).toBe(colors.textMuted);
  });

  it("changes interactive emphasis without recoloring dark surfaces", () => {
    setThemeRuntime("dark", "purple");
    const background = colors.bg;
    const purple = colors.accent;

    setThemeRuntime("dark", "teal");

    expect(colors.bg).toBe(background);
    expect(colors.accent).not.toBe(purple);
    expect(colors.accent).toBe("#9fc6bf");
  });

  it("keeps Journey intensity synchronized with the selected accent", () => {
    setThemeRuntime("dark", "rose");
    const roseRamp = [...chart.heatmapRamp];

    setThemeRuntime("dark", "teal");

    expect(chart.heatmapRamp).not.toEqual(roseRamp);
    expect(chart.heatmapRamp).toEqual([
      "rgba(159,198,191,0.34)",
      "rgba(159,198,191,0.56)",
      "rgba(159,198,191,0.78)",
      "#9fc6bf",
    ]);
  });

  it("keeps dark text and accent roles above the agreed contrast floor", () => {
    setThemeRuntime("dark", "purple");
    for (const accent of ["purple", "copper", "teal", "rose"] as const) {
      setThemeRuntime("dark", accent);
      for (const background of [colors.bg, colors.bgSurface, colors.bgCard, colors.bgFloating]) {
        for (const text of [colors.textPrimary, colors.textSecondary, colors.textMuted, colors.textDim]) {
          expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(colors.accent, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.borderControl, background)).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(colors.textInverse, colors.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps priority and status colors stable across every accent", () => {
    setThemeRuntime("dark", "purple");
    const roles = ["priorityP1", "priorityP2", "priorityP3", "success", "warning", "deadline", "error"] as const;
    const expected = roles.map((role) => colors[role]);
    for (const accent of ["purple", "copper", "teal", "rose"] as const) {
      setThemeRuntime("dark", accent);
      expect(roles.map((role) => colors[role])).toEqual(expected);
      for (const foreground of expected) {
        expect(contrast(foreground, colors.bgFloating)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps dark pill text readable on its actual fill across every accent", () => {
    for (const accent of ["purple", "copper", "teal", "rose"] as const) {
      setThemeRuntime("dark", accent);
      const pills = [
        ...(["p1", "p2", "p3"] as const).map(priorityPillFor),
        // A-D cover every bucket of the existing goal-name hash.
        ...["A", "B", "C", "D"].map(goalPillFor),
        progressPillFor(0),
        progressPillFor(1),
      ];
      for (const pill of pills) {
        expect(contrast(pill.textColor, pill.container.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      }
      expect(priorityPillFor("p3").textColor).not.toBe(colors.success);
      expect(progressPillFor(0)).not.toEqual(progressPillFor(1));
    }
  });

  it("preserves the light pill colors and goal assignments across every accent", () => {
    for (const accent of ["purple", "copper", "teal", "rose"] as const) {
      setThemeRuntime("light", accent);
      const goalPairs = [
        [colors.accentSoft, colors.accent],
        [colors.successMuted, colors.success],
        [colors.warningMuted, colors.warning],
        [colors.deadlineMuted, colors.deadline],
      ];
      for (const [name, bucket] of [
        ["A", 1], ["B", 2], ["C", 3], ["D", 0],
        ["MLP", 1], ["DL-Gen AI", 1], ["Hyprfolio", 2],
      ] as const) {
        const pill = goalPillFor(name);
        expect([pill.container.backgroundColor, pill.textColor]).toEqual(goalPairs[bucket]);
        expect(pill.container.borderWidth).toBe(0);
      }
      for (const [priority, background, foreground] of [
        ["p1", colors.errorMuted, colors.priorityP1],
        ["p2", colors.warningMuted, colors.priorityP2],
        ["p3", colors.successMuted, colors.priorityP3],
      ] as const) {
        const pill = priorityPillFor(priority);
        expect([pill.container.backgroundColor, pill.textColor]).toEqual([background, foreground]);
        expect(pill.container.borderWidth).toBe(0);
      }
      expect(progressPillFor(0).container.backgroundColor).toBe(colors.successMuted);
      expect(progressPillFor(0).textColor).toBe(colors.success);
    }
  });
});
