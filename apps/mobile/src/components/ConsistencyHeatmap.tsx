/**
 * ConsistencyHeatmap
 *
 * All-time "journey" view, laid out the way GitHub's contribution graph is:
 * one column per week, one row per weekday, oldest week left. Month labels ride
 * above the columns where each month starts; the grid scrolls horizontally and
 * opens parked on today.
 *
 * Why the rewrite: the old layout was one row per month with 31 fixed columns,
 * which forced every cell to be ~8px on a phone — too small to read, far too
 * small to hit, and a column position that meant nothing (day-of-month aligns
 * down the grid, but nobody asks "how did I do on the 14th of each month?").
 * Weeks-as-columns makes a row mean "every Tuesday", which is a question people
 * actually have, and letting the card scroll buys the cells enough size to be
 * both legible and tappable.
 *
 * Craft (docs/research/progress-page-dataviz.md §2):
 *  - Single validated ordinal ramp (theme.chart.heatmapRamp), quantized into
 *    discrete buckets so intensity reads as levels, not noise.
 *  - Render-once: the cell array is memoized on [series]; we never animate
 *    individual cells. The whole surface fades in as one node.
 *  - Cells stop at today — a day that hasn't happened is not a day you missed,
 *    so the future is simply absent rather than drawn as an empty track.
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { haptic } from "../lib/haptic";
import { CalendarIcon, ClockIcon, StarIcon } from "./UiIcons";
import type { DayPoint } from "../lib/statsAggregators";
import { chart, colors, radii, spacing, typography } from "../theme/tokens";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Rows GitHub labels — every other row, so the labels never collide. */
const LABELLED_ROWS = [1, 3, 5];

const CELL = 18;
const GAP = 4;
const PITCH = CELL + GAP;
const ROWS = 7;
const LABEL_W = 30;
const MIN_WEEKS = 14;
const MONTH_LABEL_H = 16;

/** "2026-07-03" → "Fri · Jul 3" (local, locale-stable). */
function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const wd = WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
  return `${wd} · ${MONTH_LABELS[m - 1]} ${d}`;
}

/** "2026-07-03" → "Jul 3". */
function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return `${MONTH_LABELS[m - 1]} ${d}`;
}

type Props = {
  /** Contiguous, oldest→newest daily counts spanning the visible history. */
  series: DayPoint[];
  currentStreak: number;
  bestStreak: number;
};

type Cell = { x: number; y: number; fill: string; date: string; count: number };
type MonthTick = { key: string; label: string; x: number };

/** 0 → empty track; 1..4 buckets of increasing intensity. */
function rampColor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return chart.heatmapEmpty;
  const bucket = Math.min(3, Math.ceil((count / max) * 4) - 1); // 0..3
  return chart.heatmapRamp[bucket];
}

