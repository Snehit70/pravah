import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeIn } from "react-native-reanimated";
import { type RenderItemParams } from "react-native-draggable-flatlist";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import * as Haptics from "expo-haptics";
import { authClient, authStorageReady } from "./src/lib/auth-client";
import { useFonts as useFraunces, Fraunces_300Light } from "@expo-google-fonts/fraunces";
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from "@expo-google-fonts/manrope";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { ConvexClientProvider } from "./src/lib/convex";
import { addDays, dateLabel, isIsoDate, toIsoDate } from "./src/lib/dates";
import { classifyError, createActionId, mobileLogger } from "./src/lib/logger";

import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radii, spacing, typography } from "./src/theme/tokens";
import { TaskCard, type MobileTask } from "./src/components/TaskCard";
import { BottomTabBar, type TabKey } from "./src/components/BottomTabBar";
import { FAB } from "./src/components/FAB";
import { AddTaskSheet, type AddTaskSheetRef } from "./src/components/AddTaskSheet";
import { EditTaskSheet, type EditTaskSheetRef } from "./src/components/EditTaskSheet";
import { RootErrorBoundary } from "./src/components/RootErrorBoundary";
import { SettingsSheet } from "./src/components/SettingsSheet";
import { TaskTabContent } from "./src/components/TaskTabContent";
import { useRetryQueue, type RetryPayload } from "./src/hooks/useRetryQueue";
import { useGoogleAuth } from "./src/hooks/useGoogleAuth";
import { useNotificationsSettings } from "./src/hooks/useNotificationsSettings";
import { useIntegrationsSettings } from "./src/hooks/useIntegrationsSettings";
import {
  patchTaskInOptimisticView,
  removeTaskFromOptimisticView,
  reorderScopedTasksInOptimisticView,
} from "./src/lib/task-optimistic";

// ── Types ──────────────────────────────────────────────────────────────

type ToastState = {
  kind: "error" | "info";
  message: string;
};

type SuccessHaptic = "notification" | "light" | "medium";
type IntegrationProvider = "google_calendar" | "gmail";

// ── Helpers ────────────────────────────────────────────────────────────

function normalizeDeadlineInput(raw: string): { value?: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: undefined };
  if (!isIsoDate(trimmed)) {
    return { error: "Use YYYY-MM-DD for deadline." };
  }
  return { value: trimmed };
}

function getPriorityRank(priority?: "p1" | "p2" | "p3"): number {
  if (priority === "p1") return 0;
  if (priority === "p2") return 1;
  if (priority === "p3") return 2;
  return 3;
}

function hasPriorityBoundaryViolation(original: MobileTask[], reordered: MobileTask[]): boolean {
  if (original.length !== reordered.length) return true;
  for (let index = 0; index < original.length; index += 1) {
    if (getPriorityRank(original[index]?.priority) !== getPriorityRank(reordered[index]?.priority)) {
      return true;
    }
  }
  return false;
}

// ── Main App ───────────────────────────────────────────────────────────

