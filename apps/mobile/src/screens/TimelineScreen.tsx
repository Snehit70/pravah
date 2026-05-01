/**
 * TimelineScreen
 *
 * Renders the timeline tab: date-grouped draggable sections. Cross-day drag
 * is blocked here; same-day reorder is delegated to the parent via onDragEnd.
 */

import type { JSX } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { Text, View, RefreshControl } from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { colors, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { dateLabel } from "../lib/dates";

type TimelineRow =
  | { kind: "header"; dateKey: string; label: string; isToday: boolean }
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
  onDragEnd: (dateKey: string, original: MobileTask[], reordered: MobileTask[]) => void;
  renderItem: (dateKey: string, params: RenderItemParams<MobileTask>) => JSX.Element;
};

export function TimelineScreen({
  sections,
  today,
  tomorrow,
  weekEnd,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  onDragEnd,
  renderItem,
}: TimelineScreenProps) {
  // Build flat mixed-row array: headers interleaved between day groups.
  const rows: TimelineRow[] = [];
  const sectionSnapshots = new Map<string, MobileTask[]>();

  for (const [dateKey, tasks] of sections) {
    sectionSnapshots.set(dateKey, tasks);
    rows.push({
      kind: "header",
      dateKey,
      label: dateLabel(dateKey, today, tomorrow, weekEnd),
      isToday: dateKey === today,
    });
    for (const task of tasks) {
      rows.push({ kind: "task", dateKey, task });
    }
  }

  const emptyBlock = (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>An open day.</Text>
      <Text style={styles.emptyText}>Move a task from the inbox to fill it.</Text>
    </Animated.View>
  );

  const loadingBlock = (
    <Animated.View entering={FadeIn.duration(300)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Gathering the ledger.</Text>
      <Text style={styles.emptyText}>Your tasks are still syncing into view.</Text>
    </Animated.View>
  );

  return (
    <DraggableFlatList<TimelineRow>
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + 84,
      }}
      data={rows}
      keyExtractor={(row) =>
        row.kind === "header" ? `header-${row.dateKey}` : row.task._id
      }
      renderItem={({ item: row, drag, isActive, getIndex }) => {
        if (row.kind === "header") {
          return (
            <View pointerEvents="box-none">
              <TimelineSectionHeader label={row.label} isToday={row.isToday} />
            </View>
          );
        }
        return renderItem(row.dateKey, {
          item: row.task,
          drag,
          isActive,
          getIndex,
        });
      }}
      onDragEnd={({ data: newRows }) => {
        // Cross-day guard: if any task row's dateKey doesn't match the last
        // header seen, the user dragged across a day boundary — abort.
        let currentSectionDateKey: string | null = null;
        for (const row of newRows) {
          if (row.kind === "header") {
            currentSectionDateKey = row.dateKey;
            continue;
          }
          if (
            currentSectionDateKey !== null &&
            row.dateKey !== currentSectionDateKey
          ) {
            return;
          }
        }

        // Same-day reorder: fire per-date handler with pre-drag snapshots.
        const byDate = new Map<string, MobileTask[]>();
        for (const row of newRows) {
          if (row.kind !== "task") continue;
          const bucket = byDate.get(row.dateKey) ?? [];
          bucket.push(row.task);
          byDate.set(row.dateKey, bucket);
        }
        for (const [dateKey, reordered] of byDate.entries()) {
          const original = sectionSnapshots.get(dateKey) ?? reordered;
          onDragEnd(dateKey, original, reordered);
        }
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
      ListEmptyComponent={isLoading ? loadingBlock : emptyBlock}
      activationDistance={8}
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
};
