/**
 * TimelineTaskRow
 *
 * The timeline's compact row, sharing InboxTaskRow's grammar: a leading tile,
 * a single-line title, and a trailing group. Two timeline-specific differences:
 * the leading tile carries a priority mark instead of a surface icon (P1 in
 * accent, everything else muted), and the trailing action is the surface's
 * primary verb — a check button that marks the task done — where the inbox has
 * its schedule button. Time-of-day joins the trailing group as quiet metadata;
 * the date itself is owned by the day section header above the row.
 */

import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CheckIcon } from "./UiIcons";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { formatTime12h } from "../lib/task-form";
import type { MobileTask } from "./TaskCard";

type TimelineTaskRowProps = {
  task: MobileTask;
  /** Linked goal name, shown in the trailing group. */
  goalName?: string;
  selectMode: boolean;
  selected: boolean;
  /** Normal-mode tap: open the full editor. */
  onPress: () => void;
  /** Normal-mode long-press: enter select mode with this row selected. */
  onLongPress?: () => void;
  /** Select-mode tap: toggle this row's selection. */
  onToggleSelect: () => void;
  /** Mark this task done. Absent while workspace actions are unavailable. */
  onComplete?: () => void;
};

function TimelineTaskRowInner({
  task,
  goalName,
  selectMode,
  selected,
  onPress,
  onLongPress,
  onToggleSelect,
  onComplete,
}: TimelineTaskRowProps) {
  const leading = selectMode ? (
    <View style={[styles.tile, styles.checkTile, selected && styles.checkTileOn]}>
      {selected ? <CheckIcon size={16} color={colors.textInverse} strokeWidth={2.4} /> : null}
    </View>
  ) : (
    <View style={styles.tile}>
      <View style={[styles.priorityDot, task.priority === "p1" && styles.priorityDotP1]} />
    </View>
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
        selectMode
          ? "Toggle selection"
          : onLongPress
            ? "Opens the task. Long press to select."
            : "Opens the task."
      }
      hitSlop={selectMode ? 4 : 0}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
    >
      {leading}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {task.title}
        </Text>
      </View>

      <View style={styles.trailing}>
        {task.time ? <Text style={styles.time}>{formatTime12h(task.time)}</Text> : null}
        {goalName ? (
          <Text style={styles.goal} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.goalDiamond}>◈ </Text>
            {goalName}
          </Text>
        ) : null}
        {selectMode || !onComplete ? null : (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onComplete();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${task.title} done`}
            style={({ pressed }) => [styles.completeBtn, pressed && { opacity: 0.68 }]}
          >
            <CheckIcon size={17} color={colors.textSecondary} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export const TimelineTaskRow = memo(TimelineTaskRowInner);

const styles = createThemedStyles({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: 3,
    paddingVertical: 7,
    paddingHorizontal: 11,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowSelected: {
    backgroundColor: colors.bgFloating,
    borderColor: colors.accentSoft,
  },
  rowPressed: {
    backgroundColor: colors.bgFloating,
  },
  tile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  checkTile: {
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  checkTileOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  priorityDotP1: {
    backgroundColor: colors.accent,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.title,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
    maxWidth: "52%",
  },
  time: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  goal: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    flexShrink: 1,
  },
  goalDiamond: {
    color: colors.accent,
  },
  completeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
});
