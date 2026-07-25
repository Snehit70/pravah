/**
 * InlineSegmented
 *
 * A compact segmented control for inline use — sits in section headers,
 * card toolbars, and other contexts where full-width settings-style
 * segmented controls are too heavy.
 *
 * Same visual language as SlidingSegmented (spring thumb, same colors)
 * but auto-sizing: options fit their content, icon-only options are
 * fixed 36x36.
 *
 * Distinct from SlidingSegmented by design — two components with narrow,
 * clear jobs rather than one component with mode-switching complexity.
 */

import { useEffect, useState, type ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

const TRACK_PADDING = 3;
const ICON_ONLY_SIZE = 36;

export type InlineSegmentedItem<T extends string | number> = {
  value: T;
  label?: string;
  Icon?: ComponentType<{ width?: number; height?: number; color: string; size?: number; strokeWidth?: number }>;
};

export function InlineSegmented<T extends string | number>({
  options,
  value,
  onSelect,
}: {
  options: readonly InlineSegmentedItem<T>[];
  value: T;
  onSelect: (value: T) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const progress = useSharedValue(index);
  const segmentWidthSv = useSharedValue(0);

  useEffect(() => {
    progress.value = reducedMotion
      ? index
      : withSpring(index, { damping: 15, stiffness: 220, mass: 0.7 });
  }, [index, progress, reducedMotion]);

  const segmentWidth = trackWidth > 0 ? trackWidth / options.length : 0;
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * segmentWidthSv.value }],
  }));

  return (
    <View
      style={styles.track}
      onLayout={(event) => {
        const inner = event.nativeEvent.layout.width - TRACK_PADDING * 2;
        segmentWidthSv.value = inner / options.length;
        setTrackWidth(inner);
      }}
    >
      {segmentWidth > 0 ? (
        <Animated.View style={[styles.thumb, { width: segmentWidth }, thumbStyle]} />
      ) : null}
      {options.map((option, optionIndex) => (
        <InlineSegmentOption
          key={String(option.value)}
          label={option.label}
          Icon={option.Icon}
          selected={value === option.value}
          optionIndex={optionIndex}
          progress={progress}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

function InlineSegmentOption({
  label,
  Icon,
  selected,
  optionIndex,
  progress,
  onPress,
}: {
  label?: string;
  Icon?: ComponentType<{ width?: number; height?: number; color: string; size?: number; strokeWidth?: number }>;
  selected: boolean;
  optionIndex: number;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const isIconOnly = !label;
  const mutedColor = colors.textMuted;
  const selectedColor = colors.textInverse;
  const labelStyle = useAnimatedStyle(
    () => ({
      color: interpolateColor(
        progress.value,
        [optionIndex - 1, optionIndex, optionIndex + 1],
        [mutedColor, selectedColor, mutedColor],
      ),
    }),
    [mutedColor, selectedColor],
  );

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.option, isIconOnly && styles.optionIconOnly]}
    >
      <View style={styles.optionContent}>
        {Icon ? (
          <Icon
            width={15}
            height={15}
            color={selected ? colors.textInverse : colors.textMuted}
          />
        ) : null}
        {label ? (
          <Animated.Text style={[styles.optionText, labelStyle]}>{label}</Animated.Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = createThemedStyles({
  track: {
    flexDirection: "row",
    padding: TRACK_PADDING,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  thumb: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: radii.md - TRACK_PADDING,
    backgroundColor: colors.textPrimary,
  },
  option: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 44,
    minHeight: 32,
  },
  optionIconOnly: {
    width: ICON_ONLY_SIZE,
    height: ICON_ONLY_SIZE,
    minWidth: 0,
    paddingHorizontal: 0,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  optionText: {
    ...typography.bodyMd,
    fontFamily: "Geist_500Medium",
  },
});
