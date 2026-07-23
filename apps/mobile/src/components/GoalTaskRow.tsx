/**
 * GoalTaskRow
 *
 * A linked task inside the goal sheet, sharing InboxTaskRow's grammar: no
 * resting checkbox, tap opens the editor, long-press enters the screen's select
 * mode, and in select mode the leading mark becomes the checkbox.
 *
 * It differs from the inbox row in two ways, both because of where it sits:
 * the goal name is dropped (every row here has the same goal), and the trailing
 * slot is the task's own date rather than a bare icon. The date *is* the
 * schedule button — a dated row shows what it is set to and re-opens the sheet
 * to change it; an undated row shows the calendar icon to set one.
 */

import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { shortDate } from "../lib/dates";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import type { MobileTask } from "./TaskCard";
import { CalendarIcon, CheckIcon } from "./UiIcons";

type GoalTaskRowProps = {
  task: MobileTask;
  /** Overdue rows carry the date in the error ink the meta line uses. */
  overdue?: boolean;
  /**
   * Finished rows are evidence, not work: struck title, success dot, no
   * schedule affordance. They stay selectable so bulk unlink can reach them.
   */
  done?: boolean;
  /** Use the same raised task-card container as completion history. */
  card?: boolean;
  selectMode: boolean;
  selected: boolean;
  /** Normal-mode tap: open the full editor. */
  onPress: () => void;
  /** Normal-mode long-press: enter select mode with this row selected. */
  onLongPress: () => void;
  /** Select-mode tap: toggle this row's selection. */
  onToggleSelect: () => void;
  /**
   * Open the quick-schedule sheet for this task. When absent (workspace
   * actions unavailable) a dated row still shows its date as a static fact.
   */
  onSchedule?: () => void;
};

function GoalTaskRowInner({
  task,
  overdue = false,
  done = false,
  card = false,
  selectMode,
  selected,
  onPress,
  onLongPress,
  onToggleSelect,
  onSchedule,
}: GoalTaskRowProps) {
  const leading = selectMode ? (
    <View style={[styles.check, selected && styles.checkOn]}>
      {selected ? <CheckIcon size={12} color={colors.textInverse} strokeWidth={2.6} /> : null}
    </View>
  ) : (
    <View style={[styles.dot, done && styles.dotDone]} />
  );

  return (
    <Pressable
      onPress={selectMode ? onToggleSelect : onPress}
      onLongPress={selectMode ? undefined : onLongPress}
      delayLongPress={250}
      accessibilityRole={selectMode ? "checkbox" : "button"}
      accessibilityState={selectMode ? { checked: selected } : undefined}
      accessibilityLabel={task.title}
      accessibilityHint={
        selectMode ? "Toggle selection" : "Opens the task. Long press to select."
      }
      hitSlop={selectMode ? 4 : 0}
      style={({ pressed }) => [
        styles.row,
        card && styles.rowCard,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
    >
      {leading}

      <Text style={[styles.title, done && styles.titleDone]} numberOfLines={1} ellipsizeMode="tail">
        {task.title}
      </Text>

      {selectMode || done || (!task.deadline && !onSchedule) ? null : task.deadline && !onSchedule ? (
        <Text style={[styles.date, overdue && styles.dateOverdue]}>
          {shortDate(task.deadline)}
        </Text>
      ) : (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onSchedule?.();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            task.deadline
              ? `Reschedule ${task.title}, currently ${shortDate(task.deadline)}`
              : `Schedule ${task.title}`
          }
          style={({ pressed }) => [styles.scheduleBtn, pressed && { opacity: 0.68 }]}
        >
          {task.deadline ? (
            <Text style={[styles.date, overdue && styles.dateOverdue]}>
              {shortDate(task.deadline)}
            </Text>
          ) : (
            <CalendarIcon size={16} color={colors.textSecondary} strokeWidth={1.8} />
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

export const GoalTaskRow = memo(GoalTaskRowInner);

const styles = createThemedStyles({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rowSelected: {
    backgroundColor: colors.bgFloating,
  },
  rowCard: {
    minHeight: 72,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderCurve: "continuous",
    backgroundColor: colors.bgCard,
  },
  rowPressed: {
    backgroundColor: colors.bgSurface,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: "transparent",
  },
  dotDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  check: {
    width: 16,
    height: 16,
    marginHorizontal: -4.5,
    borderRadius: 5,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  title: {
    ...typography.title,
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  titleDone: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  scheduleBtn: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  date: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  dateOverdue: {
    color: colors.error,
  },
});
