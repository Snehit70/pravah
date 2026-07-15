/**
 * HeroVelocityChart
 *
 * The Progress page hero: a compact summary line, then a full-width line chart
 * of daily completions under it.
 *
 * The number and the chart used to sit side by side, which gave a 44px numeral
 * half the card and left the chart ~220px to describe 30 days. Stacking them
 * hands the full width to the only element that needs it; the summary reads
 * fine at body scale because it's two short facts, not a dashboard tile.
 *
 * Craft (see docs/research/progress-page-dataviz.md):
 *  - Monotone-cubic line (never overshoots count data) via lib/chartGeometry.
 *  - A pale gradient wash under a crisp 2px line. The line is the mark; the
 *    fill only gives the trend a body. Stops split color from opacity — see
 *    the note on `chart.heroAreaColor` in theme/tokens.ts for why an rgba()
 *    stopColor renders as a solid silhouette.
 *  - Entrance "draw-on": `d` stays static; we animate `strokeDashoffset`
 *    (line sweep) + area `fillOpacity`/`translateY` (rise) off one shared value.
 *
 * Phase 2 interactivity (§3–§4):
 *  - Touch-scrub: a Pan gesture maps finger x → nearest day (binary search on
 *    the precomputed `xs`), moving a crosshair + focus dot purely on the UI
 *    thread. Only a day-crossing hops to JS — for the readout text + a haptic
 *    tick — so scrubbing never re-renders React.
 *  - Range morph: on toggle the outgoing line/area crossfade out (a frozen
 *    "ghost") while the incoming series re-runs the draw-on. `d` is never
 *    tweened; only scalar opacity.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { haptic } from "../lib/haptic";
import {
  areaPath,
  monotoneLinePath,
  nearestIndex,
  pathLengthUpperBound,
  type Pt,
} from "../lib/chartGeometry";
import type { DayPoint } from "../lib/statsAggregators";
import { chart, colors, motion, radii, shadow, spacing, typography } from "../theme/tokens";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Delta = { thisPeriod: number; lastPeriod: number; deltaPct: number | null };

type Props = {
  series: DayPoint[];
  /** Headline number (total done in range). */
  total: number;
  /** Range period for the eyebrow, e.g. "this month". */
  periodLabel: string;
  /** Comparison caption under the delta, e.g. "vs last month". */
  comparisonLabel: string;
  delta: Delta;
  /**
   * True per-day completion counts, aligned to `series`. The line plots a
   * smoothed series so the trend reads calm, but the scrub readout must show
   * the honest integer for the day, not the fractional smoothed value.
   */
  rawCounts?: number[];
  height?: number;
};

const PAD_TOP = 10;
const PAD_BOTTOM = 6;
const READOUT_W = 104;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-03" → "Fri · Jul 3" (local, locale-stable). */
function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${wd} · ${MONTHS[m - 1]} ${d}`;
}

/** "2026-07-03" → "3 JUL" for the compact axis ticks. */
function formatAxisTick(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1].toUpperCase()}`;
}

