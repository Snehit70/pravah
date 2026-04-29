import { StatusBar } from "expo-status-bar";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, spacing, typography } from "../theme/tokens";
import { BrandMark } from "./BrandMark";
import { GridBackground } from "./GridBackground";

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
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <GridBackground />
      <Animated.View entering={FadeIn.duration(400)} style={styles.shell}>
        <View style={styles.lockup}>
          <View style={styles.brandRow}>
            <BrandMark size={26} />
            <Text style={styles.wordmark}>Pravah</Text>
          </View>
          <Text style={styles.title}>A calmer way to keep your day in view.</Text>
          <Text style={styles.subtitle}>
            Sign in with Google to keep your inbox, timeline, and completed ledger in sync.
          </Text>
        </View>
        <View style={styles.divider} />
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
  },
  shell: {
    gap: spacing.lg,
  },
  lockup: {
    gap: spacing.sm,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  wordmark: {
    color: colors.textPrimary,
    ...typography.title,
  },
  title: {
    color: colors.textPrimary,
    ...typography.headline,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.bodyLg,
    maxWidth: 320,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    width: "100%",
  },
  googleButton: {
    borderRadius: 9999,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  googleButtonText: {
    color: colors.textInverse,
    ...typography.bodyMd,
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
  },
});
