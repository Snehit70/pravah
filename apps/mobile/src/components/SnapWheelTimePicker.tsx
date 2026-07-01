import { useEffect, useRef, useState } from "react";
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { haptic } from "../lib/haptic";
import { selectedIndexFromOffset } from "../lib/snapWheelTimePicker";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";

type SnapWheelTimePickerProps = {
  visible: boolean;
  title: string;
  value: string;
  onConfirm: (hhmm: string) => void;
  onClose: () => void;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const ROW_HEIGHT = 42;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
const WHEEL_PADDING = ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return { hour: 9, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return {
    hour: hour >= 0 && hour <= 23 ? hour : 9,
    minute: minute >= 0 && minute <= 59 ? minute : 0,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function Wheel({
  label,
  values,
  selected,
  formatValue,
  onSelect,
}: {
  label: string;
  values: readonly number[];
  selected: number;
  formatValue: (value: number) => string;
  onSelect: (value: number) => void;
}) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTo({ y: selected * ROW_HEIGHT, animated: false });
  }, [selected]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.min(
      values.length - 1,
      selectedIndexFromOffset(event.nativeEvent.contentOffset.y, ROW_HEIGHT),
    );
    const next = values[index];
    if (next !== selected) {
      haptic.selection();
      onSelect(next);
    }
  };

  return (
    <View style={styles.wheelColumn}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <View style={styles.wheelFrame}>
        <View pointerEvents="none" style={styles.selectionRail} />
        <ScrollView
          ref={ref}
          style={styles.wheel}
          showsVerticalScrollIndicator={false}
          snapToInterval={ROW_HEIGHT}
          decelerationRate="fast"
          contentContainerStyle={styles.wheelContent}
          onMomentumScrollEnd={handleMomentumEnd}
          onScrollEndDrag={handleMomentumEnd}
        >
          {values.map((value) => {
            const active = value === selected;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  haptic.selection();
                  onSelect(value);
                  ref.current?.scrollTo({ y: value * ROW_HEIGHT, animated: true });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label} ${formatValue(value)}`}
                style={styles.wheelItem}
              >
                <Text style={[styles.wheelItemText, active && styles.wheelItemTextActive]}>
                  {formatValue(value)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export function SnapWheelTimePicker({
  visible,
  title,
  value,
  onConfirm,
  onClose,
}: SnapWheelTimePickerProps) {
  const reducedMotion = useReducedMotion();
  const parsed = parseTime(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  const confirm = () => {
    haptic.light();
    onConfirm(`${pad2(hour)}:${pad2(minute)}`);
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
          <Text style={styles.heading}>{title}</Text>
          <View style={styles.columns}>
            <Wheel
              label="Hour"
              values={HOURS}
              selected={hour}
              formatValue={formatHourLabel}
              onSelect={setHour}
            />
            <Wheel
              label="Minute"
              values={MINUTES}
              selected={minute}
              formatValue={(next) => `:${pad2(next)}`}
              onSelect={setMinute}
            />
          </View>

          <View style={styles.footer}>
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
    maxWidth: 340,
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
  wheelColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  wheelLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  wheelFrame: {
    height: WHEEL_HEIGHT,
    overflow: "hidden",
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  selectionRail: {
    position: "absolute",
    left: spacing.xs,
    right: spacing.xs,
    top: WHEEL_PADDING,
    height: ROW_HEIGHT,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderFocus,
  },
  wheel: {
    height: WHEEL_HEIGHT,
  },
  wheelContent: {
    paddingVertical: WHEEL_PADDING,
  },
  wheelItem: {
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    ...typography.numeric,
    color: colors.textSecondary,
    fontSize: 15,
  },
  wheelItemTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  footerBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
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
