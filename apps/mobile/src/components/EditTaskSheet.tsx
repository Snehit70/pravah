import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
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
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../lib/haptic";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles, getThemeRuntimeSnapshot } from "../theme/themeRuntime";
import type { MobileTask } from "./TaskCard";
import { isTaskCompleted, isTaskOnTimeline } from "../lib/taskState";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  formatTime12h,
  priorityDotColor,
  priorityLabel,
  type TaskPriority,
} from "../lib/task-form";
import { useConfirm } from "../hooks/useConfirm";
import { useGoals } from "../hooks/useGoals";
import { goalLinksStore } from "../lib/goalLinks";
import { useGoalMutations } from "../hooks/useGoalMutations";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ThemedDatePicker } from "./ThemedDatePicker";
import { ThemedTimePicker } from "./ThemedTimePicker";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  InfoCircleIcon,
  PencilIcon,
  TrashIcon,
} from "./UiIcons";
import NavGoalsAsset from "../assets/icons/nav-goals.svg";
import NavInboxAsset from "../assets/icons/nav-inbox.svg";
import { SearchField } from "./SearchField";
import { addDays, dateLabel, getLocalDateString, humanDate, toIsoDate } from "../lib/dates";
import { TaskImageFilmstrip } from "./TaskImageFilmstrip";
import type { TaskImageSourceKind } from "../lib/taskImageCoordinator";

export type EditTaskSheetRef = {
  open: (task: MobileTask) => void;
  close: () => void;
};

type UndoPayload = {
  message: string;
};

type EditTaskSheetProps = {
  onSave: (data: {
    taskId: Id<"tasks">;
    title: string;
    description?: string;
    deadline?: string;
    time?: string;
    priority?: TaskPriority;
  }) => Promise<boolean>;
  isValidDeadline: (raw: string) => { value?: string; error?: string };
  onSheetChange?: (isOpen: boolean) => void;
  onComplete?: (taskId: Id<"tasks">) => void;
  onReopen?: (taskId: Id<"tasks">) => void;
  onScheduleToDate?: (taskId: Id<"tasks">, isoDate: string) => void;
  onUnschedule?: (taskId: Id<"tasks">) => void;
  onDelete?: (taskId: Id<"tasks">) => void;
  resolveTaskImage?: MobileTaskPropsImageResolver;
  onReorderTaskImages?: (args: {
    taskId: Id<"tasks">;
    orderedTaskImageIds: string[];
    expectedRevision: number;
  }) => TaskImageCollectionMutationResult | Promise<TaskImageCollectionMutationResult> | void;
  onCaptionTaskImage?: (args: {
    taskImageId: string;
    caption: string;
    expectedRevision: number;
  }) => TaskImageCollectionMutationResult | Promise<TaskImageCollectionMutationResult> | void;
  onRemoveTaskImage?: (args: { taskImageId: string; expectedRevision: number }) =>
    TaskImageCollectionMutationResult | Promise<TaskImageCollectionMutationResult> | void;
  onSelectTaskImage?: (args: {
    taskId: Id<"tasks">;
    expectedRevision: number;
    kind: TaskImageSourceKind;
  }) => TaskImageCollectionMutationResult | Promise<TaskImageCollectionMutationResult | undefined> | undefined;
  onSaveComplete?: (
    undo: UndoPayload,
    task: MobileTask,
    previousState: DraftState,
  ) => void;
};

type MobileTaskPropsImageResolver = NonNullable<
  React.ComponentProps<typeof TaskImageFilmstrip>["resolveDelivery"]
>;

type TaskState = "inbox" | "timeline" | "completed";
type SheetMode = "inspector" | "when" | "priority" | "goal" | "details";

type DraftState = {
  title: string;
  description: string;
  deadline: string;
  time: string;
  priority: TaskPriority;
  goalId: string | null;
};

type TaskImageCollectionMutationResult = NonNullable<MobileTask["imageCollection"]> & {
  stale: boolean;
};

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string; detail: string }> = [
  { value: undefined, label: "No priority", detail: "" },
  { value: "p1", label: "P1", detail: "High" },
  { value: "p2", label: "P2", detail: "Medium" },
  { value: "p3", label: "P3", detail: "Low" },
];

