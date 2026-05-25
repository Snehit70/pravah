/**
 * StatsScreen
 *
 * On-device insights derived from the user's task list. Renders a KPI strip
 * (streak, 7d done, overdue, inbox), a completion-velocity line chart with
 * a 7d/30d/90d range toggle, then deeper inferred panels:
 *
 *   - Highlights: best weekday, peak hour, median cycle, longest streak
 *   - Workload: active task counts sliced by priority + lane
 *   - This week: completion delta vs the prior 7d window
 *
 * All aggregations are pure functions in lib/statsAggregators; this screen
 * is just memoization + layout.
 */

import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { MobileTask } from "../components/TaskCard";
import { CompletionLineChart } from "../components/CompletionLineChart";
import {
  activeBreakdown,
  bestWeekday,
  completionsByDay,
  kpis,
  longestStreak,
  medianCycleTimeDays,
  peakHour,
  rollingAverage,
  weekOverWeek,
} from "../lib/statsAggregators";
import { colors, radii, spacing, typography } from "../theme/tokens";

type StatsScreenProps = {
  tasks: MobileTask[];
  tabBarHeight: number;
};

type RangeKey = "7d" | "30d" | "90d";
const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };
const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

const WEEKDAY_FULL: Record<string, string> = {
  Sun: "Sundays",
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
};

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function formatCycle(days: number): string {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

export function StatsScreen({ tasks, tabBarHeight }: StatsScreenProps) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  const windowDays = RANGE_DAYS[range];

  const k = useMemo(() => kpis(tasks, now), [tasks, now]);
  const series = useMemo(
    () => completionsByDay(tasks, now, windowDays),
    [tasks, now, windowDays],
  );
  // Rolling window: smaller windows feel choppy if smoothed too hard, so
  // scale the average window to the range — 3d for 7d, 7d for 30d, 14d for 90d.
  const avgWindow = range === "7d" ? 3 : range === "30d" ? 7 : 14;
  const avg = useMemo(() => rollingAverage(series, avgWindow), [series, avgWindow]);

  const bestDay = useMemo(() => bestWeekday(tasks, now, windowDays), [tasks, now, windowDays]);
  const peak = useMemo(() => peakHour(tasks, now, windowDays), [tasks, now, windowDays]);
  const cycle = useMemo(
    () => medianCycleTimeDays(tasks, now, windowDays),
    [tasks, now, windowDays],
  );
  const longest = useMemo(() => longestStreak(tasks), [tasks]);
  const workload = useMemo(() => activeBreakdown(tasks), [tasks]);
  const wow = useMemo(() => weekOverWeek(tasks, now), [tasks, now]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + 84,
        gap: spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeIn.duration(300)} style={styles.kpiRow}>
        <KpiTile label="Streak" value={`${k.streak}d`} accent={k.streak > 0} />
        <KpiTile label="7d done" value={String(k.completed7d)} />
        <KpiTile label="Overdue" value={String(k.overdue)} warn={k.overdue > 0} />
        <KpiTile label="Inbox" value={String(k.inbox)} />
      </Animated.View>

      <View style={styles.rangeRow}>
        {(Object.keys(RANGE_DAYS) as RangeKey[]).map((key) => {
          const active = range === key;
          return (
            <Pressable
              key={key}
              onPress={() => setRange(key)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${RANGE_LABELS[key]}`}
              hitSlop={8}
              style={({ pressed }) => [
                styles.rangePill,
                active && styles.rangePillActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.rangeText, active && styles.rangeTextActive]}>
                {RANGE_LABELS[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CompletionLineChart series={series} rollingAvg={avg} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Highlights</Text>
        <Text style={styles.sectionSub}>Patterns from your last {RANGE_LABELS[range]}</Text>
        <View style={styles.highlightGrid}>
          <HighlightTile
            caption="Most productive day"
            value={bestDay ? WEEKDAY_FULL[bestDay.label] ?? bestDay.label : "—"}
            detail={bestDay ? `${bestDay.count} done` : "Not enough data"}
          />
          <HighlightTile
            caption="Peak hour"
            value={peak ? formatHour(peak.hour) : "—"}
            detail={peak ? `${peak.count} done` : "Not enough data"}
          />
          <HighlightTile
            caption="Median cycle time"
            value={cycle != null ? formatCycle(cycle) : "—"}
            detail={cycle != null ? "From added to done" : "Not enough data"}
          />
          <HighlightTile
            caption="Longest streak"
            value={`${longest}d`}
            detail={longest === k.streak && longest > 0 ? "Current — keep going" : "All time"}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Workload</Text>
        <Text style={styles.sectionSub}>
          {workload.totalActive} active {workload.totalActive === 1 ? "task" : "tasks"}
        </Text>

        {workload.totalActive > 0 ? (
          <PriorityBar
            p1={workload.p1}
            p2={workload.p2}
            p3={workload.p3}
            unprioritized={workload.unprioritized}
          />
        ) : (
          <Text style={styles.emptyHint}>Inbox is clear. Capture something new from the home screen.</Text>
        )}

        <View style={styles.workloadRow}>
          <WorkloadStat label="P1" value={workload.p1} tint="#e87a90" />
          <WorkloadStat label="P2" value={workload.p2} tint="#d3a04b" />
          <WorkloadStat label="P3" value={workload.p3} tint="#4ec9b0" />
          <WorkloadStat label="None" value={workload.unprioritized} tint={colors.textMuted} />
        </View>

        <View style={styles.laneRow}>
          <LaneStat label="Scheduled" value={workload.scheduled} />
          <View style={styles.laneDivider} />
          <LaneStat label="Inbox" value={workload.inbox} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This week vs last</Text>
        <View style={styles.wowRow}>
          <View style={styles.wowSide}>
            <Text style={styles.wowValue}>{wow.thisWeek}</Text>
            <Text style={styles.wowCaption}>This week</Text>
          </View>
          <DeltaBadge thisWeek={wow.thisWeek} lastWeek={wow.lastWeek} deltaPct={wow.deltaPct} />
          <View style={styles.wowSide}>
            <Text style={[styles.wowValue, styles.wowValueMuted]}>{wow.lastWeek}</Text>
            <Text style={styles.wowCaption}>Last week</Text>
          </View>
        </View>
      </View>

      <Text style={styles.footerNote}>
        Computed on device from your task history. No data leaves the phone.
      </Text>
    </ScrollView>
  );
}

type KpiTileProps = {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
};

function KpiTile({ label, value, accent, warn }: KpiTileProps) {
  const valueColor = warn ? colors.error : accent ? colors.accent : colors.textPrimary;
  return (
    <View style={styles.kpiTile}>
      <Text style={[styles.kpiValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function HighlightTile({
  caption,
  value,
  detail,
}: {
  caption: string;
  value: string;
  detail: string;
}) {
  return (
    <View style={styles.highlightTile}>
      <Text style={styles.highlightCaption}>{caption}</Text>
      <Text style={styles.highlightValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.highlightDetail}>{detail}</Text>
    </View>
  );
}

function PriorityBar({
  p1,
  p2,
  p3,
  unprioritized,
}: {
  p1: number;
  p2: number;
  p3: number;
  unprioritized: number;
}) {
  const total = p1 + p2 + p3 + unprioritized;
  if (total === 0) return null;
  const segments: Array<{ key: string; flex: number; color: string }> = [
    { key: "p1", flex: p1, color: "#e87a90" },
    { key: "p2", flex: p2, color: "#d3a04b" },
    { key: "p3", flex: p3, color: "#4ec9b0" },
    { key: "none", flex: unprioritized, color: colors.borderSubtle },
  ].filter((s) => s.flex > 0);
  return (
    <View style={styles.priorityBar}>
      {segments.map((s, i) => (
        <View
          key={s.key}
          style={[
            styles.priorityBarSegment,
            { flex: s.flex, backgroundColor: s.color },
            i === 0 && styles.priorityBarSegmentFirst,
            i === segments.length - 1 && styles.priorityBarSegmentLast,
          ]}
        />
      ))}
    </View>
  );
}

function WorkloadStat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <View style={styles.workloadStat}>
      <View style={styles.workloadDotRow}>
        <View style={[styles.workloadDot, { backgroundColor: tint }]} />
        <Text style={styles.workloadLabel}>{label}</Text>
      </View>
      <Text style={styles.workloadValue}>{value}</Text>
    </View>
  );
}

function LaneStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.laneStat}>
      <Text style={styles.laneValue}>{value}</Text>
      <Text style={styles.laneLabel}>{label}</Text>
    </View>
  );
}

function DeltaBadge({
  thisWeek,
  lastWeek,
  deltaPct,
}: {
  thisWeek: number;
  lastWeek: number;
  deltaPct: number | null;
}) {
  let label: string;
  let tint: string;
  if (lastWeek === 0 && thisWeek === 0) {
    label = "Even";
    tint = colors.textMuted;
  } else if (deltaPct == null) {
    label = `+${thisWeek}`;
    tint = colors.success;
  } else if (Math.abs(deltaPct) < 1) {
    label = "Even";
    tint = colors.textMuted;
  } else if (deltaPct > 0) {
    label = `↑ ${Math.round(deltaPct)}%`;
    tint = colors.success;
  } else {
    label = `↓ ${Math.round(Math.abs(deltaPct))}%`;
    tint = colors.error;
  }
  return (
    <View style={styles.deltaBadge}>
      <Text style={[styles.deltaText, { color: tint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  kpiTile: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: "center",
    gap: 2,
  },
  kpiValue: {
    ...typography.headline,
  },
  kpiLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  rangeRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  rangePill: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  rangePillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  rangeText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  rangeTextActive: {
    color: colors.accent,
  },
  section: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  sectionSub: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  highlightGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  highlightTile: {
    flexBasis: "48%",
    flexGrow: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCardGlass,
    gap: 4,
  },
  highlightCaption: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  highlightValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  highlightDetail: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  priorityBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: colors.bgCard,
    marginTop: spacing.xs,
  },
  priorityBarSegment: {
    height: "100%",
  },
  priorityBarSegmentFirst: {
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  priorityBarSegmentLast: {
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  workloadRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  workloadStat: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    gap: 4,
  },
  workloadDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  workloadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  workloadLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  workloadValue: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  laneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgCardGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  laneStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  laneValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  laneLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  laneDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.borderSubtle,
  },
  emptyHint: {
    ...typography.micro,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  wowRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgCardGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    gap: spacing.md,
  },
  wowSide: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  wowValue: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  wowValueMuted: {
    color: colors.textMuted,
  },
  wowCaption: {
    ...typography.micro,
    color: colors.textMuted,
  },
  deltaBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  deltaText: {
    ...typography.micro,
    fontWeight: "700",
  },
  footerNote: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
