import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { toIsoDate } from "../lib/dates";
import { buildMonthGrid } from "../lib/calendarGrid";
import { useReducedMotion } from "../hooks/useReducedMotion";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "./UiIcons";

type ThemedDatePickerProps = {
  visible: boolean;
  /** Currently selected date as an ISO `YYYY-MM-DD`, if any. */
  value?: string;
  /** Optional lower bound for scheduling. */
  minDate?: string;
  confirmSelection?: boolean;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Monday-first, matching the rest of the app's day-led timeline.
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_PICKER_DURATION = 180;
const MONTH_PICKER_HEIGHT = 176;

type MonthView = { year: number; month: number };

function parseIsoParts(iso?: string): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

/**
 *  Themed, in-app, date-only picker. Pure JS (OTA-safe) — replaces the native
 *  Material picker so the surface matches the app and, crucially, only commits a
 *  date when the user chooses a day, with confirmation in confirm mode. Dismissing
 *  is a clean cancel.
 */
export function ThemedDatePicker(props: ThemedDatePickerProps) {
  if (!props.visible) return null;
  return <ThemedDatePickerContent {...props} />;
}

function ThemedDatePickerContent({ visible, value, minDate, confirmSelection = false, onSelect, onClose }: ThemedDatePickerProps) {
  const reducedMotion = useReducedMotion();
  const todayIso = toIsoDate(new Date());
  const minimumDate = minDate ?? todayIso;
  const selected = parseIsoParts(value);
  const today = parseIsoParts(todayIso)!;
  const selectedYear = selected?.year;
  const selectedMonth = selected?.month;

  const [viewYear, setViewYear] = useState(selectedYear ?? today.year);
  const [viewMonth, setViewMonth] = useState(selectedMonth ?? today.month);
  const [draftDate, setDraftDate] = useState<string | null>(value ?? minimumDate);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pendingView, setPendingView] = useState<MonthView | null>(null);
  const monthPickerProgress = useSharedValue(0);

  useEffect(() => {
    monthPickerProgress.set(withTiming(monthPickerOpen ? 1 : 0, {
      duration: reducedMotion ? 0 : MONTH_PICKER_DURATION,
      easing: Easing.inOut(Easing.cubic),
    }));
  }, [monthPickerOpen, monthPickerProgress, reducedMotion]);

  useEffect(() => {
    if (monthPickerOpen || !pendingView) return undefined;
    const timeout = setTimeout(() => {
      setViewYear(pendingView.year);
      setViewMonth(pendingView.month);
      setPendingView(null);
    }, reducedMotion ? 0 : MONTH_PICKER_DURATION);
    return () => clearTimeout(timeout);
  }, [monthPickerOpen, pendingView, reducedMotion]);

  const monthChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${monthPickerProgress.value * 180}deg` }],
  }));

  const monthPickerStyle = useAnimatedStyle(() => ({
    height: monthPickerProgress.value * MONTH_PICKER_HEIGHT,
    opacity: monthPickerProgress.value,
  }));

  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const closeMonthPicker = (nextView?: MonthView) => {
    if (nextView) {
      if (monthPickerOpen) {
        setPendingView(nextView);
      } else {
        setViewYear(nextView.year);
        setViewMonth(nextView.month);
      }
    }
    setMonthPickerOpen(false);
  };

  const stepMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    closeMonthPicker({ year: y, month: m });
  };

  const pickDate = (date: Date) => {
    const iso = toIsoDate(date);
    if (iso < minimumDate) return;
    if (confirmSelection) {
      setDraftDate(iso);
      return;
    }
    onSelect(iso);
    onClose();
  };

  const pick = (day: number) => {
    pickDate(new Date(viewYear, viewMonth, day));
  };

  const draftSelected = parseIsoParts(draftDate ?? undefined);
  const activeSelected = confirmSelection ? draftSelected : selected;
  const focusedHeaderDate =
    activeSelected && activeSelected.year === viewYear && activeSelected.month === viewMonth
      ? activeSelected
      : today.year === viewYear && today.month === viewMonth
        ? today
        : null;
  const focusedWeekdayIndex = focusedHeaderDate
    ? (new Date(focusedHeaderDate.year, focusedHeaderDate.month, focusedHeaderDate.day).getDay() + 6) % 7
    : -1;
  const isSelected = (day: number) =>
    !!activeSelected &&
    activeSelected.year === viewYear &&
    activeSelected.month === viewMonth &&
    activeSelected.day === day;
  const isToday = (day: number) =>
    toIsoDate(new Date(viewYear, viewMonth, day)) === todayIso;
  const isBeforeMinimum = (day: number) =>
    toIsoDate(new Date(viewYear, viewMonth, day)) < minimumDate;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss date picker"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        <View style={styles.card}>
          <View style={styles.header}>
            <Pressable
              onPress={() => stepMonth(-1)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
            >
              <ChevronLeftIcon color={colors.textSecondary} size={20} />
            </Pressable>
            <Pressable
              onPress={() => setMonthPickerOpen((open) => !open)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Choose month, ${MONTHS[viewMonth]} ${viewYear}`}
              accessibilityState={{ expanded: monthPickerOpen }}
              style={({ pressed }) => [styles.monthTitleButton, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.monthLabel}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Animated.View style={monthChevronStyle}>
                <ChevronDownIcon color={colors.textMuted} size={14} strokeWidth={1.8} />
              </Animated.View>
            </Pressable>
            <Pressable
              onPress={() => stepMonth(1)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
            >
              <ChevronRightIcon color={colors.textSecondary} size={20} />
            </Pressable>
          </View>

          <Animated.View
            pointerEvents={monthPickerOpen ? "auto" : "none"}
            style={[styles.monthPicker, monthPickerStyle]}
          >
            <View style={styles.monthPickerContent}>
              <View style={styles.monthPickerHeader}>
                <Pressable
                  onPress={() => setViewYear((year) => year - 1)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Previous year"
                  style={({ pressed }) => [styles.monthPickerNav, pressed && { opacity: 0.6 }]}
                >
                  <ChevronLeftIcon color={colors.textSecondary} size={16} />
                </Pressable>
                <Text style={styles.monthPickerYear}>{viewYear}</Text>
                <Pressable
                  onPress={() => setViewYear((year) => year + 1)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Next year"
                  style={({ pressed }) => [styles.monthPickerNav, pressed && { opacity: 0.6 }]}
                >
                  <ChevronRightIcon color={colors.textSecondary} size={16} />
                </Pressable>
              </View>
              <View style={styles.monthGrid}>
                {MONTHS.map((month, monthIndex) => (
                  <Pressable
                    key={month}
                    onPress={() => closeMonthPicker({ year: viewYear, month: monthIndex })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: monthIndex === viewMonth }}
                    style={({ pressed }) => [
                      styles.monthOption,
                      monthIndex === viewMonth && styles.monthOptionSelected,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthOptionText,
                        monthIndex === viewMonth && styles.monthOptionTextSelected,
                      ]}
                    >
                      {month.slice(0, 3)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Animated.View>

          <View style={styles.weekHeader}>
            {WEEKDAYS.map((d, i) => (
              <Text
                key={`${d}-${i}`}
                style={[
                  styles.weekHeaderCell,
                  i === focusedWeekdayIndex && styles.weekHeaderCellFocused,
                ]}
              >
                {d}
              </Text>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((day, di) => {
                if (day === null) return <View key={di} style={styles.dayCell} />;
                const selectedDay = isSelected(day);
                const today = isToday(day);
                const beforeMinimum = isBeforeMinimum(day);
                return (
                  <Pressable
                    key={di}
                    onPress={() => pick(day)}
                    disabled={beforeMinimum}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedDay }}
                    accessibilityLabel={`${MONTHS[viewMonth]} ${day}, ${viewYear}`}
                    style={({ pressed }) => [
                      styles.dayCell,
                      styles.dayCellTappable,
                       selectedDay && styles.daySelected,
                       today && !selectedDay && styles.dayToday,
                       beforeMinimum && styles.dayDisabled,
                      pressed && !selectedDay && { opacity: 0.6 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selectedDay && styles.dayTextSelected,
                        today && !selectedDay && styles.dayTextToday,
                        beforeMinimum && styles.dayTextDisabled,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [styles.footerSecondary, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.footerCancel}>Cancel</Text>
            </Pressable>
            {confirmSelection ? (
              <Pressable
                onPress={() => {
                  if (!draftDate || draftDate < minimumDate) return;
                  onSelect(draftDate);
                  onClose();
                }}
                disabled={!draftDate || draftDate < minimumDate}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Select date"
                style={({ pressed }) => [
                  styles.footerPrimary,
                  (!draftDate || draftDate < minimumDate) && styles.footerPrimaryDisabled,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.footerPrimaryText}>Select date</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  backdropDim: {
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.bg,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  monthTitleButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.xs,
  },
  monthLabel: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  monthPicker: {
    overflow: "hidden",
  },
  monthPickerContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  monthPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  monthPickerNav: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
  },
  monthPickerYear: {
    ...typography.title,
    color: colors.textPrimary,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  monthOption: {
    width: "23%",
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
  },
  monthOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  monthOptionText: {
    color: colors.textSecondary,
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
  },
  monthOptionTextSelected: {
    color: colors.textInverse,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  weekHeader: {
    flexDirection: "row",
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  weekHeaderCell: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 2,
    color: colors.textSecondary,
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  weekHeaderCellFocused: {
    color: colors.accent,
    fontFamily: fonts.sansBold,
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellTappable: {
    margin: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
  },
  daySelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayToday: {
    backgroundColor: colors.accentDim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentSoft,
  },
  dayText: {
    ...typography.numeric,
    color: colors.textPrimary,
  },
  dayTextSelected: {
    color: colors.bg,
    fontWeight: "700",
  },
  dayTextToday: {
    color: colors.accent,
    fontWeight: "700",
  },
  dayDisabled: {
    opacity: 0.7,
  },
  dayTextDisabled: {
    color: colors.textDim,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  footerSecondary: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
  },
  footerCancel: {
    ...typography.title,
    color: colors.textSecondary,
  },
  footerPrimary: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
  },
  footerPrimaryText: {
    ...typography.title,
    color: colors.textInverse,
  },
  footerPrimaryDisabled: {
    opacity: 0.45,
  },
});
