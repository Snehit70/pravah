import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { haptic } from "../lib/haptic";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { toIsoDate } from "../lib/dates";
import { buildMonthGrid } from "../lib/calendarGrid";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ChevronLeftIcon, ChevronRightIcon } from "./UiIcons";

type ThemedDatePickerProps = {
  visible: boolean;
  /** Currently selected date as an ISO `YYYY-MM-DD`, if any. */
  value?: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Monday-first, matching the rest of the app's day-led timeline.
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function parseIsoParts(iso?: string): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

/**
 * Themed, in-app, date-only picker. Pure JS (OTA-safe) — replaces the native
 * Material picker so the surface matches the app and, crucially, only commits a
 * date when the user actually taps a day. Dismissing is a clean cancel.
 */
export function ThemedDatePicker({ visible, value, onSelect, onClose }: ThemedDatePickerProps) {
  const reducedMotion = useReducedMotion();
  const todayIso = toIsoDate(new Date());
  const selected = parseIsoParts(value);
  const initial = selected ?? parseIsoParts(todayIso)!;

  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const stepMonth = (delta: number) => {
    haptic.selection();
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const pickDate = (date: Date) => {
    haptic.light();
    onSelect(toIsoDate(date));
    onClose();
  };

  const pick = (day: number) => {
    pickDate(new Date(viewYear, viewMonth, day));
  };

  const isSelected = (day: number) =>
    !!selected && selected.year === viewYear && selected.month === viewMonth && selected.day === day;
  const isToday = (day: number) =>
    toIsoDate(new Date(viewYear, viewMonth, day)) === todayIso;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
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
            <Text style={styles.monthLabel}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
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

          <View style={styles.weekHeader}>
            {WEEKDAYS.map((d, i) => (
              <Text key={`${d}-${i}`} style={styles.weekHeaderCell}>
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
                return (
                  <Pressable
                    key={di}
                    onPress={() => pick(day)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedDay }}
                    accessibilityLabel={`${MONTHS[viewMonth]} ${day}, ${viewYear}`}
                    style={({ pressed }) => [
                      styles.dayCell,
                      styles.dayCellTappable,
                      selectedDay && styles.daySelected,
                      pressed && !selectedDay && { opacity: 0.6 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selectedDay && styles.dayTextSelected,
                        today && !selectedDay && styles.dayTextToday,
                      ]}
                    >
                      {day}
                    </Text>
                    {today && !selectedDay ? <View style={styles.todayDot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.footer}>
            <Pressable
              onPress={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                setViewMonth(now.getMonth());
                pickDate(now);
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Select today"
              style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.footerToday}>Today</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.footerCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  navBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    ...typography.title,
    color: colors.textPrimary,
  },
  weekHeader: {
    flexDirection: "row",
  },
  weekHeaderCell: {
    flex: 1,
    textAlign: "center",
    ...typography.micro,
    color: colors.textMuted,
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellTappable: {
    borderRadius: radii.full,
  },
  daySelected: {
    backgroundColor: colors.accent,
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
  todayDot: {
    position: "absolute",
    bottom: 6,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  footerBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  footerToday: {
    ...typography.title,
    color: colors.accent,
  },
  footerCancel: {
    ...typography.title,
    color: colors.textSecondary,
  },
});
