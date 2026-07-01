import { StatusBar } from "expo-status-bar";
import { Pressable, SafeAreaView, StyleSheet, Text } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";
import { colors, spacing, typography } from "../theme/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { BrandMark } from "./BrandMark";
import { GridBackground } from "./GridBackground";

type BootScreenProps = {
  title?: string;
  detail?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function BootScreen({
  title = "Loading your workspace...",
  detail,
  actionLabel,
  onActionPress,
}: BootScreenProps) {
  const glow = useSharedValue(0.9);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      glow.value = 1;
      return;
    }
    glow.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 900 }), withTiming(0.92, { duration: 900 })),
      -1,
      true
    );
  }, [glow, reducedMotion]);

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glow.value }],
    opacity: glow.value,
  }));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <GridBackground />
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(400)}
        style={styles.content}
      >
        <Animated.View style={[styles.markWrap, markStyle]}>
          <BrandMark size={56} />
        </Animated.View>
        <Text style={styles.wordmark}>Pravah</Text>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {actionLabel && onActionPress ? (
          <Pressable
            onPress={onActionPress}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
        <Text style={styles.progress}>Preparing your timeline, inbox, and Kairo.</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    gap: spacing.md,
  },
  markWrap: {
    marginBottom: spacing.xs,
  },
  wordmark: {
    color: colors.textPrimary,
    ...typography.headline,
  },
  title: {
    color: colors.textPrimary,
    ...typography.bodyLg,
    textAlign: "center",
    maxWidth: 320,
  },
  detail: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center",
    maxWidth: 320,
  },
  progress: {
    color: colors.textMuted,
    ...typography.micro,
    textAlign: "center",
    maxWidth: 340,
  },
  actionButton: {
    marginTop: spacing.xs,
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  actionText: {
    color: colors.accent,
    ...typography.bodyMd,
    fontWeight: "600",
  },
});
