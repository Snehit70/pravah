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
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { haptic } from "../lib/haptic";
import {
  anchoredMorph,
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

/**
 * The morph's line + area for one frame, built entirely inside one worklet.
 *
 * This restates lib/chartGeometry's monotone-cubic math instead of calling it,
 * and that duplication is the point. A worklet's free identifiers are captured
 * at its definition site, so marking that shared module's call graph `'worklet'`
 * made its bottom-declared `r` resolve to undefined and crashed every call —
 * including the plain JS ones. A worklet that reaches across module scope is a
 * trap; one that closes over nothing but `Math` is not. If the tangent rule
 * changes, it changes in both places — chartGeometry's tests are what pin the
 * rule, and `anchoredMorph` + `lerpPts` cover the arithmetic below.
 *
 * Both paths come from one pass so the spline is not walked twice per frame.
 */
function morphPath(
  fx: number[],
  fy: number[],
  tx: number[],
  ty: number[],
  t: number,
  baselineY: number,
): { line: string; area: string } {
  "worklet";
  const n = tx.length;
  if (n === 0) return { line: "", area: "" };

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push(fx[i] + (tx[i] - fx[i]) * t);
    ys.push(fy[i] + (ty[i] - fy[i]) * t);
  }
  const rr = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) {
    const only = `M${rr(xs[0])},${rr(ys[0])}`;
    return { line: only, area: "" };
  }

  // Fritsch–Carlson / Steffen tangents — mirrors monotoneTangents.
  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    s.push(h[i] === 0 ? 0 : (ys[i + 1] - ys[i]) / h[i]);
  }
  const m: number[] = new Array(n);
  m[0] = s[0];
  m[n - 1] = s[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1];
    const s1 = s[i];
    if (s0 * s1 <= 0) {
      m[i] = 0;
    } else {
      const p = (s0 * h[i] + s1 * h[i - 1]) / (h[i - 1] + h[i]);
      const sign = (s0 < 0 ? -1 : 1) + (s1 < 0 ? -1 : 1);
      m[i] = sign * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
    }
  }

  let line = `M${rr(xs[0])},${rr(ys[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3;
    line +=
      `C${rr(xs[i] + dx)},${rr(ys[i] + dx * m[i])} ` +
      `${rr(xs[i + 1] - dx)},${rr(ys[i + 1] - dx * m[i + 1])} ` +
      `${rr(xs[i + 1])},${rr(ys[i + 1])}`;
  }
  const area = `${line}L${rr(xs[n - 1])},${rr(baselineY)}L${rr(xs[0])},${rr(baselineY)}Z`;
  return { line, area };
}


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

  // ── Entrance draw-on + anchored range morph ─────────────────────────────
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const morph = useSharedValue(1);
  const fromXs = useSharedValue<number[]>([]);
  const fromYs = useSharedValue<number[]>([]);
  const toXs = useSharedValue<number[]>([]);
  const toYs = useSharedValue<number[]>([]);
  const prevRef = useRef<{ series: DayPoint[]; width: number } | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { series, width };

    if (reducedMotion || width === 0 || series.length === 0) {
      progress.value = 1;
      morph.value = 1;
      return;
    }

    // A different day count at the same width is a range switch. Anything else
    // (first mount, a task completing) is a data refresh, which draws on.
    const rangeChanged =
      !!prev &&
      prev.width === width &&
      prev.series.length > 1 &&
      prev.series.length !== series.length;

    if (rangeChanged && prev) {
      const m = anchoredMorph(prev.series, series, {
        width,
        height,
        padTop: PAD_TOP,
        padBottom: PAD_BOTTOM,
      });
      fromXs.value = m.fromXs;
      fromYs.value = m.fromYs;
      toXs.value = m.toXs;
      toYs.value = m.toYs;
      // The line is already on screen. Reshape it — never erase and redraw.
      progress.value = 1;
      morph.value = 0;
      morph.value = withTiming(1, {
        duration: motion.duration.slow,
        easing: Easing.inOut(Easing.quad),
      });
      return;
    }

    morph.value = 1;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: motion.duration.deliberate,
      easing: Easing.out(Easing.cubic),
    });
  }, [series, width, height, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // One pass per frame, shared by the line and the area.
  const morphed = useDerivedValue(() => {
    if (morph.value >= 1 || toXs.value.length === 0) return null;
    return morphPath(
      fromXs.value,
      fromYs.value,
      toXs.value,
      toYs.value,
      morph.value,
      height,
    );
  });
  const lineProps = useAnimatedProps(() => {
    const m = morphed.value;
    if (!m) return { d: geom.line, strokeDashoffset: geom.length * (1 - progress.value) };
    return { d: m.line, strokeDashoffset: 0 };
  });
  const areaProps = useAnimatedProps(() => {
    const m = morphed.value;
    if (!m) return { d: geom.area, fillOpacity: progress.value };
    return { d: m.area, fillOpacity: 1 };
  });
  const riseProps = useAnimatedProps(() => ({
    transform: [{ translateY: 12 * (1 - progress.value) }],
  }));

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
      {/* No period eyebrow here: the range pill above the card already sets the
          window, and the delta caption names it again. `periodLabel` still
          feeds the accessibility summary, where there is no pill to read. */}
      <View style={styles.summaryLeft}>
        <Text style={styles.headline}>
          {total}
          <Text style={styles.unit}> tasks completed</Text>
        </Text>
        <DeltaChip delta={delta} comparisonLabel={comparisonLabel} />
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

                {/* An empty range has no trend to draw. Plotting zeros welds a
                    flat line onto the baseline rule, which reads as a broken
                    chart rather than as "nothing happened" — the empty message
                    below says that better. */}
                {hasData ? (
                  <>
                    <AnimatedG animatedProps={riseProps}>
                      <AnimatedPath fill="url(#heroArea)" animatedProps={areaProps} />
                    </AnimatedG>
                    <AnimatedPath
                      stroke={chart.line}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      strokeDasharray={geom.length}
                      animatedProps={lineProps}
                    />
                  </>
                ) : null}

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
  let trend = "";
  if (delta.lastPeriod === 0 && delta.thisPeriod === 0) {
    trend = "";
  } else if (delta.deltaPct == null) {
    trend = `, up by ${delta.thisPeriod} tasks from the previous period`;
  } else if (Math.abs(delta.deltaPct) < 1) {
    trend = ", even with the previous period";
  } else if (delta.deltaPct > 0) {
    trend = `, up ${Math.round(delta.deltaPct)}% from the previous period`;
  } else {
    trend = `, down ${Math.round(Math.abs(delta.deltaPct))}% from the previous period`;
  }
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
