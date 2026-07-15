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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { haptic } from "../lib/haptic";
import { BarChartIcon, LineChartIcon } from "./UiIcons";
import { areaPath, monotoneLinePath, type Pt } from "../lib/chartGeometry";
import { WEEKDAY_LABELS } from "../lib/statsAggregators";
import { chart, colors, motion, radii, spacing, typography } from "../theme/tokens";

/** Full width finally has room for real day names instead of "S M T W T F S". */
const WEEKDAY_SHORT = WEEKDAY_LABELS.map((l) => l.slice(0, 3));
const MIN_SAMPLE = 3;
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
  const max = Math.max(1, ...counts);
  const peak = counts.indexOf(Math.max(...counts));
  const label = `Completions by weekday. Most on ${WEEKDAY_LABELS[peak]}s, ${counts[peak]} completed.`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <View importantForAccessibility="no-hide-descendants">
        {shape === "bars" ? (
          <WeekdayBars counts={counts} max={max} peak={peak} />
        ) : (
          <CategoryCurve counts={counts} width={width} peak={peak} />
        )}
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

function WeekdayBars({
  counts,
  max,
  peak,
}: {
  counts: number[];
  max: number;
  peak: number;
}) {
  const reducedMotion = useReducedMotion();
  const grow = useSharedValue(reducedMotion ? 1 : 0);

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

  return (
    <View style={[styles.barsRow, { height: CHART_H }]}>
      {counts.map((c, i) => (
        <WeekdayBar
          key={i}
          count={c}
          fraction={c / max}
          grow={grow}
          isPeak={i === peak && c > 0}
        />
      ))}
    </View>
  );
}

function WeekdayBar({
  count,
  fraction,
  grow,
  isPeak,
}: {
  count: number;
  fraction: number;
  grow: SharedValue<number>;
  isPeak: boolean;
}) {
  // Leave headroom for the peak's count label so it never clips the card.
  const plotH = CHART_H - 18;
  const fillStyle = useAnimatedStyle(() => ({
    height: Math.max(fraction > 0 ? 3 : 0, plotH * fraction * grow.value),
  }));
  return (
    <View style={styles.barSlot}>
      {isPeak ? <Text style={styles.barPeakLabel}>{count}</Text> : null}
      <Animated.View
        style={[styles.barFill, fillStyle]}
      />
    </View>
  );
}

/**
 * The weekday series drawn as a line. Sunday→Monday gets a slope it hasn't
 * earned, but it's an explicit user choice — see the toggle note up top.
 */
function CategoryCurve({
  counts,
  width,
  peak,
}: {
  counts: number[];
  width: number;
  peak: number;
}) {
  const { line, area, dot } = useMemo(() => {
    const max = Math.max(1, ...counts);
    const padTop = 20;
    const innerH = Math.max(1, CHART_H - padTop);
    // Inset by half a slot so each point sits over its own day label.
    const slot = width / counts.length;
    const pts: Pt[] = counts.map((c, i) => ({
      x: slot / 2 + i * slot,
      y: padTop + innerH - (c / max) * innerH,
    }));
    const line = monotoneLinePath(pts);
    return {
      line,
      area: areaPath(line, pts[0].x, pts[pts.length - 1].x, CHART_H),
      dot: pts[peak],
    };
  }, [counts, width, peak]);

  if (width <= 0) return <View style={{ height: CHART_H }} />;

  return (
    <Svg width={width} height={CHART_H}>
      <Defs>
        <LinearGradient id="weekdayArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={chart.areaColor} stopOpacity={chart.areaTopOpacity} />
          <Stop offset="1" stopColor={chart.areaColor} stopOpacity={chart.areaBottomOpacity} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#weekdayArea)" />
      <Path
        d={line}
        stroke={chart.line}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d={`M ${dot.x} ${dot.y} l 0 0`}
        stroke={chart.line}
        strokeWidth={7}
        strokeLinecap="round"
      />
    </Svg>
  );
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

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <View importantForAccessibility="no-hide-descendants">
        {shape === "line" ? (
          <HourCurve counts={counts} width={width} />
        ) : (
          <HourBars counts={counts} />
        )}
        <View style={[styles.hourTicks, { width }]}>
          {HOUR_TICKS.map(({ hour, label: tick }) => (
            <Text
              key={hour}
              style={[
                styles.hourTick,
                // Pin the outer ticks to the ends; center the rest on their hour.
                hour === 0
                  ? { left: 0, textAlign: "left" }
                  : hour === 23
                    ? { right: 0, textAlign: "right" }
                    : { left: (hour / 23) * width - 14 },
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

function HourCurve({ counts, width }: { counts: number[]; width: number }) {
  const { line, area } = useMemo(() => {
    const max = Math.max(1, ...counts);
    const padTop = 8;
    const innerH = Math.max(1, CHART_H - padTop);
    const step = width / 23;
    const pts: Pt[] = counts.map((c, h) => ({
      x: h * step,
      y: padTop + innerH - (c / max) * innerH,
    }));
    const line = monotoneLinePath(pts);
    return { line, area: areaPath(line, 0, (counts.length - 1) * step, CHART_H) };
  }, [counts, width]);

  if (width <= 0) return <View style={{ height: CHART_H }} />;

  return (
    <Svg width={width} height={CHART_H}>
      <Defs>
        <LinearGradient id="hourArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={chart.areaColor} stopOpacity={chart.areaTopOpacity} />
          <Stop offset="1" stopColor={chart.areaColor} stopOpacity={chart.areaBottomOpacity} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#hourArea)" />
      <Path
        d={line}
        stroke={chart.line}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function HourBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <View style={[styles.hourBarsRow, { height: CHART_H }]}>
      {counts.map((c, h) => (
        <View
          key={h}
          style={[
            styles.hourBar,
            { height: Math.max(c > 0 ? 3 : 0, (CHART_H - 8) * (c / max)) },
          ]}
        />
      ))}
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
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  barSlot: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barFill: {
    width: "100%",
    backgroundColor: chart.bar,
    // Round the data end only — a bar is anchored to its baseline, and rounding
    // the foot lifts it off the axis so it reads as a floating lozenge.
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  barPeakLabel: {
    ...typography.numeric,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  hourBarsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  hourBar: {
    flex: 1,
    backgroundColor: chart.bar,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
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
