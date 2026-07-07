/**
 * InboxScreen
 *
 * Renders the inbox tab: a list of inbox tasks with pull-to-refresh,
 * empty state, and loading state. All task mutations are passed in from the
 * parent so this component stays free of mutation wiring.
 *
 * Drag-to-reorder is currently disabled. react-native-draggable-flatlist
 * @4.0.3 silently fails to render under react-native-reanimated@4.x; the
 * fallback to plain FlatList keeps the list visible. The renderItem prop
 * still receives a RenderItemParams shape so the call sites in App.tsx stay
 * unchanged — drag is a no-op until a Reanimated-4-compatible reorder
 * library is in place.
 */

import { useMemo, useState, type JSX } from "react";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import Svg, { Path } from "react-native-svg";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { useIncrementalRowCount } from "../hooks/useIncrementalRowCount";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useGoalLinks, useGoals } from "../hooks/useGoals";

// Goal filter sentinels. Real goal ids never collide with these.
const GOAL_ALL = "all";
const GOAL_NONE = "none";

type FilterValue = "all" | "p1" | "p2" | "p3" | "none";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "p1", label: "P1" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
  { value: "none", label: "None" },
];

type InboxScreenProps = {
  tasks: MobileTask[];
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  onCapture: () => void;
  renderItem: (params: RenderItemParams<MobileTask> & { hidePriorityBadge?: boolean }) => JSX.Element;
};

const noopDrag = () => {};

type PriorityBucket = "p1" | "p2" | "p3" | "none";

type InboxRow =
  | { kind: "header"; bucket: PriorityBucket; label: string; count: number }
  | { kind: "task"; task: MobileTask };

const BUCKET_ORDER: PriorityBucket[] = ["p1", "p2", "p3", "none"];
const BUCKET_LABEL: Record<PriorityBucket, string> = {
  p1: "Priority 1",
  p2: "Priority 2",
  p3: "Priority 3",
  none: "Unprioritized",
};

function bucketOf(task: MobileTask): PriorityBucket {
  return task.priority ?? "none";
}

// Build a mixed header/task row list. Inbox tasks arrive pre-sorted
// (priority desc, then position), so a single pass keeps the order while
// inserting one quiet header per non-empty bucket.
function buildInboxRows(tasks: MobileTask[]): InboxRow[] {
  const grouped = new Map<PriorityBucket, MobileTask[]>();
  for (const task of tasks) {
    const key = bucketOf(task);
    const existing = grouped.get(key) ?? [];
    existing.push(task);
    grouped.set(key, existing);
  }
  const rows: InboxRow[] = [];
  for (const bucket of BUCKET_ORDER) {
    const inBucket = grouped.get(bucket);
    if (!inBucket || inBucket.length === 0) continue;
    rows.push({ kind: "header", bucket, label: BUCKET_LABEL[bucket], count: inBucket.length });
    for (const task of inBucket) rows.push({ kind: "task", task });
  }
  return rows;
}

function InboxEmptyIcon({ size = 28 }: { size?: number }) {
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
      <Path d="M3 8.5h18l-2 9.5H5L3 8.5Z" />
      <Path d="M8 8.5V6.75A1.75 1.75 0 0 1 9.75 5h4.5A1.75 1.75 0 0 1 16 6.75V8.5" />
      <Path d="M3.75 13h4.7l1.1 2h4.9l1.1-2h4.7" />
    </Svg>
  );
}

