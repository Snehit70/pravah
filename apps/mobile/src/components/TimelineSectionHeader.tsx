import { useEffect } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts, motion, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

type Props = {
  label: string;
  count?: number;
  /** When true, draws an accent underline that reveals on mount with a brief
   *  overshoot — the mobile port of web's todayAccentReveal keyframe. */
  isToday: boolean;
};

/**
 * Web parity (src/index.css:238-243): the "today" column header gets a
 * one-shot accent underline that scales from 0→1 with a 1.08 overshoot, then
 * settles. Other dates render a flat label only.
 */
export function TimelineSectionHeader({ label, count, isToday }: Props) {
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
      <Text style={[styles.label, isToday && styles.labelToday]}>
        {label}
        {typeof count === "number" ? <Text style={styles.count}>  {count}</Text> : null}
      </Text>
      {isToday ? <Animated.View style={[styles.underline, underlineStyle]} /> : null}
    </View>
  );
}

const styles = createThemedStyles({
  // Aligned to the card margin so headers and cards share one left edge.
  wrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    alignSelf: "flex-start",
  },
  // Sentence-case Geist, not mono caps — headers are wayfinding, not log
  // lines. Accent color is reserved for today, the "you are here" anchor.
  label: {
    color: colors.textSecondary,
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  labelToday: {
    color: colors.accent,
  },
  count: {
    color: colors.textMuted,
    ...typography.numeric,
    fontSize: 12,
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
