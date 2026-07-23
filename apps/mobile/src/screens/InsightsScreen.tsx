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

import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import {
  AppState,
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
import { SlidingSegmented, type SegmentedItem } from "../components/SlidingSegmented";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LedgerCheckIcon,
  SearchIcon,
} from "../components/UiIcons";
import CompletionHistoryIcon from "../assets/icons/completion-history.svg";
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
import { createThemedStyles } from "../theme/themeRuntime";

type HistoryWindow = "today" | "yesterday" | "7d" | "30d" | "all";
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
// The window is a rolling N days ending today, not a calendar period — the
// hero's own axis reads "16 Jun → 15 Jul" while the old copy said "this month".
// Say what the data actually is.
const RANGE_PERIOD: Record<RangeKey, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};
const RANGE_COMPARISON: Record<RangeKey, string> = {
  "7d": "vs previous 7 days",
  "30d": "vs previous 30 days",
  "90d": "vs previous 90 days",
};
const GOALS_SHOWN = 6;

const HISTORY_WINDOWS: Array<SegmentedItem<HistoryWindow>> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
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
  const [window, setWindow] = useState<HistoryWindow>("7d");
  const [range, setRange] = useState<RangeKey>("30d");
  // The anchor every aggregation window hangs off. Re-anchored on foreground
  // and pull-to-refresh so a screen kept mounted across midnight doesn't keep
  // reporting ranges that end on yesterday.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

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
    // lag a trailing average would add. The kernel is triangular, so a wider
    // range buys smoothness without the shelves a boxcar leaves behind.
    const w = range === "7d" ? 3 : range === "30d" ? 5 : 7;
    const avg = rollingAverage(series, w);
    return series.map((p, i) => ({ date: p.date, count: avg[i] }));
  }, [series, range]);
  const delta = useMemo(() => {
    // This window vs. the immediately preceding window of the same length.
    const previousPeriodEnd = new Date(now);
    previousPeriodEnd.setDate(previousPeriodEnd.getDate() - windowDays);
    const prev = completionsByDay(tasks, previousPeriodEnd.getTime(), windowDays);
    const lastPeriod = prev.reduce((s, p) => s + p.count, 0);
    const deltaPct = lastPeriod === 0 ? null : ((rangeTotal - lastPeriod) / lastPeriod) * 100;
    return { thisPeriod: rangeTotal, lastPeriod, deltaPct };
  }, [tasks, now, windowDays, rangeTotal]);

  // ── All-time journey (heatmap) ────────────────────────────────────────
  const journeyDays = useMemo(() => {
    const earliestCompletion = tasks.reduce<number | null>((earliest, task) => {
      if (task.completedAt === undefined || task.completedAt > now) return earliest;
      return earliest === null ? task.completedAt : Math.min(earliest, task.completedAt);
    }, null);
    if (earliestCompletion === null) return 1;
    const first = new Date(earliestCompletion);
    const today = new Date(now);
    const firstDay = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
    const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.floor((todayDay - firstDay) / 86_400_000) + 1;
  }, [tasks, now]);
  const journeySeries = useMemo(
    () => completionsByDay(tasks, now, journeyDays),
    [tasks, now, journeyDays],
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
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    let start: number | null = null;
    let end: number | null = null;
    if (window === "today") {
      start = startOfToday.getTime();
    } else if (window === "yesterday") {
      end = startOfToday.getTime();
      startOfToday.setDate(startOfToday.getDate() - 1);
      start = startOfToday.getTime();
    } else if (window === "7d") {
      start = now - 7 * 86_400_000;
    } else if (window === "30d") {
      start = now - 30 * 86_400_000;
    }
    return orderedCompleted.filter((task) => {
      const completedAt = completionTime(task);
      if (start !== null && completedAt < start) return false;
      if (end !== null && completedAt >= end) return false;
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
          // tokens.ts documents `section` as the gap between major sections, and
          // these are the major sections; `lg` packed them at half that density.
          gap: spacing.section,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setNow(Date.now());
              void onRefresh();
            }}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bgCard}
          />
        }
      >
        <Wrap>
          <SectionHeader
            label="Recent momentum"
            right={
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
            }
          />

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
        </Wrap>

        <Wrap entering={sectionEnter(1)}>
          <SectionHeader label="Rhythm" caption="When you do your best work" />
          <RhythmMiniCharts weekday={weekday} hour={hour} cycleDays={cycle} />
        </Wrap>

        <Wrap entering={sectionEnter(2)}>
          <SectionHeader label="Journey" caption="Every day you showed up" />
          <ConsistencyHeatmap
            series={journeySeries}
            currentStreak={streak}
            bestStreak={best}
          />
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
          <Wrap entering={sectionEnter(4)}>
            <SectionHeader label="Task history" />
            <Pressable
              onPress={() => setHistoryVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`View completion history, ${orderedCompleted.length} tasks`}
              style={({ pressed }) => [styles.historyButton, pressed && { opacity: 0.72 }]}
            >
              <View style={styles.historyButtonIcon}>
                <CompletionHistoryIcon
                  width={20}
                  height={20}
                  color={colors.textSecondary}
                />
              </View>
              <View style={styles.historyButtonCopy}>
                <Text style={styles.historyButtonText}>View completion history</Text>
                <Text style={styles.historyButtonSummary}>Browse completed tasks</Text>
              </View>
              <View style={styles.historyButtonMeta}>
                <Text style={styles.historyButtonCount}>{orderedCompleted.length}</Text>
                <ChevronRightIcon color={colors.textDim} size={16} />
              </View>
            </Pressable>
          </Wrap>
        ) : null}

        {isLoading && orderedCompleted.length === 0 ? (
          <Text accessibilityLiveRegion="polite" style={styles.footerNote}>
            Loading your progress…
          </Text>
        ) : null}
      </ScrollView>

      <Modal
        visible={historyVisible}
        animationType={reducedMotion ? "none" : "slide"}
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={styles.historyRoot}>
          <View style={[styles.historyHeader, { paddingTop: insets.top + spacing.sm }]}>
            <Pressable
              onPress={() => setHistoryVisible(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.closeAction, pressed && { opacity: 0.65 }]}
            >
              <ChevronLeftIcon color={colors.textPrimary} size={20} />
            </Pressable>
            <View style={styles.historyTitleBlock}>
              <View style={styles.historyTitleRow}>
                <CompletionHistoryIcon
                  width={22}
                  height={22}
                  color={colors.textSecondary}
                />
                <Text style={styles.historyTitle}>Completion history</Text>
              </View>
              <Text style={styles.historyCount}>
                {historyTasks.length} {historyTasks.length === 1 ? "Task" : "Tasks"}
              </Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.historyTools}>
            <View style={styles.searchField}>
              <SearchIcon color={colors.textMuted} size={16} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search completed Tasks"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Search completed Tasks"
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
                style={styles.searchInput}
              />
            </View>
            <SlidingSegmented
              options={HISTORY_WINDOWS}
              value={window}
              onSelect={setWindow}
            />
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

