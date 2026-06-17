import {
  forwardRef,
  useCallback,
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
import { isTaskCompleted, isTaskOnTimeline } from "../lib/taskState";
import { humanDate } from "../lib/dates";
import type { Id } from "../../../../convex/_generated/dataModel";
import { TaskMetaFields } from "./TaskMetaFields";
import { formatTime12h, type TaskPriority } from "../lib/task-form";
import { useConfirm } from "../hooks/useConfirm";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useGoals } from "../hooks/useGoals";
import { goalLinksStore } from "../lib/goalLinks";
import { useGoalMutations } from "../hooks/useGoalMutations";

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
    time?: string;
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
    const openSeqRef = useRef(0);
    const confirm = useConfirm();
    const { goals } = useGoals();
    const { setGoalLink } = useGoalMutations();

    const [visible, setVisible] = useState(false);
    // Tasks open read-only (like Goals); editing is an explicit, deliberate step.
    const [mode, setMode] = useState<"view" | "edit">("view");
    const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);
    const [taskState, setTaskState] = useState<"inbox" | "timeline" | "completed" | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [time, setTime] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showGoalPicker, setShowGoalPicker] = useState(false);
    const [initialDraft, setInitialDraft] = useState<{
      title: string;
      description: string;
      deadline: string;
      time: string;
      priority: TaskPriority;
      goalId: string | null;
    } | null>(null);
    const [draftGoalId, setDraftGoalId] = useState<string | null>(null);

    const closeModal = useCallback(
      (notify = true) => {
        Keyboard.dismiss();
        setVisible(false);
        setMode("view");
        setTaskId(null);
        setTaskState(null);
        setTime("");
        setInitialDraft(null);
        setDraftGoalId(null);
        setShowGoalPicker(false);
        if (notify) onSheetChange?.(false);
      },
      [onSheetChange]
    );

    useImperativeHandle(ref, () => ({
      open: (task: MobileTask) => {
        const seq = openSeqRef.current + 1;
        openSeqRef.current = seq;
        void goalLinksStore.hydrate().then(() => {
          if (openSeqRef.current !== seq) return;
          const currentGoalId = goalLinksStore.goalFor(String(task._id)) ?? null;
          setTaskId(task._id);
          setTaskState(isTaskCompleted(task) ? "completed" : isTaskOnTimeline(task) ? "timeline" : "inbox");
          setTitle(task.title);
          setDescription(task.description ?? "");
          setDeadline(task.deadline ?? "");
          setTime(task.time ?? "");
          setPriority(task.priority);
          setDraftGoalId(currentGoalId);
          setInitialDraft({
            title: task.title,
            description: task.description ?? "",
            deadline: task.deadline ?? "",
            time: task.time ?? "",
            priority: task.priority,
            goalId: currentGoalId,
          });
          setError(null);
          setMode("view");
          setVisible(true);
          onSheetChange?.(true);
          haptic.light();
        });
      },
      close: () => {
        openSeqRef.current += 1;
        closeModal();
      },
    }), [closeModal, onSheetChange]);

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
        time: deadlineResult.value ? (time.trim() || undefined) : undefined,
        priority,
      });

      setSaving(false);

      if (success) {
        if (initialDraft?.goalId !== draftGoalId) {
          setGoalLink(String(taskId), draftGoalId);
        }
        closeModal();
      }
    }, [taskId, title, description, deadline, time, priority, saving, onSave, isValidDeadline, initialDraft, draftGoalId, closeModal, setGoalLink]);

    const hasUnsavedChanges = useMemo(() => {
      const initial = initialDraft;
      if (!initial || !taskId) return false;
      return (
        title !== initial.title ||
        description !== initial.description ||
        deadline !== initial.deadline ||
        time !== initial.time ||
        priority !== initial.priority ||
        draftGoalId !== initial.goalId
      );
    }, [deadline, description, draftGoalId, initialDraft, priority, taskId, time, title]);

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

    const enterEditMode = useCallback(() => {
      setMode("edit");
    }, []);

    // Leaving edit mode returns to the read-only view, discarding edits (with a
    // guard) rather than closing the whole sheet.
    const exitEditMode = useCallback(async () => {
      if (hasUnsavedChanges) {
        const discard = await confirm({
          title: "Discard changes?",
          message: "You have unsaved edits in this task.",
          confirmLabel: "Discard",
          cancelLabel: "Keep editing",
          destructive: true,
        });
        if (!discard) return;
      }
      if (initialDraft) {
        setTitle(initialDraft.title);
        setDescription(initialDraft.description);
        setDeadline(initialDraft.deadline);
        setTime(initialDraft.time);
        setPriority(initialDraft.priority);
        setDraftGoalId(initialDraft.goalId);
      }
      setError(null);
      setShowGoalPicker(false);
      setMode("view");
    }, [hasUnsavedChanges, confirm, initialDraft]);

    const priorityLabel =
      priority === "p1" ? "P1" : priority === "p2" ? "P2" : priority === "p3" ? "P3" : "None";

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => void requestClose()}
      >
        <KeyboardAvoidingView
          // Android already resizes the modal window for the keyboard. Adding
          // KeyboardAvoidingView's height behavior on top can push the lower
          // edit actions outside the visible card.
          behavior={Platform.OS === "ios" ? "padding" : undefined}
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
              <Text style={styles.sheetKicker}>{mode === "view" ? "Task" : "Edit"}</Text>
              <Text style={styles.sheetTitle}>{mode === "view" ? "Task" : "Edit task"}</Text>

              {mode === "view" ? (
                <View style={styles.viewBlock}>
                  {linkedGoal ? (
                    <View style={styles.viewField}>
                      <Text style={styles.viewFieldLabel}>Goal</Text>
                      <Text style={styles.viewGoalValue}>{linkedGoal.text}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.viewTitle}>{title}</Text>
                  {description.trim() ? (
                    <Text style={styles.viewNotes}>{description.trim()}</Text>
                  ) : null}
                  <View style={styles.viewMetaRow}>
                    <Text style={styles.viewMeta}>
                      {deadline
                        ? time
                          ? `${humanDate(deadline)} · ${formatTime12h(time)}`
                          : humanDate(deadline)
                        : "No date"}
                    </Text>
                    <Text style={styles.viewMetaDot}>·</Text>
                    <Text style={styles.viewMeta}>
                      {priorityLabel === "None" ? "No priority" : priorityLabel}
                    </Text>
                  </View>
                </View>
              ) : null}

              {mode === "edit" && goals.length > 0 ? (
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
                          void (async () => {
                            if (linkedGoalId) {
                              const ok = await confirm({
                                title: "Unlink task from goal?",
                                message: "This task will no longer be linked to its goal.",
                                confirmLabel: "Unlink",
                                cancelLabel: "Keep linked",
                                destructive: true,
                              });
                              if (!ok) return;
                            }
                            setDraftGoalId(null);
                            setShowGoalPicker(false);
                            haptic.light();
                          })();
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

              {mode === "edit" ? (
                <>
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
                time={time}
                priority={priority}
                onDeadlineChange={(v) => {
                  setDeadline(v);
                  if (!v) setTime("");
                }}
                onTimeChange={setTime}
                onPriorityChange={setPriority}
                onClearError={() => setError(null)}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </>
              ) : null}

              {mode === "view" && taskId ? (
                <View style={styles.quickActions}>
                  {taskState === "completed" ? (
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
                      {taskState === "timeline" && onUnschedule ? (
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
                      style={({ pressed }) => [
                        styles.quickActionItem,
                        styles.deleteActionItem,
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.quickActionText, styles.deleteText]}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actions}>
                {mode === "view" ? (
                  <>
                    <Pressable
                      onPress={() => closeModal()}
                      style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.6 }]}
                      hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                    >
                      <Text style={styles.cancelButtonText}>Close</Text>
                    </Pressable>
                    <Pressable
                      onPress={enterEditMode}
                      hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                      accessibilityRole="button"
                      accessibilityLabel="Edit task"
                      style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={styles.primaryButtonText}>Edit</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => void exitEditMode()}
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
                  </>
                )}
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
    justifyContent: "flex-start",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  backdropDim: {
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "78%",
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
  viewBlock: {
    gap: spacing.md,
  },
  viewField: {
    gap: 2,
  },
  viewFieldLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  viewGoalValue: {
    ...typography.bodyMd,
    color: colors.accent,
    fontWeight: "600",
  },
  viewTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  viewNotes: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  viewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  viewMeta: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  viewMetaDot: {
    color: colors.textMuted,
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
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  quickActionItem: {
    minHeight: 36,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  quickActionText: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  deleteText: {
    color: colors.error,
  },
  deleteActionItem: {
    borderColor: colors.error,
    backgroundColor: colors.errorMuted,
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
