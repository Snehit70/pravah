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

import { useMemo, useState, type JSX } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "../components/TaskCard";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { useIncrementalRowCount } from "../hooks/useIncrementalRowCount";

type FilterValue = "all" | "p1" | "p2" | "p3" | "none";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "p1", label: "P1" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
  { value: "none", label: "None" },
];

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter !== "all") {
        const bucket = task.priority ?? "none";
        if (bucket !== filter) return false;
      }
      if (!q) return true;
      const inTitle = task.title.toLowerCase().includes(q);
      const inDescription = task.description?.toLowerCase().includes(q) ?? false;
      return inTitle || inDescription;
    });
  }, [tasks, query, filter]);

  const isFiltering = query.trim() !== "" || filter !== "all";

  const emptyBlock = isFiltering ? (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No matches.</Text>
      <Text style={styles.emptyText}>Try a different word or clear filters.</Text>
      <Pressable
        onPress={() => {
          setQuery("");
          setFilter("all");
        }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Clear filters"
        style={({ pressed }) => [styles.emptyCtaWrap, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.emptyCta}>Clear filters</Text>
      </Pressable>
    </Animated.View>
  ) : (
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
  const allRows = buildInboxRows(filteredTasks);
  const visibleRowCount = useIncrementalRowCount(allRows.length);
  const rows = allRows.slice(0, visibleRowCount);
  const hasPendingRows = rows.length < allRows.length;

  const searchHeader = (
    <View style={styles.searchWrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search inbox"
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      <View style={styles.filterRow}>
        {FILTERS.map((option) => {
          const active = filter === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setFilter(option.value)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Filter ${option.label}`}
              style={({ pressed }) => [
                styles.filterChip,
                active && styles.filterChipActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

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
      ListHeaderComponent={tasks.length > 0 || isFiltering ? searchHeader : null}
      ListFooterComponent={
        hasPendingRows ? <Text style={styles.loadingMore}>Preparing more tasks...</Text> : null
      }
      ListEmptyComponent={isLoading ? loadingBlock : emptyBlock}
    />
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCardGlass,
    minHeight: 32,
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.bg,
  },
  emptyWrap: {
    paddingTop: spacing.section * 2,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.textPrimary,
    ...typography.headline,
    textAlign: "center",
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center",
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
  loadingMore: {
    color: colors.textSecondary,
    ...typography.micro,
    textAlign: "center",
    paddingTop: spacing.md,
  },
});
