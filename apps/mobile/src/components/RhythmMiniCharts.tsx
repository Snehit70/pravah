/**
 * RhythmMiniCharts
 *
 * The "when you work best" section: one full-width chart driven by two toggles,
 * plus the median cycle-time stat.
 *
 * The two distributions used to sit side by side, which gave each ~170px — too
 * narrow for 24 hourly points and too narrow to label 7 weekdays with anything
 * but an ambiguous initial (S M T W T F S has two S's and two T's). One chart at
 * full width fits real day names and reads at arm's length.
 *
 * ── The two toggles ─────────────────────────────────────────────────────
 * `metric` picks what you're looking at; `shape` picks how it's drawn. That's
 * 4 combinations, and they are not equally honest:
 *
 *   weekday + bars   ✔ the right default — 7 discrete categories
 *   weekday + line   ⚠ draws a slope between Sunday and Monday, implying the
 *                      week is continuous. Offered because it was asked for;
 *                      bars are the truthful reading of this series.
 *   hour + line      ✔ the right default — 24 points around a continuous clock
 *   hour + bars      ✔ an honest histogram, denser but legible
 *
 * So `shape` is remembered across metric switches, but each metric opens on its
 * own correct default the first time you land on it.
 *
 * Bars are reanimated Views growing from the baseline off one shared value; the
 * curve is an SVG monotone line (same geometry as the hero). Both degrade to a
 * calm low-data line when the sample is too thin.
 *
 * Every bar is the same colour — see `chart.bar`. Height already encodes which
 * day won, so the peak is called out with a direct count label rather than a
 * tint.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { haptic } from "../lib/haptic";
import { BarChartIcon, LineChartIcon } from "./UiIcons";
import {
  areaPath,
  monotoneLinePath,
  pathLengthUpperBound,
  type Pt,
} from "../lib/chartGeometry";
import { WEEKDAY_LABELS } from "../lib/statsAggregators";
import { chart, colors, motion, radii, spacing, typography } from "../theme/tokens";

/** Full width finally has room for real day names instead of "S M T W T F S". */
const WEEKDAY_SHORT = WEEKDAY_LABELS.map((l) => l.slice(0, 3));
const MIN_SAMPLE = 3;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const CARD_PAD = spacing.lg; // must match styles.card horizontal padding
const CHART_H = 148;

type Metric = "weekday" | "hour";
type Shape = "bars" | "line";

type Props = {
  weekday: { counts: number[]; total: number };
  hour: { counts: number[]; total: number };
  cycleDays: number | null;
};

const METRICS: Array<{ key: Metric; label: string }> = [
  { key: "weekday", label: "When you finish" },
  { key: "hour", label: "Focus by hour" },
];

/** Each series opens in the shape that tells the truth about it. */
const DEFAULT_SHAPE: Record<Metric, Shape> = { weekday: "bars", hour: "line" };