function formatTimestamp(ms?: number): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function whenLabel(deadline: string, time: string): string {
  if (!deadline) return "Inbox";
  const today = getLocalDateString();
  const tomorrow = toIsoDate(addDays(new Date(), 1));
  const day = dateLabel(deadline, today, tomorrow);
  return time ? `${day} · ${formatTime12h(time)}` : day;
}

function statusLabel(state: TaskState | null, deadline: string, completedAt?: number): string {
  if (state === "completed") {
    return `COMPLETED${completedAt ? ` · ${formatTimestamp(completedAt)?.toUpperCase()}` : ""}`;
  }
  if (!deadline) return "INBOX TASK";
  return `PLANNED · ${whenLabel(deadline, "").toUpperCase()}`;
}

function PlanningRow({
  icon,
  label,
  value,
  valueColor,
  onPress,
  selected,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  onPress?: () => void;
  selected?: boolean;
}) {
  const body = (
    <>
      <View style={styles.planningIcon}>{icon}</View>
      <Text style={styles.planningLabel}>{label}</Text>
      <Text style={[styles.planningValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
      {onPress ? <ChevronRightIcon color={colors.textMuted} size={16} /> : null}
      {selected ? <CheckIcon color={colors.accent} size={17} /> : null}
    </>
  );

  if (!onPress) return <View style={styles.planningRow}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      style={({ pressed }) => [styles.planningRow, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

export const EditTaskSheet = forwardRef<EditTaskSheetRef, EditTaskSheetProps>(
  function EditTaskSheet(
    {
      onSave,
      isValidDeadline,
      onSheetChange,
      onComplete,
      onReopen,
      onScheduleToDate: _onScheduleToDate,
      onUnschedule: _onUnschedule,
      onDelete,
      resolveTaskImage,
      onReorderTaskImages,
      onCaptionTaskImage,
      onRemoveTaskImage,
      onSelectTaskImage,
      onSaveComplete,
    },
    ref,
  ) {
    const openSeqRef = useRef(0);
    const confirm = useConfirm();
    const insets = useSafeAreaInsets();
    const reducedMotion = useReducedMotion();
    const { goals } = useGoals();
    const { setGoalLink } = useGoalMutations();

    const [visible, setVisible] = useState(false);
    const [taskId, setTaskId] = useState<Id<"tasks"> | null>(null);
    const [currentTask, setCurrentTask] = useState<MobileTask | null>(null);
    const [taskState, setTaskState] = useState<TaskState | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [deadline, setDeadline] = useState("");
    const [time, setTime] = useState("");
    const [priority, setPriority] = useState<TaskPriority>(undefined);
    const [draftGoalId, setDraftGoalId] = useState<string | null>(null);
    const [initialDraft, setInitialDraft] = useState<DraftState | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<SheetMode>("inspector");
    const [titleEditing, setTitleEditing] = useState(false);
    const [notesEditing, setNotesEditing] = useState(false);
    const [goalQuery, setGoalQuery] = useState("");
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    const closeModal = useCallback(
      (notify = true) => {
        Keyboard.dismiss();
        setVisible(false);
        setTaskId(null);
        setCurrentTask(null);
        setTaskState(null);
        setInitialDraft(null);
        setDraftGoalId(null);
        setMode("inspector");
        setTitleEditing(false);
        setNotesEditing(false);
        setGoalQuery("");
        setOverflowOpen(false);
        setShowDatePicker(false);
        setShowTimePicker(false);
        if (notify) onSheetChange?.(false);
      },
      [onSheetChange],
    );

    const hasUnsavedChanges = useMemo(() => {
      if (!initialDraft || !taskId) return false;
      return (
        title !== initialDraft.title ||
        description !== initialDraft.description ||
        deadline !== initialDraft.deadline ||
        time !== initialDraft.time ||
        priority !== initialDraft.priority ||
        draftGoalId !== initialDraft.goalId
      );
    }, [deadline, description, draftGoalId, initialDraft, priority, taskId, time, title]);

    const canSave = Boolean(title.trim()) && hasUnsavedChanges && !saving;
    const linkedGoal = draftGoalId ? goals.find((goal) => goal.id === draftGoalId) ?? null : null;
    const filteredGoals = useMemo(() => {
      const query = goalQuery.trim().toLocaleLowerCase();
      if (!query) return goals;
      return goals.filter((goal) => goal.text.toLocaleLowerCase().includes(query));
    }, [goalQuery, goals]);

    const restoreInitialDraft = useCallback(() => {
      if (!initialDraft) return;
      setTitle(initialDraft.title);
      setDescription(initialDraft.description);
      setDeadline(initialDraft.deadline);
      setTime(initialDraft.time);
      setPriority(initialDraft.priority);
      setDraftGoalId(initialDraft.goalId);
      setError(null);
      setMode("inspector");
      setTitleEditing(false);
      setNotesEditing(false);
      Keyboard.dismiss();
    }, [initialDraft]);

    const requestClose = useCallback(async () => {
      if (mode !== "inspector") {
        setMode("inspector");
        setOverflowOpen(false);
        return;
      }
      if (!hasUnsavedChanges) {
        closeModal();
        return;
      }
      const discard = await confirm({
        title: "Discard your changes?",
        message: `Changes to “${initialDraft?.title || title || "this task"}” will be lost.`,
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        destructive: true,
      });
      if (discard) closeModal();
    }, [closeModal, confirm, hasUnsavedChanges, initialDraft?.title, mode, title]);
    useImperativeHandle(
      ref,
      () => ({
        open: (task: MobileTask) => {
          const seq = openSeqRef.current + 1;
          openSeqRef.current = seq;
          void goalLinksStore.hydrate().then(() => {
            if (openSeqRef.current !== seq) return;
            const currentGoalId = goalLinksStore.goalFor(String(task._id)) ?? null;
            const nextState: TaskState = isTaskCompleted(task)
              ? "completed"
              : isTaskOnTimeline(task)
                ? "timeline"
                : "inbox";
            const draft: DraftState = {
              title: task.title,
              description: task.description ?? "",
              deadline: task.deadline ?? "",
              time: task.time ?? "",
              priority: task.priority,
              goalId: currentGoalId,
            };
            setCurrentTask(task);
            setTaskId(task._id);
            setTaskState(nextState);
            setTitle(draft.title);
            setDescription(draft.description);
            setDeadline(draft.deadline);
            setTime(draft.time);
            setPriority(draft.priority);
            setDraftGoalId(draft.goalId);
            setInitialDraft(draft);
            setSaving(false);
            setError(null);
            setMode("inspector");
            setTitleEditing(false);
            setNotesEditing(false);
            setGoalQuery("");
            setOverflowOpen(false);
            setVisible(true);
            onSheetChange?.(true);
            haptic.light();
          });
        },
        close: () => {
          openSeqRef.current += 1;
          if (mode !== "inspector") {
            setMode("inspector");
            return;
          }
          void requestClose();
        },
      }),
      [mode, onSheetChange, requestClose],
    );

    const handleSave = useCallback(async () => {
      if (!taskId || !initialDraft || !title.trim() || saving) return;
      const deadlineResult = isValidDeadline(deadline);
      if (deadlineResult.error) {
        setError(deadlineResult.error);
        haptic.error();
        return;
      }

      const savedDraft: DraftState = {
        title: title.trim(),
        description: description.trim(),
        deadline: deadlineResult.value ?? "",
        time: deadlineResult.value ? time.trim() : "",
        priority,
        goalId: draftGoalId,
      };
      const previousState = { ...initialDraft };
      setSaving(true);
      setError(null);
      const success = await onSave({
        taskId,
        title: savedDraft.title,
        description: savedDraft.description || undefined,
        deadline: savedDraft.deadline || undefined,
        time: savedDraft.deadline ? savedDraft.time || undefined : undefined,
        priority: savedDraft.priority,
      });
      setSaving(false);
      if (!success) {
        setError("Couldn’t save changes. Try again.");
        haptic.error();
        return;
      }

      if (previousState.goalId !== savedDraft.goalId) {
        setGoalLink(String(taskId), savedDraft.goalId);
      }
      const sourceTask = currentTask;
      if (sourceTask) {
        setCurrentTask({
          ...sourceTask,
          title: savedDraft.title,
          description: savedDraft.description || undefined,
          deadline: savedDraft.deadline || undefined,
          time: savedDraft.deadline ? savedDraft.time || undefined : undefined,
          priority: savedDraft.priority,
        });
        onSaveComplete?.({ message: "Changes saved" }, sourceTask, previousState);
      }
      setInitialDraft(savedDraft);
      setTitle(savedDraft.title);
      setDescription(savedDraft.description);
      setDeadline(savedDraft.deadline);
      setTime(savedDraft.time);
      setTaskState((current) =>
        current === "completed" ? current : savedDraft.deadline ? "timeline" : "inbox",
      );
      setMode("inspector");
      setTitleEditing(false);
      setNotesEditing(false);
      Keyboard.dismiss();
      haptic.success();
    }, [
      currentTask,
      deadline,
      description,
      draftGoalId,
      initialDraft,
      isValidDeadline,
      onSave,
      onSaveComplete,
      priority,
      saving,
      setGoalLink,
      taskId,
      time,
      title,
    ]);

    const deleteTask = useCallback(async () => {
      if (!taskId || !onDelete) return;
      const ok = await confirm({
        title: `Delete “${title || "task"}”?`,
        message: "It will be removed from active planning. You can restore it for 30 minutes.",
        confirmLabel: "Delete task",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!ok) return;
      onDelete(taskId);
      closeModal();
    }, [closeModal, confirm, onDelete, taskId, title]);

    const chooseDeadline = useCallback((value: string) => {
      setDeadline(value);
      if (!value) setTime("");
      setError(null);
      setMode("inspector");
      haptic.selection();
    }, []);

    const completed = taskState === "completed";
    const planningWhen = whenLabel(deadline, time);
    const planningPriority = priority ? `${priorityLabel(priority)} — ${priority === "p1" ? "High" : priority === "p2" ? "Medium" : "Low"}` : "No priority";
    const planningGoal = linkedGoal?.text ?? "No goal";

    const renderUtilityHeader = () => (
      <>
        <View style={styles.handleBar} />
        <View style={styles.utilityHeader}>
          <View style={styles.iconButton} />
          <Text style={styles.utilityLabel}>TASK</Text>
          <Pressable
            onPress={() => setOverflowOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="More task actions"
            accessibilityState={{ expanded: overflowOpen }}
            hitSlop={12}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Text style={styles.moreGlyph}>•••</Text>
          </Pressable>
        </View>
        {overflowOpen ? (
          <View style={styles.overflowMenu}>
            <Pressable
              onPress={() => {
                setOverflowOpen(false);
                setMode("details");
              }}
              accessibilityRole="button"
              accessibilityLabel="View task details"
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            >
              <InfoCircleIcon color={colors.textSecondary} size={18} />
              <Text style={styles.menuItemText}>Task details</Text>
            </Pressable>
            {onDelete ? (
              <Pressable
                onPress={() => {
                  setOverflowOpen(false);
                  void deleteTask();
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete task"
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              >
                <TrashIcon color={colors.error} size={18} />
                <Text style={[styles.menuItemText, { color: colors.error }]}>Delete task</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </>
    );

    const renderPickerHeader = (label: string) => (
      <>
        <View style={styles.handleBar} />
        <View style={styles.pickerHeader}>
          <Pressable
            onPress={() => setMode("inspector")}
            accessibilityRole="button"
            accessibilityLabel="Back to task inspector"
            hitSlop={12}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <ChevronLeftIcon color={colors.textPrimary} size={21} />
          </Pressable>
          <Text style={styles.pickerTitle}>{label}</Text>
          <View style={styles.iconButton} />
        </View>
      </>
    );

    const renderWhenPicker = () => {
      const today = getLocalDateString();
      const tomorrow = toIsoDate(addDays(new Date(), 1));
      const options = [
        { label: "Inbox", value: "", icon: <NavInboxAsset color={colors.textSecondary} width={19} height={19} /> },
        { label: "Today", value: today, icon: <CalendarIcon color={colors.textSecondary} size={19} /> },
        { label: "Tomorrow", value: tomorrow, icon: <CalendarIcon color={colors.warning} size={19} /> },
      ];
      return (
        <>
          {renderPickerHeader("When")}
          <ScrollView contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled">
            <View style={styles.optionGroup}>
              {options.map((option) => (
                <PlanningRow
                  key={option.label}
                  icon={option.icon}
                  label={option.label}
                  value=""
                  selected={deadline === option.value}
                  onPress={() => chooseDeadline(option.value)}
                />
              ))}
              <PlanningRow
                icon={<CalendarIcon color={colors.textSecondary} size={19} />}
                label="Pick a date…"
                value=""
                onPress={() => setShowDatePicker(true)}
              />
            </View>
            {deadline ? (
              <View style={styles.optionGroup}>
                <PlanningRow
                  icon={<ClockIcon color={colors.textSecondary} size={19} />}
                  label={time ? "Time" : "Add time"}
                  value={time ? formatTime12h(time) : ""}
                  onPress={() => setShowTimePicker(true)}
                />
                <Pressable
                  onPress={() => chooseDeadline("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear schedule"
                  style={({ pressed }) => [styles.clearSchedule, pressed && styles.pressed]}
                >
                  <TrashIcon color={colors.error} size={17} />
                  <Text style={styles.clearScheduleText}>Clear schedule</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.schedulePreview}>
              <Text style={styles.sectionKicker}>SCHEDULE PREVIEW</Text>
              <Text style={styles.previewValue}>{planningWhen}</Text>
              <Text style={styles.previewDetail}>{deadline ? humanDate(deadline) : "Returns this task to Inbox"}</Text>
            </View>
          </ScrollView>
        </>
      );
    };

    const renderPriorityPicker = () => (
      <>
        {renderPickerHeader("Priority")}
        <ScrollView contentContainerStyle={styles.pickerContent}>
          <View style={styles.optionGroup}>
            {PRIORITY_OPTIONS.map((option) => {
              const label = option.detail ? `${option.label} — ${option.detail}` : option.label;
              return (
                <PlanningRow
                  key={option.label}
                  icon={<View style={[styles.priorityDot, { backgroundColor: priorityDotColor(option.value) }]} />}
                  label={label}
                  value=""
                  selected={priority === option.value}
                  onPress={() => {
                    setPriority(option.value);
                    setMode("inspector");
                    haptic.selection();
                  }}
                />
              );
            })}
          </View>
          <Text style={styles.helperText}>Set priority to help focus on what matters most.</Text>
        </ScrollView>
      </>
    );

    const renderGoalPicker = () => (
      <>
        {renderPickerHeader("Goal")}
        <View style={styles.searchWrap}>
          <SearchField
            value={goalQuery}
            onChangeText={setGoalQuery}
            placeholder="Search goals…"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search goals"
            autoFocus
          />
        </View>
        <ScrollView contentContainerStyle={styles.goalList} keyboardShouldPersistTaps="handled">
          <PlanningRow
            icon={<NavGoalsAsset color={colors.textMuted} width={19} height={19} />}
            label="No goal"
            value=""
            selected={!draftGoalId}
            onPress={() => {
              setDraftGoalId(null);
              setMode("inspector");
              Keyboard.dismiss();
              haptic.selection();
            }}
          />
          {filteredGoals.map((goal) => (
            <PlanningRow
              key={goal.id}
              icon={<NavGoalsAsset color={colors.accent} width={19} height={19} />}
              label={goal.text}
              value=""
              selected={draftGoalId === goal.id}
              onPress={() => {
                setDraftGoalId(goal.id);
                setMode("inspector");
                Keyboard.dismiss();
                haptic.selection();
              }}
            />
          ))}
          {filteredGoals.length === 0 ? (
            <Text style={styles.emptySearch}>No Goals match “{goalQuery.trim()}”.</Text>
          ) : null}
        </ScrollView>
      </>
    );

    const renderDetails = () => (
      <>
        {renderPickerHeader("Task details")}
        <ScrollView contentContainerStyle={styles.pickerContent}>
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Created</Text>
              <Text style={styles.detailValue}>{formatTimestamp(currentTask?.createdAt) ?? "Unknown"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Last updated</Text>
              <Text style={styles.detailValue}>{formatTimestamp(currentTask?.updatedAt) ?? "Unknown"}</Text>
            </View>
            {currentTask?.completedAt ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Completed</Text>
                <Text style={styles.detailValue}>{formatTimestamp(currentTask.completedAt)}</Text>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Captured in</Text>
              <Text style={styles.detailValue}>{initialDraft?.deadline ? "Timeline" : "Inbox"}</Text>
            </View>
          </View>
        </ScrollView>
      </>
    );

    const renderInspector = () => (
      <>
        {renderUtilityHeader()}
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleBlock}>
            {titleEditing && !completed ? (
              <TextInput
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  setError(null);
                }}
                placeholder="Task title"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Task title"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => setTitleEditing(false)}
                onBlur={() => setTitleEditing(false)}
                style={styles.titleInput}
              />
            ) : (
              <Pressable
                disabled={completed}
                onPress={() => setTitleEditing(true)}
                accessibilityRole={completed ? undefined : "button"}
                accessibilityLabel={completed ? undefined : "Edit task title"}
                style={({ pressed }) => [styles.titlePressable, pressed && !completed && styles.pressed]}
              >
                <Text style={styles.titleText}>{title || "Untitled task"}</Text>
                {!completed ? <PencilIcon color={colors.textMuted} size={17} /> : null}
              </Pressable>
            )}
            <Text style={[styles.statusLine, completed && { color: colors.success }]}>
              {statusLabel(taskState, deadline, currentTask?.completedAt)}
            </Text>
          </View>

          <View style={styles.notesSection}>
            <Text style={styles.sectionLabel}>Notes</Text>
            {notesEditing && !completed ? (
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Add notes"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Task notes"
                autoFocus
                multiline
                textAlignVertical="top"
                onBlur={() => setNotesEditing(false)}
                style={styles.notesInput}
              />
            ) : (
              <Pressable
                disabled={completed}
                onPress={() => setNotesEditing(true)}
                accessibilityRole={completed ? undefined : "button"}
                accessibilityLabel={completed ? undefined : "Edit task notes"}
                style={({ pressed }) => [styles.notesPreview, pressed && !completed && styles.pressed]}
              >
                <Text
                  style={[styles.notesText, !description && styles.emptyValue]}
                  numberOfLines={description ? 3 : 1}
                >
                  {description || "Add notes"}
                </Text>
              </Pressable>
            )}
          </View>

          {currentTask && (!completed || currentTask.imageCollection?.active.length) ? (
            <View style={styles.imagesSection}>
              <Text style={styles.sectionLabel}>Task images</Text>
              <TaskImageFilmstrip
                images={currentTask.imageCollection?.active ?? []}
                resolveDelivery={resolveTaskImage}
                onSelectSource={onSelectTaskImage
                  ? async (kind) => {
                      const result = await onSelectTaskImage({
                        taskId: currentTask._id,
                        expectedRevision: currentTask.imageCollection?.revision ?? 0,
                        kind,
                      });
                      if (!result) return;
                      const { stale: _, ...imageCollection } = result;
                      setCurrentTask((previous) => previous
                        ? { ...previous, imageCollection }
                        : previous);
                    }
                  : undefined}
                onCaptionChange={!completed && onCaptionTaskImage
                  ? (taskImageId, caption) => {
                      const revision = currentTask.imageCollection?.revision ?? 0;
                      void (async () => {
                        try {
                          const result = await onCaptionTaskImage({ taskImageId, caption, expectedRevision: revision });
                          if (!result) return;
                          const { stale: _, ...imageCollection } = result;
                          setCurrentTask((previous) => previous ? { ...previous, imageCollection } : previous);
                        } catch {
                          setError("Couldn’t update Task image. Try again.");
                        }
                      })();
                    }
                  : undefined}
                onReorder={!completed && onReorderTaskImages
                  ? (taskImageId, direction) => {
                      const active = [...(currentTask.imageCollection?.active ?? [])].sort(
                        (left, right) => left.position - right.position,
                      );
                      const index = active.findIndex((image) => image.taskImageId === taskImageId);
                      const nextIndex = direction === "up" ? index - 1 : index + 1;
                      if (index < 0 || nextIndex < 0 || nextIndex >= active.length) return;
                      [active[index], active[nextIndex]] = [active[nextIndex], active[index]];
                      const positioned = active.map((image, position) => ({ ...image, position }));
                      void (async () => {
                        try {
                          const result = await onReorderTaskImages({
                            taskId: currentTask._id,
                            orderedTaskImageIds: positioned.map((image) => image.taskImageId),
                            expectedRevision: currentTask.imageCollection?.revision ?? 0,
                          });
                          if (!result) return;
                          const { stale: _, ...imageCollection } = result;
                          setCurrentTask((previous) => previous ? { ...previous, imageCollection } : previous);
                        } catch {
                          setError("Couldn’t reorder Task images. Try again.");
                        }
                      })();
                    }
                  : undefined}
                onRemove={!completed && onRemoveTaskImage
                  ? (taskImageId) => {
                      void (async () => {
                        try {
                          const result = await onRemoveTaskImage({
                            taskImageId,
                            expectedRevision: currentTask.imageCollection?.revision ?? 0,
                          });
                          if (!result) return;
                          const { stale: _, ...imageCollection } = result;
                          setCurrentTask((previous) => previous ? { ...previous, imageCollection } : previous);
                        } catch {
                          setError("Couldn’t remove Task image. Try again.");
                        }
                      })();
                    }
                  : undefined}
              />
            </View>
          ) : null}

          <View style={styles.planningSection}>
            <Text style={styles.sectionLabel}>Planning</Text>
            <View style={styles.planningCard}>
              <PlanningRow
                icon={<CalendarIcon color={colors.textSecondary} size={18} />}
                label="When"
                value={planningWhen}
                onPress={completed ? undefined : () => setMode("when")}
              />
              <PlanningRow
                icon={<View style={[styles.priorityDot, { backgroundColor: priorityDotColor(priority) }]} />}
                label="Priority"
                value={planningPriority}
                valueColor={priority ? priorityDotColor(priority) : undefined}
                onPress={completed ? undefined : () => setMode("priority")}
              />
              <PlanningRow
                icon={<NavGoalsAsset color={draftGoalId ? colors.accent : colors.textMuted} width={18} height={18} />}
                label="Goal"
                value={planningGoal}
                onPress={completed ? undefined : () => setMode("goal")}
              />
            </View>
          </View>

          {completed ? (
            <View style={styles.readOnlyNotice}>
              <InfoCircleIcon color={colors.textMuted} size={16} />
              <Text style={styles.readOnlyText}>Editing is available after you reopen this task.</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
      </>
    );

    const renderFooter = () => {
      if (!taskId) return null;
      if (hasUnsavedChanges) {
        return (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <Pressable
              onPress={restoreInitialDraft}
              accessibilityRole="button"
              accessibilityLabel="Discard changes"
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>Discard</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel={saving ? "Saving changes" : "Save changes"}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSave && styles.primaryButtonDisabled,
                pressed && canSave && styles.pressed,
              ]}
            >
              <Text style={[styles.primaryButtonText, !canSave && styles.primaryButtonTextDisabled]}>
                {saving ? "Saving…" : "Save changes"}
              </Text>
            </Pressable>
          </View>
        );
      }

      if (completed) {
        return onReopen ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <Pressable
              onPress={() => {
                onReopen(taskId);
                closeModal();
              }}
              accessibilityRole="button"
              accessibilityLabel="Reopen task"
              style={({ pressed }) => [styles.primaryButton, styles.singleFooterButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Reopen task</Text>
            </Pressable>
          </View>
        ) : null;
      }

      return (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <Pressable
            onPress={() => {
              if (taskState === "timeline") {
                setDeadline("");
                setTime("");
                haptic.selection();
              } else {
                setMode("when");
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={taskState === "timeline" ? "Move task to Inbox" : "Schedule task"}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>
              {taskState === "timeline" ? "Move to Inbox" : "Schedule"}
            </Text>
          </Pressable>
          {onComplete ? (
            <Pressable
              onPress={() => {
                onComplete(taskId);
                closeModal();
              }}
              accessibilityRole="button"
              accessibilityLabel="Complete task"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Complete</Text>
            </Pressable>
          ) : null}
        </View>
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
        <KeyboardAvoidingView
          behavior="padding"
          automaticOffset
          style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
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
          <View style={styles.card} accessibilityViewIsModal>
            {mode === "inspector"
              ? renderInspector()
              : mode === "when"
                ? renderWhenPicker()
                : mode === "priority"
                  ? renderPriorityPicker()
                  : mode === "goal"
                    ? renderGoalPicker()
                    : renderDetails()}
            {renderFooter()}
          </View>
        </KeyboardAvoidingView>

        {showDatePicker ? (
          <ThemedDatePicker
            key={deadline || "today"}
            visible
            value={deadline || undefined}
            onSelect={(value) => {
              setShowDatePicker(false);
              chooseDeadline(value);
            }}
            onClose={() => setShowDatePicker(false)}
          />
        ) : null}
        {showTimePicker ? (
          <ThemedTimePicker
            visible
            value={time || undefined}
            onSelect={(value) => {
              setTime(value);
              setShowTimePicker(false);
              setMode("inspector");
            }}
            onClear={() => setTime("")}
            onClose={() => setShowTimePicker(false)}
          />
        ) : null}
      </Modal>
    );
  },
);

const styles = createThemedStyles({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.section,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "92%",
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  pressed: { opacity: 0.68 },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: spacing.sm,
  },
  utilityHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  pickerHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  utilityLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  moreGlyph: {
    ...typography.title,
    color: colors.textPrimary,
    letterSpacing: 1,
    transform: [{ rotate: "90deg" }],
  },
  pickerTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  overflowMenu: {
    alignSelf: "flex-end",
    marginRight: spacing.md,
    marginBottom: spacing.sm,
    minWidth: 190,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgFloating,
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  menuItemText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  imagesSection: {
    gap: spacing.sm,
  },
  titleBlock: { gap: spacing.xs },
  titlePressable: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleText: {
    flex: 1,
    ...typography.headline,
    color: colors.textPrimary,
  },
  titleInput: {
    minHeight: 44,
    ...typography.headline,
    color: colors.textPrimary,
    paddingHorizontal: 0,
    paddingVertical: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  statusLine: {
    ...typography.micro,
    color: colors.accent,
    letterSpacing: 0.7,
  },
  notesSection: { gap: spacing.sm },
  sectionLabel: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  notesPreview: {
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bgInput,
  },
  notesText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  emptyValue: { color: colors.textMuted },
  notesInput: {
    minHeight: 96,
    maxHeight: 180,
    ...typography.bodyMd,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bgInput,
  },
  planningSection: { gap: spacing.sm },
  planningCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
  },
  planningRow: {
    minHeight: 50,
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
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  planningValue: {
    flex: 1,
    textAlign: "right",
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  readOnlyNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  readOnlyText: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  errorText: {
    ...typography.bodyMd,
    color: colors.error,
  },
  footer: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  secondaryButtonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
  },
  singleFooterButton: { flex: 1 },
  primaryButtonDisabled: { backgroundColor: colors.border },
  primaryButtonText: {
    ...typography.bodyMd,
    color: colors.textInverse,
    fontWeight: "700",
  },
  primaryButtonTextDisabled: { color: colors.textMuted },
  pickerContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  optionGroup: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
  },
  clearSchedule: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  clearScheduleText: {
    ...typography.bodyMd,
    color: colors.error,
  },
  schedulePreview: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentSoft,
    backgroundColor: colors.accentDim,
  },
  sectionKicker: {
    ...typography.micro,
    color: colors.accent,
    letterSpacing: 0.7,
  },
  previewValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  previewDetail: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  helperText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  searchWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  goalList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  emptySearch: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  detailsCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
  },
  detailRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  detailLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
});
