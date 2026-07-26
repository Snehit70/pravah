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
 * only primitive callbacks (edit, schedule-to-date, bulk completion/deletion)
 * so mutation wiring stays out of here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import type { MobileTask } from "../components/TaskCard";
import { InboxTaskRow } from "../components/InboxTaskRow";
import { QuickScheduleSheet } from "../components/QuickScheduleSheet";
import { CheckIcon, SearchIcon, TrashIcon } from "../components/UiIcons";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { useConfirm } from "../hooks/useConfirm";
import { useIncrementalRowCount } from "../hooks/useIncrementalRowCount";
import { useListIntroStagger } from "../hooks/useListIntroStagger";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useGoalLinks, useGoals } from "../hooks/useGoals";
import { useUserPreferences } from "../hooks/useUserPreferences";

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
  /** Recoverably delete a batch of Inbox tasks; resolves true on success. */
  onDeleteMany: (taskIds: MobileTask["_id"][]) => Promise<boolean>;
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
  onDeleteMany,
  canAct,
}: InboxScreenProps) {
  const reducedMotion = useReducedMotion();
  const introStagger = useListIntroStagger();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  // Multi-select / bulk-complete mode.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Quick-schedule sheet target.
  const [scheduleTask, setScheduleTask] = useState<MobileTask | null>(null);

  const { goals } = useGoals();
  const goalLinks = useGoalLinks();
  const { prefs } = useUserPreferences();

  const goalNameByTask = useMemo(() => {
    const byId = new Map(goals.map((g) => [g.id, g.text]));
    const out = new Map<string, string>();
    for (const [taskId, goalId] of Object.entries(goalLinks)) {
      const name = byId.get(goalId);
      if (name) out.set(taskId, name);
    }
    return out;
  }, [goals, goalLinks]);

  const resetFilters = () => {
    setQuery("");
    setFilter("all");
  };

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter !== "all") {
        const bucket = task.priority ?? "none";
        if (bucket !== filter) return false;
      }
      if (prefs.hideGoalLinkedTasksFromInbox && goalLinks[String(task._id)]) {
        return false;
      }
      if (!q) return true;
      const inTitle = task.title.toLowerCase().includes(q);
      const inDescription = task.description?.toLowerCase().includes(q) ?? false;
      return inTitle || inDescription;
    });
  }, [tasks, query, filter, goalLinks, prefs.hideGoalLinkedTasksFromInbox]);

  const hasHiddenGoalLinkedTasks =
    prefs.hideGoalLinkedTasksFromInbox && tasks.some((task) => Boolean(goalLinks[String(task._id)]));

  const isFiltering = query.trim() !== "" || filter !== "all";

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // A preference or filter change can hide selected rows. Keep bulk actions
  // scoped to what the Inbox currently shows.
  useEffect(() => {
    const visibleIds = new Set(filteredTasks.map((task) => String(task._id)));
    setSelectedIds((previous) => {
      const next = new Set([...previous].filter((id) => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filteredTasks]);

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
    // Entering select mode requires canAct, but the gate can flip while a
    // selection is held (e.g. bootstrap error) — recheck before committing.
    if (!canAct) return;
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
  }, [canAct, filteredTasks, selectedIds, confirm, onMarkManyDone, exitSelectMode]);

  const handleDelete = useCallback(async () => {
    if (!canAct) return;
    const ids = filteredTasks
      .filter((task) => selectedIds.has(String(task._id)))
      .map((task) => task._id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: ids.length === 1 ? "Delete 1 task from your inbox?" : `Delete ${ids.length} tasks from your inbox?`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    const success = await onDeleteMany(ids);
    if (success) exitSelectMode();
  }, [canAct, filteredTasks, selectedIds, confirm, onDeleteMany, exitSelectMode]);

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
      <Text style={styles.emptyText}>
        {hasHiddenGoalLinkedTasks
          ? "Goal-linked tasks are hidden. Change this in Settings → Interaction."
          : "Capture new loose work when it appears."}
      </Text>
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
        <SearchIcon color={colors.textMuted} size={16} />
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
      </View>
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
        ListHeaderComponent={selectMode || tasks.length > 0 || isFiltering ? listHeader : null}
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
          <View style={styles.bulkActions}>
            <Pressable
              onPress={() => void handleDelete()}
              disabled={selectedCount === 0 || !canAct}
              accessibilityRole="button"
              accessibilityLabel={
                selectedCount === 0
                  ? "Delete tasks"
                  : selectedCount === 1
                    ? "Delete 1 task"
                    : `Delete ${selectedCount} tasks`
              }
              style={({ pressed }) => [
                styles.bulkDelete,
                selectedCount === 0 && styles.bulkDeleteDisabled,
                pressed && selectedCount > 0 && { opacity: 0.7 },
              ]}
            >
              <TrashIcon
                size={18}
                strokeWidth={2}
                color={selectedCount === 0 ? colors.textMuted : colors.error}
              />
              <Text
                style={[styles.bulkDeleteText, selectedCount === 0 && styles.bulkDeleteTextDisabled]}
              >
                {selectedCount === 0
                  ? "Delete"
                  : selectedCount === 1
                    ? "Delete 1 task"
                    : `Delete ${selectedCount} tasks`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleMarkDone()}
              disabled={selectedCount === 0 || !canAct}
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
          </View>
        </Animated.View>
      ) : null}

      <QuickScheduleSheet
        visible={scheduleTask !== null}
        taskTitle={scheduleTask?.title}
        onClose={() => setScheduleTask(null)}
        onPick={(iso) => {
          if (scheduleTask && canAct) onScheduleToDate(scheduleTask._id, iso);
        }}
      />
    </View>
  );
}

const styles = createThemedStyles({
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
  bulkBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
  },
  bulkActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  bulkDelete: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    shadowColor: "#08050a",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  bulkDeleteDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  bulkDeleteText: {
    ...typography.title,
    color: colors.error,
  },
  bulkDeleteTextDisabled: {
    color: colors.textMuted,
  },
  bulkDone: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    shadowColor: "#08050a",
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
