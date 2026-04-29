import { useMemo, type JSX } from "react";
import { FlatList, RefreshControl } from "react-native";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { dateLabel } from "../lib/dates";
import { colors, spacing } from "../theme/tokens";
import type { MobileTask } from "./TaskCard";
import type { TabKey } from "./BottomTabBar";
import { TimelineSectionHeader } from "./TimelineSectionHeader";

type TaskTabContentProps = {
  activeTab: TabKey;
  inboxTasks: MobileTask[];
  timelineSections: [string, MobileTask[]][];
  completedTasks: MobileTask[];
  today: string;
  tomorrow: string;
  weekEnd: string;
  isRefreshing: boolean;
  isActiveListLoading: boolean;
  tabBarHeight: number;
  emptyBlock: JSX.Element;
  loadingBlock: JSX.Element;
  onRefresh: () => Promise<void>;
  onInboxDragEnd: (original: MobileTask[], data: MobileTask[]) => Promise<void>;
  onTimelineDragEnd: (dateKey: string, original: MobileTask[], data: MobileTask[]) => Promise<void>;
  onTimelineDragInvalid: () => void;
  renderInboxTaskItem: (params: RenderItemParams<MobileTask>) => JSX.Element;
  renderTimelineTaskItem: (dateKey: string, params: RenderItemParams<MobileTask>) => JSX.Element;
  renderCompletedTaskItem: ({ item }: { item: MobileTask }) => JSX.Element;
};

type TimelineHeaderRow = {
  key: string;
  kind: "header";
  dateKey: string;
  label: string;
};

type TimelineTaskRow = {
  key: string;
  kind: "task";
  dateKey: string;
  task: MobileTask;
};

type TimelineRow = TimelineHeaderRow | TimelineTaskRow;

export function TaskTabContent({
  activeTab,
  inboxTasks,
  timelineSections,
  completedTasks,
  today,
  tomorrow,
  weekEnd,
  isRefreshing,
  isActiveListLoading,
  tabBarHeight,
  emptyBlock,
  loadingBlock,
  onRefresh,
  onInboxDragEnd,
  onTimelineDragEnd,
  onTimelineDragInvalid,
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

  const timelineRows = useMemo<TimelineRow[]>(
    () =>
      timelineSections.flatMap(([dateKey, tasksForDate]) => [
        {
          key: `header-${dateKey}`,
          kind: "header" as const,
          dateKey,
          label: dateLabel(dateKey, today, tomorrow, weekEnd),
        },
        ...tasksForDate.map((task) => ({
          key: task._id,
          kind: "task" as const,
          dateKey,
          task,
        })),
      ]),
    [timelineSections, today, tomorrow, weekEnd]
  );

  if (activeTab === "inbox") {
    return (
      <DraggableFlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        data={inboxTasks}
        keyExtractor={(item) => item._id}
        renderItem={renderInboxTaskItem}
        onDragEnd={({ data }) => void onInboxDragEnd(inboxTasks, data)}
        activationDistance={10}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListEmptyComponent={isActiveListLoading ? loadingBlock : emptyBlock}
      />
    );
  }

  if (activeTab === "timeline") {
    return (
      <DraggableFlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        data={timelineRows}
        keyExtractor={(item) => item.key}
        renderItem={({ item, drag, isActive }) =>
          item.kind === "header" ? (
            <TimelineSectionHeader label={item.label} isToday={item.dateKey === today} />
          ) : (
            renderTimelineTaskItem(item.dateKey, {
              item: item.task,
              drag,
              isActive,
              getIndex: () => undefined,
            })
          )
        }
        onDragEnd={({ from, to, data }) => {
          const fromRow = timelineRows[from];
          const toRow = data[to];

          if (!fromRow || fromRow.kind !== "task" || !toRow || toRow.kind !== "task") {
            onTimelineDragInvalid();
            return;
          }

          if (fromRow.dateKey !== toRow.dateKey) {
            onTimelineDragInvalid();
            return;
          }

          const original = timelineRows
            .filter(
              (row): row is TimelineTaskRow => row.kind === "task" && row.dateKey === fromRow.dateKey
            )
            .map((row) => row.task);
          const reordered = data
            .filter(
              (row): row is TimelineTaskRow => row.kind === "task" && row.dateKey === fromRow.dateKey
            )
            .map((row) => row.task);

          void onTimelineDragEnd(fromRow.dateKey, original, reordered);
        }}
        activationDistance={10}
        dragItemOverflow
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={isActiveListLoading ? loadingBlock : emptyBlock}
      />
    );
  }

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
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
