/**
 * TimelineDayCarousel — the Timeline's "comfortable" layout (PRD:
 * docs/prd/mobile-timeline-comfortable-carousel.md).
 *
 * A horizontal peek carousel of day cards: each day with tasks is one card
 * ~88% of screen width with the next day peeking in, snap paging per card.
 * Overdue collapses into a single muted leftmost card with the same "Review"
 * door as compact mode. Rows are slim (checkbox, title, goal chip, priority);
 * per-row swipe actions are always disabled here — horizontal drags belong to
 * the carousel.
 *
 * Day-clear rule: completing the last task on the viewed card does not remove
 * the card. Locally completed tasks are held (checked, uncheckable) and the
 * card shows a quiet "Day clear" state until the user swipes away or leaves
 * the tab.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts, motion, radii, shadow, spacing, typography } from "../theme/tokens";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "./TaskCard";
import { taskEmphasisColor } from "../lib/taskAccent";
import { CheckIcon } from "./UiIcons";
import { dateLabel, weekdayDate } from "../lib/dates";
import {
  buildDayCards,
  cardKey,
  dotStripState,
  type DayCarouselCard,
} from "../lib/timelineCarousel";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useUserPreferences } from "../hooks/useUserPreferences";

type TimelineDayCarouselProps = {
  sections: [string, MobileTask[]][];
  today: string;
  tomorrow: string;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  overdueCount?: number;
  onOpenOverdue?: () => void;
  onCompleteTask?: (id: Id<"tasks">) => void;
  onReopenTask?: (id: Id<"tasks">) => void;
  onEditTask?: (task: MobileTask) => void;
  getGoalName?: (taskId: string) => string | undefined;
  /** Rendered when no cards exist — same empty state as compact mode. */
  emptyComponent: JSX.Element;
};

/** Card takes ~88% of the window so the next day peeks at the trailing edge. */
const CARD_WIDTH_RATIO = 0.88;
const CARD_GAP = spacing.md;

// ─── Slim task row ──────────────────────────────────────────────────────────

type SlimTaskRowProps = {
  task: MobileTask;
  completed: boolean;
  goalName?: string;
  onToggle?: (task: MobileTask, completed: boolean) => void;
  onPress?: (task: MobileTask) => void;
};

/** Checkbox leading a stacked body: title, one-line description, then a
 *  goal · priority meta line. Completion is the checkbox; tap opens Edit;
 *  no swipe actions in this layout. */