export function HeroVelocityChart({
  series,
  total,
  periodLabel,
  comparisonLabel,
  delta,
  rawCounts,
  height = 168,
}: Props) {
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

  const baselineY = height - PAD_BOTTOM;
  const hasData = series.some((p) => p.count > 0);
  const canScrub = geom.xs.length >= 2 && hasData;

  const axis = useMemo(() => {
    if (series.length === 0) return null;
    const mid = series[Math.floor((series.length - 1) / 2)];
    return {
      start: formatAxisTick(series[0].date),
      mid: formatAxisTick(mid.date),
      end: formatAxisTick(series[series.length - 1].date),
    };
  }, [series]);

  // ── Entrance draw-on + range crossfade ──────────────────────────────────
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const fade = useSharedValue(0);
  const prevGeomRef = useRef(geom);
  const prevGeom = prevGeomRef.current;
  const isMorphing = !reducedMotion && !!prevGeom.line && prevGeom.line !== geom.line;

  useEffect(() => {
    prevGeomRef.current = geom;
  });

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      fade.value = 0;
      return;
    }
    if (isMorphing) {
      fade.value = 1;
      fade.value = withTiming(0, {
        duration: motion.duration.slow,
        easing: Easing.out(Easing.quad),
      });
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: motion.duration.deliberate,
      easing: Easing.out(Easing.cubic),
    });
  }, [geom.line, reducedMotion, progress, fade]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: geom.length * (1 - progress.value),
  }));
  const areaProps = useAnimatedProps(() => ({ fillOpacity: progress.value }));
  const riseProps = useAnimatedProps(() => ({
    transform: [{ translateY: 12 * (1 - progress.value) }],
  }));
  const ghostProps = useAnimatedProps(() => ({ opacity: fade.value }));

  // ── Scrub ───────────────────────────────────────────────────────────────
  const cursorX = useSharedValue(0);
  const cursorY = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const activeIdx = useSharedValue(-1);
  const [readout, setReadout] = useState<{ label: string; value: number } | null>(null);

  const emitReadout = (i: number) => {
    if (i < 0 || i >= series.length) return;
    haptic.selection();
    const value = rawCounts ? (rawCounts[i] ?? 0) : Math.round(series[i].count);
    setReadout({ label: formatDayLabel(series[i].date), value });
  };
  const clearReadout = () => setReadout(null);

  const pan = useMemo(() => {
    const xs = geom.xs;
    const ys = geom.ys;
    return Gesture.Pan()
      .enabled(canScrub)
      // Let the vertical ScrollView keep vertical drags; only claim horizontal.
      .activeOffsetX([-10, 10])
      .failOffsetY([-14, 14])
      .onStart((e) => {
        scrubbing.value = 1;
        const i = nearestIndex(xs, e.x);
        cursorX.value = xs[i];
        cursorY.value = ys[i];
        activeIdx.value = i;
        runOnJS(emitReadout)(i);
      })
      .onUpdate((e) => {
        const i = nearestIndex(xs, e.x);
        cursorX.value = xs[i];
        cursorY.value = ys[i];
        if (i !== activeIdx.value) {
          activeIdx.value = i;
          runOnJS(emitReadout)(i);
        }
      })
      .onFinalize(() => {
        scrubbing.value = 0;
        activeIdx.value = -1;
        runOnJS(clearReadout)();
      });
  }, [geom.xs, geom.ys, canScrub]); // eslint-disable-line react-hooks/exhaustive-deps

  const crosshairProps = useAnimatedProps(() => ({
    x1: cursorX.value,
    x2: cursorX.value,
    opacity: scrubbing.value,
  }));
  const dotProps = useAnimatedProps(() => ({
    cx: cursorX.value,
    cy: cursorY.value,
    opacity: scrubbing.value,
  }));
  const readoutStyle = useAnimatedStyle(() => ({
    opacity: scrubbing.value,
    transform: [
      {
        translateX: Math.max(0, Math.min(cursorX.value - READOUT_W / 2, width - READOUT_W)),
      },
    ],
  }));

  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilitySummary(total, periodLabel, delta)}
    >
      <View style={styles.summaryRow}>
        <View style={styles.summaryLeft}>
          <Text style={styles.headline}>
            {total}
            <Text style={styles.unit}> tasks completed</Text>
          </Text>
          <DeltaChip delta={delta} comparisonLabel={comparisonLabel} />
        </View>
        <Text style={styles.periodEyebrow}>{periodLabel}</Text>
      </View>

      <GestureDetector gesture={pan}>
        <View style={styles.chartCol}>
          <View
            style={{ height }}
            onLayout={onLayout}
            importantForAccessibility="no-hide-descendants"
          >
            {width > 0 && geom.line ? (
              <Svg width={width} height={height}>
                <Defs>
                  <LinearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
                    <Stop
                      offset="0"
                      stopColor={chart.heroAreaColor}
                      stopOpacity={chart.heroAreaTopOpacity}
                    />
                    <Stop
                      offset="1"
                      stopColor={chart.heroAreaColor}
                      stopOpacity={chart.heroAreaBottomOpacity}
                    />
                  </LinearGradient>
                </Defs>

                {/* Outgoing range, frozen and fading out under the new one. */}
                {isMorphing ? (
                  <AnimatedG animatedProps={ghostProps}>
                    <Path d={prevGeom.area} fill="url(#heroArea)" />
                    <Path
                      d={prevGeom.line}
                      stroke={chart.line}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </AnimatedG>
                ) : null}

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

                {/* Dotted baseline under the trend. */}
                <Line
                  x1={0}
                  x2={width}
                  y1={baselineY}
                  y2={baselineY}
                  stroke={chart.grid}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="1 6"
                  opacity={0.7}
                />

                {/* Scrub crosshair + focus dot (opacity 0 until a drag starts). */}
                <AnimatedLine
                  y1={PAD_TOP}
                  y2={baselineY}
                  stroke={chart.cursor}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  animatedProps={crosshairProps}
                />
                <AnimatedCircle
                  r={4.5}
                  fill={chart.cursor}
                  stroke={colors.bgCard}
                  strokeWidth={2}
                  animatedProps={dotProps}
                />
              </Svg>
            ) : null}

            {canScrub ? (
              <Animated.View style={[styles.readout, readoutStyle]} pointerEvents="none">
                {readout ? (
                  <>
                    <Text style={styles.readoutValue}>{readout.value} done</Text>
                    <Text style={styles.readoutLabel}>{readout.label}</Text>
                  </>
                ) : null}
              </Animated.View>
            ) : null}

            {!hasData ? (
              <View style={styles.emptyOverlay} pointerEvents="none">
                <Text style={styles.emptyText}>Momentum takes shape here.</Text>
              </View>
            ) : null}
          </View>

          {axis && hasData ? (
            <View style={styles.axisRow}>
              <Text style={styles.axisTick}>{axis.start}</Text>
              <Text style={styles.axisTick}>{axis.mid}</Text>
              <Text style={[styles.axisTick, styles.axisTickEnd]}>{axis.end}</Text>
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

function DeltaChip({
  delta,
  comparisonLabel,
}: {
  delta: Delta;
  comparisonLabel: string;
}): ReactNode {
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
      <Text style={styles.deltaMeta}>{comparisonLabel}</Text>
    </View>
  );
}

function accessibilitySummary(total: number, periodLabel: string, delta: Delta): string {
  const trend =
    delta.deltaPct == null
      ? ""
      : delta.deltaPct > 0
        ? `, up ${Math.round(delta.deltaPct)}% from the previous period`
        : delta.deltaPct < 0
          ? `, down ${Math.round(Math.abs(delta.deltaPct))}% from the previous period`
          : ", even with the previous period";
  return `${total} tasks completed ${periodLabel}${trend}. Completion velocity chart.`;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    overflow: "hidden",
    gap: spacing.md,
    ...shadow.sm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  summaryLeft: {
    flexShrink: 1,
  },
  /** "23" sized to lead the line, with the unit riding along inside it. */
  headline: {
    fontFamily: typography.display.fontFamily,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: colors.textPrimary,
  },
  unit: {
    ...typography.bodyLg,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    letterSpacing: 0,
  },
  periodEyebrow: {
    ...typography.micro,
    color: colors.textMuted,
    paddingTop: spacing.sm,
  },
  deltaChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
    marginTop: 2,
    flexWrap: "wrap",
  },
  deltaText: {
    ...typography.numeric,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.title.fontFamily,
  },
  deltaMeta: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  chartCol: {
    width: "100%",
  },
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  axisTick: {
    ...typography.micro,
    color: colors.textMuted,
  },
  axisTickEnd: {
    textAlign: "right",
  },
  readout: {
    position: "absolute",
    top: 0,
    left: 0,
    width: READOUT_W,
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  readoutValue: {
    ...typography.numeric,
    fontSize: 14,
    lineHeight: 17,
    color: colors.textPrimary,
    fontFamily: typography.title.fontFamily,
  },
  readoutLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  emptyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: "center",
  },
});
