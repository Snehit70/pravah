/**
 * TimelineTaskRow
 *
 * The compact Timeline row: one completion checkbox, a stacked title/context
 * body, and a trailing chevron for editing. The date belongs to the section
 * header above the row; goal, priority, and time stay quiet in the metadata
 * line so the title remains the scan anchor.
 */

import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CheckIcon, ChevronRightIcon } from "./UiIcons";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { formatTime12h } from "../lib/task-form";
import type { MobileTask } from "./TaskCard";

type TimelineGroupPosition = "only" | "first" | "middle" | "last";

type TimelineTaskRowProps = {
  task: MobileTask;
  /** Linked goal name, shown in the trailing group. */
  goalName?: string;
  /** Position in the date group's contiguous paper surface. */
  groupPosition?: TimelineGroupPosition;
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
  groupPosition = "only",
}: TimelineTaskRowProps) {
  const meta = [
    task.time ? formatTime12h(task.time) : null,
    goalName ?? null,
    task.priority ? task.priority.toUpperCase() : null,
  ].filter(Boolean) as string[];
  const groupStyle =
    groupPosition === "only"
      ? styles.rowOnly
      : groupPosition === "first"
        ? styles.rowFirst
        : groupPosition === "middle"
          ? styles.rowMiddle
          : styles.rowLast;

  const leading = selectMode ? (
    <View style={[styles.checkboxHit, styles.selectHit]}>
      <View style={[styles.checkbox, selected && styles.checkboxOn]}>
        {selected ? <CheckIcon size={16} color={colors.textInverse} strokeWidth={2.4} /> : null}
      </View>
    </View>
  ) : onComplete ? (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onComplete();
      }}
      hitSlop={4}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: false }}
      accessibilityLabel={`Mark ${task.title} complete`}
      style={({ pressed }) => [styles.checkboxHit, pressed && styles.checkboxPressed]}
    >
      <View style={styles.checkbox} />
    </Pressable>
  ) : (
    <View style={styles.checkboxHit}>
      <View style={[styles.checkbox, styles.checkboxDisabled]} />
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
      style={({ pressed }) => [
        styles.row,
        groupStyle,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
    >
      {leading}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {task.title}
        </Text>
        {task.description ? (
          <Text style={styles.description} numberOfLines={1} ellipsizeMode="tail">
            {task.description}
          </Text>
        ) : null}
        {meta.length > 0 ? (
          <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
            {meta.join("  ·  ")}
          </Text>
        ) : null}
      </View>

      {!selectMode ? <ChevronRightIcon color={colors.textMuted} size={20} strokeWidth={1.8} /> : null}
    </Pressable>
  );
}

export const TimelineTaskRow = memo(TimelineTaskRowInner);

const styles = createThemedStyles({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 72,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowOnly: { marginVertical: 3 },
  rowFirst: { marginTop: 3, marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  rowMiddle: { marginVertical: 0, borderRadius: 0, borderTopWidth: 0 },
  rowLast: { marginTop: 0, marginBottom: 3, borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  rowSelected: {
    backgroundColor: colors.bgFloating,
    borderColor: colors.accentSoft,
  },
  rowPressed: {
    backgroundColor: colors.bgFloating,
  },
  checkboxHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  selectHit: {
    marginTop: -1,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxDisabled: { opacity: 0.45 },
  checkboxPressed: { opacity: 0.68 },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.title,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  description: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.2,
    color: colors.textMuted,
  },
});
