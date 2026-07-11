/**
 * Progress screen.
 *
 * A reflective (not gamified) analytics page: a recent-momentum hero, an
 * all-time consistency journey, work-rhythm mini-charts, and goals in motion —
 * then a searchable completion-history modal. The filename stays `Insights`
 * for wiring compatibility; user-facing language is "Progress".
 *
 * Everything is derived on-device from the task list (already in memory) plus
 * the local goals stores. Charts render with react-native-svg + reanimated
 * only, so the whole screen stays OTA-updatable.
 */

import { useMemo, useState, type JSX } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { MobileTask } from "../components/TaskCard";
import { HeroVelocityChart } from "../components/HeroVelocityChart";
import { ConsistencyHeatmap } from "../components/ConsistencyHeatmap";
import { RhythmMiniCharts } from "../components/RhythmMiniCharts";
import { GoalsProgress } from "../components/GoalsProgress";
import { LedgerCheckIcon } from "../components/UiIcons";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useGoalLinks, useGoals } from "../hooks/useGoals";
import {
  completionsByDay,
  completionsByHour,
  completionsByWeekday,
  currentStreak,
  longestStreak,
  medianCycleTimeDays,
  rollingAverage,
} from "../lib/statsAggregators";
import { computeGoalProgress, goalsInMotion } from "../lib/goalProgress";
import { colors, radii, spacing, typography } from "../theme/tokens";

type HistoryWindow = "all" | "7d" | "30d";
type RangeKey = "7d" | "30d" | "90d";

type InsightsScreenProps = {
  tasks: MobileTask[];
  completedTasks: MobileTask[];
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  renderCompletedTaskItem: ({ item }: { item: MobileTask }) => JSX.Element;
};

const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };
const RANGE_LABELS: Record<RangeKey, string> = { "7d": "7d", "30d": "30d", "90d": "90d" };
const RANGE_PERIOD: Record<RangeKey, string> = {
  "7d": "this week",
  "30d": "this month",
  "90d": "this quarter",
};
const RANGE_COMPARISON: Record<RangeKey, string> = {
  "7d": "vs last week",
  "30d": "vs last month",
  "90d": "vs last quarter",
};
const JOURNEY_DAYS = 365;
const GOALS_SHOWN = 6;

const HISTORY_WINDOWS: Array<{ key: HistoryWindow; label: string; days?: number }> = [
  { key: "all", label: "All" },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
];

function completionTime(task: MobileTask): number {
  return task.completedAt ?? task.updatedAt;
}

function localDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function InsightsScreen({
  tasks,
  completedTasks,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  renderCompletedTaskItem,
}: InsightsScreenProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [historyVisible, setHistoryVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [window, setWindow] = useState<HistoryWindow>("all");
  const [range, setRange] = useState<RangeKey>("30d");
  const [now] = useState(() => Date.now());

  const { goals } = useGoals();
  const links = useGoalLinks();

  const windowDays = RANGE_DAYS[range];

  // ── Recent momentum (hero) ────────────────────────────────────────────
  const series = useMemo(
    () => completionsByDay(tasks, now, windowDays),
    [tasks, now, windowDays],
  );
  const rangeTotal = useMemo(() => series.reduce((s, p) => s + p.count, 0), [series]);
  // Daily completion data is spiky (bursts between zero-days); a light rolling
  // average turns it into a calm momentum curve. The headline stays the raw
  // sum — only the line's shape is smoothed.
  const heroSeries = useMemo(() => {
    // Odd, centered windows (radius 1/2/3): calmer at wider ranges without the
    // lag a trailing average would add. 30d was the busy one → radius 2.
    const w = range === "7d" ? 3 : range === "30d" ? 5 : 7;
    const avg = rollingAverage(series, w);
    return series.map((p, i) => ({ date: p.date, count: avg[i] }));
  }, [series, range]);
  const delta = useMemo(() => {
    // This window vs. the immediately preceding window of the same length.
    const prev = completionsByDay(tasks, now - windowDays * 86_400_000, windowDays);
    const lastPeriod = prev.reduce((s, p) => s + p.count, 0);
    const deltaPct = lastPeriod === 0 ? null : ((rangeTotal - lastPeriod) / lastPeriod) * 100;
    return { thisPeriod: rangeTotal, lastPeriod, deltaPct };
  }, [tasks, now, windowDays, rangeTotal]);

  // ── All-time journey (heatmap) ────────────────────────────────────────
  const journeySeries = useMemo(
    () => completionsByDay(tasks, now, JOURNEY_DAYS),
    [tasks, now],
  );
  const streak = useMemo(() => currentStreak(tasks, now), [tasks, now]);
  const best = useMemo(() => longestStreak(tasks), [tasks]);

  // ── Rhythm ────────────────────────────────────────────────────────────
  const weekday = useMemo(
    () => completionsByWeekday(tasks, now, windowDays),
    [tasks, now, windowDays],
  );
  const hour = useMemo(
    () => completionsByHour(tasks, now, windowDays),
    [tasks, now, windowDays],
  );
  const cycle = useMemo(
    () => medianCycleTimeDays(tasks, now, windowDays),
    [tasks, now, windowDays],
  );

  // ── Goals in motion ───────────────────────────────────────────────────
  const goalRows = useMemo(
    () => goalsInMotion(computeGoalProgress(goals, links, tasks)),
    [goals, links, tasks],
  );
  const todayKey = useMemo(() => localDateKey(now), [now]);

  // ── History modal ─────────────────────────────────────────────────────
  const orderedCompleted = useMemo(
    () => [...completedTasks].sort((a, b) => completionTime(b) - completionTime(a)),
    [completedTasks],
  );
  const historyTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const selected = HISTORY_WINDOWS.find((option) => option.key === window);
    const cutoff = selected?.days ? now - selected.days * 86_400_000 : null;
    return orderedCompleted.filter((task) => {
      if (cutoff !== null && completionTime(task) < cutoff) return false;
      if (!normalizedQuery) return true;
      return `${task.title} ${task.description ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [now, orderedCompleted, query, window]);

  const Wrap = reducedMotion ? View : Animated.View;
  const sectionEnter = (i: number) =>
    reducedMotion ? undefined : FadeInDown.duration(360).delay(60 * i);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
          gap: spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bgCard}
          />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.eyebrow}>Recent momentum</Text>
          <View style={styles.rangeRow}>
            {(Object.keys(RANGE_DAYS) as RangeKey[]).map((key) => {
              const active = range === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setRange(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show last ${RANGE_DAYS[key]} days`}
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
        </View>

        <Wrap entering={sectionEnter(0)}>
          <HeroVelocityChart
            series={heroSeries}
            rawCounts={series.map((p) => p.count)}
            total={rangeTotal}
            periodLabel={RANGE_PERIOD[range]}
            comparisonLabel={RANGE_COMPARISON[range]}
            delta={delta}
          />
        </Wrap>

        <Wrap entering={sectionEnter(1)}>
          <SectionHeader label="Journey" caption="Every day you showed up" />
          <ConsistencyHeatmap
            series={journeySeries}
            currentStreak={streak}
            bestStreak={best}
          />
        </Wrap>

        <Wrap entering={sectionEnter(2)}>
          <SectionHeader label="Rhythm" caption="When you do your best work" />
          <RhythmMiniCharts weekday={weekday} hour={hour} cycleDays={cycle} />
        </Wrap>

        {goalRows.length > 0 ? (
          <Wrap entering={sectionEnter(3)}>
            <SectionHeader
              label="Goals in motion"
              caption={`${goalRows.length} ${goalRows.length === 1 ? "goal" : "goals"} moving forward`}
            />
            <GoalsProgress
              rows={goalRows.slice(0, GOALS_SHOWN)}
              todayKey={todayKey}
              moreCount={Math.max(0, goalRows.length - GOALS_SHOWN)}
            />
          </Wrap>
        ) : null}

        {orderedCompleted.length > 0 ? (
          <Pressable
            onPress={() => setHistoryVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`View completion history, ${orderedCompleted.length} tasks`}
            style={({ pressed }) => [styles.historyButton, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.historyButtonText}>View completion history</Text>
            <Text style={styles.historyButtonMeta}>{orderedCompleted.length} →</Text>
          </Pressable>
        ) : null}

        {isLoading && orderedCompleted.length === 0 ? (
          <Text accessibilityLiveRegion="polite" style={styles.footerNote}>
            Loading your progress…
          </Text>
        ) : (
          <Text style={styles.footerNote}>
            Computed on device from your task history. No data leaves the phone.
          </Text>
        )}
      </ScrollView>

      <Modal
        visible={historyVisible}
        animationType={reducedMotion ? "none" : "slide"}
        presentationStyle="fullScreen"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={styles.historyRoot}>
          <View style={[styles.historyHeader, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable
              onPress={() => setHistoryVisible(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close completion history"
              style={({ pressed }) => [styles.closeAction, pressed && { opacity: 0.65 }]}
            >
              <Text style={styles.closeActionText}>Back</Text>
            </Pressable>
            <View style={styles.historyTitleBlock}>
              <Text style={styles.historyTitle}>Completion history</Text>
              <Text style={styles.historyCount}>
                {historyTasks.length} {historyTasks.length === 1 ? "Task" : "Tasks"}
              </Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.historyTools}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search completed Tasks"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search completed Tasks"
              returnKeyType="search"
              style={styles.searchInput}
            />
            <View style={styles.windowRow}>
              {HISTORY_WINDOWS.map((option) => {
                const active = window === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setWindow(option.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Show ${option.label} of completion history`}
                    style={({ pressed }) => [
                      styles.windowOption,
                      active && styles.windowOptionActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.windowText, active && styles.windowTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <FlatList
            data={historyTasks}
            keyExtractor={(item) => String(item._id)}
            renderItem={renderCompletedTaskItem}
            contentContainerStyle={{
              paddingTop: spacing.sm,
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <LedgerCheckIcon color={colors.textSecondary} size={28} />
                </View>
                <Text style={styles.emptyTitle}>No matching completed Tasks.</Text>
                <Text style={styles.emptyText}>Change the search or time window.</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

/** Editorial section header: an uppercase eyebrow left, a muted caption right. */
function SectionHeader({ label, caption }: { label: string; caption: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionEyebrow}>{label}</Text>
      <Text style={styles.sectionCaption} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerRow: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    ...typography.micro,
    color: colors.textMuted,
  },
  rangeRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  rangePill: {
    minWidth: 40,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: "center",
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  sectionEyebrow: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  sectionCaption: {
    ...typography.bodyMd,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: "right",
  },
  historyButton: {
    marginHorizontal: spacing.lg,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  historyButtonText: {
    ...typography.bodyLg,
    color: colors.textPrimary,
    fontFamily: typography.title.fontFamily,
  },
  historyButtonMeta: {
    ...typography.numeric,
    color: colors.accent,
  },
  footerNote: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  historyRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  historyHeader: {
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  closeAction: {
    minWidth: 56,
    minHeight: 44,
    justifyContent: "center",
  },
  closeActionText: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  historyTitleBlock: {
    flex: 1,
    alignItems: "center",
  },
  historyTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  historyCount: {
    ...typography.micro,
    color: colors.textMuted,
  },
  headerSpacer: {
    width: 56,
  },
  historyTools: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  searchInput: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bgInput,
    color: colors.textPrimary,
    ...typography.bodyLg,
  },
  windowRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  windowOption: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  windowOptionActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.borderFocus,
  },
  windowText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  windowTextActive: {
    color: colors.accent,
    fontFamily: typography.title.fontFamily,
  },
  emptyState: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.section,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
