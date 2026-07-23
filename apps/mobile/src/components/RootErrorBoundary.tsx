import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { classifyError, describeErrorForDiagnostics, mobileLogger } from "../lib/logger";
import { getDiagnosticsRuntimeState } from "../lib/diagnostics";
import { shareDiagnosticsBundle } from "../lib/diagnosticsExport";

type RootErrorBoundaryProps = {
  children: ReactNode;
};

type RootErrorBoundaryState = {
  hasError: boolean;
  exportMessage: string | null;
  isExporting: boolean;
};

export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    hasError: false,
    exportMessage: null,
    isExporting: false,
  };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true, exportMessage: null, isExporting: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const runtime = getDiagnosticsRuntimeState();
    mobileLogger.error("root_error_boundary_caught", {
      errorType: classifyError(error),
      ...describeErrorForDiagnostics(error),
      componentStack: errorInfo.componentStack,
      runtime,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, exportMessage: null, isExporting: false });
  };

  private handleExportDiagnostics = async () => {
    if (this.state.isExporting) return;
    this.setState({ isExporting: true, exportMessage: null });
    try {
      await shareDiagnosticsBundle();
      this.setState({ exportMessage: "Diagnostics exported.", isExporting: false });
    } catch (error) {
      mobileLogger.error("root_fallback_diagnostics_export_failed", {
        errorType: classifyError(error),
      });
      this.setState({ exportMessage: "Could not export diagnostics.", isExporting: false });
    }
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
        <View style={styles.buttonRow}>
          <Pressable
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Reload Pravah"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
          <Pressable
            onPress={this.handleExportDiagnostics}
            disabled={this.state.isExporting}
            accessibilityRole="button"
            accessibilityLabel={
              this.state.isExporting ? "Exporting diagnostics" : "Export diagnostics"
            }
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
              this.state.isExporting && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {this.state.isExporting ? "Exporting..." : "Export diagnostics"}
            </Text>
          </Pressable>
        </View>
        {this.state.exportMessage ? <Text style={styles.statusText}>{this.state.exportMessage}</Text> : null}
      </View>
    );
  }
}

const styles = createThemedStyles({
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
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    ...typography.micro,
    color: colors.textPrimary,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  statusText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
});
