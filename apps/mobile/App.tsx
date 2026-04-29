import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type RenderItemParams } from "react-native-draggable-flatlist";
import { useMutation, useQuery } from "convex/react";
import type { Doc } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import * as Haptics from "expo-haptics";
import { authClient, authStorageReady } from "./src/lib/auth-client";
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

import { colors, fonts, radii, spacing, typography } from "./src/theme/tokens";
import { TaskCard, type MobileTask } from "./src/components/TaskCard";
import { BottomTabBar, type TabKey } from "./src/components/BottomTabBar";
import { GridBackground } from "./src/components/GridBackground";
import { Kairo, type KairoSheetRef } from "./src/components/Kairo";
import { FAB } from "./src/components/FAB";
import { AddTaskSheet, type AddTaskSheetRef } from "./src/components/AddTaskSheet";
import { EditTaskSheet, type EditTaskSheetRef } from "./src/components/EditTaskSheet";
import { RootErrorBoundary } from "./src/components/RootErrorBoundary";
import { SettingsSheet } from "./src/components/SettingsSheet";
import { TaskTabContent } from "./src/components/TaskTabContent";
import { useRetryQueue, type RetryPayload } from "./src/hooks/useRetryQueue";
import { useTaskMutations } from "./src/hooks/useTaskMutations";
import { useGoogleAuth } from "./src/hooks/useGoogleAuth";
import { useNotificationsSettings } from "./src/hooks/useNotificationsSettings";
import { useIntegrationsSettings } from "./src/hooks/useIntegrationsSettings";

// ── Types ──────────────────────────────────────────────────────────────

type ToastState = {
  kind: "error" | "info";
  message: string;
};

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
  const appStartMsRef = useRef<number>(Date.now());
  const lastListStateLogMsRef = useRef<number>(0);

  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<MobileTask[] | null>(null);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isKairoActive, setIsKairoActive] = useState(false);
  const chromeDim = useSharedValue(1);
  useEffect(() => {
    chromeDim.value = withTiming(isKairoActive ? 0.38 : 1, { duration: 280 });
  }, [chromeDim, isKairoActive]);
  const chromeAnimStyle = useAnimatedStyle(() => ({ opacity: chromeDim.value }));
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
    session && activeTab === "timeline" ? { endDate: weekEnd } : "skip"
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
  const storeUserMutation = useMutation(api.users.store);
  const claimLegacyDataMutation = useMutation(api.users.claimLegacyData);

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
  } = useIntegrationsSettings({ isAuthenticated: Boolean(session), showToast });

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
  }, [pendingMutations]);

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

  const {
    markDone,
    moveToToday,
    sendToInbox,
    reopenToInbox,
    handleSaveEdits,
    handleInboxDragEnd,
    handleTimelineDragEnd,
    shiftTimelineTask,
  } = useTaskMutations({
    serverTasks,
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

  const renderInboxTaskItem = useCallback(
    ({ item, drag }: RenderItemParams<MobileTask>) => (
      <TaskCard
        task={item}
        onDone={markDone}
        onMoveToday={moveToToday}
        onEdit={handleEditTask}
        onDragHandlePress={drag}
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
          onReorder={(taskId, direction) => shiftTimelineTask(taskId, dateKey, direction)}
          onEdit={handleEditTask}
          onDragHandlePress={drag}
        />
      ),
    [today, tomorrow, weekEnd, markDone, sendToInbox, shiftTimelineTask, handleEditTask]
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
        <GridBackground />
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
      ? `${padCount(timelineCount)} through this week`
      : activeTab === "completed"
        ? "Closed loops"
        : `${padCount(inboxCount)} to triage`;

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
          <Text style={styles.wordmark}>Pravah</Text>
          <View style={styles.headerLinks}>
            <Pressable
              onPress={() => kairoRef.current?.open()}
              style={({ pressed }) => [styles.settingsLinkWrap, pressed && styles.pressed]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Open Kairo assistant"
            >
              <Text style={styles.kairoLink}>Kairo</Text>
            </Pressable>
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
        onInboxDragEnd={handleInboxDragEnd}
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
      />

      {/* Kairo lives at the root so its overlay sits above tabs and FAB. The
          parent dims the rest of the chrome via isKairoActive when the sheet
          is open, matching web's 0.38-opacity fade behind the active panel. */}
      <Kairo
        ref={kairoRef}
        tasks={tasks}
        inboxTasks={inboxTasks}
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
  const [fontsLoaded] = useGeistFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_500Medium,
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
