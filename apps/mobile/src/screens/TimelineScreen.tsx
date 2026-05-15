/**
 * TimelineScreen
 *
 * Renders the timeline tab: date-grouped sections. Drag-to-reorder is
 * currently disabled — see InboxScreen for the same constraint
 * (RNDFL@4 / Reanimated@4 incompatibility).
 */

import { useEffect, useState, type JSX } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { FlatList, RefreshControl, Text, View } from "react-native";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import { colors, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { dateLabel } from "../lib/dates";

type TimelineRow =
  | { kind: "header"; dateKey: string; label: string; isToday: boolean }
  | { kind: "task"; dateKey: string; task: MobileTask };

const INITIAL_TIMELINE_ROWS = 24;
const TIMELINE_ROW_BATCH_SIZE = 24;
const TIMELINE_ROW_BATCH_DELAY_MS = 32;

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
};

const noopDrag = () => {};

function countTimelineRows(sections: [string, MobileTask[]][]) {
  let count = 0;
  for (const [, tasks] of sections) count += 1 + tasks.length;
  return count;
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
}: TimelineScreenProps) {
  const totalRows = countTimelineRows(sections);
  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_TIMELINE_ROWS);

  useEffect(() => {
    if (visibleRowCount >= totalRows) return;
    const timeout = setTimeout(() => {
      setVisibleRowCount((count) =>
        Math.min(count + TIMELINE_ROW_BATCH_SIZE, totalRows)
      );
    }, TIMELINE_ROW_BATCH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [totalRows, visibleRowCount]);

  // Build only the rows currently released to FlatList. Large timelines still
  // hydrate quickly, but the first paint avoids handing every row to React.
  const rows = buildTimelineRows(
    sections,
    today,
    tomorrow,
    weekEnd,
    Math.min(visibleRowCount, totalRows)
  );
  const hasPendingRows = rows.length < totalRows;

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
              <TimelineSectionHeader label={row.label} isToday={row.isToday} />
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
      ListFooterComponent={
        hasPendingRows ? <Text style={styles.loadingMore}>Preparing more tasks...</Text> : null
      }
      ListEmptyComponent={isLoading ? loadingBlock : emptyBlock}
    />
  );
}

const styles = {
  emptyWrap: {
    paddingTop: spacing.section * 2,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    alignItems: "center" as const,
  },
  emptyTitle: {
    color: colors.textPrimary,
    ...typography.headline,
    textAlign: "center" as const,
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center" as const,
  },
  loadingMore: {
    color: colors.textSecondary,
    ...typography.micro,
    textAlign: "center" as const,
    paddingTop: spacing.md,
  },
};
