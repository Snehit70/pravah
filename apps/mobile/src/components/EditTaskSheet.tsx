import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
  }) => Promise<boolean>;
  isValidDeadline: (raw: string) => { value?: string; error?: string };
  onSheetChange?: (isOpen: boolean) => void;
};

export const EditTaskSheet = forwardRef<EditTaskSheetRef, EditTaskSheetProps>(
  function EditTaskSheet({ onSave, isValidDeadline, onSheetChange }, ref) {
    const bottomSheetRef = useRef<BottomSheet>(null);

    const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      open: (task: MobileTask) => {
        setTaskId(task._id);
        setTitle(task.title);
        setDescription(task.description ?? "");
        setDeadline(task.deadline ?? "");
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
      });

      setSaving(false);

      if (success) {
        bottomSheetRef.current?.close();
      }
    }, [taskId, title, description, deadline, saving, onSave, isValidDeadline]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      ),
      []
    );

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["55%"]}
        enablePanDownToClose
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.indicator}
        backdropComponent={renderBackdrop}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onChange={(index) => {
          onSheetChange?.(index >= 0);
        }}
      >
        <BottomSheetView style={styles.content}>
          <Text style={styles.sheetTitle}>Edit task</Text>

          <BottomSheetTextInput
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setError(null);
            }}
            placeholder="Task title"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <BottomSheetTextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Notes"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.notesInput]}
            multiline
          />

          <BottomSheetTextInput
            value={deadline}
            onChangeText={(text) => {
              setDeadline(text);
              setError(null);
            }}
            placeholder="Deadline YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.helperText}>Use YYYY-MM-DD, for example 2026-04-20.</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => bottomSheetRef.current?.close()}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={saving || !title.trim()}
              style={({ pressed }) => [
                styles.saveButton,
                (saving || !title.trim()) && styles.saveButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.saveButtonText}>
                {saving ? "Saving..." : "Save"}
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
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
  },
  indicator: {
    backgroundColor: colors.textMuted,
    width: 36,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  input: {
    backgroundColor: colors.bgInput,
    color: colors.textPrimary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  errorText: {
    color: colors.error,
    ...typography.caption,
  },
  helperText: {
    color: colors.textMuted,
    ...typography.caption,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cancelButton: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontWeight: "700",
  },
  saveButton: {
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.primaryDark,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.85,
  },
});
