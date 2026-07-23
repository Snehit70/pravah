/**
 * InboxTaskRow
 *
 * The compact triage row, modelled on the GoalsScreen row: a leading icon tile,
 * a single-line title with the linked goal inline, and a trailing schedule icon.
 * There is no resting checkbox — completing a task is a deliberate act that
 * lives in the screen's select mode. In select mode the leading tile becomes the
 * selection checkbox and the whole row toggles selection.
 */

import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import NavInboxAsset from "../assets/icons/nav-inbox.svg";
import { CalendarIcon, CheckIcon } from "./UiIcons";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import type { MobileTask } from "./TaskCard";

type InboxTaskRowProps = {
  task: MobileTask;
  /** Linked goal name, shown inline after the title. */
  goalName?: string;
  selectMode: boolean;
  selected: boolean;
  /** Normal-mode tap: open the full editor. */
  onPress: () => void;
  /** Normal-mode long-press: enter select mode with this row selected. */
  onLongPress: () => void;
  /** Select-mode tap: toggle this row's selection. */
  onToggleSelect: () => void;
  /** Open the quick-schedule sheet for this task. */
  onSchedule: () => void;
};

function InboxTaskRowInner({
  task,
  goalName,
  selectMode,
  selected,
  onPress,
  onLongPress,
  onToggleSelect,
  onSchedule,
}: InboxTaskRowProps) {
  const leading = selectMode ? (
    <View
      style={[styles.tile, styles.checkTile, selected && styles.checkTileOn]}
    >
      {selected ? <CheckIcon size={16} color={colors.textInverse} strokeWidth={2.4} /> : null}
    </View>
  ) : (
    <View style={styles.tile}>
      <NavInboxAsset color={colors.textMuted} width={18} height={18} />
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
        selectMode ? "Toggle selection" : "Opens the task. Long press to select."
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
        {goalName ? (
          <Text style={styles.goal} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.goalDiamond}>◈ </Text>
            {goalName}
          </Text>
        ) : null}
        {selectMode ? null : (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onSchedule();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Schedule ${task.title}`}
            style={({ pressed }) => [styles.scheduleBtn, pressed && { opacity: 0.68 }]}
          >
            <CalendarIcon size={17} color={colors.textSecondary} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export const InboxTaskRow = memo(InboxTaskRowInner);

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
  scheduleBtn: {
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
