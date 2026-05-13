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
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
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

type PriorityBucket = "p1" | "p2" | "p3" | "none";

type InboxRow =
  | { kind: "header"; bucket: PriorityBucket; label: string }
  | { kind: "task"; task: MobileTask };

const BUCKET_ORDER: PriorityBucket[] = ["p1", "p2", "p3", "none"];
const BUCKET_LABEL: Record<PriorityBucket, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
  none: "Unprioritized",
};

function bucketOf(task: MobileTask): PriorityBucket {
  return task.priority ?? "none";
}

// Build a mixed header/task row list. Inbox tasks arrive pre-sorted
// (priority desc, then position), so a single pass keeps the order while
// inserting one quiet header per non-empty bucket.
function buildInboxRows(tasks: MobileTask[]): InboxRow[] {
  const grouped = new Map<PriorityBucket, MobileTask[]>();
  for (const task of tasks) {
    const key = bucketOf(task);
    const existing = grouped.get(key) ?? [];
    existing.push(task);
    grouped.set(key, existing);
  }
  const rows: InboxRow[] = [];
  for (const bucket of BUCKET_ORDER) {
    const inBucket = grouped.get(bucket);
    if (!inBucket || inBucket.length === 0) continue;
    rows.push({ kind: "header", bucket, label: BUCKET_LABEL[bucket] });
    for (const task of inBucket) rows.push({ kind: "task", task });
  }
  return rows;
}

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
  const rows = buildInboxRows(tasks);

  return (
    <FlatList<InboxRow>
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
        row.kind === "header" ? `header-${row.bucket}` : row.task._id
      }
      renderItem={({ item: row, index }) => {
        if (row.kind === "header") {
          return (
            <View style={styles.sectionHeader} pointerEvents="box-none">
              <Text style={styles.sectionLabel}>{row.label}</Text>
            </View>
          );
        }
        return renderItem({
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
  sectionHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sectionLabel: {
    color: colors.textMuted,
    ...typography.micro,
  },
};
