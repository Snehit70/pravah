/**
 * TimelineScreen
 *
 * Renders the timeline tab: date-grouped sections for today and beyond.
 * Overdue tasks are NOT listed inline — they collapse into a single muted,
 * tappable "Overdue · N" header that opens the triage sheet, so the timeline
 * opens on what's actionable instead of a wall of backlog.
 *
 * List-layout rows share the Inbox/Goals compact grammar: tap opens the
 * editor, long-press enters select mode with a floating bulk bar (Reschedule /
 * Mark done), and the trailing check is the surface's one-tap primary verb.
 * The comfortable day-card carousel keeps its full rows.
 */

import { useCallback, useMemo, useState, type JSX } from "react";
import Animated, { FadeIn, FadeOut, withDelay, withTiming } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { TimelineDayCarousel } from "../components/TimelineDayCarousel";
import { TimelineTaskRow } from "../components/TimelineTaskRow";
import { QuickScheduleSheet } from "../components/QuickScheduleSheet";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { CalendarIcon, CheckIcon, CloseIcon } from "../components/UiIcons";
import { dateLabel } from "../lib/dates";
import type { TimelineLayout } from "../lib/userPreferences";
import { useConfirm } from "../hooks/useConfirm";
import { useIncrementalRowCount } from "../hooks/useIncrementalRowCount";
import { useListIntroStagger } from "../hooks/useListIntroStagger";
import { useReducedMotion } from "../hooks/useReducedMotion";

type TimelineRow =
  | { kind: "header"; dateKey: string; label: string; isToday: boolean; count: number }
  | { kind: "task"; dateKey: string; task: MobileTask };

type TimelineScreenProps = {
  sections: [string, MobileTask[]][];
  today: string;
  tomorrow: string;
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  /** Total overdue count (from the workspace buckets). Falls back to a local
   *  count of the dropped sections when not supplied. */
  overdueCount?: number;
  /** Opens the overdue triage sheet. Omitted while actions are unavailable. */
  onOpenOverdue?: () => void;
  /** Timeline layout preference — the compact list (default) or the
   *  comfortable day-card carousel. */
  layout?: TimelineLayout;
  /** Row + carousel actions. Omitted while workspace actions are unavailable. */
  onCompleteTask?: (id: Id<"tasks">) => void;
  onReopenTask?: (id: Id<"tasks">) => void;
  onEditTask?: (task: MobileTask) => void;
  getGoalName?: (taskId: string) => string | undefined;
  /** Bulk-reschedule the selected tasks to one date; resolves true on success. */
  onScheduleMany?: (taskIds: Id<"tasks">[], targetDate: string) => Promise<boolean>;
  /** Mark a batch of tasks done; resolves true on success. */
  onMarkManyDone?: (taskIds: Id<"tasks">[]) => Promise<boolean>;
};

const DEFAULT_VISIBLE_SECTION_COUNT = 3;

/** Crossfade for the layout toggle (PRD §5): incoming layout fades in over
 *  ~220ms with a subtle 0.98→1 scale, delayed so it overlaps the last ~60ms
 *  of the outgoing fade. */
function layoutEntering() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.98 }] },
    animations: {
      opacity: withDelay(120, withTiming(1, { duration: 220 })),
      transform: [{ scale: withDelay(120, withTiming(1, { duration: 220 })) }],
    },
  };
}

function countTimelineRows(sections: [string, MobileTask[]][]) {
  let count = 0;
  for (const [, tasks] of sections) count += 1 + tasks.length;
  return count;
}

/** Drop overdue out of the listed sections; return the rest plus how many
 *  overdue tasks were removed. Overdue lives in the collapsed header instead. */
function splitOverdue(
  sections: [string, MobileTask[]][],
  today: string
): { future: [string, MobileTask[]][]; overdueCount: number } {
  const future: [string, MobileTask[]][] = [];
  let overdueCount = 0;
  for (const [dateKey, tasks] of sections) {
    if (dateKey === "overdue" || dateKey < today) {
      overdueCount += tasks.length;
    } else {
      future.push([dateKey, tasks]);
    }
  }
  return { future, overdueCount };
}

function buildTimelineRows(
  sections: [string, MobileTask[]][],
  today: string,
  tomorrow: string,
  maxRows: number
) {
  const rows: TimelineRow[] = [];

  for (const [dateKey, tasks] of sections) {
    if (rows.length >= maxRows) break;
    rows.push({
      kind: "header",
      dateKey,
      label: dateLabel(dateKey, today, tomorrow),
      isToday: dateKey === today,
      count: tasks.length,
    });

    for (const task of tasks) {
      if (rows.length >= maxRows) break;
      rows.push({ kind: "task", dateKey, task });
    }
  }

  return rows;
}

