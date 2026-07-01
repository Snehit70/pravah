import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { haptic } from "../lib/haptic";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";

type ThemedTimePickerProps = {
  visible: boolean;
  /** Currently selected time as "HH:MM" 24-hour string, if any. */
  value?: string;
  onSelect: (hhmm: string) => void;
  onClear: () => void;
  onClose: () => void;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function parseTimeParts(value?: string): { hour: number; minute: number } | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatHour12(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export function ThemedTimePicker({
  visible,
  value,
  onSelect,
  onClear,
  onClose,
}: ThemedTimePickerProps) {
  const reducedMotion = useReducedMotion();
  const parsed = parseTimeParts(value);
  const [hour, setHour] = useState(parsed?.hour ?? 9);
  const [minute, setMinute] = useState(
    parsed ? MINUTES.includes(parsed.minute) ? parsed.minute : 0 : 0
  );

  const confirm = () => {
    haptic.light();
    onSelect(`${pad2(hour)}:${pad2(minute)}`);
    onClose();
  };

  const clear = () => {
    haptic.selection();
    onClear();
    onClose();
  };

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
          accessibilityLabel="Dismiss time picker"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        <View style={styles.card}>
          <Text style={styles.heading}>Set time</Text>

          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.columnLabel}>Hour</Text>
              <ScrollView
                style={styles.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {HOURS.map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => { haptic.selection(); setHour(h); }}
                    style={({ pressed }) => [
                      styles.option,
                      h === hour && styles.optionSelected,
                      pressed && !( h === hour) && { opacity: 0.6 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: h === hour }}
                    accessibilityLabel={formatHour12(h)}
                  >
                    <Text style={[styles.optionText, h === hour && styles.optionTextSelected]}>
                      {formatHour12(h)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.column}>
              <Text style={styles.columnLabel}>Minute</Text>
              <ScrollView
                style={styles.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {MINUTES.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => { haptic.selection(); setMinute(m); }}
                    style={({ pressed }) => [
                      styles.option,
                      m === minute && styles.optionSelected,
                      pressed && !(m === minute) && { opacity: 0.6 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: m === minute }}
                    accessibilityLabel={`:${pad2(m)}`}
                  >
                    <Text style={[styles.optionText, m === minute && styles.optionTextSelected]}>
                      :{pad2(m)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={clear}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear time"
              style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.footerClear}>Clear</Text>
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
            <Pressable
              onPress={confirm}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Confirm time"
              style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.footerConfirm}>Set</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const SCROLL_HEIGHT = 200;

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
    maxWidth: 320,
    backgroundColor: colors.bg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center",
  },
  columns: {
    flexDirection: "row",
    gap: spacing.md,
  },
  column: {
    flex: 1,
    gap: spacing.xs,
  },
  columnLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  scroll: {
    height: SCROLL_HEIGHT,
  },
  scrollContent: {
    gap: 2,
  },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    alignItems: "center",
  },
  optionSelected: {
    backgroundColor: colors.accent,
  },
  optionText: {
    ...typography.numeric,
    color: colors.textSecondary,
    fontSize: 13,
  },
  optionTextSelected: {
    color: colors.bg,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  footerBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  footerClear: {
    ...typography.title,
    color: colors.error,
  },
  footerCancel: {
    ...typography.title,
    color: colors.textSecondary,
  },
  footerConfirm: {
    ...typography.title,
    color: colors.accent,
  },
});
