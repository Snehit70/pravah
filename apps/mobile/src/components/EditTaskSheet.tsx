import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { haptic } from "../lib/haptic";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "./TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";
import { TaskMetaFields } from "./TaskMetaFields";
import { type TaskPriority } from "../lib/task-form";
import { useConfirm } from "../hooks/useConfirm";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useGoalLinks, useGoals } from "../hooks/useGoals";
import { goalLinksStore } from "../lib/goalLinks";

export type EditTaskSheetRef = {
  open: (task: MobileTask) => void;
  close: () => void;
};

type EditTaskSheetProps = {
  onSave: (data: {
    taskId: Id<"tasks">;
    title: string;
    description?: string;
    deadline?: string;
    priority?: TaskPriority;
  }) => Promise<boolean>;
  isValidDeadline: (raw: string) => { value?: string; error?: string };
  onSheetChange?: (isOpen: boolean) => void;
  onComplete?: (taskId: Id<"tasks">) => void;
  onReopen?: (taskId: Id<"tasks">) => void;
  onUnschedule?: (taskId: Id<"tasks">) => void;
  onDelete?: (taskId: Id<"tasks">) => void;
};

export const EditTaskSheet = forwardRef<EditTaskSheetRef, EditTaskSheetProps>(
  function EditTaskSheet(
    { onSave, isValidDeadline, onSheetChange, onComplete, onReopen, onUnschedule, onDelete },
    ref
  ) {
    const titleInputRef = useRef<TextInput>(null);
    const confirm = useConfirm();
    const links = useGoalLinks();
    const { goals } = useGoals();

    const [visible, setVisible] = useState(false);
    const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);
    const [taskStatus, setTaskStatus] = useState<MobileTask["status"] | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showGoalPicker, setShowGoalPicker] = useState(false);
    const [initialDraft, setInitialDraft] = useState<{
      title: string;
      description: string;
      deadline: string;
      priority: TaskPriority;
      goalId: string | null;
    } | null>(null);
    const [draftGoalId, setDraftGoalId] = useState<string | null>(null);

    const closeModal = useCallback(
      (notify = true) => {
        Keyboard.dismiss();
        setVisible(false);
        setTaskId(null);
        setTaskStatus(null);
        setInitialDraft(null);
        setDraftGoalId(null);
        setShowGoalPicker(false);
        if (notify) onSheetChange?.(false);
      },
      [onSheetChange]
    );

    useImperativeHandle(ref, () => ({
      open: (task: MobileTask) => {
        setTaskId(task._id);
        setTaskStatus(task.status);
        setTitle(task.title);
        setDescription(task.description ?? "");
        setDeadline(task.deadline ?? "");
        setPriority(task.priority);
        const currentGoalId = links[String(task._id)] ?? null;
        setDraftGoalId(currentGoalId);
        setInitialDraft({
          title: task.title,
          description: task.description ?? "",
          deadline: task.deadline ?? "",
          priority: task.priority,
          goalId: currentGoalId,
        });
        setError(null);
        setVisible(true);
        onSheetChange?.(true);
        haptic.light();
      },
      close: () => {
        closeModal();
      },
    }));

    useEffect(() => {
      if (!visible) return;
      const t = setTimeout(() => titleInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }, [visible]);

    const handleSave = useCallback(async () => {
      if (!taskId || !title.trim() || saving) return;

      const deadlineResult = isValidDeadline(deadline);
      if (deadlineResult.error) {
        setError(deadlineResult.error);
        haptic.error();
        return;
      }

      setSaving(true);
      setError(null);

      const success = await onSave({
        taskId,
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadlineResult.value,
        priority,
      });

      setSaving(false);

      if (success) {
        if (initialDraft?.goalId !== draftGoalId) {
          goalLinksStore.setLink(String(taskId), draftGoalId);
        }
        closeModal();
      }
    }, [taskId, title, description, deadline, priority, saving, onSave, isValidDeadline, initialDraft, draftGoalId, closeModal]);

    const hasUnsavedChanges = useMemo(() => {
      const initial = initialDraft;
      if (!initial || !taskId) return false;
      return (
        title !== initial.title ||
        description !== initial.description ||
        deadline !== initial.deadline ||
        priority !== initial.priority ||
        draftGoalId !== initial.goalId
      );
    }, [deadline, description, draftGoalId, initialDraft, priority, taskId, title]);

    const canSave = useMemo(() => Boolean(title.trim()) && !saving, [title, saving]);

    const linkedGoalId = taskId ? draftGoalId : null;
    const linkedGoal = linkedGoalId ? goals.find((g) => g.id === linkedGoalId) ?? null : null;

    const requestClose = useCallback(async () => {
      if (!hasUnsavedChanges) {
        closeModal();
        return;
      }
      const discard = await confirm({
        title: "Discard changes?",
        message: "You have unsaved edits in this task.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        destructive: true,
      });
      if (discard) closeModal();
    }, [hasUnsavedChanges, confirm, closeModal]);

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => void requestClose()}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.overlay}
        >
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
          {!hasUnsavedChanges ? (
            <Pressable
              accessibilityLabel="Dismiss"
              style={StyleSheet.absoluteFill}
              onPress={() => void requestClose()}
            />
          ) : null}

          <View style={styles.card}>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sheetKicker}>Edit</Text>
              <Text style={styles.sheetTitle}>Edit task</Text>

              {goals.length > 0 ? (
                <View style={styles.goalSection}>
                  <Pressable
                    onPress={() => setShowGoalPicker((s) => !s)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={linkedGoal ? `Goal: ${linkedGoal.text}. Tap to change.` : "Link to a goal"}
                    style={({ pressed }) => [
                      styles.goalChip,
                      linkedGoal && styles.goalChipActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.goalChipKicker}>Goal</Text>
                    <Text
                      style={[styles.goalChipValue, linkedGoal && styles.goalChipValueActive]}
                      numberOfLines={1}
                    >
                      {linkedGoal ? linkedGoal.text : "None"}
                    </Text>
                    <Text style={styles.goalChipCaret}>{showGoalPicker ? "▾" : "▸"}</Text>
                  </Pressable>

                  {showGoalPicker ? (
                    <Animated.View
                      entering={FadeIn.duration(150)}
                      exiting={FadeOut.duration(120)}
                      style={styles.goalPicker}
                    >
                      <Pressable
                        onPress={() => {
                          setDraftGoalId(null);
                          setShowGoalPicker(false);
                          haptic.light();
                        }}
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.goalOption,
                          !linkedGoalId && styles.goalOptionActive,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={[styles.goalOptionText, !linkedGoalId && styles.goalOptionTextActive]}>
                          No goal
                        </Text>
                      </Pressable>
                      {goals.map((g) => {
                        const active = g.id === linkedGoalId;
                        return (
                          <Pressable
                            key={g.id}
                            onPress={() => {
                              setDraftGoalId(g.id);
                              setShowGoalPicker(false);
                              haptic.light();
                            }}
                            hitSlop={8}
                            style={({ pressed }) => [
                              styles.goalOption,
                              active && styles.goalOptionActive,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <Text
                              style={[styles.goalOptionText, active && styles.goalOptionTextActive]}
                              numberOfLines={2}
                            >
                              {g.text}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </Animated.View>
                  ) : null}
                </View>
              ) : null}

              <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  setError(null);
                }}
                placeholder="Task title"
                placeholderTextColor={colors.textMuted}
                style={styles.titleInput}
              />

              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Notes"
                placeholderTextColor={colors.textMuted}
                style={styles.notesInput}
                multiline
              />

              <TaskMetaFields
                key={taskId ?? "edit-task-meta-fields-closed"}
                deadline={deadline}
                priority={priority}
                onDeadlineChange={setDeadline}
                onPriorityChange={setPriority}
                onClearError={() => setError(null)}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {taskId ? (
                <View style={styles.quickActions}>
                  {taskStatus === "completed" ? (
                    onReopen ? (
                      <Pressable
                        onPress={() => {
                          onReopen(taskId);
                          closeModal();
                        }}
                        hitSlop={12}
                        style={({ pressed }) => [styles.quickActionItem, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.quickActionText}>Reopen</Text>
                      </Pressable>
                    ) : null
                  ) : (
                    <>
                      {onComplete ? (
                        <Pressable
                          onPress={() => {
                            onComplete(taskId);
                            closeModal();
                          }}
                          hitSlop={12}
                          style={({ pressed }) => [styles.quickActionItem, pressed && { opacity: 0.6 }]}
                        >
                          <Text style={styles.quickActionText}>Complete</Text>
                        </Pressable>
                      ) : null}
                      {taskStatus === "scheduled" && onUnschedule ? (
                        <Pressable
                          onPress={() => {
                            onUnschedule(taskId);
                            closeModal();
                          }}
                          hitSlop={12}
                          style={({ pressed }) => [styles.quickActionItem, pressed && { opacity: 0.6 }]}
                        >
                          <Text style={styles.quickActionText}>Unschedule</Text>
                        </Pressable>
                      ) : null}
                    </>
                  )}
                  <View style={{ flex: 1 }} />
                  {onDelete ? (
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
                          onDelete(taskId);
                          closeModal();
                        })();
                      }}
                      hitSlop={12}
                      style={({ pressed }) => [styles.quickActionItem, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[styles.quickActionText, styles.deleteText]}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  onPress={() => void requestClose()}
                  style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.6 }]}
                  hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleSave()}
                  disabled={!canSave}
                  hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    !canSave && styles.primaryButtonDisabled,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.primaryButtonText, !canSave && styles.primaryButtonTextDisabled]}>
                    {saving ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  backdropDim: {
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    backgroundColor: colors.bg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  sheetKicker: {
    ...typography.micro,
    color: colors.textMuted,
  },
  sheetTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginTop: -spacing.sm,
  },
  goalSection: {
    gap: spacing.sm,
  },
  goalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  goalChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  goalChipKicker: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  goalChipValue: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  goalChipValueActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  goalChipCaret: {
    ...typography.micro,
    color: colors.textMuted,
  },
  goalPicker: {
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  goalOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  goalOptionActive: {
    backgroundColor: colors.accentSoft,
  },
  goalOptionText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  goalOptionTextActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  titleInput: {
    color: colors.textPrimary,
    ...typography.bodyLg,
    fontSize: 17,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  notesInput: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    minHeight: 80,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    textAlignVertical: "top",
  },
  errorText: {
    ...typography.bodyMd,
    color: colors.error,
  },
  quickActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  quickActionItem: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    justifyContent: "center",
  },
  quickActionText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  deleteText: {
    color: colors.error,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  cancelButton: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
  },
  cancelButtonText: {
    ...typography.title,
    color: colors.textSecondary,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: colors.border,
  },
  primaryButtonText: {
    ...typography.title,
    color: colors.bg,
  },
  primaryButtonTextDisabled: {
    color: colors.textMuted,
  },
});
