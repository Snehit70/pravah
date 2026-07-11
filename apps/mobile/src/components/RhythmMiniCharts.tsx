/**
 * RhythmMiniCharts
 *
 * The "when you work best" section: a weekday distribution (when you finish)
 * and a 24-hour focus curve (when you work), plus the median cycle-time stat.
 * Turns the single-winner aggregators (bestWeekday/peakHour) into full
 * distributions so the pattern is legible, not just asserted.
 *
 * Weekday bars are reanimated Views that grow from the baseline off one shared
 * value; the hour curve is an SVG monotone sparkline (same geometry as the
 * hero). Both degrade to a calm low-data line when the sample is too thin.
 */

import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { areaPath, monotoneLinePath, type Pt } from "../lib/chartGeometry";
import { WEEKDAY_LABELS } from "../lib/statsAggregators";
import { chart, colors, motion, radii, spacing, typography } from "../theme/tokens";

const WEEKDAY_LETTERS = WEEKDAY_LABELS.map((l) => l.charAt(0));
const MIN_SAMPLE = 3;
const CARD_PAD = spacing.md; // must match styles.card horizontal padding

type Props = {
  weekday: { counts: number[]; total: number };
  hour: { counts: number[]; total: number };
  cycleDays: number | null;
};

function formatCycle(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

export function RhythmMiniCharts({ weekday, hour, cycleDays }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  // `width` is the card's border-box (includes its spacing.md padding); the two
  // panels sit inside that padding with a spacing.lg gap between them.
  const panelW = width > 0 ? (width - CARD_PAD * 2 - spacing.lg) / 2 : 0;

  return (
    <View style={styles.card} onLayout={onLayout}>
      <View style={styles.panelsRow}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>When you finish</Text>
          {weekday.total >= MIN_SAMPLE ? (
            <WeekdayBars counts={weekday.counts} height={72} />
          ) : (
            <MiniEmpty />
          )}
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Focus by hour</Text>
          {hour.total >= MIN_SAMPLE && panelW > 0 ? (
            <HourCurve counts={hour.counts} width={panelW} height={72} />
          ) : (
            <MiniEmpty />
          )}
        </View>
      </View>

      <View style={styles.cycleRow}>
        <Text style={styles.cycleLabel}>Median cycle time</Text>
        <Text style={styles.cycleValue}>
          {cycleDays != null ? formatCycle(cycleDays) : "—"}
          <Text style={styles.cycleMeta}>{cycleDays != null ? "  added → done" : "  not enough data"}</Text>
        </Text>
      </View>
    </View>
  );
}

function WeekdayBars({ counts, height }: { counts: number[]; height: number }) {
  const reducedMotion = useReducedMotion();
  const max = Math.max(1, ...counts);
  const peak = counts.indexOf(Math.max(...counts));
  const labelH = 16;
  const plotH = height - labelH;

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
    <View
      style={{ height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Completions by weekday. Most on ${WEEKDAY_LABELS[peak]}s.`}
    >
      <View style={[styles.barsRow, { height: plotH }]} importantForAccessibility="no-hide-descendants">
        {counts.map((c, i) => (
          <WeekdayBar
            key={i}
            fraction={c / max}
            plotH={plotH}
            grow={grow}
            isPeak={i === peak && c > 0}
          />
        ))}
      </View>
      <View style={styles.labelsRow}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          <Text key={i} style={[styles.dayLabel, i === peak && counts[i] > 0 && styles.dayLabelPeak]}>
            {letter}
          </Text>
        ))}
      </View>
    </View>
  );
}

function WeekdayBar({
  fraction,
  plotH,
  grow,
  isPeak,
}: {
  fraction: number;
  plotH: number;
  grow: SharedValue<number>;
  isPeak: boolean;
}) {
  const fillStyle = useAnimatedStyle(() => ({
    height: Math.max(fraction > 0 ? 3 : 0, plotH * fraction * grow.value),
  }));
  return (
    <View style={styles.barSlot}>
      <View style={[styles.barTrack, { height: plotH }]} />
      <Animated.View
        style={[
          styles.barFill,
          // Peak at full strength; non-peak bars stay clearly legible (0.55)
          // so the whole weekday distribution reads, not just the winner.
          { backgroundColor: chart.bar, opacity: isPeak ? 1 : 0.55 },
          fillStyle,
        ]}
      />
    </View>
  );
}

const HOUR_TICKS: Array<{ hour: number; label: string }> = [
  { hour: 6, label: "6a" },
  { hour: 12, label: "12p" },
  { hour: 18, label: "6p" },
];

function HourCurve({ counts, width, height }: { counts: number[]; width: number; height: number }) {
  const { line, area } = useMemo(() => {
    const max = Math.max(1, ...counts);
    const padTop = 8;
    const padBottom = 14;
    const innerH = Math.max(1, height - padTop - padBottom);
    const step = width / 23;
    const pts: Pt[] = counts.map((c, h) => ({
      x: h * step,
      y: padTop + innerH - (c / max) * innerH,
    }));
    const line = monotoneLinePath(pts);
    return { line, area: areaPath(line, 0, (counts.length - 1) * step, height - padBottom) };
  }, [counts, width, height]);

  const peakHour = counts.indexOf(Math.max(...counts));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Completions by hour. Peak around ${formatHour(peakHour)}.`}
    >
      <View importantForAccessibility="no-hide-descendants">
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="hourArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={chart.areaTop} stopOpacity="1" />
              <Stop offset="1" stopColor={chart.areaBottom} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#hourArea)" />
          <Path
            d={line}
            stroke={chart.line}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
        <View style={[styles.hourTicks, { width }]}>
          {HOUR_TICKS.map(({ hour, label }) => (
            <Text
              key={hour}
              style={[styles.hourTick, { left: (hour / 23) * width - 12 }]}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function MiniEmpty() {
  return (
    <View style={styles.miniEmpty}>
      <Text style={styles.miniEmptyText}>A few more completions and this fills in.</Text>
    </View>
  );
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    gap: spacing.md,
  },
  panelsRow: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  panel: {
    flex: 1,
    gap: spacing.sm,
  },
  panelTitle: {
    ...typography.micro,
    color: colors.textMuted,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  barSlot: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barTrack: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    borderRadius: radii.sm,
    backgroundColor: chart.grid,
    opacity: 0.5,
  },
  barFill: {
    width: "100%",
    borderRadius: radii.sm,
  },
  labelsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontFamily: typography.micro.fontFamily,
    fontSize: 10,
    color: colors.textMuted,
  },
  dayLabelPeak: {
    color: colors.accent,
  },
  hourTicks: {
    height: 12,
    marginTop: -12,
  },
  hourTick: {
    position: "absolute",
    width: 24,
    textAlign: "center",
    fontFamily: typography.micro.fontFamily,
    fontSize: 10,
    color: colors.textMuted,
  },
  cycleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
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
    ...typography.micro,
    color: colors.textMuted,
  },
  miniEmpty: {
    height: 72,
    justifyContent: "center",
  },
  miniEmptyText: {
    ...typography.micro,
    color: colors.textMuted,
    lineHeight: 15,
  },
});
