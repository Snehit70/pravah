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
  LayoutChangeEvent,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../lib/haptic";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "./TaskCard";
import { isTaskCompleted, isTaskOnTimeline } from "../lib/taskState";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { TaskPriority } from "../lib/task-form";
import { TaskMetaFields } from "./TaskMetaFields";
import { useConfirm } from "../hooks/useConfirm";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useGoals } from "../hooks/useGoals";
import { goalLinksStore } from "../lib/goalLinks";
import { useGoalMutations } from "../hooks/useGoalMutations";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { QuickScheduleSheet } from "./QuickScheduleSheet";
import {
  CheckIcon,
  CalendarIcon,
  TrashIcon,
  FileTextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "./UiIcons";

export type EditTaskSheetRef = {
  open: (task: MobileTask) => void;
  close: () => void;
};

type UndoPayload = {
  message: string;
  run: () => void;
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
  onScheduleToDate?: (taskId: Id<"tasks">, isoDate: string) => void;
  onUnschedule?: (taskId: Id<"tasks">) => void;
  onDelete?: (taskId: Id<"tasks">) => void;
  onSaveComplete?: (
    undo: UndoPayload,
    task: MobileTask,
    previousState: {
      title: string;
      description: string;
      deadline: string;
      time: string;
      priority: TaskPriority;
      goalId: string | null;
    }
  ) => void;
};

const DESCRIPTION_TRUNCATE_LINES = 4;

export const EditTaskSheet = forwardRef<EditTaskSheetRef, EditTaskSheetProps>(
  function EditTaskSheet(
    {
      onSave,
      isValidDeadline,
      onSheetChange,
      onComplete,
      onReopen,
      onScheduleToDate,
      onUnschedule,
      onDelete,
      onSaveComplete,
    },
    ref
  ) {
    const titleInputRef = useRef<TextInput>(null);
    const openSeqRef = useRef(0);
    const currentTaskRef = useRef<MobileTask | null>(null);
    const confirm = useConfirm();
    const insets = useSafeAreaInsets();
    const reducedMotion = useReducedMotion();
    const { goals } = useGoals();
    const { setGoalLink } = useGoalMutations();

    const [visible, setVisible] = useState(false);
    const [scheduleTarget, setScheduleTarget] = useState<{
      taskId: Id<"tasks">;
      title: string;
    } | null>(null);
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
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const [descriptionHeight, setDescriptionHeight] = useState(0);

    const closeModal = useCallback(
      (notify = true) => {
        Keyboard.dismiss();
        setVisible(false);
        setTaskId(null);
        setTaskState(null);
        setTime("");
        setInitialDraft(null);
        setDraftGoalId(null);
        setShowGoalPicker(false);
        setDescriptionExpanded(false);
        setDescriptionHeight(0);
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
          setTaskState(
            isTaskCompleted(task) ? "completed" : isTaskOnTimeline(task) ? "timeline" : "inbox"
          );
          currentTaskRef.current = task;
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
          setDescriptionExpanded(false);
          setDescriptionHeight(0);
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

        if (onSaveComplete && initialDraft && currentTaskRef.current) {
          const savedTask = currentTaskRef.current;
          const previousState = { ...initialDraft };
          onSaveComplete(
            {
              message: "Changes saved",
              run: () => {},
            },
            savedTask,
            previousState,
          );
        }

        closeModal();
      }
    }, [
      taskId,
      title,
      description,
      deadline,
      time,
      priority,
      saving,
      onSave,
      isValidDeadline,
      initialDraft,
      draftGoalId,
      closeModal,
      setGoalLink,
      onSaveComplete,
    ]);

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

    const canSave = useMemo(() => Boolean(title.trim()) && hasUnsavedChanges && !saving, [title, saving, hasUnsavedChanges]);

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

    const isDescriptionLong = descriptionHeight > DESCRIPTION_TRUNCATE_LINES * 22;

    const onDescriptionLayout = useCallback((e: LayoutChangeEvent) => {
      setDescriptionHeight(e.nativeEvent.layout.height);
    }, []);

    return (
      <>
        <Modal
          visible={visible}
          transparent
          animationType={reducedMotion ? "none" : "slide"}
          statusBarTranslucent
          onRequestClose={() => void requestClose()}
        >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[
            styles.overlay,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}
        >
          <BlurView intensity={38} tint="light" style={StyleSheet.absoluteFill} />
          <Pressable
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
            style={StyleSheet.absoluteFill}
            onPress={() => void requestClose()}
          />

          <View style={styles.card}>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ── Drag handle ── */}
              <View style={styles.handleBar} />

              {/* ── Goal header (only if linked) ── */}
              {linkedGoal ? (
                <View style={styles.goalHeader}>
                  <View style={styles.goalIcon}>
                    <FileTextIcon color={colors.accent} size={20} />
                  </View>
                  <View style={styles.goalHeaderText}>
                    <Text style={styles.goalHeaderLabel}>GOAL</Text>
                    <Text style={styles.goalHeaderText_value}>{linkedGoal.text}</Text>
                  </View>
                </View>
              ) : null}

              {/* ── Title (always editable) ── */}
              <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  setError(null);
                }}
                placeholder="Task title"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Task title"
                style={styles.titleInput}
              />

              <TaskMetaFields
                deadline={deadline}
                time={time}
                priority={priority}
                onDeadlineChange={(value) => {
                  setDeadline(value);
                  setError(null);
                }}
                onTimeChange={setTime}
                onPriorityChange={setPriority}
                onClearError={() => setError(null)}
              />

              {/* ── Goal picker (always available when goals exist) ── */}
              {goals.length > 0 ? (
                <View style={styles.goalSection}>
                  <Pressable
                    onPress={() => setShowGoalPicker((s) => !s)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      linkedGoal ? `Goal: ${linkedGoal.text}. Tap to change.` : "Link to a goal"
                    }
                    accessibilityState={{ expanded: showGoalPicker }}
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
                    {showGoalPicker ? (
                      <ChevronUpIcon color={colors.textMuted} size={14} />
                    ) : (
                      <ChevronDownIcon color={colors.textMuted} size={14} />
                    )}
                  </Pressable>

                  {showGoalPicker ? (
                    <Animated.View
                      entering={reducedMotion ? undefined : FadeIn.duration(150)}
                      exiting={reducedMotion ? undefined : FadeOut.duration(120)}
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
                        accessibilityRole="button"
                        accessibilityState={{ selected: !linkedGoalId }}
                        style={({ pressed }) => [
                          styles.goalOption,
                          !linkedGoalId && styles.goalOptionActive,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.goalOptionText,
                            !linkedGoalId && styles.goalOptionTextActive,
                          ]}
                        >
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
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            style={({ pressed }) => [
                              styles.goalOption,
                              active && styles.goalOptionActive,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.goalOptionText,
                                active && styles.goalOptionTextActive,
                              ]}
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

              {/* ── Description (always editable, truncated) ── */}
              <View>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add notes..."
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Task notes"
                  style={[
                    styles.notesInput,
                    !descriptionExpanded && isDescriptionLong && { height: DESCRIPTION_TRUNCATE_LINES * 22 },
                  ]}
                  multiline
                  numberOfLines={!descriptionExpanded && isDescriptionLong ? DESCRIPTION_TRUNCATE_LINES : undefined}
                  onLayout={!descriptionExpanded ? onDescriptionLayout : undefined}
                  textAlignVertical="top"
                />
                {isDescriptionLong && !descriptionExpanded ? (
                  <Pressable
                    onPress={() => setDescriptionExpanded(true)}
                    hitSlop={8}
                    style={styles.expandButton}
                    accessibilityRole="button"
                    accessibilityLabel="Show full notes"
                  >
                    <Text style={styles.expandButtonText}>Show more</Text>
                  </Pressable>
                ) : null}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* ── Action buttons ── */}
              {taskId ? (
                <View style={styles.quickActions}>
                  {taskState === "completed" ? (
                    onReopen ? (
                      <Pressable
                        onPress={() => {
                          onReopen(taskId);
                          closeModal();
                        }}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Reopen Task"
                        style={({ pressed }) => [
                          styles.quickActionItem,
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <CheckIcon color={colors.success} size={16} />
                        <Text style={[styles.quickActionText, { color: colors.success }]}>
                          Reopen
                        </Text>
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
                          accessibilityRole="button"
                          accessibilityLabel="Complete Task"
                          style={({ pressed }) => [
                            styles.quickActionItem,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <CheckIcon color={colors.success} size={16} />
                          <Text style={[styles.quickActionText, { color: colors.success }]}>
                            Complete
                          </Text>
                        </Pressable>
                      ) : null}
                      {taskState === "timeline" && onUnschedule ? (
                        <Pressable
                          onPress={() => {
                            onUnschedule(taskId);
                            closeModal();
                          }}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel="Move Task to Inbox"
                          style={({ pressed }) => [
                            styles.quickActionItem,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <CalendarIcon color={colors.warning} size={16} />
                          <Text style={[styles.quickActionText, { color: colors.warning }]}>
                            Unschedule
                          </Text>
                        </Pressable>
                      ) : null}
                      {taskState === "inbox" && onScheduleToDate ? (
                        <Pressable
                          onPress={() => {
                            setScheduleTarget({ taskId, title });
                            closeModal();
                          }}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel="Schedule Task"
                          style={({ pressed }) => [
                            styles.quickActionItem,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <CalendarIcon color={colors.warning} size={16} />
                          <Text style={[styles.quickActionText, { color: colors.warning }]}>
                            Schedule
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  )}
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
                      accessibilityRole="button"
                      accessibilityLabel="Delete Task"
                      style={({ pressed }) => [
                        styles.quickActionItem,
                        styles.deleteActionItem,
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <TrashIcon color={colors.error} size={16} />
                      <Text style={[styles.quickActionText, styles.deleteText]}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {/* ── Save button (dirty state only) ── */}
              {hasUnsavedChanges ? (
                <Pressable
                  onPress={() => void handleSave()}
                  disabled={!canSave}
                  hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                  accessibilityRole="button"
                  accessibilityLabel={saving ? "Saving Task" : "Save Task"}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    !canSave && styles.primaryButtonDisabled,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      !canSave && styles.primaryButtonTextDisabled,
                    ]}
                  >
                    {saving ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
        </Modal>
        <QuickScheduleSheet
          visible={scheduleTarget !== null}
          taskTitle={scheduleTarget?.title}
          onClose={() => setScheduleTarget(null)}
          onPick={(isoDate) => {
            if (scheduleTarget) onScheduleToDate?.(scheduleTarget.taskId, isoDate);
          }}
        />
      </>
    );
  }
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "92%",
    backgroundColor: colors.bg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  goalHeaderText: {
    gap: 1,
  },
  goalHeaderLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  goalHeaderText_value: {
    ...typography.bodyMd,
    color: colors.accent,
    fontWeight: "600",
  },
  titleInput: {
    color: colors.textPrimary,
    ...typography.headline,
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
  notesInput: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    minHeight: 60,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    textAlignVertical: "top",
  },
  expandButton: {
    paddingVertical: spacing.xs,
  },
  expandButtonText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontWeight: "600",
  },
  errorText: {
    ...typography.bodyMd,
    color: colors.error,
  },
  quickActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  quickActionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
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
    fontWeight: "700",
  },
  deleteText: {
    color: colors.error,
  },
  deleteActionItem: {
    borderColor: colors.error,
    backgroundColor: colors.errorMuted,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
    marginTop: spacing.sm,
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