/**
 * Section header: an uppercase eyebrow with its caption stacked beneath it.
 *
 * The caption used to sit right-aligned on the same line under
 * `numberOfLines={1}`, which truncated the warmest writing on the screen
 * ("Every day you sho…") on narrow devices. Stacked, it has the full width.
 * `right` takes a node for headers that carry a control instead of prose.
 */
function SectionHeader({
  label,
  caption,
  right,
}: {
  label: string;
  caption?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionEyebrow}>{label}</Text>
        {right}
      </View>
      {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
    </View>
  );
}

const styles = createThemedStyles({
  root: {
    flex: 1,
  },
  rangeRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  rangePill: {
    minWidth: 44,
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: "center",
  },
  // Inverted, not washed. `accentSoft` over `bgCard` rendered the selected pill
  // duller than its unselected neighbours, which reads as "disabled" — the
  // opposite of what a selection should say. Matches the active tab treatment.
  rangePillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  rangeText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  rangeTextActive: {
    color: colors.textInverse,
  },
  sectionHeader: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: 2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 32,
  },
  sectionEyebrow: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  sectionCaption: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  historyButton: {
    marginHorizontal: spacing.lg,
    minHeight: 74,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
  },
  historyButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  historyButtonCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historyButtonText: {
    ...typography.title,
    color: colors.textPrimary,
  },
  historyButtonSummary: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  historyButtonMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },
  historyButtonCount: {
    ...typography.numeric,
    color: colors.textSecondary,
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
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  historyTitleBlock: {
    flex: 1,
    alignItems: "center",
  },
  historyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  historyTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  historyCount: {
    ...typography.micro,
    color: colors.textMuted,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  historyTools: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgCard,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.bodyMd,
    fontSize: 14,
    paddingVertical: spacing.xs,
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
