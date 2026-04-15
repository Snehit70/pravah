import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
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

type ComposerMode = "inbox" | "today";

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
    const insets = useSafeAreaInsets();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [mode, setMode] = useState<ComposerMode>("inbox");
    const [saving, setSaving] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [focusNonce, setFocusNonce] = useState(0);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [showDatePicker, setShowDatePicker] = useState(false);

    useEffect(() => {
      const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

      const showSubscription = Keyboard.addListener(showEvent, (event) => {
        setKeyboardHeight(Math.max(0, event.endCoordinates.height));
      });
      const hideSubscription = Keyboard.addListener(hideEvent, () => {
        setKeyboardHeight(0);
      });

      return () => {
        showSubscription.remove();
        hideSubscription.remove();
      };
    }, []);

    const sheetBottomInset =
      keyboardHeight > 0
        ? Math.max(spacing.sm, keyboardHeight - insets.bottom + spacing.sm)
        : Math.max(insets.bottom, spacing.lg);

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
      setShowDetails(false);
      setShowDatePicker(false);
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
        snapPoints={showDetails ? ["68%"] : ["48%"]}
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

          {/* Quick date chips */}
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setMode("inbox")}
              style={({ pressed }) => [styles.chip, mode === "inbox" && styles.chipActive, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, mode === "inbox" && styles.chipTextActive]}>
                Inbox
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("today")}
              style={({ pressed }) => [styles.chip, mode === "today" && styles.chipActive, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, mode === "today" && styles.chipTextActive]}>
                Today
              </Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable
              onPress={() => setShowDetails(!showDetails)}
              style={({ pressed }) => [styles.detailsToggle, pressed && styles.pressed]}
            >
              <Text style={styles.detailsToggleText}>
                {showDetails ? "Less" : "More"}
              </Text>
            </Pressable>
          </View>

          {showDetails ? (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.detailsSection}>
              <BottomSheetTextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Notes (optional)"
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
  sheetContainer: {
    marginHorizontal: spacing.md,
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
  helperText: {
    color: colors.textMuted,
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
