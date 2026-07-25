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
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
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
  accessibilityLabel?: string;
  Icon?: ComponentType<{ width?: number; height?: number; color: string; size?: number; strokeWidth?: number }>;
};

type SegmentLayout = { x: number; width: number };

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
  const [segmentLayouts, setSegmentLayouts] = useState<Array<SegmentLayout | undefined>>([]);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const progress = useSharedValue(index);
  const thumbX = useSharedValue(0);
  const thumbWidth = useSharedValue(0);
  const selectedLayout = segmentLayouts[index];

  useEffect(() => {
    progress.set(
      reducedMotion
        ? index
        : withSpring(index, { damping: 15, stiffness: 220, mass: 0.7 }),
    );
  }, [index, progress, reducedMotion]);

  useEffect(() => {
    if (!selectedLayout) return;
    thumbX.set(
      reducedMotion
        ? selectedLayout.x
        : withSpring(selectedLayout.x, { damping: 15, stiffness: 220, mass: 0.7 }),
    );
    thumbWidth.set(
      reducedMotion
        ? selectedLayout.width
        : withSpring(selectedLayout.width, { damping: 15, stiffness: 220, mass: 0.7 }),
    );
  }, [reducedMotion, selectedLayout, thumbWidth, thumbX]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: thumbWidth.value,
    transform: [{ translateX: thumbX.value }],
  }));

  const recordSegmentLayout = (optionIndex: number, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setSegmentLayouts((current) => {
      const existing = current[optionIndex];
      if (existing?.x === x && existing.width === width) return current;
      const next = [...current];
      next[optionIndex] = { x, width };
      return next;
    });
  };

  return (
    <View style={styles.track}>
      {selectedLayout ? (
        <Animated.View style={[styles.thumb, thumbStyle]} />
      ) : null}
      {options.map((option, optionIndex) => (
        <InlineSegmentOption
          key={String(option.value)}
          label={option.label}
          accessibilityLabel={option.accessibilityLabel}
          Icon={option.Icon}
          selected={value === option.value}
          optionIndex={optionIndex}
          progress={progress}
          onPress={() => onSelect(option.value)}
          onLayout={(event) => recordSegmentLayout(optionIndex, event)}
        />
      ))}
    </View>
  );
}

function InlineSegmentOption({
  label,
  accessibilityLabel,
  Icon,
  selected,
  optionIndex,
  progress,
  onPress,
  onLayout,
}: {
  label?: string;
  accessibilityLabel?: string;
  Icon?: ComponentType<{ width?: number; height?: number; color: string; size?: number; strokeWidth?: number }>;
  selected: boolean;
  optionIndex: number;
  progress: SharedValue<number>;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
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
      onLayout={onLayout}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
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
    left: 0,
    borderRadius: radii.md - TRACK_PADDING,
    backgroundColor: colors.accent,
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
