/**
 * TimelineDoneSection — the "Done · N" fold at the bottom of Today on the Timeline.
 *
 * Completed tasks collect here as slim single-line rows (filled check, struck
 * title, goal dot, completion time) so open work keeps the top of the day.
 * The fold starts expanded for a few rows and collapsed past that; the user's
 * own toggle wins after that. Tapping the check reopens the task, which sends
 * it back to the open list; tapping the row opens the editor.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { MobileTask } from "./TaskCard";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "./UiIcons";
import { colors, fonts, radii, spacing } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { goalPillFor } from "../theme/pills";
import { DONE_SECTION_EXPANDED_MAX, formatDoneTime } from "../lib/timelineDone";
import { useReducedMotion } from "../hooks/useReducedMotion";

type TimelineDoneSectionProps = {
  tasks: MobileTask[];
  getGoalName?: (taskId: string) => string | undefined;
  /** Reopen a done task. Absent while workspace actions are unavailable. */
  onReopen?: (task: MobileTask) => void;
  onPress?: (task: MobileTask) => void;
  /** "card" sits inside a carousel day card; "list" spans the list layout. */
  variant?: "card" | "list";
};

export function TimelineDoneSection({
  tasks,
  getGoalName,
  onReopen,
  onPress,
  variant = "card",
}: TimelineDoneSectionProps) {
  const reducedMotion = useReducedMotion();
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  if (tasks.length === 0) return null;
  const expanded = expandedOverride ?? tasks.length <= DONE_SECTION_EXPANDED_MAX;
  const Chevron = expanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <View style={[styles.section, variant === "list" && styles.sectionList]}>
      <Pressable
        onPress={() => setExpandedOverride(!expanded)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? "Hide" : "Show"} ${tasks.length} done ${tasks.length === 1 ? "task" : "tasks"}`}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <Text style={styles.headerText}>Done · {tasks.length}</Text>
        <Chevron color={colors.textMuted} size={18} strokeWidth={1.8} />
      </Pressable>

      {expanded
        ? tasks.map((task) => {
            const goalName = getGoalName?.(String(task._id));
            const goalColor = goalName ? goalPillFor(goalName).textColor : null;
            const doneAt = formatDoneTime(task.completedAt);
            return (
              <Animated.View
                key={String(task._id)}
                entering={reducedMotion ? undefined : FadeIn.duration(220)}
              >
                {/* Sibling pressables, not nested: each is its own focus stop. */}
                <View style={styles.row}>
                  <Pressable
                    onPress={() => onReopen?.(task)}
                    disabled={!onReopen}
                    hitSlop={6}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: true, disabled: !onReopen }}
                    accessibilityLabel={`Mark ${task.title} incomplete`}
                    style={({ pressed }) => [styles.checkHit, pressed && styles.pressed]}
                  >
                    <View style={[styles.check, !onReopen && styles.checkDisabled]}>
                      <CheckIcon size={13} color={colors.textInverse} strokeWidth={2.4} />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={onPress ? () => onPress(task) : undefined}
                    disabled={!onPress}
                    accessibilityRole="button"
                    accessibilityLabel={`${task.title}, done${doneAt ? ` at ${doneAt}` : ""}`}
                    accessibilityHint={onPress ? "Double tap to edit." : undefined}
                    style={({ pressed }) => [styles.body, pressed && onPress && styles.pressed]}
                  >
                    <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                      {task.title}
                    </Text>
                    {goalName && goalColor ? (
                      <View style={styles.goal}>
                        <View style={[styles.goalDot, { backgroundColor: goalColor }]} />
                        <Text style={styles.goalText} numberOfLines={1} ellipsizeMode="tail">
                          {goalName}
                        </Text>
                      </View>
                    ) : null}
                    {doneAt ? <Text style={styles.time}>{doneAt}</Text> : null}
                  </Pressable>
                </View>
              </Animated.View>
            );
          })
        : null}
    </View>
  );
}

const styles = createThemedStyles({
  section: {
    marginTop: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  sectionList: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  headerText: {
    color: colors.textSecondary,
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.68,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
    minHeight: 48,
    borderRadius: radii.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "stretch",
    paddingRight: spacing.md,
  },
  checkHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  checkDisabled: {
    opacity: 0.45,
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.textCompleted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: "line-through",
  },
  goal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 2,
    minWidth: 0,
    maxWidth: 110,
  },
  goalDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  goalText: {
    flexShrink: 1,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  time: {
    marginLeft: "auto",
    paddingLeft: spacing.xs,
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
});
