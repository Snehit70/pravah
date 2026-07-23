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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  Extrapolation,
  FadeOut,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors, fonts, motion, radii, shadow, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "./TaskCard";
import { taskEmphasisColor } from "../lib/taskAccent";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  StarIcon,
  SyncLoopIcon,
} from "./UiIcons";
import { dateLabel, weekdayDate } from "../lib/dates";
import { buildDayCards, cardKey, type DayCarouselCard } from "../lib/timelineCarousel";
import { TimelineDayStrip } from "./TimelineDayStrip";
import { ThemedDatePicker } from "./ThemedDatePicker";
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
  onTriageOverdue?: (
    taskId: string,
    target: "today" | "tomorrow" | "week" | "drop" | { date: string }
  ) => void;
  onRescheduleAllGoals?: () => void;
  onCompleteTask?: (id: Id<"tasks">) => void;
  onReopenTask?: (id: Id<"tasks">) => void;
  onEditTask?: (task: MobileTask) => void;
  getGoalName?: (taskId: string) => string | undefined;
  /** Rendered when no cards exist — same empty state as compact mode. */
  emptyComponent: JSX.Element;
};

/** Card takes ~85% of the window so the next day peeks at the trailing edge. */
const CARD_WIDTH_RATIO = 0.85;
const CARD_GAP = spacing.md;