function SlimTaskRow({ task, completed, goalName, onToggle, onPress }: SlimTaskRowProps) {
  const { prefs } = useUserPreferences();
  const compactDensity = prefs.density === "compact";
  const taskAccent = taskEmphasisColor(prefs.taskColorScheme);

  const hasDescription = Boolean(task.description) && !completed;
  const showPriority = Boolean(task.priority) && !completed;
  const hasMetaLine = Boolean(goalName) || showPriority;

  return (
    <Pressable
      onPress={onPress ? () => onPress(task) : undefined}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        compactDensity && styles.rowCompact,
        pressed && onPress && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      accessibilityHint="Double tap to edit."
    >
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onToggle?.(task, completed);
        }}
        disabled={!onToggle}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={
          completed ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`
        }
        style={({ pressed }) => [
          styles.checkbox,
          completed && styles.checkboxDone,
          pressed && onToggle && { opacity: 0.68 },
          !onToggle && { opacity: 0.45 },
        ]}
      >
        {completed ? <CheckIcon size={14} color={colors.textInverse} strokeWidth={2.4} /> : null}
      </Pressable>

      <View style={styles.rowBody}>
        <Text
          style={[styles.rowTitle, completed && styles.rowTitleDone]}
          numberOfLines={hasDescription ? 1 : 2}
          ellipsizeMode="tail"
        >
          {task.title}
        </Text>
        {hasDescription ? (
          <Text style={styles.rowDescription} numberOfLines={1} ellipsizeMode="tail">
            {task.description}
          </Text>
        ) : null}
        {hasMetaLine ? (
          <Text style={styles.rowMeta} numberOfLines={1} ellipsizeMode="tail">
            {goalName ? (
              <>
                <Text style={{ color: taskAccent }}>◈ </Text>
                {goalName}
              </>
            ) : null}
            {goalName && showPriority ? "  ·  " : null}
            {showPriority ? (
              <Text
                style={[styles.priorityBadge, task.priority === "p1" && { color: taskAccent }]}
              >
                {task.priority?.toUpperCase()}
              </Text>
            ) : null}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Day card ───────────────────────────────────────────────────────────────

type DayCardViewProps = {
  dateKey: string;
  tasks: MobileTask[];
  isCurrent: boolean;
  today: string;
  tomorrow: string;
  justCompleted: Record<string, MobileTask>;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  onToggle?: (task: MobileTask, completed: boolean) => void;
  onEditTask?: (task: MobileTask) => void;
  getGoalName?: (taskId: string) => string | undefined;
};

function DayCardView({
  dateKey,
  tasks,
  isCurrent,
  today,
  tomorrow,
  justCompleted,
  isRefreshing,
  onRefresh,
  onToggle,
  onEditTask,
  getGoalName,
}: DayCardViewProps) {
  const label = dateLabel(dateKey, today, tomorrow);
  const isToday = dateKey === today;
  // Today/Tomorrow carry an absolute companion line; other days already
  // spell out "Thu · Jun 18" in the primary label.
  const subtitle = dateKey === today || dateKey === tomorrow ? weekdayDate(dateKey) : null;

  // Locally completed tasks stay rendered (checked) on the current card so a
  // mistap can be undone. They leave with the hold, on swipe-away.
  const liveIds = useMemo(() => new Set(tasks.map((t) => String(t._id))), [tasks]);
  const rows = useMemo(() => {
    if (!isCurrent) return tasks;
    const held = Object.values(justCompleted).filter((t) => !liveIds.has(String(t._id)));
    if (held.length === 0) return tasks;
    return [...tasks, ...held].sort(
      (a, b) => a.position - b.position || a.scheduledAt - b.scheduledAt
    );
  }, [isCurrent, justCompleted, liveIds, tasks]);

  const isDayClear = tasks.length === 0;

  return (
    <View
      style={[styles.card, isToday && styles.cardToday]}
      accessibilityLabel={`${label}, ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardLabel, isToday && styles.cardLabelToday]}>{label}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.cardCount}>{tasks.length}</Text>
      </View>

      <FlatList<MobileTask>
        data={rows}
        keyExtractor={(task) => String(task._id)}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.cardListContent}
        ItemSeparatorComponent={RowSeparator}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bgCard}
          />
        }
        ListHeaderComponent={
          isDayClear ? (
            <View style={styles.dayClearWrap}>
              <View style={styles.dayClearBadge}>
                <CheckIcon size={18} color={colors.success} strokeWidth={2.4} />
              </View>
              <Text style={styles.dayClearTitle}>Day clear</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SlimTaskRow
            task={item}
            completed={!liveIds.has(String(item._id))}
            goalName={getGoalName?.(String(item._id))}
            onToggle={onToggle}
            onPress={onEditTask}
          />
        )}
      />
    </View>
  );
}

function RowSeparator() {
  return <View style={styles.rowSeparator} />;
}

// ─── Overdue card ───────────────────────────────────────────────────────────

