import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme/tokens";

type DiagnosticsPanelProps = {
  visible: boolean;
  activeTab: string;
  inboxCount: number;
  timelineCount: number;
  completedCount: number;
  pendingMutations: number;
  retryQueueCount: number;
  isKairoActive: boolean;
  isAllTasksReady: boolean;
  usingSnapshot: boolean;
  isDataBootstrapReady: boolean;
  onToggle: () => void;
};

export function DiagnosticsPanel({
  visible,
  activeTab,
  inboxCount,
  timelineCount,
  completedCount,
  pendingMutations,
  retryQueueCount,
  isKairoActive,
  isAllTasksReady,
  usingSnapshot,
  isDataBootstrapReady,
  onToggle,
}: DiagnosticsPanelProps) {
  if (!visible) {
    return (
      <Pressable
        onPress={onToggle}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Show diagnostics"
        style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.toggleText}>Diag</Text>
      </Pressable>
    );
  }

  const rows = [
    ["tab", activeTab],
    ["tasks", `${inboxCount} inbox / ${timelineCount} timeline / ${completedCount} done`],
    ["pending", `${pendingMutations} mutations / ${retryQueueCount} queued`],
    ["kairo", isKairoActive ? (isAllTasksReady ? "open, ready" : "open, loading") : "closed"],
    ["snapshot", usingSnapshot ? "yes" : "no"],
    ["bootstrap", isDataBootstrapReady ? "ready" : "syncing"],
  ];

  return (
    <View style={styles.panel} pointerEvents="box-none">
      <View style={styles.panelHeader}>
        <Text style={styles.title}>Diagnostics</Text>
        <Pressable
          onPress={onToggle}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Hide diagnostics"
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.closeText}>Hide</Text>
        </Pressable>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    position: "absolute",
    right: spacing.lg,
    bottom: 140,
    zIndex: 80,
    elevation: 80,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  toggleText: {
    ...typography.micro,
    color: colors.accent,
  },
  panel: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: 120,
    zIndex: 80,
    elevation: 80,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  close: {
    minHeight: 44,
    justifyContent: "center",
  },
  closeText: {
    ...typography.micro,
    color: colors.accent,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  label: {
    ...typography.micro,
    color: colors.textMuted,
  },
  value: {
    ...typography.micro,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: "right",
  },
});
