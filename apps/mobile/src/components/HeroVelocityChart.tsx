/**
 * HeroVelocityChart
 *
 * The Progress page hero: a big completion-velocity number with a delta chip,
 * over a smooth gradient area chart of daily completions for the active range.
 *
 * Craft (see docs/research/progress-page-dataviz.md):
 *  - Monotone-cubic line (never overshoots count data) via lib/chartGeometry.
 *  - Gradient area closed to the baseline, single accent hue fading out.
 *  - Entrance "draw-on": `d` stays static; we animate `strokeDashoffset`
 *    (line sweep) + area `fillOpacity`/`translateY` (rise) off one shared
 *    value. Never animate `d` per frame — that's the jank path.
 *  - Range changes re-trigger the same draw-on (cross-fade, not a `d` morph).
 *
 * Phase 1 renders the chart + entrance motion; the precomputed `xs`/`ys`
 * arrays are here so the Phase 2 scrubber can attach without a refactor.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  areaPath,
  monotoneLinePath,
  pathLengthUpperBound,
  type Pt,
} from "../lib/chartGeometry";
import type { DayPoint } from "../lib/statsAggregators";
import { chart, colors, motion, radii, spacing, typography } from "../theme/tokens";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

type Delta = { thisPeriod: number; lastPeriod: number; deltaPct: number | null };

type Props = {
  series: DayPoint[];
  /** Headline number (total done in range) + comparison to the prior window. */
  total: number;
  caption: string;
  delta: Delta;
  height?: number;
};

const PAD_TOP = 10;
const PAD_BOTTOM = 6;

export function HeroVelocityChart({ series, total, caption, delta, height = 132 }: Props) {
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const geom = useMemo(() => {
    if (width === 0 || series.length === 0) {
      return { line: "", area: "", length: 0, xs: [] as number[], ys: [] as number[] };
    }
    const innerH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);
    const max = Math.max(1, ...series.map((p) => p.count));
    const stepX = series.length > 1 ? width / (series.length - 1) : width;
    const pts: Pt[] = series.map((p, i) => ({
      x: series.length > 1 ? i * stepX : width / 2,
      // Leave a hair of headroom so the peak never clips the top stroke.
      y: PAD_TOP + innerH - (p.count / max) * (innerH - 2),
    }));
    const line = monotoneLinePath(pts);
    const area = areaPath(line, pts[0].x, pts[pts.length - 1].x, height);
    return {
      line,
      area,
      length: pathLengthUpperBound(pts),
      xs: pts.map((p) => p.x),
      ys: pts.map((p) => p.y),
    };
  }, [series, width, height]);

  // One shared value drives the whole entrance; re-run when the series shape
  // changes (range toggle) so the new line draws itself in.
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: motion.duration.deliberate,
      easing: Easing.out(Easing.cubic),
    });
  }, [geom.line, reducedMotion, progress]);

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: geom.length * (1 - progress.value),
  }));
  const areaProps = useAnimatedProps(() => ({ fillOpacity: progress.value }));
  const riseProps = useAnimatedProps(() => ({
    transform: [{ translateY: 12 * (1 - progress.value) }],
  }));

  const hasData = series.some((p) => p.count > 0);

  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilitySummary(total, caption, delta)}
    >
      <View style={styles.headerRow}>
        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>{total}</Text>
          <Text style={styles.caption}>{caption}</Text>
        </View>
        <DeltaChip delta={delta} />
      </View>

      <View style={{ height }} onLayout={onLayout} importantForAccessibility="no-hide-descendants">
        {width > 0 && geom.line ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={chart.areaTop} stopOpacity="1" />
                <Stop offset="1" stopColor={chart.areaBottom} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <AnimatedG animatedProps={riseProps}>
              <AnimatedPath d={geom.area} fill="url(#heroArea)" animatedProps={areaProps} />
            </AnimatedG>
            <AnimatedPath
              d={geom.line}
              stroke={chart.line}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={geom.length}
              animatedProps={lineProps}
            />
          </Svg>
        ) : null}
        {!hasData ? (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <Text style={styles.emptyText}>
              A few more completions and your momentum takes shape here.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DeltaChip({ delta }: { delta: Delta }): ReactNode {
  const { thisPeriod, lastPeriod, deltaPct } = delta;
  let label: string;
  let tint: string;
  if (lastPeriod === 0 && thisPeriod === 0) {
    return null;
  }
  if (deltaPct == null) {
    label = `+${thisPeriod}`;
    tint = colors.success;
  } else if (Math.abs(deltaPct) < 1) {
    label = "Even";
    tint = colors.textMuted;
  } else if (deltaPct > 0) {
    label = `↑ ${Math.round(deltaPct)}%`;
    tint = colors.success;
  } else {
    label = `↓ ${Math.round(Math.abs(deltaPct))}%`;
    tint = colors.textSecondary;
  }
  return (
    <View style={styles.deltaChip}>
      <Text style={[styles.deltaText, { color: tint }]}>{label}</Text>
      <Text style={styles.deltaMeta}>vs prev</Text>
    </View>
  );
}

function accessibilitySummary(total: number, caption: string, delta: Delta): string {
  const trend =
    delta.deltaPct == null
      ? ""
      : delta.deltaPct > 0
        ? `, up ${Math.round(delta.deltaPct)}% from the previous period`
        : delta.deltaPct < 0
          ? `, down ${Math.round(Math.abs(delta.deltaPct))}% from the previous period`
          : ", even with the previous period";
  return `${total} ${caption}${trend}. Completion velocity chart.`;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headlineBlock: {
    flex: 1,
  },
  headline: {
    fontFamily: typography.display.fontFamily,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  caption: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginTop: 2,
  },
  deltaChip: {
    alignItems: "flex-end",
    paddingTop: spacing.xs,
  },
  deltaText: {
    ...typography.numeric,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: typography.title.fontFamily,
  },
  deltaMeta: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: 1,
  },
  emptyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: "center",
  },
});
