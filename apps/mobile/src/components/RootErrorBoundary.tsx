import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { classifyError, mobileLogger } from "../lib/logger";

type RootErrorBoundaryProps = {
  children: ReactNode;
};

type RootErrorBoundaryState = {
  hasError: boolean;
};

export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    mobileLogger.error("root_error_boundary_caught", {
      errorType: classifyError(error),
      errorMessage: error.message,
      componentStack: errorInfo.componentStack,
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
        <Text style={styles.kicker}>Mobile fallback</Text>
        <Text style={styles.title}>Something slipped out of view.</Text>
        <Text style={styles.body}>Try restoring the workspace. If this keeps happening, we should inspect the latest logs.</Text>
        <Pressable onPress={this.handleRetry} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    gap: spacing.md,
  },
  rule: {
    width: 36,
    height: 2,
    backgroundColor: colors.accent,
  },
  kicker: {
    ...typography.micro,
    color: colors.textMuted,
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  body: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    maxWidth: 320,
  },
  button: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    ...typography.title,
    color: colors.bg,
  },
});
