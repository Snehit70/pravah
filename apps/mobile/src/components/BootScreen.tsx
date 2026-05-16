import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text } from "react-native";
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
};

export function BootScreen({
  title = "Loading your workspace...",
  detail,
}: BootScreenProps) {
  const glow = useSharedValue(0.9);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      glow.value = withTiming(1, { duration: 160 });
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
      <StatusBar style="light" />
      <GridBackground />
      <Animated.View entering={FadeIn.duration(400)} style={styles.content}>
        <Animated.View style={[styles.markWrap, markStyle]}>
          <BrandMark size={56} />
        </Animated.View>
        <Text style={styles.wordmark}>Pravah</Text>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        <Text style={styles.progress}>Preparing your timeline, inbox, and assistant.</Text>
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
});
