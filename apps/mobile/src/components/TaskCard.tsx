import { memo, useCallback, useEffect, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors, fonts, motion, radii, shadow, spacing, typography } from "../theme/tokens";
import { getLocalDateString } from "../lib/dates";
import type { Id } from "../../../../convex/_generated/dataModel";
import { isTaskCompleted, isTaskInInbox, isTaskOnTimeline } from "../lib/taskState";
import { formatTime12h } from "../lib/task-form";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useUserPreferences } from "../hooks/useUserPreferences";
import type { AccentColor } from "../lib/userPreferences";

export type MobileTask = {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  deadline?: string;
  /** Time-of-day in "HH:MM" 24-hour format. Only present when deadline is set. */
  time?: string;
  scheduledAt: number;
  completedAt?: number;
  cancelledAt?: number;
  priority?: "p1" | "p2" | "p3";
  position: number;
  updatedAt: number;
  createdAt: number;
};

type TaskCardProps = {
  task: MobileTask;
  /** Pretty label for the row's scheduled date (e.g. "TODAY", "TOMORROW", "APR 30"). */
  dateLabel?: string;
  onDone: (id: Id<"tasks">) => void;
  /** Inbox → Today swipe action. */
  onMoveToday?: (id: Id<"tasks">) => void;
  /** Timeline → Inbox swipe action. */
  onSendToInbox?: (id: Id<"tasks">) => void;
  /** Completed → Reopen swipe action. */
  onReopen?: (id: Id<"tasks">) => void;
  /** Timeline accessibility reorder action. */
  onReorder?: (id: Id<"tasks">, direction: "up" | "down") => void;
  onEdit: (task: MobileTask) => void;
  /** Hook for the parent list to start a drag from a long-press. Currently
   *  unused — drag-to-reorder is disabled while RNDFL is incompatible with
   *  Reanimated 4. The prop is kept so the wiring stays in place. */
  onDragHandlePress?: () => void;
  /** Name of the goal this task is linked to, if any. */
  linkedGoalName?: string;
  /** Hide priority metadata when a parent group already carries that encoding. */
  hidePriorityBadge?: boolean;
  /** Swipe gestures are opt-in. Every action must remain visible without them. */
  swipeActionsEnabled?: boolean;
};

const TASK_CARD_RADIUS = radii.lg;

function taskEmphasisColor(scheme: AccentColor): string {
  switch (scheme) {
    case "copper":
      return colors.deadline;
    case "teal":
      return colors.success;
    case "rose":
      return colors.error;
    case "purple":
      return colors.accent;
  }
}

/**
 * Reanimated swipe-action panel. The pan progress comes from
 * ReanimatedSwipeable's drag SharedValue, which we map to opacity + a slight
 * scale so the action label fades in as the row slides. The swipeable
 * threshold is 80px (set on the parent), which is what triggers the action.
 */
function SwipeActionLabel({
  drag,
  side,
  label,
  background,
  textColor,
}: {
  drag: SharedValue<number>;
  side: "left" | "right";
  label: string;
  background: string;
  textColor: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    // drag is positive when swiping right (left action revealed), negative
    // when swiping left (right action revealed). Normalize to 0..1 over the
    // first 80px of pan so the label is fully visible by the action threshold.
    const progress =
      side === "left"
        ? interpolate(drag.value, [0, 80], [0, 1], "clamp")
        : interpolate(-drag.value, [0, 80], [0, 1], "clamp");
    return { opacity: progress };
  });

  return (
    <View style={[styles.swipeAction, { backgroundColor: background }, side === "right" && styles.swipeActionRight]}>
      <Animated.Text style={[styles.swipeActionLabel, { color: textColor }, animatedStyle]}>
        {label}
      </Animated.Text>
    </View>
  );
}