function formatCycle(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function RhythmMiniCharts({ weekday, hour, cycleDays }: Props) {
  const [width, setWidth] = useState(0);
  const [metric, setMetric] = useState<Metric>("weekday");
  // Null until the user states a preference, so each metric can open on its own
  // default; once they choose a shape it sticks across metric switches.
  const [shape, setShape] = useState<Shape | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const activeShape = shape ?? DEFAULT_SHAPE[metric];
  // `width` is the card's border-box (includes its horizontal padding).
  const plotW = width > 0 ? width - CARD_PAD * 2 : 0;

  const series = metric === "weekday" ? weekday : hour;
  const hasSample = series.total >= MIN_SAMPLE;

  const selectMetric = (key: Metric) => {
    if (key === metric) return;
    haptic.selection();
    setMetric(key);
  };

  const selectShape = (key: Shape) => {
    if (key === activeShape) return;
    haptic.selection();
    setShape(key);
  };

  return (
    <View style={styles.card} onLayout={onLayout}>
      <View style={styles.controls}>
        <View style={styles.segmented}>
          {METRICS.map((option) => {
            const active = metric === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => selectMetric(option.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [
                  styles.segment,
                  active && styles.segmentActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.shapeToggle}>
          <ShapeButton
            shape="bars"
            active={activeShape === "bars"}
            label="Show as bars"
            onPress={() => selectShape("bars")}
          />
          <ShapeButton
            shape="line"
            active={activeShape === "line"}
            label="Show as a line"
            onPress={() => selectShape("line")}
          />
        </View>
      </View>

      {!hasSample ? (
        <View style={styles.miniEmpty}>
          <Text style={styles.miniEmptyText}>
            A few more completions and this fills in.
          </Text>
        </View>
      ) : metric === "weekday" ? (
        <WeekdayChart counts={weekday.counts} shape={activeShape} width={plotW} />
      ) : (
        <HourChart counts={hour.counts} shape={activeShape} width={plotW} />
      )}

      <View style={styles.cycleRow}>
        <Text style={styles.cycleLabel}>Median cycle time</Text>
        <Text style={styles.cycleValue}>
          {cycleDays != null ? formatCycle(cycleDays) : "—"}
          <Text style={styles.cycleMeta}>
            {cycleDays != null ? "  added → done" : "  not enough data"}
          </Text>
        </Text>
      </View>
    </View>
  );
}

function ShapeButton({
  shape,
  active,
  label,
  onPress,
}: {
  shape: Shape;
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const Icon = shape === "bars" ? BarChartIcon : LineChartIcon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.shapeButton,
        active && styles.shapeButtonActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon
        color={active ? colors.textInverse : colors.textMuted}
        size={16}
        strokeWidth={1.9}
      />
    </Pressable>
  );
}

// ── Weekday ─────────────────────────────────────────────────────────────

function WeekdayChart({
  counts,
  shape,
  width,
}: {
  counts: number[];
  shape: Shape;
  width: number;
}) {
  const peak = counts.indexOf(Math.max(...counts));
  const label = `Completions by weekday. Most on ${WEEKDAY_LABELS[peak]}s, ${counts[peak]} completed.`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <View importantForAccessibility="no-hide-descendants">
        <MorphChart
          counts={counts}
          shape={shape}
          width={width}
          peak={peak}
          padTop={20}
          gap={spacing.sm}
          gradientId="weekdayArea"
        />
        <View style={styles.labelsRow}>
          {WEEKDAY_SHORT.map((day, i) => (
            <Text
              key={i}
              style={[styles.dayLabel, i === peak && counts[i] > 0 && styles.dayLabelPeak]}
            >
              {day}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Slot centres and the y of each count. The bars' tops ARE the line's points —
 * that identity is the whole reason the morph below is free. Points are inset by
 * half a slot so each one sits over its own label.
 */
function distribution(counts: number[], width: number, padTop: number, gap: number) {
  const max = Math.max(1, ...counts);
  const innerH = Math.max(1, CHART_H - padTop);
  const slot = width / counts.length;
  return {
    slot,
    barW: Math.max(2, slot - gap),
    xs: counts.map((_, i) => slot / 2 + i * slot),
    ys: counts.map((c) => padTop + innerH - (c / max) * innerH),
  };
}

/**
 * A distribution drawn as bars, as a line, or anywhere in between.
 *
 * Both metrics render through this one component. They used to be four —
 * WeekdayBars / CategoryCurve / HourBars / HourCurve — each owning its own
 * animation story, which is exactly how the hour bars ended up as plain Views
 * that never animated while the weekday bars grew. One component cannot
 * disagree with itself.
 *
 * Two shared values, both UI-thread:
 *  - `grow` — the entrance. Bars rise from the baseline; the line draws on.
 *  - `shapeT` — the bars↔line morph (0 = bars, 1 = line).
 *
 * The morph works because a bar's top and the line's point are the same y: the
 * bars narrow to 2px ticks and fade while the line draws through those exact
 * y's, so nothing moves vertically and the eye holds the shape while only the
 * encoding changes. The line's reveal is `strokeDashoffset` driven by
 * `shapeT * grow`, which covers both jobs with no second value — it draws on at
 * entrance, sweeps on a morph, and un-draws right-to-left going back to bars.
 */
function MorphChart({
  counts,
  shape,
  width,
  peak,
  padTop,
  gap,
  gradientId,
}: {
  counts: number[];
  shape: Shape;
  width: number;
  peak: number;
  padTop: number;
  gap: number;
  gradientId: string;
}) {
  const reducedMotion = useReducedMotion();
  const grow = useSharedValue(reducedMotion ? 1 : 0);
  const shapeT = useSharedValue(shape === "line" ? 1 : 0);

  const geom = useMemo(
    () => distribution(counts, Math.max(0, width), padTop, gap),
    [counts, width, padTop, gap],
  );
  const path = useMemo(() => {
    const pts: Pt[] = geom.xs.map((x, i) => ({ x, y: geom.ys[i] }));
    const line = monotoneLinePath(pts);
    return {
      line,
      area: areaPath(line, pts[0]?.x ?? 0, pts[pts.length - 1]?.x ?? 0, CHART_H),
      length: pathLengthUpperBound(pts),
    };
  }, [geom]);

  useEffect(() => {
    if (reducedMotion) {
      grow.value = 1;
      return;
    }
    grow.value = 0;
    grow.value = withTiming(1, {
      duration: motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [counts, reducedMotion, grow]);

  useEffect(() => {
    const target = shape === "line" ? 1 : 0;
    if (reducedMotion) {
      shapeT.value = target;
      return;
    }
    shapeT.value = withTiming(target, {
      duration: motion.duration.base,
      easing: Easing.inOut(Easing.quad),
    });
  }, [shape, reducedMotion, shapeT]);

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: path.length * (1 - shapeT.value * grow.value),
  }));
  const areaProps = useAnimatedProps(() => ({
    fillOpacity: shapeT.value * grow.value,
  }));
  const peakLabelStyle = useAnimatedStyle(() => ({ opacity: grow.value }));

  if (width <= 0) return <View style={{ height: CHART_H }} />;

  return (
    <View style={{ height: CHART_H, width }}>
      {counts.map((c, i) => (
        <MorphBar
          key={i}
          x={geom.xs[i]}
          y={geom.ys[i]}
          barW={geom.barW}
          hasValue={c > 0}
          grow={grow}
          shapeT={shapeT}
        />
      ))}

      <Svg
        width={width}
        height={CHART_H}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={chart.areaColor} stopOpacity={chart.areaTopOpacity} />
            <Stop offset="1" stopColor={chart.areaColor} stopOpacity={chart.areaBottomOpacity} />
          </LinearGradient>
        </Defs>
        <AnimatedPath d={path.area} fill={`url(#${gradientId})`} animatedProps={areaProps} />
        <AnimatedPath
          d={path.line}
          stroke={chart.line}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={path.length}
          animatedProps={lineProps}
        />
      </Svg>

      {counts[peak] > 0 ? (
        <Animated.Text
          style={[
            styles.barPeakLabel,
            { left: geom.xs[peak] - geom.slot / 2, top: geom.ys[peak] - 18, width: geom.slot },
            peakLabelStyle,
          ]}
        >
          {counts[peak]}
        </Animated.Text>
      ) : null}
    </View>
  );
}

function MorphBar({
  x,
  y,
  barW,
  hasValue,
  grow,
  shapeT,
}: {
  x: number;
  y: number;
  barW: number;
  hasValue: boolean;
  grow: SharedValue<number>;
  shapeT: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = shapeT.value;
    const w = barW + (2 - barW) * t;
    const full = CHART_H - y;
    return {
      left: x - w / 2,
      width: w,
      height: Math.max(hasValue ? 3 : 0, full * grow.value),
      opacity: 1 - t,
    };
  });
  return <Animated.View style={[styles.barFill, style]} />;
}

// ── Hour ────────────────────────────────────────────────────────────────

const HOUR_TICKS: Array<{ hour: number; label: string }> = [
  { hour: 0, label: "12a" },
  { hour: 6, label: "6a" },
  { hour: 12, label: "12p" },
  { hour: 18, label: "6p" },
  { hour: 23, label: "11p" },
];

function HourChart({
  counts,
  shape,
  width,
}: {
  counts: number[];
  shape: Shape;
  width: number;
}) {
  const peakHour = counts.indexOf(Math.max(...counts));
  const label = `Completions by hour. Peak around ${formatHour(peakHour)}.`;
  // Hours sit on slot centres (same geometry as the weekday chart), so a tick
  // lands under its own slot rather than on the plot edge.
  const slot = width > 0 ? width / counts.length : 0;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <View importantForAccessibility="no-hide-descendants">
        <MorphChart
          counts={counts}
          shape={shape}
          width={width}
          peak={peakHour}
          padTop={8}
          gap={2}
          gradientId="hourArea"
        />
        <View style={[styles.hourTicks, { width }]}>
          {HOUR_TICKS.map(({ hour, label: tick }) => (
            <Text
              key={hour}
              style={[
                styles.hourTick,
                // Centre on the slot, then keep the outermost ticks inside the plot.
                { left: Math.max(0, Math.min(width - 28, slot / 2 + hour * slot - 14)) },
              ]}
            >
              {tick}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    gap: spacing.md,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  segmented: {
    flex: 1,
    flexDirection: "row",
    gap: 2,
    padding: 2,
    borderRadius: radii.lg,
    backgroundColor: colors.bgInput,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textInverse,
    fontFamily: typography.title.fontFamily,
  },
  shapeToggle: {
    flexDirection: "row",
    gap: 2,
    padding: 2,
    borderRadius: radii.lg,
    backgroundColor: colors.bgInput,
  },
  shapeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  shapeButtonActive: {
    backgroundColor: colors.accent,
  },
  barFill: {
    position: "absolute",
    bottom: 0,
    backgroundColor: chart.bar,
    // Round the data end only — a bar is anchored to its baseline, and rounding
    // the foot lifts it off the axis so it reads as a floating lozenge.
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  barPeakLabel: {
    position: "absolute",
    textAlign: "center",
    ...typography.numeric,
    color: colors.textPrimary,
  },
  labelsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    ...typography.micro,
    color: colors.textMuted,
  },
  dayLabelPeak: {
    color: colors.accent,
    fontFamily: typography.title.fontFamily,
  },
  hourTicks: {
    height: 16,
    marginTop: spacing.sm,
  },
  hourTick: {
    position: "absolute",
    width: 28,
    textAlign: "center",
    ...typography.micro,
    color: colors.textMuted,
  },
  cycleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  cycleLabel: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  cycleValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  cycleMeta: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  miniEmpty: {
    height: CHART_H,
    justifyContent: "center",
  },
  miniEmptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
});