// Focus-scale swipe: transforms are pure functions of scroll position — the
// centered card sits at identity, neighbors ease down to these floors. No
// event-driven arrival animation (it can never desync from the gesture).
const FOCUS_SCALE_MIN = 0.94;
const FOCUS_OPACITY_MIN = 0.8;

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
  const reducedMotion = useReducedMotion();
  const compactDensity = prefs.density === "compact";
  const taskAccent = taskEmphasisColor(prefs.taskColorScheme);

  // Check + settle: the checkbox spring-pops and the row body cross-fades to
  // its done style in place — the row never moves (the hold design keeps it
  // tappable for mistap undo). Skipped on first mount and under reduced motion.
  const checkScale = useSharedValue(1);
  const bodyOpacity = useSharedValue(1);
  const prevCompleted = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevCompleted.current;
    prevCompleted.current = completed;
    if (prev === null || prev === completed || reducedMotion) return;
    if (completed) {
      checkScale.set(
        withSequence(
          withTiming(0.8, { duration: 60 }),
          withSpring(1, { damping: 12, stiffness: 260 })
        )
      );
    }
    bodyOpacity.set(
      withSequence(
        withTiming(0.35, { duration: 70 }),
        withTiming(1, { duration: motion.duration.fast })
      )
    );
  }, [bodyOpacity, checkScale, completed, reducedMotion]);
  const checkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));
  const bodyAnimStyle = useAnimatedStyle(() => ({ opacity: bodyOpacity.value }));

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
      <Animated.View style={checkAnimStyle}>
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
          {completed ? (
            <CheckIcon size={14} color={colors.textInverse} strokeWidth={2.4} />
          ) : null}
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.rowBody, bodyAnimStyle]}>
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
          <View style={styles.rowMeta}>
            {goalName ? (
              <View style={styles.metaGroup}>
                <SyncLoopIcon color={taskAccent} size={13} strokeWidth={1.7} />
                <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">
                  {goalName}
                </Text>
              </View>
            ) : null}
            {goalName && showPriority ? <View style={styles.metaDivider} /> : null}
            {showPriority ? (
              <View style={styles.metaGroup}>
                <StarIcon
                  color={task.priority === "p1" ? taskAccent : colors.textMuted}
                  size={13}
                  strokeWidth={1.7}
                />
                <Text
                  style={[styles.priorityBadge, task.priority === "p1" && { color: taskAccent }]}
                >
                  {task.priority?.toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Animated.View>

      {onPress ? (
        <View style={styles.rowChevron}>
          <ChevronRightIcon color={colors.textMuted} size={17} strokeWidth={1.8} />
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Day-clear header ───────────────────────────────────────────────────────

/** The reward moment: badge + title enter with a gentle scale-fade after a
 *  short beat, so the state change reads as earned rather than a flash.
 *  Mounted only when the day empties, so a mount-time animation suffices. */
function DayClearHeader() {
  const reducedMotion = useReducedMotion();
  const enter = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      enter.set(1);
      return;
    }
    enter.set(withDelay(250, withSpring(1, { damping: 14, stiffness: 200 })));
  }, [enter, reducedMotion]);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, enter.value)),
    transform: [{ scale: 0.8 + 0.2 * enter.value }],
  }));

  return (
    <Animated.View style={[styles.dayClearWrap, enterStyle]}>
      <View style={styles.dayClearBadge}>
        <CheckIcon size={18} color={colors.success} strokeWidth={2.4} />
      </View>
      <Text style={styles.dayClearTitle}>Day clear</Text>
    </Animated.View>
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
        <Text style={styles.cardCount}>
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </Text>
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
        ListHeaderComponent={isDayClear ? <DayClearHeader /> : null}
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

function OverdueCard({
  tasks,
  today,
  getGoalName,
  onCompleteTask,
  onTriage,
  onRescheduleAllGoals,
}: {
  tasks: MobileTask[];
  today: string;
  getGoalName?: (taskId: string) => string | undefined;
  onCompleteTask?: (id: Id<"tasks">) => void;
  onTriage?: (
    taskId: string,
    target: "today" | "tomorrow" | "week" | "drop" | { date: string }
  ) => void;
  onRescheduleAllGoals?: () => void;
}) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [overflowTaskId, setOverflowTaskId] = useState<string | null>(null);
  const [datePickerTaskId, setDatePickerTaskId] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Record<string, MobileTask>>({});

  const visibleTasks = useMemo(() => {
    const liveIds = new Set(tasks.map((task) => String(task._id)));
    return [
      ...tasks,
      ...Object.values(completedTasks).filter((task) => !liveIds.has(String(task._id))),
    ];
  }, [completedTasks, tasks]);

  const overdueAge = (deadline: string | undefined) => {
    if (!deadline) return "Overdue";
    const start = new Date(`${deadline}T00:00:00`).getTime();
    const end = new Date(`${today}T00:00:00`).getTime();
    const days = Math.max(1, Math.round((end - start) / 86_400_000));
    return days === 1 ? "Yesterday" : `${days} days overdue`;
  };

  return (
    <View style={[styles.card, styles.overdueCard]} accessibilityLabel={`${tasks.length} overdue`}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <View style={styles.overdueTitleRow}>
            <Text style={styles.overdueLabel}>Overdue</Text>
            <Text style={styles.overdueCount}>{tasks.length}</Text>
          </View>
        </View>
        {onRescheduleAllGoals ? (
          <Pressable
            onPress={onRescheduleAllGoals}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Reschedule all goals"
            style={({ pressed }) => [styles.overdueBulkAction, pressed && styles.rowPressed]}
          >
            <SyncLoopIcon color={colors.accent} size={14} strokeWidth={1.8} />
            <Text style={styles.overdueBulkText}>Reflow all</Text>
          </Pressable>
        ) : (
          <Text style={styles.cardCount}>{tasks.length}</Text>
        )}
      </View>

      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.overdueList}
      >
        {visibleTasks.map((task) => {
          const id = String(task._id);
          const isCompleted = Boolean(completedTasks[id]);
          const expanded = expandedTaskId === id;
          const overflowOpen = overflowTaskId === id;
          const goalName = getGoalName?.(id);
          return (
            <Animated.View
              key={id}
              exiting={isCompleted ? FadeOut.duration(220) : undefined}
              style={[styles.overdueTask, isCompleted && styles.overdueTaskCompleted]}
            >
              <View style={styles.overdueTaskTop}>
                <View style={styles.overdueTaskText}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{task.title}</Text>
                  <View style={styles.overdueMeta}>
                    {isCompleted ? (
                      <CheckIcon color={colors.success} size={13} strokeWidth={2.4} />
                    ) : (
                      <SyncLoopIcon color={colors.textMuted} size={12} strokeWidth={1.7} />
                    )}
                    <Text style={styles.overdueMetaText} numberOfLines={1}>
                      {isCompleted ? "Completed" : goalName ?? "No goal"}
                    </Text>
                    {!isCompleted ? (
                      <>
                        <View style={styles.metaDivider} />
                        <Text style={styles.overdueMetaText}>{overdueAge(task.deadline)}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
                {!isCompleted ? <Pressable
                  onPress={() => setOverflowTaskId((current) => current === id ? null : id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`More actions for ${task.title}`}
                  style={styles.compactHitTarget}
                >
                  <Text style={styles.moreText}>•••</Text>
                </Pressable> : null}
                {onCompleteTask && !isCompleted ? (
                  <Pressable
                    onPress={() => {
                      setCompletedTasks((current) => ({ ...current, [id]: task }));
                      onCompleteTask(task._id);
                      setTimeout(() => {
                        setCompletedTasks((current) => {
                          const next = { ...current };
                          delete next[id];
                          return next;
                        });
                      }, 900);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Complete ${task.title}`}
                    style={({ pressed }) => [styles.compactCompleteHit, pressed && styles.rowPressed]}
                  >
                    <View style={styles.compactCompleteVisual}>
                      <CheckIcon color={colors.success} size={14} strokeWidth={2.2} />
                      <Text style={styles.compactCompleteText}>Complete</Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>

              {overflowOpen && onTriage && onCompleteTask && !isCompleted ? (
                <View style={styles.inlineDropRow}>
                  <Pressable
                    onPress={() => {
                      setOverflowTaskId(null);
                      setCompletedTasks((current) => ({ ...current, [id]: task }));
                      onCompleteTask?.(task._id);
                      setTimeout(() => {
                        setCompletedTasks((current) => {
                          const next = { ...current };
                          delete next[id];
                          return next;
                        });
                      }, 900);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Complete ${task.title}`}
                    style={({ pressed }) => [styles.inlineMenuAction, pressed && styles.rowPressed]}
                  >
                    <Text style={styles.inlineMenuText}>Complete</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setOverflowTaskId(null);
                      onTriage(id, "drop");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Drop ${task.title}`}
                    style={({ pressed }) => [styles.inlineDrop, pressed && styles.rowPressed]}
                  >
                    <Text style={styles.inlineDropText}>Drop task</Text>
                  </Pressable>
                </View>
              ) : null}

              {onTriage && !isCompleted ? (
                <View style={[styles.compactSchedule, expanded && styles.compactScheduleExpanded]}>
                  <Pressable
                    onPress={() => {
                      setOverflowTaskId(null);
                      setExpandedTaskId((current) => current === id ? null : id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Reschedule ${task.title}`}
                    accessibilityState={{ expanded }}
                    style={styles.compactScheduleHeader}
                  >
                    <Text style={styles.compactScheduleLabel}>Reschedule</Text>
                    <View style={styles.compactSchedulePrompt}>
                      <Text style={styles.compactSchedulePromptText}>Choose a date</Text>
                      {expanded ? (
                        <ChevronUpIcon color={colors.textMuted} size={14} />
                      ) : (
                        <ChevronDownIcon color={colors.textMuted} size={14} />
                      )}
                    </View>
                  </Pressable>
                  {expanded ? (
                    <View style={styles.compactOptions}>
                      {(["today", "tomorrow", "week"] as const).map((target) => (
                        <Pressable
                          key={target}
                          onPress={() => {
                            setExpandedTaskId(null);
                            onTriage(id, target);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${target === "week" ? "Weekend" : target[0].toUpperCase() + target.slice(1)} — ${task.title}`}
                          style={styles.compactOptionHit}
                        >
                          <View style={styles.compactOptionVisual}>
                            <Text style={styles.compactOptionText}>
                              {target === "today" ? "Today" : target === "tomorrow" ? "Tomorrow" : "Weekend"}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => {
                          setExpandedTaskId(null);
                          setDatePickerTaskId(id);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Pick a date for ${task.title}`}
                        style={styles.compactOptionHit}
                      >
                        <View style={styles.compactOptionVisual}>
                          <Text style={styles.compactOptionText}>Pick a date</Text>
                        </View>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Animated.View>
          );
        })}
      </ScrollView>
      <ThemedDatePicker
        visible={datePickerTaskId !== null}
        minDate={today}
        onClose={() => setDatePickerTaskId(null)}
        onSelect={(date) => {
          if (datePickerTaskId) onTriage?.(datePickerTaskId, { date });
          setDatePickerTaskId(null);
        }}
      />
    </View>
  );
}

// ─── Focus-scale card shell ─────────────────────────────────────────────────

type CarouselCardShellProps = {
  index: number;
  interval: number;
  cardWidth: number;
  scrollX: SharedValue<number>;
  reducedMotion: boolean;
  children: ReactNode;
};

/** Wraps each card and derives scale/opacity from scroll position on the UI
 *  thread: identity when centered, easing to the focus floors one interval
 *  away. Reduced motion collapses to a rigid identity transform. */
function CarouselCardShell({
  index,
  interval,
  cardWidth,
  scrollX,
  reducedMotion,
  children,
}: CarouselCardShellProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { transform: [{ scale: 1 }], opacity: 1 };
    const center = index * interval;
    const range = [center - interval, center, center + interval];
    return {
      transform: [
        {
          scale: interpolate(
            scrollX.value,
            range,
            [FOCUS_SCALE_MIN, 1, FOCUS_SCALE_MIN],
            Extrapolation.CLAMP
          ),
        },
      ],
      opacity: interpolate(
        scrollX.value,
        range,
        [FOCUS_OPACITY_MIN, 1, FOCUS_OPACITY_MIN],
        Extrapolation.CLAMP
      ),
    };
  });

  return (
    <Animated.View style={[{ width: cardWidth, marginRight: CARD_GAP }, animatedStyle]}>
      {children}
    </Animated.View>
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
  onTriageOverdue,
  onRescheduleAllGoals,
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
  // Scroll offset mirrored to the UI thread — every swipe animation (focus
  // scale, worm) is a pure function of this value.
  const scrollX = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });
  const [current, setCurrent] = useState<{ key: string; index: number } | null>(null);
  const [justCompleted, setJustCompleted] = useState<Record<string, MobileTask>>({});

  const heldDateKey = current && current.key !== "overdue" ? current.key : null;
  const { cards, landingIndex } = useMemo(
    () =>
      buildDayCards({
        sections,
        today,
        overdueCount,
        includeOverdueCard: Boolean(overdueCount),
        heldDateKey,
      }),
    [sections, today, overdueCount, heldDateKey]
  );
  const overdueTasks = useMemo(
    () => sections.flatMap(([dateKey, tasks]) => dateKey === "overdue" || dateKey < today ? tasks : []),
    [sections, today]
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
    // Non-animated scrolls may not emit scroll events — keep the UI thread in sync.
    scrollX.set(current.index * interval);
  }, [current, interval, scrollX]);

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

  // Jump straight to any card — the day strip's cell taps and its "back to
  // today" affordance both call this (the latter with landingIndex). Marks the
  // change as scroll-driven so the pin effect doesn't cut the glide short.
  const jumpToCard = useCallback(
    (index: number) => {
      if (index < 0 || index >= cards.length) return;
      listRef.current?.scrollToOffset({ offset: index * interval, animated: !reducedMotion });
      scrollSettledRef.current = true;
      setCurrent({ key: cardKey(cards[index]), index });
      // Navigating away releases the previous card's Day-clear hold.
      setJustCompleted({});
    },
    [cards, interval, reducedMotion]
  );

  if (cards.length === 0) {
    return <View style={styles.emptyContainer}>{emptyComponent}</View>;
  }

  return (
    <View style={[styles.container, { paddingBottom: tabBarHeight + spacing.sm }]}>
      <TimelineDayStrip
        cards={cards}
        currentIndex={current?.index ?? null}
        today={today}
        scrollX={scrollX}
        interval={interval}
        landingIndex={landingIndex}
        reducedMotion={reducedMotion}
        onJumpToCard={jumpToCard}
      />

      <Animated.FlatList<DayCarouselCard>
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
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        renderItem={({ item, index }) => (
          <CarouselCardShell
            index={index}
            interval={interval}
            cardWidth={cardWidth}
            scrollX={scrollX}
            reducedMotion={reducedMotion}
          >
            {item.kind === "overdue" ? (
              <OverdueCard
                tasks={overdueTasks}
                today={today}
                getGoalName={getGoalName}
                onCompleteTask={onCompleteTask}
                onTriage={onTriageOverdue}
                onRescheduleAllGoals={onRescheduleAllGoals}
              />
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
          </CarouselCardShell>
        )}
      />

    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = createThemedStyles({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
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
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.sansSemibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.35,
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
    ...typography.bodyMd,
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  metaGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minWidth: 0,
  },
  metaText: {
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  metaDivider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    backgroundColor: colors.border,
  },
  priorityBadge: {
    color: colors.textMuted,
    ...typography.micro,
  },
  rowChevron: {
    minWidth: 24,
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "center",
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
  overdueCard: {
    backgroundColor: colors.bgSurface,
  },
  overdueLabel: {
    color: colors.textPrimary,
    ...typography.headline,
    fontSize: 24,
    lineHeight: 30,
  },
  overdueTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  overdueCount: {
    color: colors.textMuted,
    ...typography.numeric,
    fontSize: 16,
  },
  overdueBulkAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  overdueBulkText: { color: colors.accent, ...typography.micro },
  overdueList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  overdueTask: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  overdueTaskCompleted: {
    backgroundColor: colors.successMuted,
    borderBottomColor: colors.success,
  },
  overdueTaskTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  overdueTaskText: { flex: 1, minWidth: 0, gap: 3 },
  overdueMeta: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minWidth: 0 },
  overdueMetaText: { color: colors.textMuted, ...typography.micro, flexShrink: 1 },
  compactHitTarget: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { color: colors.textSecondary, fontSize: 14, letterSpacing: 1 },
  compactCompleteHit: { minHeight: 44, justifyContent: "center" },
  compactCompleteVisual: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.success,
    borderRadius: radii.md,
  },
  compactCompleteText: { color: colors.success, ...typography.micro },
  inlineDropRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.lg,
  },
  inlineMenuAction: { minHeight: 44, justifyContent: "center" },
  inlineMenuText: { color: colors.textSecondary, ...typography.micro },
  inlineDrop: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  inlineDropText: { color: colors.error, ...typography.micro },
  compactSchedule: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  compactScheduleExpanded: { borderColor: colors.borderFocus },
  compactScheduleHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
  },
  compactScheduleLabel: { color: colors.textPrimary, ...typography.micro },
  compactSchedulePrompt: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  compactSchedulePromptText: { color: colors.textMuted, ...typography.micro },
  compactOptions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  compactOptionHit: { flex: 1, minHeight: 44, justifyContent: "center" },
  compactOptionVisual: { height: 30, alignItems: "center", justifyContent: "center" },
  compactOptionText: { color: colors.textSecondary, ...typography.micro },
});
