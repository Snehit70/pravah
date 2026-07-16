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
import { KeyboardProvider } from "react-native-keyboard-controller";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type RenderItemParams } from "react-native-draggable-flatlist";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
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
import { isIsoDate } from "./src/lib/dates";
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

import { colors, fonts, radii, spacing, typography } from "./src/theme/tokens";
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
import { CompletedTaskSheet } from "./src/components/CompletedTaskSheet";
import { InboxScreen } from "./src/screens/InboxScreen";
import { TimelineScreen } from "./src/screens/TimelineScreen";
import { TimelineLayoutToggle } from "./src/components/TimelineLayoutToggle";
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
import { useReminderSync } from "./src/hooks/useReminderSync";
import { useReducedMotion } from "./src/hooks/useReducedMotion";
import { useDisplayWorkspace } from "./src/hooks/useDisplayWorkspace";
import { resetPreferencesStore, useUserPreferences } from "./src/hooks/useUserPreferences";
import { OverdueSheet } from "./src/features/overdue-triage/OverdueSheet";
import { useOverdueTriageController } from "./src/features/overdue-triage/controller";
import { isTaskInInbox } from "./src/lib/taskState";
import { hasPriorityBoundaryViolation } from "./src/lib/taskLifecycle";
import type { BulkTaskInput } from "./src/lib/bulkTaskCapture";
import { resolveStartupTab } from "./src/lib/tabOrder";
import { feedback } from "./src/lib/feedback";
import {
  AlertCircleIcon,
  InfoCircleIcon,
  SyncLoopIcon,
} from "./src/components/UiIcons";
import AppSettingsIcon from "./src/assets/icons/app-settings.svg";
import KairoMarkIcon from "./src/assets/icons/settings-kairo.svg";

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
  const [selectedCompletedTask, setSelectedCompletedTask] = useState<MobileTask | null>(null);
  const [focusGoalId, setFocusGoalId] = useState<string | null>(null);
  const hasLoggedPostLoginRef = useRef(false);
  const didMarkInteractiveRef = useRef(false);
  const didApplyStartupTabRef = useRef(false);
  const didManuallyChangeTabRef = useRef(false);

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
    const target = isKairoActive ? 0.38 : 1;
    chromeDim.value = reducedMotion
      ? target
      : withTiming(target, { duration: 280 });
  }, [chromeDim, isKairoActive, reducedMotion]);
  const chromeAnimStyle = useAnimatedStyle(() => ({ opacity: chromeDim.value }));

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
  const { prefs, ready: preferencesReady } = useUserPreferences();

  const handleTabChange = useCallback(
    (nextTab: typeof activeTab) => {
      didManuallyChangeTabRef.current = true;
      if (nextTab !== "goals") setFocusGoalId(null);
      setActiveTab(nextTab);
    },
    [setActiveTab],
  );

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
    isNotificationsBusy,
    notificationsEnabled,
    requestNotificationsAccess,
    sendTestNotification,
  } = useNotificationsSettings(showToast);

  // ── Data ────────────────────────────────────────────────────────────

  const needsFullWorkspaceCorpus =
    isKairoActive ||
    activeTab === "insights" ||
    activeTab === "goals" ||
    notificationsEnabled;

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
  const overduePreviewData = useQuery(
    api.overdueReflow.preview,
    session && activeTab === "timeline" ? { today } : "skip"
  );

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

  const shouldSyncReminders = Boolean(session) && notificationsEnabled && isAllTasksReady;
  useReminderSync(allWorkspaceTasks, prefs, shouldSyncReminders);

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
    setSelectedCompletedTask(null);
    setIsSettingsModalOpen(false);
    await clearSnapshot();
    await googleSignOut();
  }, [clearSnapshot, googleSignOut, setIsSettingsModalOpen]);

  const handleWipeLocalData = useCallback(async () => {
    const { wipeLocalAppData } = await import("./src/lib/dataReset");
    await wipeLocalAppData();
    clearAllGoals();
    resetPreferencesStore();
    setSelectedCompletedTask(null);
    setIsSettingsModalOpen(false);
    await clearSnapshot();
    await googleSignOut();
  }, [clearAllGoals, clearSnapshot, googleSignOut, setIsSettingsModalOpen]);

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
    if (!preferencesReady) return;
    if (didApplyStartupTabRef.current) return;
    didApplyStartupTabRef.current = true;
    if (didManuallyChangeTabRef.current) return;

    const startupTab = resolveStartupTab(prefs.tabOrder);
    if (startupTab !== activeTab) {
      setActiveTab(startupTab);
    }
  }, [activeTab, preferencesReady, prefs.tabOrder, setActiveTab]);

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
            time: payload.time,
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
            time: payload.time,
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
    sendToInbox,
    reopenTask,
    deleteTask,
    handleSaveEdits,
    shiftTimelineTask,
    scheduleToDate,
    markManyDone,
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
        feedback.captureSaved();
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
        feedback.error();
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
      time?: string;
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
          time: data.deadline ? data.time : undefined,
          priority: data.priority,
        });
        if (data.goalId && newTaskId) {
          setGoalLink(String(newTaskId), data.goalId);
        }
        feedback.captureSaved();
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
              time: data.deadline ? data.time : undefined,
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
        feedback.error();
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

  const openCompletedTaskDetail = useCallback((task: MobileTask) => {
    setSelectedCompletedTask(task);
  }, []);

  const closeCompletedTaskDetail = useCallback(() => {
    setSelectedCompletedTask(null);
  }, []);

  const viewLinkedGoalFromCompletedTask = useCallback(() => {
    if (!selectedCompletedTask) return;
    const goalId = goalLinks[String(selectedCompletedTask._id)];
    if (!goalId) return;
    setSelectedCompletedTask(null);
    setFocusGoalId(goalId);
    didManuallyChangeTabRef.current = true;
    setActiveTab("goals");
  }, [goalLinks, selectedCompletedTask, setActiveTab]);

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
      if (selectedCompletedTask) {
        setSelectedCompletedTask(null);
        return true;
      }
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
    selectedCompletedTask,
    closeOverdue,
    setIsSettingsModalOpen,
  ]);

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
        swipeActionsEnabled={prefs.swipeActionsEnabled}
      />
    ),
    [
      canUseWorkspaceActions,
      markDone,
      sendToInbox,
      shiftTimelineTask,
      handleEditTask,
      prefs.swipeActionsEnabled,
      taskGoalNames,
    ]
  );

  const renderProgressCompletedTaskItem = useCallback(
    ({ item }: { item: MobileTask }) => (
      <TaskCard
        task={item}
        onDone={canUseWorkspaceActions ? markDone : () => undefined}
        onReopen={canUseWorkspaceActions ? reopenTask : undefined}
        onEdit={canUseWorkspaceActions ? openCompletedTaskDetail : () => undefined}
        linkedGoalName={taskGoalNames.get(String(item._id))}
        swipeActionsEnabled={prefs.swipeActionsEnabled}
      />
    ),
    [
      canUseWorkspaceActions,
      markDone,
      openCompletedTaskDetail,
      prefs.swipeActionsEnabled,
      reopenTask,
      taskGoalNames,
    ]
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
      <StatusBar style="dark" />

      {/* Web-parity grid vignette behind everything. */}
      <GridBackground />

      <Animated.View
        style={[styles.chrome, chromeAnimStyle]}
        pointerEvents={isKairoActive ? "none" : "auto"}
      >
      {/* Compact header: brand mark + view name on one line (the mark already
          says "Pravah"; no caps label needed), subtitle tucked beneath. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerMain}>
          <View style={styles.titleLockup}>
            <BrandMark size={28} />
            <View style={styles.titleTextBlock}>
              <Text style={styles.headerTitle}>{headerViewName}</Text>
              <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
            </View>
          </View>
          <View style={styles.headerLinks}>
            {activeTab === "timeline" ? <TimelineLayoutToggle /> : null}
            <Pressable
              onPress={openKairo}
              disabled={!canUseWorkspaceActions}
              style={({ pressed }) => [styles.kairoChip, pressed && styles.pressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open Kairo"
            >
              <KairoMarkIcon width={18} height={18} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={openSettingsModal}
              disabled={!canOpenSession}
              style={({ pressed }) => [styles.settingsLinkWrap, pressed && styles.pressed]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <AppSettingsIcon width={20} height={20} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Toast — left rule + line of copy, no filled pill. */}
      {toast ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(200)}
          accessibilityLiveRegion={toast.kind === "error" ? "assertive" : "polite"}
          style={[styles.toast, toast.kind === "error" ? styles.toastError : styles.toastInfo]}
        >
          {toast.kind === "error" ? (
            <AlertCircleIcon color={colors.error} size={18} />
          ) : (
            <InfoCircleIcon color={colors.accent} size={18} />
          )}
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
          accessibilityRole="button"
          accessibilityLabel={`${retryQueue.length} pending ${
            retryQueue.length === 1 ? "change" : "changes"
          }. Retry sync.`}
          style={({ pressed }) => [styles.retryBanner, pressed && { opacity: 0.6 }]}
        >
          <View style={styles.statusInline}>
            <SyncLoopIcon color={colors.accent} size={18} />
            <Text style={styles.retryBannerText}>
              {retryQueue.length} change{retryQueue.length === 1 ? "" : "s"} pending sync
            </Text>
          </View>
          <Text style={styles.retryBannerAction}>Retry</Text>
        </Pressable>
      ) : null}

      {/* Sync indicator — a mono log line, not a badge. */}
      {pendingMutations > 0 ? (
        <Text accessibilityLiveRegion="polite" style={styles.syncText}>Syncing</Text>
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
              onEditTask={handleEditTask}
              onScheduleToDate={scheduleToDate}
              onMarkManyDone={markManyDone}
              canAct={canUseWorkspaceActions}
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
              <View style={styles.statusInline}>
                <AlertCircleIcon color={colors.error} size={18} />
                <Text style={styles.syncBrokenText}>Calendar sync paused</Text>
              </View>
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
              layout={prefs.timelineLayout}
              onCompleteTask={canUseWorkspaceActions ? markDone : undefined}
              onReopenTask={canUseWorkspaceActions ? reopenTask : undefined}
              onEditTask={canUseWorkspaceActions ? handleEditTask : undefined}
              getGoalName={(taskId) => taskGoalNames.get(taskId)}
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
              onCreateGoal={
                canUseWorkspaceActions
                  ? () => addTaskSheetRef.current?.open("goal")
                  : undefined
              }
              onCreateTaskForGoal={
                canUseWorkspaceActions
                  ? (goalId) => addTaskSheetRef.current?.openForGoal(goalId)
                  : undefined
              }
              onOpenTask={canUseWorkspaceActions ? handleEditTask : undefined}
              onScheduleToDate={canUseWorkspaceActions ? scheduleToDate : undefined}
              onMarkManyDone={canUseWorkspaceActions ? markManyDone : undefined}
              focusGoalId={focusGoalId}
            />
          </ScreenErrorBoundary>
        </Animated.View>
      ) : null}

      {activeTab === "insights" ? (
        <Animated.View entering={tabEnterAnimation} style={styles.tabScreen}>
          <ScreenErrorBoundary screenName="Progress">
            <InsightsScreen
              tasks={workspaceTaskCorpus}
              completedTasks={displayCompletedTasks}
              isLoading={isActiveListLoading || isBootShellLoading}
              isRefreshing={isRefreshing}
              tabBarHeight={tabBarHeight}
              onRefresh={handleRefresh}
              renderCompletedTaskItem={renderProgressCompletedTaskItem}
            />
          </ScreenErrorBoundary>
        </Animated.View>
      ) : null}

      {/* Bottom tab bar \u2014 no counts; the header subtitle carries those. */}
      <BottomTabBar
        active={activeTab}
        onChange={handleTabChange}
        onCapture={() => addTaskSheetRef.current?.open()}
        canCapture={canUseWorkspaceActions && !isAddSheetOpen && !isEditSheetOpen}
        bottomInset={tabBarBottomPadding}
        tabOrder={prefs.tabOrder}
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
        weekEnd={weekEnd}
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
      <CompletedTaskSheet
        task={selectedCompletedTask}
        linkedGoalName={
          selectedCompletedTask ? taskGoalNames.get(String(selectedCompletedTask._id)) : undefined
        }
        onClose={closeCompletedTaskDetail}
        onDelete={(taskId) => {
          closeCompletedTaskDetail();
          deleteTask(taskId);
        }}
        onReopen={(taskId) => {
          closeCompletedTaskDetail();
          reopenTask(taskId);
        }}
        onViewGoal={
          selectedCompletedTask && goalLinks[String(selectedCompletedTask._id)]
            ? viewLinkedGoalFromCompletedTask
            : undefined
        }
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
          <KeyboardProvider>
            <LaunchGate>
              <ConvexClientProvider>
                <RootErrorBoundary>
                  <ConfirmProvider>
                    <MobileApp />
                  </ConfirmProvider>
                </RootErrorBoundary>
              </ConvexClientProvider>
            </LaunchGate>
          </KeyboardProvider>
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
    paddingBottom: spacing.sm,
  },
  headerMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
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
  },
  // Header links sit in a row so additional affordances (Kairo, Settings)
  // line up with the same visual weight rather than competing for spot.
  headerLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
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
  // Kairo entry point: a quiet square squircle chip with the accent Kairo
  // mark — reads as the AI affordance without a text label.
  kairoChip: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  // Toasts use a quiet tonal fill and full hairline border so status is clear
  // without relying on a decorative side stripe.
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  toastError: {
    borderColor: colors.error,
    backgroundColor: colors.errorMuted,
  },
  toastInfo: {
    borderColor: colors.borderFocus,
    backgroundColor: colors.accentDim,
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

  // Retry and sync surfaces share the same quiet tonal status language.
  retryBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderFocus,
    borderRadius: radii.md,
    backgroundColor: colors.accentDim,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  statusInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  retryBannerText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
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
  // Broken sync is persistent and actionable, but it lives above the task
  // list every session — so it reads as a quiet status line (surface fill,
  // hairline border) with error color reserved for the icon and action.
  syncBrokenBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  syncBrokenText: {
    color: colors.textSecondary,
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
