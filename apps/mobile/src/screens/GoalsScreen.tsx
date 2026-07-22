/**
 * GoalsScreen
 *
 * Mobile parity with web LongTermGoalsPage: a local list of long-horizon
 * goals persisted to AsyncStorage. Mobile-only addition: each goal can have
 * tasks linked to it via goalLinksStore (also local). The screen surfaces
 * "X of Y done" + a thin progress bar per goal and expands to show the
 * linked tasks inline.
 *
 * Reordering by drag is intentionally absent: react-native-draggable-flatlist
 * is currently incompatible with Reanimated 4 in this app (see InboxScreen
 * comment). Delete-and-readd is the manual reorder path until that's fixed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import NavGoalsAsset from "../assets/icons/nav-goals.svg";
import AddNewGoalAsset from "../assets/icons/add-new-goal.svg";
import AddNewTaskAsset from "../assets/icons/add-new-task.svg";
import { haptic } from "../lib/haptic";
import { shortDate, toIsoDate } from "../lib/dates";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts, radii, spacing, typography } from "../theme/tokens";
import type { GoalItem } from "../lib/goalsStorage";
import { useGoals, useGoalLinks } from "../hooks/useGoals";
import { useGoalMutations } from "../hooks/useGoalMutations";
import { useConfirm } from "../hooks/useConfirm";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { MobileTask } from "../components/TaskCard";
import { isTaskCompleted } from "../lib/taskState";
import { groupLinkedTasks } from "../lib/goalTasks";
import { GoalTaskRow } from "../components/GoalTaskRow";
import { GoalSettingsSheet } from "../components/GoalSettingsSheet";
import { QuickScheduleSheet } from "../components/QuickScheduleSheet";
import {
  AdjustmentsIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  UnlinkIcon,
} from "../components/UiIcons";

type DeadlineStatus = "overdue" | "soon" | "normal";
function deadlineStatus(iso: string): DeadlineStatus {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "normal";
  const deadline = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (deadline.getTime() - today.getTime()) / 86400000;
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "soon";
  return "normal";
}

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

const PRIORITY_LABEL: Record<"p1" | "p2" | "p3", { label: string; color: string }> = {
  p1: { label: "P1", color: colors.priorityP1 },
  p2: { label: "P2", color: colors.priorityP2 },
  p3: { label: "P3", color: colors.priorityP3 },
};

function GoalIcon({
  color = colors.accent,
  size = 22,
}: {
  color?: string;
  size?: number;
}) {
  return <NavGoalsAsset color={color} width={size} height={size} />;
}

/**
 * `thin` draws the 2px rule the list card sits the title on — there the bar is
 * structure (the title's underline), not a widget. The detail sheet keeps the
 * 4px track, where it's a component in its own right.
 */
