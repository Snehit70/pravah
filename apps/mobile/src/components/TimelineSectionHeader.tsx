import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, motion, spacing, typography } from "../theme/tokens";

type Props = {
  label: string;
  /** When true, draws an accent underline that reveals on mount with a brief
   *  overshoot — the mobile port of web's todayAccentReveal keyframe. */
  isToday: boolean;
};

/**
 * Web parity (src/index.css:238-243): the "today" column header gets a
 * one-shot accent underline that scales from 0→1 with a 1.08 overshoot, then
 * settles. Other dates render a flat label only.
 */
export function TimelineSectionHeader({ label, isToday }: Props) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!isToday) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        scale.value = 1;
        opacity.value = 1;
        return;
      }
      opacity.value = withTiming(1, { duration: motion.duration.fast });
      scale.value = withSequence(
        withTiming(1.08, {
          duration: motion.duration.slow,
          easing: Easing.bezier(...motion.easing.outQuart),
        }),
        withTiming(1, {
          duration: motion.duration.fast,
          easing: Easing.bezier(...motion.easing.outExpo),
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isToday, opacity, scale]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {isToday ? <Animated.View style={[styles.underline, underlineStyle]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    alignSelf: "flex-start",
  },
  label: {
    color: colors.accent,
    ...typography.micro,
  },
  // 1px accent rule beneath the label. transform-origin defaults to center on
  // RN, which matches web's `transform-origin: center`.
  underline: {
    height: 1,
    backgroundColor: colors.accent,
    marginTop: 4,
    width: "100%",
  },
});
