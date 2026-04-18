import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
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
type TaskPriority = "p1" | "p2" | "p3" | undefined;

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value?: string): Date {
  if (!value) return new Date();
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

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
};

export const EditTaskSheet = forwardRef<EditTaskSheetRef, EditTaskSheetProps>(
  function EditTaskSheet({ onSave, isValidDeadline, onSheetChange }, ref) {
    const bottomSheetRef = useRef<BottomSheet>(null);

    const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    useImperativeHandle(ref, () => ({
      open: (task: MobileTask) => {
        setTaskId(task._id);
        setTitle(task.title);
        setDescription(task.description ?? "");
        setDeadline(task.deadline ?? "");
        setPriority(task.priority);
        setError(null);
        setShowDatePicker(false);
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

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          pressBehavior="close"
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
        onClose={() => {
          Keyboard.dismiss();
          onSheetChange?.(false);
          setShowDatePicker(false);
        }}
        onChange={(index) => {
          if (index === -1) {
            Keyboard.dismiss();
            setShowDatePicker(false);
          }
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

          <View style={styles.deadlineRow}>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setShowDatePicker(true);
              }}
              style={({ pressed }) => [styles.deadlineField, pressed && styles.pressed]}
            >
              <Text style={deadline ? styles.deadlineValue : styles.deadlinePlaceholder}>
                {deadline || "Pick deadline"}
              </Text>
            </Pressable>
            {deadline ? (
              <Pressable
                onPress={() => {
                  setDeadline("");
                  setError(null);
                }}
                style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          {showDatePicker ? (
            <DateTimePicker
              value={parseIsoDate(deadline)}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_event, selectedDate) => {
                if (Platform.OS === "android") {
                  setShowDatePicker(false);
                }
                if (selectedDate) {
                  setDeadline(formatLocalDate(selectedDate));
                  setError(null);
                }
              }}
            />
          ) : null}

          <View style={styles.priorityRow}>
            <Text style={styles.priorityLabel}>Priority</Text>
            <View style={styles.priorityChips}>
              <Pressable
                onPress={() => setPriority(undefined)}
                style={({ pressed }) => [
                  styles.priorityChip,
                  priority === undefined && styles.priorityChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.priorityChipText, priority === undefined && styles.priorityChipTextActive]}>
                  None
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPriority("p1")}
                style={({ pressed }) => [
                  styles.priorityChip,
                  priority === "p1" && styles.priorityChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.priorityChipText, priority === "p1" && styles.priorityChipTextActive]}>
                  P1
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPriority("p2")}
                style={({ pressed }) => [
                  styles.priorityChip,
                  priority === "p2" && styles.priorityChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.priorityChipText, priority === "p2" && styles.priorityChipTextActive]}>
                  P2
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPriority("p3")}
                style={({ pressed }) => [
                  styles.priorityChip,
                  priority === "p3" && styles.priorityChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.priorityChipText, priority === "p3" && styles.priorityChipTextActive]}>
                  P3
                </Text>
              </Pressable>
            </View>
          </View>

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
  priorityRow: {
    gap: spacing.xs,
  },
  priorityLabel: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  priorityChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  priorityChip: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgInput,
  },
  priorityChipActive: {
    borderColor: colors.chipActiveBorder,
    backgroundColor: colors.chipActive,
  },
  priorityChipText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: "700",
  },
  priorityChipTextActive: {
    color: colors.accent,
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  deadlineField: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deadlinePlaceholder: {
    color: colors.textMuted,
    fontSize: 13,
  },
  deadlineValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  clearButton: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearButtonText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: "700",
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
