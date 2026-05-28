import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { DiagnosticEvent } from "../lib/diagnostics";

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
  onShareDiagnostics?: () => void;
  events?: DiagnosticEvent[];
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
  onShareDiagnostics,
  events = [],
}: DiagnosticsPanelProps) {
  const [enabledFilters, setEnabledFilters] = useState<Record<string, boolean>>({
    issue: true,
    auth: true,
    network: true,
    ui: true,
  });
  const toggleFilter = (key: "issue" | "auth" | "network" | "ui") =>
    setEnabledFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  const timeline = useMemo(() => {
    const filtered = events.filter((item) => {
      if (enabledFilters.issue && (item.level === "error" || item.level === "warn")) return true;
      if (enabledFilters.auth && item.flow === "auth") return true;
      if (enabledFilters.network && item.flow === "network") return true;
      if (enabledFilters.ui && item.flow === "ui") return true;
      return false;
    });
    return filtered.slice(-200).reverse();
  }, [enabledFilters, events]);

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
      {onShareDiagnostics ? (
        <Pressable
          onPress={onShareDiagnostics}
          accessibilityRole="button"
          accessibilityLabel="Share diagnostics"
          style={({ pressed }) => [styles.share, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.shareText}>Share diagnostics</Text>
        </Pressable>
      ) : null}
      <View style={styles.timeline}>
        <Text style={styles.timelineTitle}>Recent events</Text>
        <View style={styles.filtersRow}>
          <Pressable onPress={() => toggleFilter("issue")} style={styles.filterChip}>
            <Text style={styles.filterText}>error/warn {enabledFilters.issue ? "on" : "off"}</Text>
          </Pressable>
          <Pressable onPress={() => toggleFilter("auth")} style={styles.filterChip}>
            <Text style={styles.filterText}>auth {enabledFilters.auth ? "on" : "off"}</Text>
          </Pressable>
          <Pressable onPress={() => toggleFilter("network")} style={styles.filterChip}>
            <Text style={styles.filterText}>network {enabledFilters.network ? "on" : "off"}</Text>
          </Pressable>
          <Pressable onPress={() => toggleFilter("ui")} style={styles.filterChip}>
            <Text style={styles.filterText}>ui {enabledFilters.ui ? "on" : "off"}</Text>
          </Pressable>
        </View>
        {timeline.length === 0 ? (
          <Text style={styles.timelineItem}>No events yet.</Text>
        ) : (
          timeline.map((entry) => (
            <Text key={`${entry.sessionId}-${entry.seq}`} style={styles.timelineItem}>
              [{entry.level}] {entry.event}
            </Text>
          ))
        )}
      </View>
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
  share: {
    marginTop: spacing.sm,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  shareText: {
    ...typography.micro,
    color: colors.accent,
  },
  timeline: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    maxHeight: 180,
  },
  filtersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  filterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  filterText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  timelineTitle: {
    ...typography.micro,
    color: colors.textMuted,
  },
  timelineItem: {
    ...typography.micro,
    color: colors.textPrimary,
  },
});
