/**
 * InboxScreen
 *
 * Renders the inbox tab: a list of inbox tasks with pull-to-refresh,
 * empty state, and loading state. All task mutations are passed in from the
 * parent so this component stays free of mutation wiring.
 *
 * Drag-to-reorder is currently disabled. react-native-draggable-flatlist
 * @4.0.3 silently fails to render under react-native-reanimated@4.x; the
 * fallback to plain FlatList keeps the list visible. The renderItem prop
 * still receives a RenderItemParams shape so the call sites in App.tsx stay
 * unchanged — drag is a no-op until a Reanimated-4-compatible reorder
 * library is in place.
 */

import type { JSX } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, Text } from "react-native";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import { colors, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { TaskListSkeleton } from "../components/LoadingSkeleton";

type InboxScreenProps = {
  tasks: MobileTask[];
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  onCapture: () => void;
  renderItem: (params: RenderItemParams<MobileTask>) => JSX.Element;
};

const noopDrag = () => {};

export function InboxScreen({
  tasks,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  onCapture,
  renderItem,
}: InboxScreenProps) {
  const emptyBlock = (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Nothing to carry forward.</Text>
      <Text style={styles.emptyText}>When something comes up, capture it.</Text>
      <Pressable
        onPress={onCapture}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Capture a task"
        style={({ pressed }) => [styles.emptyCtaWrap, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.emptyCta}>Capture a task</Text>
      </Pressable>
    </Animated.View>
  );

  const loadingBlock = <TaskListSkeleton variant="inbox" />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + 84,
      }}
      data={tasks}
      keyExtractor={(item) => item._id}
      renderItem={({ item, index }) =>
        renderItem({
          item,
          drag: noopDrag,
          isActive: false,
          getIndex: () => index,
        })
      }
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
  emptyCtaWrap: {
    marginTop: spacing.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  emptyCta: {
    color: colors.accent,
    ...typography.micro,
  },
};
