import { useState } from "react";
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { humanDate } from "../lib/dates";
import { formatTime12h, priorityDotColor, priorityLabel } from "../lib/task-form";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles, getThemeRuntimeSnapshot } from "../theme/themeRuntime";
import { useConfirm } from "../hooks/useConfirm";
import type { MobileTask } from "./TaskCard";
import NavGoalsAsset from "../assets/icons/nav-goals.svg";
import {
  CalendarIcon,
  CheckIcon,
  InfoCircleIcon,
  TrashIcon,
} from "./UiIcons";

type CompletedTaskSheetProps = {
  task: MobileTask | null;
  linkedGoalName?: string;
  onClose: () => void;
  onDelete: (taskId: MobileTask["_id"]) => void;
  onReopen: (taskId: MobileTask["_id"]) => void;
  onViewGoal?: () => void;
};

function formatTimestamp(ms?: number): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PlanningRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.planningRow}>
      <View style={styles.planningIcon}>{icon}</View>
      <Text style={styles.planningLabel}>{label}</Text>
      <Text style={[styles.planningValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function CompletedTaskSheet({
  task: openTask,
  linkedGoalName,
  onClose,
  onDelete,
  onReopen,
  onViewGoal,
}: CompletedTaskSheetProps) {
  const insets = useSafeAreaInsets();
  const confirm = useConfirm();
  const [task, setTask] = useState(openTask);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (openTask && openTask !== task) {
    setTask(openTask);
    setOverflowOpen(false);
    setShowDetails(false);
  }

  if (!task) {
    return (
      <Modal visible={false} transparent>
        <View />
      </Modal>
    );
  }

  const completedAtLabel = formatTimestamp(task.completedAt);
  const plannedFor = task.deadline
    ? `${humanDate(task.deadline)}${task.time ? ` · ${formatTime12h(task.time)}` : ""}`
    : "Inbox";
  const priorityValue = task.priority
    ? `${priorityLabel(task.priority)} — ${task.priority === "p1" ? "High" : task.priority === "p2" ? "Medium" : "Low"}`
    : "No priority";

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete “${task.title}”?`,
      message: "It will be removed from your task history. You can restore it for 30 minutes.",
      confirmLabel: "Delete task",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    onDelete(task._id);
  };

  return (
    <Modal
      visible={openTask !== null}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView
          intensity={38}
          tint={getThemeRuntimeSnapshot().appearance === "dark" ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close completed task details"
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handleBar} />
          <View style={styles.utilityHeader}>
            <View style={styles.iconButton} />
            <Text style={styles.utilityLabel}>TASK</Text>
            <Pressable
              onPress={() => setOverflowOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="More task actions"
              accessibilityState={{ expanded: overflowOpen }}
              hitSlop={12}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Text style={styles.moreGlyph}>•••</Text>
            </Pressable>
          </View>

          {overflowOpen ? (
            <View style={styles.overflowMenu}>
              <Pressable
                onPress={() => {
                  setShowDetails((value) => !value);
                  setOverflowOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={showDetails ? "Hide task details" : "View task details"}
                accessibilityState={{ expanded: showDetails }}
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              >
                <InfoCircleIcon color={colors.textSecondary} size={18} />
                <Text style={styles.menuItemText}>Task details</Text>
              </Pressable>
              {onViewGoal ? (
                <Pressable
                  onPress={() => {
                    setOverflowOpen(false);
                    onViewGoal();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`View linked goal for ${task.title}`}
                  style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                >
                  <NavGoalsAsset color={colors.accent} width={18} height={18} />
                  <Text style={styles.menuItemText}>View linked Goal</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setOverflowOpen(false);
                  void handleDelete();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${task.title}`}
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              >
                <TrashIcon color={colors.error} size={18} />
                <Text style={[styles.menuItemText, { color: colors.error }]}>Delete task</Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{task.title}</Text>
              <View style={styles.completedLine}>
                <CheckIcon color={colors.success} size={16} />
                <Text style={styles.statusLine}>
                  COMPLETED{completedAtLabel ? ` · ${completedAtLabel.toUpperCase()}` : ""}
                </Text>
              </View>
            </View>

            <View style={styles.notesSection}>
              <Text style={styles.sectionLabel}>Notes</Text>
              <View style={styles.notesPreview}>
                <Text style={[styles.notesText, !task.description && styles.emptyValue]}>
                  {task.description || "No notes"}
                </Text>
              </View>
            </View>

            <View style={styles.planningSection}>
              <Text style={styles.sectionLabel}>Planning</Text>
              <View style={styles.planningCard}>
                <PlanningRow
                  icon={<CalendarIcon color={colors.textSecondary} size={18} />}
                  label="When"
                  value={plannedFor}
                />
                <PlanningRow
                  icon={
                    <View
                      style={[
                        styles.priorityDot,
                        { backgroundColor: priorityDotColor(task.priority) },
                      ]}
                    />
                  }
                  label="Priority"
                  value={priorityValue}
                  valueColor={task.priority ? priorityDotColor(task.priority) : undefined}
                />
                <PlanningRow
                  icon={<NavGoalsAsset color={linkedGoalName ? colors.accent : colors.textMuted} width={18} height={18} />}
                  label="Goal"
                  value={linkedGoalName ?? "No goal"}
                />
              </View>
            </View>

            {showDetails ? (
              <View style={styles.detailsCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Created</Text>
                  <Text style={styles.detailValue}>{formatTimestamp(task.createdAt) ?? "Unknown"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Last updated</Text>
                  <Text style={styles.detailValue}>{formatTimestamp(task.updatedAt) ?? "Unknown"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Captured in</Text>
                  <Text style={styles.detailValue}>{task.deadline ? "Timeline" : "Inbox"}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.readOnlyNotice}>
              <InfoCircleIcon color={colors.textMuted} size={16} />
              <Text style={styles.readOnlyText}>Editing is available after you reopen this task.</Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <Pressable
              onPress={() => onReopen(task._id)}
              accessibilityRole="button"
              accessibilityLabel={`Reopen ${task.title}`}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Reopen task</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.section,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "92%",
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    overflow: "hidden",
  },
  pressed: { opacity: 0.68 },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: spacing.sm,
  },
  utilityHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  utilityLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  moreGlyph: {
    ...typography.title,
    color: colors.textPrimary,
    letterSpacing: 1,
    transform: [{ rotate: "90deg" }],
  },
  overflowMenu: {
    alignSelf: "flex-end",
    marginRight: spacing.md,
    marginBottom: spacing.sm,
    minWidth: 210,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgFloating,
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  menuItemText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  titleBlock: { gap: spacing.xs },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  completedLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusLine: {
    ...typography.micro,
    color: colors.success,
    letterSpacing: 0.7,
  },
  notesSection: { gap: spacing.sm },
  planningSection: { gap: spacing.sm },
  sectionLabel: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  notesPreview: {
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bgInput,
  },
  notesText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  emptyValue: { color: colors.textMuted },
  planningCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
  },
  planningRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  planningIcon: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  planningLabel: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  planningValue: {
    flex: 1,
    textAlign: "right",
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  detailsCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
  },
  detailRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  detailLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  readOnlyNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  readOnlyText: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  footer: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
  },
  primaryButtonText: {
    ...typography.bodyMd,
    color: colors.textInverse,
    fontWeight: "700",
  },
});
