import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import {
  ImageBackground,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { colors, shadow, spacing, typography } from "../theme/tokens";
import { BrandMark } from "./BrandMark";

import authBg from "../../assets/auth-bg.png";

type MobileAuthScreenProps = {
  canGoogleSignIn: boolean;
  isSigningIn: boolean;
  onGoogleSignIn: () => void;
};

export function MobileAuthScreen({
  canGoogleSignIn,
  isSigningIn,
  onGoogleSignIn,
}: MobileAuthScreenProps) {
  return (
    <ImageBackground source={authBg} resizeMode="cover" style={styles.bg}>
      <LinearGradient
        colors={["rgba(8,6,18,0.55)", "rgba(8,6,18,0.15)", "rgba(8,6,18,0.7)"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        <Animated.View entering={FadeInDown.duration(500).delay(80)} style={styles.brandZone}>
          <BrandMark size={64} />
          <Text style={styles.wordmark}>Pravah</Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(500).delay(160)} style={styles.actionZone}>
          <View style={styles.copy}>
            <Text style={styles.headline}>A calmer way to keep your day in view.</Text>
            <Text style={styles.subtitle}>
              Your inbox, timeline, and completed ledger — kept in sync.
            </Text>
          </View>

          <Pressable
            onPress={onGoogleSignIn}
            disabled={!canGoogleSignIn || isSigningIn}
            style={({ pressed }) => [
              styles.googleButton,
              (!canGoogleSignIn || isSigningIn) && styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.googleButtonText}>
              {isSigningIn ? "Signing in..." : "Continue with Google"}
            </Text>
          </Pressable>

          {!canGoogleSignIn ? (
            <Text style={styles.hint}>Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in mobile env.</Text>
          ) : null}
        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.section * 2,
    paddingBottom: spacing.section,
  },
  brandZone: {
    alignItems: "center",
    gap: spacing.lg,
  },
  wordmark: {
    color: colors.textPrimary,
    ...typography.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
  },
  actionZone: {
    gap: spacing.xl,
  },
  copy: {
    gap: spacing.sm,
  },
  headline: {
    color: colors.textPrimary,
    ...typography.display,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.bodyLg,
  },
  googleButton: {
    borderRadius: 9999,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    ...shadow.glow,
  },
  googleButtonText: {
    color: colors.textInverse,
    ...typography.title,
  },
  disabledButton: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
  hint: {
    color: colors.textMuted,
    ...typography.bodyMd,
    textAlign: "center",
  },
});
