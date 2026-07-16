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
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import NavGoalsAsset from "../assets/icons/nav-goals.svg";
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
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
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
  /**
   * Drives the Modal. Kept separate from `goal` so the parent can close the
   * sheet without nulling the content — otherwise the slide-out animation
   * plays over a blank page.
   */
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
  const [showDone, setShowDone] = useState(false);
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
      setShowDone(false);
    }
  }
  const hasTasks = progress.total > 0;
  const isComplete = hasTasks && progress.done === progress.total;

  const todayIso = toIsoDate(new Date());
  const { groups, done } = useMemo(
    () => groupLinkedTasks(linked, todayIso),
    [linked, todayIso]
  );

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
    const goalId = goal.id;
    onClose();
    setTimeout(() => onCreateTaskForGoal(goalId), 280);
  }, [goal, onClose, onCreateTaskForGoal]);

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

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType={reducedMotion ? "none" : "slide"}
      onRequestClose={selectMode ? exitSelectMode : onClose}
    >
      <View style={detailStyles.backdrop}>
        {goal ? (
          // The Modal's slide is the entrance; no second animation on top.
          <View style={detailStyles.card}>
            {/* Identity: title, notes, one meta line over the progress rule. */}
            <View style={[detailStyles.headerBlock, { paddingTop: Math.max(insets.top, spacing.lg) }]}>
              <View style={detailStyles.titleRow}>
                <Text style={detailStyles.title} numberOfLines={2}>{goal.text}</Text>
                <Pressable
                  onPress={onOpenSettings}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Goal settings"
                  style={({ pressed }) => [detailStyles.iconBtn, pressed && { opacity: 0.6 }]}
                >
                  <PencilIcon size={16} color={colors.textSecondary} strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close goal details"
                  style={({ pressed }) => [detailStyles.iconBtn, pressed && { opacity: 0.6 }]}
                >
                  <CloseIcon size={16} color={colors.textSecondary} strokeWidth={1.9} />
                </Pressable>
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

            <ScrollView
              style={detailStyles.scrollArea}
              contentContainerStyle={[
                detailStyles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, spacing.lg) + (selectMode ? 76 : 0) },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {groups.map((group) => (
                <View key={group.key}>
                  <Text style={detailStyles.groupLabel}>{group.label}</Text>
                  {group.tasks.map((task) => (
                    <GoalTaskRow
                      key={String(task._id)}
                      task={task}
                      overdue={group.key === "overdue"}
                      selectMode={selectMode}
                      selected={selectedIds.has(String(task._id))}
                      onPress={() => onOpenTask(task)}
                      onLongPress={() => enterSelectMode(task)}
                      onToggleSelect={() => toggleSelected(task)}
                      onSchedule={onScheduleToDate ? () => setScheduleTask(task) : undefined}
                    />
                  ))}
                </View>
              ))}

              {hasTasks ? null : (
                <Text style={detailStyles.noTasksHint}>
                  Open Capture, pick a goal while adding a task to link it here.
                </Text>
              )}

              {onCreateTaskForGoal && !selectMode ? (
                <Pressable
                  onPress={handlePlanNext}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Plan next task for ${goal.text}`}
                  style={({ pressed }) => [detailStyles.planNextRow, pressed && { opacity: 0.6 }]}
                >
                  <PlusIcon size={15} color={colors.accent} strokeWidth={2.2} />
                  <Text style={detailStyles.planNextText}>Plan next task</Text>
                </Pressable>
              ) : null}

              {/* Finished work: evidence, not workbench — collapsed by default. */}
              {done.length > 0 ? (
                <View style={detailStyles.doneSection}>
                  <Pressable
                    onPress={() => setShowDone((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showDone }}
                    accessibilityLabel={`${done.length} done ${done.length === 1 ? "task" : "tasks"}`}
                    style={({ pressed }) => [detailStyles.doneToggle, pressed && { opacity: 0.6 }]}
                  >
                    {showDone ? (
                      <ChevronDownIcon size={14} color={colors.textMuted} strokeWidth={2} />
                    ) : (
                      <ChevronRightIcon size={14} color={colors.textMuted} strokeWidth={2} />
                    )}
                    <Text style={detailStyles.doneToggleText}>{done.length} done</Text>
                  </Pressable>
                  {showDone
                    ? done.map((task) => (
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
                      ))
                    : null}
                </View>
              ) : null}
            </ScrollView>

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
      </View>
    </Modal>
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
}: GoalsScreenProps) {
  const reducedMotion = useReducedMotion();
  const confirm = useConfirm();
  const { deleteGoal, updateGoal } = useGoalMutations();
  const { goals, isHydrated } = useGoals();
  const links = useGoalLinks();
  // Two ids on purpose: `selectedGoalId` drives the Modal's visibility and
  // nulls on close; `renderGoalId` keeps the last-opened goal so the sheet
  // still has content while its slide-out animation plays.
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [renderGoalId, setRenderGoalId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const appliedFocusGoalIdRef = useRef<string | null>(null);

  const openGoalSheet = useCallback((goalId: string) => {
    setSelectedGoalId(goalId);
    setRenderGoalId(goalId);
  }, []);

  // The goal detail is a native Modal that stacks above the bottom-sheet
  // editor, so close it first and let it dismiss before opening the task.
  const handleOpenTask = useCallback(
    (task: MobileTask) => {
      if (!onOpenTask) return;
      setSelectedGoalId(null);
      setTimeout(() => onOpenTask(task), 280);
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
      deleteGoal(goal.id);
      setSettingsOpen(false);
      setSelectedGoalId(null);
      haptic.success();
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
          <Text style={styles.emptyActionText}>New goal</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );

  const footerHint = (
    <Text style={styles.footerHint}>Goals sync across your devices.</Text>
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
                  <Text style={styles.newGoalActionText}>New goal</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={isHydrated ? emptyBlock : null}
        ListFooterComponent={sortedGoals.length > 0 ? footerHint : null}
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
                          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                        >
                          <Text style={styles.planNextActionText}>Plan next task</Text>
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
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  newGoalActionText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontFamily: typography.title.fontFamily,
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
  planNextActionText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontFamily: typography.title.fontFamily,
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
    minHeight: 44,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  emptyActionText: {
    ...typography.bodyMd,
    color: colors.textInverse,
    fontFamily: typography.title.fontFamily,
  },
  footerHint: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingTop: spacing.md,
  },
});

const detailStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  card: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  headerBlock: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    ...typography.headline,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
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
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
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
  planNextRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  planNextText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontWeight: "600",
  },
  doneSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.xs,
  },
  doneToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  doneToggleText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    fontWeight: "600",
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
