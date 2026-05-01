/**
 * CompletedScreen
 *
 * Renders the completed tab: a static (non-draggable) list of completed tasks,
 * sorted by most recently updated. Pull-to-refresh flushes the offline queue.
 */

import type { JSX } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { FlatList, RefreshControl, Text } from "react-native";
import { colors, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { TaskListSkeleton } from "../components/LoadingSkeleton";

type CompletedScreenProps = {
  tasks: MobileTask[];
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  renderItem: ({ item }: { item: MobileTask }) => JSX.Element;
};

export function CompletedScreen({
  tasks,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  renderItem,
}: CompletedScreenProps) {
  const emptyBlock = (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>A quiet ledger — for now.</Text>
      <Text style={styles.emptyText}>Closed loops will gather here.</Text>
    </Animated.View>
  );

  const loadingBlock = <TaskListSkeleton variant="completed" />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + 84,
      }}
      data={tasks}
      keyExtractor={(item) => item._id}
      renderItem={renderItem}
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
