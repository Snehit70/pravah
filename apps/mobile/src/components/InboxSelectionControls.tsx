import { Pressable, StyleSheet, Text, View } from "react-native";
import { CheckIcon, TrashIcon } from "./UiIcons";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

type HeaderProps = {
  selectedCount: number;
  visibleCount: number;
  allSelected: boolean;
  onCancel: () => void;
  onToggleAll: () => void;
};

export function InboxSelectionHeader({
  selectedCount,
  visibleCount,
  allSelected,
  onCancel,
  onToggleAll,
}: HeaderProps) {
  const percentage = visibleCount === 0 ? 0 : Math.round((selectedCount / visibleCount) * 100);

  return (
    <View style={styles.header}>
      <View style={styles.headerLine}>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel selection">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onToggleAll}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={allSelected ? "Clear selection" : "Select all"}
        >
          <Text style={styles.selectAll}>{allSelected ? "Clear" : "Select all"}</Text>
        </Pressable>
      </View>
      <View style={styles.selectionCard}>
        <Text style={styles.selectionTitle}>
          {selectedCount === 0 ? "Choose tasks" : `${selectedCount} selected`}
        </Text>
        <View style={styles.selectionMeter} accessibilityLabel={`${selectedCount} of ${visibleCount} tasks selected`}>
          <View style={styles.selectionMeterTrack}>
            <View style={[styles.selectionMeterFill, { width: `${percentage}%` }]} />
          </View>
          <Text style={styles.selectionMeterLabel}>{percentage}%</Text>
        </View>
      </View>
    </View>
  );
}

type DockProps = {
  selectedCount: number;
  tabBarHeight: number;
  disabled: boolean;
  onDelete: () => void;
  onMarkDone: () => void;
};

export function InboxSelectionActionDock({ selectedCount, tabBarHeight, disabled, onDelete, onMarkDone }: DockProps) {
  if (selectedCount === 0) {
    return <Text style={[styles.emptyCue, { bottom: tabBarHeight + spacing.xl }]}>Choose tasks to act on</Text>;
  }

  const doneLabel = selectedCount === 1 ? "Mark 1 done" : `Mark ${selectedCount} done`;
  const doneAccessibilityLabel = selectedCount === 1 ? "Mark task as done" : `Mark ${selectedCount} tasks as done`;
  const deleteLabel = selectedCount === 1 ? "Delete 1 task" : `Delete ${selectedCount} tasks`;

  return (
    <View style={[styles.dock, { bottom: tabBarHeight }]}>
      <Pressable onPress={onDelete} disabled={disabled} hitSlop={12} accessibilityRole="button" accessibilityLabel={deleteLabel} style={({ pressed }) => [styles.deleteButton, (disabled || pressed) && styles.dimmed]}>
        <TrashIcon size={16} color={colors.error} strokeWidth={2} />
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
      <Pressable onPress={onMarkDone} disabled={disabled} hitSlop={12} accessibilityRole="button" accessibilityLabel={doneAccessibilityLabel} style={({ pressed }) => [styles.doneButton, (disabled || pressed) && styles.dimmed]}>
        <CheckIcon size={18} color={colors.textInverse} strokeWidth={2.5} />
        <Text style={styles.doneText}>{doneLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = createThemedStyles({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  headerLine: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  cancel: { ...typography.bodyMd, color: colors.textSecondary },
  selectAll: { ...typography.title, color: colors.accent },
  selectionCard: { minHeight: 78, borderRadius: radii.lg, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bgCard, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  selectionTitle: { ...typography.headline, color: colors.textPrimary },
  selectionMeter: { width: 116, gap: 5 },
  selectionMeterTrack: { height: 7, overflow: "hidden", borderRadius: radii.full, backgroundColor: colors.accentDim },
  selectionMeterFill: { height: "100%", minWidth: 7, borderRadius: radii.full, backgroundColor: colors.accent },
  selectionMeterLabel: { ...typography.micro, color: colors.textMuted, textAlign: "right" },
  dock: { position: "absolute", left: 0, right: 0, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle, shadowColor: "#201914", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
  deleteButton: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.bgFloating },
  deleteText: { ...typography.bodyMd, color: colors.error },
  doneButton: { flex: 1, minHeight: 52, borderRadius: radii.lg, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, shadowColor: "#201914", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  doneText: { ...typography.title, color: colors.textInverse },
  dimmed: { opacity: 0.55 },
  emptyCue: { position: "absolute", alignSelf: "center", ...typography.bodyMd, color: colors.textMuted, backgroundColor: colors.bgFloating, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.full, overflow: "hidden" },
});
