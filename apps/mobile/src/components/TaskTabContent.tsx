import type { JSX } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
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
  renderInboxTaskItem: (params: RenderItemParams<MobileTask>) => JSX.Element;
  renderTimelineTaskItem: (dateKey: string) => (params: RenderItemParams<MobileTask>) => JSX.Element;
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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {isActiveListLoading ? (
          loadingBlock
        ) : timelineSections.length ? (
          timelineSections.map(([dateKey, tasksForDate]) => (
            <View key={dateKey}>
              <TimelineSectionHeader
                label={dateLabel(dateKey, today, tomorrow, weekEnd)}
                isToday={dateKey === today}
              />
              <DraggableFlatList
                data={tasksForDate}
                keyExtractor={(item) => item._id}
                renderItem={renderTimelineTaskItem(dateKey)}
                onDragEnd={({ data }) => void onTimelineDragEnd(dateKey, tasksForDate, data)}
                activationDistance={10}
                scrollEnabled={false}
                containerStyle={{ marginBottom: spacing.sm }}
              />
            </View>
          ))
        ) : (
          emptyBlock
        )}
      </ScrollView>
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
