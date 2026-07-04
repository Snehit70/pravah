/**
 * Progress overview and full completion history.
 *
 * The filename remains for internal compatibility; user-facing language is
 * canonical Progress terminology.
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
import Svg, { Circle, Path } from "react-native-svg";
import type { MobileTask } from "../components/TaskCard";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { kpis, weekOverWeek } from "../lib/statsAggregators";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import { LedgerCheckIcon } from "../components/UiIcons";

type HistoryWindow = "all" | "7d" | "30d";

type InsightsScreenProps = {
  tasks: MobileTask[];
  completedTasks: MobileTask[];
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  renderCompletedTaskItem: ({ item }: { item: MobileTask }) => JSX.Element;
};

const HISTORY_WINDOWS: Array<{ key: HistoryWindow; label: string; days?: number }> = [
  { key: "all", label: "All" },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
];

function completionTime(task: MobileTask): number {
  return task.completedAt ?? task.updatedAt;
}

function trendCopy(current: number, previous: number): string {
  if (current === previous) return "Same pace as the previous 7 days";
  const difference = Math.abs(current - previous);
  return current > previous
    ? `${difference} more than the previous 7 days`
    : `${difference} fewer than the previous 7 days`;
}

function ProgressEmptyIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.textSecondary}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M4 18.5h16" />
      <Path d="M6 15.5 10 11l3 2.5 5-6" />
      <Path d="M15.5 7.5H18v2.5" />
      <Circle cx={10} cy={11} r={0.8} fill={colors.textSecondary} stroke="none" />
    </Svg>
  );
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
  const [now] = useState(() => Date.now());

  const orderedCompleted = useMemo(
    () => [...completedTasks].sort((a, b) => completionTime(b) - completionTime(a)),
    [completedTasks],
  );
  const recentCompleted = orderedCompleted.slice(0, 5);
  const summary = useMemo(() => kpis(tasks, now), [now, tasks]);
  const comparison = useMemo(() => weekOverWeek(tasks, now), [now, tasks]);

  const historyTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const selected = HISTORY_WINDOWS.find((option) => option.key === window);
    const cutoff = selected?.days
      ? now - selected.days * 24 * 60 * 60 * 1000
      : null;

    return orderedCompleted.filter((task) => {
      if (cutoff !== null && completionTime(task) < cutoff) return false;
      if (!normalizedQuery) return true;
      return `${task.title} ${task.description ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [now, orderedCompleted, query, window]);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
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
        <View style={styles.momentum}>
          <View style={styles.momentumHeading}>
            <View style={styles.momentumTitleBlock}>
              <Text style={styles.eyebrow}>Recent momentum</Text>
              <Text style={styles.momentumTitle}>
                {summary.completed7d === 0
                  ? "A clear place to begin."
                  : `${summary.completed7d} ${
                      summary.completed7d === 1 ? "Task" : "Tasks"
                    } completed`}
              </Text>
            </View>
            <Text style={styles.streak}>{summary.streak}d streak</Text>
          </View>

          <Text style={styles.trend}>
            {trendCopy(comparison.thisWeek, comparison.lastWeek)}
          </Text>

          <View style={styles.momentumGrid}>
            <View style={styles.momentumTile}>
              <Text style={styles.momentumTileValue}>{summary.completed7d}</Text>
              <Text style={styles.momentumTileLabel}>7d done</Text>
            </View>
            <View style={styles.momentumTile}>
              <Text style={styles.momentumTileValue}>{summary.streak}d</Text>
              <Text style={styles.momentumTileLabel}>streak</Text>
            </View>
            <View style={styles.momentumTile}>
              <Text style={styles.momentumTileValue}>{summary.overdue}</Text>
              <Text style={styles.momentumTileLabel}>overdue</Text>
            </View>
          </View>

          <View style={styles.trustRow}>
            <Text style={styles.trustSignal}>
              {summary.overdue === 0 ? "No overdue Tasks" : `${summary.overdue} overdue`}
            </Text>
            <View style={styles.trustDivider} />
            <Text style={styles.trustSignal}>
              {summary.inbox === 0 ? "Inbox is clear" : `${summary.inbox} in Inbox`}
            </Text>
          </View>
        </View>

        <View style={styles.recentHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recently completed</Text>
            <Text style={styles.sectionSub}>Your latest closed loops</Text>
          </View>
          {orderedCompleted.length > 0 ? (
            <Pressable
              onPress={() => setHistoryVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`View completion history, ${orderedCompleted.length} Tasks`}
              style={({ pressed }) => [styles.historyAction, pressed && { opacity: 0.65 }]}
            >
              <Text style={styles.historyActionText}>View history</Text>
            </Pressable>
          ) : null}
        </View>

        {isLoading ? (
          <Text accessibilityLiveRegion="polite" style={styles.emptyText}>
            Loading completed Tasks...
          </Text>
        ) : recentCompleted.length > 0 ? (
          <View style={styles.recentList}>
            {recentCompleted.map((item) => (
              <View key={String(item._id)}>{renderCompletedTaskItem({ item })}</View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <ProgressEmptyIcon />
            </View>
            <Text style={styles.emptyTitle}>Complete a Task to start seeing momentum.</Text>
            <Text style={styles.emptyText}>
              Progress will keep the recent record here without turning work into a score.
            </Text>
          </View>
        )}

        <Text style={styles.footerNote}>
          Computed on device from your Task history.
        </Text>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  momentum: {
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  momentumHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  momentumTitleBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  momentumTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  streak: {
    ...typography.numeric,
    color: colors.accent,
    paddingTop: spacing.xs,
  },
  trend: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  momentumGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  momentumTile: {
    flex: 1,
    minHeight: 64,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  momentumTileValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  momentumTileLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  trustSignal: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  trustDivider: {
    width: 3,
    height: 3,
    borderRadius: radii.full,
    backgroundColor: colors.border,
  },
  recentHeader: {
    minHeight: 68,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  sectionSub: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginTop: 2,
  },
  historyAction: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  historyActionText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontFamily: typography.title.fontFamily,
  },
  recentList: {
    gap: spacing.xs,
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
  footerNote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.section,
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
});
