/**
 * TimelineScreen
 *
 * Renders the timeline tab: date-grouped sections for today and beyond.
 * Overdue tasks are NOT listed inline — they collapse into a single muted,
 * tappable "Overdue · N" header that opens the triage sheet, so the timeline
 * opens on what's actionable instead of a wall of backlog. Drag-to-reorder is
 * currently disabled (RNDFL@4 / Reanimated@4 incompatibility).
 */

import { useEffect, useRef, useState, type JSX } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import { colors, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { dateLabel } from "../lib/dates";
import { useIncrementalRowCount } from "../hooks/useIncrementalRowCount";
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
  renderItem: (dateKey: string, params: RenderItemParams<MobileTask>) => JSX.Element;
  /** Total overdue count (from the workspace buckets). Falls back to a local
   *  count of the dropped sections when not supplied. */
  overdueCount?: number;
  /** Opens the overdue triage sheet. Omitted while actions are unavailable. */
  onOpenOverdue?: () => void;
};

const noopDrag = () => {};
const DEFAULT_VISIBLE_SECTION_COUNT = 3;

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

export function TimelineScreen({
  sections,
  today,
  tomorrow,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  renderItem,
  overdueCount,
  onOpenOverdue,
}: TimelineScreenProps) {
  const reducedMotion = useReducedMotion();
  const listRef = useRef<FlatList<TimelineRow>>(null);
  const [showAllSections, setShowAllSections] = useState(false);
  const [pendingJumpDateKey, setPendingJumpDateKey] = useState<string | null>(null);
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
  const jumpTargets = sourceSections.slice(0, 6).map(([dateKey]) => ({
    dateKey,
    label: dateLabel(dateKey, today, tomorrow),
  }));

  useEffect(() => {
    if (!pendingJumpDateKey) return;
    const rowIndex = rows.findIndex(
      (row) => row.kind === "header" && row.dateKey === pendingJumpDateKey,
    );
    if (rowIndex >= 0) {
      const timeout = setTimeout(() => {
        listRef.current?.scrollToIndex({ index: rowIndex, animated: !reducedMotion });
        setPendingJumpDateKey(null);
      }, 0);
      return () => clearTimeout(timeout);
    }
    if (!showAllSections) setShowAllSections(true);
  }, [pendingJumpDateKey, reducedMotion, rows, showAllSections]);

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

  const emptyBlock = (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Today is clear.</Text>
      <Text style={styles.emptyText}>
        Upcoming work will appear here when it has a Deadline. Use Capture or Inbox to
        place the next task in time.
      </Text>
    </Animated.View>
  );

  const jumpHeader =
    jumpTargets.length > 0 ? (
      <View style={styles.jumpWrap}>
        <Text style={styles.jumpLabel}>Jump</Text>
        <View style={styles.jumpRow}>
          {jumpTargets.map((target) => (
            <Pressable
              key={target.dateKey}
              onPress={() => setPendingJumpDateKey(target.dateKey)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${target.label}`}
              style={({ pressed }) => [styles.jumpChip, pressed && { opacity: 0.72 }]}
            >
              <Text style={styles.jumpChipText}>{target.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null;

  const loadingBlock = <TaskListSkeleton variant="timeline" />;

  return (
    <FlatList<TimelineRow>
      ref={listRef}
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
        row.kind === "header" ? `header-${row.dateKey}` : row.task._id
      }
      renderItem={({ item: row, index }) => {
        if (row.kind === "header") {
          return (
            <View pointerEvents="box-none">
              <TimelineSectionHeader label={row.label} count={row.count} isToday={row.isToday} />
            </View>
          );
        }
        return renderItem(row.dateKey, {
          item: row.task,
          drag: noopDrag,
          isActive: false,
          getIndex: () => index,
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
      ListHeaderComponent={
        <>
          {overdueHeader}
          {jumpHeader}
        </>
      }
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
}

const styles = StyleSheet.create({
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
  jumpWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  jumpLabel: {
    color: colors.textMuted,
    ...typography.micro,
  },
  jumpRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  jumpChip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  jumpChipText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
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
  emptyWrap: {
    paddingTop: spacing.section * 2,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    alignItems: "center",
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
