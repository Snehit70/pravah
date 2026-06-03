import { useMemo, useState } from "react";
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
import { colors, radii, spacing, typography } from "../theme/tokens";
import { dateLabel } from "../lib/dates";
import {
  computeReflow,
  type ReflowAssignment,
  type ReflowGroup,
} from "../lib/reflow";
import type { MobileTask } from "./TaskCard";

export type ReflowCommitItem = {
  goalId: string;
  goalText: string;
  assignments: ReflowAssignment[];
  /** When set, the caller should also move the goal's deadline here. */
  newDeadline?: string;
};

type OverdueSheetProps = {
  visible: boolean;
  onClose: () => void;
  groups: ReflowGroup[];
  orphans: MobileTask[];
  today: string;
  tomorrow: string;
  weekEnd: string;
  onCommitReflow: (items: ReflowCommitItem[]) => void;
  onManualTriage: (
    taskId: string,
    target: "today" | "tomorrow" | "week" | "drop"
  ) => void;
};

const MANUAL_ACTIONS: { key: "today" | "tomorrow" | "week" | "drop"; label: string }[] = [
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
  today,
  tomorrow,
  weekEnd,
  onCommitReflow,
  onManualTriage,
}: OverdueSheetProps) {
  const insets = useSafeAreaInsets();
  // null = list view; otherwise we're previewing one goal's reflow.
  const [previewGoalId, setPreviewGoalId] = useState<string | null>(null);
  const [applyDeadline, setApplyDeadline] = useState(false);

  const previewGroup = useMemo(
    () => groups.find((g) => g.goal.id === previewGoalId) ?? null,
    [groups, previewGoalId]
  );
  const previewResult = useMemo(
    () => (previewGroup ? computeReflow(previewGroup, today) : null),
    [previewGroup, today]
  );

  const friendly = (iso: string) => dateLabel(iso, today, tomorrow, weekEnd);

  const openPreview = (group: ReflowGroup) => {
    const result = computeReflow(group, today);
    // Default the deadline toggle on only when the existing deadline has
    // already passed (it's meaningless), off when it's still in the future.
    const passed = !!group.goal.deadline && group.goal.deadline < today;
    setApplyDeadline(passed && !!result.suggestedDeadline);
    setPreviewGoalId(group.goal.id);
  };

  const confirmPreview = () => {
    if (!previewGroup || !previewResult) return;
    onCommitReflow([
      {
        goalId: previewGroup.goal.id,
        goalText: previewGroup.goal.text,
        assignments: previewResult.assignments,
        newDeadline:
          applyDeadline && previewResult.suggestedDeadline
            ? previewResult.suggestedDeadline
            : undefined,
      },
    ]);
    setPreviewGoalId(null);
    onClose();
  };

  const rescheduleAll = () => {
    const items: ReflowCommitItem[] = groups.map((group) => {
      const result = computeReflow(group, today);
      const passed = !!group.goal.deadline && group.goal.deadline < today;
      return {
        goalId: group.goal.id,
        goalText: group.goal.text,
        assignments: result.assignments,
        // For the bulk path, auto-adopt a new deadline only when the old one
        // has already lapsed (no per-goal toggle in this shortcut).
        newDeadline: passed ? result.suggestedDeadline : undefined,
      };
    });
    onCommitReflow(items);
    onClose();
  };

  const totalOverdue =
    groups.reduce((sum, g) => sum + g.overdueCount, 0) + orphans.length;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
        <Pressable accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />

          {previewGroup && previewResult ? (
            // ── Preview view ──────────────────────────────────────────────
            <>
              <View style={styles.headerRow}>
                <Pressable onPress={() => setPreviewGoalId(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
                  <Text style={styles.backLink}>‹ Back</Text>
                </Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>{previewGroup.goal.text}</Text>
              </View>

              <View style={styles.summaryBlock}>
                <Text style={styles.summaryLine}>
                  {previewResult.movedCount} task{previewResult.movedCount === 1 ? "" : "s"} rescheduled
                </Text>
                <Text style={styles.summarySub}>
                  {previewResult.mode === "spread"
                    ? `Spread evenly through ${friendly(previewResult.projectedEnd)}`
                    : `One per day · finishes ${friendly(previewResult.projectedEnd)}`}
                </Text>
                {previewResult.futureMovedCount > 0 ? (
                  <Text style={styles.summaryWarn}>
                    {previewResult.futureMovedCount} future task
                    {previewResult.futureMovedCount === 1 ? "" : "s"} also moved
                  </Text>
                ) : null}
                {previewResult.suggestedDeadline ? (
                  <Text style={styles.summaryWarn}>
                    Finishes {previewResult.projectedEnd}
                    {previewGroup.goal.deadline ? ` · past deadline ${previewGroup.goal.deadline}` : ""}
                  </Text>
                ) : null}
              </View>

              {previewResult.suggestedDeadline ? (
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>
                    Also move goal deadline to {previewResult.suggestedDeadline}
                  </Text>
                  <Switch
                    value={applyDeadline}
                    onValueChange={setApplyDeadline}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={colors.textPrimary}
                  />
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>Schedule</Text>
              <ScrollView style={styles.previewList} showsVerticalScrollIndicator={false}>
                {previewGroup.planTasks.map((t) => {
                  const next = previewResult.assignments.find((a) => a.taskId === String(t._id));
                  const changed = next && next.scheduledDate !== t.scheduledDate;
                  return (
                    <View key={String(t._id)} style={styles.previewItem}>
                      <Text style={styles.previewTitle} numberOfLines={1}>{t.title}</Text>
                      <Text style={[styles.previewDate, changed && styles.previewDateChanged]}>
                        {next ? friendly(next.scheduledDate) : friendly(t.scheduledDate ?? today)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>

              <Pressable onPress={confirmPreview} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Confirm reschedule">
                <Text style={styles.primaryBtnText}>Reschedule {previewResult.movedCount} task{previewResult.movedCount === 1 ? "" : "s"}</Text>
              </Pressable>
            </>
          ) : (
            // ── List view ─────────────────────────────────────────────────
            <>
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Overdue · {totalOverdue}</Text>
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                  <Text style={styles.backLink}>Done</Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
                {groups.length > 1 ? (
                  <Pressable onPress={rescheduleAll} style={({ pressed }) => [styles.allBtn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Reschedule all goals">
                    <Text style={styles.allBtnText}>Reschedule all goals</Text>
                  </Pressable>
                ) : null}

                {groups.length > 0 ? <Text style={styles.sectionLabel}>By goal</Text> : null}
                {groups.map((group) => (
                  <Pressable
                    key={group.goal.id}
                    onPress={() => openPreview(group)}
                    style={({ pressed }) => [styles.goalRow, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Reschedule ${group.goal.text}, ${group.overdueCount} overdue`}
                  >
                    <View style={styles.goalRowText}>
                      <Text style={styles.goalName} numberOfLines={1}>{group.goal.text}</Text>
                      <Text style={styles.goalMeta}>
                        {group.overdueCount} overdue
                        {group.goal.deadline ? ` · due ${group.goal.deadline}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.goalCta}>Reschedule ›</Text>
                  </Pressable>
                ))}

                {orphans.length > 0 ? <Text style={styles.sectionLabel}>Loose ends</Text> : null}
                {orphans.map((t) => (
                  <View key={String(t._id)} style={styles.orphanRow}>
                    <Text style={styles.orphanTitle} numberOfLines={2}>{t.title}</Text>
                    <View style={styles.chipRow}>
                      {MANUAL_ACTIONS.map((action) => (
                        <Pressable
                          key={action.key}
                          onPress={() => onManualTriage(String(t._id), action.key)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.chip,
                            action.key === "drop" && styles.chipDrop,
                            pressed && styles.pressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${action.label} — ${t.title}`}
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
