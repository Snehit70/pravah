import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadow, spacing, typography } from "../theme/tokens";
import { BrandMark } from "./BrandMark";

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

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={[styles.brandZone, { paddingTop: insets.top + spacing.section * 2 }]}>
        <BrandMark size={64} />
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
        >
          <Text style={styles.wordmark}>Pravah</Text>
        </Pressable>

      </View>

      <View style={[styles.buttonZone, { paddingBottom: insets.bottom + spacing.section }]}>
        <Pressable
          onPress={onGoogleSignIn}
          disabled={!canGoogleSignIn || isSigningIn}
          accessibilityRole="button"
          accessibilityLabel={isSigningIn ? "Signing in with Google" : "Sign in with Google"}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  brandZone: {
    flex: 1,
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  wordmark: {
    color: colors.textPrimary,
    ...typography.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
  },
  tagline: {
    color: colors.textSecondary,
    ...typography.bodyLg,
    textAlign: "center",
  },
  buttonZone: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  googleButton: {
    borderRadius: 9999,
    backgroundColor: colors.bgFloating,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    ...shadow.glow,
  },
  googleButtonText: {
    color: colors.textPrimary,
    ...typography.title,
  },
  disabledButton: {
    opacity: 0.45,
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
