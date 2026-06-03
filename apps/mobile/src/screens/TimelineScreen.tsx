/**
 * TimelineScreen
 *
 * Renders the timeline tab: date-grouped sections for today and beyond.
 * Overdue tasks are NOT listed inline — they collapse into a single muted,
 * tappable "Overdue · N" header that opens the triage sheet, so the timeline
 * opens on what's actionable instead of a wall of backlog. Drag-to-reorder is
 * currently disabled (RNDFL@4 / Reanimated@4 incompatibility).
 */

import type { JSX } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import { colors, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { dateLabel } from "../lib/dates";
import { useIncrementalRowCount } from "../hooks/useIncrementalRowCount";

type TimelineRow =
  | { kind: "header"; dateKey: string; label: string; isToday: boolean; count: number }
  | { kind: "task"; dateKey: string; task: MobileTask };

type TimelineScreenProps = {
  sections: [string, MobileTask[]][];
  today: string;
  tomorrow: string;
  weekEnd: string;
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
  weekEnd: string,
  maxRows: number
) {
  const rows: TimelineRow[] = [];

  for (const [dateKey, tasks] of sections) {
    if (rows.length >= maxRows) break;
    rows.push({
      kind: "header",
      dateKey,
      label: dateLabel(dateKey, today, tomorrow, weekEnd),
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
  weekEnd,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  renderItem,
  overdueCount,
  onOpenOverdue,
}: TimelineScreenProps) {
  const { future, overdueCount: localOverdue } = splitOverdue(sections, today);
  const effectiveOverdue = overdueCount ?? localOverdue;

  const totalRows = countTimelineRows(future);
  const visibleRowCount = useIncrementalRowCount(totalRows);

  // Build only the rows currently released to FlatList. Large timelines still
  // hydrate quickly, but the first paint avoids handing every row to React.
  const rows = buildTimelineRows(future, today, tomorrow, weekEnd, visibleRowCount);
  const hasPendingRows = rows.length < totalRows;

  const overdueHeader =
    effectiveOverdue > 0 && onOpenOverdue ? (
      <Pressable
        onPress={onOpenOverdue}
        style={({ pressed }) => [styles.overdueBar, pressed && styles.overdueBarPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${effectiveOverdue} overdue. Open triage.`}
      >
        <Text style={styles.overdueLabel}>Overdue · {effectiveOverdue}</Text>
        <Text style={styles.overdueChevron}>›</Text>
      </Pressable>
    ) : null;

  const emptyBlock = (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>An open day.</Text>
      <Text style={styles.emptyText}>Move a task from the inbox to fill it.</Text>
    </Animated.View>
  );

  const loadingBlock = <TaskListSkeleton variant="timeline" />;

  return (
    <FlatList<TimelineRow>
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
      ListHeaderComponent={overdueHeader}
      ListFooterComponent={
        hasPendingRows ? <Text style={styles.loadingMore}>Preparing more tasks...</Text> : null
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
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  overdueBarPressed: { opacity: 0.6 },
  overdueLabel: { color: colors.textMuted, ...typography.micro },
  overdueChevron: { color: colors.textMuted, ...typography.micro },
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
