import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TaskMetaFields } from "./TaskMetaFields";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { type TaskPriority } from "../lib/task-form";

type ComposerMode = "inbox" | "today";

export type AddTaskSheetRef = {
  open: () => void;
  close: () => void;
};

type AddTaskSheetProps = {
  onAdd: (data: {
    title: string;
    description?: string;
    deadline?: string;
    mode: ComposerMode;
    priority?: TaskPriority;
  }) => Promise<boolean>;
  isValidDeadline: (raw: string) => { value?: string; error?: string };
  onSheetChange?: (isOpen: boolean) => void;
};

export const AddTaskSheet = forwardRef<AddTaskSheetRef, AddTaskSheetProps>(
  function AddTaskSheet({ onAdd, isValidDeadline, onSheetChange }, ref) {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const insets = useSafeAreaInsets();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [mode, setMode] = useState<ComposerMode>("inbox");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [saving, setSaving] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [focusNonce, setFocusNonce] = useState(0);
    const sheetBottomInset = useKeyboardInset(insets.bottom);

    useImperativeHandle(ref, () => ({
      open: () => {
        bottomSheetRef.current?.expand();
        setFocusNonce((v) => v + 1);
      },
      close: () => {
        bottomSheetRef.current?.close();
      },
    }));

    const reset = () => {
      setTitle("");
      setDescription("");
      setDeadline("");
      setPriority(undefined);
      setShowDetails(false);
      setError(null);
    };

    const handleAdd = useCallback(async () => {
      const trimmed = title.trim();
      if (!trimmed || saving) return;

      const deadlineResult = isValidDeadline(deadline);
      if (deadlineResult.error) {
        setError(deadlineResult.error);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setSaving(true);
      setError(null);

      const success = await onAdd({
        title: trimmed,
        description: description.trim() || undefined,
        deadline: deadlineResult.value,
        mode,
        priority,
      });

      setSaving(false);

      if (success) {
        reset();
        bottomSheetRef.current?.close();
      }
    }, [title, description, deadline, mode, priority, saving, onAdd, isValidDeadline]);

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

    const canSubmit = useMemo(() => Boolean(title.trim()) && !saving, [title, saving]);

    return (
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={showDetails ? ["72%"] : ["52%"]}
        detached
        bottomInset={sheetBottomInset}
        style={styles.sheetContainer}
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
          reset();
        }}
        onChange={(index) => {
          onSheetChange?.(index >= 0);
          if (index === -1) {
            Keyboard.dismiss();
            reset();
          }
        }}
      >
        <BottomSheetView style={styles.content}>
          <Text style={styles.sheetKicker}>Capture</Text>
          <Text style={styles.sheetTitle}>New task</Text>

          <BottomSheetTextInput
            key={`title-input-${focusNonce}`}
            autoFocus
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setError(null);
            }}
            placeholder="What needs to be done?"
            placeholderTextColor={colors.textMuted}
            style={styles.titleInput}
            returnKeyType="done"
            onSubmitEditing={() => void handleAdd()}
          />

          {/* Mode — segmented control as two mono labels with an underline
              under the active segment. Mirrors the bottom-tab language. */}
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setMode("inbox")}
              style={({ pressed }) => [styles.modeItem, pressed && { opacity: 0.6 }]}
              hitSlop={6}
            >
              <Text style={[styles.modeText, mode === "inbox" && styles.modeTextActive]}>Inbox</Text>
              <View style={[styles.modeRule, mode === "inbox" && styles.modeRuleActive]} />
            </Pressable>
            <Pressable
              onPress={() => setMode("today")}
              style={({ pressed }) => [styles.modeItem, pressed && { opacity: 0.6 }]}
              hitSlop={6}
            >
              <Text style={[styles.modeText, mode === "today" && styles.modeTextActive]}>Today</Text>
              <View style={[styles.modeRule, mode === "today" && styles.modeRuleActive]} />
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable
              onPress={() => setShowDetails(!showDetails)}
              style={({ pressed }) => [styles.detailsToggle, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Text style={styles.detailsToggleText}>{showDetails ? "Less" : "More"}</Text>
            </Pressable>
          </View>

          {showDetails ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              style={styles.detailsSection}
            >
              <BottomSheetTextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Notes (optional)"
                placeholderTextColor={colors.textMuted}
                style={styles.notesInput}
                multiline
              />

              {/* Due + priority live on one quiet row — two labeled fields
                  with no pills, borders, or chips. */}
              <TaskMetaFields
                key="add-task-meta-fields"
                deadline={deadline}
                priority={priority}
                onDeadlineChange={setDeadline}
                onPriorityChange={setPriority}
                onClearError={() => setError(null)}
              />
            </Animated.View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            onPress={() => void handleAdd()}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.primaryButton,
              !canSubmit && styles.primaryButtonDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.primaryButtonText, !canSubmit && styles.primaryButtonTextDisabled]}>
              {saving ? "Adding…" : "Add task"}
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  // Sheet surface — one enclosure (earned, because it's a modal). No side
  // borders or extra radius beyond the standard bottom-sheet top corners.
  sheetBg: {
    backgroundColor: colors.bgCard,
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

  // Header
  sheetKicker: {
    ...typography.micro,
    color: colors.textMuted,
  },
  sheetTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginTop: -spacing.sm,
  },

  // Title input — bottom rule only, no bordered box.
  titleInput: {
    color: colors.textPrimary,
    ...typography.bodyLg,
    fontSize: 17,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  // Mode segmented control
  modeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.lg,
  },
  modeItem: {
    paddingBottom: 4,
    alignItems: "center",
  },
  modeText: {
    ...typography.title,
    color: colors.textMuted,
  },
  modeTextActive: {
    color: colors.textPrimary,
  },
  modeRule: {
    marginTop: 6,
    height: 2,
    width: 22,
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  modeRuleActive: {
    backgroundColor: colors.accent,
  },
  detailsToggle: {
    paddingBottom: 8,
  },
  detailsToggleText: {
    ...typography.micro,
    color: colors.accent,
  },

  // Details
  detailsSection: {
    gap: spacing.md,
  },
  notesInput: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    minHeight: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    textAlignVertical: "top",
  },

  // Error
  errorText: {
    ...typography.bodyMd,
    color: colors.error,
  },

  // Primary action — copper pill, ink text. Matches the FAB language so
  // "commit to the task" reads with the same weight as "capture one".
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    paddingVertical: 14,
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
