/**
 * TimelineDayCarousel — the Timeline's "comfortable" layout (PRD:
 * docs/prd/mobile-timeline-comfortable-carousel.md).
 *
 * A horizontal peek carousel of day cards: each day with tasks is one card
 * ~88% of screen width with the next day peeking in, snap paging per card.
 * Overdue collapses into a single muted leftmost card with the same "Review"
 * door as compact mode. Rows are slim (icon tile, title, goal chip, priority);
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
import NavTimelineAsset from "../assets/icons/nav-timeline.svg";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  PencilIcon,
  StarIcon,
  SyncLoopIcon,
  TrashIcon,
} from "./UiIcons";
import { dateLabel, weekdayDate } from "../lib/dates";
import { formatTime12h } from "../lib/task-form";
import { buildDayCards, cardKey, type DayCarouselCard } from "../lib/timelineCarousel";
import { DayStripTrigger, DayStripWeek } from "./TimelineDayStrip";
import { ThemedDatePicker } from "./ThemedDatePicker";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useUserPreferences } from "../hooks/useUserPreferences";

const PRIORITY_META = {
  p1: { label: "P1", color: colors.priorityP1, bg: colors.errorMuted },
  p2: { label: "P2", color: colors.priorityP2, bg: colors.warningMuted },
  p3: { label: "P3", color: colors.priorityP3, bg: colors.successMuted },
} as const;

// Pastel goal pills, cycled deterministically off the goal name so the same
// goal always wears the same tint. Muted semantic washes stay legible in
// both light and dark themes.
const GOAL_PILLS = [
  { backgroundColor: colors.accentSoft, textColor: colors.accent },
  { backgroundColor: colors.successMuted, textColor: colors.success },
  { backgroundColor: colors.warningMuted, textColor: colors.warning },
  { backgroundColor: colors.deadlineMuted, textColor: colors.deadline },
] as const;

function goalPillFor(goalName: string): (typeof GOAL_PILLS)[number] {
  let hash = 0;
  for (let i = 0; i < goalName.length; i += 1) {
    hash = (hash * 31 + goalName.charCodeAt(i)) >>> 0;
  }
  return GOAL_PILLS[hash % GOAL_PILLS.length];
}

type TimelineDayCarouselProps = {
  sections: [string, MobileTask[]][];
  today: string;
  tomorrow: string;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  overdueCount?: number;
  completedTasks?: MobileTask[];
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

/** Timeline icon tile leading a stacked body: title and priority, one-line description,
 *  then a meta row (pastel goal pill, time). No resting checkbox — complete lives in
 *  the edit sheet / bulk select. Each row is its own separated card inside the day
 *  shell; tap opens Edit; no swipe actions. */
