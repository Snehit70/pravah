import { useMemo, type JSX } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { dateLabel } from "../lib/dates";
import { colors, spacing } from "../theme/tokens";
import type { MobileTask } from "./TaskCard";
import type { TabKey } from "./BottomTabBar";
import { TimelineSectionHeader } from "./TimelineSectionHeader";

// Mixed row type for the timeline's single DraggableFlatList.
// Header rows are non-draggable separators; task rows carry the real drag handle.
type TimelineRow =
  | { kind: "header"; dateKey: string; label: string; isToday: boolean }
  | { kind: "task"; dateKey: string; task: MobileTask };

type TaskTabContentProps = {
  activeTab: TabKey;
  inboxTasks: MobileTask[];
  timelineSections: [string, MobileTask[]][];
  completedTasks: MobileTask[];
  today: string;
  tomorrow: string;
  isRefreshing: boolean;
  isActiveListLoading: boolean;
  tabBarHeight: number;
  emptyBlock: JSX.Element;
  loadingBlock: JSX.Element;
  onRefresh: () => Promise<void>;
  onInboxDragEnd: (original: MobileTask[], reordered: MobileTask[]) => void;
  onTimelineDragEnd: (dateKey: string, original: MobileTask[], reordered: MobileTask[]) => void;
  renderInboxTaskItem: (params: RenderItemParams<MobileTask>) => JSX.Element;
  renderTimelineTaskItem: (dateKey: string, params: RenderItemParams<MobileTask>) => JSX.Element;
  renderCompletedTaskItem: ({ item }: { item: MobileTask }) => JSX.Element;
};

export function TaskTabContent({
  activeTab,
  inboxTasks,
  timelineSections,
  completedTasks,
  today,
  tomorrow,
  isRefreshing,
  isActiveListLoading,
  tabBarHeight,
  emptyBlock,
  loadingBlock,
  onRefresh,
  onInboxDragEnd,
  onTimelineDragEnd,
  renderInboxTaskItem,
  renderTimelineTaskItem,
  renderCompletedTaskItem,
}: TaskTabContentProps) {
  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.bgCard}
    />
  );

  // Snapshot of inboxTasks at drag-start so we can detect priority violations.
  // DraggableFlatList calls onDragEnd with the reordered array; we compare
  // against the pre-drag snapshot stored in this closure.
  const inboxTasksRef = { current: inboxTasks };

  // Flat mixed-row array for the timeline DraggableFlatList.
  // Headers interleaved between day groups are non-draggable.
  const timelineRows = useMemo<TimelineRow[]>(() => {
    const rows: TimelineRow[] = [];
    for (const [dateKey, tasksForDate] of timelineSections) {
      rows.push({
        kind: "header",
        dateKey,
        label: dateLabel(dateKey, today, tomorrow),
        isToday: dateKey === today,
      });
      for (const task of tasksForDate) {
        rows.push({ kind: "task", dateKey, task });
      }
    }
    return rows;
  }, [timelineSections, today, tomorrow]);

  if (activeTab === "inbox") {
    return (
      <DraggableFlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        data={inboxTasks}
        keyExtractor={(item) => item._id}
        renderItem={(params) => renderInboxTaskItem(params)}
        onDragEnd={({ data }) => onInboxDragEnd(inboxTasksRef.current, data)}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListEmptyComponent={isActiveListLoading ? loadingBlock : emptyBlock}
        activationDistance={8}
      />
    );
  }

  if (activeTab === "timeline") {
    // Snapshot the per-date task arrays before the drag so onDragEnd can do
    // the cross-day check and priority-boundary check correctly.
    const sectionSnapshots = new Map<string, MobileTask[]>(
      timelineSections.map(([dateKey, tasks]) => [dateKey, tasks])
    );

    return (
      <DraggableFlatList<TimelineRow>
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        data={timelineRows}
        keyExtractor={(row) => (row.kind === "header" ? `header-${row.dateKey}` : row.task._id)}
        renderItem={({ item: row, drag, isActive, getIndex }) => {
          if (row.kind === "header") {
            return (
              <View pointerEvents="box-none">
                <TimelineSectionHeader label={row.label} isToday={row.isToday} />
              </View>
            );
          }
          return renderTimelineTaskItem(row.dateKey, {
            item: row.task,
            drag,
            isActive,
            getIndex,
          });
        }}
        onDragEnd={({ data: newRows }) => {
          // Cross-day guard: walk the post-drop row list in order, tracking
          // which section we are in by the last header seen. If any task row's
          // embedded dateKey does not match that section, the user dragged it
          // across a day boundary — reject the whole drop so the list snaps back
          // and no mutation fires.
          let currentSectionDateKey: string | null = null;
          for (const row of newRows) {
            if (row.kind === "header") {
              currentSectionDateKey = row.dateKey;
              continue;
            }
            if (currentSectionDateKey !== null && row.dateKey !== currentSectionDateKey) {
              // Cross-day drag detected — abort. DraggableFlatList will re-render
              // from the unchanged `timelineRows` prop, snapping back to the
              // pre-drag order without any server call.
              return;
            }
          }

          // Same-day reorder: group task rows by date using the pre-drag section
          // snapshots so the handler can check priority boundaries correctly.
          const byDate = new Map<string, MobileTask[]>();
          for (const row of newRows) {
            if (row.kind !== "task") continue;
            const bucket = byDate.get(row.dateKey) ?? [];
            bucket.push(row.task);
            byDate.set(row.dateKey, bucket);
          }
          for (const [dateKey, reordered] of byDate.entries()) {
            const original = sectionSnapshots.get(dateKey) ?? reordered;
            onTimelineDragEnd(dateKey, original, reordered);
          }
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListEmptyComponent={isActiveListLoading ? loadingBlock : emptyBlock}
        activationDistance={8}
      />
    );
  }

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + 84,
      }}
      data={completedTasks}
      keyExtractor={(item) => item._id}
      renderItem={renderCompletedTaskItem}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      ListEmptyComponent={isActiveListLoading ? loadingBlock : emptyBlock}
    />
  );
}
