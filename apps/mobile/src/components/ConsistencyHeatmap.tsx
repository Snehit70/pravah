/**
 * ConsistencyHeatmap
 *
 * All-time "journey" view: one row per calendar month, days laid left→right,
 * each cell tinted by that day's completion count. Reads like a diary of
 * consistency — where the gaps are, where the runs are.
 *
 * Craft (docs/research/progress-page-dataviz.md §2):
 *  - Single validated ordinal ramp (theme.chart.heatmapRamp), quantized into
 *    discrete buckets so intensity reads as levels, not noise.
 *  - Render-once: the cell array is memoized on [series, width]; we never
 *    animate individual cells. The whole surface fades in as one node.
 *  - 31 fixed columns so day-1 aligns down every month.
 *
 * Phase 2 will add per-cell tap → "Jul 3 · 4 done" detail; the geometry here
 * already carries each cell's date + count for that.
 */

import { useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { DayPoint } from "../lib/statsAggregators";
import { chart, colors, radii, spacing, typography } from "../theme/tokens";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const COLS = 31;
const MIN_MONTHS = 4;
const LABEL_W = 34;
const GAP = 2;
const ROW_GAP = 5;
const CARD_PAD = spacing.md; // must match styles.card horizontal padding

type Props = {
  /** Contiguous, oldest→newest daily counts spanning the visible history. */
  series: DayPoint[];
  currentStreak: number;
  bestStreak: number;
};

type Cell = { x: number; y: number; size: number; fill: string; date: string; count: number };

/** 0 → empty track; 1..4 buckets of increasing accent intensity. */
function rampColor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return chart.heatmapEmpty;
  const bucket = Math.min(3, Math.ceil((count / max) * 4) - 1); // 0..3
  return chart.heatmapRamp[bucket];
}

export function ConsistencyHeatmap({ series, currentStreak, bestStreak }: Props) {
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const { rows, activeDays, gridW, size } = useMemo(() => {
    const counts = new Map<string, number>();
    let active = 0;
    let max = 1;
    for (const p of series) {
      counts.set(p.date, p.count);
      if (p.count > 0) active++;
      if (p.count > max) max = p.count;
    }
    if (series.length === 0 || width === 0) {
      return {
        rows: [] as Array<{ key: string; label: string; cells: Cell[] }>,
        activeDays: 0,
        gridW: 0,
        size: 10,
      };
    }

    // `width` is the card's border-box (includes its horizontal padding), so
    // subtract both the padding and the month label before laying out columns —
    // otherwise the rightmost cells overflow the card's rounded edge.
    const gridW = width - CARD_PAD * 2 - LABEL_W;
    const step = gridW / COLS;
    const size = Math.max(4, step - GAP);

    // Months present, newest first.
    const firstDate = series[0].date;
    const lastDate = series[series.length - 1].date;
    const [fy, fm] = firstDate.split("-").map(Number);
    const [ly, lm] = lastDate.split("-").map(Number);
    const monthsAsc: Array<{ y: number; m: number }> = [];
    for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); ) {
      monthsAsc.push({ y, m });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }

    const allRows = monthsAsc
      .slice()
      .reverse()
      .map(({ y, m }) => {
        const daysInMonth = new Date(y, m, 0).getDate();
        const cells: Cell[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
          const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const count = counts.get(key) ?? 0;
          cells.push({
            x: (d - 1) * step,
            y: 0,
            size,
            fill: rampColor(count, max),
            date: key,
            count,
          });
        }
        return { key: `${y}-${m}`, label: MONTH_LABELS[m - 1], cells };
      });

    // Rows are newest→oldest; drop the run of all-empty oldest months so the
    // calendar starts near the first day of activity instead of trailing off
    // into a wall of blank months. Keep a minimum span for visual weight.
    let lastActive = allRows.length - 1;
    while (lastActive > 0 && allRows[lastActive].cells.every((c) => c.count === 0)) {
      lastActive--;
    }
    const rows = allRows.slice(0, Math.max(MIN_MONTHS, lastActive + 1));

    return { rows, activeDays: active, gridW, size };
  }, [series, width]);

  const rowSize = size;

  return (
    <Animated.View
      style={styles.card}
      onLayout={onLayout}
      entering={reducedMotion ? undefined : FadeIn.duration(400)}
    >
      <View style={styles.statRow}>
        <JourneyStat label="Current" value={`${currentStreak}d`} accent={currentStreak > 0} />
        <View style={styles.statDivider} />
        <JourneyStat label="Best" value={`${bestStreak}d`} />
        <View style={styles.statDivider} />
        <JourneyStat label="Active days" value={String(activeDays)} />
      </View>

      {rows.length === 0 ? (
        <Text style={styles.emptyText}>
          Your consistency calendar fills in as you complete tasks over the days ahead.
        </Text>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Consistency calendar. ${activeDays} active days, current streak ${currentStreak} days, best ${bestStreak} days.`}
        >
          {rows.map((row) => (
            <View key={row.key} style={styles.monthRow} importantForAccessibility="no-hide-descendants">
              <Text style={styles.monthLabel}>{row.label}</Text>
              <Svg width={Math.max(1, gridW)} height={rowSize}>
                {row.cells.map((c) => (
                  <Rect
                    key={c.date}
                    x={c.x}
                    y={0}
                    width={c.size}
                    height={c.size}
                    rx={2}
                    fill={c.fill}
                  />
                ))}
              </Svg>
            </View>
          ))}

          <View style={styles.legendRow}>
            <Text style={styles.legendText}>Less</Text>
            <View style={[styles.legendCell, { backgroundColor: chart.heatmapEmpty }]} />
            {chart.heatmapRamp.map((c) => (
              <View key={c} style={[styles.legendCell, { backgroundColor: c }]} />
            ))}
            <Text style={styles.legendText}>More</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

function JourneyStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: spacing.xs,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: ROW_GAP,
  },
  monthLabel: {
    ...typography.micro,
    color: colors.textMuted,
    width: LABEL_W,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    paddingTop: spacing.xs,
  },
  legendText: {
    ...typography.micro,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  legendCell: {
    width: 11,
    height: 11,
    borderRadius: 2,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
});