function GoalProgressBar({
  ratio,
  isComplete,
  isLoading,
  thin,
}: {
  ratio: number;
  isComplete: boolean;
  isLoading?: boolean;
  thin?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      progress.value = ratio;
      return;
    }
    progress.value = withTiming(ratio, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [ratio, progress, reducedMotion]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${(isLoading ? 0.3 : progress.value) * 100}%`,
  }));
  return (
    <View
      style={[styles.progressTrack, thin && styles.progressTrackThin]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={
        isLoading
          ? { text: "Loading goal progress" }
          : {
              min: 0,
              max: 100,
              now: Math.round(ratio * 100),
              text: `${Math.round(ratio * 100)} percent complete`,
            }
      }
    >
      <Animated.View
        style={[
          styles.progressFill,
          isLoading && styles.progressFillLoading,
          isComplete && styles.progressFillComplete,
          fillStyle,
        ]}
      />
    </View>
  );
}

type GoalDetailSheetProps = {
  /** Drives the focused workspace layer inside the Goals tab. */
  visible: boolean;
  goal: GoalItem | null;
  progress: GoalProgress;
  linked: MobileTask[];
  onClose: () => void;
  onOpenTask: (task: MobileTask) => void;
  /** Open the goal-settings sheet (title/notes/priority/deadline/delete). */
  onOpenSettings: () => void;
  onCreateTaskForGoal?: (goalId: string) => void;
  /** Move a linked task to an ISO day (also lifts it out of the inbox). */
  onScheduleToDate?: (taskId: MobileTask["_id"], isoDate: string) => void;
  /** Mark a batch of linked tasks done; resolves true on success. */
  onMarkManyDone?: (taskIds: MobileTask["_id"][]) => Promise<boolean>;
};

/**
 * The goal's workbench: what is left, in the order it will be hit, with the
 * acting done in place. Rows share the inbox grammar — tap opens the editor,
 * the trailing date/calendar opens the quick-schedule sheet, long-press enters
 * select mode where a floating bar offers Mark done and Unlink. The goal's
 * identity fields and delete live behind the pencil, in GoalSettingsSheet.
 */
function GoalDetailSheet({
  visible,
  goal,
  progress,
  linked,
  onClose,
  onOpenTask,
  onOpenSettings,
  onCreateTaskForGoal,
  onScheduleToDate,
  onMarkManyDone,
}: GoalDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const confirm = useConfirm();
  const { setGoalLink } = useGoalMutations();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [scheduleTask, setScheduleTask] = useState<MobileTask | null>(null);
  const [taskFilter, setTaskFilter] = useState<"open" | "done">("open");
  const [sortControlsOpen, setSortControlsOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"plan" | "newest">("plan");
  // Reset interaction state on open (adjust-during-render, per React docs) —
  // the sheet stays mounted across open/close so the exit animation keeps its
  // content, which means state no longer resets by remount.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSelectMode(false);
      setSelectedIds(new Set());
      setScheduleTask(null);
      setTaskFilter("open");
      setSortControlsOpen(false);
    }
  }
  const hasTasks = progress.total > 0;
  const isComplete = hasTasks && progress.done === progress.total;

  const todayIso = toIsoDate(new Date());
  const { groups, done } = useMemo(
    () => groupLinkedTasks(linked, todayIso),
    [linked, todayIso]
  );
  const { nextTasks, unscheduledTasks } = useMemo(() => {
    const sort = (tasks: MobileTask[]) =>
      sortMode === "newest"
        ? [...tasks].sort((a, b) => b.createdAt - a.createdAt)
        : tasks;
    return {
      nextTasks: sort(groups.filter((group) => group.key !== "nodate").flatMap((group) => group.tasks)),
      unscheduledTasks: sort(groups.find((group) => group.key === "nodate")?.tasks ?? []),
    };
  }, [groups, sortMode]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const enterSelectMode = useCallback((task: MobileTask) => {
    setSelectMode(true);
    setSelectedIds(new Set([String(task._id)]));
  }, []);

  const toggleSelected = useCallback((task: MobileTask) => {
    const key = String(task._id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Done tasks are selectable too (bulk unlink must reach them), so "mark
  // done" counts only the open selection and disables itself at zero.
  const selectedOpen = useMemo(
    () =>
      groups
        .flatMap((group) => group.tasks)
        .filter((task) => selectedIds.has(String(task._id))),
    [groups, selectedIds]
  );
  const selectedCount = selectedIds.size;

  const handleMarkDone = useCallback(async () => {
    if (!onMarkManyDone) return;
    const ids = selectedOpen.map((task) => task._id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: ids.length === 1 ? "Mark this task as done?" : `Mark ${ids.length} tasks as done?`,
      confirmLabel: "Mark done",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    const success = await onMarkManyDone(ids);
    if (success) exitSelectMode();
  }, [selectedOpen, confirm, onMarkManyDone, exitSelectMode]);

  const handleUnlinkSelected = useCallback(async () => {
    const ids = linked
      .filter((task) => selectedIds.has(String(task._id)))
      .map((task) => String(task._id));
    if (ids.length === 0) return;
    const ok = await confirm({
      title:
        ids.length === 1
          ? "Unlink this task from the goal?"
          : `Unlink ${ids.length} tasks from this goal?`,
      message: "Unlinked tasks stay in your timeline and inbox.",
      confirmLabel: "Unlink",
      destructive: true,
    });
    if (!ok) return;
    for (const id of ids) setGoalLink(id, null);
    haptic.light();
    exitSelectMode();
  }, [linked, selectedIds, confirm, setGoalLink, exitSelectMode]);

  const handlePlanNext = useCallback(() => {
    if (!goal || !onCreateTaskForGoal) return;
    onCreateTaskForGoal(goal.id);
  }, [goal, onCreateTaskForGoal]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectMode) exitSelectMode();
      else onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, selectMode, exitSelectMode, onClose]);

  // One line of metadata over the progress rule: priority, deadline, count.
  // Each segment keeps its own ink; separators stay muted.
  const metaSegments: { key: string; text: string; color: string }[] = [];
  if (goal?.priority) {
    metaSegments.push({
      key: "priority",
      text: PRIORITY_LABEL[goal.priority].label,
      color: PRIORITY_LABEL[goal.priority].color,
    });
  }
  if (goal?.deadline) {
    const ds = deadlineStatus(goal.deadline);
    metaSegments.push({
      key: "deadline",
      text:
        ds === "overdue"
          ? `Overdue ${shortDate(goal.deadline)}`
          : `Due ${shortDate(goal.deadline)}`,
      color: ds === "overdue" ? colors.error : ds === "soon" ? colors.warning : colors.textMuted,
    });
  }
  metaSegments.push({
    key: "count",
    text: hasTasks ? `${progress.done} of ${progress.total} done` : "No tasks linked",
    color: colors.textSecondary,
  });

  if (!visible) return null;

  return (
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(180)}
        style={detailStyles.backdrop}
      >
        {goal ? (
          <View style={detailStyles.card}>
            <View style={[detailStyles.headerBlock, { paddingTop: spacing.sm }]}>
              <View style={detailStyles.navRow}>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Back to goals"
                  style={({ pressed }) => [detailStyles.backButton, pressed && { opacity: 0.6 }]}
                >
                  <ChevronLeftIcon size={22} color={colors.textPrimary} strokeWidth={2} />
                  <Text style={detailStyles.backLabel}>Goal</Text>
                </Pressable>
                <Pressable
                  onPress={onOpenSettings}
                  accessibilityRole="button"
                  accessibilityLabel="Goal settings"
                  style={({ pressed }) => [detailStyles.iconBtn, pressed && { opacity: 0.6 }]}
                >
                  <Text style={detailStyles.moreText}>⋮</Text>
                </Pressable>
              </View>
              <View style={detailStyles.titleRow}>
                <Text style={detailStyles.title} numberOfLines={2}>{goal.text}</Text>
              </View>
              {goal.description ? (
                <Text style={detailStyles.description} numberOfLines={2}>
                  {goal.description}
                </Text>
              ) : null}
              <Text style={detailStyles.metaLine}>
                {metaSegments.map((seg, index) => (
                  <Text key={seg.key}>
                    {index > 0 ? <Text style={detailStyles.metaSeparator}>{"  ·  "}</Text> : null}
                    <Text style={{ color: seg.color }}>{seg.text}</Text>
                  </Text>
                ))}
              </Text>
              <GoalProgressBar ratio={progress.ratio} isComplete={isComplete} />
            </View>

            <View style={detailStyles.filterRow}>
              <Pressable
                onPress={() => setTaskFilter("open")}
                accessibilityRole="tab"
                accessibilityState={{ selected: taskFilter === "open" }}
                style={detailStyles.filterTab}
              >
                <Text style={[detailStyles.filterText, taskFilter === "open" && detailStyles.filterTextActive]}>
                  Open {groups.reduce((sum, group) => sum + group.tasks.length, 0)}
                </Text>
                {taskFilter === "open" ? <View style={detailStyles.filterIndicator} /> : null}
              </Pressable>
              <Pressable
                onPress={() => setTaskFilter("done")}
                accessibilityRole="tab"
                accessibilityState={{ selected: taskFilter === "done" }}
                style={detailStyles.filterTab}
              >
                <Text style={[detailStyles.filterText, taskFilter === "done" && detailStyles.filterTextActive]}>
                  Done {done.length}
                </Text>
                {taskFilter === "done" ? <View style={detailStyles.filterIndicator} /> : null}
              </Pressable>
              <Pressable
                onPress={() => setSortControlsOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel="Sort goal tasks"
                accessibilityState={{ expanded: sortControlsOpen }}
                style={({ pressed }) => [detailStyles.sortButton, pressed && { opacity: 0.6 }]}
              >
                <AdjustmentsIcon color={colors.textSecondary} size={20} strokeWidth={1.8} />
              </Pressable>
            </View>

            {sortControlsOpen ? (
              <View style={detailStyles.sortPanel}>
                <Text style={detailStyles.sortLabel}>Sort tasks</Text>
                {(["plan", "newest"] as const).map((mode) => {
                  const selected = sortMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => {
                        setSortMode(mode);
                        setSortControlsOpen(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [detailStyles.sortOption, pressed && { opacity: 0.65 }]}
                    >
                      <View style={[detailStyles.sortRadio, selected && detailStyles.sortRadioSelected]} />
                      <Text style={[detailStyles.sortOptionText, selected && detailStyles.sortOptionTextSelected]}>
                        {mode === "plan" ? "Plan order" : "Newest added"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <ScrollView
              style={detailStyles.scrollArea}
              contentContainerStyle={[
                detailStyles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, spacing.lg) + 84 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {taskFilter === "open" ? (
                <>
                  <View>
                    <Text style={detailStyles.groupLabel}>Next</Text>
                    {nextTasks.length > 0 ? nextTasks.map((task) => (
                    <GoalTaskRow
                      key={String(task._id)}
                      task={task}
                      overdue={Boolean(task.deadline && task.deadline < todayIso)}
                      selectMode={selectMode}
                      selected={selectedIds.has(String(task._id))}
                      onPress={() => onOpenTask(task)}
                      onLongPress={() => enterSelectMode(task)}
                      onToggleSelect={() => toggleSelected(task)}
                      onSchedule={onScheduleToDate ? () => setScheduleTask(task) : undefined}
                    />
                    )) : (
                      <Text style={detailStyles.emptyGroupText}>Nothing scheduled next.</Text>
                    )}
                  </View>
                  {unscheduledTasks.length > 0 ? (
                    <View>
                      <Text style={detailStyles.groupLabel}>Unscheduled {unscheduledTasks.length}</Text>
                      {unscheduledTasks.map((task) => (
                        <GoalTaskRow
                          key={String(task._id)}
                          task={task}
                          selectMode={selectMode}
                          selected={selectedIds.has(String(task._id))}
                          onPress={() => onOpenTask(task)}
                          onLongPress={() => enterSelectMode(task)}
                          onToggleSelect={() => toggleSelected(task)}
                          onSchedule={onScheduleToDate ? () => setScheduleTask(task) : undefined}
                        />
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}

              {taskFilter === "open" && !hasTasks ? (
                <Text style={detailStyles.noTasksHint}>
                  Add the first task that will move this goal forward.
                </Text>
              ) : null}

              {taskFilter === "done" ? (
                done.length > 0 ? (
                  <View>
                    <Text style={detailStyles.groupLabel}>Completed</Text>
                    {done.map((task) => (
                        <GoalTaskRow
                          key={String(task._id)}
                          task={task}
                          done
                          selectMode={selectMode}
                          selected={selectedIds.has(String(task._id))}
                          onPress={() => onOpenTask(task)}
                          onLongPress={() => enterSelectMode(task)}
                          onToggleSelect={() => toggleSelected(task)}
                        />
                    ))}
                  </View>
                ) : (
                  <Text style={detailStyles.noTasksHint}>Completed tasks will collect here.</Text>
                )
              ) : null}
            </ScrollView>

            {onCreateTaskForGoal && !selectMode ? (
              <View style={[detailStyles.addDock, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
                <Pressable
                  onPress={handlePlanNext}
                  accessibilityRole="button"
                  accessibilityLabel={`Add task to ${goal.text}`}
                  style={({ pressed }) => [detailStyles.addButton, pressed && { opacity: 0.86 }]}
                >
                  <AddNewTaskAsset width={22} height={22} color={colors.textInverse} />
                  <Text style={detailStyles.addButtonText}>Add task</Text>
                </Pressable>
              </View>
            ) : null}

            {selectMode ? (
              <Animated.View
                entering={reducedMotion ? undefined : FadeIn.duration(150)}
                exiting={reducedMotion ? undefined : FadeOut.duration(120)}
                style={[
                  detailStyles.bulkBar,
                  { bottom: Math.max(insets.bottom, spacing.md) + spacing.sm },
                ]}
              >
                <Pressable
                  onPress={exitSelectMode}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel selection"
                  style={({ pressed }) => [detailStyles.bulkCancel, pressed && { opacity: 0.7 }]}
                >
                  <CloseIcon size={16} color={colors.textSecondary} strokeWidth={1.9} />
                </Pressable>
                <Pressable
                  onPress={() => void handleUnlinkSelected()}
                  disabled={selectedCount === 0}
                  accessibilityRole="button"
                  accessibilityLabel={
                    selectedCount <= 1
                      ? "Unlink task from goal"
                      : `Unlink ${selectedCount} tasks from goal`
                  }
                  style={({ pressed }) => [
                    detailStyles.bulkUnlink,
                    pressed && selectedCount > 0 && { opacity: 0.7 },
                  ]}
                >
                  <UnlinkIcon
                    size={15}
                    strokeWidth={1.9}
                    color={selectedCount === 0 ? colors.textMuted : colors.error}
                  />
                  <Text
                    style={[
                      detailStyles.bulkUnlinkText,
                      selectedCount === 0 && detailStyles.bulkTextDisabled,
                    ]}
                  >
                    {selectedCount === 0 ? "Unlink" : `Unlink ${selectedCount}`}
                  </Text>
                </Pressable>
                {onMarkManyDone ? (
                  <Pressable
                    onPress={() => void handleMarkDone()}
                    disabled={selectedOpen.length === 0}
                    accessibilityRole="button"
                    accessibilityLabel={
                      selectedOpen.length <= 1
                        ? "Mark task as done"
                        : `Mark ${selectedOpen.length} tasks as done`
                    }
                    style={({ pressed }) => [
                      detailStyles.bulkDone,
                      selectedOpen.length === 0 && detailStyles.bulkDoneDisabled,
                      pressed && selectedOpen.length > 0 && { opacity: 0.85 },
                    ]}
                  >
                    <CheckIcon
                      size={16}
                      strokeWidth={2.4}
                      color={selectedOpen.length === 0 ? colors.textMuted : colors.textInverse}
                    />
                    <Text
                      style={[
                        detailStyles.bulkDoneText,
                        selectedOpen.length === 0 && detailStyles.bulkTextDisabled,
                      ]}
                    >
                      {selectedOpen.length === 0
                        ? "Mark done"
                        : selectedOpen.length === 1
                          ? "Mark 1 done"
                          : `Mark ${selectedOpen.length} done`}
                    </Text>
                  </Pressable>
                ) : null}
              </Animated.View>
            ) : null}

            <QuickScheduleSheet
              visible={scheduleTask !== null}
              taskTitle={scheduleTask?.title}
              onClose={() => setScheduleTask(null)}
              onPick={(iso) => {
                if (scheduleTask) onScheduleToDate?.(scheduleTask._id, iso);
              }}
            />
          </View>
        ) : null}
      </Animated.View>
  );
}

type GoalsScreenProps = {
  tabBarHeight: number;
  tasks: MobileTask[];
  isTaskDataLoading?: boolean;
  onCreateGoal?: () => void;
  onCreateTaskForGoal?: (goalId: string) => void;
  /** Open a linked task in the shared editor (edit / complete / delete). */
  onOpenTask?: (task: MobileTask) => void;
  /** Move a linked task to an ISO day from the detail sheet's quick-schedule. */
  onScheduleToDate?: (taskId: MobileTask["_id"], isoDate: string) => void;
  /** Bulk-complete linked tasks from the detail sheet's select mode. */
  onMarkManyDone?: (taskIds: MobileTask["_id"][]) => Promise<boolean>;
  /** Optional deep-link target for opening a specific goal detail. */
  focusGoalId?: string | null;
  /** Lets the app shell yield its tab bar while this focused workspace is open. */
  onDetailVisibilityChange?: (visible: boolean) => void;
};

type GoalProgress = {
  total: number;
  done: number;
  ratio: number;
};

export function GoalsScreen({
  tabBarHeight,
  tasks,
  isTaskDataLoading = false,
  onCreateGoal,
  onCreateTaskForGoal,
  onOpenTask,
  onScheduleToDate,
  onMarkManyDone,
  focusGoalId,
  onDetailVisibilityChange,
}: GoalsScreenProps) {
  const reducedMotion = useReducedMotion();
  const confirm = useConfirm();
  const { deleteGoal, updateGoal } = useGoalMutations();
  const { goals, isHydrated } = useGoals();
  const links = useGoalLinks();
  // Keep the rendered goal separate from visibility so nested sheets can
  // finish dismissing without briefly replacing the workspace content.
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [renderGoalId, setRenderGoalId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const appliedFocusGoalIdRef = useRef<string | null>(null);

  useEffect(() => {
    onDetailVisibilityChange?.(selectedGoalId !== null);
    return () => onDetailVisibilityChange?.(false);
  }, [selectedGoalId, onDetailVisibilityChange]);

  const openGoalSheet = useCallback((goalId: string) => {
    setSelectedGoalId(goalId);
    setRenderGoalId(goalId);
  }, []);

  const handleOpenTask = useCallback(
    (task: MobileTask) => {
      if (!onOpenTask) return;
      onOpenTask(task);
    },
    [onOpenTask]
  );

  // Map goalId -> linked MobileTask[], filtered by current task list so orphan
  // links (task deleted) silently drop out. Unordered: the list card only
  // counts, and the detail sheet imposes its own deadline order.
  const tasksByGoal = useMemo(() => {
    const out = new Map<string, MobileTask[]>();
    const taskById = new Map(tasks.map((t) => [String(t._id), t]));
    for (const [taskId, goalId] of Object.entries(links)) {
      const t = taskById.get(taskId);
      if (!t) continue;
      const list = out.get(goalId) ?? [];
      list.push(t);
      out.set(goalId, list);
    }
    return out;
  }, [tasks, links]);

  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      const pr = (PRIORITY_RANK[a.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.priority ?? ""] ?? 3);
      if (pr !== 0) return pr;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
  }, [goals]);

  const progressByGoal = useMemo(() => {
    const out = new Map<string, GoalProgress>();
    for (const g of goals) {
      const list = tasksByGoal.get(g.id) ?? [];
      const total = list.length;
      const done = list.filter(isTaskCompleted).length;
      const ratio = total === 0 ? 0 : done / total;
      out.set(g.id, { total, done, ratio });
    }
    return out;
  }, [goals, tasksByGoal]);

  // The settings sheet owns the delete confirmation (it knows the linked
  // count); by the time this runs the user has already agreed.
  const handleDeleteGoal = useCallback(
    (goal: GoalItem) => {
      setSettingsOpen(false);
      setSelectedGoalId(null);
      haptic.success();
      // Keep the selected goal in the synced store until both native modals
      // finish sliding out; otherwise their retained render id resolves blank.
      setTimeout(() => deleteGoal(goal.id), 280);
    },
    [deleteGoal],
  );

  // The list row's long-press shortcut skips the settings sheet, so it must
  // carry its own confirmation. Same copy as GoalSettingsSheet's.
  const handleDeleteShortcut = useCallback(
    async (goal: GoalItem) => {
      const linkedCount = tasksByGoal.get(goal.id)?.length ?? 0;
      const ok = await confirm({
        title: "Delete goal?",
        message:
          linkedCount > 0
            ? `${goal.text}\n\n${linkedCount} linked ${linkedCount === 1 ? "task" : "tasks"} will be unlinked but kept.`
            : goal.text,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      deleteGoal(goal.id);
      haptic.success();
    },
    [confirm, deleteGoal, tasksByGoal],
  );

  const emptyBlock = (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(400)} style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <GoalIcon color={colors.textSecondary} size={28} />
      </View>
      <Text style={styles.emptyTitle}>No goals yet.</Text>
      <Text style={styles.emptyText}>Choose one outcome you want to move.</Text>
      {onCreateGoal ? (
        <Pressable
          onPress={onCreateGoal}
          accessibilityRole="button"
          accessibilityLabel="Create a new goal"
          style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.75 }]}
        >
          <AddNewGoalAsset width={24} height={24} color={colors.textInverse} />
        </Pressable>
      ) : null}
    </Animated.View>
  );

  // Content follows renderGoalId (survives close); visibility follows
  // selectedGoalId.
  const selectedGoal = sortedGoals.find((g) => g.id === renderGoalId) ?? null;
  const selectedProgress = selectedGoal
    ? (progressByGoal.get(selectedGoal.id) ?? { total: 0, done: 0, ratio: 0 })
    : { total: 0, done: 0, ratio: 0 };
  const selectedLinked = selectedGoal ? (tasksByGoal.get(selectedGoal.id) ?? []) : [];

  useEffect(() => {
    if (!focusGoalId) return;
    if (!sortedGoals.some((goal) => goal.id === focusGoalId)) return;
    if (appliedFocusGoalIdRef.current === focusGoalId) return;
    appliedFocusGoalIdRef.current = focusGoalId;
    const timeout = setTimeout(() => openGoalSheet(focusGoalId), 0);
    return () => clearTimeout(timeout);
  }, [focusGoalId, sortedGoals, openGoalSheet]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList<GoalItem>
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        data={sortedGoals}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          sortedGoals.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={styles.sectionMeta}>{`${sortedGoals.length} active`}</Text>
              {onCreateGoal ? (
                <Pressable
                  onPress={onCreateGoal}
                  accessibilityRole="button"
                  accessibilityLabel="Create a new goal"
                  style={({ pressed }) => [styles.newGoalAction, pressed && { opacity: 0.7 }]}
                >
                  <AddNewGoalAsset width={24} height={24} color={colors.accent} />
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={isHydrated ? emptyBlock : null}
        renderItem={({ item, index }) => {
          const progress = progressByGoal.get(item.id) ?? { total: 0, done: 0, ratio: 0 };
          const hasTasks = progress.total > 0;
          const showLinkedLoading = isTaskDataLoading && !hasTasks;
          const isComplete = hasTasks && progress.done === progress.total;
          const priority = item.priority ? PRIORITY_LABEL[item.priority] : null;
          const countLabel = showLinkedLoading
            ? "Loading…"
            : isComplete
            ? "All done"
            : hasTasks
            ? `${progress.done} of ${progress.total} done`
            : "No tasks linked";
          return (
            <Animated.View
              entering={
                reducedMotion ? undefined : FadeInDown.duration(280).delay(index * 50)
              }
            >
              <View style={[styles.goalCard, isComplete && styles.goalCardComplete]}>
                <Pressable
                  onPress={() => { openGoalSheet(item.id); haptic.light(); }}
                  onLongPress={() => void handleDeleteShortcut(item)}
                  accessibilityRole="button"
                  // Tap opens the detail; the visible delete action lives in
                  // its settings sheet. Long-press stays a power-user shortcut.
                  accessibilityLabel={`Goal: ${item.text}. ${
                    priority ? `Priority ${priority.label}. ` : ""
                  }${countLabel}. Open goal details.`}
                  style={({ pressed }) => [styles.goalRow, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.goalTile}>
                    <GoalIcon color={isComplete ? colors.success : colors.accent} size={19} />
                  </View>
                  <View style={styles.goalBody}>
                    {/* The title line carries nothing but the title, so titles
                        stay aligned down a long list. */}
                    <View style={styles.goalTitleLine}>
                      <Text style={styles.goalText} numberOfLines={1}>{item.text}</Text>
                    </View>

                    <GoalProgressBar
                      ratio={progress.ratio}
                      isComplete={isComplete}
                      isLoading={showLinkedLoading}
                      thin
                    />

                    <View style={styles.goalMetaLine}>
                      <View style={styles.goalMetaLeft}>
                        {/* Priority reads twice — hue and the letters — so it
                            survives greyscale and a deuteranope's P1/P2. */}
                        {priority ? (
                          <>
                            <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
                            <Text style={[styles.priorityText, { color: priority.color }]}>
                              {priority.label}
                            </Text>
                            <Text style={styles.metaSep}>·</Text>
                          </>
                        ) : null}
                        <Text
                          style={[styles.goalMeta, isComplete && styles.goalMetaComplete]}
                          numberOfLines={1}
                        >
                          {countLabel}
                        </Text>
                      </View>
                      {onCreateTaskForGoal ? (
                        <Pressable
                          onPress={() => onCreateTaskForGoal(item.id)}
                          hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Plan next task for ${item.text}`}
                          style={({ pressed }) => [styles.planNextAction, pressed && { opacity: 0.6 }]}
                        >
                          <AddNewTaskAsset width={22} height={22} color={colors.accent} />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              </View>
            </Animated.View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
      <GoalDetailSheet
        visible={selectedGoalId !== null}
        goal={selectedGoal}
        progress={selectedProgress}
        linked={selectedLinked}
        onClose={() => {
          setSettingsOpen(false);
          setSelectedGoalId(null);
        }}
        onOpenTask={handleOpenTask}
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateTaskForGoal={onCreateTaskForGoal}
        onScheduleToDate={onScheduleToDate}
        onMarkManyDone={onMarkManyDone}
      />
      <GoalSettingsSheet
        visible={settingsOpen}
        goal={selectedGoal}
        linkedCount={selectedLinked.length}
        onClose={() => setSettingsOpen(false)}
        onSave={(fields) => {
          if (selectedGoal) updateGoal(selectedGoal.id, fields);
        }}
        onDelete={() => {
          if (selectedGoal) handleDeleteGoal(selectedGoal);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listHeader: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  // Sentence case — wayfinding, not log-line metadata.
  sectionMeta: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  newGoalAction: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  goalCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    overflow: "hidden",
  },
  goalCardComplete: {
    borderColor: colors.success,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  // Matches the settings category tile (SettingsSheet categoryIconWrap).
  goalTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  goalBody: {
    flex: 1,
    minWidth: 0,
  },
  goalTitleLine: {
    paddingBottom: 7,
  },
  goalText: {
    ...typography.bodyLg,
    color: colors.textPrimary,
  },
  goalMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: 6,
  },
  planNextAction: {
    width: 44,
    height: 44,
    marginVertical: -14,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgCardGlass,
    overflow: "hidden",
  },
  progressTrackThin: {
    height: 2,
    borderRadius: 1,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  progressFillComplete: {
    backgroundColor: colors.success,
  },
  progressFillLoading: {
    opacity: 0.45,
  },
  goalMetaLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    ...typography.micro,
    fontWeight: "700",
  },
  metaSep: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  goalMeta: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  goalMetaComplete: {
    color: colors.success,
  },
  emptyWrap: {
    paddingTop: spacing.section,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyAction: {
    width: 48,
    height: 48,
    marginTop: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
});

const detailStyles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    backgroundColor: colors.bg,
  },
  card: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  headerBlock: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  navRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  backButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginLeft: -spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  backLabel: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    ...typography.display,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 26,
    lineHeight: 30,
    color: colors.textSecondary,
  },
  description: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  metaLine: {
    ...typography.micro,
  },
  metaSeparator: {
    color: colors.textMuted,
  },
  filterRow: {
    height: 52,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  filterTab: {
    flex: 1,
    height: 52,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.accent,
  },
  filterIndicator: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  sortButton: {
    width: 56,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  sortPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  sortLabel: {
    ...typography.micro,
    color: colors.textMuted,
    marginRight: "auto",
  },
  sortOption: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sortRadio: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  sortRadioSelected: {
    borderWidth: 3.5,
    borderColor: colors.accent,
  },
  sortOptionText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  sortOptionTextSelected: {
    fontFamily: fonts.sansSemibold,
    color: colors.textPrimary,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  groupLabel: {
    ...typography.micro,
    color: colors.textMuted,
    marginBottom: 2,
  },
  noTasksHint: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  emptyGroupText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  addDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgFloating,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  addButton: {
    height: 52,
    borderRadius: radii.lg,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  addButtonText: {
    ...typography.title,
    color: colors.textInverse,
  },
  bulkBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bulkCancel: {
    width: 48,
    height: 52,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bulkUnlink: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bulkUnlinkText: {
    ...typography.bodyMd,
    fontWeight: "600",
    color: colors.error,
  },
  bulkDone: {
    flex: 1,
    height: 52,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bulkDoneDisabled: {
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bulkDoneText: {
    ...typography.bodyMd,
    fontWeight: "600",
    color: colors.textInverse,
  },
  bulkTextDisabled: {
    color: colors.textMuted,
  },
});
