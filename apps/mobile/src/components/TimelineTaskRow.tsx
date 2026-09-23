/**
 * TimelineTaskRow
 *
 * The Timeline task card: a completion checkbox, a timeline icon tile, a
 * stacked title/context body, and a trailing chevron for editing. The date
 * belongs to the section header above the card; the goal renders as a pastel
 * pill and time/priority stay as quiet icon chips in the meta row so the
 * title remains the scan anchor. Each row is its own separated card.
 */

import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import NavTimelineAsset from "../assets/icons/nav-timeline.svg";
import { CheckIcon, ChevronRightIcon, ClockIcon, StarIcon } from "./UiIcons";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { formatTime12h } from "../lib/task-form";
import type { MobileTask } from "./TaskCard";

type TimelineGroupPosition = "only" | "first" | "middle" | "last";

const PRIORITY_META = {
  p1: { label: "P1", color: colors.priorityP1, bg: colors.errorMuted },
  p2: { label: "P2", color: colors.priorityP2, bg: colors.warningMuted },
  p3: { label: "P3", color: colors.priorityP3, bg: colors.successMuted },
} as const;

// Pastel goal pills, cycled deterministically off the goal name so the same
// goal always wears the same tint. Uses the muted semantic washes so pills
// stay legible in both light and dark themes.
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
  const priority = task.priority ? PRIORITY_META[task.priority] : null;
  const timeLabel = task.time ? formatTime12h(task.time) : null;
  const goalPill = goalName ? goalPillFor(goalName) : null;
  const hasMetaRow = Boolean(goalName ?? timeLabel ?? priority);
  // Individual cards: the group position is kept for API compatibility but
  // no longer joins rows into a contiguous surface — every row is its own
  // separated card with full radius and a vertical gap.
  void groupPosition;
  const groupStyle = styles.rowOnly;

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

  const iconTile = selectMode ? null : (
    <View style={styles.tile} accessibilityElementsHidden>
      <NavTimelineAsset color={colors.accent} width={20} height={20} />
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
      {iconTile}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {task.title}
        </Text>
        {task.description ? (
          <Text style={styles.description} numberOfLines={1} ellipsizeMode="tail">
            {task.description}
          </Text>
        ) : null}
        {hasMetaRow ? (
          <View style={styles.metaRow}>
            {goalName && goalPill ? (
              <View
                style={[styles.goalPill, { backgroundColor: goalPill.backgroundColor }]}
              >
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
              <View style={styles.metaChip}>
                <ClockIcon color={colors.textMuted} size={13} strokeWidth={1.9} />
                <Text style={styles.metaChipText}>{timeLabel}</Text>
              </View>
            ) : null}
            {priority ? (
              <View style={[styles.priorityPill, { backgroundColor: priority.bg }]}>
                <StarIcon color={priority.color} size={12} strokeWidth={2} />
                <Text style={[styles.priorityPillText, { color: priority.color }]}>
                  {priority.label}
                </Text>
              </View>
            ) : null}
          </View>
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
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 76,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowOnly: { marginVertical: 6 },
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
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
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
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  metaChipText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
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
});
