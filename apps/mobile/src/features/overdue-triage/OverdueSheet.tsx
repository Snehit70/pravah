import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import { dateLabel } from "../../lib/dates";
import type { MobileTask } from "../../components/TaskCard";
import type { ManualTriageTarget, OverduePreviewGroup } from "./types";

type OverdueSheetProps = {
  visible: boolean;
  onClose: () => void;
  groups: OverduePreviewGroup[];
  orphans: MobileTask[];
  selectedPreview: OverduePreviewGroup | null;
  applyDeadline: boolean;
  today: string;
  tomorrow: string;
  weekEnd: string;
  onOpenPreview: (goalId: string) => void;
  onClosePreview: () => void;
  onSetApplyDeadline: (next: boolean) => void;
  onConfirmPreview: () => void;
  onRescheduleAll: () => void;
  onManualTriage: (taskId: string, target: ManualTriageTarget) => void;
};

const MANUAL_ACTIONS: { key: ManualTriageTarget; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "drop", label: "Drop" },
];

export function OverdueSheet({
  visible,
  onClose,
  groups,
  orphans,
  selectedPreview,
  applyDeadline,
  today,
  tomorrow,
  weekEnd,
  onOpenPreview,
  onClosePreview,
  onSetApplyDeadline,
  onConfirmPreview,
  onRescheduleAll,
  onManualTriage,
}: OverdueSheetProps) {
  const insets = useSafeAreaInsets();
  const friendly = (iso: string) => dateLabel(iso, today, tomorrow, weekEnd);
  const totalOverdue =
    groups.reduce((sum, group) => sum + group.overdueCount, 0) + orphans.length;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
        <Pressable accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />

          {selectedPreview ? (
            <>
              <View style={styles.headerRow}>
                <Pressable onPress={onClosePreview} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
                  <Text style={styles.backLink}>‹ Back</Text>
                </Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>{selectedPreview.goalText}</Text>
              </View>

              <View style={styles.summaryBlock}>
                <Text style={styles.summaryLine}>
                  {selectedPreview.movedCount} task{selectedPreview.movedCount === 1 ? "" : "s"} rescheduled
                </Text>
                <Text style={styles.summarySub}>
                  {selectedPreview.mode === "spread"
                    ? `Spread evenly through ${friendly(selectedPreview.projectedEnd)}`
                    : `One per day · finishes ${friendly(selectedPreview.projectedEnd)}`}
                </Text>
                {selectedPreview.futureMovedCount > 0 ? (
                  <Text style={styles.summaryWarn}>
                    {selectedPreview.futureMovedCount} future task
                    {selectedPreview.futureMovedCount === 1 ? "" : "s"} also moved
                  </Text>
                ) : null}
                {selectedPreview.suggestedDeadline ? (
                  <Text style={styles.summaryWarn}>
                    Finishes {selectedPreview.projectedEnd}
                    {selectedPreview.goalDeadline ? ` · past deadline ${selectedPreview.goalDeadline}` : ""}
                  </Text>
                ) : null}
              </View>

              {selectedPreview.suggestedDeadline ? (
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>
                    Also move goal deadline to {selectedPreview.suggestedDeadline}
                  </Text>
                  <Switch
                    value={applyDeadline}
                    onValueChange={onSetApplyDeadline}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={colors.textPrimary}
                  />
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>Schedule</Text>
              <ScrollView style={styles.previewList} showsVerticalScrollIndicator={false}>
                {selectedPreview.tasks.map((task) => (
                  <View key={task.taskId} style={styles.previewItem}>
                    <Text style={styles.previewTitle} numberOfLines={1}>{task.title}</Text>
                    <Text style={[styles.previewDate, task.changed && styles.previewDateChanged]}>
                      {friendly(task.nextDate)}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <Pressable onPress={onConfirmPreview} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Confirm reschedule">
                <Text style={styles.primaryBtnText}>
                  Reschedule {selectedPreview.movedCount} task{selectedPreview.movedCount === 1 ? "" : "s"}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Overdue · {totalOverdue}</Text>
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                  <Text style={styles.backLink}>Done</Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
                {groups.length > 1 ? (
                  <Pressable onPress={onRescheduleAll} style={({ pressed }) => [styles.allBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Reschedule all goals">
                    <Text style={styles.allBtnText}>Reschedule all goals</Text>
                  </Pressable>
                ) : null}

                {groups.length > 0 ? <Text style={styles.sectionLabel}>By goal</Text> : null}
                {groups.map((group) => (
                  <Pressable
                    key={group.goalId}
                    onPress={() => onOpenPreview(group.goalId)}
                    style={({ pressed }) => [styles.goalRow, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Reschedule ${group.goalText}, ${group.overdueCount} overdue`}
                  >
                    <View style={styles.goalRowText}>
                      <Text style={styles.goalName} numberOfLines={1}>{group.goalText}</Text>
                      <Text style={styles.goalMeta}>
                        {group.overdueCount} overdue
                        {group.goalDeadline ? ` · due ${group.goalDeadline}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.goalCta}>Reschedule ›</Text>
                  </Pressable>
                ))}

                {orphans.length > 0 ? <Text style={styles.sectionLabel}>Loose ends</Text> : null}
                {orphans.map((task) => (
                  <View key={String(task._id)} style={styles.orphanRow}>
                    <Text style={styles.orphanTitle} numberOfLines={2}>{task.title}</Text>
                    <View style={styles.chipRow}>
                      {MANUAL_ACTIONS.map((action) => (
                        <Pressable
                          key={action.key}
                          onPress={() => onManualTriage(String(task._id), action.key)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.chip,
                            action.key === "drop" && styles.chipDrop,
                            pressed && styles.pressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${action.label} — ${task.title}`}
                        >
                          <Text style={[styles.chipText, action.key === "drop" && styles.chipDropText]}>
                            {action.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}

                {groups.length === 0 && orphans.length === 0 ? (
                  <Text style={styles.emptyText}>Nothing overdue. You&apos;re clear.</Text>
                ) : null}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdropDim: { backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "82%",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerTitle: { flex: 1, color: colors.textPrimary, ...typography.title },
  backLink: { color: colors.accent, ...typography.bodyMd },
  listContent: { paddingBottom: spacing.lg, gap: spacing.xs },
  sectionLabel: {
    color: colors.textMuted,
    ...typography.micro,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  allBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  allBtnText: { color: colors.accent, ...typography.bodyMd, fontWeight: "600" },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  goalRowText: { flex: 1, minWidth: 0 },
  goalName: { color: colors.textPrimary, ...typography.bodyMd },
  goalMeta: { color: colors.textMuted, ...typography.micro, marginTop: 2 },
  goalCta: { color: colors.accent, ...typography.micro },
  orphanRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  orphanTitle: { color: colors.textPrimary, ...typography.bodyMd, marginBottom: spacing.xs },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCardGlass,
  },
  chipDrop: { borderColor: colors.error },
  chipText: { ...typography.micro, color: colors.textSecondary },
  chipDropText: { color: colors.error },
  summaryBlock: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.md,
    gap: 2,
    marginBottom: spacing.md,
  },
  summaryLine: { color: colors.textPrimary, ...typography.bodyMd, fontWeight: "600" },
  summarySub: { color: colors.textSecondary, ...typography.bodyMd },
  summaryWarn: { color: colors.accent, ...typography.micro, marginTop: 2 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  toggleLabel: { flex: 1, color: colors.textSecondary, ...typography.bodyMd },
  previewList: { maxHeight: 260, marginBottom: spacing.md },
  previewItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  previewTitle: { flex: 1, color: colors.textSecondary, ...typography.bodyMd },
  previewDate: { color: colors.textMuted, ...typography.micro },
  previewDateChanged: { color: colors.accent },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.textInverse, ...typography.bodyMd, fontWeight: "600" },
  emptyText: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center",
    paddingVertical: spacing.xxl,
  },
  pressed: { opacity: 0.7 },
});