function MobileApp() {
  const insets = useSafeAreaInsets();
  const addTaskSheetRef = useRef<AddTaskSheetRef>(null);
  const editTaskSheetRef = useRef<EditTaskSheetRef>(null);
  const appStartMsRef = useRef<number>(Date.now());
  const lastListStateLogMsRef = useRef<number>(0);
  const busyTaskIdsRef = useRef<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<MobileTask[] | null>(null);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDataBootstrapReady, setIsDataBootstrapReady] = useState(false);

  const sessionResult = authClient.useSession();
  const session = sessionResult.data;
  const sessionLoading = sessionResult.isPending;

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;

  // ── Dates ───────────────────────────────────────────────────────────

  const today = toIsoDate(new Date());
  const tomorrow = toIsoDate(addDays(new Date(), 1));
  const weekEnd = toIsoDate(addDays(new Date(), 6));

  // ── Data ────────────────────────────────────────────────────────────

  const inboxQuery = useQuery(
    api.tasks.listTasks,
    session && activeTab === "inbox" ? { status: "inbox" } : "skip"
  );
  const timelineQuery = useQuery(
    api.tasks.getTimeline,
    session && activeTab === "timeline" ? { startDate: today, endDate: weekEnd } : "skip"
  );
  const completedQuery = useQuery(
    api.tasks.listTasks,
    session && activeTab === "completed" ? { status: "completed" } : "skip"
  );
  const countsQuery = useQuery(api.tasks.getTaskCounts, session ? {} : "skip");

  const activeQueryTasks =
    activeTab === "inbox"
      ? inboxQuery
      : activeTab === "timeline"
        ? timelineQuery
        : completedQuery;
  const isActiveListLoading = activeQueryTasks === undefined;

  const serverTasks = useMemo<MobileTask[]>(() => {
    const activeDocs =
      activeTab === "timeline"
        ? Object.values(timelineQuery ?? {}).flat()
        : activeTab === "inbox"
          ? inboxQuery
          : completedQuery;

    return (
      (activeDocs as Doc<"tasks">[] | undefined)?.map((task) => ({
        _id: task._id,
        title: task.title,
        description: task.description,
        deadline: task.deadline,
        priority: task.priority,
        status: task.status,
        scheduledDate: task.scheduledDate,
        position: task.position,
        updatedAt: task.updatedAt,
      })) ?? []
    );
  }, [activeTab, completedQuery, inboxQuery, timelineQuery]);
  const tasks = useMemo(() => optimisticTasks ?? serverTasks, [optimisticTasks, serverTasks]);

  const addTaskMutation = useMutation(api.tasks.addTask);
  const updateTaskMutation = useMutation(api.tasks.updateTask);
  const completeTaskMutation = useMutation(api.tasks.completeTask);
  const moveTaskMutation = useMutation(api.tasks.moveTask);
  const unscheduleTaskMutation = useMutation(api.tasks.unscheduleTask);
  const reopenTaskMutation = useMutation(api.tasks.reopenTask);
  const reorderTasksMutation = useMutation(api.tasks.reorderTasks);
  const storeUserMutation = useMutation(api.users.store);
  const claimLegacyDataMutation = useMutation(api.users.claimLegacyData);
  const upsertIntegrationMutation = useMutation(api.sync.upsertIntegration);
  const importGoogleCalendarAction = useAction(api.syncActions.importGoogleCalendarAction);

  // ── Derived data ────────────────────────────────────────────────────

  const inboxTasks = useMemo(() => {
    if (activeTab !== "inbox") return [];
    return [...tasks].sort((a, b) => getPriorityRank(a.priority) - getPriorityRank(b.priority) || a.position - b.position);
  }, [activeTab, tasks]);

  const scheduledTasks = useMemo(() => {
    if (activeTab !== "timeline") return [];
    return [...tasks].sort(
      (a, b) =>
        (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "") ||
        getPriorityRank(a.priority) - getPriorityRank(b.priority) ||
        a.position - b.position
    );
  }, [activeTab, tasks]);

  const completedTasks = useMemo(() => {
    if (activeTab !== "completed") return [];
    return [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeTab, tasks]);

  const inboxCount = countsQuery?.inboxCount ?? (activeTab === "inbox" ? inboxTasks.length : 0);
  const timelineCount = activeTab === "timeline" ? scheduledTasks.length : (countsQuery?.timelineCount ?? 0);
  const completedCount =
    countsQuery?.completedCount ?? (activeTab === "completed" ? completedTasks.length : 0);

  const timelineSections = useMemo(() => {
    const grouped = new Map<string, MobileTask[]>();
    for (const task of scheduledTasks) {
      const key = task.scheduledDate ?? "unscheduled";
      const existing = grouped.get(key) ?? [];
      existing.push(task);
      grouped.set(key, existing);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scheduledTasks]);
  const showToast = useCallback((next: ToastState) => setToast(next), []);

  const tabBarBottomPadding = Math.max(insets.bottom, spacing.md);
  const tabBarHeight = 62 + tabBarBottomPadding;
  const fabBottom = tabBarHeight + spacing.xxl;

  // ── Auth ────────────────────────────────────────────────────────────

  const {
    isSigningIn,
    canGoogleSignIn,
    handleGoogleSignIn,
    handleSignOut: googleSignOut,
  } = useGoogleAuth({ googleWebClientId, googleIosClientId, showToast });

  // ── Notifications ────────────────────────────────────────────────────

  const {
    notificationPermissionState,
    isDailyReminderEnabled,
    isNotificationsBusy,
    notificationsEnabled,
    requestNotificationsAccess,
    toggleDailyReminder,
    sendTestNotification,
  } = useNotificationsSettings(showToast);

  // ── Integrations ────────────────────────────────────────────────────

  const {
    isCalendarSyncing,
    isGoogleToggleSaving,
    isGmailToggleSaving,
    googleSyncEnabled,
    gmailSyncEnabled,
    calendarSyncStatus,
    gmailSyncStatus,
    canToggleGmailSync,
    pendingGmailReviewCount,
    syncSettingsBusy,
    toggleGoogleCalendarSync,
    toggleGmailSync,
    runGoogleCalendarSync,
    enableAndSyncGoogleCalendar,
  } = useIntegrationsSettings({ session, showToast });

  const handleSignOut = useCallback(() => {
    setIsSettingsModalOpen(false);
    googleSignOut();
  }, [googleSignOut]);

  // ── Effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (pendingMutations === 0) setOptimisticTasks(null);
  }, [pendingMutations, serverTasks]);

  useEffect(() => {
    if (!session) return;
    mobileLogger.info("session_ready", {
      elapsedMs: Date.now() - appStartMsRef.current,
    });
  }, [session]);

  useEffect(() => {
    if (!session) {
      setIsDataBootstrapReady(false);
      return;
    }

    let cancelled = false;
    setIsDataBootstrapReady(false);

    void (async () => {
      try {
        await storeUserMutation({});
        await claimLegacyDataMutation({});
      } catch (error) {
        mobileLogger.warn("data_bootstrap_failed", {
          errorType: classifyError(error),
        });
        showToast({
          kind: "error",
          message: "Could not run legacy data migration automatically.",
        });
      } finally {
        if (!cancelled) {
          setIsDataBootstrapReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, storeUserMutation, claimLegacyDataMutation, showToast]);

  // ── Toast / retry ───────────────────────────────────────────────────

  const triggerSuccessHaptic = useCallback((kind: SuccessHaptic) => {
    if (kind === "notification") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    void Haptics.impactAsync(
      kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
  }, []);

  const runRetryPayload = useCallback(
    async (payload: RetryPayload) => {
      switch (payload.type) {
        case "addTask": {
          await addTaskMutation({
            title: payload.title,
            description: payload.description,
            deadline: payload.deadline,
            type: payload.deadline && payload.scheduledDate ? "deadline" : "open",
            scheduledDate: payload.scheduledDate,
            priority: payload.priority,
          });
          return;
        }
        case "updateTask": {
          await updateTaskMutation({
            taskId: payload.taskId,
            title: payload.title,
            description: payload.description,
            deadline: payload.deadline,
            priority: payload.priority,
          });
          return;
        }
        case "completeTask": {
          await completeTaskMutation({ taskId: payload.taskId });
          return;
        }
        case "moveTask": {
          await moveTaskMutation({ taskId: payload.taskId, targetDate: payload.targetDate });
          return;
        }
        case "unscheduleTask": {
          await unscheduleTaskMutation({ taskId: payload.taskId });
          return;
        }
        case "reopenTask": {
          await reopenTaskMutation({ taskId: payload.taskId });
          return;
        }
      }
    },
    [
      addTaskMutation,
      updateTaskMutation,
      completeTaskMutation,
      moveTaskMutation,
      unscheduleTaskMutation,
      reopenTaskMutation,
    ]
  );

  const { retryQueue, enqueueRetry, retryQueuedMutations } = useRetryQueue({
    runRetryPayload,
    onRetryComplete: (message) => showToast({ kind: "info", message }),
  });

  useEffect(() => {
    if (!__DEV__) return;
    const now = Date.now();
    if (now - lastListStateLogMsRef.current < 1500) return;
    lastListStateLogMsRef.current = now;
    mobileLogger.debug("list_state", {
      activeTab,
      inboxCount,
      timelineCount,
      completedCount,
      pendingMutations,
      retryQueueCount: retryQueue.length,
    });
  }, [activeTab, inboxCount, timelineCount, completedCount, pendingMutations, retryQueue.length]);

  // ── Optimistic mutation runner ──────────────────────────────────────

  const runOptimisticMutation = useCallback(
    async ({
      optimistic,
      mutation,
      errorMessage,
      actionName,
      retryLabel,
      retryPayload,
      successHaptic = "notification",
      taskId,
    }: {
      optimistic: (current: MobileTask[]) => MobileTask[];
      mutation: () => Promise<void>;
      errorMessage: string;
      actionName: string;
      retryLabel?: string;
      retryPayload?: RetryPayload;
      successHaptic?: SuccessHaptic;
      taskId?: Id<"tasks">;
    }): Promise<boolean> => {
      if (taskId && busyTaskIdsRef.current.has(taskId)) {
        mobileLogger.warn("mutation_ignored_busy_task", { actionName, taskId });
        return false;
      }
      if (taskId) busyTaskIdsRef.current.add(taskId);

      const actionId = createActionId("mutation");
      const startedAt = Date.now();
      mobileLogger.info("mutation_started", {
        actionId,
        actionName,
      });
      setPendingMutations((c) => c + 1);
      // Capture the state before this mutation's optimistic update so we can
      // restore exactly it on failure — preserving any other in-flight mutations
      // rather than wiping all optimistic state with a null.
      let stateBeforeOptimistic: MobileTask[] | null = null;
      setOptimisticTasks((cur) => {
        stateBeforeOptimistic = cur;
        return optimistic(cur ?? serverTasks);
      });
      try {
        await mutation();
        triggerSuccessHaptic(successHaptic);
        mobileLogger.info("mutation_succeeded", {
          actionId,
          actionName,
          elapsedMs: Date.now() - startedAt,
        });
        return true;
      } catch (error) {
        // Restore to the pre-mutation snapshot, not null, so sibling in-flight
        // mutations' optimistic state is preserved.
        setOptimisticTasks(stateBeforeOptimistic);
        const canRetry = retryLabel && retryPayload && classifyError(error) === "network";
        if (canRetry) enqueueRetry({ label: retryLabel!, payload: retryPayload! });
        mobileLogger.error("mutation_failed", {
          actionId,
          actionName,
          elapsedMs: Date.now() - startedAt,
          errorType: classifyError(error),
          retriable: Boolean(canRetry),
        });
        showToast({
          kind: "error",
          message: canRetry ? `${errorMessage} Queued for retry.` : errorMessage,
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return false;
      } finally {
        if (taskId) busyTaskIdsRef.current.delete(taskId);
        setPendingMutations((c) => Math.max(0, c - 1));
      }
    },
    [serverTasks, enqueueRetry, showToast, triggerSuccessHaptic]
  );

  // ── Task actions ────────────────────────────────────────────────────

  const markDone = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "complete_task",
        optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
        mutation: async () => { await completeTaskMutation({ taskId }); },
        errorMessage: "Could not mark task as done.",
        retryLabel: "Retry done",
        retryPayload: { type: "completeTask", taskId },
        taskId,
      });
    },
    [runOptimisticMutation, completeTaskMutation]
  );

  const moveToToday = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "move_task_today",
        optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
        mutation: async () => { await moveTaskMutation({ taskId, targetDate: today }); },
        errorMessage: "Could not move task to today.",
        retryLabel: "Retry move to today",
        retryPayload: { type: "moveTask", taskId, targetDate: today },
        successHaptic: "light",
        taskId,
      });
    },
    [runOptimisticMutation, moveTaskMutation, today]
  );

  const sendToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "move_task_inbox",
        optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
        mutation: async () => { await unscheduleTaskMutation({ taskId }); },
        errorMessage: "Could not move task back to inbox.",
        retryLabel: "Retry move to inbox",
        retryPayload: { type: "unscheduleTask", taskId },
        successHaptic: "light",
        taskId,
      });
    },
    [runOptimisticMutation, unscheduleTaskMutation]
  );

  const reopenToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "reopen_task",
        optimistic: (cur) => removeTaskFromOptimisticView(cur, taskId),
        mutation: async () => { await reopenTaskMutation({ taskId }); },
        errorMessage: "Could not reopen task.",
        retryLabel: "Retry reopen",
        retryPayload: { type: "reopenTask", taskId },
        successHaptic: "light",
        taskId,
      });
    },
    [runOptimisticMutation, reopenTaskMutation]
  );

  // ── Add task handler (from sheet) ───────────────────────────────────

  const handleAddTask = useCallback(
    async (data: {
      title: string;
      description?: string;
      deadline?: string;
      mode: "inbox" | "today";
      priority?: "p1" | "p2" | "p3";
    }) => {
      const actionId = createActionId("add");
      const startedAt = Date.now();
      mobileLogger.info("add_task_started", {
        actionId,
        mode: data.mode,
        hasDeadline: Boolean(data.deadline),
      });
      try {
        await addTaskMutation({
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          type: data.deadline && data.mode === "today" ? "deadline" : "open",
          scheduledDate: data.mode === "today" ? today : undefined,
          priority: data.priority,
        });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        mobileLogger.info("add_task_succeeded", { actionId, elapsedMs: Date.now() - startedAt });
        return true;
      } catch (error) {
        const isOffline = classifyError(error) === "network";
        if (isOffline) {
          enqueueRetry({
            label: `Add "${data.title}"`,
            payload: {
              type: "addTask",
              title: data.title,
              description: data.description,
              deadline: data.deadline,
              scheduledDate: data.mode === "today" ? today : undefined,
              priority: data.priority,
            },
          });
          showToast({ kind: "error", message: "Offline. Task queued for retry." });
        } else {
          showToast({ kind: "error", message: "Could not add task. Please try again." });
        }
        mobileLogger.error("add_task_failed", {
          actionId,
          elapsedMs: Date.now() - startedAt,
          errorType: classifyError(error),
          queuedForRetry: isOffline,
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return false;
      }
    },
    [addTaskMutation, today, enqueueRetry, showToast]
  );

  // ── Save task edits (from edit sheet) ───────────────────────────────

  const handleSaveEdits = useCallback(
    async (data: {
      taskId: Id<"tasks">;
      title: string;
      description?: string;
      deadline?: string;
      priority?: "p1" | "p2" | "p3";
    }) => {
      return runOptimisticMutation({
        actionName: "update_task",
        optimistic: (cur) =>
          patchTaskInOptimisticView(
            cur,
            data.taskId,
            {
              title: data.title,
              description: data.description,
              deadline: data.deadline,
              priority: data.priority,
            },
            Date.now()
          ),
        mutation: async () => {
          await updateTaskMutation({
            taskId: data.taskId,
            title: data.title,
            description: data.description,
            deadline: data.deadline,
            priority: data.priority,
          });
        },
        errorMessage: "Could not save task details.",
        retryLabel: `Update "${data.title}"`,
        retryPayload: {
          type: "updateTask",
          taskId: data.taskId,
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          priority: data.priority,
        },
        successHaptic: "medium",
        taskId: data.taskId,
      });
    },
    [runOptimisticMutation, updateTaskMutation]
  );

  const handleRefresh = async () => {
    if (!session || isRefreshing) return;
    const actionId = createActionId("refresh");
    const startedAt = Date.now();
    mobileLogger.info("refresh_started", { actionId, retryQueueCount: retryQueue.length });
    setIsRefreshing(true);
    try {
      // Convex subscriptions are already live; no manual re-fetch is needed.
      // Pull-to-refresh flushes the offline retry queue so any pending changes
      // are sent as soon as the user is back online.
      if (retryQueue.length) {
        await retryQueuedMutations();
      } else {
        showToast({ kind: "info", message: "Up to date" });
      }
      mobileLogger.info("refresh_succeeded", { actionId, elapsedMs: Date.now() - startedAt });
    } catch {
      showToast({ kind: "error", message: "Could not sync pending changes. Check connection." });
      mobileLogger.error("refresh_failed", { actionId, elapsedMs: Date.now() - startedAt });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEditTask = useCallback(
    (task: MobileTask) => editTaskSheetRef.current?.open(task),
    []
  );

  const openSettingsModal = useCallback(() => {
    mobileLogger.info("settings_modal_opened");
    setIsSettingsModalOpen(true);
  }, []);

  const handleTimelineDragEnd = useCallback(
    async (dateKey: string, original: MobileTask[], data: MobileTask[]) => {
      if (hasPriorityBoundaryViolation(original, data)) {
        showToast({ kind: "error", message: "Drag only within the same priority group." });
        return;
      }
      const taskIds = data.map((task) => task._id);
      const now = Date.now();
      setOptimisticTasks((current) =>
        reorderScopedTasksInOptimisticView(
          current ?? serverTasks,
          taskIds,
          (task) => task.status === "scheduled" && task.scheduledDate === dateKey,
          now
        )
      );

      try {
        await reorderTasksMutation({ date: dateKey, taskIds });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        setOptimisticTasks(null);
        showToast({ kind: "error", message: "Could not save timeline order." });
      }
    },
    [reorderTasksMutation, serverTasks, showToast]
  );

  const renderInboxTaskItem = useCallback(
    ({ item }: { item: MobileTask }) => (
      <TaskCard
        task={item}
        onDone={markDone}
        onMoveToday={moveToToday}
        onEdit={handleEditTask}
      />
    ),
    [markDone, moveToToday, handleEditTask]
  );

  const renderTimelineTaskItem = useCallback(
    (dateKey: string) =>
      ({ item, drag }: RenderItemParams<MobileTask>) => (
        <TaskCard
          task={item}
          dateLabel={dateLabel(dateKey, today, tomorrow, weekEnd)}
          onDone={markDone}
          onSendToInbox={sendToInbox}
          onEdit={handleEditTask}
          onDragHandlePress={drag}
        />
      ),
    [today, tomorrow, weekEnd, markDone, sendToInbox, handleEditTask]
  );

  const renderCompletedTaskItem = useCallback(
    ({ item }: { item: MobileTask }) => (
      <TaskCard
        task={item}
        onDone={markDone}
        onReopen={reopenToInbox}
        onEdit={handleEditTask}
      />
    ),
    [markDone, reopenToInbox, handleEditTask]
  );

  // Editorial empty states. Headlines are short observations rendered in
  // Fraunces; only the inbox case offers a text-link action because it's the
  // only view where capturing is the next obvious move. The block is flat \u2014
  // no card, no border \u2014 so it reads like a printed page, not a placeholder.
  const emptyState = useMemo(() => {
    if (activeTab === "timeline") {
      return {
        title: "An open day.",
        body: "Move a task from the inbox to fill it.",
        cta: null as null | string,
      };
    }
    if (activeTab === "completed") {
      return {
        title: "A quiet ledger \u2014 for now.",
        body: "Closed loops will gather here.",
        cta: null as null | string,
      };
    }
    return {
      title: "Nothing to carry forward.",
      body: "When something comes up, capture it.",
      cta: "Capture a task",
    };
  }, [activeTab]);

  const emptyBlock = (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>{emptyState.title}</Text>
      <Text style={styles.emptyText}>{emptyState.body}</Text>
      {emptyState.cta ? (
        <Pressable
          onPress={() => addTaskSheetRef.current?.open()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={emptyState.cta}
          style={({ pressed }) => [styles.emptyCtaWrap, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.emptyCta}>{emptyState.cta}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
  const loadingBlock = (
    <Animated.View entering={FadeIn.duration(300)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Gathering the ledger.</Text>
      <Text style={styles.emptyText}>Your tasks are still syncing into view.</Text>
    </Animated.View>
  );

  // ── Loading / Auth screens ──────────────────────────────────────────

  if (sessionLoading || (session && !isDataBootstrapReady)) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <Animated.Text entering={FadeIn.duration(600)} style={styles.loadingText}>
          Loading your workspace...
        </Animated.Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <View pointerEvents="none" style={styles.halo} />
        <Animated.View entering={FadeIn.duration(400)} style={styles.authShell}>
          <View style={styles.authLockup}>
            <Text style={styles.wordmark}>Pravah</Text>
            <Text style={styles.authTitle}>A calmer way to keep your day in view.</Text>
            <Text style={styles.authSubtitle}>
              Sign in with Google to keep your inbox, timeline, and completed ledger in sync.
            </Text>
          </View>
          <View style={styles.authDivider} />
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={!canGoogleSignIn || isSigningIn}
            style={({ pressed }) => [
              styles.googleButton,
              (!canGoogleSignIn || isSigningIn) && styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.googleButtonText}>
              {isSigningIn ? "Signing in..." : "Continue with Google"}
            </Text>
          </Pressable>
          {!canGoogleSignIn ? (
            <Text style={styles.authHint}>Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in mobile env.</Text>
          ) : null}
        </Animated.View>
      </SafeAreaView>
    );
  }

  // ── Header copy ─────────────────────────────────────────────────────
  // Subtitle format is uppercase mono with a leading-zero count to read like
  // a log line, never a count badge. Completed tab has no count to avoid
  // making "graveyard size" feel like a metric.

  const headerViewName =
    activeTab === "timeline" ? "Timeline" : activeTab === "completed" ? "Completed" : "Inbox";

  const padCount = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const headerSubtitle =
    activeTab === "timeline"
      ? `${padCount(timelineCount)} next 7 days`
      : activeTab === "completed"
        ? "Closed loops"
        : `${padCount(inboxCount)} to triage`;

  // ── Main layout ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Single warm halo top-right — replaces the two saturated blur circles. */}
      <View pointerEvents="none" style={styles.halo} />

      {/* Header — wordmark + view title (Fraunces) with mono subtitle. The
          Settings affordance is a hairline-underlined text link, not a button
          box: nothing is enclosed unless enclosure is earned. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerTop}>
          <Text style={styles.wordmark}>Pravah</Text>
          <Pressable
            onPress={openSettingsModal}
            style={({ pressed }) => [styles.settingsLinkWrap, pressed && styles.pressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Text style={styles.settingsLink}>Settings</Text>
          </Pressable>
        </View>
        <Text style={styles.headerTitle}>{headerViewName}</Text>
        <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
      </View>

      {/* Toast — left rule + line of copy, no filled pill. */}
      {toast ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.toast, toast.kind === "error" ? styles.toastError : styles.toastInfo]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      ) : null}

      {/* Retry banner — same left-rule pattern, tap target marked by a mono
          action word in copper rather than button chrome. */}
      {retryQueue.length > 0 ? (
        <Pressable
          onPress={() => void retryQueuedMutations()}
          style={({ pressed }) => [styles.retryBanner, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.retryBannerText}>
            {retryQueue.length} change{retryQueue.length === 1 ? "" : "s"} pending sync
          </Text>
          <Text style={styles.retryBannerAction}>Retry</Text>
        </Pressable>
      ) : null}

      {/* Sync indicator — a mono log line, not a badge. */}
      {pendingMutations > 0 ? (
        <Text style={styles.syncText}>Syncing</Text>
      ) : null}

      <TaskTabContent
        activeTab={activeTab}
        inboxTasks={inboxTasks}
        timelineSections={timelineSections}
        completedTasks={completedTasks}
        today={today}
        tomorrow={tomorrow}
        weekEnd={weekEnd}
        isRefreshing={isRefreshing}
        isActiveListLoading={isActiveListLoading}
        tabBarHeight={tabBarHeight}
        emptyBlock={emptyBlock}
        loadingBlock={loadingBlock}
        onRefresh={handleRefresh}
        onTimelineDragEnd={handleTimelineDragEnd}
        renderInboxTaskItem={renderInboxTaskItem}
        renderTimelineTaskItem={renderTimelineTaskItem}
        renderCompletedTaskItem={renderCompletedTaskItem}
      />

      {/* FAB */}
      {!isAddSheetOpen && !isEditSheetOpen ? (
        <FAB bottom={fabBottom} onPress={() => addTaskSheetRef.current?.open()} />
      ) : null}

      {/* Bottom tab bar \u2014 no counts; the header subtitle carries those. */}
      <BottomTabBar
        active={activeTab}
        onChange={setActiveTab}
        bottomInset={tabBarBottomPadding}
      />

      {/* Bottom sheets */}
      <AddTaskSheet
        ref={addTaskSheetRef}
        onAdd={handleAddTask}
        isValidDeadline={normalizeDeadlineInput}
        onSheetChange={setIsAddSheetOpen}
      />
      <EditTaskSheet
        ref={editTaskSheetRef}
        onSave={handleSaveEdits}
        isValidDeadline={normalizeDeadlineInput}
        onSheetChange={setIsEditSheetOpen}
      />

      <SettingsSheet
        visible={isSettingsModalOpen}
        calendarSyncEnabled={googleSyncEnabled}
        gmailSyncEnabled={gmailSyncEnabled}
        calendarSyncStatus={calendarSyncStatus}
        gmailSyncStatus={gmailSyncStatus}
        canToggleGmailSync={canToggleGmailSync}
        pendingGmailReviewCount={pendingGmailReviewCount}
        notificationPermissionState={notificationPermissionState}
        notificationsEnabled={notificationsEnabled}
        isDailyReminderEnabled={isDailyReminderEnabled}
        isCalendarSyncing={isCalendarSyncing}
        isGoogleToggleSaving={isGoogleToggleSaving}
        isGmailToggleSaving={isGmailToggleSaving}
        isNotificationsBusy={isNotificationsBusy}
        syncSettingsBusy={syncSettingsBusy}
        onClose={() => setIsSettingsModalOpen(false)}
        onGoogleCalendarToggle={() => void toggleGoogleCalendarSync()}
        onGoogleCalendarSync={() => void runGoogleCalendarSync()}
        onEnableAndSyncGoogleCalendar={() => void enableAndSyncGoogleCalendar()}
        onGmailToggle={() => void toggleGmailSync()}
        onRequestNotificationsAccess={() => void requestNotificationsAccess()}
        onToggleDailyReminder={() => void toggleDailyReminder()}
        onSendTestNotification={() => void sendTestNotification()}
        onSignOut={handleSignOut}
      />
    </SafeAreaView>
  );
}

// ── Storage gate ────────────────────────────────────────────────────────
// Delays mounting ConvexClientProvider (and thus authClient.useSession) until
// the SecureStore cache is populated, so the session cookie is present on the
// very first /get-session fetch and cold-start auto-sign-in works.

function StorageGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    authStorageReady.finally(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <Animated.Text entering={FadeIn.duration(600)} style={styles.loadingText}>
          Loading your workspace...
        </Animated.Text>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

// ── Font gate ───────────────────────────────────────────────────────────
// Block the visible UI until the editorial type system (Fraunces / Manrope /
// JetBrains Mono) is loaded so the first paint isn't a flash of system font.
// The gate runs in parallel with StorageGate; the slowest one decides the
// boot time, but neither blocks data fetching once mounted below.

function FontGate({ children }: { children: ReactNode }) {
  const [fontsLoaded] = useFraunces({
    Fraunces_300Light,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_500Medium,
  });

  if (!fontsLoaded) {
    // Render the same chrome as StorageGate so the boot sequence is one
    // continuous loading state from the user's POV, no layout jank.
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

// ── Root ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <FontGate>
          <StorageGate>
            <ConvexClientProvider>
              <RootErrorBoundary>
                <MobileApp />
              </RootErrorBoundary>
            </ConvexClientProvider>
          </StorageGate>
        </FontGate>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Auth
  authContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
  },
  loadingText: {
    color: colors.textPrimary,
    ...typography.title,
    textAlign: "center",
  },
  authShell: {
    gap: spacing.lg,
  },
  authLockup: {
    gap: spacing.sm,
  },
  authTitle: {
    color: colors.textPrimary,
    ...typography.headline,
  },
  authSubtitle: {
    color: colors.textSecondary,
    ...typography.bodyLg,
    maxWidth: 320,
  },
  authDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    width: "100%",
  },
  authHint: {
    color: colors.textMuted,
    ...typography.micro,
    marginTop: spacing.xs,
  },
  googleButton: {
    borderRadius: radii.full,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
  },
  googleButtonText: {
    color: colors.bg,
    ...typography.title,
  },
  disabledButton: {
    opacity: 0.6,
  },

  // Main layout
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Single warm copper halo, top-right behind the safe area. No second
  // accent, no shadow on the container — restraint is the point. The size
  // (~360 px) and softness come from the low-alpha fill (haloCopper is
  // already 15%); RN can't actually feather a View edge, so we keep the
  // circle large enough that the hard edge falls well off-screen.
  halo: {
    position: "absolute",
    top: -180,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: colors.haloCopper,
  },

  // Header — typography-first, no enclosing card. The trailing 24px gap
  // (paddingBottom) is the only thing separating the header from the list,
  // doing the work of a divider line without drawing one.
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.lg,
  },
  // Lowercase wordmark in Fraunces — the brand voice, not a brand badge.
  // Slightly lowered baseline relative to the Settings link via a small
  // negative letterSpacing nudge handled in tokens.
  wordmark: {
    color: colors.textPrimary,
    fontFamily: fonts.serif,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  // View name lives on its own line below the lockup so it can breathe.
  // Sentence case, not uppercase \u2014 sentence case + serif is what gives the
  // app its editorial register.
  headerTitle: {
    color: colors.textPrimary,
    ...typography.display,
    marginTop: spacing.xs,
  },
  // Mono uppercase log-line. Reads as metadata, never as a count badge.
  headerSubtitle: {
    color: colors.textMuted,
    ...typography.micro,
    marginTop: spacing.xs,
  },
  // Settings is a hairline-underlined word, not a button shape.
  settingsLinkWrap: {
    paddingVertical: spacing.xs,
  },
  settingsLink: {
    color: colors.textSecondary,
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textDecorationLine: "underline",
    textDecorationColor: colors.borderSubtle,
  },
  // Toast — unenclosed: a thin 2px rule on the left + a line of copy. Error
  // tone uses the rust accent, info uses copper. No border, no radius, no fill.
  toast: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderLeftWidth: 2,
  },
  toastError: {
    borderLeftColor: colors.error,
  },
  toastInfo: {
    borderLeftColor: colors.accent,
  },
  toastText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
  },

  // Retry banner + sync indicator — same left-rule language as the toast so
  // the system-status surfaces share one visual idiom.
  retryBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  retryBannerText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    flex: 1,
  },
  retryBannerAction: {
    color: colors.accent,
    ...typography.micro,
  },
  syncText: {
    color: colors.textMuted,
    ...typography.micro,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingLeft: spacing.md,
  },

  // Empty states — flat editorial block, no enclosure. Fraunces headline sets
  // the tone; body is Manrope; the inbox CTA is a mono "link" in copper so it
  // reads as tappable without borrowing button chrome.
  emptyWrap: {
    paddingTop: spacing.section * 2,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.textPrimary,
    ...typography.headline,
    textAlign: "center",
  },
  emptyText: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center",
  },
  emptyCtaWrap: {
    marginTop: spacing.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  emptyCta: {
    color: colors.accent,
    ...typography.micro,
  },

  // Shared
  pressed: {
    opacity: 0.8,
  },
});
