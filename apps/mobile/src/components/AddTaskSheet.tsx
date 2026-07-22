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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { haptic } from "../lib/haptic";
import { feedback } from "../lib/feedback";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { TaskMetaFields } from "./TaskMetaFields";
import { type TaskPriority } from "../lib/task-form";
import { useGoals } from "../hooks/useGoals";
import { useGoalMutations } from "../hooks/useGoalMutations";
import { addDays, nextLaterThisWeek, toIsoDate } from "../lib/dates";
import { expandBulkTasks, MAX_BULK_TASKS, type BulkTaskInput } from "../lib/bulkTaskCapture";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useConfirm } from "../hooks/useConfirm";

type ComposerMode = "inbox" | "today" | "tomorrow" | "laterThisWeek";

function weekdayShort(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

export type AddTaskSheetRef = {
  open: (initialKind?: "task" | "goal") => void;
  openForGoal: (goalId: string) => void;
  close: () => void;
  hasDraftChanges: () => boolean;
  dismissKeyboard: () => void;
};

type AddTaskSheetProps = {
  onAdd: (data: {
    title: string;
    description?: string;
    deadline?: string;
    time?: string;
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
    const [time, setTime] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [kind, setKind] = useState<"task" | "goal">("task");
    const [firstTaskTitle, setFirstTaskTitle] = useState("");
    const [goalId, setGoalId] = useState<string | undefined>(undefined);
    const [goalIds, setGoalIds] = useState<string[]>([]);
    const [seriesEnabled, setSeriesEnabled] = useState(false);
    const [seriesStart, setSeriesStart] = useState("1");
    const [seriesEnd, setSeriesEnd] = useState("2");
    const [showGoalPicker, setShowGoalPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Burst capture: how many tasks were saved since the sheet opened. Once
    // it is > 0 the lit when/goal/priority selections are *saved* context
    // being reused, not an unsaved draft — the dismiss guards key off that.
    const [burstCount, setBurstCount] = useState(0);
    const [savedFlash, setSavedFlash] = useState<number | null>(null);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragY = useSharedValue(0);
    const titleFocus = useSharedValue(0);
    const { goals } = useGoals();
    const { prefs } = useUserPreferences();
    const reducedMotion = useReducedMotion();
    const confirm = useConfirm();
    const insets = useSafeAreaInsets();
    const { addGoal } = useGoalMutations();
    const selectedGoal = useMemo(
      () => goals.find((g) => g.id === goalId),
      [goals, goalId]
    );
    // Typed-but-not-saved text always guards dismissal. Context selections
    // (when/goal/priority/series) only guard until the first burst save —
    // after that they are sticky saved context, and every leave verb
    // (backdrop, back button, swipe-down) must still work mid-burst.
    const hasUnsavedText = Boolean(
      title.trim() || description.trim() || firstTaskTitle.trim()
    );
    const hasUnsavedContext =
      burstCount === 0 &&
      Boolean(
        deadline.trim() || priority || goalId || goalIds.length > 0 || seriesEnabled
      );
    const hasDraftChanges = hasUnsavedText || hasUnsavedContext;

    const laterThisWeek = nextLaterThisWeek();
    const modeOptions = useMemo<{ mode: ComposerMode; label: string }[]>(
      () => [
        { mode: "inbox", label: "Inbox" },
        { mode: "today", label: "Today" },
        { mode: "tomorrow", label: "Tomorrow" },
        { mode: "laterThisWeek", label: `Later, ${weekdayShort(laterThisWeek)}` },
      ],
      [laterThisWeek],
    );

    const presetDeadlines = useMemo<Record<ComposerMode, string>>(
      () => ({
        inbox: "",
        today: toIsoDate(new Date()),
        tomorrow: toIsoDate(addDays(new Date(), 1)),
        laterThisWeek: toIsoDate(laterThisWeek),
      }),
      [laterThisWeek],
    );
    const selectedMode = modeOptions.find(
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
      setTime("");
      setPriority(undefined);
      setGoalId(undefined);
      setFirstTaskTitle("");
      setGoalIds([]);
      setSeriesEnabled(false);
      setSeriesStart("1");
      setSeriesEnd("2");
      setShowGoalPicker(false);
      setShowDetails(false);
      setKind("task");
      setError(null);
      setBurstCount(0);
      setSavedFlash(null);
      if (flashTimer.current) {
        clearTimeout(flashTimer.current);
        flashTimer.current = null;
      }
    };

    useImperativeHandle(ref, () => ({
      open: (initialKind = "task") => {
        setKind(initialKind);
        setShowDetails(initialKind === "goal");
        dragY.set(0);
        setVisible(true);
        onSheetChange?.(true);
      },
      openForGoal: (initialGoalId) => {
        setKind("task");
        setGoalId(initialGoalId);
        setGoalIds([initialGoalId]);
        setShowDetails(false);
        dragY.set(0);
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

    // Focus title input as soon as the modal mounts — the cursor should be
    // hot before the slide-in finishes, not after (capture is a speed tool).
    useEffect(() => {
      if (!visible) return;
      const t = setTimeout(() => titleInputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }, [visible]);

    useEffect(
      () => () => {
        if (flashTimer.current) clearTimeout(flashTimer.current);
      },
      []
    );

    // Save & stay: the burst path. Title/notes clear so the next thought has
    // a blank line, but when/goal/priority stay lit (sticky context).
    const finishBurstSave = useCallback(() => {
      setTitle("");
      setDescription("");
      setFirstTaskTitle("");
      setError(null);
      const next = burstCount + 1;
      setBurstCount(next);
      setSavedFlash(next);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(null), 500);
      titleInputRef.current?.focus();
    }, [burstCount]);

    const handleAdd = useCallback(async (intent: "stay" | "close" = "close") => {
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
        if (!created) {
          setSaving(false);
          setError("You already have a goal with that name.");
          haptic.error();
          return;
        }
        const firstTask = firstTaskTitle.trim();
        if (firstTask) {
          const success = await onAdd({
            title: firstTask,
            description: undefined,
            deadline: deadlineResult.value,
            time: deadlineResult.value ? (time.trim() || undefined) : undefined,
            priority,
            goalId: created.id,
          });
          if (!success) {
            setSaving(false);
            return;
          }
        }
        setSaving(false);
        feedback.captureSaved();
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
        time: deadlineResult.value ? (time.trim() || undefined) : undefined,
        priority,
        goalId: prefs.bulkTaskCaptureEnabled ? goalIds[0] : goalId,
      });

      setSaving(false);

      if (success) {
        // Single-task capture is the burst path: Enter saves and keeps the
        // sheet open; only the explicit footer verb saves and closes.
        if (intent === "stay") {
          finishBurstSave();
        } else {
          reset();
          closeModal();
        }
      }
    }, [title, description, deadline, time, priority, firstTaskTitle, goalId, goalIds, seriesEnabled, seriesStart, seriesEnd, kind, saving, onAdd, onBulkAdd, isValidDeadline, closeModal, finishBurstSave, addGoal, prefs.bulkTaskCaptureEnabled]);

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
    const captureOutcome = useMemo(() => {
      if (kind === "goal") return "Creates a Goal you can plan from Goals.";
      if (!deadline) return "Saves to Inbox for later triage.";
      const selected = modeOptions.find((option) => presetDeadlines[option.mode] === deadline);
      if (selected) return `Schedules for ${selected.label}.`;
      return "Schedules for the selected date.";
    }, [deadline, kind, modeOptions, presetDeadlines]);
    // Mid-burst with an empty title there is nothing left to save, so the
    // footer verb degrades to a plain "Done" that just closes the sheet.
    const closeOnly = kind === "task" && burstCount > 0 && !title.trim();
    const submitLabel = saving
      ? "Saving..."
      : kind === "goal"
        ? "Create goal"
        : closeOnly
          ? "Done"
          : "Save & close";
    const footerEnabled = canSubmit || closeOnly;
    const handleFooterPress = () => {
      if (closeOnly) {
        reset();
        closeModal();
        return;
      }
      void handleAdd("close");
    };

    const dismissBySwipe = useCallback(() => {
      reset();
      closeModal();
    }, [closeModal]);

    const requestClose = async () => {
      if (!hasDraftChanges) {
        reset();
        closeModal();
        return;
      }
      const discard = await confirm({
        title: "Discard changes?",
        message: "You have an unsaved task or goal draft.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        destructive: true,
      });
      if (!discard) return;
      reset();
      closeModal();
    };

    // Swipe-down to dismiss. Activates only on a clearly vertical downward
    // drag so it does not steal the sheet's inner scroll or horizontal taps;
    // an unsaved draft springs the card back instead of dismissing.
    const panGesture = Gesture.Pan()
      .activeOffsetY(16)
      .failOffsetX([-24, 24])
      .onUpdate((event) => {
        "worklet";
        dragY.set(Math.max(0, event.translationY));
      })
      .onEnd((event) => {
        "worklet";
        const wantsDismiss = event.translationY > 120 || event.velocityY > 900;
        if (wantsDismiss && !hasDraftChanges) {
          dragY.set(withTiming(560, { duration: 160 }));
          runOnJS(dismissBySwipe)();
        } else {
          dragY.set(
            reducedMotion ? 0 : withSpring(0, { damping: 26, stiffness: 320 })
          );
        }
      });

    const cardDragStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: dragY.get() }],
    }));
    const titleUnderlineStyle = useAnimatedStyle(() => ({
      opacity: titleFocus.get(),
      transform: [{ scaleX: titleFocus.get() }],
    }));

    return (
      <Modal
        visible={visible}
        transparent
        animationType={reducedMotion ? "none" : "slide"}
        statusBarTranslucent
        onRequestClose={() => void requestClose()}
      >
        {/* A native Modal is its own Android window, so the app-root
            GestureHandlerRootView can't see these touches — the pan gesture
            needs its own root inside the modal. */}
        <GestureHandlerRootView style={styles.gestureRoot}>
        <KeyboardAvoidingView
          behavior="padding"
          automaticOffset
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

          <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.card, cardDragStyle]}>
            {/* Accent hairline + soft top glow: the same accent as the tab
                bar's `+` button, visually tying capture entry to the sheet. */}
            <LinearGradient
              pointerEvents="none"
              colors={["transparent", colors.accent, "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.accentHairline}
            />
            <LinearGradient
              pointerEvents="none"
              colors={[colors.accentGlow, "transparent"]}
              style={styles.accentTopGlow}
            />
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

              <View>
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
                  accessibilityLabel={kind === "goal" ? "Goal title" : "Task title"}
                  placeholderTextColor={colors.textMuted}
                  style={styles.titleInput}
                  returnKeyType="done"
                  // Keep the keyboard up across a burst: Enter saves & stays,
                  // so blurring after submit would break rapid-fire capture.
                  submitBehavior="submit"
                  onSubmitEditing={() =>
                    void handleAdd(kind === "task" ? "stay" : "close")
                  }
                  onFocus={() => {
                    titleFocus.set(
                      reducedMotion ? 1 : withTiming(1, { duration: 180 })
                    );
                  }}
                  onBlur={() => {
                    titleFocus.set(
                      reducedMotion ? 0 : withTiming(0, { duration: 140 })
                    );
                  }}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[styles.titleUnderline, titleUnderlineStyle]}
                />
              </View>

              {kind === "task" ? (
                <View style={styles.modeRow}>
                  {modeOptions.map((option) => (
                    <Pressable
                      key={option.mode}
                      onPress={() => {
                        setDeadline(presetDeadlines[option.mode]);
                        if (!presetDeadlines[option.mode]) setTime("");
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
                    accessibilityRole="button"
                    accessibilityLabel={showDetails ? "Hide task details" : "Show task details"}
                    accessibilityState={{ expanded: showDetails }}
                  >
                    <Text style={styles.detailsToggleText}>{showDetails ? "Less" : "More"}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.goalKindRow}>
                  <Text style={styles.goalModeHint}>
                    Create the direction first. Add a starting task now if the next move is clear.
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={() => setShowDetails(!showDetails)}
                    style={({ pressed }) => [styles.detailsToggle, pressed && { opacity: 0.6 }]}
                    hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
                    accessibilityRole="button"
                    accessibilityLabel={showDetails ? "Hide goal details" : "Show goal details"}
                    accessibilityState={{ expanded: showDetails }}
                  >
                    <Text style={styles.detailsToggleText}>{showDetails ? "Less" : "More"}</Text>
                  </Pressable>
                </View>
              )}

              {kind === "goal" ? (
                <View style={styles.firstTaskBlock}>
                  <Text style={styles.goalChipKicker}>First task</Text>
                  <TextInput
                    value={firstTaskTitle}
                    onChangeText={setFirstTaskTitle}
                    placeholder="Optional next move"
                    placeholderTextColor={colors.textMuted}
                    style={styles.inlineTextInput}
                    accessibilityLabel="First linked task"
                  />
                </View>
              ) : null}

              {kind === "task" && goals.length > 0 ? (
                <View style={styles.goalSection}>
                  <Pressable
                    onPress={() => setShowGoalPicker((s) => !s)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      selectedGoal ? `Goal: ${selectedGoal.text}. Tap to change.` : "Pick a goal"
                    }
                    accessibilityState={{ expanded: showGoalPicker }}
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
                      entering={reducedMotion ? undefined : FadeIn.duration(150)}
                      exiting={reducedMotion ? undefined : FadeOut.duration(120)}
                      style={styles.goalPicker}
                    >
                      <Pressable
                        onPress={() => {
                          if (prefs.bulkTaskCaptureEnabled) setGoalIds([]); else setGoalId(undefined);
                        }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: prefs.bulkTaskCaptureEnabled
                            ? goalIds.length === 0
                            : !goalId,
                        }}
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
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
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
                  entering={reducedMotion ? undefined : FadeIn.duration(200)}
                  exiting={reducedMotion ? undefined : FadeOut.duration(150)}
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
                    time={time}
                    priority={priority}
                    onDeadlineChange={(v) => {
                      setDeadline(v);
                      if (!v) setTime("");
                    }}
                    onTimeChange={setTime}
                    onPriorityChange={setPriority}
                    onClearError={() => setError(null)}
                  />
                </Animated.View>
              ) : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <View style={styles.outcomeRow}>
                <Text accessibilityLiveRegion="polite" style={styles.outcomeText}>
                  {captureOutcome}
                </Text>
                {savedFlash !== null ? (
                  <Animated.View
                    entering={reducedMotion ? undefined : FadeIn.duration(120)}
                    exiting={reducedMotion ? undefined : FadeOut.duration(160)}
                    style={styles.savedFlash}
                  >
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.savedFlashText}
                    >
                      ✓ Saved · {savedFlash} captured
                    </Text>
                  </Animated.View>
                ) : null}
              </View>
            </ScrollView>

            {/* Sticky footer: the primary action stays pinned above the keyboard
                instead of scrolling behind it (the most common capture friction). */}
            <View style={styles.footer}>
              <Pressable
                onPress={handleFooterPress}
                disabled={!footerEnabled}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.primaryButton,
                  !footerEnabled && styles.primaryButtonDisabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {footerEnabled ? (
                  <LinearGradient
                    pointerEvents="none"
                    colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
                    style={styles.primaryButtonSheen}
                  />
                ) : null}
                <Text style={[styles.primaryButtonText, !footerEnabled && styles.primaryButtonTextDisabled]}>
                  {submitLabel}
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
          </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  accentHairline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 1,
  },
  accentTopGlow: {
    position: "absolute",
    top: 2,
    left: 0,
    right: 0,
    height: 20,
    opacity: 0.35,
  },
  titleUnderline: {
    height: 2,
    marginTop: -1,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  outcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  savedFlash: {
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  savedFlashText: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "600",
  },
  primaryButtonSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
  },
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
  goalModeHint: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  firstTaskBlock: {
    gap: spacing.sm,
  },
  inlineTextInput: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  outcomeText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },

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
    // Clip the lit-from-above sheen gradient to the pill shape.
    overflow: "hidden",
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