function TimelineEmptyIcon({ size = 28 }: { size?: number }) {
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
      <Rect x={3.5} y={5} width={17} height={15} rx={3} />
      <Line x1={8} y1={3.75} x2={8} y2={7.25} />
      <Line x1={16} y1={3.75} x2={16} y2={7.25} />
      <Line x1={3.5} y1={9} x2={20.5} y2={9} />
      <Rect x={10.5} y={12} width={3} height={3} rx={1} />
    </Svg>
  );
}

export function TimelineScreen({
  sections,
  today,
  tomorrow,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  overdueCount,
  onOpenOverdue,
  layout = "list",
  onCompleteTask,
  onReopenTask,
  onEditTask,
  getGoalName,
  onScheduleMany,
  onMarkManyDone,
}: TimelineScreenProps) {
  const reducedMotion = useReducedMotion();
  const introStagger = useListIntroStagger();
  const confirm = useConfirm();
  const [showAllSections, setShowAllSections] = useState(false);

  // Multi-select / bulk-action mode (list layout only).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Batch held for the quick-schedule sheet while it is open.
  const [scheduleBatch, setScheduleBatch] = useState<MobileTask[] | null>(null);

  // Entering animations also fire on first mount; the tab transition already
  // animates that, so the crossfade only arms once the layout prop changes.
  const [lastLayout, setLastLayout] = useState(layout);
  const [crossfadeArmed, setCrossfadeArmed] = useState(false);
  if (lastLayout !== layout) {
    setLastLayout(layout);
    if (!crossfadeArmed) setCrossfadeArmed(true);
    // Selection is a list-layout mode; leaving the list ends it.
    if (selectMode) {
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }
  const { future, overdueCount: localOverdue } = splitOverdue(sections, today);
  const effectiveOverdue = overdueCount ?? localOverdue;
  const sourceSections = onOpenOverdue ? future : sections;
  const visibleSections = showAllSections
    ? sourceSections
    : sourceSections.slice(0, DEFAULT_VISIBLE_SECTION_COUNT);
  const laterSections = showAllSections ? [] : sourceSections.slice(DEFAULT_VISIBLE_SECTION_COUNT);
  const laterTaskCount = laterSections.reduce((sum, [, tasks]) => sum + tasks.length, 0);

  const totalRows = countTimelineRows(visibleSections);
  const visibleRowCount = useIncrementalRowCount(totalRows);

  // Build only the rows currently released to FlatList. Large timelines still
  // hydrate quickly, but the first paint avoids handing every row to React.
  const rows = buildTimelineRows(visibleSections, today, tomorrow, visibleRowCount);
  const hasPendingRows = rows.length < totalRows;

  // Every task currently on screen — the pool select-all and the bulk actions
  // operate on. Collapsed "Later" sections stay out until expanded.
  const visibleTasks = useMemo(
    () => visibleSections.flatMap(([, tasks]) => tasks),
    [visibleSections]
  );

  const canSelect = Boolean(onMarkManyDone ?? onScheduleMany);

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

  const allVisibleSelected =
    visibleTasks.length > 0 && visibleTasks.every((task) => selectedIds.has(String(task._id)));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const everySelected =
        visibleTasks.length > 0 && visibleTasks.every((task) => prev.has(String(task._id)));
      if (everySelected) return new Set();
      return new Set(visibleTasks.map((task) => String(task._id)));
    });
  }, [visibleTasks]);

  const selectedTasks = useMemo(
    () => visibleTasks.filter((task) => selectedIds.has(String(task._id))),
    [visibleTasks, selectedIds]
  );
  const selectedCount = selectedTasks.length;

  const handleMarkDone = useCallback(async () => {
    if (!onMarkManyDone) return;
    const ids = selectedTasks.map((task) => task._id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: ids.length === 1 ? "Mark this task as done?" : `Mark ${ids.length} tasks as done?`,
      confirmLabel: "Mark done",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    const success = await onMarkManyDone(ids);
    if (success) exitSelectMode();
  }, [onMarkManyDone, selectedTasks, confirm, exitSelectMode]);

  const handleSchedulePick = useCallback(
    async (isoDate: string) => {
      if (!onScheduleMany || !scheduleBatch || scheduleBatch.length === 0) return;
      const success = await onScheduleMany(
        scheduleBatch.map((task) => task._id),
        isoDate
      );
      if (success) exitSelectMode();
    },
    [onScheduleMany, scheduleBatch, exitSelectMode]
  );

  const overdueHeader =
    effectiveOverdue > 0 && onOpenOverdue ? (
      <Pressable
        onPress={onOpenOverdue}
        style={({ pressed }) => [styles.overdueBar, pressed && styles.overdueBarPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${effectiveOverdue} overdue. Open triage.`}
      >
        <View style={styles.overdueCopy}>
          <Text style={styles.overdueLabel}>Overdue · {effectiveOverdue}</Text>
          <Text style={styles.overdueHelp}>Reflow or choose the next real date.</Text>
        </View>
        <Text style={styles.overdueChevron}>Review</Text>
      </Pressable>
    ) : null;

  const selectHeader = (
    <View style={styles.selectBarWrap}>
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
          accessibilityLabel={allVisibleSelected ? "Deselect all" : "Select all"}
          style={({ pressed }) => [styles.selectAction, styles.selectActionEnd, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.selectActionText}>{allVisibleSelected ? "None" : "All"}</Text>
        </Pressable>
      </View>
    </View>
  );

  const emptyBlock = (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(400)} style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <TimelineEmptyIcon />
      </View>
      <Text style={styles.emptyTitle}>Today is clear.</Text>
      <Text style={styles.emptyText}>
        Upcoming work will appear here when it has a Deadline. Use Capture or Inbox to
        place the next task in time.
      </Text>
    </Animated.View>
  );

  const loadingBlock = <TaskListSkeleton variant="timeline" />;

  const animateCrossfade = crossfadeArmed && !reducedMotion;
  const entering = animateCrossfade ? layoutEntering : undefined;
  const exiting = animateCrossfade ? FadeOut.duration(180) : undefined;

  const renderTaskRow = (task: MobileTask): JSX.Element => (
    <TimelineTaskRow
      task={task}
      goalName={getGoalName?.(String(task._id))}
      selectMode={selectMode}
      selected={selectedIds.has(String(task._id))}
      onPress={() => onEditTask?.(task)}
      onLongPress={() => (canSelect ? enterSelectModeWith(task) : undefined)}
      onToggleSelect={() => toggleSelect(task)}
      onComplete={onCompleteTask ? () => onCompleteTask(task._id) : undefined}
    />
  );

  const listBody = (
    <FlatList<TimelineRow>
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + (selectMode ? 132 : 84),
      }}
      data={rows}
      extraData={selectMode ? selectedIds : false}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews
      keyExtractor={(row) =>
        row.kind === "header" ? `header-${row.dateKey}` : row.task._id
      }
      renderItem={({ item: row, index }) => {
        if (row.kind === "header") {
          return (
            <Animated.View pointerEvents="box-none" entering={introStagger(index)}>
              <TimelineSectionHeader label={row.label} count={row.count} isToday={row.isToday} />
            </Animated.View>
          );
        }
        return (
          <Animated.View entering={introStagger(index)}>{renderTaskRow(row.task)}</Animated.View>
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
      ListHeaderComponent={selectMode ? selectHeader : overdueHeader}
      ListFooterComponent={
        <>
          {laterTaskCount > 0 ? (
            <Pressable
              onPress={() => setShowAllSections((current) => !current)}
              style={({ pressed }) => [styles.laterSummary, pressed && styles.laterSummaryPressed]}
              accessibilityRole="button"
              accessibilityLabel={`${showAllSections ? "Collapse" : "Show"} ${laterTaskCount} later tasks`}
            >
              <View style={styles.laterSummaryRow}>
                <Text style={styles.laterSummaryText}>Later · {laterTaskCount} tasks</Text>
                <Text style={styles.laterSummaryAction}>{showAllSections ? "Collapse" : "Show"}</Text>
              </View>
            </Pressable>
          ) : null}
          {hasPendingRows ? <Text style={styles.loadingMore}>Preparing more tasks...</Text> : null}
        </>
      }
      ListEmptyComponent={isLoading ? loadingBlock : emptyBlock}
    />
  );

  const carouselBody = isLoading ? (
    loadingBlock
  ) : (
    <TimelineDayCarousel
      sections={sections}
      today={today}
      tomorrow={tomorrow}
      isRefreshing={isRefreshing}
      tabBarHeight={tabBarHeight}
      onRefresh={onRefresh}
      overdueCount={overdueCount}
      onOpenOverdue={onOpenOverdue}
      onCompleteTask={onCompleteTask}
      onReopenTask={onReopenTask}
      onEditTask={onEditTask}
      getGoalName={getGoalName}
      emptyComponent={emptyBlock}
    />
  );

  // Both layouts mount in an absolute-fill wrapper so the exiting one can
  // fade out in place without doubling the flex layout during the overlap.
  return (
    <View style={styles.layoutRoot}>
      {layout === "carousel" ? (
        <Animated.View key="carousel" style={styles.layoutFill} entering={entering} exiting={exiting}>
          {carouselBody}
        </Animated.View>
      ) : (
        <Animated.View key="list" style={styles.layoutFill} entering={entering} exiting={exiting}>
          {listBody}
        </Animated.View>
      )}

      {selectMode ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(150)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          style={[styles.bulkBar, { bottom: tabBarHeight + spacing.md }]}
        >
          <Pressable
            onPress={exitSelectMode}
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
            style={({ pressed }) => [styles.bulkCancel, pressed && { opacity: 0.7 }]}
          >
            <CloseIcon size={16} color={colors.textSecondary} strokeWidth={1.9} />
          </Pressable>
          {onScheduleMany ? (
            <Pressable
              onPress={() => setScheduleBatch(selectedTasks)}
              disabled={selectedCount === 0}
              accessibilityRole="button"
              accessibilityLabel={
                selectedCount <= 1 ? "Reschedule task" : `Reschedule ${selectedCount} tasks`
              }
              style={({ pressed }) => [
                styles.bulkReschedule,
                pressed && selectedCount > 0 && { opacity: 0.7 },
              ]}
            >
              <CalendarIcon
                size={15}
                strokeWidth={1.9}
                color={selectedCount === 0 ? colors.textMuted : colors.textSecondary}
              />
              <Text
                style={[
                  styles.bulkRescheduleText,
                  selectedCount === 0 && styles.bulkTextDisabled,
                ]}
              >
                {selectedCount === 0 ? "Reschedule" : `Reschedule ${selectedCount}`}
              </Text>
            </Pressable>
          ) : null}
          {onMarkManyDone ? (
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
                size={16}
                strokeWidth={2.4}
                color={selectedCount === 0 ? colors.textMuted : colors.textInverse}
              />
              <Text
                style={[styles.bulkDoneText, selectedCount === 0 && styles.bulkTextDisabled]}
              >
                {selectedCount === 0
                  ? "Mark done"
                  : selectedCount === 1
                    ? "Mark 1 done"
                    : `Mark ${selectedCount} done`}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}

      <QuickScheduleSheet
        visible={scheduleBatch !== null}
        taskTitle={
          scheduleBatch === null
            ? undefined
            : scheduleBatch.length === 1
              ? scheduleBatch[0].title
              : `${scheduleBatch.length} tasks`
        }
        onClose={() => setScheduleBatch(null)}
        onPick={(iso) => void handleSchedulePick(iso)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layoutRoot: {
    flex: 1,
  },
  layoutFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Muted, tappable doorway to the triage sheet — count + chevron only, no
  // alarm color (per the overdue-handling design: tone fixed by behavior).
  overdueBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  overdueBarPressed: { opacity: 0.6 },
  overdueCopy: {
    flex: 1,
    gap: 2,
  },
  overdueLabel: { color: colors.textPrimary, ...typography.micro },
  overdueHelp: { color: colors.textMuted, ...typography.bodyMd },
  overdueChevron: { color: colors.accent, ...typography.bodyMd },
  selectBarWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  selectActionEnd: {
    alignItems: "flex-end",
  },
  selectActionText: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  selectCount: {
    ...typography.title,
    color: colors.textPrimary,
  },
  laterSummary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  laterSummaryPressed: {
    opacity: 0.65,
  },
  laterSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  laterSummaryText: {
    color: colors.textMuted,
    ...typography.micro,
  },
  laterSummaryAction: {
    color: colors.accent,
    ...typography.bodyMd,
  },
  bulkBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bulkCancel: {
    width: 48,
    height: 52,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bulkReschedule: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bulkRescheduleText: {
    ...typography.bodyMd,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  bulkDone: {
    flex: 1,
    height: 52,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bulkDoneDisabled: {
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bulkDoneText: {
    ...typography.title,
    color: colors.textInverse,
  },
  bulkTextDisabled: {
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
  loadingMore: {
    color: colors.textSecondary,
    ...typography.micro,
    textAlign: "center",
    paddingTop: spacing.md,
  },
});