export function InboxScreen({
  tasks,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  onCapture,
  renderItem,
}: InboxScreenProps) {
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  // "all" | "none" (unlinked) | a goal id.
  const [goalFilter, setGoalFilter] = useState<string>(GOAL_ALL);
  const [showFilters, setShowFilters] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  const { goals } = useGoals();
  const goalLinks = useGoalLinks();

  const selectedGoal = useMemo(
    () => goals.find((g) => g.id === goalFilter),
    [goals, goalFilter]
  );
  // A previously-selected goal can be deleted out from under us; fall back to
  // "all" so we never filter against a goal that no longer exists.
  const activeGoalFilter =
    goalFilter === GOAL_ALL || goalFilter === GOAL_NONE || selectedGoal ? goalFilter : GOAL_ALL;

  const resetFilters = () => {
    setQuery("");
    setFilter("all");
    setGoalFilter(GOAL_ALL);
    setShowFilters(false);
    setShowGoalPicker(false);
  };

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter !== "all") {
        const bucket = task.priority ?? "none";
        if (bucket !== filter) return false;
      }
      if (activeGoalFilter !== GOAL_ALL) {
        const linkedGoalId = goalLinks[String(task._id)];
        if (activeGoalFilter === GOAL_NONE ? Boolean(linkedGoalId) : linkedGoalId !== activeGoalFilter) {
          return false;
        }
      }
      if (!q) return true;
      const inTitle = task.title.toLowerCase().includes(q);
      const inDescription = task.description?.toLowerCase().includes(q) ?? false;
      return inTitle || inDescription;
    });
  }, [tasks, query, filter, activeGoalFilter, goalLinks]);

  const goalFilterLabel =
    activeGoalFilter === GOAL_ALL
      ? "All goals"
      : activeGoalFilter === GOAL_NONE
        ? "No goal"
        : selectedGoal?.text ?? "All goals";

  const isFiltering = query.trim() !== "" || filter !== "all" || activeGoalFilter !== GOAL_ALL;

  const emptyBlock = isFiltering ? (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No matches.</Text>
      <Text style={styles.emptyText}>Try a different word or clear filters.</Text>
      <Pressable
        onPress={resetFilters}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Clear filters"
        style={({ pressed }) => [styles.emptyCtaWrap, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.emptyCta}>Clear filters</Text>
      </Pressable>
    </Animated.View>
  ) : (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(400)} style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <InboxEmptyIcon />
      </View>
      <Text style={styles.emptyTitle}>Everything has a place.</Text>
      <Text style={styles.emptyText}>Capture new loose work when it appears.</Text>
      <Pressable
        onPress={onCapture}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Capture a task"
        style={({ pressed }) => [styles.emptyCtaWrap, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.emptyCta}>Capture a task</Text>
      </Pressable>
    </Animated.View>
  );

  const loadingBlock = <TaskListSkeleton variant="inbox" />;
  const allRows = buildInboxRows(filteredTasks);
  const visibleRowCount = useIncrementalRowCount(allRows.length);
  const rows = allRows.slice(0, visibleRowCount);
  const hasPendingRows = rows.length < allRows.length;

  const searchHeader = (
    <View style={styles.searchWrap}>
      <View style={styles.queueIntro}>
        <View style={styles.queueCopy}>
          <Text style={styles.queueTitle}>Triage queue</Text>
          <Text style={styles.queueSubtitle}>
            {isFiltering
              ? `${filteredTasks.length} matching ${
                  filteredTasks.length === 1 ? "task" : "tasks"
                }`
              : `${tasks.length} task${tasks.length === 1 ? "" : "s"} without a Deadline`}
          </Text>
        </View>
        {!isFiltering && tasks.length > 0 ? <Text style={styles.queueMeta}>Schedule first</Text> : null}
      </View>

      <Pressable
        onPress={() => setShowFilters((s) => !s)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Search or filter Inbox"
        accessibilityState={{ expanded: showFilters }}
        style={({ pressed }) => [styles.filterLauncher, pressed && { opacity: 0.72 }]}
      >
        <Text style={styles.filterLauncherText}>Search or filter</Text>
        <Text style={styles.filterLauncherMeta}>
          {isFiltering
            ? `${filteredTasks.length}/${tasks.length}`
            : `${tasks.length} unplaced`}
        </Text>
      </Pressable>

      {isFiltering ? (
        <View style={styles.activePillRow}>
          {query.trim() ? <Text style={styles.activePill}>Search: {query.trim()}</Text> : null}
          {filter !== "all" ? <Text style={styles.activePill}>{filter.toUpperCase()}</Text> : null}
          {activeGoalFilter !== GOAL_ALL ? <Text style={styles.activePill}>{goalFilterLabel}</Text> : null}
          <Pressable
            onPress={resetFilters}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear Inbox filters"
          >
            <Text style={styles.clearFilters}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {showFilters ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(150)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          style={styles.filterPanel}
        >
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Inbox"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <View style={styles.filterRow}>
            {FILTERS.map((option) => {
              const active = filter === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setFilter(option.value)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Filter ${option.label}`}
                  style={({ pressed }) => [
                    styles.filterChip,
                    active && styles.filterChipActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {goals.length > 0 ? (
            <View>
              <Pressable
                onPress={() => setShowGoalPicker((s) => !s)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Goal filter: ${goalFilterLabel}. Tap to change.`}
                accessibilityState={{ expanded: showGoalPicker }}
                style={({ pressed }) => [
                  styles.goalChip,
                  activeGoalFilter !== GOAL_ALL && styles.goalChipActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.goalChipKicker}>Goal</Text>
                <Text
                  style={[
                    styles.goalChipValue,
                    activeGoalFilter !== GOAL_ALL && styles.goalChipValueActive,
                  ]}
                  numberOfLines={1}
                >
                  {goalFilterLabel}
                </Text>
                <Text style={styles.goalChipCaret}>{showGoalPicker ? "▾" : "▸"}</Text>
              </Pressable>

              {showGoalPicker ? (
                <Animated.View
                  entering={reducedMotion ? undefined : FadeIn.duration(150)}
                  exiting={reducedMotion ? undefined : FadeOut.duration(120)}
                  style={styles.goalPicker}
                >
                  {[
                    { id: GOAL_ALL, text: "All goals" },
                    { id: GOAL_NONE, text: "No goal" },
                    ...goals,
                  ].map((option) => {
                    const active = activeGoalFilter === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          setGoalFilter(option.id);
                          setShowGoalPicker(false);
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.goalOption,
                          active && styles.goalOptionActive,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text
                          style={[styles.goalOptionText, active && styles.goalOptionTextActive]}
                          numberOfLines={2}
                        >
                          {option.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </Animated.View>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <FlatList<InboxRow>
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + 84,
      }}
      data={rows}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews
      keyExtractor={(row) =>
        row.kind === "header" ? `header-${row.bucket}` : row.task._id
      }
      renderItem={({ item: row, index }) => {
        if (row.kind === "header") {
          return <TimelineSectionHeader label={row.label} count={row.count} isToday={false} />;
        }
        return renderItem({
          item: row.task,
          drag: noopDrag,
          isActive: false,
          getIndex: () => index,
          hidePriorityBadge: !isFiltering,
        });
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
      ListHeaderComponent={tasks.length > 0 || isFiltering ? searchHeader : null}
      ListFooterComponent={
        hasPendingRows ? <Text style={styles.loadingMore}>Preparing more tasks...</Text> : null
      }
      ListEmptyComponent={isLoading ? loadingBlock : emptyBlock}
    />
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  queueIntro: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  queueCopy: {
    flex: 1,
    gap: 2,
  },
  queueTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  queueSubtitle: {
    color: colors.textMuted,
    ...typography.bodyMd,
  },
  // Sentence case — an instruction, not log-line metadata.
  queueMeta: {
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  filterLauncher: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  filterLauncherText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  filterLauncherMeta: {
    ...typography.numeric,
    fontSize: 11,
    color: colors.textMuted,
  },
  filterPanel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  activePillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  activePill: {
    ...typography.micro,
    color: colors.accent,
    backgroundColor: colors.accentDim,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  clearFilters: {
    ...typography.micro,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  filterCount: {
    ...typography.micro,
    color: colors.textMuted,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCardGlass,
    minHeight: 44,
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.bg,
  },
  goalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  goalChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  goalChipKicker: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  goalChipValue: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  goalChipValueActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  goalChipCaret: {
    ...typography.micro,
    color: colors.textMuted,
  },
  goalPicker: {
    marginTop: spacing.xs,
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  goalOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  goalOptionActive: {
    backgroundColor: colors.accentSoft,
  },
  goalOptionText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  goalOptionTextActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  emptyWrap: {
    paddingTop: spacing.section * 2,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    alignItems: "center",
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
    color: colors.textPrimary,
    ...typography.headline,
    textAlign: "center",
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center",
  },
  emptyCtaWrap: {
    marginTop: spacing.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  emptyCta: {
    color: colors.accent,
    ...typography.micro,
  },
  loadingMore: {
    color: colors.textSecondary,
    ...typography.micro,
    textAlign: "center",
    paddingTop: spacing.md,
  },
});
