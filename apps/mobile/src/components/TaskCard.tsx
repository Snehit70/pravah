import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { Id } from "../../../../convex/_generated/dataModel";

export type MobileTask = {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  deadline?: string;
  status: "inbox" | "scheduled" | "completed" | "cancelled";
  scheduledDate?: string;
  position: number;
  updatedAt: number;
};

type TaskCardProps = {
  task: MobileTask;
  index: number;
  dateLabel?: string;
  onDone: (id: Id<"tasks">) => void;
  onMoveToday?: (id: Id<"tasks">) => void;
  onSendToInbox?: (id: Id<"tasks">) => void;
  onReopen?: (id: Id<"tasks">) => void;
  onEdit: (task: MobileTask) => void;
};

function TaskCardInner({
  task,
  index: _index,
  dateLabel: dateLabelText,
  onDone,
  onMoveToday,
  onSendToInbox,
  onReopen,
  onEdit,
}: TaskCardProps) {
  const isCompleted = task.status === "completed";
  const canEdit = !isCompleted;

  const handleDone = useCallback(() => onDone(task._id), [onDone, task._id]);
  const handleMoveToday = useCallback(
    () => onMoveToday?.(task._id),
    [onMoveToday, task._id]
  );
  const handleSendToInbox = useCallback(
    () => onSendToInbox?.(task._id),
    [onSendToInbox, task._id]
  );
  const handleReopen = useCallback(
    () => onReopen?.(task._id),
    [onReopen, task._id]
  );
  const handleEdit = useCallback(() => onEdit(task), [onEdit, task]);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, isCompleted && styles.completedCard]}>
        {!isCompleted ? (
          <Pressable onPress={handleDone} style={styles.checkbox} hitSlop={8}>
            <View style={styles.checkboxInner} />
          </Pressable>
        ) : (
          <View style={[styles.checkbox, styles.checkboxDone]}>
            <Text style={styles.checkIcon}>v</Text>
          </View>
        )}

        <Pressable onPress={canEdit ? handleEdit : undefined} style={styles.textArea} disabled={!canEdit}>
          <Text
            style={[styles.title, isCompleted && styles.completedTitle]}
            numberOfLines={2}
          >
            {task.title}
          </Text>

          <View style={styles.metaRow}>
            {dateLabelText && !isCompleted ? (
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{dateLabelText}</Text>
              </View>
            ) : null}
            {task.deadline && !isCompleted ? (
              <View style={styles.deadlineBadge}>
                <Text style={styles.deadlineBadgeText}>Due {task.deadline}</Text>
              </View>
            ) : null}
          </View>

          {task.description && !isCompleted ? (
            <Text style={styles.description} numberOfLines={2}>
              {task.description}
            </Text>
          ) : null}

          <View style={styles.actionsRow}>
            {canEdit ? (
              <Pressable onPress={handleEdit} style={styles.ghostButton}>
                <Text style={styles.ghostButtonText}>Edit</Text>
              </Pressable>
            ) : null}
            {isCompleted ? (
              <Pressable onPress={handleReopen} style={styles.ghostButton}>
                <Text style={styles.ghostButtonText}>Reopen</Text>
              </Pressable>
            ) : task.status === "inbox" ? (
              <Pressable onPress={handleMoveToday} style={styles.ghostButton}>
                <Text style={styles.ghostButtonText}>Today</Text>
              </Pressable>
            ) : (
              <Pressable onPress={handleSendToInbox} style={styles.ghostButton}>
                <Text style={styles.ghostButtonText}>Inbox</Text>
              </Pressable>
            )}
            {!isCompleted ? (
              <Pressable onPress={handleDone} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export const TaskCard = memo(TaskCardInner);

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.md,
    paddingVertical: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    gap: spacing.md,
  },
  completedCard: {
    backgroundColor: "#101b2b",
    borderColor: colors.borderSubtle,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "transparent",
  },
  checkboxDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkIcon: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
  },
  textArea: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.textPrimary,
    ...typography.body,
  },
  completedTitle: {
    color: colors.textCompleted,
    textDecorationLine: "line-through",
  },
  metaRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  dateBadge: {
    backgroundColor: colors.chipActive,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dateBadgeText: {
    color: colors.accent,
    ...typography.caption,
  },
  deadlineBadge: {
    backgroundColor: colors.errorBg,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  deadlineBadgeText: {
    color: "#fca5a5",
    ...typography.caption,
  },
  description: {
    color: colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  ghostButton: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ghostButtonText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: "700",
  },
  primaryButton: {
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  primaryButtonText: {
    color: colors.primaryDark,
    ...typography.caption,
    fontWeight: "800",
  },
});
