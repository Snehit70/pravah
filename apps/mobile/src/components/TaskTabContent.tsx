import { useMemo, type JSX } from "react";
import { FlatList, RefreshControl, SectionList } from "react-native";
import type { RenderItemParams } from "react-native-draggable-flatlist";
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
  weekEnd,
  isRefreshing,
  isActiveListLoading,
  tabBarHeight,
  emptyBlock,
  loadingBlock,
  onRefresh,
  renderInboxTaskItem,
  renderTimelineTaskItem,
  renderCompletedTaskItem,
}: TaskTabContentProps) {
  const emptyDragParams = useMemo(
    () => ({ drag: () => undefined, isActive: false, getIndex: () => undefined }),
    []
  );
  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.bgCard}
    />
  );

  if (activeTab === "inbox") {
    return (
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        data={inboxTasks}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => renderInboxTaskItem({ item, ...emptyDragParams })}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListEmptyComponent={isActiveListLoading ? loadingBlock : emptyBlock}
      />
    );
  }

  if (activeTab === "timeline") {
    return (
      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        sections={timelineSections.map(([dateKey, tasksForDate]) => ({
          title: dateLabel(dateKey, today, tomorrow, weekEnd),
          dateKey,
          data: tasksForDate,
        }))}
        keyExtractor={(item) => item._id}
        renderItem={({ item, section }) =>
          renderTimelineTaskItem(section.dateKey, {
            item,
            ...emptyDragParams,
          })
        }
        renderSectionHeader={({ section }) => (
          <TimelineSectionHeader label={section.title} isToday={section.dateKey === today} />
        )}
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
