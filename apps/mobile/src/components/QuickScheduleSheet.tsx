/**
 * QuickScheduleSheet
 *
 * The inbox's schedule affordance. Tapping a row's schedule icon opens this
 * instead of the full editor: three one-tap presets (Today, Tomorrow, This
 * weekend) plus a "Pick a date" branch that hands off to ThemedDatePicker.
 * Placing a task from the triage queue is meant to be a single tap, so the
 * common cases never load the editor.
 */

import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TaskIcon from "../assets/icons/add-new-task.svg";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { addDays, shortDate, toIsoDate, weekdayDate } from "../lib/dates";
import { haptic } from "../lib/haptic";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ThemedDatePicker } from "./ThemedDatePicker";
import { ScrollViewWithScrollbar } from "./ScrollViewWithScrollbar";
import { CalendarIcon, ChevronRightIcon, CloseIcon } from "./UiIcons";

type QuickScheduleSheetProps = {
  visible: boolean;
  /** Title of the task being scheduled, for the sheet header. */
  taskTitle?: string;
  onClose: () => void;
  /** Called with the chosen ISO date (YYYY-MM-DD). */
  onPick: (isoDate: string) => void;
};

// The weekend option lands on the coming Saturday; if today is already the
// weekend, jump to the next one so the choice is always distinct from "Today".
function comingWeekend(base: Date): Date {
  const day = base.getDay(); // 0 Sun … 6 Sat
  const untilSaturday = (6 - day + 7) % 7;
  return addDays(base, untilSaturday === 0 ? 7 : untilSaturday);
}

export function QuickScheduleSheet({
  visible,
  taskTitle,
  onClose,
  onPick,
}: QuickScheduleSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Hold the last title through dismissal: callers null the task on close,
  // and without this the header blanks while the sheet is still sliding out.
  const [displayTitle, setDisplayTitle] = useState(taskTitle);
  if (taskTitle !== undefined && taskTitle !== displayTitle) {
    setDisplayTitle(taskTitle);
  }

  // Recomputed on every open: the sheet stays mounted across sessions, and
  // presets frozen at first mount would schedule "Today" as yesterday once
  // the app is left running past midnight.
  const options = useMemo(() => {
    const now = new Date();
    const today = toIsoDate(now);
    const tomorrow = toIsoDate(addDays(now, 1));
    const weekend = toIsoDate(comingWeekend(now));
    return [
      { key: "today", label: "Today", iso: today },
      { key: "tomorrow", label: "Tomorrow", iso: tomorrow },
      { key: "weekend", label: "This weekend", iso: weekend },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handlePick = (iso: string) => {
    haptic.selection();
    onPick(iso);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.grab} />
          <View style={styles.header}>
            <View style={styles.headingCopy}>
              <View style={styles.headingRow}>
                <CalendarIcon color={colors.accent} size={22} strokeWidth={1.8} />
                <Text style={styles.heading}>Schedule task</Text>
              </View>
              {displayTitle ? (
                <View style={styles.taskTitleRow}>
                  <TaskIcon width={22} height={22} color={colors.accent} />
                  <Text style={styles.taskTitle} numberOfLines={2}>{displayTitle}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close schedule"
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <CloseIcon color={colors.textSecondary} size={18} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollViewWithScrollbar style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            <View style={styles.optionGroup}>
              {options.map((option, index) => (
                <Pressable
                  key={option.key}
                  onPress={() => handlePick(option.iso)}
                  accessibilityRole="button"
                  accessibilityLabel={`Schedule for ${option.label}, ${weekdayDate(option.iso)}`}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && styles.optionDivider,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View
                    accessible={false}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[styles.dateBadge, index === 0 && styles.dateBadgeToday]}
                  >
                    <Text style={[styles.badgeMonth, index === 0 && styles.todayInk]}>
                      {shortDate(option.iso).split(" ")[0]}
                    </Text>
                    <Text style={[styles.badgeDay, index === 0 && styles.todayInk]}>
                      {Number(option.iso.slice(-2))}
                    </Text>
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    <Text style={styles.optionHint}>{weekdayDate(option.iso)}</Text>
                  </View>
                </Pressable>
              ))}

              <Pressable
                onPress={() => {
                  haptic.selection();
                  setShowDatePicker(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Pick a date"
                style={({ pressed }) => [styles.option, styles.optionDivider, pressed && styles.optionPressed]}
              >
                <View style={styles.dateBadge}>
                  <CalendarIcon color={colors.textSecondary} size={21} strokeWidth={1.8} />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionLabel}>Pick a date</Text>
                  <Text style={styles.optionHint}>Open calendar</Text>
                </View>
                <ChevronRightIcon color={colors.textMuted} size={18} strokeWidth={1.8} />
              </Pressable>
            </View>
          </ScrollViewWithScrollbar>
        </View>
      </View>

      <ThemedDatePicker
        visible={showDatePicker}
        onSelect={(iso) => {
          setShowDatePicker(false);
          handlePick(iso);
        }}
        onClose={() => setShowDatePicker(false)}
      />
    </Modal>
  );
}

const styles = createThemedStyles({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropDim: {
    backgroundColor: colors.backdrop,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    alignSelf: "center",
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    overflow: "hidden",
    paddingTop: spacing.sm,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headingCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  heading: {
    ...typography.bodyMd,
    fontFamily: typography.title.fontFamily,
    flexShrink: 1,
    color: colors.textSecondary,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  taskTitle: {
    ...typography.headline,
    flex: 1,
    color: colors.textPrimary,
  },
  taskTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -spacing.sm,
    marginTop: -spacing.sm,
    borderRadius: radii.md,
  },
  pressed: {
    opacity: 0.65,
  },
  scrollArea: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  optionGroup: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.bgCard,
    overflow: "hidden",
  },
  option: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  optionPressed: {
    backgroundColor: colors.accentDim,
  },
  dateBadge: {
    width: 42,
    height: 46,
    borderRadius: radii.lg,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  dateBadgeToday: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  badgeMonth: {
    ...typography.micro,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textMuted,
  },
  badgeDay: {
    ...typography.title,
    fontSize: 18,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  todayInk: {
    color: colors.accent,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    ...typography.title,
    color: colors.textPrimary,
  },
  optionHint: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
});
