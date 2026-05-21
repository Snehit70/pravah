import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { haptic } from "../lib/haptic";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TaskMetaFields } from "./TaskMetaFields";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { type TaskPriority } from "../lib/task-form";
import { useGoals } from "../hooks/useGoals";
import { goalsStore } from "../lib/goalsStorage";

type ComposerMode = "inbox" | "today" | "tomorrow" | "nextweek";

const MODE_OPTIONS: { mode: ComposerMode; label: string }[] = [
  { mode: "inbox", label: "Inbox" },
  { mode: "today", label: "Today" },
  { mode: "tomorrow", label: "Tomorrow" },
  { mode: "nextweek", label: "+1w" },
];

export type AddTaskSheetRef = {
  open: () => void;
  close: () => void;
  hasDraftChanges: () => boolean;
  dismissKeyboard: () => void;
};

type AddTaskSheetProps = {
  onAdd: (data: {
    title: string;
    description?: string;
    deadline?: string;
    mode: ComposerMode;
    priority?: TaskPriority;
    goalId?: string;
  }) => Promise<boolean>;
  isValidDeadline: (raw: string) => { value?: string; error?: string };
  onSheetChange?: (isOpen: boolean) => void;
};

export const AddTaskSheet = forwardRef<AddTaskSheetRef, AddTaskSheetProps>(
  function AddTaskSheet({ onAdd, isValidDeadline, onSheetChange }, ref) {
    const bottomSheetRef = useRef<BottomSheet>(null);
    // BottomSheetTextInput's ref type comes from gesture-handler and isn't
    // assignable from a vanilla RN TextInput ref. We only need .focus(),
    // so type the ref as that minimal shape.
    const titleInputRef = useRef<{ focus: () => void } | null>(null);
    const insets = useSafeAreaInsets();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [mode, setMode] = useState<ComposerMode>("inbox");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [kind, setKind] = useState<"task" | "goal">("task");
    const [goalId, setGoalId] = useState<string | undefined>(undefined);
    const [showGoalPicker, setShowGoalPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sheetBottomInset = useKeyboardInset(insets.bottom);
    const { goals } = useGoals();
    const selectedGoal = useMemo(
      () => goals.find((g) => g.id === goalId),
      [goals, goalId]
    );
    const hasDraftChanges = Boolean(
      title.trim() ||
        description.trim() ||
        deadline.trim() ||
        priority ||
        goalId ||
        mode !== "inbox"
    );

    useImperativeHandle(ref, () => ({
      open: () => {
        bottomSheetRef.current?.expand();
        // Focus is requested by onChange once the sheet is actually open;
        // calling focus() here would fire before the sheet mounts and pop
        // the keyboard over an invisible composer.
      },
      close: () => {
        bottomSheetRef.current?.close();
      },
      hasDraftChanges: () => hasDraftChanges,
      dismissKeyboard: () => {
        Keyboard.dismiss();
      },
    }));

    const reset = () => {
      setTitle("");
      setDescription("");
      setDeadline("");
      setPriority(undefined);
      setGoalId(undefined);
      setShowGoalPicker(false);
      setShowDetails(false);
      setKind("task");
      setError(null);
    };

    const handleAdd = useCallback(async () => {
      const trimmed = title.trim();
      if (!trimmed || saving) return;

      const deadlineResult = isValidDeadline(deadline);
      if (deadlineResult.error) {
        setError(deadlineResult.error);
        haptic.error();
        return;
      }

      setSaving(true);
      setError(null);

      if (kind === "goal") {
        const created = await goalsStore.add({
          text: trimmed,
          description: description.trim() || undefined,
          deadline: deadlineResult.value,
          priority,
        });
        setSaving(false);
        if (!created) {
          setError("You already have a goal with that name.");
          haptic.error();
          return;
        }
        haptic.medium();
        reset();
        bottomSheetRef.current?.close();
        return;
      }

      const success = await onAdd({
        title: trimmed,
        description: description.trim() || undefined,
        deadline: deadlineResult.value,
        mode,
        priority,
        goalId,
      });

      setSaving(false);

      if (success) {
        reset();
        bottomSheetRef.current?.close();
      }
    }, [title, description, deadline, mode, priority, goalId, kind, saving, onAdd, isValidDeadline]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          pressBehavior={hasDraftChanges ? "none" : "close"}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.6}
        />
      ),
      [hasDraftChanges]
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
        enablePanDownToClose={!hasDraftChanges}
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
          const isOpen = index >= 0;
          onSheetChange?.(isOpen);
          if (isOpen) {
            // Focus only once the sheet has settled at a snap point. Doing
            // this in onChange (instead of via TextInput's autoFocus) avoids
            // popping the keyboard at cold-launch when Android restores the
            // sheet's previous mount but not its visible state.
            titleInputRef.current?.focus();
          } else {
            Keyboard.dismiss();
            reset();
          }
        }}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sheetKicker}>Capture</Text>
          <View style={styles.kindRow}>
            <Pressable
              onPress={() => setKind("task")}
              hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === "task" }}
              accessibilityLabel="New task"
              style={({ pressed }) => [styles.kindItem, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.kindText, kind === "task" && styles.kindTextActive]}>
                New task
              </Text>
              <View style={[styles.kindRule, kind === "task" && styles.kindRuleActive]} />
            </Pressable>
            <Pressable
              onPress={() => setKind("goal")}
              hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === "goal" }}
              accessibilityLabel="New goal"
              style={({ pressed }) => [styles.kindItem, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.kindText, kind === "goal" && styles.kindTextActive]}>
                New goal
              </Text>
              <View style={[styles.kindRule, kind === "goal" && styles.kindRuleActive]} />
            </Pressable>
          </View>

          <BottomSheetTextInput
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={titleInputRef as any}
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setError(null);
            }}
            placeholder={
              kind === "goal" ? "What do you want to achieve?" : "What needs to be done?"
            }
            placeholderTextColor={colors.textMuted}
            style={styles.titleInput}
            returnKeyType="done"
            onSubmitEditing={() => void handleAdd()}
          />

          {/* Mode — segmented control as two mono labels with an underline
              under the active segment. Tasks only; goals are open-ended and
              don't get scheduled into the day. */}
          {kind === "task" ? (
          <View style={styles.modeRow}>
            {MODE_OPTIONS.map((option) => (
              <Pressable
                key={option.mode}
                onPress={() => setMode(option.mode)}
                style={({ pressed }) => [styles.modeItem, pressed && { opacity: 0.6 }]}
                hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === option.mode }}
                accessibilityLabel={`Schedule ${option.label}`}
              >
                <Text style={[styles.modeText, mode === option.mode && styles.modeTextActive]}>
                  {option.label}
                </Text>
                <View style={[styles.modeRule, mode === option.mode && styles.modeRuleActive]} />
              </Pressable>
            ))}

            <View style={{ flex: 1 }} />

            <Pressable
              onPress={() => setShowDetails(!showDetails)}
              style={({ pressed }) => [styles.detailsToggle, pressed && { opacity: 0.6 }]}
              hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
            >
              <Text style={styles.detailsToggleText}>{showDetails ? "Less" : "More"}</Text>
            </Pressable>
          </View>
          ) : (
            <View style={styles.goalKindRow}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setShowDetails(!showDetails)}
                style={({ pressed }) => [styles.detailsToggle, pressed && { opacity: 0.6 }]}
                hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
              >
                <Text style={styles.detailsToggleText}>{showDetails ? "Less" : "More"}</Text>
              </Pressable>
            </View>
          )}

          {kind === "task" && goals.length > 0 ? (
            <View style={styles.goalSection}>
              <Pressable
                onPress={() => setShowGoalPicker((s) => !s)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  selectedGoal ? `Goal: ${selectedGoal.text}. Tap to change.` : "Pick a goal"
                }
                style={({ pressed }) => [
                  styles.goalChip,
                  selectedGoal && styles.goalChipActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.goalChipKicker}>Goal</Text>
                <Text
                  style={[
                    styles.goalChipValue,
                    selectedGoal && styles.goalChipValueActive,
                  ]}
                  numberOfLines={1}
                >
                  {selectedGoal ? selectedGoal.text : "None"}
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
                      setGoalId(undefined);
                      setShowGoalPicker(false);
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.goalOption,
                      !goalId && styles.goalOptionActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.goalOptionText, !goalId && styles.goalOptionTextActive]}>
                      No goal
                    </Text>
                  </Pressable>
                  {goals.map((g) => {
                    const active = g.id === goalId;
                    return (
                      <Pressable
                        key={g.id}
                        onPress={() => {
                          setGoalId(g.id);
                          setShowGoalPicker(false);
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
            hitSlop={12}
            style={({ pressed }) => [
              styles.primaryButton,
              !canSubmit && styles.primaryButtonDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.primaryButtonText, !canSubmit && styles.primaryButtonTextDisabled]}>
              {saving ? "Adding…" : kind === "goal" ? "Add goal" : "Add task"}
            </Text>
          </Pressable>

          {hasDraftChanges ? (
            <Pressable
              onPress={() => {
                reset();
                bottomSheetRef.current?.close();
              }}
              hitSlop={12}
              style={({ pressed }) => [styles.discardButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.discardButtonText}>Discard</Text>
            </Pressable>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>
    );
  }
);

const styles = StyleSheet.create({
  // Sheet surface — one enclosure (earned, because it's a modal). No side
  // borders or extra radius beyond the standard bottom-sheet top corners.
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

  // Kind toggle — two large segments using the same underline language as
  // the mode row, but headline-sized so it replaces the static page title.
  kindRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: -spacing.sm,
  },
  kindItem: {
    alignItems: "flex-start",
    paddingBottom: 4,
  },
  kindText: {
    ...typography.headline,
    color: colors.textMuted,
  },
  kindTextActive: {
    color: colors.textPrimary,
  },
  kindRule: {
    marginTop: 6,
    height: 2,
    width: 24,
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  kindRuleActive: {
    backgroundColor: colors.accent,
  },
  goalKindRow: {
    flexDirection: "row",
    alignItems: "center",
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
    gap: spacing.md,
    flexWrap: "wrap",
  },
  modeItem: {
    minHeight: 44,
    paddingBottom: 4,
    alignItems: "center",
    justifyContent: "center",
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
    minHeight: 44,
    paddingBottom: 8,
    justifyContent: "center",
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
  // Goal picker — collapsed chip with kicker + value, expands inline to a
  // vertical list of goal options. Stays out of the way when no goal is set.
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
  discardButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  discardButtonText: {
    ...typography.title,
    color: colors.error,
  },
});
