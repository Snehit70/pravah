import { StatusBar } from "expo-status-bar";
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
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type RenderItemParams } from "react-native-draggable-flatlist";
import { useMutation } from "convex/react";
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
import { addDays, dateLabel, isIsoDate, toIsoDate } from "./src/lib/dates";
import { classifyError, createActionId, mobileLogger } from "./src/lib/logger";

import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, spacing, typography } from "./src/theme/tokens";
import { TaskCard, type MobileTask } from "./src/components/TaskCard";
import { BottomTabBar } from "./src/components/BottomTabBar";
import { GridBackground } from "./src/components/GridBackground";
import { Kairo, type KairoSheetRef } from "./src/components/Kairo";
import { BootScreen } from "./src/components/BootScreen";
import { BrandMark } from "./src/components/BrandMark";
import { FAB } from "./src/components/FAB";
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
import { CompletedScreen } from "./src/screens/CompletedScreen";
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
import { resetPreferencesStore } from "./src/hooks/useUserPreferences";

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
  const kairoRef = useRef<KairoSheetRef>(null);
  const lastListStateLogMsRef = useRef<number>(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
    includeAllTasks: isKairoActive,
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

  const shouldRenderOptimisticShell = sessionLoading && hasCachedSessionHint;
  // Snapshot data is only rendered once useSession() has confirmed an
  // authenticated session. A stale cached auth hint (expired/revoked cookie
  // still in secure storage) must not surface previous workspace data to a
  // viewer whose session has not yet resolved — the boot shell skeleton
  // covers that window instead. The hydrated check still gates display so
  // we never render a partially-populated snapshot.
  const shouldUseWorkspaceSnapshot =
    Boolean(session) &&
    workspaceSnapshot !== null &&
    isWorkspaceSnapshotHydrated &&
    !hasLiveWorkspaceData;

  const displayInboxTasks = shouldUseWorkspaceSnapshot ? workspaceSnapshot.inboxTasks : inboxTasks;
  const displayScheduledTasks = shouldUseWorkspaceSnapshot
    ? workspaceSnapshot.scheduledTasks
    : scheduledTasks;
  const displayCompletedTasks = shouldUseWorkspaceSnapshot
    ? workspaceSnapshot.completedTasks
    : completedTasks;

  const displayTimelineSections = useMemo<[string, MobileTask[]][]>(() => {
    const grouped = new Map<string, MobileTask[]>();
    for (const task of displayScheduledTasks) {
      const key = task.scheduledDate ?? "unscheduled";
      const existing = grouped.get(key) ?? [];
      existing.push(task);
      grouped.set(key, existing);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [displayScheduledTasks]);

  const { displayInboxCount, displayOverdueCount, displayThisWeekCount, displayCompletedCount } =
    useMemo(() => {
      let overdue = 0;
      let thisWeek = 0;
      for (const task of displayScheduledTasks) {
        const date = task.scheduledDate;
        if (!date) continue;
        if (date < today) overdue += 1;
        // Cap "this week" at weekEnd (today+6) so tasks scheduled at today+7
        // via the +1w quickadd aren't double-labelled under a week-bounded
        // header even though they're fetched inside the wider query window.
        else if (date <= weekEnd) thisWeek += 1;
      }
      return {
        displayInboxCount: displayInboxTasks.length,
        displayOverdueCount: overdue,
        displayThisWeekCount: thisWeek,
        displayCompletedCount: displayCompletedTasks.length,
      };
    }, [displayCompletedTasks.length, displayInboxTasks.length, displayScheduledTasks, today, weekEnd]);

  // Mutations still operate on the currently visible list. This keeps
  // optimistic updates scoped to what the user sees while query subscriptions
  // stay always-on in useTaskQueries.
  const activeServerTasks =
    activeTab === "timeline"
      ? scheduledTasks
      : activeTab === "inbox"
        ? inboxTasks
        : completedTasks;

  const tasks = useMemo(
    () =>
      optimisticTasks ??
      (activeTab === "timeline"
        ? displayScheduledTasks
        : activeTab === "inbox"
          ? displayInboxTasks
          : displayCompletedTasks),
    [activeTab, displayCompletedTasks, displayInboxTasks, displayScheduledTasks, optimisticTasks]
  );

  const addTaskMutation = useMutation(api.tasks.addTask);
  const updateTaskMutation = useMutation(api.tasks.updateTask);
  const completeTaskMutation = useMutation(api.tasks.completeTask);
  const moveTaskMutation = useMutation(api.tasks.moveTask);
  const unscheduleTaskMutation = useMutation(api.tasks.unscheduleTask);
  const reopenTaskMutation = useMutation(api.tasks.reopenTask);
  // ── Derived data ────────────────────────────────────────────────────

  const visibleTasks =
    activeTab === "timeline"
      ? (tasks as MobileTask[])
      : activeTab === "inbox"
        ? (tasks as MobileTask[])
        : (tasks as MobileTask[]);

  const isActiveListLoading =
    activeTab === "timeline"
      ? shouldUseWorkspaceSnapshot
        ? false
        : isTimelineLoading
      : activeTab === "inbox"
        ? shouldUseWorkspaceSnapshot
          ? false
          : isInboxLoading
        : activeTab === "completed"
          ? shouldUseWorkspaceSnapshot
            ? false
            : isCompletedLoading
          : false;

  const isBootShellLoading = shouldRenderOptimisticShell && !shouldUseWorkspaceSnapshot && !session;

  const kairoTasks = allWorkspaceTasks;
  const kairoInboxTasks = useMemo(
    () => kairoTasks.filter((task) => task.status === "inbox"),
    [kairoTasks]
  );
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
    resetDailyReminderState,
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

  const handleSignOut = useCallback(() => {
    setIsSettingsModalOpen(false);
    void clearSnapshot();
    googleSignOut();
  }, [clearSnapshot, googleSignOut, setIsSettingsModalOpen]);

  const handleWipeLocalData = useCallback(async () => {
    const { wipeLocalAppData } = await import("./src/lib/dataReset");
    await wipeLocalAppData();
    resetPreferencesStore();
    resetDailyReminderState();
    setIsSettingsModalOpen(false);
    void clearSnapshot();
    googleSignOut();
  }, [clearSnapshot, googleSignOut, resetDailyReminderState, setIsSettingsModalOpen]);

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

  // ── Effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (sessionLoading || session) return;
    void clearSnapshot();
  }, [clearSnapshot, session, sessionLoading]);

  // ── Toast / retry ───────────────────────────────────────────────────

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
    reopenToInbox,
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

  // ── Add task handler (from sheet) ───────────────────────────────────

  const handleAddTask = useCallback(
    async (data: {
      title: string;
      description?: string;
      deadline?: string;
      mode: "inbox" | "today" | "tomorrow" | "nextweek";
      priority?: "p1" | "p2" | "p3";
    }) => {
      const actionId = createActionId("add");
      const startedAt = Date.now();
      mobileLogger.info("add_task_started", {
        actionId,
        mode: data.mode,
        hasDeadline: Boolean(data.deadline),
      });
      const scheduledDate =
        data.mode === "today"
          ? today
          : data.mode === "tomorrow"
            ? toIsoDate(addDays(new Date(), 1))
            : data.mode === "nextweek"
              ? toIsoDate(addDays(new Date(), 7))
              : undefined;
      if (data.deadline && scheduledDate && scheduledDate > data.deadline) {
        showToast({ kind: "error", message: "Scheduled date cannot be after deadline." });
        mobileLogger.warn("add_task_rejected_schedule_after_deadline", {
          actionId,
          mode: data.mode,
        });
        return false;
      }
      try {
        await addTaskMutation({
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          type: data.deadline && scheduledDate ? "deadline" : "open",
          scheduledDate,
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
              scheduledDate,
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
    setIsSettingsModalOpen,
  ]);

  const renderInboxTaskItem = useCallback(
    ({ item, drag }: RenderItemParams<MobileTask>) => (
      <TaskCard
        task={item}
        onDone={canUseWorkspaceActions ? markDone : () => undefined}
        onMoveToday={canUseWorkspaceActions ? moveToToday : undefined}
        onEdit={canUseWorkspaceActions ? handleEditTask : () => undefined}
        onDragHandlePress={canUseWorkspaceActions ? drag : undefined}
      />
    ),
    [canUseWorkspaceActions, handleEditTask, markDone, moveToToday]
  );

  const renderTimelineTaskItem = useCallback(
    (dateKey: string, { item, drag }: RenderItemParams<MobileTask>) => (
      <TaskCard
        task={item}
        dateLabel={dateLabel(dateKey, today, tomorrow, weekEnd)}
        onDone={canUseWorkspaceActions ? markDone : () => undefined}
        onSendToInbox={canUseWorkspaceActions ? sendToInbox : undefined}
        onReorder={
          canUseWorkspaceActions
            ? (taskId, direction) => shiftTimelineTask(taskId, dateKey, direction)
            : undefined
        }
        onEdit={canUseWorkspaceActions ? handleEditTask : () => undefined}
        onDragHandlePress={canUseWorkspaceActions ? drag : undefined}
      />
    ),
    [
      canUseWorkspaceActions,
      today,
      tomorrow,
      weekEnd,
      markDone,
      sendToInbox,
      shiftTimelineTask,
      handleEditTask,
    ]
  );

  const renderCompletedTaskItem = useCallback(
    ({ item }: { item: MobileTask }) => (
      <TaskCard
        task={item}
        onDone={canUseWorkspaceActions ? markDone : () => undefined}
        onReopen={canUseWorkspaceActions ? reopenToInbox : undefined}
        onEdit={canUseWorkspaceActions ? handleEditTask : () => undefined}
      />
    ),
    [canUseWorkspaceActions, handleEditTask, markDone, reopenToInbox]
  );

  // ── Loading / Auth screens ──────────────────────────────────────────

  if (sessionLoading && !hasCachedSessionHint) {
    return <BootScreen />;
  }

  if (!session && !shouldRenderOptimisticShell) {
    return (
      <MobileAuthScreen
        canGoogleSignIn={canGoogleSignIn}
        isSigningIn={isSigningIn}
        onGoogleSignIn={() => void handleGoogleSignIn()}
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
      : activeTab === "completed"
        ? "Completed"
        : activeTab === "goals"
          ? "Goals"
          : "Inbox";

  const padCount = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const timelineSubtitle =
    displayOverdueCount > 0
      ? `${padCount(displayOverdueCount)} overdue · ${padCount(displayThisWeekCount)} this week`
      : `${padCount(displayThisWeekCount)} through this week`;
  const headerSubtitle =
    shouldRenderOptimisticShell
      ? "Restoring your session"
      : session && !hasLiveWorkspaceData
        ? activeTab === "timeline"
          ? "Opening your timeline"
          : activeTab === "completed"
            ? "Opening your archive"
            : activeTab === "goals"
              ? "Opening your goals"
              : "Opening your inbox"
        : session && !isDataBootstrapReady
          ? "Syncing your workspace"
        : activeTab === "timeline"
          ? timelineSubtitle
          : activeTab === "completed"
            ? "Closed loops"
            : activeTab === "goals"
              ? "Long horizon"
              : `${padCount(displayInboxCount)} to triage`;

  // ── Main layout ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Web-parity grid vignette behind everything. */}
      <GridBackground />

      <Animated.View
        style={[styles.chrome, chromeAnimStyle]}
        pointerEvents={isKairoActive ? "none" : "auto"}
      >
      {/* Header — wordmark + view title (Fraunces) with mono subtitle. The
          Settings affordance is a hairline-underlined text link, not a button
          box: nothing is enclosed unless enclosure is earned. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerTop}>
          <View style={styles.brandLockup}>
            <BrandMark size={24} />
            <Text style={styles.wordmark}>Pravah</Text>
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
              <Text style={styles.settingsLink}>Settings</Text>
            </Pressable>
          </View>
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

      {activeTab === "inbox" ? (
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
      ) : null}

      {activeTab === "timeline" ? (
        <ScreenErrorBoundary screenName="Timeline">
          <TimelineScreen
            sections={shouldUseWorkspaceSnapshot ? displayTimelineSections : timelineSections}
            today={today}
            tomorrow={tomorrow}
            weekEnd={weekEnd}
            isLoading={isActiveListLoading || isBootShellLoading}
            isRefreshing={isRefreshing}
            tabBarHeight={tabBarHeight}
            onRefresh={handleRefresh}
            renderItem={renderTimelineTaskItem}
          />
        </ScreenErrorBoundary>
      ) : null}

      {activeTab === "goals" ? (
        <ScreenErrorBoundary screenName="Goals">
          <GoalsScreen tabBarHeight={tabBarHeight} />
        </ScreenErrorBoundary>
      ) : null}

      {activeTab === "completed" ? (
        <ScreenErrorBoundary screenName="Completed">
          <CompletedScreen
            tasks={visibleTasks}
            isLoading={isActiveListLoading || isBootShellLoading}
            isRefreshing={isRefreshing}
            tabBarHeight={tabBarHeight}
            onRefresh={handleRefresh}
            renderItem={renderCompletedTaskItem}
          />
        </ScreenErrorBoundary>
      ) : null}

      {/* FAB */}
      {canUseWorkspaceActions && !isAddSheetOpen && !isEditSheetOpen ? (
        <FAB bottom={fabBottom} onPress={() => addTaskSheetRef.current?.open()} />
      ) : null}

      {/* Bottom tab bar \u2014 no counts; the header subtitle carries those. */}
      <BottomTabBar
        active={activeTab}
        onChange={setActiveTab}
        bottomInset={tabBarBottomPadding}
      />

      </Animated.View>

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
        onComplete={markDone}
        onReopen={reopenToInbox}
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
        onExportTasks={() => void handleExportTasks()}
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
          retryQueueCount={retryQueue.length}
          isKairoActive={isKairoActive}
          isAllTasksReady={isAllTasksReady}
          usingSnapshot={shouldUseWorkspaceSnapshot}
          isDataBootstrapReady={isDataBootstrapReady}
          onToggle={() => setShowDiagnostics((visible) => !visible)}
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
      if (mounted) setStorageReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

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
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Main layout
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  chrome: {
    flex: 1,
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
    fontFamily: fonts.sansSemibold,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  // Header links sit in a row so additional affordances (Kairo, Settings)
  // line up with the same visual weight rather than competing for spot.
  headerLinks: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.lg,
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
  // Kairo entry point: same micro-link dialect as Settings but tinted in the
  // accent so it reads as the AI affordance without needing iconography.
  kairoLink: {
    color: colors.accent,
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
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
    ...StyleSheet.absoluteFillObject,
  },
});