function TaskCardInner({
  task,
  dateLabel: dateLabelText,
  onDone,
  onMoveToday,
  onSendToInbox,
  onReopen,
  onReorder,
  onEdit,
  onDragHandlePress,
  linkedGoalName,
  hidePriorityBadge,
  swipeActionsEnabled = false,
}: TaskCardProps) {
  const isCompleted = isTaskCompleted(task);
  const isInboxTask = isTaskInInbox(task);
  const swipeRef = useRef<SwipeableMethods>(null);
  const reducedMotion = useReducedMotion();
  const { prefs } = useUserPreferences();
  const compactDensity = prefs.density === "compact";
  const taskAccent = taskEmphasisColor(prefs.taskColorScheme);

  // Web parity (src/index.css:228-233): when a task flips to completed, a 1px
  // accent bar sweeps left→right across the row, then the row eases to
  // 55% opacity. RN can't run clip-path so we drive the sweep with two
  // SharedValues: progress (the leading edge moves 0→1, the trailing edge
  // chases) plus opacity for the final fadeout.
  const sweepProgress = useSharedValue(0);
  const sweepOpacity = useSharedValue(0);
  const wasCompleted = useRef(isCompleted);
  useEffect(() => {
    if (!wasCompleted.current && isCompleted) {
      if (!reducedMotion) {
        sweepOpacity.value = 1;
        sweepProgress.value = 0;
        sweepProgress.value = withTiming(
          1,
          {
            duration: motion.duration.deliberate,
            easing: Easing.bezier(...motion.easing.outQuart),
          },
          (finished) => {
            if (finished) sweepOpacity.value = withTiming(0, { duration: motion.duration.fast });
          }
        );
      }
    }
    wasCompleted.current = isCompleted;
  }, [isCompleted, reducedMotion, sweepOpacity, sweepProgress]);

  // Bar leading edge tracks progress; trailing edge follows ~50% behind so the
  // visible accent stripe is a moving slice rather than a full fill. Width is
  // expressed as % of the row, translated via flex on a wrapper View.
  const sweepStyle = useAnimatedStyle(() => {
    const left = interpolate(sweepProgress.value, [0, 1], [-30, 100], "clamp");
    return {
      opacity: sweepOpacity.value,
      transform: [{ translateX: `${left}%` }],
    };
  });

  const handleDone = useCallback(() => onDone(task._id), [onDone, task._id]);
  const handleMoveToday = useCallback(() => onMoveToday?.(task._id), [onMoveToday, task._id]);
  const handleSendToInbox = useCallback(() => onSendToInbox?.(task._id), [onSendToInbox, task._id]);
  const handleReopen = useCallback(() => onReopen?.(task._id), [onReopen, task._id]);
  const handleMoveUp = useCallback(() => onReorder?.(task._id, "up"), [onReorder, task._id]);
  const handleMoveDown = useCallback(() => onReorder?.(task._id, "down"), [onReorder, task._id]);
  const handleEdit = useCallback(() => onEdit(task), [onEdit, task]);
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      switch (event.nativeEvent.actionName) {
        case "activate":
          handleEdit();
          break;
        case "complete":
          handleDone();
          break;
        case "move_today":
          handleMoveToday();
          break;
        case "move_to_inbox":
          handleSendToInbox();
          break;
        case "reopen":
          handleReopen();
          break;
        case "increment":
          handleMoveDown();
          break;
        case "decrement":
          handleMoveUp();
          break;
      }
    },
    [handleDone, handleEdit, handleMoveDown, handleMoveToday, handleMoveUp, handleReopen, handleSendToInbox]
  );

  // Right-side action (revealed by swiping LEFT) — always "Done" for active
  // tasks, "Reopen" for completed ones.
  const onRightActionTrigger = isCompleted ? handleReopen : handleDone;
  const rightActionLabel = isCompleted ? "Reopen" : "Done";

  // Left-side action (revealed by swiping RIGHT) — Today for inbox, Inbox for
  // timeline, nothing for completed (only the right-side reopen exists).
  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => (
      <SwipeActionLabel
        drag={drag}
        side="right"
        label={rightActionLabel}
        background={isCompleted ? colors.bgInput : colors.primary}
        textColor={isCompleted ? colors.textPrimary : colors.primaryInk}
      />
    ),
    [isCompleted, rightActionLabel]
  );

  const renderLeftActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) =>
      !isCompleted ? (
        <SwipeActionLabel
          drag={drag}
          side="left"
          label={isInboxTask ? "Today" : "Inbox"}
          background={colors.bgInput}
          textColor={colors.textPrimary}
        />
      ) : null,
    [isCompleted, isInboxTask]
  );

  const handleSwipeableOpen = useCallback(
    (direction: "left" | "right") => {
      // Trigger the action then close the swipeable so the row resets even
      // if the parent's optimistic mutation hasn't filtered it out yet.
      if (direction === "right" && !isCompleted) {
        if (isInboxTask) {
          handleMoveToday();
        } else {
          handleSendToInbox();
        }
      } else if (direction === "left") {
        onRightActionTrigger?.();
      }
      swipeRef.current?.close();
    },
    [handleMoveToday, handleSendToInbox, isCompleted, isInboxTask, onRightActionTrigger]
  );

  // The left rail is priority-only for active rows. Date state stays in the
  // right metadata column so overdue does not borrow the priority signal.
  const today = getLocalDateString();
  const isOverdue = !!task.deadline && task.deadline < today && !isCompleted;
  const railColor = isCompleted
    ? colors.success
    : task.priority === "p1"
      ? colors.priorityP1
      : task.priority === "p2"
        ? colors.priorityP2
        : task.priority === "p3"
          ? colors.priorityP3
          : taskAccent;

  // Stacked metadata column on the right. Each line is its own micro entry so
  // the column reads like a small log table rather than a row of pills.
  const metaLines: { key: string; text: string; tone?: "muted" | "error" | "accent" }[] = [];
  // A single humanized date line, supplied by the caller. On the timeline the
  // day-named section header owns the date, so no date is passed (and none
  // renders); surfaces without a header (e.g. Inbox) pass a humanized date so
  // the card self-describes. No raw ISO, no duplicate relative pill.
  if (dateLabelText && !isCompleted) {
    metaLines.push({
      key: "date",
      text: dateLabelText.toUpperCase(),
      tone: isOverdue ? "error" : "muted",
    });
  }
  if (task.time && !isCompleted) {
    metaLines.push({
      key: "time",
      text: formatTime12h(task.time),
      tone: "muted",
    });
  }
  if (task.priority && !isCompleted && !hidePriorityBadge) {
    metaLines.push({
      key: "prio",
      text: task.priority.toUpperCase(),
      tone: task.priority === "p1" ? "accent" : "muted",
    });
  }

  // Title can wrap to 2 lines when there's no description; otherwise it stays
  // single-line so the description gets to read as one full line below it.
  const hasDescription = Boolean(task.description) && !isCompleted;
  const titleLines = hasDescription ? 1 : 2;
  const accessibilityActions = [
    { name: "activate", label: "Edit task" },
    isCompleted
      ? onReopen
        ? { name: "reopen", label: "Reopen task" }
        : null
      : { name: "complete", label: "Mark done" },
    !isCompleted && isInboxTask && onMoveToday
      ? { name: "move_today", label: "Move to today" }
      : null,
    !isCompleted && !isInboxTask && onSendToInbox
      ? { name: "move_to_inbox", label: "Move to inbox" }
      : null,
    isTaskOnTimeline(task) && onReorder ? { name: "increment", label: "Move down" } : null,
    isTaskOnTimeline(task) && onReorder ? { name: "decrement", label: "Move up" } : null,
  ].filter(Boolean) as Array<{ name: string; label: string }>;
  const accessibilityHint =
    accessibilityActions.length > 1
      ? "Double tap to edit. Additional task actions are available."
      : "Double tap to edit.";

  const primaryAction: {
    label: string;
    run?: () => void;
    tone: "primary" | "secondary";
    semantic: "button" | "completion";
  } =
    isCompleted
      ? { label: "Reopen", run: onReopen ? handleReopen : undefined, tone: "secondary", semantic: "completion" }
      : isInboxTask
        ? { label: "Schedule", run: onMoveToday ? handleMoveToday : undefined, tone: "primary", semantic: "button" }
        : { label: "Complete", run: handleDone, tone: "primary", semantic: "completion" };
  const secondaryAction: {
    label: string;
    run?: () => void;
    tone: "secondary";
    semantic: "button" | "completion";
  } | null = isCompleted
    ? null
    : isInboxTask
      ? { label: "Complete", run: handleDone, tone: "secondary", semantic: "completion" }
      : { label: "Inbox", run: onSendToInbox ? handleSendToInbox : undefined, tone: "secondary", semantic: "button" };

  const rowContent = (
    <Pressable
      onPress={handleEdit}
      // Long-press is wired up for future drag-to-reorder; currently a no-op
      // while the parent list is plain FlatList.
      onLongPress={onDragHandlePress}
      delayLongPress={250}
      style={({ pressed }) => [
        styles.row,
        compactDensity && styles.rowCompact,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={handleAccessibilityAction}
      hitSlop={12}
    >
      {/* Priority rail — the only enclosing shape on the row. */}
      <View style={[styles.rail, { backgroundColor: railColor }]} />

      {/* Completion sweep — 1px accent stripe that scans across the card
          on the inbox→completed transition. Pointer-events none. */}
      <Animated.View pointerEvents="none" style={[styles.sweep, sweepStyle]} />

      {/* Body — title + description. Both single-line by default. */}
      <View style={styles.body}>
        <Text
          style={[
            styles.title,
            compactDensity && styles.titleCompact,
            isCompleted && styles.titleCompleted,
          ]}
          numberOfLines={titleLines}
          ellipsizeMode="tail"
        >
          {task.title}
        </Text>
        {hasDescription ? (
          <Text
            style={[styles.description, compactDensity && styles.descriptionCompact]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {task.description}
          </Text>
        ) : null}
        {linkedGoalName ? (
          <Text
            style={[styles.goalTag, { color: taskAccent }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            ◈ {linkedGoalName}
          </Text>
        ) : null}
      </View>

      {/* Metadata column — right-aligned mono micro stack. Renders nothing
          when there's no date / deadline / priority so the row stays clean. */}
      {metaLines.length ? (
        <View style={styles.metaCol}>
          {metaLines.map((line) => (
            <Text
              key={line.key}
              style={[
                styles.metaText,
                line.tone === "accent" && { color: taskAccent },
                line.tone === "error" && styles.metaTextError,
              ]}
              numberOfLines={1}
            >
              {line.text}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actionCol}>
        {secondaryAction ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              secondaryAction.run?.();
            }}
            disabled={!secondaryAction.run}
            hitSlop={10}
            accessibilityRole={secondaryAction.semantic === "completion" ? "checkbox" : "button"}
            accessibilityState={
              secondaryAction.semantic === "completion" ? { checked: isCompleted } : undefined
            }
            accessibilityLabel={
              secondaryAction.semantic === "completion"
                ? `Mark ${task.title} complete`
                : `${secondaryAction.label} ${task.title}`
            }
            style={({ pressed }) => [
              styles.primaryAction,
              styles.primaryActionSecondary,
              styles.secondaryInlineAction,
              pressed && secondaryAction.run && { opacity: 0.68 },
              !secondaryAction.run && { opacity: 0.45 },
            ]}
          >
            <Text style={[styles.primaryActionText, styles.primaryActionTextSecondary]}>
              {secondaryAction.label}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            primaryAction.run?.();
          }}
          disabled={!primaryAction.run}
          hitSlop={10}
          accessibilityRole={primaryAction.semantic === "completion" ? "checkbox" : "button"}
          accessibilityState={
            primaryAction.semantic === "completion" ? { checked: isCompleted } : undefined
          }
          accessibilityLabel={
            primaryAction.semantic === "completion"
              ? isCompleted
                ? `Mark ${task.title} incomplete`
                : `Mark ${task.title} complete`
              : `${primaryAction.label} ${task.title}`
          }
          style={({ pressed }) => [
            styles.primaryAction,
            primaryAction.tone === "primary" && { backgroundColor: taskAccent },
            primaryAction.tone === "secondary" && styles.primaryActionSecondary,
            pressed && primaryAction.run && { opacity: 0.68 },
            !primaryAction.run && { opacity: 0.45 },
          ]}
        >
          <Text
            style={[
              styles.primaryActionText,
              primaryAction.tone === "secondary" && styles.primaryActionTextSecondary,
            ]}
          >
            {primaryAction.label}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );

  if (!swipeActionsEnabled) {
    return <View style={styles.swipeContainer}>{rowContent}</View>;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      // The action triggers automatically once the row is dragged past this
      // threshold, matching iOS Mail / Things-3 behavior. Below the threshold
      // the row just snaps back.
      leftThreshold={80}
      rightThreshold={80}
      overshootLeft={false}
      overshootRight={false}
      // The right-side action is always available (Done for active tasks,
      // Reopen for completed). The left-side action is conditional on tab.
      renderRightActions={renderRightActions}
      renderLeftActions={!isCompleted ? renderLeftActions : undefined}
      onSwipeableOpen={handleSwipeableOpen}
      containerStyle={styles.swipeContainer}
    >
      {rowContent}
    </ReanimatedSwipeable>
  );
}

export const TaskCard = memo(TaskCardInner);

const styles = StyleSheet.create({
  // Each row is its own card. Margin between rows replaces the old hairline
  // divider — visual separation comes from the card edges + grid background
  // showing through the gap.
  swipeContainer: {
    backgroundColor: "transparent",
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    borderRadius: TASK_CARD_RADIUS,
    overflow: "hidden",
  },
  // Web parity (src/components/TaskCard.tsx:77-93): translucent card fill on
  // top of the grid, hairline border, soft layered shadow.
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: TASK_CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.sm,
  },
  rowCompact: {
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.bgFloating,
  },
  // Web parity (src/components/TaskCard.tsx:94-101): a 4px left accent rail
  // anchored to the card edge, color reflecting status. Done as an absolutely
  // positioned strip so it always touches the rounded corner cleanly.
  rail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: TASK_CARD_RADIUS,
    borderBottomLeftRadius: TASK_CARD_RADIUS,
  },
  // Sweep stripe — 30% wide, full row height, accent fill. Position:absolute
  // + translateX % drives the scan motion via Reanimated.
  sweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "30%",
    backgroundColor: colors.accentSoft,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
  },
  titleCompact: {
    fontSize: 15,
    lineHeight: 20,
  },
  titleCompleted: {
    color: colors.textCompleted,
    textDecorationLine: "line-through",
  },
  description: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    marginTop: 2,
  },
  descriptionCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  goalTag: {
    ...typography.micro,
    color: colors.accent,
    marginTop: 4,
    opacity: 0.8,
  },
  // Right-aligned metadata column. Stays narrow so the title gets the
  // horizontal real estate. Each micro line stacks tightly.
  metaCol: {
    marginLeft: spacing.md,
    alignItems: "flex-end",
    minWidth: 60,
    gap: 2,
  },
  metaText: {
    color: colors.textMuted,
    ...typography.micro,
  },
  metaTextAccent: {
    color: colors.accent,
  },
  metaTextError: {
    color: colors.error,
  },
  primaryAction: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
    justifyContent: "center",
  },
  primaryActionSecondary: {
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  primaryActionText: {
    ...typography.micro,
    color: colors.textInverse,
  },
  primaryActionTextSecondary: {
    color: colors.textSecondary,
  },
  actionCol: {
    marginLeft: spacing.md,
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
  },
  secondaryInlineAction: {
    backgroundColor: colors.bgCard,
  },
  // Swipe action panels — flat color, single label. The label is rendered
  // via SwipeActionLabel above so it can fade in proportional to drag.
  swipeAction: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: spacing.xl,
  },
  swipeActionRight: {
    alignItems: "flex-end",
  },
  swipeActionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
