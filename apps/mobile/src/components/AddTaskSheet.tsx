import {
  forwardRef,
  useCallback,
  useEffect,
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
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { haptic } from "../lib/haptic";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { TaskMetaFields } from "./TaskMetaFields";
import { type TaskPriority } from "../lib/task-form";
import { useGoals } from "../hooks/useGoals";
import { useGoalMutations } from "../hooks/useGoalMutations";
import { addDays, toIsoDate } from "../lib/dates";
import { expandBulkTasks, MAX_BULK_TASKS, type BulkTaskInput } from "../lib/bulkTaskCapture";
import { useUserPreferences } from "../hooks/useUserPreferences";

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
    priority?: TaskPriority;
    goalId?: string;
  }) => Promise<boolean>;
  onBulkAdd?: (tasks: BulkTaskInput[]) => Promise<boolean>;
  isValidDeadline: (raw: string) => { value?: string; error?: string };
  onSheetChange?: (isOpen: boolean) => void;
};

export const AddTaskSheet = forwardRef<AddTaskSheetRef, AddTaskSheetProps>(
  function AddTaskSheet({ onAdd, onBulkAdd, isValidDeadline, onSheetChange }, ref) {
    const titleInputRef = useRef<TextInput>(null);
    const [visible, setVisible] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [kind, setKind] = useState<"task" | "goal">("task");
    const [goalId, setGoalId] = useState<string | undefined>(undefined);
    const [goalIds, setGoalIds] = useState<string[]>([]);
    const [seriesEnabled, setSeriesEnabled] = useState(false);
    const [seriesStart, setSeriesStart] = useState("1");
    const [seriesEnd, setSeriesEnd] = useState("2");
    const [showGoalPicker, setShowGoalPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { goals } = useGoals();
    const { prefs } = useUserPreferences();
    const { addGoal } = useGoalMutations();
    const selectedGoal = useMemo(
      () => goals.find((g) => g.id === goalId),
      [goals, goalId]
    );
    const hasDraftChanges = Boolean(
      title.trim() ||
        description.trim() ||
        deadline.trim() ||
        priority ||
        goalId
        || goalIds.length > 0
        || seriesEnabled
    );

    const presetDeadlines: Record<ComposerMode, string> = {
      inbox: "",
      today: toIsoDate(new Date()),
      tomorrow: toIsoDate(addDays(new Date(), 1)),
      nextweek: toIsoDate(addDays(new Date(), 7)),
    };
    const selectedMode = MODE_OPTIONS.find(
      (option) => presetDeadlines[option.mode] === deadline
    )?.mode;

    const closeModal = useCallback(
      (notify = true) => {
        Keyboard.dismiss();
        setVisible(false);
        if (notify) onSheetChange?.(false);
      },
      [onSheetChange]
    );

    const reset = () => {
      setTitle("");
      setDescription("");
      setDeadline("");
      setPriority(undefined);
      setGoalId(undefined);
      setGoalIds([]);
      setSeriesEnabled(false);
      setSeriesStart("1");
      setSeriesEnd("2");
      setShowGoalPicker(false);
      setShowDetails(false);
      setKind("task");
      setError(null);
    };

    useImperativeHandle(ref, () => ({
      open: () => {
        setVisible(true);
        onSheetChange?.(true);
      },
      close: () => {
        closeModal();
        reset();
      },
      hasDraftChanges: () => hasDraftChanges,
      dismissKeyboard: () => {
        Keyboard.dismiss();
      },
    }));

    // Focus title input once the modal has animated in
    useEffect(() => {
      if (!visible) return;
      const t = setTimeout(() => titleInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }, [visible]);

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
        const created = await addGoal({
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
        closeModal();
        return;
      }

      const start = seriesEnabled ? Number(seriesStart) : 1;
      const end = seriesEnabled ? Number(seriesEnd) : 1;
      const useBulk = prefs.bulkTaskCaptureEnabled && (seriesEnabled || goalIds.length > 1);
      if (useBulk) {
        try {
          if (!onBulkAdd) throw new Error("Bulk task capture is unavailable");
          const tasks = expandBulkTasks({
            baseTitle: trimmed,
            seriesEnabled,
            start,
            end,
            goalIds,
            description: description.trim() || undefined,
            deadline: deadlineResult.value,
            priority,
          });
          const success = await onBulkAdd(tasks);
          setSaving(false);
          if (success) { reset(); closeModal(); }
          return;
        } catch (bulkError) {
          setSaving(false);
          setError(bulkError instanceof Error ? bulkError.message : "Invalid bulk capture");
          haptic.error();
          return;
        }
      }

      const success = await onAdd({
        title: trimmed,
        description: description.trim() || undefined,
        deadline: deadlineResult.value,
        priority,
        goalId: prefs.bulkTaskCaptureEnabled ? goalIds[0] : goalId,
      });

      setSaving(false);

      if (success) {
        reset();
        closeModal();
      }
    }, [title, description, deadline, priority, goalId, goalIds, seriesEnabled, seriesStart, seriesEnd, kind, saving, onAdd, onBulkAdd, isValidDeadline, closeModal, addGoal, prefs.bulkTaskCaptureEnabled]);

    const bulkPreview = useMemo(() => {
      if (!prefs.bulkTaskCaptureEnabled || kind !== "task" || (!seriesEnabled && goalIds.length < 2)) return null;
      try {
        return expandBulkTasks({
          baseTitle: title,
          seriesEnabled,
          start: seriesEnabled ? Number(seriesStart) : 1,
          end: seriesEnabled ? Number(seriesEnd) : 1,
          goalIds,
        });
      } catch {
        return null;
      }
    }, [goalIds, kind, prefs.bulkTaskCaptureEnabled, seriesEnabled, seriesEnd, seriesStart, title]);

    const canSubmit = useMemo(() => Boolean(title.trim()) && !saving, [title, saving]);

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!hasDraftChanges) {
            reset();
            closeModal();
          }
        }}
      >
        <KeyboardAvoidingView
          // Android already resizes the modal window for the keyboard. Adding
          // KeyboardAvoidingView's height behavior on top can make the centered
          // capture card repeatedly re-measure and visibly oscillate.
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.overlay}
        >
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
          {!hasDraftChanges ? (
            <Pressable
              accessibilityLabel="Dismiss"
              style={StyleSheet.absoluteFill}
              onPress={() => {
                reset();
                closeModal();
              }}
            />
          ) : null}

          <View style={styles.card}>
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sheetKicker}>Capture</Text>
              <View style={styles.kindRow}>
                <Pressable
                  onPress={() => { setKind("task"); setShowDetails(false); }}
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
                  onPress={() => { setKind("goal"); setShowDetails(true); }}
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

              <TextInput
                ref={titleInputRef}
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

              {kind === "task" ? (
                <View style={styles.modeRow}>
                  {MODE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.mode}
                      onPress={() => {
                        setDeadline(presetDeadlines[option.mode]);
                        setError(null);
                      }}
                      style={({ pressed }) => [styles.modeItem, pressed && { opacity: 0.6 }]}
                      hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedMode === option.mode }}
                      accessibilityLabel={
                        option.mode === "inbox"
                          ? "Clear deadline and move to Inbox"
                          : `Set deadline ${option.label}`
                      }
                    >
                      <Text style={[styles.modeText, selectedMode === option.mode && styles.modeTextActive]}>
                        {option.label}
                      </Text>
                      <View style={[styles.modeRule, selectedMode === option.mode && styles.modeRuleActive]} />
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
                      (prefs.bulkTaskCaptureEnabled ? goalIds.length > 0 : selectedGoal) && styles.goalChipActive,
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
                      {prefs.bulkTaskCaptureEnabled
                        ? goalIds.length > 0 ? `${goalIds.length} selected` : "None"
                        : selectedGoal ? selectedGoal.text : "None"}
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
                          if (prefs.bulkTaskCaptureEnabled) setGoalIds([]); else setGoalId(undefined);
                        }}
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.goalOption,
                          (prefs.bulkTaskCaptureEnabled ? goalIds.length === 0 : !goalId) && styles.goalOptionActive,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={[styles.goalOptionText, (prefs.bulkTaskCaptureEnabled ? goalIds.length === 0 : !goalId) && styles.goalOptionTextActive]}>
                          No goal
                        </Text>
                      </Pressable>
                      {goals.map((g) => {
                        const active = prefs.bulkTaskCaptureEnabled ? goalIds.includes(g.id) : g.id === goalId;
                        return (
                          <Pressable
                            key={g.id}
                            onPress={() => {
                              if (prefs.bulkTaskCaptureEnabled) {
                                setGoalIds((current) => current.includes(g.id) ? current.filter((id) => id !== g.id) : [...current, g.id]);
                              } else {
                                setGoalId(g.id);
                                setShowGoalPicker(false);
                              }
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

              {kind === "task" && prefs.bulkTaskCaptureEnabled ? (
                <View style={styles.bulkSection}>
                  <Pressable
                    onPress={() => setSeriesEnabled((current) => !current)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: seriesEnabled }}
                    style={styles.bulkToggle}
                  >
                    <Text style={styles.goalOptionText}>Create series</Text>
                    <Text style={styles.goalChipValueActive}>{seriesEnabled ? "On" : "Off"}</Text>
                  </Pressable>
                  {seriesEnabled ? (
                    <View style={styles.rangeRow}>
                      <TextInput value={seriesStart} onChangeText={setSeriesStart} keyboardType="number-pad" accessibilityLabel="Series start" style={styles.rangeInput} />
                      <Text style={styles.goalOptionText}>to</Text>
                      <TextInput value={seriesEnd} onChangeText={setSeriesEnd} keyboardType="number-pad" accessibilityLabel="Series end" style={styles.rangeInput} />
                    </View>
                  ) : null}
                  {bulkPreview ? (
                    <Text accessibilityLiveRegion="polite" style={styles.previewText}>
                      {bulkPreview.length} tasks will be created{bulkPreview.length === MAX_BULK_TASKS ? " (maximum)" : ""}.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {showDetails ? (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(150)}
                  style={styles.detailsSection}
                >
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Notes (optional)"
                    placeholderTextColor={colors.textMuted}
                    style={styles.notesInput}
                    multiline
                  />

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
            </ScrollView>

            {/* Sticky footer: the primary action stays pinned above the keyboard
                instead of scrolling behind it (the most common capture friction). */}
            <View style={styles.footer}>
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
                    closeModal();
                  }}
                  hitSlop={12}
                  style={({ pressed }) => [styles.discardButton, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.discardButtonText}>Discard</Text>
                </Pressable>
              ) : null}
            </View>
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
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  backdropDim: {
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    backgroundColor: colors.bg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  // flexShrink lets the scroll area give up space to the sticky footer so the
  // footer never gets pushed below the card's (keyboard-avoided) bottom edge.
  scrollArea: {
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    gap: spacing.sm,
  },
  bulkSection: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  bulkToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rangeInput: { minWidth: 72, color: colors.textPrimary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: spacing.sm, textAlign: "center" },
  previewText: { ...typography.micro, color: colors.textMuted },

  sheetKicker: {
    ...typography.micro,
    color: colors.textMuted,
  },

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

  titleInput: {
    color: colors.textPrimary,
    ...typography.bodyLg,
    fontSize: 17,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

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

  errorText: {
    ...typography.bodyMd,
    color: colors.error,
  },

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
