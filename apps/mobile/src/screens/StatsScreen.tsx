/**
 * StatsScreen
 *
 * On-device insights derived from the user's task list. v1 ships a KPI strip
 * (streak, 7d done, overdue, inbox) and a completion-velocity line chart
 * with a 7d/30d/90d range toggle. Future passes will add a heatmap and a
 * cycle-time chart — the aggregator lib is structured to make those drop-in.
 */

import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { MobileTask } from "../components/TaskCard";
import { CompletionLineChart } from "../components/CompletionLineChart";
import {
  completionsByDay,
  kpis,
  rollingAverage,
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

export function StatsScreen({ tasks, tabBarHeight }: StatsScreenProps) {
  const [range, setRange] = useState<RangeKey>("30d");
  const now = useMemo(() => Date.now(), []);

  const k = useMemo(() => kpis(tasks, now), [tasks, now]);
  const series = useMemo(
    () => completionsByDay(tasks, now, RANGE_DAYS[range]),
    [tasks, now, range],
  );
  // Rolling window: smaller windows feel choppy if smoothed too hard, so
  // scale the average window to the range — 3d for 7d, 7d for 30d, 14d for 90d.
  const avgWindow = range === "7d" ? 3 : range === "30d" ? 7 : 14;
  const avg = useMemo(() => rollingAverage(series, avgWindow), [series, avgWindow]);

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
    borderRadius: radii.full,
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
  footerNote: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
