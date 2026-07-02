import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { humanDate } from "../lib/dates";
import { formatTime12h } from "../lib/task-form";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useConfirm } from "../hooks/useConfirm";
import type { MobileTask } from "./TaskCard";

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

export function CompletedTaskSheet({
  task,
  linkedGoalName,
  onClose,
  onDelete,
  onReopen,
  onViewGoal,
}: CompletedTaskSheetProps) {
  const insets = useSafeAreaInsets();
  const confirm = useConfirm();
  const completedAtLabel = formatTimestamp(task?.completedAt);
  const createdAtLabel = formatTimestamp(task?.createdAt);

  return (
    <Modal
      visible={task !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close completed task details" />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          role="dialog"
          accessibilityViewIsModal
          accessibilityLabel={task ? `${task.title} details` : "Completed task details"}
        >
          {task ? (
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.grabber} />
              <Text style={styles.kicker}>Completed task</Text>
              <Text style={styles.title}>{task.title}</Text>
              {task.description ? <Text style={styles.description}>{task.description}</Text> : null}

              <View style={styles.metaCard}>
                {completedAtLabel ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Completed</Text>
                    <Text style={styles.metaValue}>{completedAtLabel}</Text>
                  </View>
                ) : null}
                {task.deadline ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Planned for</Text>
                    <Text style={styles.metaValue}>
                      {humanDate(task.deadline)}
                      {task.time ? ` · ${formatTime12h(task.time)}` : ""}
                    </Text>
                  </View>
                ) : null}
                {!task.deadline ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Origin</Text>
                    <Text style={styles.metaValue}>Inbox capture</Text>
                  </View>
                ) : null}
                {linkedGoalName ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Goal</Text>
                    <Text style={styles.metaValue}>{linkedGoalName}</Text>
                  </View>
                ) : null}
                {createdAtLabel ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Created</Text>
                    <Text style={styles.metaValue}>{createdAtLabel}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.actionGroup}>
                <Pressable
                  onPress={() => onReopen(task._id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reopen ${task.title}`}
                  style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.72 }]}
                >
                  <Text style={styles.primaryActionText}>Reopen task</Text>
                </Pressable>
                {onViewGoal ? (
                  <Pressable
                    onPress={onViewGoal}
                    accessibilityRole="button"
                    accessibilityLabel={`View linked goal for ${task.title}`}
                    style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.72 }]}
                  >
                    <Text style={styles.secondaryActionText}>View linked Goal</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: "Delete task?",
                        message: "This cannot be undone.",
                        confirmLabel: "Delete",
                        destructive: true,
                      });
                      if (!ok) return;
                      onDelete(task._id);
                    })();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${task.title}`}
                  style={({ pressed }) => [styles.destructiveAction, pressed && { opacity: 0.72 }]}
                >
                  <Text style={styles.destructiveActionText}>Delete task</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.backdrop,
  },
  sheet: {
    maxHeight: "86%",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.bgCard,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.borderSubtle,
    marginBottom: spacing.xs,
  },
  kicker: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  description: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  metaCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
  },
  metaRow: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  metaLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  actionGroup: {
    gap: spacing.sm,
  },
  primaryAction: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    backgroundColor: colors.success,
  },
  primaryActionText: {
    ...typography.bodyLg,
    color: colors.textInverse,
    fontFamily: typography.title.fontFamily,
  },
  secondaryAction: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  secondaryActionText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontFamily: typography.title.fontFamily,
  },
  destructiveAction: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    backgroundColor: colors.errorMuted,
  },
  destructiveActionText: {
    ...typography.bodyMd,
    color: colors.error,
    fontFamily: typography.title.fontFamily,
  },
});
