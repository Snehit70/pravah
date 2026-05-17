import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { MobileTask } from "./TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TaskMetaFields } from "./TaskMetaFields";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { type TaskPriority } from "../lib/task-form";

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
    const bottomSheetRef = useRef<BottomSheet>(null);
    const insets = useSafeAreaInsets();

    const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);
    const [taskStatus, setTaskStatus] = useState<MobileTask["status"] | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [initialDraft, setInitialDraft] = useState<{
      title: string;
      description: string;
      deadline: string;
      priority: TaskPriority;
    } | null>(null);
    const sheetBottomInset = useKeyboardInset(insets.bottom);

    useImperativeHandle(ref, () => ({
      open: (task: MobileTask) => {
        setTaskId(task._id);
        setTaskStatus(task.status);
        setTitle(task.title);
        setDescription(task.description ?? "");
        setDeadline(task.deadline ?? "");
        setPriority(task.priority);
        setInitialDraft({
          title: task.title,
          description: task.description ?? "",
          deadline: task.deadline ?? "",
          priority: task.priority,
        });
        setError(null);
        bottomSheetRef.current?.expand();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      close: () => {
        bottomSheetRef.current?.close();
      },
    }));

    const handleSave = useCallback(async () => {
      if (!taskId || !title.trim() || saving) return;

      const deadlineResult = isValidDeadline(deadline);
      if (deadlineResult.error) {
        setError(deadlineResult.error);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
        bottomSheetRef.current?.close();
      }
    }, [taskId, title, description, deadline, priority, saving, onSave, isValidDeadline]);

    const hasUnsavedChanges = useMemo(() => {
      const initial = initialDraft;
      if (!initial || !taskId) return false;
      return (
        title !== initial.title ||
        description !== initial.description ||
        deadline !== initial.deadline ||
        priority !== initial.priority
      );
    }, [deadline, description, initialDraft, priority, taskId, title]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          pressBehavior={hasUnsavedChanges ? "none" : "close"}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      ),
      [hasUnsavedChanges]
    );

    const canSave = useMemo(() => Boolean(title.trim()) && !saving, [title, saving]);
    const requestClose = useCallback(() => {
      if (!hasUnsavedChanges) {
        bottomSheetRef.current?.close();
        return;
      }

      Alert.alert("Discard changes?", "You have unsaved edits in this task.", [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => bottomSheetRef.current?.close(),
        },
      ]);
    }, [hasUnsavedChanges]);

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["62%"]}
        detached
        bottomInset={sheetBottomInset}
        style={styles.sheetContainer}
        enablePanDownToClose={!hasUnsavedChanges}
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.indicator}
        backdropComponent={renderBackdrop}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onClose={() => {
          Keyboard.dismiss();
          onSheetChange?.(false);
          setTaskId(null);
          setTaskStatus(null);
          setInitialDraft(null);
        }}
        onChange={(index) => {
          if (index === -1) {
            Keyboard.dismiss();
            setTaskId(null);
            setTaskStatus(null);
            setInitialDraft(null);
          }
          onSheetChange?.(index >= 0);
        }}
      >
        <BottomSheetView style={styles.content}>
          <Text style={styles.sheetKicker}>Edit</Text>
          <Text style={styles.sheetTitle}>Edit task</Text>

          <BottomSheetTextInput
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setError(null);
            }}
            placeholder="Task title"
            placeholderTextColor={colors.textMuted}
            style={styles.titleInput}
          />

          <BottomSheetTextInput
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
                      bottomSheetRef.current?.close();
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
                        bottomSheetRef.current?.close();
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
                        bottomSheetRef.current?.close();
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
                    Alert.alert("Delete task?", "This cannot be undone.", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                          onDelete(taskId);
                          bottomSheetRef.current?.close();
                        },
                      },
                    ]);
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
              onPress={requestClose}
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
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.bgFloating,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  sheetContainer: {
    marginHorizontal: spacing.md,
  },
  indicator: {
    backgroundColor: colors.border,
    width: 36,
    height: 4,
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