function SlimTaskRow({ task, completed, goalName, onToggle, onPress }: SlimTaskRowProps) {
  const { prefs } = useUserPreferences();
  const reducedMotion = useReducedMotion();
  const compactDensity = prefs.density === "compact";
  const priority = task.priority ? PRIORITY_META[task.priority] : null;
  const timeLabel = task.time && !completed ? formatTime12h(task.time) : null;
  const goalPill = goalName ? goalPillFor(goalName) : null;
  const showPriority = Boolean(priority) && !completed;
  const hasMetaRow = Boolean(goalPill && !completed) || Boolean(timeLabel);

  // Body cross-fades to its done style in place when held-complete lands.
  const bodyOpacity = useSharedValue(1);
  const prevCompleted = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevCompleted.current;
    prevCompleted.current = completed;
    if (prev === null || prev === completed || reducedMotion) return;
    bodyOpacity.set(
      withSequence(
        withTiming(0.35, { duration: 70 }),
        withTiming(1, { duration: motion.duration.fast })
      )
    );
  }, [bodyOpacity, completed, reducedMotion]);
  const bodyAnimStyle = useAnimatedStyle(() => ({ opacity: bodyOpacity.value }));
  void onToggle;

  const hasDescription = Boolean(task.description) && !completed;

  return (
    <Pressable
      onPress={onPress ? () => onPress(task) : undefined}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.taskCard,
        compactDensity && styles.rowCompact,
        pressed && onPress && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      accessibilityHint="Double tap to edit."
    >
      <View style={styles.iconTile} accessibilityElementsHidden>
        <NavTimelineAsset color={colors.accent} width={18} height={18} />
      </View>

      <Animated.View style={[styles.rowBody, bodyAnimStyle]}>
        <View style={styles.titleLine}>
          <Text
            style={[styles.rowTitle, completed && styles.rowTitleDone]}
            numberOfLines={hasDescription ? 1 : 2}
            ellipsizeMode="tail"
          >
            {task.title}
          </Text>
          {showPriority && priority ? (
            <View style={[styles.priorityPill, { backgroundColor: priority.bg }]}>
              <StarIcon color={priority.color} size={12} strokeWidth={2} />
              <Text style={[styles.priorityPillText, { color: priority.color }]}>
                {priority.label}
              </Text>
            </View>
          ) : null}
        </View>
        {hasDescription ? (
          <Text style={styles.rowDescription} numberOfLines={1} ellipsizeMode="tail">
            {task.description}
          </Text>
        ) : null}
        {hasMetaRow ? (
          <View style={styles.rowMeta}>
            {goalName && goalPill && !completed ? (
              <View style={[styles.goalPill, { backgroundColor: goalPill.backgroundColor }]}>
                <Text
                  style={[styles.goalPillText, { color: goalPill.textColor }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {goalName}
                </Text>
              </View>
            ) : null}
            {timeLabel ? (
              <View style={styles.metaGroup}>
                <ClockIcon color={colors.textMuted} size={13} strokeWidth={1.7} />
                <Text style={styles.metaText}>{timeLabel}</Text>
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
  completedTasks: MobileTask[];
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  onToggle?: (task: MobileTask, completed: boolean) => void;
  onEditTask?: (task: MobileTask) => void;
  getGoalName?: (taskId: string) => string | undefined;
  /** Collapsed week-nav handle under the title (viewed card only). */
  weekTrigger?: ReactNode;
  /** Expanded week panel under the card header (viewed card only). */
  weekPanel?: ReactNode;
};

function DayCardView({
  dateKey,
  tasks,
  isCurrent,
  today,
  tomorrow,
  justCompleted,
  completedTasks,
  isRefreshing,
  onRefresh,
  onToggle,
  onEditTask,
  getGoalName,
  weekTrigger,
  weekPanel,
}: DayCardViewProps) {
  const label = dateLabel(dateKey, today, tomorrow);
  const isToday = dateKey === today;

  // Locally completed tasks stay rendered (checked) on the current card so a
  // mistap can be undone. They leave with the hold, on swipe-away.
  const liveIds = useMemo(() => new Set(tasks.map((t) => String(t._id))), [tasks]);
  const rows = useMemo(() => {
    if (!isCurrent) return tasks;
    const scopedJustCompleted = Object.values(justCompleted).filter((task) => task.deadline === dateKey);
    const held = [
      ...(isToday ? completedTasks.filter((task) => task.deadline === today) : []),
      ...scopedJustCompleted,
    ].filter((t, index, all) =>
      !liveIds.has(String(t._id)) &&
      all.findIndex((candidate) => String(candidate._id) === String(t._id)) === index
    );
    if (held.length === 0) return tasks;
    return [...tasks, ...held].sort(
      (a, b) => a.position - b.position || a.scheduledAt - b.scheduledAt
    );
  }, [completedTasks, dateKey, isCurrent, isToday, justCompleted, liveIds, tasks, today]);

  const isDayClear = tasks.length === 0;
  const scopedJustCompleted = Object.values(justCompleted).filter((task) => task.deadline === dateKey);
  const completedIds = new Set([
    ...completedTasks.filter((task) => task.deadline === today).map((task) => String(task._id)),
    ...scopedJustCompleted.map((task) => String(task._id)),
  ]);
  const completedCount = isToday
    ? rows.filter((task) => completedIds.has(String(task._id))).length
    : 0;
  const totalCount = rows.length;

  return (
    <View
      style={[styles.card, isToday && styles.cardToday]}
      accessibilityLabel={`${label}, ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <View style={styles.cardLabelRow}>
            <CalendarIcon
              color={isToday ? colors.accent : colors.textMuted}
              size={18}
              strokeWidth={1.8}
            />
            <Text style={[styles.cardLabel, isToday && styles.cardLabelToday]}>{label}</Text>
          </View>
          {weekTrigger}
        </View>
        {isToday ? (
          <View style={styles.progressBlock} accessibilityLabel={`${completedCount} of ${totalCount} done`}>
            <View style={styles.progressPill}>
              <CheckIcon color={colors.success} size={16} strokeWidth={2.4} />
              <Text style={styles.progressPillText}>
                {completedCount} of {totalCount}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: totalCount > 0 ? `${Math.round((completedCount / totalCount) * 100)}%` : "0%" },
                ]}
              />
            </View>
          </View>
        ) : (
          <Text style={styles.cardCount}>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </Text>
        )}
      </View>

      {weekPanel}

      <FlatList<MobileTask>
        data={rows}
        keyExtractor={(task) => String(task._id)}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.cardListContent}
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

// ─── Overdue card ───────────────────────────────────────────────────────────

function OverdueCard({
  tasks,
  today,
  getGoalName,
  onCompleteTask,
  onEditTask,
  onTriage,
  onRescheduleAllGoals,
}: {
  tasks: MobileTask[];
  today: string;
  getGoalName?: (taskId: string) => string | undefined;
  onCompleteTask?: (id: Id<"tasks">) => void;
  onEditTask?: (task: MobileTask) => void;
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
    if (!deadline) return "No date";
    const start = new Date(`${deadline}T00:00:00`).getTime();
    const end = new Date(`${today}T00:00:00`).getTime();
    const days = Math.max(1, Math.round((end - start) / 86_400_000));
    return `${days}d late`;
  };

  return (
    <View style={[styles.card, styles.overdueCard]} accessibilityLabel={`${tasks.length} overdue`}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <View style={styles.overdueTitleRow}>
            <Text style={styles.overdueLabel}>Overdue</Text>
            <View style={styles.overdueCountPill}>
              <Text style={styles.overdueCountPillText}>
                {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
              </Text>
            </View>
          </View>
        </View>
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
                <View
                  style={[styles.overdueIconTile, isCompleted && styles.overdueIconTileDone]}
                  accessibilityElementsHidden
                >
                  {isCompleted ? (
                    <CheckIcon color={colors.success} size={18} strokeWidth={2.2} />
                  ) : (
                    <AlertCircleIcon color={colors.error} size={18} strokeWidth={1.8} />
                  )}
                </View>
                <View style={styles.overdueTaskText}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{task.title}</Text>
                  <View style={styles.overdueMeta}>
                    {isCompleted ? (
                      <>
                        <CheckIcon color={colors.success} size={13} strokeWidth={2.4} />
                        <Text style={styles.overdueMetaText}>Completed</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.overdueMetaText} numberOfLines={1}>
                          {goalName ?? "No goal"}
                        </Text>
                        <View style={styles.overdueAgePill}>
                          <SyncLoopIcon color={colors.deadline} size={12} strokeWidth={1.7} />
                          <Text style={styles.overdueAgePillText}>
                            {overdueAge(task.deadline)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
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
                {!isCompleted && (onTriage || onEditTask) ? <Pressable
                  onPress={() => setOverflowTaskId((current) => current === id ? null : id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`More actions for ${task.title}`}
                  style={styles.compactHitTarget}
                >
                  <Text style={styles.moreText}>•••</Text>
                </Pressable> : null}
              </View>

              {overflowOpen && (onTriage || onEditTask) && !isCompleted ? (
                <View style={styles.inlineDropRow}>
                  {onEditTask ? <Pressable
                    onPress={() => {
                      setOverflowTaskId(null);
                      onEditTask(task);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${task.title}`}
                    style={({ pressed }) => [styles.inlineMenuAction, pressed && styles.rowPressed]}
                  >
                    <PencilIcon color={colors.textSecondary} size={15} strokeWidth={1.8} />
                    <Text style={styles.inlineMenuText}>Open task</Text>
                  </Pressable> : null}
                  {onTriage ? <Pressable
                    onPress={() => {
                      setOverflowTaskId(null);
                      onTriage(id, "drop");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Drop ${task.title}`}
                    style={({ pressed }) => [styles.inlineDrop, pressed && styles.rowPressed]}
                  >
                    <TrashIcon color={colors.error} size={15} strokeWidth={1.8} />
                    <Text style={styles.inlineDropText}>Drop task</Text>
                  </Pressable> : null}
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
                    <View style={styles.compactScheduleTitle}>
                      <CalendarIcon color={colors.textSecondary} size={16} strokeWidth={1.8} />
                      <Text style={styles.compactScheduleLabel}>Reschedule</Text>
                    </View>
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
                            {target === "today" ? (
                              <ClockIcon color={colors.textMuted} size={16} strokeWidth={1.8} />
                            ) : (
                              <CalendarIcon color={colors.textMuted} size={16} strokeWidth={1.8} />
                            )}
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
                          <CalendarIcon color={colors.textMuted} size={16} strokeWidth={1.8} />
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
        {onRescheduleAllGoals ? (
          <View style={styles.overdueFooter}>
            <Pressable
              onPress={onRescheduleAllGoals}
              accessibilityRole="button"
              accessibilityLabel="Reschedule all goals"
              style={({ pressed }) => [styles.overdueFooterAction, pressed && styles.rowPressed]}
            >
              <SyncLoopIcon color={colors.accent} size={14} strokeWidth={1.8} />
              <Text style={styles.overdueFooterText}>Reflow all</Text>
            </Pressable>
          </View>
        ) : null}
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
  completedTasks = [],
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
  // Week accordion lives in the viewed card's header; closed by default.
  const [weekOpen, setWeekOpen] = useState(false);

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
        setWeekOpen(false);
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
      setWeekOpen(false);
    },
    [cards, interval, reducedMotion]
  );

  if (cards.length === 0) {
    return <View style={styles.emptyContainer}>{emptyComponent}</View>;
  }

  // Week nav pieces for the viewed card only — trigger in the title slot,
  // expanded panel under the card header.
  const isViewedCard = (item: DayCarouselCard) => current?.key === cardKey(item);
  const weekNavProps = {
    cards,
    currentIndex: current?.index ?? null,
    today,
    scrollX,
    interval,
    reducedMotion,
  };
  const weekTriggerFor = (item: DayCarouselCard): ReactNode => {
    if (item.kind === "overdue" || !isViewedCard(item) || weekOpen) return null;
    const isRelativeDay = item.dateKey === today || item.dateKey === tomorrow;
    const label =
      item.kind === "overdue" || !isRelativeDay
        ? "Jump to a day"
        : weekdayDate(item.dateKey);
    return (
      <DayStripTrigger
        label={label}
        open={false}
        onPress={() => setWeekOpen(true)}
      />
    );
  };
  const renderWeekPanel = (item: DayCarouselCard): ReactNode => {
    if (item.kind === "overdue" || !isViewedCard(item) || !weekOpen) return null;
    return (
      <DayStripWeek
        {...weekNavProps}
        onJumpToCard={jumpToCard}
        onCollapse={() => setWeekOpen(false)}
      />
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: tabBarHeight + spacing.sm }]}>
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
                onEditTask={onEditTask}
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
                completedTasks={completedTasks}
                isRefreshing={isRefreshing}
                onRefresh={onRefresh}
                onToggle={canToggle ? handleToggle : undefined}
                onEditTask={onEditTask}
                getGoalName={getGoalName}
                weekTrigger={weekTriggerFor(item)}
                weekPanel={renderWeekPanel(item)}
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
    borderRadius: radii.lg,
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
  cardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  progressBlock: {
    minWidth: 124,
    alignItems: "flex-end",
    gap: spacing.xs,
    paddingTop: 4,
  },
  progressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.successMuted,
  },
  progressPillText: {
    color: colors.success,
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
  },
  progressTrack: {
    width: 124,
    height: 6,
    borderRadius: 2,
    borderCurve: "continuous",
    backgroundColor: colors.borderSubtle,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
  },
  cardListContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  // Task row card — icon tile leading a stacked body inside its
  // own separated card. Description and meta (goal pill / time / priority)
  // sit under the title. No resting checkbox.
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.rowY,
  },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgFloating,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowCompact: {
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
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
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  goalPill: {
    maxWidth: 140,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.md,
    borderCurve: "continuous",
  },
  goalPillText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
  },
  metaGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minWidth: 0,
    flexShrink: 0,
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
  priorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.md,
    borderCurve: "continuous",
    flexShrink: 0,
  },
  priorityPillText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
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
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  overdueCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.errorMuted,
  },
  overdueCountPillText: {
    color: colors.error,
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
  },
  overdueFooter: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  overdueFooterAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  overdueFooterText: { color: colors.accent, ...typography.micro },
  overdueList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  overdueIconTile: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.errorMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  overdueIconTileDone: {
    backgroundColor: colors.successMuted,
  },
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
  overdueAgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.deadlineMuted,
    flexShrink: 0,
  },
  overdueAgePillText: {
    color: colors.deadline,
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
  },
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
    alignSelf: "flex-end",
    gap: spacing.xs,
    padding: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    backgroundColor: colors.bgFloating,
    ...shadow.sm,
  },
  inlineMenuAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  inlineMenuText: { color: colors.textSecondary, ...typography.micro },
  inlineDrop: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  inlineDropText: { color: colors.error, ...typography.micro },
  compactSchedule: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
    overflow: "hidden",
  },
  compactScheduleExpanded: { borderColor: colors.borderFocus },
  compactScheduleHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  compactScheduleTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  compactScheduleLabel: { color: colors.textPrimary, ...typography.title, fontSize: 14, lineHeight: 18 },
  compactSchedulePrompt: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  compactSchedulePromptText: { color: colors.textMuted, ...typography.bodyMd },
  compactOptions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  compactOptionHit: {
    flex: 1,
    minHeight: 64,
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderSubtle,
  },
  compactOptionVisual: { minHeight: 52, alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.xs },
  compactOptionText: { color: colors.textSecondary, ...typography.bodyMd, fontSize: 12, lineHeight: 16, textAlign: "center" },
});
