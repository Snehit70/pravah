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
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { addDays, toIsoDate, weekdayDate } from "../lib/dates";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ThemedDatePicker } from "./ThemedDatePicker";

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
      <View style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        <View style={styles.card}>
          <View style={styles.grab} />
          <Text style={styles.kicker}>Schedule</Text>
          {displayTitle ? (
            <Text style={styles.title} numberOfLines={1}>
              {displayTitle}
            </Text>
          ) : null}

          <View style={styles.optionList}>
            {options.map((option, index) => (
              <Pressable
                key={option.key}
                onPress={() => handlePick(option.iso)}
                accessibilityRole="button"
                accessibilityLabel={`Schedule for ${option.label}`}
                style={({ pressed }) => [
                  styles.option,
                  index === 0 && styles.optionPrimary,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.optionLabel, index === 0 && styles.optionLabelPrimary]}>
                  {option.label}
                </Text>
                <Text style={styles.optionHint}>{weekdayDate(option.iso)}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => setShowDatePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Pick a date"
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.optionLabel}>Pick a date…</Text>
            </Pressable>
          </View>
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
    backgroundColor: colors.bgFloating,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
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
  kicker: {
    ...typography.micro,
    color: colors.textMuted,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  optionList: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  option: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderCurve: "continuous",
  },
  optionPrimary: {
    backgroundColor: colors.accentDim,
  },
  optionLabel: {
    ...typography.bodyLg,
    fontSize: 16,
    color: colors.textPrimary,
  },
  optionLabelPrimary: {
    fontFamily: typography.title.fontFamily,
  },
  optionHint: {
    ...typography.numeric,
    color: colors.textMuted,
  },
});
