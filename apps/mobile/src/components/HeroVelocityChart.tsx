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
 *
 * Phase 2 interactivity (§3–§4):
 *  - Touch-scrub: a Pan gesture maps finger x → nearest day (binary search on
 *    the precomputed `xs`), moving a crosshair + focus dot purely on the UI
 *    thread. Only a day-crossing hops to JS — for the readout text + a haptic
 *    tick — so scrubbing never re-renders React.
 *  - Range morph: on toggle the outgoing line/area crossfade out (a frozen
 *    "ghost") while the incoming series re-runs the draw-on. We never tween the
 *    `d` string; only scalar opacity.
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
import { chart, colors, motion, radii, spacing, typography } from "../theme/tokens";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Delta = { thisPeriod: number; lastPeriod: number; deltaPct: number | null };

type Props = {
  series: DayPoint[];
  /** Headline number (total done in range) + comparison to the prior window. */
  total: number;
  caption: string;
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

export function HeroVelocityChart({
  series,
  total,
  caption,
  delta,
  rawCounts,
  height = 132,
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

  const hasData = series.some((p) => p.count > 0);
  const canScrub = geom.xs.length >= 2 && hasData;

  // ── Entrance draw-on + range crossfade ──────────────────────────────────
  // One shared value drives the whole entrance; `fade` crossfades the previous
  // line out when the range changes. `prevGeom` lags one render (committed in a
  // post-paint effect) so on the toggle render we still have the outgoing paths
  // to freeze as a ghost. See §4: never animate `d`, only scalar opacity.
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
    // isMorphing is derived from geom.line; keying on geom.line covers it.
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
    // Rebuild when the plotted geometry or scrub-eligibility changes so the
    // worklet closes over the current xs/ys.
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
      accessibilityLabel={accessibilitySummary(total, caption, delta)}
    >
      <View style={styles.headerRow}>
        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>{total}</Text>
          <Text style={styles.caption}>{caption}</Text>
        </View>
        <DeltaChip delta={delta} />
      </View>

      <GestureDetector gesture={pan}>
        <View style={{ height }} onLayout={onLayout} importantForAccessibility="no-hide-descendants">
          {width > 0 && geom.line ? (
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={chart.areaTop} stopOpacity="1" />
                  <Stop offset="1" stopColor={chart.areaBottom} stopOpacity="1" />
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

              {/* Scrub crosshair + focus dot (opacity 0 until a drag starts). */}
              <AnimatedLine
                y1={PAD_TOP}
                y2={height - PAD_BOTTOM}
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
              <Text style={styles.emptyText}>
                A few more completions and your momentum takes shape here.
              </Text>
            </View>
          ) : null}
        </View>
      </GestureDetector>
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
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: "center",
  },
});
