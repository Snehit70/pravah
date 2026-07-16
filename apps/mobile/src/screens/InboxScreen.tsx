/**
 * InboxScreen
 *
 * The triage tab. Each task is a compact row — a leading icon tile, a
 * single-line title, and the linked goal with a schedule icon — modelled on the
 * GoalsScreen row. Placing a task is a single tap through the quick-schedule
 * sheet; completing tasks is a deliberate act that lives in a multi-select mode
 * with a themed confirm, so the list never wears a checkbox at rest.
 *
 * The screen owns its row rendering and interaction state. The parent passes
 * only primitive callbacks (edit, schedule-to-date, mark-many-done) so mutation
 * wiring stays out of here.
 */

import { useCallback, useMemo, useState } from "react";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { InboxTaskRow } from "../components/InboxTaskRow";
import { QuickScheduleSheet } from "../components/QuickScheduleSheet";
import { CheckIcon } from "../components/UiIcons";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { useConfirm } from "../hooks/useConfirm";
import { useIncrementalRowCount } from "../hooks/useIncrementalRowCount";
import { useListIntroStagger } from "../hooks/useListIntroStagger";
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
  /** Open the full editor for a task. */
  onEditTask: (task: MobileTask) => void;
  /** Schedule a task to an ISO date (YYYY-MM-DD). */
  onScheduleToDate: (taskId: MobileTask["_id"], targetDate: string) => void;
  /** Mark a batch of tasks done; resolves true on success. */
  onMarkManyDone: (taskIds: MobileTask["_id"][]) => Promise<boolean>;
  /** False while the workspace can't accept actions (loading / offline gate). */
  canAct: boolean;
};

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

function SearchGlyph({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-3.2-3.2" />
    </Svg>
  );
}