function OverdueCard({ count, onOpenOverdue }: { count: number; onOpenOverdue: () => void }) {
  return (
    <Pressable
      onPress={onOpenOverdue}
      style={({ pressed }) => [styles.card, styles.overdueCard, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`${count} overdue. Open triage.`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.overdueLabel}>Overdue</Text>
          <Text style={styles.cardSubtitle}>Reflow or choose the next real date.</Text>
        </View>
        <Text style={styles.cardCount}>{count}</Text>
      </View>
      <View style={styles.overdueBody}>
        <Text style={styles.overdueReview}>Review</Text>
      </View>
    </Pressable>
  );
}

// ─── Carousel ───────────────────────────────────────────────────────────────

export function TimelineDayCarousel({
  sections,
  today,
  tomorrow,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  overdueCount,
  onOpenOverdue,
  onCompleteTask,
  onReopenTask,
  onEditTask,
  getGoalName,
  emptyComponent,
}: TimelineDayCarouselProps) {
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.round(windowWidth * CARD_WIDTH_RATIO);
  const interval = cardWidth + CARD_GAP;

  const listRef = useRef<FlatList<DayCarouselCard>>(null);
  const [current, setCurrent] = useState<{ key: string; index: number } | null>(null);
  const [justCompleted, setJustCompleted] = useState<Record<string, MobileTask>>({});

  const heldDateKey = current && current.key !== "overdue" ? current.key : null;
  const { cards, landingIndex } = useMemo(
    () =>
      buildDayCards({
        sections,
        today,
        overdueCount,
        includeOverdueCard: Boolean(onOpenOverdue),
        heldDateKey,
      }),
    [sections, today, overdueCount, onOpenOverdue, heldDateKey]
  );

  // Adopt the landing card once cards exist; afterwards, keep the current
  // card pinned when the axis shifts around it (new days inserting must not
  // move the card under the user's thumb). Guarded render-phase adjustment;
  // the scroll side-effect runs in the pinning effect below.
  let resolvedCurrent = current;
  if (cards.length === 0) {
    resolvedCurrent = null;
  } else if (current === null) {
    resolvedCurrent = { key: cardKey(cards[landingIndex]), index: landingIndex };
  } else {
    const index = cards.findIndex((card) => cardKey(card) === current.key);
    if (index === -1) {
      // Only the overdue card can vanish (day cards are held) — fall back home.
      const fallback = Math.min(landingIndex, cards.length - 1);
      resolvedCurrent = { key: cardKey(cards[fallback]), index: fallback };
    } else if (index !== current.index) {
      resolvedCurrent = { key: current.key, index };
    }
  }
  if (resolvedCurrent !== current) setCurrent(resolvedCurrent);

  // True when the latest `current` change came from an actual scroll (user
  // swipe or the Today chip) — those must not be re-pinned, or the pin would
  // cut the snap/spring short.
  const scrollSettledRef = useRef(false);

  useEffect(() => {
    if (!current) return;
    if (scrollSettledRef.current) {
      scrollSettledRef.current = false;
      return;
    }
    listRef.current?.scrollToOffset({ offset: current.index * interval, animated: false });
  }, [current, interval]);

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (cards.length === 0) return;
      const raw = Math.round(event.nativeEvent.contentOffset.x / interval);
      const index = Math.max(0, Math.min(cards.length - 1, raw));
      const key = cardKey(cards[index]);
      if (key !== current?.key) {
        scrollSettledRef.current = true;
        setCurrent({ key, index });
        // Swipe-away releases the previous card's hold and its checked rows.
        setJustCompleted({});
      }
    },
    [cards, current, interval]
  );

  const handleToggle = useCallback(
    (task: MobileTask, completed: boolean) => {
      const id = String(task._id);
      if (completed) {
        onReopenTask?.(task._id);
        setJustCompleted((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else {
        onCompleteTask?.(task._id);
        setJustCompleted((prev) => ({ ...prev, [id]: task }));
      }
    },
    [onCompleteTask, onReopenTask]
  );
  const canToggle = Boolean(onCompleteTask);

  // "‹ Today" chip — fades in once the user is off the landing card.
  const landingKey = cards.length > 0 ? cardKey(cards[landingIndex]) : null;
  const chipVisible = Boolean(current && landingKey && current.key !== landingKey);
  const chipOpacity = useSharedValue(0);
  useEffect(() => {
    const target = chipVisible ? 1 : 0;
    chipOpacity.value = reducedMotion
      ? target
      : withTiming(target, { duration: motion.duration.fast });
  }, [chipOpacity, chipVisible, reducedMotion]);
  const chipStyle = useAnimatedStyle(() => ({ opacity: chipOpacity.value }));

  const jumpToToday = useCallback(() => {
    if (cards.length === 0) return;
    listRef.current?.scrollToOffset({
      offset: landingIndex * interval,
      animated: !reducedMotion,
    });
    scrollSettledRef.current = true;
    setCurrent({ key: cardKey(cards[landingIndex]), index: landingIndex });
    setJustCompleted({});
  }, [cards, interval, landingIndex, reducedMotion]);

  if (cards.length === 0) {
    return <View style={styles.emptyContainer}>{emptyComponent}</View>;
  }

  const { dotCount, activeDot } = dotStripState(cards.length, current?.index ?? landingIndex);

  return (
    <View style={[styles.container, { paddingBottom: tabBarHeight + spacing.sm }]}>
      <View style={styles.chipRow} pointerEvents="box-none">
        <Animated.View style={chipStyle} pointerEvents={chipVisible ? "auto" : "none"}>
          <Pressable
            onPress={jumpToToday}
            style={({ pressed }) => [styles.todayChip, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Jump back to today"
          >
            <Text style={styles.todayChipText}>‹ Today</Text>
          </Pressable>
        </Animated.View>
      </View>

      <FlatList<DayCarouselCard>
        ref={listRef}
        horizontal
        data={cards}
        keyExtractor={cardKey}
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        disableIntervalMomentum
        getItemLayout={(_, index) => ({ length: interval, offset: index * interval, index })}
        initialScrollIndex={landingIndex}
        contentContainerStyle={styles.carouselContent}
        onMomentumScrollEnd={handleMomentumEnd}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth, marginRight: CARD_GAP }}>
            {item.kind === "overdue" ? (
              onOpenOverdue ? (
                <OverdueCard count={item.count} onOpenOverdue={onOpenOverdue} />
              ) : null
            ) : (
              <DayCardView
                dateKey={item.dateKey}
                tasks={item.tasks}
                isCurrent={current?.key === item.dateKey}
                today={today}
                tomorrow={tomorrow}
                justCompleted={justCompleted}
                isRefreshing={isRefreshing}
                onRefresh={onRefresh}
                onToggle={canToggle ? handleToggle : undefined}
                onEditTask={onEditTask}
                getGoalName={getGoalName}
              />
            )}
          </View>
        )}
      />

      {dotCount > 1 ? (
        <View style={styles.dotRow} pointerEvents="none">
          {Array.from({ length: dotCount }, (_, index) => (
            <View key={index} style={[styles.dot, index === activeDot && styles.dotActive]} />
          ))}
        </View>
      ) : (
        <View style={styles.dotRow} />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
  },
  // Fixed-height chip lane so the Today chip fading in never shifts the cards.
  chipRow: {
    height: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  todayChip: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  todayChipText: {
    color: colors.accent,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: -0.1,
  },
  carouselContent: {
    paddingHorizontal: spacing.lg,
  },
  card: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  cardToday: {
    borderColor: colors.accentSoft,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.sansSemibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  cardLabelToday: {
    color: colors.accent,
  },
  cardSubtitle: {
    color: colors.textMuted,
    ...typography.bodyMd,
  },
  cardCount: {
    color: colors.textMuted,
    ...typography.numeric,
    paddingTop: 4,
  },
  cardListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  // Task row — checkbox leading a stacked body. The title owns the full
  // width; description and goal · priority each get their own quiet line.
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.rowY,
  },
  rowCompact: {
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  rowTitleDone: {
    color: colors.textCompleted,
    textDecorationLine: "line-through",
  },
  rowDescription: {
    color: colors.textSecondary,
    ...typography.bodyMd,
  },
  rowMeta: {
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  priorityBadge: {
    color: colors.textMuted,
    ...typography.micro,
  },
  dayClearWrap: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.section,
    paddingBottom: spacing.lg,
  },
  dayClearBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.successMuted,
  },
  dayClearTitle: {
    color: colors.textSecondary,
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  // Overdue card is a doorway, not a workspace — muted fill, no task rows.
  overdueCard: {
    backgroundColor: colors.bgSurface,
  },
  overdueLabel: {
    color: colors.textPrimary,
    ...typography.micro,
    paddingTop: 4,
  },
  overdueBody: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  overdueReview: {
    color: colors.accent,
    ...typography.bodyMd,
  },
  dotRow: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.borderSubtle,
  },
  dotActive: {
    backgroundColor: colors.accent,
  },
});
