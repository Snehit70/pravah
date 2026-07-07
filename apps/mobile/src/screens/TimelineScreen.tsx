/**
 * TimelineScreen
 *
 * Renders the timeline tab: date-grouped sections for today and beyond.
 * Overdue tasks are NOT listed inline — they collapse into a single muted,
 * tappable "Overdue · N" header that opens the triage sheet, so the timeline
 * opens on what's actionable instead of a wall of backlog. Drag-to-reorder is
 * currently disabled (RNDFL@4 / Reanimated@4 incompatibility).
 */

import { useState, type JSX } from "react";
import Animated, { FadeIn, FadeOut, withDelay, withTiming } from "react-native-reanimated";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { RenderItemParams } from "react-native-draggable-flatlist";
import Svg, { Line, Rect } from "react-native-svg";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import { TimelineSectionHeader } from "../components/TimelineSectionHeader";
import { TimelineDayCarousel } from "../components/TimelineDayCarousel";
import { TaskListSkeleton } from "../components/LoadingSkeleton";
import { dateLabel } from "../lib/dates";
import type { TimelineLayout } from "../lib/userPreferences";
import { useIncrementalRowCount } from "../hooks/useIncrementalRowCount";
import { useReducedMotion } from "../hooks/useReducedMotion";

type TimelineRow =
  | { kind: "header"; dateKey: string; label: string; isToday: boolean; count: number }
  | { kind: "task"; dateKey: string; task: MobileTask };

type TimelineScreenProps = {
  sections: [string, MobileTask[]][];
  today: string;
  tomorrow: string;
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  renderItem: (dateKey: string, params: RenderItemParams<MobileTask>) => JSX.Element;
  /** Total overdue count (from the workspace buckets). Falls back to a local
   *  count of the dropped sections when not supplied. */
  overdueCount?: number;
  /** Opens the overdue triage sheet. Omitted while actions are unavailable. */
  onOpenOverdue?: () => void;
  /** Timeline layout preference — the compact list (default) or the
   *  comfortable day-card carousel. */
  layout?: TimelineLayout;
  /** Carousel-mode slim rows call these directly instead of `renderItem`. */
  onCompleteTask?: (id: Id<"tasks">) => void;
  onReopenTask?: (id: Id<"tasks">) => void;
  onEditTask?: (task: MobileTask) => void;
  getGoalName?: (taskId: string) => string | undefined;
};

const noopDrag = () => {};
const DEFAULT_VISIBLE_SECTION_COUNT = 3;

/** Crossfade for the layout toggle (PRD §5): incoming layout fades in over
 *  ~220ms with a subtle 0.98→1 scale, delayed so it overlaps the last ~60ms
 *  of the outgoing fade. */
function layoutEntering() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.98 }] },
    animations: {
      opacity: withDelay(120, withTiming(1, { duration: 220 })),
      transform: [{ scale: withDelay(120, withTiming(1, { duration: 220 })) }],
    },
  };
}

function countTimelineRows(sections: [string, MobileTask[]][]) {
  let count = 0;
  for (const [, tasks] of sections) count += 1 + tasks.length;
  return count;
}

/** Drop overdue out of the listed sections; return the rest plus how many
 *  overdue tasks were removed. Overdue lives in the collapsed header instead. */
function splitOverdue(
  sections: [string, MobileTask[]][],
  today: string
): { future: [string, MobileTask[]][]; overdueCount: number } {
  const future: [string, MobileTask[]][] = [];
  let overdueCount = 0;
  for (const [dateKey, tasks] of sections) {
    if (dateKey === "overdue" || dateKey < today) {
      overdueCount += tasks.length;
    } else {
      future.push([dateKey, tasks]);
    }
  }
  return { future, overdueCount };
}

function buildTimelineRows(
  sections: [string, MobileTask[]][],
  today: string,
  tomorrow: string,
  maxRows: number
) {
  const rows: TimelineRow[] = [];

  for (const [dateKey, tasks] of sections) {
    if (rows.length >= maxRows) break;
    rows.push({
      kind: "header",
      dateKey,
      label: dateLabel(dateKey, today, tomorrow),
      isToday: dateKey === today,
      count: tasks.length,
    });

    for (const task of tasks) {
      if (rows.length >= maxRows) break;
      rows.push({ kind: "task", dateKey, task });
    }
  }

  return rows;
}

function TimelineEmptyIcon({ size = 28 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.textSecondary}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={3.5} y={5} width={17} height={15} rx={3} />
      <Line x1={8} y1={3.75} x2={8} y2={7.25} />
      <Line x1={16} y1={3.75} x2={16} y2={7.25} />
      <Line x1={3.5} y1={9} x2={20.5} y2={9} />
      <Rect x={10.5} y={12} width={3} height={3} rx={1} />
    </Svg>
  );
}

