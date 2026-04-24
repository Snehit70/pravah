import { memo, useCallback, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { colors, fonts, spacing, typography } from "../theme/tokens";
import type { Id } from "../../../../convex/_generated/dataModel";

export type MobileTask = {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  status: "inbox" | "scheduled" | "completed" | "cancelled";
  scheduledDate?: string;
  position: number;
  updatedAt: number;
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
  /** Provided by DraggableFlatList; called from long-press to initiate drag. */
  onDragHandlePress?: () => void;
};

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
}: TaskCardProps) {
  const isCompleted = task.status === "completed";
  const isInboxTask = task.status === "inbox";
  const swipeRef = useRef<SwipeableMethods>(null);

  const handleDone = useCallback(() => onDone(task._id), [onDone, task._id]);
  const handleCheckboxPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      handleDone();
    },
    [handleDone]
  );
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

  // Priority rail color. The rail is the only enclosing element on the row
  // and is the primary at-a-glance signal for urgency.
  const railColor =
    task.priority === "p1"
      ? colors.priorityP1
      : task.priority === "p2"
        ? colors.borderSubtle
        : "transparent";

  // Stacked metadata column on the right. Each line is its own micro entry so
  // the column reads like a small log table rather than a row of pills.
  const metaLines: { key: string; text: string; tone?: "muted" | "error" | "accent" }[] = [];
  if (dateLabelText && !isCompleted) {
    metaLines.push({ key: "date", text: dateLabelText.toUpperCase(), tone: "muted" });
  }
  if (task.deadline && !isCompleted) {
    metaLines.push({ key: "due", text: `Due ${task.deadline}`, tone: "muted" });
  }
  if (task.priority && !isCompleted) {
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
  const accessibilityHint = isCompleted
    ? "Double tap to edit. Use actions to reopen this task."
    : isInboxTask
      ? "Double tap to edit. Use actions to mark done or move to today."
      : onReorder
        ? "Double tap to edit. Use actions to mark done, move to inbox, or reorder this task."
        : "Double tap to edit. Use actions to mark done or move to inbox.";
  const accessibilityActions = [
    { name: "activate", label: "Edit task" },
    isCompleted ? { name: "reopen", label: "Reopen task" } : { name: "complete", label: "Mark done" },
    !isCompleted && isInboxTask ? { name: "move_today", label: "Move to today" } : null,
    !isCompleted && !isInboxTask ? { name: "move_to_inbox", label: "Move to inbox" } : null,
    task.status === "scheduled" && onReorder ? { name: "increment", label: "Move down" } : null,
    task.status === "scheduled" && onReorder ? { name: "decrement", label: "Move up" } : null,
  ].filter(Boolean) as Array<{ name: string; label: string }>;

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
      <Pressable
        onPress={handleEdit}
        // Long-press initiates the parent DraggableFlatList drag. The
        // delayLongPress matches DraggableFlatList's default activation timer.
        onLongPress={onDragHandlePress}
        delayLongPress={250}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={task.title}
        accessibilityHint={accessibilityHint}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={handleAccessibilityAction}
      >
        {/* Priority rail — the only enclosing shape on the row. */}
        <View style={[styles.rail, { backgroundColor: railColor }]} />

        {/* Checkbox — 20px circle. Tapping completes the task; for completed
            rows it's filled and inert (the swipe-right reopen action handles
            that case). */}
        {isCompleted ? (
          <View
            style={[styles.checkbox, styles.checkboxDone]}
            accessible
            accessibilityRole="checkbox"
            accessibilityState={{ checked: true }}
            accessibilityLabel={`${task.title} completed`}
          />
        ) : (
          <Pressable
            onPress={handleCheckboxPress}
            hitSlop={10}
            style={({ pressed }) => [styles.checkbox, pressed && styles.checkboxPressed]}
            accessibilityRole="checkbox"
            accessibilityLabel={`Complete ${task.title}`}
            accessibilityState={{ checked: false }}
          />
        )}

        {/* Body — title + description. Both single-line by default. */}
        <View style={styles.body}>
          <Text
            style={[styles.title, isCompleted && styles.titleCompleted]}
            numberOfLines={titleLines}
            ellipsizeMode="tail"
          >
            {task.title}
          </Text>
          {hasDescription ? (
            <Text style={styles.description} numberOfLines={1} ellipsizeMode="tail">
              {task.description}
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
                  line.tone === "accent" && styles.metaTextAccent,
                  line.tone === "error" && styles.metaTextError,
                ]}
                numberOfLines={1}
              >
                {line.text}
              </Text>
            ))}
          </View>
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export const TaskCard = memo(TaskCardInner);

const styles = StyleSheet.create({
  // Wraps the swipeable so each row sits flush against its neighbors and the
  // hairline divider sits exactly at the row boundary.
  swipeContainer: {
    backgroundColor: colors.bg,
  },
  // The row itself — flat, no border, no card background, no radius. The
  // hairline divider is drawn as the row's bottom border, inset 16px on the
  // left so the priority rail visually crosses it.
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingRight: spacing.lg,
    paddingVertical: spacing.rowY,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    // Inset the divider on the left so it visually crosses through the rail.
    marginLeft: 0,
  },
  rowPressed: {
    backgroundColor: colors.bgInput,
  },
  // Priority rail — 2px wide, full row height. p1 = copper, p2 = subtle,
  // p3 = transparent. Sits flush at row x=0 so it reads as the row's edge.
  rail: {
    width: 2,
    alignSelf: "stretch",
    marginRight: spacing.md,
  },
  // Checkbox — 20px ring. Empty in default state (no inner dot), filled in
  // completed state. Strikethrough on the title carries the rest of the
  // signal so the checkbox doesn't need a glyph.
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.textMuted,
    marginTop: 1,
    marginRight: spacing.md,
  },
  checkboxPressed: {
    borderColor: colors.textSecondary,
  },
  checkboxDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
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
