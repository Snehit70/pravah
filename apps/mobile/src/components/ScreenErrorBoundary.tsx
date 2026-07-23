import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { classifyError, describeErrorForDiagnostics, mobileLogger } from "../lib/logger";
import { getDiagnosticsRuntimeState } from "../lib/diagnostics";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

type ScreenErrorBoundaryProps = {
  screenName: string;
  children: ReactNode;
};

type ScreenErrorBoundaryState = {
  hasError: boolean;
};

export class ScreenErrorBoundary extends Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  state: ScreenErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ScreenErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const runtime = getDiagnosticsRuntimeState();
    mobileLogger.error("screen_error_boundary_caught", {
      screenName: this.props.screenName,
      errorType: classifyError(error),
      ...describeErrorForDiagnostics(error),
      componentStack: errorInfo.componentStack,
      runtime,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <View style={styles.rule} />
        <Text style={styles.kicker}>{this.props.screenName} fallback</Text>
        <Text style={styles.title}>This section slipped out of view.</Text>
        <Text style={styles.body}>Try reloading this tab. If it happens again, inspect the latest logs.</Text>
        <Pressable
          onPress={this.handleRetry}
          accessibilityRole="button"
          accessibilityLabel={`Reload ${this.props.screenName}`}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Reload tab</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = createThemedStyles({
  container: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
    borderRadius: radii.md,
    backgroundColor: colors.errorMuted,
    gap: spacing.xs,
  },
  rule: {
    width: 24,
    height: 2,
    backgroundColor: colors.error,
    marginBottom: spacing.xs,
  },
  kicker: {
    ...typography.micro,
    color: colors.textMuted,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  body: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  button: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    ...typography.micro,
    color: colors.bg,
  },
});
