import { StatusBar } from "expo-status-bar";
import { ObserveRoot, useObserve } from "expo-observe";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated as LegacyAnimated,
  BackHandler,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type RenderItemParams } from "react-native-draggable-flatlist";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import * as Haptics from "expo-haptics";
import { authStorageReady } from "./src/lib/auth-client";
import {
  useFonts as useGeistFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from "@expo-google-fonts/geist";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { ConvexClientProvider } from "./src/lib/convex";
import { humanDate, isIsoDate } from "./src/lib/dates";
import { classifyError, createActionId, mobileLogger } from "./src/lib/logger";
import {
  getDiagnosticsSnapshot,
  initializeDiagnostics,
  setDiagnosticScreen,
  shutdownDiagnostics,
  type DiagnosticEvent,
} from "./src/lib/diagnostics";
import { shareDiagnosticsBundle } from "./src/lib/diagnosticsExport";
import { useGoalLinks, useGoals } from "./src/hooks/useGoals";
import { useConvexGoalsSync } from "./src/hooks/useConvexGoalsSync";
import { useGoalMutations } from "./src/hooks/useGoalMutations";

import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, spacing, typography } from "./src/theme/tokens";
import { TaskCard, type MobileTask } from "./src/components/TaskCard";
import { BottomTabBar } from "./src/components/BottomTabBar";
import { GridBackground } from "./src/components/GridBackground";
import { Kairo, type KairoSheetRef } from "./src/components/Kairo";
import { BootScreen } from "./src/components/BootScreen";
import { BrandMark } from "./src/components/BrandMark";
import { AddTaskSheet, type AddTaskSheetRef } from "./src/components/AddTaskSheet";
import { EditTaskSheet, type EditTaskSheetRef } from "./src/components/EditTaskSheet";
import { MobileAuthScreen } from "./src/components/MobileAuthScreen";
import { RootErrorBoundary } from "./src/components/RootErrorBoundary";
import { ScreenErrorBoundary } from "./src/components/ScreenErrorBoundary";
import { SettingsSheet } from "./src/components/SettingsSheet";
import { ConfirmProvider } from "./src/components/ConfirmDialog";
import { DiagnosticsPanel } from "./src/components/DiagnosticsPanel";
import { InboxScreen } from "./src/screens/InboxScreen";
import { TimelineScreen } from "./src/screens/TimelineScreen";
import { InsightsScreen } from "./src/screens/InsightsScreen";
import { GoalsScreen } from "./src/screens/GoalsScreen";
import { useRetryQueue, type RetryPayload } from "./src/hooks/useRetryQueue";
import { useTaskMutations } from "./src/hooks/useTaskMutations";
import { useTaskQueries } from "./src/hooks/useTaskQueries";
import { useWorkspaceSnapshot } from "./src/hooks/useWorkspaceSnapshot";
import { useWorkspaceState } from "./src/hooks/useWorkspaceState";
import { useGoogleAuth } from "./src/hooks/useGoogleAuth";
import { useNotificationsSettings } from "./src/hooks/useNotificationsSettings";
import { useIntegrationsSettings } from "./src/hooks/useIntegrationsSettings";
import { useReducedMotion } from "./src/hooks/useReducedMotion";
import { useDisplayWorkspace } from "./src/hooks/useDisplayWorkspace";
import { resetPreferencesStore } from "./src/hooks/useUserPreferences";
import { OverdueSheet } from "./src/features/overdue-triage/OverdueSheet";
import { useOverdueTriageController } from "./src/features/overdue-triage/controller";
import { isTaskInInbox } from "./src/lib/taskState";
import { hasPriorityBoundaryViolation } from "./src/lib/taskLifecycle";
import type { BulkTaskInput } from "./src/lib/bulkTaskCapture";

// ── Helpers ────────────────────────────────────────────────────────────

function normalizeDeadlineInput(raw: string): { value?: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: undefined };
  if (!isIsoDate(trimmed)) {
    return { error: "Use YYYY-MM-DD for deadline." };
  }
  return { value: trimmed };
}

// Custom entering animation for tab screens — 8px upward reveal + fade.
// Defined outside the component so it's a stable worklet reference.
function tabEnter() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
    animations: {
      opacity: withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      transform: [{ translateY: withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }) }],
    },
  };
}

// ── Main App ───────────────────────────────────────────────────────────

