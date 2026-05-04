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
import { dateLabel, isIsoDate } from "./src/lib/dates";
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
import { InboxScreen } from "./src/screens/InboxScreen";
import { TimelineScreen } from "./src/screens/TimelineScreen";
import { CompletedScreen } from "./src/screens/CompletedScreen";
import { useRetryQueue, type RetryPayload } from "./src/hooks/useRetryQueue";
import { useTaskMutations } from "./src/hooks/useTaskMutations";
import { useTaskQueries } from "./src/hooks/useTaskQueries";
import { useWorkspaceState } from "./src/hooks/useWorkspaceState";
import { useGoogleAuth } from "./src/hooks/useGoogleAuth";
import { useNotificationsSettings } from "./src/hooks/useNotificationsSettings";
import { useIntegrationsSettings } from "./src/hooks/useIntegrationsSettings";

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
    inboxCount,
    timelineCount,
    completedCount,
    isInboxLoading,
    isTimelineLoading,
    isCompletedLoading,
  } = useTaskQueries({
    isAuthenticated: Boolean(session),
    includeAllTasks: isKairoActive,
  });

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
    () => optimisticTasks ?? activeServerTasks,
    [optimisticTasks, activeServerTasks]
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
      ? isTimelineLoading
      : activeTab === "inbox"
        ? isInboxLoading
        : isCompletedLoading;

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
  }, [googleSignOut, setIsSettingsModalOpen]);

  // ── Effects ─────────────────────────────────────────────────────────

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
  }, [setIsSettingsModalOpen]);

  const openKairo = useCallback(() => {
    mobileLogger.info("kairo_opened");
    kairoRef.current?.open();
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
    (dateKey: string, { item, drag }: RenderItemParams<MobileTask>) => (
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

  // ── Loading / Auth screens ──────────────────────────────────────────

  if (sessionLoading || (session && !isDataBootstrapReady)) {
    return <BootScreen />;
  }

  if (!session) {
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
          <View style={styles.brandLockup}>
            <BrandMark size={24} />
            <Text style={styles.wordmark}>Pravah</Text>
          </View>
          <View style={styles.headerLinks}>
            <Pressable
              onPress={openKairo}
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

      {activeTab === "inbox" ? (
        <ScreenErrorBoundary screenName="Inbox">
          <InboxScreen
            tasks={visibleTasks}
            isLoading={isActiveListLoading}
            isRefreshing={isRefreshing}
            tabBarHeight={tabBarHeight}
            onRefresh={handleRefresh}
            onDragEnd={handleInboxDragEnd}
            onCapture={() => addTaskSheetRef.current?.open()}
            renderItem={renderInboxTaskItem}
          />
        </ScreenErrorBoundary>
      ) : null}

      {activeTab === "timeline" ? (
        <ScreenErrorBoundary screenName="Timeline">
          <TimelineScreen
            sections={timelineSections}
            today={today}
            tomorrow={tomorrow}
            weekEnd={weekEnd}
            isLoading={isActiveListLoading}
            isRefreshing={isRefreshing}
            tabBarHeight={tabBarHeight}
            onRefresh={handleRefresh}
            onDragEnd={handleTimelineDragEnd}
            renderItem={renderTimelineTaskItem}
          />
        </ScreenErrorBoundary>
      ) : null}

      {activeTab === "completed" ? (
        <ScreenErrorBoundary screenName="Completed">
          <CompletedScreen
            tasks={visibleTasks}
            isLoading={isActiveListLoading}
            isRefreshing={isRefreshing}
            tabBarHeight={tabBarHeight}
            onRefresh={handleRefresh}
            renderItem={renderCompletedTaskItem}
          />
        </ScreenErrorBoundary>
      ) : null}

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
        tasks={kairoTasks}
        inboxTasks={kairoInboxTasks}
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
    return <BootScreen detail="Restoring your secure session cache." />;
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
    return <BootScreen detail="Loading Pravah's interface." />;
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
