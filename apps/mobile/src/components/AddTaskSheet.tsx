import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  Keyboard,
  type LayoutChangeEvent,
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
import {
  colors,
  radii,
  spacing,
  typography,
} from "../theme/tokens";
import { getThemeRuntimeSnapshot } from "../theme/themeRuntime";
import { createThemedStyles } from "../theme/themeRuntime";
import { type TaskPriority } from "../lib/task-form";
import { useGoals } from "../hooks/useGoals";
import { useGoalMutations } from "../hooks/useGoalMutations";
import { addDays, toIsoDate } from "../lib/dates";
import { expandBulkTasks, MAX_BULK_TASKS, type BulkTaskInput } from "../lib/bulkTaskCapture";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useConfirm } from "../hooks/useConfirm";
import { TaskImageFilmstrip } from "./TaskImageFilmstrip";
import { SlidingSegmented } from "./SlidingSegmented";
import type { TaskImageCoordinator } from "../lib/taskImageCoordinator";
import { ThemedDatePicker } from "./ThemedDatePicker";
import { ThemedTimePicker } from "./ThemedTimePicker";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusIcon,
} from "./UiIcons";
import NavGoalsAsset from "../assets/icons/nav-goals.svg";

type PlanningMode = "summary" | "when" | "priority" | "goal";

const todayIso = () => toIsoDate(new Date());

const PRIORITY_OPTIONS: Array<{
  value: TaskPriority;
  label: string;
  detail: string;
}> = [
  { value: undefined, label: "No priority", detail: "" },
  { value: "p1", label: "P1", detail: "High" },
  { value: "p2", label: "P2", detail: "Medium" },
  { value: "p3", label: "P3", detail: "Low" },
];

const CAPTURE_MODES = [
  { value: "task" as const, label: "New task" },
  { value: "goal" as const, label: "New goal" },
];

