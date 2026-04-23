import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
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

function nextPriority(current: TaskPriority): TaskPriority {
  if (current === undefined) return "p1";
  if (current === "p1") return "p2";
  if (current === "p2") return "p3";
  return undefined;
}

function priorityDotColor(p: TaskPriority): string {
  if (p === "p1") return colors.priorityP1;
  if (p === "p2") return colors.priorityP2;
  if (p === "p3") return colors.priorityP3;
  return colors.borderSubtle;
}

function priorityLabel(p: TaskPriority): string {
  if (p === "p1") return "P1";
  if (p === "p2") return "P2";
  if (p === "p3") return "P3";
  return "—";
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

    const canSave = useMemo(() => Boolean(title.trim()) && !saving, [title, saving]);

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={["62%"]}
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

          <View style={styles.metaRow}>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setShowDatePicker(true);
              }}
              style={({ pressed }) => [styles.metaField, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.metaLabel}>Due</Text>
              <Text style={deadline ? styles.metaValue : styles.metaPlaceholder}>
                {deadline || "—"}
              </Text>
            </Pressable>

            {deadline ? (
              <Pressable
                onPress={() => {
                  setDeadline("");
                  setError(null);
                }}
                style={({ pressed }) => [styles.clearAction, pressed && { opacity: 0.6 }]}
                hitSlop={8}
              >
                <Text style={styles.clearActionText}>Clear</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                setPriority(nextPriority(priority));
                void Haptics.selectionAsync();
              }}
              style={({ pressed }) => [styles.metaField, pressed && { opacity: 0.6 }]}
              hitSlop={6}
            >
              <Text style={styles.metaLabel}>Priority</Text>
              <View style={styles.priorityValue}>
                <View style={[styles.priorityDot, { backgroundColor: priorityDotColor(priority) }]} />
                <Text style={priority ? styles.metaValue : styles.metaPlaceholder}>
                  {priorityLabel(priority)}
                </Text>
              </View>
            </Pressable>
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

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => bottomSheetRef.current?.close()}
              style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSave && styles.primaryButtonDisabled,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.primaryButtonText}>{saving ? "Saving…" : "Save"}</Text>
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
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xl,
  },
  metaField: {
    gap: 4,
  },
  metaLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  metaValue: {
    ...typography.numeric,
    color: colors.textPrimary,
  },
  metaPlaceholder: {
    ...typography.numeric,
    color: colors.textMuted,
  },
  priorityValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  priorityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  clearAction: {
    paddingBottom: 2,
  },
  clearActionText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.bodyMd,
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  cancelButtonText: {
    ...typography.title,
    color: colors.textSecondary,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    ...typography.title,
    color: colors.bg,
  },
});