// An open checkbox with an outsized tick — reads as "select several".
function SelectGlyph({ size = 15, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 8V7a3 3 0 0 1 3-3h8" />
      <Path d="M20 12v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5" />
      <Path d="m8 11 3.5 3.5L21 5" />
    </Svg>
  );
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
  onEditTask,
  onScheduleToDate,
  onMarkManyDone,
  canAct,
}: InboxScreenProps) {
  const reducedMotion = useReducedMotion();
  const introStagger = useListIntroStagger();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  // "all" | "none" (unlinked) | a goal id.
  const [goalFilter, setGoalFilter] = useState<string>(GOAL_ALL);
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  // Multi-select / bulk-complete mode.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Quick-schedule sheet target.
  const [scheduleTask, setScheduleTask] = useState<MobileTask | null>(null);

  const { goals } = useGoals();
  const goalLinks = useGoalLinks();

  const goalNameByTask = useMemo(() => {
    const byId = new Map(goals.map((g) => [g.id, g.text]));
    const out = new Map<string, string>();
    for (const [taskId, goalId] of Object.entries(goalLinks)) {
      const name = byId.get(goalId);
      if (name) out.set(taskId, name);
    }
    return out;
  }, [goals, goalLinks]);

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
      ? "Goal"
      : activeGoalFilter === GOAL_NONE
        ? "No goal"
        : selectedGoal?.text ?? "Goal";

  const isFiltering = query.trim() !== "" || filter !== "all" || activeGoalFilter !== GOAL_ALL;

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const enterSelectModeWith = useCallback((task: MobileTask) => {
    setSelectMode(true);
    setSelectedIds(new Set([String(task._id)]));
  }, []);

  const toggleSelect = useCallback((task: MobileTask) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const key = String(task._id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allFilteredSelected =
    filteredTasks.length > 0 && filteredTasks.every((task) => selectedIds.has(String(task._id)));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const everySelected =
        filteredTasks.length > 0 && filteredTasks.every((task) => prev.has(String(task._id)));
      if (everySelected) return new Set();
      return new Set(filteredTasks.map((task) => String(task._id)));
    });
  }, [filteredTasks]);

  const handleMarkDone = useCallback(async () => {
    const ids = filteredTasks
      .filter((task) => selectedIds.has(String(task._id)))
      .map((task) => task._id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: ids.length === 1 ? "Mark this task as done?" : `Mark ${ids.length} tasks as done?`,
      confirmLabel: "Mark done",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    const success = await onMarkManyDone(ids);
    if (success) exitSelectMode();
  }, [filteredTasks, selectedIds, confirm, onMarkManyDone, exitSelectMode]);

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

  const selectedCount = selectedIds.size;

  const listHeader = selectMode ? (
    <View style={styles.searchWrap}>
      <View style={styles.selectBar}>
        <Pressable
          onPress={exitSelectMode}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel selection"
          style={({ pressed }) => [styles.selectAction, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.selectActionText}>Cancel</Text>
        </Pressable>
        <Text style={styles.selectCount}>
          {selectedCount === 0 ? "Select tasks" : `${selectedCount} selected`}
        </Text>
        <Pressable
          onPress={toggleSelectAll}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={allFilteredSelected ? "Deselect all" : "Select all"}
          style={({ pressed }) => [styles.selectAction, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.selectActionText}>{allFilteredSelected ? "None" : "All"}</Text>
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={styles.searchWrap}>
      <View style={styles.introRow}>
        <View style={styles.introCopy}>
          <Text style={styles.queueTitle}>Triage queue</Text>
          <Text style={styles.queueSubtitle}>
            {isFiltering
              ? `${filteredTasks.length} matching ${filteredTasks.length === 1 ? "task" : "tasks"}`
              : `${tasks.length} task${tasks.length === 1 ? "" : "s"} without a deadline`}
          </Text>
        </View>
        {tasks.length > 0 && canAct ? (
          <Pressable
            onPress={() => setSelectMode(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Select tasks"
            style={({ pressed }) => [styles.selectEnter, pressed && { opacity: 0.6 }]}
          >
            <SelectGlyph />
            <Text style={styles.selectEnterText}>Select</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.searchField}>
        <SearchGlyph />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search inbox"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.chipRow}>
        {FILTERS.map((option) => {
          const active = filter === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setFilter(option.value)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Filter ${option.label}`}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
        {goals.length > 0 ? (
          <Pressable
            onPress={() => setShowGoalPicker((s) => !s)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Goal filter: ${goalFilterLabel}. Tap to change.`}
            accessibilityState={{ expanded: showGoalPicker, selected: activeGoalFilter !== GOAL_ALL }}
            style={({ pressed }) => [
              styles.chip,
              styles.goalChip,
              activeGoalFilter !== GOAL_ALL && styles.chipActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[styles.chipText, activeGoalFilter !== GOAL_ALL && styles.chipTextActive]}
              numberOfLines={1}
            >
              {goalFilterLabel}
            </Text>
            <Text style={[styles.goalCaret, activeGoalFilter !== GOAL_ALL && styles.chipTextActive]}>
              {showGoalPicker ? " ▾" : " ▸"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {showGoalPicker && goals.length > 0 ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(150)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          style={styles.goalPicker}
        >
          {[{ id: GOAL_ALL, text: "All goals" }, { id: GOAL_NONE, text: "No goal" }, ...goals].map(
            (option) => {
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
            }
          )}
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList<InboxRow>
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + (selectMode ? 132 : 84),
        }}
        data={rows}
        extraData={selectMode ? selectedIds : false}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        keyExtractor={(row) => (row.kind === "header" ? `header-${row.bucket}` : row.task._id)}
        renderItem={({ item: row, index }) => {
          if (row.kind === "header") {
            return (
              <Animated.View entering={introStagger(index)}>
                <TimelineSectionHeader label={row.label} count={row.count} isToday={false} />
              </Animated.View>
            );
          }
          const task = row.task;
          return (
            <Animated.View entering={introStagger(index)}>
              <InboxTaskRow
                task={task}
                goalName={goalNameByTask.get(String(task._id))}
                selectMode={selectMode}
                selected={selectedIds.has(String(task._id))}
                onPress={() => (canAct ? onEditTask(task) : undefined)}
                onLongPress={() => (canAct ? enterSelectModeWith(task) : undefined)}
                onToggleSelect={() => toggleSelect(task)}
                onSchedule={() => (canAct ? setScheduleTask(task) : undefined)}
              />
            </Animated.View>
          );
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
        ListHeaderComponent={tasks.length > 0 || isFiltering ? listHeader : null}
        ListFooterComponent={
          hasPendingRows ? <Text style={styles.loadingMore}>Preparing more tasks...</Text> : null
        }
        ListEmptyComponent={isLoading ? loadingBlock : emptyBlock}
      />

      {selectMode ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(150)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          style={[styles.bulkBar, { bottom: tabBarHeight + spacing.md }]}
        >
          <Pressable
            onPress={() => void handleMarkDone()}
            disabled={selectedCount === 0}
            accessibilityRole="button"
            accessibilityLabel={
              selectedCount <= 1 ? "Mark task as done" : `Mark ${selectedCount} tasks as done`
            }
            style={({ pressed }) => [
              styles.bulkDone,
              selectedCount === 0 && styles.bulkDoneDisabled,
              pressed && selectedCount > 0 && { opacity: 0.85 },
            ]}
          >
            <CheckIcon
              size={18}
              strokeWidth={2.4}
              color={selectedCount === 0 ? colors.textMuted : colors.textInverse}
            />
            <Text
              style={[styles.bulkDoneText, selectedCount === 0 && styles.bulkDoneTextDisabled]}
            >
              {selectedCount === 0
                ? "Mark done"
                : selectedCount === 1
                  ? "Mark 1 done"
                  : `Mark ${selectedCount} done`}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

      <QuickScheduleSheet
        visible={scheduleTask !== null}
        taskTitle={scheduleTask?.title}
        onClose={() => setScheduleTask(null)}
        onPick={(iso) => {
          if (scheduleTask) onScheduleToDate(scheduleTask._id, iso);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  introRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  introCopy: {
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
  selectEnter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  selectEnterText: {
    ...typography.micro,
    color: colors.accent,
  },
  selectBar: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectAction: {
    minWidth: 56,
    paddingVertical: 6,
  },
  selectActionText: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  selectCount: {
    ...typography.title,
    color: colors.textPrimary,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.bodyMd,
    fontSize: 14,
    paddingVertical: spacing.xs,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCardGlass,
    minHeight: 28,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.bg,
  },
  goalChip: {
    maxWidth: "52%",
  },
  goalCaret: {
    ...typography.micro,
    color: colors.textMuted,
  },
  goalPicker: {
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
  bulkBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
  },
  bulkDone: {
    minHeight: 52,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bulkDoneDisabled: {
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bulkDoneText: {
    ...typography.title,
    color: colors.textInverse,
  },
  bulkDoneTextDisabled: {
    color: colors.textMuted,
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