function CapturePlanningRow({
  icon,
  label,
  value,
  valueColor,
  onPress,
  selected,
  showChevron = true,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
  selected?: boolean;
  showChevron?: boolean;
}) {
  const body = (
    <>
      <View style={styles.planningIcon}>{icon}</View>
      <Text style={styles.planningLabel}>{label}</Text>
      <Text style={[styles.planningValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
      {selected ? (
        <CheckIcon color={colors.accent} size={17} />
      ) : showChevron && onPress ? (
        <ChevronRightIcon color={colors.textMuted} size={16} />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.planningRow}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [styles.planningRow, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
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
    imageUploadId?: string;
    imageUploadIds?: string[];
    imageInputs?: Array<{ uploadId: string; caption?: string }>;
  }) => Promise<boolean>;
  onBulkAdd?: (tasks: BulkTaskInput[]) => Promise<boolean>;
  isValidDeadline: (raw: string) => { value?: string; error?: string };
  onSheetChange?: (isOpen: boolean) => void;
  taskImageCoordinator?: TaskImageCoordinator;
};

export const AddTaskSheet = forwardRef<AddTaskSheetRef, AddTaskSheetProps>(
  function AddTaskSheet(
    { onAdd, onBulkAdd, isValidDeadline, onSheetChange, taskImageCoordinator },
    ref
  ) {
    const titleInputRef = useRef<TextInput>(null);
    const firstTaskInputRef = useRef<TextInput>(null);
    const [visible, setVisible] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState(todayIso);
    const [time, setTime] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [kind, setKind] = useState<"task" | "goal">("task");
    const [firstTaskTitle, setFirstTaskTitle] = useState("");
    const [goalId, setGoalId] = useState<string | undefined>(undefined);
    const [goalIds, setGoalIds] = useState<string[]>([]);
    const [seriesEnabled, setSeriesEnabled] = useState(false);
    const [seriesStart, setSeriesStart] = useState("1");
    const [seriesEnd, setSeriesEnd] = useState("2");
    const [saving, setSaving] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [planningMode, setPlanningMode] = useState<PlanningMode>("summary");
    const [summaryCardHeight, setSummaryCardHeight] = useState<number | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Burst capture: how many tasks were saved since the sheet opened. Once
    // it is > 0 the lit when/goal/priority selections are *saved* context
    // being reused, not an unsaved draft — the dismiss guards key off that.
    const [burstCount, setBurstCount] = useState(0);
    const [savedFlash, setSavedFlash] = useState<number | null>(null);
    const [taskImageRevision, setTaskImageRevision] = useState(0);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragY = useSharedValue(0);
    const titleFocus = useSharedValue(0);
    const { goals } = useGoals();
    const { prefs } = useUserPreferences();
    const reducedMotion = useReducedMotion();
    const confirm = useConfirm();
    const insets = useSafeAreaInsets();
    const { addGoal } = useGoalMutations();
    useEffect(() => {
      if (!taskImageCoordinator) return;
      return taskImageCoordinator.subscribe(() => setTaskImageRevision((value) => value + 1));
    }, [taskImageCoordinator]);
    const taskImageDrafts = useMemo(() => {
      void taskImageRevision;
      return taskImageCoordinator?.getViewStates() ?? [];
    }, [taskImageCoordinator, taskImageRevision]);
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
        time.trim() ||
        (deadline.trim() && deadline !== todayIso()) ||
        priority ||
        goalId ||
        goalIds.length > 0 ||
        seriesEnabled ||
        taskImageDrafts.length > 0
      );
    const hasDraftChanges = hasUnsavedText || hasUnsavedContext;

    const closeModal = useCallback(
      (notify = true) => {
        Keyboard.dismiss();
        setVisible(false);
        if (notify) onSheetChange?.(false);
      },
      [onSheetChange]
    );

    const reset = useCallback(() => {
      setTitle("");
      setDescription("");
      setDeadline(todayIso());
      setTime("");
      setPriority(undefined);
      setGoalId(undefined);
      setFirstTaskTitle("");
      setGoalIds([]);
      setSeriesEnabled(false);
      setSeriesStart("1");
      setSeriesEnd("2");
      setShowDetails(false);
      setPlanningMode("summary");
      setSummaryCardHeight(null);
      setShowDatePicker(false);
      setShowTimePicker(false);
      setKind("task");
      setError(null);
      setBurstCount(0);
      setSavedFlash(null);
      taskImageCoordinator?.discard();
      if (flashTimer.current) {
        clearTimeout(flashTimer.current);
        flashTimer.current = null;
      }
    }, [taskImageCoordinator]);

    useImperativeHandle(ref, () => ({
      open: (initialKind = "task") => {
        setKind(initialKind);
        setDeadline(todayIso());
        setPlanningMode("summary");
        setSummaryCardHeight(null);
        setShowDetails(false);
        dragY.set(0);
        setVisible(true);
        onSheetChange?.(true);
      },
      openForGoal: (initialGoalId) => {
        setKind("task");
        setDeadline(todayIso());
        setGoalId(initialGoalId);
        setGoalIds([initialGoalId]);
        setShowDetails(false);
        setPlanningMode("summary");
        setSummaryCardHeight(null);
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
        if (taskImageDrafts.length > 0) {
          setSaving(false);
          setError("Task images can be added to one Task at a time.");
          haptic.error();
          return;
        }
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

      const imageInputs = taskImageCoordinator?.getImageInputsForSave() ?? [];
      const imageArguments =
        imageInputs.length === 1 && !imageInputs[0].caption
          ? { imageUploadId: imageInputs[0].uploadId }
          : imageInputs.length > 0
            ? { imageInputs }
            : {};
      const success = await onAdd({
        title: trimmed,
        description: description.trim() || undefined,
        deadline: deadlineResult.value,
        time: deadlineResult.value ? (time.trim() || undefined) : undefined,
        priority,
        goalId: prefs.bulkTaskCaptureEnabled ? goalIds[0] : goalId,
        ...imageArguments,
      });

      setSaving(false);

      if (success) {
        void taskImageCoordinator?.beginUploadAfterSave();
        // Single-task capture is the burst path: Enter saves and keeps the
        // sheet open; only the explicit footer verb saves and closes.
        if (intent === "stay") {
          taskImageCoordinator?.clearAfterSaveAndStay();
          finishBurstSave();
        } else {
          reset();
          closeModal();
        }
      }
    }, [title, description, deadline, time, priority, firstTaskTitle, goalId, goalIds, seriesEnabled, seriesStart, seriesEnd, kind, saving, onAdd, onBulkAdd, isValidDeadline, closeModal, finishBurstSave, addGoal, prefs.bulkTaskCaptureEnabled, taskImageCoordinator, taskImageDrafts, reset]);

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

    const canSubmit = useMemo(
      () => Boolean(title.trim()) && !saving && !taskImageDrafts.some((image) => image.state === "preparing"),
      [title, saving, taskImageDrafts]
    );
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
    }, [closeModal, reset]);

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

    const today = todayIso();
    const tomorrow = toIsoDate(addDays(new Date(), 1));
    const whenValue =
      deadline === today
        ? "Today"
        : deadline === tomorrow
          ? "Tomorrow"
          : deadline
            ? new Date(`${deadline}T00:00:00`).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : "Inbox";
    const priorityValue = PRIORITY_OPTIONS.find((option) => option.value === priority);
    const goalValue = prefs.bulkTaskCaptureEnabled
      ? goalIds.length > 0
        ? `${goalIds.length} selected`
        : "No goal"
      : selectedGoal?.text ?? "No goal";

    const renderPlanning = () => {
      if (planningMode === "summary") {
        return (
          <View style={styles.planningSection}>
            <Text style={styles.sectionLabel}>Planning</Text>
            <View style={styles.planningCard}>
              <CapturePlanningRow
                icon={<CalendarIcon color={colors.textSecondary} size={19} />}
                label="When"
                value={whenValue}
                onPress={() => {
                  Keyboard.dismiss();
                  setPlanningMode("when");
                }}
              />
              {kind === "task" && deadline ? (
                <CapturePlanningRow
                  icon={<ClockIcon color={colors.textSecondary} size={19} />}
                  label="Exact time"
                  value={time || "Not set"}
                  onPress={() => setShowTimePicker(true)}
                />
              ) : null}
              <CapturePlanningRow
                icon={<View style={[styles.priorityDot, { backgroundColor: priority ? colors.error : colors.textMuted }]} />}
                label="Priority"
                value={priorityValue?.label ?? "No priority"}
                valueColor={priority ? colors.error : undefined}
                onPress={() => {
                  Keyboard.dismiss();
                  setPlanningMode("priority");
                }}
              />
              {kind === "task" ? (
                <CapturePlanningRow
                  icon={<NavGoalsAsset width={20} height={20} color={colors.accent} />}
                  label="Goal"
                  value={goalValue}
                  valueColor={goalValue === "No goal" ? undefined : colors.accent}
                  onPress={() => {
                    Keyboard.dismiss();
                    setPlanningMode("goal");
                  }}
                />
              ) : null}
            </View>
          </View>
        );
      }

      const pickerTitle = planningMode === "when" ? "When" : planningMode === "priority" ? "Priority" : "Goal";
      return (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(160)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          style={styles.planningEditor}
        >
          <View style={styles.planningPickerHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to capture planning"
              onPress={() => setPlanningMode("summary")}
              hitSlop={10}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <ChevronLeftIcon color={colors.textPrimary} size={21} />
            </Pressable>
            <Text style={styles.planningPickerTitle}>{pickerTitle}</Text>
            <View style={styles.backButton} />
          </View>

          {planningMode === "when" ? (
            <View style={styles.planningCard}>
              {[
                { label: "Inbox", value: "", icon: <CalendarIcon color={colors.textSecondary} size={19} /> },
                { label: "Today", value: today, icon: <CalendarIcon color={colors.textSecondary} size={19} /> },
                { label: "Tomorrow", value: tomorrow, icon: <CalendarIcon color={colors.warning} size={19} /> },
              ].map((option) => (
                <CapturePlanningRow
                  key={option.label}
                  icon={option.icon}
                  label={option.label}
                  value=""
                  selected={deadline === option.value}
                  showChevron={false}
                  onPress={() => {
                    setDeadline(option.value);
                    if (!option.value) setTime("");
                    setError(null);
                    setPlanningMode("summary");
                  }}
                />
              ))}
              <CapturePlanningRow
                icon={<CalendarIcon color={colors.textSecondary} size={19} />}
                label="Pick a date..."
                value=""
                showChevron={false}
                onPress={() => setShowDatePicker(true)}
              />
            </View>
          ) : null}

          {planningMode === "priority" ? (
            <View style={styles.planningCard}>
              {PRIORITY_OPTIONS.map((option) => (
                <CapturePlanningRow
                  key={option.label}
                  icon={<View style={[styles.priorityDot, { backgroundColor: option.value ? colors.error : colors.textMuted }]} />}
                  label={option.label}
                  value={option.detail}
                  selected={priority === option.value}
                  showChevron={false}
                  onPress={() => {
                    setPriority(option.value);
                    setPlanningMode("summary");
                  }}
                />
              ))}
            </View>
          ) : null}

          {planningMode === "goal" ? (
            <View style={styles.planningCard}>
              <CapturePlanningRow
                icon={<NavGoalsAsset width={20} height={20} color={colors.textMuted} />}
                label="No goal"
                value=""
                selected={prefs.bulkTaskCaptureEnabled ? goalIds.length === 0 : !goalId}
                showChevron={false}
                onPress={() => {
                  if (prefs.bulkTaskCaptureEnabled) setGoalIds([]);
                  else setGoalId(undefined);
                  if (!prefs.bulkTaskCaptureEnabled) setPlanningMode("summary");
                }}
              />
              {goals.map((goal) => {
                const selected = prefs.bulkTaskCaptureEnabled ? goalIds.includes(goal.id) : goal.id === goalId;
                return (
                  <CapturePlanningRow
                    key={goal.id}
                    icon={<NavGoalsAsset width={20} height={20} color={colors.accent} />}
                    label={goal.text}
                    value=""
                    selected={selected}
                    showChevron={false}
                    onPress={() => {
                      if (prefs.bulkTaskCaptureEnabled) {
                        setGoalIds((current) => current.includes(goal.id) ? current.filter((id) => id !== goal.id) : [...current, goal.id]);
                      } else {
                        setGoalId(goal.id);
                        setPlanningMode("summary");
                      }
                    }}
                  />
                );
              })}
            </View>
          ) : null}
        </Animated.View>
      );
    };

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
          <BlurView
            intensity={38}
            tint={getThemeRuntimeSnapshot().appearance === "dark" ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
            style={StyleSheet.absoluteFill}
            onPress={() => void requestClose()}
          />

          <GestureDetector gesture={panGesture}>
          <Animated.View
            onLayout={(event: LayoutChangeEvent) => {
              if (planningMode !== "summary") return;
              const nextHeight = Math.round(event.nativeEvent.layout.height);
              setSummaryCardHeight((current) => current === nextHeight ? current : nextHeight);
            }}
            style={[
              styles.card,
              planningMode !== "summary" && summaryCardHeight
                ? { height: summaryCardHeight }
                : null,
              cardDragStyle,
            ]}
          >
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
              <SlidingSegmented
                options={CAPTURE_MODES}
                value={kind}
                onSelect={(nextKind) => {
                  setKind(nextKind);
                  setPlanningMode("summary");
                }}
              />

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

              {kind === "goal" ? (
                <View style={styles.goalFields}>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Notes (optional)"
                    placeholderTextColor={colors.textMuted}
                    style={styles.notesInput}
                    accessibilityLabel="Goal notes"
                    multiline
                  />
                  <View style={styles.firstTaskComposer}>
                    <View style={styles.firstTaskCheckbox}>
                      <View style={styles.firstTaskCheckboxInner} />
                    </View>
                    <View style={styles.firstTaskCopy}>
                      <Text style={styles.firstTaskLabel}>First task (optional)</Text>
                      <TextInput
                        ref={firstTaskInputRef}
                        value={firstTaskTitle}
                        onChangeText={setFirstTaskTitle}
                        placeholder="Add the first task"
                        placeholderTextColor={colors.textMuted}
                        style={styles.firstTaskInput}
                        accessibilityLabel="First task"
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add first task"
                      hitSlop={10}
                      onPress={() => firstTaskInputRef.current?.focus()}
                      style={({ pressed }) => [styles.firstTaskAdd, pressed && styles.pressed]}
                    >
                      <PlusIcon color={colors.accent} size={21} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Notes (optional)"
                  placeholderTextColor={colors.textMuted}
                  style={styles.notesInput}
                  accessibilityLabel="Task notes"
                  multiline
                />
              )}

              {kind === "task" && taskImageCoordinator ? (
                <TaskImageFilmstrip
                  surface="capture"
                  images={taskImageDrafts.map((image, position) => ({
                    taskImageId: image.uploadId,
                    position,
                    state: image.state,
                    previewUri: image.previewUri,
                    caption: image.caption,
                    progress: image.progress,
                    failure: image.failure,
                  }))}
                  onSelectSource={(sourceKind) => {
                    setError(null);
                    void taskImageCoordinator.select(sourceKind).then(() => {
                      const sourceError = taskImageCoordinator.getLastError();
                      if (sourceError) setError(sourceError);
                    });
                  }}
                  onCaptionChange={taskImageCoordinator.updateCaption}
                  onRetry={(uploadId) => {
                    void taskImageCoordinator.retry(uploadId);
                  }}
                  onReorder={taskImageCoordinator.reorder}
                  onRemove={taskImageCoordinator.remove}
                />
              ) : null}

              {renderPlanning()}

              {kind === "task" && prefs.bulkTaskCaptureEnabled ? (
                <Pressable
                  onPress={() => setShowDetails((current) => !current)}
                  style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={showDetails ? "Hide more capture options" : "Show more capture options"}
                  accessibilityState={{ expanded: showDetails }}
                >
                  <Text style={styles.moreButtonText}>{showDetails ? "Less" : "More"}</Text>
                </Pressable>
              ) : null}

              {kind === "task" && prefs.bulkTaskCaptureEnabled && showDetails ? (
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

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {savedFlash !== null ? (
                <Animated.View
                  entering={reducedMotion ? undefined : FadeIn.duration(120)}
                  exiting={reducedMotion ? undefined : FadeOut.duration(160)}
                  style={styles.savedFlash}
                >
                  <Text accessibilityLiveRegion="polite" style={styles.savedFlashText}>
                    ✓ Saved · {savedFlash} captured
                  </Text>
                </Animated.View>
              ) : null}
            </ScrollView>

            <ThemedDatePicker
              visible={showDatePicker}
              value={deadline || today}
              minDate={today}
              onSelect={(value) => {
                setDeadline(value);
                setError(null);
                setPlanningMode("summary");
              }}
              onClose={() => setShowDatePicker(false)}
            />
            <ThemedTimePicker
              visible={showTimePicker}
              value={time}
              onSelect={setTime}
              onClear={() => setTime("")}
              onClose={() => setShowTimePicker(false)}
            />

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

const styles = createThemedStyles({
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

  titleInput: {
    color: colors.textPrimary,
    ...typography.bodyLg,
    fontSize: 17,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  moreButton: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    marginTop: -spacing.sm,
  },
  moreButtonText: {
    ...typography.micro,
    color: colors.accent,
    letterSpacing: 0.7,
    textTransform: "uppercase",
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
    maxHeight: 140,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgInput,
    textAlignVertical: "top",
  },

  goalFields: { gap: spacing.md },
  firstTaskComposer: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
  },
  firstTaskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  firstTaskCheckboxInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    opacity: 0,
  },
  firstTaskCopy: { flex: 1, minWidth: 0, gap: 1 },
  firstTaskLabel: { ...typography.micro, color: colors.textSecondary },
  firstTaskInput: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    minHeight: 28,
    padding: 0,
  },
  firstTaskAdd: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  planningSection: { gap: spacing.sm },
  sectionLabel: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  planningCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
  },
  planningRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  planningIcon: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  planningLabel: {
    flexShrink: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  planningValue: {
    flex: 1,
    textAlign: "right",
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  planningEditor: { gap: spacing.sm },
  planningPickerHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  planningPickerTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  pressed: { opacity: 0.68 },

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