export function TimelineScreen({
  sections,
  today,
  tomorrow,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  renderItem,
  overdueCount,
  onOpenOverdue,
  layout = "list",
  onCompleteTask,
  onReopenTask,
  onEditTask,
  getGoalName,
}: TimelineScreenProps) {
  const reducedMotion = useReducedMotion();
  const [showAllSections, setShowAllSections] = useState(false);
  // Entering animations also fire on first mount; the tab transition already
  // animates that, so the crossfade only arms once the layout prop changes.
  const [lastLayout, setLastLayout] = useState(layout);
  const [crossfadeArmed, setCrossfadeArmed] = useState(false);
  if (lastLayout !== layout) {
    setLastLayout(layout);
    if (!crossfadeArmed) setCrossfadeArmed(true);
  }
  const { future, overdueCount: localOverdue } = splitOverdue(sections, today);
  const effectiveOverdue = overdueCount ?? localOverdue;
  const sourceSections = onOpenOverdue ? future : sections;
  const visibleSections = showAllSections
    ? sourceSections
    : sourceSections.slice(0, DEFAULT_VISIBLE_SECTION_COUNT);
  const laterSections = showAllSections ? [] : sourceSections.slice(DEFAULT_VISIBLE_SECTION_COUNT);
  const laterTaskCount = laterSections.reduce((sum, [, tasks]) => sum + tasks.length, 0);

  const totalRows = countTimelineRows(visibleSections);
  const visibleRowCount = useIncrementalRowCount(totalRows);

  // Build only the rows currently released to FlatList. Large timelines still
  // hydrate quickly, but the first paint avoids handing every row to React.
  const rows = buildTimelineRows(visibleSections, today, tomorrow, visibleRowCount);
  const hasPendingRows = rows.length < totalRows;

  const overdueHeader =
    effectiveOverdue > 0 && onOpenOverdue ? (
      <Pressable
        onPress={onOpenOverdue}
        style={({ pressed }) => [styles.overdueBar, pressed && styles.overdueBarPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${effectiveOverdue} overdue. Open triage.`}
      >
        <View style={styles.overdueCopy}>
          <Text style={styles.overdueLabel}>Overdue · {effectiveOverdue}</Text>
          <Text style={styles.overdueHelp}>Reflow or choose the next real date.</Text>
        </View>
        <Text style={styles.overdueChevron}>Review</Text>
      </Pressable>
    ) : null;

  const emptyBlock = (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(400)} style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <TimelineEmptyIcon />
      </View>
      <Text style={styles.emptyTitle}>Today is clear.</Text>
      <Text style={styles.emptyText}>
        Upcoming work will appear here when it has a Deadline. Use Capture or Inbox to
        place the next task in time.
      </Text>
    </Animated.View>
  );

  const loadingBlock = <TaskListSkeleton variant="timeline" />;

  const animateCrossfade = crossfadeArmed && !reducedMotion;
  const entering = animateCrossfade ? layoutEntering : undefined;
  const exiting = animateCrossfade ? FadeOut.duration(180) : undefined;

  const listBody = (
    <FlatList<TimelineRow>
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
        row.kind === "header" ? `header-${row.dateKey}` : row.task._id
      }
      renderItem={({ item: row, index }) => {
        if (row.kind === "header") {
          return (
            <View pointerEvents="box-none">
              <TimelineSectionHeader label={row.label} count={row.count} isToday={row.isToday} />
            </View>
          );
        }
        return renderItem(row.dateKey, {
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
      ListHeaderComponent={overdueHeader}
      ListFooterComponent={
        <>
          {laterTaskCount > 0 ? (
            <Pressable
              onPress={() => setShowAllSections((current) => !current)}
              style={({ pressed }) => [styles.laterSummary, pressed && styles.laterSummaryPressed]}
              accessibilityRole="button"
              accessibilityLabel={`${showAllSections ? "Collapse" : "Show"} ${laterTaskCount} later tasks`}
            >
              <View style={styles.laterSummaryRow}>
                <Text style={styles.laterSummaryText}>Later · {laterTaskCount} tasks</Text>
                <Text style={styles.laterSummaryAction}>{showAllSections ? "Collapse" : "Show"}</Text>
              </View>
            </Pressable>
          ) : null}
          {hasPendingRows ? <Text style={styles.loadingMore}>Preparing more tasks...</Text> : null}
        </>
      }
      ListEmptyComponent={isLoading ? loadingBlock : emptyBlock}
    />
  );

  const carouselBody = isLoading ? (
    loadingBlock
  ) : (
    <TimelineDayCarousel
      sections={sections}
      today={today}
      tomorrow={tomorrow}
      isRefreshing={isRefreshing}
      tabBarHeight={tabBarHeight}
      onRefresh={onRefresh}
      overdueCount={overdueCount}
      onOpenOverdue={onOpenOverdue}
      onCompleteTask={onCompleteTask}
      onReopenTask={onReopenTask}
      onEditTask={onEditTask}
      getGoalName={getGoalName}
      emptyComponent={emptyBlock}
    />
  );

  // Both layouts mount in an absolute-fill wrapper so the exiting one can
  // fade out in place without doubling the flex layout during the overlap.
  return (
    <View style={styles.layoutRoot}>
      {layout === "carousel" ? (
        <Animated.View key="carousel" style={styles.layoutFill} entering={entering} exiting={exiting}>
          {carouselBody}
        </Animated.View>
      ) : (
        <Animated.View key="list" style={styles.layoutFill} entering={entering} exiting={exiting}>
          {listBody}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layoutRoot: {
    flex: 1,
  },
  layoutFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Muted, tappable doorway to the triage sheet — count + chevron only, no
  // alarm color (per the overdue-handling design: tone fixed by behavior).
  overdueBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  overdueBarPressed: { opacity: 0.6 },
  overdueCopy: {
    flex: 1,
    gap: 2,
  },
  overdueLabel: { color: colors.textPrimary, ...typography.micro },
  overdueHelp: { color: colors.textMuted, ...typography.bodyMd },
  overdueChevron: { color: colors.accent, ...typography.bodyMd },
  laterSummary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  laterSummaryPressed: {
    opacity: 0.65,
  },
  laterSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  laterSummaryText: {
    color: colors.textMuted,
    ...typography.micro,
  },
  laterSummaryAction: {
    color: colors.accent,
    ...typography.bodyMd,
  },
  emptyWrap: {
    paddingTop: spacing.section * 2,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.xs,
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
  loadingMore: {
    color: colors.textSecondary,
    ...typography.micro,
    textAlign: "center",
    paddingTop: spacing.md,
  },
});