export function ConsistencyHeatmap({ series, currentStreak, bestStreak }: Props) {
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<{ date: string; count: number } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const selectCell = (cell: { date: string; count: number }) => {
    haptic.selection();
    // Re-tapping the open day closes it back to the legend.
    setSelected((prev) =>
      prev?.date === cell.date ? null : { date: cell.date, count: cell.count },
    );
  };

  const { cells, months, gridW, activeDays, lastActive } = useMemo(() => {
    if (series.length === 0) {
      return {
        cells: [] as Cell[],
        months: [] as MonthTick[],
        gridW: 0,
        activeDays: 0,
        lastActive: null as string | null,
      };
    }

    let max = 1;
    let active = 0;
    let last: string | null = null;
    for (const p of series) {
      if (p.count > 0) {
        active++;
        last = p.date;
        if (p.count > max) max = p.count;
      }
    }

    // Start at the first day with activity so a new user doesn't scroll through
    // a year of blanks, but never later than MIN_WEEKS ago so the grid always
    // has enough body to read as a calendar. The first column is partially
    // empty when that day isn't a Sunday, which is what GitHub does too.
    const firstActive = series.findIndex((p) => p.count > 0);
    const minStart = Math.max(0, series.length - MIN_WEEKS * 7);
    const startIdx = firstActive < 0 ? minStart : Math.min(firstActive, minStart);
    const visible = series.slice(startIdx);

    const [fy, fm, fd] = visible[0].date.split("-").map(Number);
    const firstDow = new Date(fy, fm - 1, fd).getDay();

    const cells: Cell[] = [];
    const months: MonthTick[] = [];
    let lastMonth = -1;

    visible.forEach((p, i) => {
      const slot = i + firstDow;
      const col = Math.floor(slot / 7);
      const row = slot % 7;
      const x = col * PITCH;
      cells.push({
        x,
        y: row * PITCH,
        fill: rampColor(p.count, max),
        date: p.date,
        count: p.count,
      });

      // Label a column the first time a new month appears in it.
      const month = Number(p.date.split("-")[1]);
      if (month !== lastMonth) {
        lastMonth = month;
        const alreadyOnColumn = months.length > 0 && months[months.length - 1].x === x;
        if (!alreadyOnColumn) {
          months.push({ key: p.date, label: MONTH_LABELS[month - 1], x });
        }
      }
    });

    const cols = Math.ceil((visible.length + firstDow) / 7);
    return {
      cells,
      months,
      gridW: cols * PITCH,
      activeDays: active,
      lastActive: last,
    };
  }, [series]);

  const gridH = ROWS * PITCH;

  return (
    <Animated.View
      style={styles.card}
      entering={reducedMotion ? undefined : FadeIn.duration(400)}
    >
      {cells.length === 0 ? (
        <Text style={styles.emptyText}>
          Your consistency calendar fills in as you complete tasks over the days ahead.
        </Text>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Consistency calendar. ${activeDays} active days, current streak ${currentStreak} days, best ${bestStreak} days.`}
        >
          <View style={styles.gridRow} importantForAccessibility="no-hide-descendants">
            {/* Fixed weekday gutter — stays put while the weeks scroll under it. */}
            <View style={[styles.gutter, { height: gridH, marginTop: MONTH_LABEL_H }]}>
              {LABELLED_ROWS.map((row) => (
                <Text key={row} style={[styles.gutterLabel, { top: row * PITCH + 3 }]}>
                  {WEEKDAY_LABELS[row]}
                </Text>
              ))}
            </View>

            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              // Open parked on today; the newest week is the one you came for.
              onContentSizeChange={() =>
                scrollRef.current?.scrollToEnd({ animated: false })
              }
              contentContainerStyle={{ paddingRight: spacing.xs }}
            >
              <View>
                <View style={{ height: MONTH_LABEL_H, width: gridW }}>
                  {months.map((m) => (
                    <Text key={m.key} style={[styles.monthLabel, { left: m.x }]}>
                      {m.label}
                    </Text>
                  ))}
                </View>
                <Svg width={Math.max(1, gridW)} height={gridH}>
                  {cells.map((c) => (
                    <Rect
                      key={c.date}
                      x={c.x}
                      y={c.y}
                      width={CELL}
                      height={CELL}
                      rx={4}
                      fill={c.fill}
                      stroke={selected?.date === c.date ? colors.accent : undefined}
                      strokeWidth={selected?.date === c.date ? 2 : 0}
                    />
                  ))}
                  {/* Transparent hit layer: the visible cell is 18px, but the
                      target covers the full pitch so a fingertip can land. */}
                  {cells.map((c) => (
                    <Rect
                      key={`hit-${c.date}`}
                      x={c.x - GAP / 2}
                      y={c.y - GAP / 2}
                      width={PITCH}
                      height={PITCH}
                      fill="transparent"
                      onPress={() => selectCell(c)}
                    />
                  ))}
                </Svg>
              </View>
            </ScrollView>
          </View>

          {selected ? (
            <Pressable
              onPress={() => setSelected(null)}
              accessibilityRole="button"
              accessibilityLabel={`${formatDayLabel(selected.date)}, ${selected.count} completed. Tap to dismiss.`}
              style={styles.detailRow}
            >
              <View style={[styles.detailDot, selected.count === 0 && styles.detailDotEmpty]} />
              <Text style={styles.detailDate}>{formatDayLabel(selected.date)}</Text>
              <Text style={styles.detailCount}>
                {selected.count === 0 ? "no completions" : `${selected.count} completed`}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.legendRow}>
              <Text style={styles.legendText}>Less</Text>
              <View style={[styles.legendCell, { backgroundColor: chart.heatmapEmpty }]} />
              {chart.heatmapRamp.map((c) => (
                <View key={c} style={[styles.legendCell, { backgroundColor: c }]} />
              ))}
              <Text style={styles.legendText}>More</Text>
            </View>
          )}
        </View>
      )}

      {/* Stats read as the summary of the calendar above them, not a scoreboard
          you're handed before you've seen the evidence. Active days leads: it's
          the figure that supports "every day you showed up". A zeroed streak
          becomes "last active", which states a fact instead of scolding. */}
      <View style={styles.statRow}>
        <JourneyStat
          label="Active days"
          value={String(activeDays)}
          icon={<CalendarIcon color={colors.accent} size={18} strokeWidth={1.75} />}
        />
        <View style={styles.statDivider} />
        <JourneyStat
          label="Best streak"
          value={`${bestStreak}d`}
          icon={<StarIcon color={colors.accent} size={18} strokeWidth={1.75} />}
        />
        <View style={styles.statDivider} />
        {currentStreak > 0 ? (
          <JourneyStat
            label="Current streak"
            value={`${currentStreak}d`}
            accent
            icon={<ClockIcon color={colors.accent} size={18} strokeWidth={1.75} />}
          />
        ) : (
          <JourneyStat
            label="Last active"
            value={lastActive ? formatShortDate(lastActive) : "—"}
            icon={<ClockIcon color={colors.textMuted} size={18} strokeWidth={1.75} />}
          />
        )}
      </View>
    </Animated.View>
  );
}

function JourneyStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <View style={styles.stat}>
      {icon ? <View style={styles.statIcon}>{icon}</View> : null}
      <View style={styles.statText}>
        <Text style={[styles.statValue, accent && { color: colors.accent }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingLeft: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    gap: spacing.sm,
    overflow: "hidden",
  },
  gridRow: {
    flexDirection: "row",
  },
  gutter: {
    width: LABEL_W,
    position: "relative",
  },
  gutterLabel: {
    position: "absolute",
    left: 0,
    ...typography.micro,
    fontSize: 10,
    letterSpacing: 0.3,
    color: colors.textMuted,
  },
  monthLabel: {
    position: "absolute",
    top: 0,
    ...typography.micro,
    fontSize: 10,
    letterSpacing: 0.3,
    color: colors.textMuted,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingRight: spacing.lg,
    minHeight: 36,
  },
  detailDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  detailDotEmpty: {
    backgroundColor: chart.heatmapEmpty,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  detailDate: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: typography.title.fontFamily,
  },
  detailCount: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginLeft: "auto",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    paddingTop: spacing.xs,
    paddingRight: spacing.lg,
    minHeight: 36,
  },
  legendText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  legendCell: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.md,
    paddingRight: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  stat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  statIcon: {
    opacity: 0.9,
  },
  statText: {
    alignItems: "flex-start",
    gap: 1,
  },
  statValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.bodyMd,
    fontSize: 12,
    color: colors.textMuted,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
  },
});
