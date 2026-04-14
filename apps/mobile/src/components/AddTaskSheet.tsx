import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing, typography } from "../theme/tokens";

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
  }) => Promise<boolean>;
  isValidDeadline: (raw: string) => { value?: string; error?: string };
  onSheetChange?: (isOpen: boolean) => void;
};

export const AddTaskSheet = forwardRef<AddTaskSheetRef, AddTaskSheetProps>(
  function AddTaskSheet({ onAdd, isValidDeadline, onSheetChange }, ref) {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [mode, setMode] = useState<ComposerMode>("inbox");
    const [saving, setSaving] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      open: () => {
        bottomSheetRef.current?.expand();
      },
      close: () => {
        bottomSheetRef.current?.close();
      },
    }));

    const reset = () => {
      setTitle("");
      setDescription("");
      setDeadline("");
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
      });

      setSaving(false);

      if (success) {
        reset();
        bottomSheetRef.current?.close();
      }
    }, [title, description, deadline, mode, saving, onAdd, isValidDeadline]);

    const renderBackdrop = useCallback(
      (props: any) => (
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
        snapPoints={showDetails ? ["68%"] : ["48%"]}
        enablePanDownToClose
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.indicator}
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onChange={(index) => {
          onSheetChange?.(index >= 0);
          if (index === -1) {
            reset();
          }
        }}
      >
        <BottomSheetView style={styles.content}>
          <Text style={styles.sheetTitle}>New task</Text>

          <TextInput
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

          {/* Quick date chips */}
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setMode("inbox")}
              style={[styles.chip, mode === "inbox" && styles.chipActive]}
            >
              <Text style={[styles.chipText, mode === "inbox" && styles.chipTextActive]}>
                Inbox
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("today")}
              style={[styles.chip, mode === "today" && styles.chipActive]}
            >
              <Text style={[styles.chipText, mode === "today" && styles.chipTextActive]}>
                Today
              </Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable
              onPress={() => setShowDetails(!showDetails)}
              style={styles.detailsToggle}
            >
              <Text style={styles.detailsToggleText}>
                {showDetails ? "Less" : "More"}
              </Text>
            </Pressable>
          </View>

          {showDetails ? (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.detailsSection}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Notes (optional)"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.notesInput]}
                multiline
              />
              <TextInput
                value={deadline}
                onChangeText={(text) => {
                  setDeadline(text);
                  setError(null);
                }}
                placeholder="Deadline YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </Animated.View>
          ) : null}

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <Pressable
            onPress={() => void handleAdd()}
            disabled={saving || !title.trim()}
            style={({ pressed }) => [
              styles.addButton,
              (!title.trim() || saving) && styles.addButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.addButtonText}>
              {saving ? "Adding..." : "Add task"}
            </Text>
          </Pressable>
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
  titleInput: {
    backgroundColor: colors.bgInput,
    color: colors.textPrimary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: colors.chipActive,
    borderColor: colors.chipActiveBorder,
  },
  chipText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: "700",
  },
  chipTextActive: {
    color: colors.infoText,
  },
  detailsToggle: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  detailsToggleText: {
    color: colors.accent,
    ...typography.caption,
    fontWeight: "700",
  },
  detailsSection: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.bgInput,
    color: colors.textPrimary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  errorText: {
    color: colors.error,
    ...typography.caption,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: colors.primaryDark,
    fontWeight: "800",
    fontSize: 15,
  },
  pressed: {
    opacity: 0.85,
  },
});
