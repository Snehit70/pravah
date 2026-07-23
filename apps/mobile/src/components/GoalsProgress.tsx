/**
 * GoalsProgress
 *
 * "Goals in motion": each goal with linked tasks still in flight, shown as a
 * bar that fills to its done/total ratio on entry. Deadline-urgent goals get a
 * subtle marker. Reflective, not a scoreboard — the bar is information about
 * how close you are, not a target to grind.
 *
 * Progress ratios come from lib/goalProgress (shared with GoalsScreen), so the
 * two surfaces never disagree.
 */

import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { GoalProgressRow } from "../lib/goalProgress";
import { colors, motion, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

type Props = {
  rows: GoalProgressRow[];
  /** Local-date YYYY-MM-DD for "today", for deadline urgency. */
  todayKey: string;
  /** Goals in motion beyond the ones shown, summarised as a footer. */
  moreCount?: number;
};

type Urgency = "overdue" | "soon" | null;

function urgencyFor(deadline: string | undefined, todayKey: string): Urgency {
  if (!deadline) return null;
  if (deadline < todayKey) return "overdue";
  const days = dayDiff(todayKey, deadline);
  return days <= 5 ? "soon" : null;
}

function dayDiff(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const a = new Date(fy, fm - 1, fd).getTime();
  const b = new Date(ty, tm - 1, td).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function GoalsProgress({ rows, todayKey, moreCount = 0 }: Props) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <GoalRow key={row.goal.id} row={row} urgency={urgencyFor(row.goal.deadline, todayKey)} />
      ))}
      {moreCount > 0 ? (
        <Text style={styles.moreText}>
          +{moreCount} more in Goals
        </Text>
      ) : null}
    </View>
  );
}

function GoalRow({ row, urgency }: { row: GoalProgressRow; urgency: Urgency }) {
  const reducedMotion = useReducedMotion();
  const fill = useSharedValue(reducedMotion ? row.ratio : 0);
  useEffect(() => {
    if (reducedMotion) {
      fill.value = row.ratio;
      return;
    }
    fill.value = 0;
    fill.value = withTiming(row.ratio, {
      duration: motion.duration.deliberate,
      easing: Easing.out(Easing.cubic),
    });
  }, [row.ratio, reducedMotion, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 100)}%` }));

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ now: row.done, min: 0, max: row.total }}
      accessibilityLabel={`${row.goal.text}, ${row.done} of ${row.total} tasks done${
        urgency === "overdue" ? ", overdue" : urgency === "soon" ? ", due soon" : ""
      }`}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.goalTitle} numberOfLines={1}>
          {row.goal.text}
        </Text>
        <View style={styles.rowMeta}>
          {urgency ? (
            <Text style={[styles.urgency, urgency === "overdue" && styles.urgencyOverdue]}>
              {urgency === "overdue" ? "Overdue" : "Due soon"}
            </Text>
          ) : null}
          <Text style={styles.count}>
            {row.done}/{row.total}
          </Text>
        </View>
      </View>
      <View style={styles.track} importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
    </View>
  );
}

const styles = createThemedStyles({
  list: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    gap: spacing.md,
  },
  row: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  goalTitle: {
    ...typography.bodyLg,
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.title.fontFamily,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  urgency: {
    ...typography.micro,
    color: colors.warning,
  },
  urgencyOverdue: {
    color: colors.error,
  },
  count: {
    ...typography.numeric,
    color: colors.textSecondary,
  },
  track: {
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.bgInput,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  moreText: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingTop: spacing.xs,
  },
});
