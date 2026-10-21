import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HERO_PLATE from "../../assets/auth-hero.jpg";
import GoogleIconAsset from "../assets/icons/provider-google.svg";
import { AuthGlassLight } from "./AuthGlassLight";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

/**
 * The hero render is a fixed cream scene, so this screen keeps its own light
 * palette instead of following the app theme. `cream` must match the flat
 * bottom band of `auth-hero.jpg` or the seam shows.
 */
const cream = "#f9f1e7";
const ink = "#201914";
const inkSoft = "rgba(32, 25, 20, 0.64)";

/** Hero render aspect ratio (1024×1536). */
const HERO_ASPECT = 1.5;
/**
 * On tall phones a width-fit render leaves a dead band above the wordmark, so
 * the hero grows to this share of the screen and crops its empty sides.
 */
const HERO_MIN_SCREEN_SHARE = 0.84;

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

type MobileAuthScreenProps = {
  canGoogleSignIn: boolean;
  isSigningIn: boolean;
  onGoogleSignIn: () => void;
  onOpenDiagnostics?: () => void;
};

export function MobileAuthScreen({
  canGoogleSignIn,
  isSigningIn,
  onGoogleSignIn,
  onOpenDiagnostics,
}: MobileAuthScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const heroHeight = Math.max(width * HERO_ASPECT, height * HERO_MIN_SCREEN_SHARE);
  const disabled = !canGoogleSignIn || isSigningIn;

  // Entrance: the render settles in from a slight zoom, then the copy and
  // button rise after it. After that the plate drifts a few px so the glass
  // feels suspended rather than printed.
  const heroIn = useSharedValue(0);
  const drift = useSharedValue(0);
  const copyIn = useSharedValue(0);
  const actionIn = useSharedValue(0);

  useEffect(() => {
    const duration = reducedMotion ? 300 : 1200;
    heroIn.value = withTiming(1, { duration, easing: easeOut });
    copyIn.value = withDelay(reducedMotion ? 0 : 350, withTiming(1, { duration: 800, easing: easeOut }));
    actionIn.value = withDelay(reducedMotion ? 0 : 550, withTiming(1, { duration: 800, easing: easeOut }));
    if (!reducedMotion) {
      drift.value = withDelay(
        1200,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 4500, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        ),
      );
    }
  }, [actionIn, copyIn, drift, heroIn, reducedMotion]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroIn.value,
    transform: [
      { translateY: (1 - heroIn.value) * 18 - drift.value * 6 },
      { scale: 1 + (1 - heroIn.value) * 0.05 + drift.value * 0.008 },
    ],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyIn.value,
    transform: [{ translateY: (1 - copyIn.value) * 14 }],
  }));
  const actionStyle = useAnimatedStyle(() => ({
    opacity: actionIn.value,
    transform: [{ translateY: (1 - actionIn.value) * 14 }],
  }));

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <Animated.View
        pointerEvents="none"
        style={[styles.hero, { height: heroHeight }, heroStyle]}
      >
        <Image source={HERO_PLATE} style={StyleSheet.absoluteFill} contentFit="cover" />
        <AuthGlassLight reducedMotion={reducedMotion} />
        <LinearGradient
          colors={["rgba(249, 241, 231, 0)", cream]}
          style={styles.heroFade}
        />
      </Animated.View>

      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Animated.View style={[styles.copy, copyStyle]}>
          <Pressable
            onLongPress={onOpenDiagnostics}
            delayLongPress={450}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Pravah"
            accessibilityHint="Long press or use the diagnostics action to export diagnostics."
            accessibilityActions={
              onOpenDiagnostics ? [{ name: "longpress", label: "Export diagnostics" }] : undefined
            }
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "longpress") {
                onOpenDiagnostics?.();
              }
            }}
            style={styles.wordmarkHit}
          >
            <Text style={styles.wordmark}>Pravah</Text>
          </Pressable>
          <Text style={styles.tagline}>Plan with the current.</Text>
        </Animated.View>

        <Animated.View style={[styles.actions, actionStyle]}>
          <Pressable
            onPress={onGoogleSignIn}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={isSigningIn ? "Signing in with Google" : "Sign in with Google"}
            accessibilityState={{ disabled, busy: isSigningIn }}
            style={({ pressed }) => [
              buttonStyles.googleButton,
              disabled && buttonStyles.disabledButton,
              pressed && buttonStyles.pressed,
            ]}
          >
            <GoogleIconAsset
              width={18}
              height={18}
              style={disabled ? buttonStyles.disabledButtonIcon : undefined}
            />
            <Text style={[buttonStyles.googleButtonText, disabled && buttonStyles.disabledButtonText]}>
              {isSigningIn ? "Signing in..." : "Continue with Google"}
            </Text>
          </Pressable>
          {!canGoogleSignIn ? (
            <Text style={buttonStyles.hint}>Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in mobile env.</Text>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: cream,
  },
  hero: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "22%",
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.xxl,
    gap: spacing.section,
  },
  copy: {
    gap: spacing.sm,
  },
  wordmarkHit: {
    alignSelf: "flex-start",
  },
  wordmark: {
    color: ink,
    fontFamily: fonts.sansSemibold,
    fontSize: 60,
    lineHeight: 64,
    letterSpacing: -2.4,
  },
  tagline: {
    color: inkSoft,
    fontFamily: fonts.sans,
    fontSize: 19,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  actions: {
    gap: spacing.md,
  },
});

/** The button and hint follow the app theme, like every other primary action. */
const buttonStyles = createThemedStyles({
  googleButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
  },
  googleButtonText: {
    color: colors.textInverse,
    ...typography.title,
  },
  disabledButton: {
    backgroundColor: colors.border,
  },
  disabledButtonText: {
    color: colors.textMuted,
  },
  disabledButtonIcon: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
  hint: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center",
  },
});