function MobileApp() {
  const { markInteractive } = useObserve();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const tabEnterAnimation = reducedMotion ? undefined : tabEnter;
  const addTaskSheetRef = useRef<AddTaskSheetRef>(null);
  const editTaskSheetRef = useRef<EditTaskSheetRef>(null);
  const kairoRef = useRef<KairoSheetRef>(null);
  const lastListStateLogMsRef = useRef<number>(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticEvents, setDiagnosticEvents] = useState<DiagnosticEvent[]>([]);
  const hasLoggedPostLoginRef = useRef(false);
  const didMarkInteractiveRef = useRef(false);

  const {
    session,
    sessionLoading,
    activeTab,
    setActiveTab,
    isRefreshing,
    setIsRefreshing,
    pendingMutations,
    setPendingMutations,
    toast,
    showToast,
    dismissToast,
    optimisticTasks,
    setOptimisticTasks,
    isAddSheetOpen,
    setIsAddSheetOpen,
    isEditSheetOpen,
    setIsEditSheetOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isKairoActive,
    setIsKairoActive,
    isDataBootstrapReady,
    bootstrapError,
    retryBootstrap,
    hasCachedSessionHint,
  } = useWorkspaceState();

  const chromeDim = useSharedValue(1);
  useEffect(() => {
    chromeDim.value = withTiming(isKairoActive ? 0.38 : 1, { duration: 280 });
  }, [chromeDim, isKairoActive]);
  const chromeAnimStyle = useAnimatedStyle(() => ({ opacity: chromeDim.value }));

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;

  // ── Data ────────────────────────────────────────────────────────────

  const needsFullWorkspaceCorpus =
    isKairoActive ||
    activeTab === "timeline" ||
    activeTab === "insights" ||
    activeTab === "goals";

  const {
    today,
    tomorrow,
    weekEnd,
    inboxTasks,
    scheduledTasks,
    completedTasks,
    allWorkspaceTasks,
    timelineSections,
    isInboxLoading,
    isTimelineLoading,
    isCompletedLoading,
    isAllTasksReady,
  } = useTaskQueries({
    isAuthenticated: Boolean(session),
    includeAllTasks: needsFullWorkspaceCorpus,
  });

  const hasLiveWorkspaceData = !isInboxLoading && !isTimelineLoading && !isCompletedLoading;
  const { snapshot: workspaceSnapshot, isHydrated: isWorkspaceSnapshotHydrated, clearSnapshot } =
    useWorkspaceSnapshot({
      canHydrate: hasCachedSessionHint,
      shouldPersist: Boolean(session) && hasLiveWorkspaceData,
      inboxTasks,
      scheduledTasks,
      completedTasks,
    });

  const {
    shouldRenderOptimisticShell,
    shouldUseWorkspaceSnapshot,
    displayInboxTasks,
    displayScheduledTasks,
    displayCompletedTasks,
    workspaceTaskCorpus,
    displayTimelineSections,
    displayInboxCount,
    displayOverdueCount,
    displayUpcomingCount,
    displayCompletedCount,
    activeServerTasks,
    visibleTasks,
    isActiveListLoading,
    isGoalsTaskDataLoading,
    isTimelineTriageReady,
    isBootShellLoading,
    kairoTasks,
  } = useDisplayWorkspace({
    activeTab,
    sessionReady: Boolean(session),
    sessionLoading,
    hasCachedSessionHint,
    today,
    inboxTasks,
    scheduledTasks,
    completedTasks,
    allWorkspaceTasks,
    loading: {
      inbox: isInboxLoading,
      timeline: isTimelineLoading,
      completed: isCompletedLoading,
      allTasksReady: isAllTasksReady,
    },
    snapshot: workspaceSnapshot,
    isSnapshotHydrated: isWorkspaceSnapshotHydrated,
    optimisticTasks,
  });

  const addTaskMutation = useMutation(api.tasks.addTask);
  const updateTaskMutation = useMutation(api.tasks.updateTask);
  const completeTaskMutation = useMutation(api.tasks.completeTask);
  const moveTaskMutation = useMutation(api.tasks.moveTask);
  const unscheduleTaskMutation = useMutation(api.tasks.unscheduleTask);
  const reopenTaskMutation = useMutation(api.tasks.reopenTask);
  const softDeleteTaskMutation = useMutation(api.tasks.softDeleteTask);
  const restoreTaskMutation = useMutation(api.tasks.restoreTask);
  const applyOverdueReflowMutation = useMutation(api.overdueReflow.apply);
  const undoOverdueReflowMutation = useMutation(api.overdueReflow.undo);
  const overduePreviewData = useQuery(api.overdueReflow.preview, session ? { today } : "skip");

  useConvexGoalsSync(Boolean(session));
  const { setGoalLink, clearAll: clearAllGoals } = useGoalMutations();

  // ── Derived data ────────────────────────────────────────────────────

  const goalLinks = useGoalLinks();
  const { goals } = useGoals();
  const taskGoalNames = useMemo(() => {
    const goalById = new Map(goals.map((g) => [g.id, g.text]));
    const out = new Map<string, string>();
    for (const [taskId, goalId] of Object.entries(goalLinks)) {
      const name = goalById.get(goalId);
      if (name) out.set(taskId, name);
    }
    return out;
  }, [goalLinks, goals]);
  const kairoInboxTasks = useMemo(
    () => kairoTasks.filter(isTaskInInbox),
    [kairoTasks]
  );
  const tabBarBottomPadding = Math.max(insets.bottom, spacing.md);
  const tabBarHeight = 62 + tabBarBottomPadding;

  // ── Auth ────────────────────────────────────────────────────────────

  const {
    isSigningIn,
    isSigningOut,
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
    resetDailyReminderState,
  } = useNotificationsSettings(showToast);

  // ── Integrations ────────────────────────────────────────────────────

  const {
    isCalendarSyncing,
    isGoogleToggleSaving,
    isGmailToggleSaving,
    googleSyncEnabled,
    gmailSyncEnabled,
    gmailSyncStatus,
    calendarSyncHealth,
    calendarErrorSummary,
    canToggleGmailSync,
    pendingGmailReviewCount,
    syncSettingsBusy,
    calendarAccountEmail,
    gmailAccountEmail,
    calendarLastError,
    gmailLastError,
    calendarLastRun,
    gmailLastRun,
    availableCalendars,
    selectedCalendarIds,
    isLoadingCalendars,
    toggleCalendarSelected,
    toggleGoogleCalendarSync,
    toggleGmailSync,
    runGoogleCalendarSync,
    enableAndSyncGoogleCalendar,
  } = useIntegrationsSettings({ isAuthenticated: Boolean(session), showToast });

  const handleSignOut = useCallback(async () => {
    setIsSettingsModalOpen(false);
    await clearSnapshot();
    await googleSignOut();
  }, [clearSnapshot, googleSignOut, setIsSettingsModalOpen]);

  const handleWipeLocalData = useCallback(async () => {
    const { wipeLocalAppData } = await import("./src/lib/dataReset");
    await wipeLocalAppData();
    clearAllGoals();
    resetPreferencesStore();
    resetDailyReminderState();
    setIsSettingsModalOpen(false);
    await clearSnapshot();
    await googleSignOut();
  }, [clearAllGoals, clearSnapshot, googleSignOut, resetDailyReminderState, setIsSettingsModalOpen]);

  const handleExportTasks = useCallback(async () => {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        tasks: [...displayInboxTasks, ...displayScheduledTasks, ...displayCompletedTasks],
      };
      await Share.share({ message: JSON.stringify(payload, null, 2) });
    } catch {
      showToast({ kind: "error", message: "Could not share tasks export." });
    }
  }, [displayCompletedTasks, displayInboxTasks, displayScheduledTasks, showToast]);

  const handleShareDiagnostics = useCallback(async () => {
    try {
      const path = await shareDiagnosticsBundle();
      mobileLogger.info("diagnostics_shared", { path });
      showToast({ kind: "info", message: "Diagnostics exported." });
    } catch (error) {
      mobileLogger.error("diagnostics_share_failed", {
        errorType: classifyError(error),
      });
      showToast({ kind: "error", message: "Could not export diagnostics." });
    }
  }, [showToast]);

  // ── Effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    void initializeDiagnostics();
    mobileLogger.info("launch_gate_start");
    return () => {
      void shutdownDiagnostics();
    };
  }, []);

  useEffect(() => {
    if (sessionLoading) {
      mobileLogger.info("session_query_start");
    }
  }, [sessionLoading]);

  useEffect(() => {
    if (session) {
      mobileLogger.info("session_ready");
      return;
    }
    if (!sessionLoading) {
      mobileLogger.info("session_absent");
    }
  }, [session, sessionLoading]);

  useEffect(() => {
    if (sessionLoading || session) return;
    void clearSnapshot();
  }, [clearSnapshot, session, sessionLoading]);

  useEffect(() => {
    setDiagnosticScreen(session ? activeTab : "auth");
    mobileLogger.info("screen_changed", {
      screen: session ? activeTab : "auth",
      sessionReady: Boolean(session),
    });
  }, [activeTab, session]);

  useEffect(() => {
    if (!showDiagnostics) return;
    let active = true;
    void getDiagnosticsSnapshot().then((events) => {
      if (!active) return;
      setDiagnosticEvents(events);
    });
    return () => {
      active = false;
    };
  }, [showDiagnostics]);

  useEffect(() => {
    if (!session) return;
    if (!isDataBootstrapReady) return;
    if (!isAllTasksReady) return;
    if (!didMarkInteractiveRef.current) {
      didMarkInteractiveRef.current = true;
      markInteractive();
    }
    mobileLogger.info("app_interactive_ready", {
      inboxCount: displayInboxTasks.length,
      timelineCount: displayScheduledTasks.length,
      completedCount: displayCompletedTasks.length,
    });
  }, [
    displayCompletedTasks.length,
    displayInboxTasks.length,
    displayScheduledTasks.length,
    isAllTasksReady,
    isDataBootstrapReady,
    markInteractive,
    session,
  ]);

  useEffect(() => {
    if (session || sessionLoading || didMarkInteractiveRef.current) return;
    didMarkInteractiveRef.current = true;
    markInteractive();
  }, [markInteractive, session, sessionLoading]);

  useEffect(() => {
    if (!session) return;
    mobileLogger.debug("tab_render_start", { tab: activeTab });
  }, [activeTab, session]);

  useEffect(() => {
    if (!session || !isDataBootstrapReady || !isAllTasksReady) return;
    mobileLogger.info("tab_interactive_ready", { tab: activeTab });
  }, [activeTab, isAllTasksReady, isDataBootstrapReady, session]);

  useEffect(() => {
    if (!session || !isDataBootstrapReady || !isAllTasksReady) return;
    if (hasLoggedPostLoginRef.current) return;
    hasLoggedPostLoginRef.current = true;
    mobileLogger.info("post_login_nav_done", {
      landingTab: activeTab,
      pendingMutations,
    });
  }, [activeTab, isAllTasksReady, isDataBootstrapReady, pendingMutations, session]);

  // ── Toast / retry ───────────────────────────────────────────────────

  const runRetryPayload = useCallback(
    async (payload: RetryPayload) => {
      switch (payload.type) {
        case "addTask": {
          const retriedId = await addTaskMutation({
            title: payload.title,
            description: payload.description,
            deadline: payload.deadline,
            priority: payload.priority,
          });
          if (payload.goalId && retriedId) {
            setGoalLink(String(retriedId), payload.goalId);
          }
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
      setGoalLink,
    ]
  );

  const { retryQueue, enqueueRetry, retryQueuedMutations } = useRetryQueue({
    runRetryPayload,
    onRetryComplete: (message) => showToast({ kind: "info", message }),
  });
  const retryQueueCount = retryQueue.length;

  useEffect(() => {
    if (!__DEV__) return;
    const now = Date.now();
    if (now - lastListStateLogMsRef.current < 1500) return;
    lastListStateLogMsRef.current = now;
    mobileLogger.debug("list_state", {
      activeTab,
      inboxCount: displayInboxCount,
      timelineCount: displayScheduledTasks.length,
      completedCount: displayCompletedCount,
      pendingMutations,
      retryQueueCount: retryQueue.length,
      usingSnapshot: shouldUseWorkspaceSnapshot,
    });
  }, [
    activeTab,
    displayCompletedCount,
    displayInboxCount,
    displayScheduledTasks.length,
    pendingMutations,
    retryQueue.length,
    shouldUseWorkspaceSnapshot,
  ]);

  const {
    markDone,
    moveToToday,
    sendToInbox,
    reopenTask,
    deleteTask,
    handleSaveEdits,
    shiftTimelineTask,
  } = useTaskMutations({
    serverTasks: activeServerTasks,
    setOptimisticTasks,
    setPendingMutations,
    enqueueRetry,
    showToast,
    today,
    hasPriorityBoundaryViolation,
  });

  const bulkCreateTasksMutation = useMutation(api.tasks.bulkCreateTasks);
  const undoBulkCreateTasksMutation = useMutation(api.tasks.undoBulkCreateTasks);

  const handleBulkAddTasks = useCallback(
    async (tasks: BulkTaskInput[]) => {
      const actionId = createActionId("bulk-add");
      try {
        const result = await bulkCreateTasksMutation({
          idempotencyKey: actionId,
          tasks,
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast({
          kind: "info",
          message: `${result.taskIds.length} tasks created`,
          durationMs: 10_000,
          action: {
            label: "Undo",
            run: () => {
              void undoBulkCreateTasksMutation({ taskIds: result.taskIds })
                .then(() => showToast({ kind: "info", message: "Bulk creation undone" }))
                .catch(() => showToast({ kind: "error", message: "Could not undo bulk creation" }));
            },
          },
        });
        mobileLogger.info("bulk_task_capture_succeeded", {
          actionId,
          taskCount: result.taskIds.length,
        });
        return true;
      } catch (error) {
        showToast({ kind: "error", message: "Could not create tasks. Nothing was added." });
        mobileLogger.error("bulk_task_capture_failed", {
          actionId,
          taskCount: tasks.length,
          errorType: classifyError(error),
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return false;
      }
    },
    [bulkCreateTasksMutation, showToast, undoBulkCreateTasksMutation],
  );

  const {
    isOverdueSheetOpen,
    overdueBuckets,
    previewGroups,
    selectedPreview,
    applyDeadline,
    setApplyDeadline,
    openOverdue,
    closeOverdue,
    openPreview,
    closePreview,
    confirmPreview,
    rescheduleAll,
    handleManualTriage,
  } = useOverdueTriageController({
    previewData: overduePreviewData,
    today,
    tomorrow,
    weekEnd,
    applyReflowMutation: applyOverdueReflowMutation,
    undoReflowMutation: undoOverdueReflowMutation,
    moveTaskMutation,
    softDeleteTaskMutation,
    restoreTaskMutation,
    showToast,
    enqueueRetry,
  });

  // ── Add task handler (from sheet) ───────────────────────────────────

  const handleAddTask = useCallback(
    async (data: {
      title: string;
      description?: string;
      deadline?: string;
      priority?: "p1" | "p2" | "p3";
      goalId?: string;
    }) => {
      const actionId = createActionId("add");
      const startedAt = Date.now();
      mobileLogger.info("add_task_started", {
        actionId,
        hasDeadline: Boolean(data.deadline),
      });
      try {
        const newTaskId = await addTaskMutation({
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          priority: data.priority,
        });
        if (data.goalId && newTaskId) {
          setGoalLink(String(newTaskId), data.goalId);
        }
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
              priority: data.priority,
              goalId: data.goalId,
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
    [addTaskMutation, enqueueRetry, setGoalLink, showToast]
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
    } catch (error) {
      showToast({ kind: "error", message: "Could not sync pending changes. Check connection." });
      mobileLogger.error("refresh_failed", {
        actionId,
        elapsedMs: Date.now() - startedAt,
        errorType: classifyError(error),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEditTask = useCallback(
    (task: MobileTask) => editTaskSheetRef.current?.open(task),
    []
  );

  // Settings/sign-out are session-level affordances and must remain reachable
  // even while we're still rendering a workspace snapshot or boot shell.
  const canOpenSession = Boolean(session) && !sessionLoading;
  // Task-level mutations must wait for the active tab's live data. Acting
  // against snapshot/boot rows would seed optimistic state from empty server
  // arrays and visibly collapse the list before the live queries hydrate, but
  // gating on global readiness would also suppress actions on a tab whose
  // query has already resolved (e.g. Inbox is loaded but Timeline is still
  // hydrating) — making interactive-looking rows silently no-op.
  const canUseWorkspaceActions =
    canOpenSession && !isActiveListLoading && !shouldUseWorkspaceSnapshot;

  const openSettingsModal = useCallback(() => {
    if (!canOpenSession) return;
    mobileLogger.info("settings_modal_opened");
    setIsSettingsModalOpen(true);
  }, [canOpenSession, setIsSettingsModalOpen]);

  const openKairo = useCallback(() => {
    if (!canUseWorkspaceActions) return;
    mobileLogger.info("kairo_opened");
    kairoRef.current?.open();
  }, [canUseWorkspaceActions]);

  // Android hardware back: close the topmost overlay (sheet/modal) instead
  // of letting the OS exit the app. Without this, BACK from an open Capture
  // sheet would dismiss the sheet *and* pop the activity, sending the user
  // straight to the launcher.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isOverdueSheetOpen) {
        closeOverdue();
        return true;
      }
      if (isSettingsModalOpen) {
        setIsSettingsModalOpen(false);
        return true;
      }
      if (isKairoActive) {
        kairoRef.current?.close();
        return true;
      }
      if (isEditSheetOpen) {
        editTaskSheetRef.current?.close();
        return true;
      }
      if (isAddSheetOpen) {
        const addSheet = addTaskSheetRef.current;
        if (addSheet?.hasDraftChanges()) {
          addSheet.dismissKeyboard();
          return true;
        }
        addSheet?.close();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [
    isAddSheetOpen,
    isEditSheetOpen,
    isSettingsModalOpen,
    isKairoActive,
    isOverdueSheetOpen,
    closeOverdue,
    setIsSettingsModalOpen,
  ]);

  const renderInboxTaskItem = useCallback(
    ({ item, drag, hidePriorityBadge }: RenderItemParams<MobileTask> & { hidePriorityBadge?: boolean }) => (
      // Inbox has no day-section header, so a dated task self-describes its date.
      <TaskCard
        task={item}
        dateLabel={item.deadline ? humanDate(item.deadline) : undefined}
        onDone={canUseWorkspaceActions ? markDone : () => undefined}
        onMoveToday={canUseWorkspaceActions ? moveToToday : undefined}
        onEdit={canUseWorkspaceActions ? handleEditTask : () => undefined}
        onDragHandlePress={canUseWorkspaceActions ? drag : undefined}
        linkedGoalName={taskGoalNames.get(String(item._id))}
        hidePriorityBadge={hidePriorityBadge}
      />
    ),
    [canUseWorkspaceActions, handleEditTask, markDone, moveToToday, taskGoalNames]
  );

  const renderTimelineTaskItem = useCallback(
    (dateKey: string, { item, drag }: RenderItemParams<MobileTask>) => (
      // No date on timeline cards: the day-named section header owns the date.
      <TaskCard
        task={item}
        onDone={canUseWorkspaceActions ? markDone : () => undefined}
        onSendToInbox={canUseWorkspaceActions ? sendToInbox : undefined}
        onReorder={
          canUseWorkspaceActions
            ? (taskId, direction) => shiftTimelineTask(taskId, dateKey, direction)
            : undefined
        }
        onEdit={canUseWorkspaceActions ? handleEditTask : () => undefined}
        onDragHandlePress={canUseWorkspaceActions ? drag : undefined}
        linkedGoalName={taskGoalNames.get(String(item._id))}
      />
    ),
    [
      canUseWorkspaceActions,
      markDone,
      sendToInbox,
      shiftTimelineTask,
      handleEditTask,
      taskGoalNames,
    ]
  );

  const renderCompletedTaskItem = useCallback(
    ({ item }: { item: MobileTask }) => (
      <TaskCard
        task={item}
        onDone={canUseWorkspaceActions ? markDone : () => undefined}
        onReopen={canUseWorkspaceActions ? reopenTask : undefined}
        onEdit={canUseWorkspaceActions ? handleEditTask : () => undefined}
        linkedGoalName={taskGoalNames.get(String(item._id))}
      />
    ),
    [canUseWorkspaceActions, handleEditTask, markDone, reopenTask, taskGoalNames]
  );

  // ── Loading / Auth screens ──────────────────────────────────────────

  if (sessionLoading && !hasCachedSessionHint) {
    return <BootScreen />;
  }

  if (isSigningOut) {
    return <BootScreen title="Signing out" detail="Clearing your session on this device." />;
  }

  if (!session && !shouldRenderOptimisticShell) {
    return (
      <MobileAuthScreen
        canGoogleSignIn={canGoogleSignIn}
        isSigningIn={isSigningIn || isSigningOut}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onOpenDiagnostics={() => void handleShareDiagnostics()}
      />
    );
  }

  if (session && bootstrapError) {
    return (
      <BootScreen
        title="Could not load your workspace"
        detail={bootstrapError}
        actionLabel="Retry"
        onActionPress={retryBootstrap}
      />
    );
  }

  // ── Header copy ─────────────────────────────────────────────────────
  // Subtitle format is uppercase mono with a leading-zero count to read like
  // a log line, never a count badge. Completed tab has no count to avoid
  // making "graveyard size" feel like a metric.

  const headerViewName =
    activeTab === "timeline"
      ? "Timeline"
      : activeTab === "insights"
        ? "Progress"
        : activeTab === "goals"
          ? "Goals"
          : "Inbox";

  const padCount = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const timelineSubtitle =
    displayOverdueCount > 0
      ? `${padCount(displayOverdueCount)} overdue · ${padCount(displayUpcomingCount)} upcoming`
      : `${padCount(displayUpcomingCount)} upcoming`;
  const headerSubtitle =
    shouldRenderOptimisticShell
      ? "Restoring your session"
      : session && !hasLiveWorkspaceData
        ? activeTab === "timeline"
          ? "Opening your timeline"
          : activeTab === "insights"
            ? "Opening your stats"
            : activeTab === "goals"
              ? "Opening your goals"
              : "Opening your inbox"
        : session && !isDataBootstrapReady
          ? "Syncing your workspace"
        : activeTab === "timeline"
          ? timelineSubtitle
          : activeTab === "insights"
            ? "On-device snapshot"
            : activeTab === "goals"
              ? "Long horizon"
              : `${padCount(displayInboxCount)} to triage`;

  // ── Main layout ─────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      <StatusBar style="light" />

      {/* Web-parity grid vignette behind everything. */}
      <GridBackground />

      <Animated.View
        style={[styles.chrome, chromeAnimStyle]}
        pointerEvents={isKairoActive ? "none" : "auto"}
      >
      {/* Compact header: one title line, Kairo promoted, settings quiet. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerMain}>
          <View style={styles.titleLockup}>
            <BrandMark size={24} />
            <View style={styles.titleTextBlock}>
              <Text style={styles.wordmark}>Pravah</Text>
              <Text style={styles.headerTitle}>{headerViewName}</Text>
            </View>
          </View>
          <View style={styles.headerLinks}>
            <Pressable
              onPress={openKairo}
              disabled={!canUseWorkspaceActions}
              style={({ pressed }) => [styles.settingsLinkWrap, pressed && styles.pressed]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Open Kairo assistant"
            >
              <Text style={styles.kairoLink}>Kairo</Text>
            </Pressable>
            <Pressable
              onPress={openSettingsModal}
              disabled={!canOpenSession}
              style={({ pressed }) => [styles.settingsLinkWrap, pressed && styles.pressed]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Text style={styles.settingsLink}>⚙︎</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
      </View>

      {/* Toast — left rule + line of copy, no filled pill. */}
      {toast ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.toast, toast.kind === "error" ? styles.toastError : styles.toastInfo]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
          {toast.action ? (
            <Pressable
              onPress={() => {
                toast.action?.run();
                dismissToast();
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
              style={({ pressed }) => [styles.toastAction, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.toastActionText}>{toast.action.label}</Text>
            </Pressable>
          ) : null}
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

      {activeTab === "inbox" ? (
        <Animated.View entering={tabEnterAnimation} style={styles.tabScreen}>
          <ScreenErrorBoundary screenName="Inbox">
            <InboxScreen
              tasks={visibleTasks}
              isLoading={isActiveListLoading || isBootShellLoading}
              isRefreshing={isRefreshing}
              tabBarHeight={tabBarHeight}
              onRefresh={handleRefresh}
              onCapture={() => canUseWorkspaceActions && addTaskSheetRef.current?.open()}
              renderItem={renderInboxTaskItem}
            />
          </ScreenErrorBoundary>
        </Animated.View>
      ) : null}

      {activeTab === "timeline" ? (
        <Animated.View entering={tabEnterAnimation} style={styles.tabScreen}>
          {/* Ambient, silent-when-healthy sync indicator. The timeline is the
              surface calendar sync feeds, so a broken sync surfaces here where
              it's actually missing events — not buried in Settings. */}
          {calendarSyncHealth === "error" ? (
            <Pressable
              onPress={openSettingsModal}
              style={({ pressed }) => [styles.syncBrokenBanner, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Calendar sync paused after an error. Open settings to reconnect."
            >
              <Text style={styles.syncBrokenText}>Calendar sync paused</Text>
              <Text style={styles.syncBrokenAction}>Reconnect</Text>
            </Pressable>
          ) : null}
          <ScreenErrorBoundary screenName="Timeline">
            <TimelineScreen
              sections={shouldUseWorkspaceSnapshot ? displayTimelineSections : timelineSections}
              today={today}
              tomorrow={tomorrow}
              isLoading={isActiveListLoading || isBootShellLoading}
              isRefreshing={isRefreshing}
              tabBarHeight={tabBarHeight}
              onRefresh={handleRefresh}
              renderItem={renderTimelineTaskItem}
              overdueCount={isTimelineTriageReady ? overdueBuckets.totalOverdue : undefined}
              onOpenOverdue={
                canUseWorkspaceActions && isTimelineTriageReady ? openOverdue : undefined
              }
            />
          </ScreenErrorBoundary>
        </Animated.View>
      ) : null}

      {activeTab === "goals" ? (
        <Animated.View entering={tabEnterAnimation} style={styles.tabScreen}>
          <ScreenErrorBoundary screenName="Goals">
            <GoalsScreen
              tabBarHeight={tabBarHeight}
              tasks={workspaceTaskCorpus}
              isTaskDataLoading={isGoalsTaskDataLoading}
              onOpenTask={canUseWorkspaceActions ? handleEditTask : undefined}
            />
          </ScreenErrorBoundary>
        </Animated.View>
      ) : null}

      {activeTab === "insights" ? (
        <Animated.View entering={tabEnterAnimation} style={styles.tabScreen}>
          <ScreenErrorBoundary screenName="Insights">
            <InsightsScreen
              tasks={workspaceTaskCorpus}
              completedTasks={displayCompletedTasks}
              isLoading={isActiveListLoading || isBootShellLoading}
              isRefreshing={isRefreshing}
              tabBarHeight={tabBarHeight}
              onRefresh={handleRefresh}
              renderCompletedTaskItem={renderCompletedTaskItem}
            />
          </ScreenErrorBoundary>
        </Animated.View>
      ) : null}

      {/* Bottom tab bar \u2014 no counts; the header subtitle carries those. */}
      <BottomTabBar
        active={activeTab}
        onChange={setActiveTab}
        onCapture={() => addTaskSheetRef.current?.open()}
        canCapture={canUseWorkspaceActions && !isAddSheetOpen && !isEditSheetOpen}
        bottomInset={tabBarBottomPadding}
      />

      </Animated.View>

      {/* Bottom sheets */}
      <AddTaskSheet
        ref={addTaskSheetRef}
        onAdd={handleAddTask}
        onBulkAdd={handleBulkAddTasks}
        isValidDeadline={normalizeDeadlineInput}
        onSheetChange={setIsAddSheetOpen}
      />
      <EditTaskSheet
        ref={editTaskSheetRef}
        onSave={handleSaveEdits}
        isValidDeadline={normalizeDeadlineInput}
        onSheetChange={setIsEditSheetOpen}
        onComplete={markDone}
        onReopen={reopenTask}
        onUnschedule={sendToInbox}
        onDelete={deleteTask}
      />

      {/* Kairo lives at the root so its overlay sits above tabs and FAB. The
          parent dims the rest of the chrome via isKairoActive when the sheet
          is open, matching web's 0.38-opacity fade behind the active panel. */}
      <Kairo
        ref={kairoRef}
        tasks={kairoTasks}
        inboxTasks={kairoInboxTasks}
        isAllTasksReady={isAllTasksReady}
        onActiveChange={setIsKairoActive}
        onOpenSettings={openSettingsModal}
      />

      <OverdueSheet
        visible={isOverdueSheetOpen}
        onClose={closeOverdue}
        groups={previewGroups}
        orphans={overdueBuckets.orphans}
        selectedPreview={selectedPreview}
        applyDeadline={applyDeadline}
        today={today}
        tomorrow={tomorrow}
        onOpenPreview={openPreview}
        onClosePreview={closePreview}
        onSetApplyDeadline={setApplyDeadline}
        onConfirmPreview={confirmPreview}
        onRescheduleAll={rescheduleAll}
        onManualTriage={handleManualTriage}
      />

      <SettingsSheet
        visible={isSettingsModalOpen}
        calendarSyncEnabled={googleSyncEnabled}
        gmailSyncEnabled={gmailSyncEnabled}
        gmailSyncStatus={gmailSyncStatus}
        calendarSyncHealth={calendarSyncHealth}
        calendarErrorSummary={calendarErrorSummary}
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
        onSignOut={() => void handleSignOut()}
        onExportTasks={() => void handleExportTasks()}
        onExportDiagnostics={() => void handleShareDiagnostics()}
        onWipeLocalData={handleWipeLocalData}
        showToast={showToast}
        calendarAccountEmail={calendarAccountEmail}
        gmailAccountEmail={gmailAccountEmail}
        calendarLastRun={calendarLastRun}
        gmailLastRun={gmailLastRun}
        availableCalendars={availableCalendars}
        selectedCalendarIds={selectedCalendarIds}
        isLoadingCalendars={isLoadingCalendars}
        onToggleCalendarSelected={toggleCalendarSelected}
        calendarLastError={calendarLastError}
        gmailLastError={gmailLastError}
      />

      {__DEV__ ? (
        <DiagnosticsPanel
          visible={showDiagnostics}
          activeTab={activeTab}
          inboxCount={displayInboxCount}
          timelineCount={displayScheduledTasks.length}
          completedCount={displayCompletedCount}
          pendingMutations={pendingMutations}
          retryQueueCount={retryQueueCount}
          isKairoActive={isKairoActive}
          isAllTasksReady={isAllTasksReady}
          usingSnapshot={shouldUseWorkspaceSnapshot}
          isDataBootstrapReady={isDataBootstrapReady}
          onToggle={() => setShowDiagnostics((visible) => !visible)}
          onShareDiagnostics={() => void handleShareDiagnostics()}
          events={diagnosticEvents}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ── Launch gate ──────────────────────────────────────────────────────────
// Fonts and the SecureStore-backed auth cache are still true preconditions for
// a stable first paint, but they should resolve in parallel under one surface
// instead of showing a chain of near-identical full-screen boot frames.

function LaunchGate({ children }: { children: ReactNode }) {
  const [storageReady, setStorageReady] = useState(false);
  const [fontsLoaded] = useGeistFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_500Medium,
  });
  const reducedMotion = useReducedMotion();
  const launchReady = fontsLoaded && storageReady;
  const [handoffOpacity] = useState(() => new LegacyAnimated.Value(1));
  const [showHandoffOverlay, setShowHandoffOverlay] = useState(true);

  useEffect(() => {
    let mounted = true;
    authStorageReady.finally(() => {
      if (mounted) {
        mobileLogger.info("auth_storage_ready");
        setStorageReady(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!fontsLoaded) return;
    mobileLogger.info("fonts_ready");
  }, [fontsLoaded]);

  useEffect(() => {
    if (!launchReady) return;
    if (reducedMotion) {
      handoffOpacity.setValue(0);
      return;
    }

    handoffOpacity.setValue(1);
    const animation = LegacyAnimated.timing(handoffOpacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setShowHandoffOverlay(false);
    });
    return () => animation.stop();
  }, [handoffOpacity, launchReady, reducedMotion]);

  if (!launchReady) {
    const detail = !fontsLoaded
      ? "Loading Pravah's interface."
      : "Restoring your secure session cache.";
    return <BootScreen detail={detail} />;
  }

  return (
    <View style={launchStyles.container}>
      <Animated.View entering={FadeIn.duration(reducedMotion ? 0 : 180)} style={launchStyles.content}>
        {children}
      </Animated.View>
      {!reducedMotion && showHandoffOverlay ? (
        <LegacyAnimated.View
          pointerEvents="none"
          style={[launchStyles.overlay, { opacity: handoffOpacity }]}
        >
          <BootScreen detail="Opening your workspace." />
        </LegacyAnimated.View>
      ) : null}
    </View>
  );
}

// ── Root ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ObserveRoot>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <LaunchGate>
            <ConvexClientProvider>
              <RootErrorBoundary>
                <ConfirmProvider>
                  <MobileApp />
                </ConfirmProvider>
              </RootErrorBoundary>
            </ConvexClientProvider>
          </LaunchGate>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ObserveRoot>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Main layout
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabScreen: {
    flex: 1,
  },
  chrome: {
    flex: 1,
  },
  // Header — typography-first, no enclosing card. Previous vertical footprint:
  // top inset + 4 + 24 + 16 + 34 + 4 + 14 = top inset + 96px.
  // Compact footprint: top inset + 4 + 34 + 2 + 14 + 12 = top inset + 62px.
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  // Lowercase wordmark in Fraunces — the brand voice, not a brand badge.
  // Slightly lowered baseline relative to the Settings link via a small
  // negative letterSpacing nudge handled in tokens.
  wordmark: {
    color: colors.textMuted,
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  titleLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  titleTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  // View name lives on its own line below the lockup so it can breathe.
  // Sentence case, not uppercase \u2014 sentence case + serif is what gives the
  // app its editorial register.
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.sansSemibold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  // Mono uppercase log-line. Reads as metadata, never as a count badge.
  headerSubtitle: {
    color: colors.textMuted,
    ...typography.micro,
    marginTop: 2,
    paddingLeft: 24 + spacing.sm,
  },
  // Header links sit in a row so additional affordances (Kairo, Settings)
  // line up with the same visual weight rather than competing for spot.
  headerLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  // Settings is a hairline-underlined word, not a button shape.
  settingsLinkWrap: {
    minHeight: 32,
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  settingsLink: {
    color: colors.textMuted,
    fontFamily: fonts.sansSemibold,
    fontSize: 18,
    letterSpacing: 1,
  },
  // Kairo entry point: same micro-link dialect as Settings but tinted in the
  // accent so it reads as the AI affordance without needing iconography.
  kairoLink: {
    color: colors.textPrimary,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    textDecorationLine: "underline",
    textDecorationColor: colors.accent,
  },
  // Toast — unenclosed: a thin 2px rule on the left + a line of copy. Error
  // tone uses the rust accent, info uses copper. No border, no radius, no fill.
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
    flex: 1,
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  toastAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  toastActionText: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "600",
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
  // Broken-sync banner — same left-rule idiom as the retry/sync surfaces, in
  // the error tone. Only rendered while calendar sync is in an error state.
  syncBrokenBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.error,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  syncBrokenText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    flex: 1,
  },
  syncBrokenAction: {
    color: colors.error,
    ...typography.micro,
  },

  // Shared
  pressed: {
    opacity: 0.8,
  },
});

const launchStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
});
