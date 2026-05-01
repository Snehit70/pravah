/**
 * InboxScreen
 *
 * Renders the inbox tab: a draggable list of inbox tasks with pull-to-refresh,
 * empty state, and loading state. All task mutations are passed in from the
 * parent so this component stays free of mutation wiring.
 */

import type { JSX } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { Pressable, Text } from "react-native";
import DraggableFlatList, {
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { RefreshControl } from "react-native";
import { colors, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";

type InboxScreenProps = {
  tasks: MobileTask[];
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  onDragEnd: (original: MobileTask[], reordered: MobileTask[]) => void;
  onCapture: () => void;
  renderItem: (params: RenderItemParams<MobileTask>) => JSX.Element;
};

export function InboxScreen({
  tasks,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  onDragEnd,
  onCapture,
  renderItem,
}: InboxScreenProps) {
  // Snapshot tasks at drag-start so the parent can detect priority violations.
  const tasksRef = { current: tasks };

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

  const loadingBlock = (
    <Animated.View entering={FadeIn.duration(300)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Gathering the ledger.</Text>
      <Text style={styles.emptyText}>Your tasks are still syncing into view.</Text>
    </Animated.View>
  );

  return (
    <DraggableFlatList
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + 84,
      }}
      data={tasks}
      keyExtractor={(item) => item._id}
      renderItem={(params) => renderItem(params)}
      onDragEnd={({ data }) => onDragEnd(tasksRef.current, data)}
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
