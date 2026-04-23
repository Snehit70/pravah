import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeIn } from "react-native-reanimated";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { authClient, authStorageReady } from "./src/lib/auth-client";
import { useFonts as useFraunces, Fraunces_300Light, Fraunces_500Medium } from "@expo-google-fonts/fraunces";
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from "@expo-google-fonts/manrope";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { ConvexClientProvider } from "./src/lib/convex";
import { addDays, dateLabel, isIsoDate, toIsoDate } from "./src/lib/dates";
import { classifyError, createActionId, mobileLogger } from "./src/lib/logger";
import {
  disableDailyReminderAsync,
  getNotificationPermissionStateAsync,
  initializeNotificationsAsync,
  isDailyReminderEnabledAsync,
  requestNotificationPermissionAsync,
  scheduleDailyReminderAsync,
  scheduleTestNotificationAsync,
  type NotificationPermissionState,
} from "./src/lib/notifications";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, spacing, typography } from "./src/theme/tokens";
import { TaskCard, type MobileTask } from "./src/components/TaskCard";
import { BottomTabBar, type TabKey } from "./src/components/BottomTabBar";
import { FAB } from "./src/components/FAB";
import { AddTaskSheet, type AddTaskSheetRef } from "./src/components/AddTaskSheet";
import { EditTaskSheet, type EditTaskSheetRef } from "./src/components/EditTaskSheet";

// ── Types ──────────────────────────────────────────────────────────────

type ToastState = {
  kind: "error" | "info";
  message: string;
};

type RetryQueueItem = {
  id: string;
  label: string;
  attempts: number;
  payload: RetryPayload;
};

type RetryPayload =
  | {
      type: "addTask";
      title: string;
      description?: string;
      deadline?: string;
      scheduledDate?: string;
      priority?: "p1" | "p2" | "p3";
    }
  | {
      type: "updateTask";
      taskId: Id<"tasks">;
      title: string;
      description?: string;
      deadline?: string;
      priority?: "p1" | "p2" | "p3";
    }
  | {
      type: "completeTask";
      taskId: Id<"tasks">;
    }
  | {
      type: "moveTask";
      taskId: Id<"tasks">;
      targetDate: string;
    }
  | {
      type: "unscheduleTask";
      taskId: Id<"tasks">;
    }
  | {
      type: "reopenTask";
      taskId: Id<"tasks">;
    };

type SuccessHaptic = "notification" | "light" | "medium";
type IntegrationProvider = "google_calendar" | "gmail";

const RETRY_QUEUE_STORAGE_KEY = "pravah_mobile_retry_queue_v1";
// SecureStore has low KB limits per value. Cap how many items we persist so a
// large description can't overflow the keychain slot silently.
const MAX_RETRY_QUEUE_PERSIST = 20;
const MAX_RETRY_ATTEMPTS = 5;

// ── Helpers ────────────────────────────────────────────────────────────

function isLikelyOfflineError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("offline") ||
    message.includes("timeout") ||
    message.includes("internet")
  );
}

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

function formatStatusLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusTone(status: string): "success" | "warning" | "error" | "muted" {
  if (status === "connected" || status === "granted") return "success";
  if (status === "error" || status === "denied") return "error";
  if (status === "undetermined") return "warning";
  return "muted";
}

// ── Main App ───────────────────────────────────────────────────────────

function MobileApp() {
  const insets = useSafeAreaInsets();
  const addTaskSheetRef = useRef<AddTaskSheetRef>(null);
  const editTaskSheetRef = useRef<EditTaskSheetRef>(null);
  const appStartMsRef = useRef<number>(Date.now());
  const lastListStateLogMsRef = useRef<number>(0);
  const lastRetryPersistLogMsRef = useRef<number>(0);

  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<MobileTask[] | null>(null);
  const [retryQueue, setRetryQueue] = useState<RetryQueueItem[]>([]);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDataBootstrapReady, setIsDataBootstrapReady] = useState(false);
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [isGoogleToggleSaving, setIsGoogleToggleSaving] = useState(false);
  const [isGmailToggleSaving, setIsGmailToggleSaving] = useState(false);
  const [notificationPermissionState, setNotificationPermissionState] =
    useState<NotificationPermissionState>("undetermined");
  const [isNotificationsBusy, setIsNotificationsBusy] = useState(false);
  const [isDailyReminderEnabled, setIsDailyReminderEnabled] = useState(false);

  const sessionResult = authClient.useSession();
  const session = sessionResult.data;
  const sessionLoading = sessionResult.isPending;

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
  const canGoogleSignIn = Boolean(googleWebClientId);

  // ── Data ────────────────────────────────────────────────────────────

  const inboxQuery = useQuery(
    api.tasks.listTasks,
    session && activeTab === "inbox" ? { status: "inbox" } : "skip"
  );
  const scheduledQuery = useQuery(
    api.tasks.listTasks,
    session && activeTab === "timeline" ? { status: "scheduled" } : "skip"
  );
  const completedQuery = useQuery(
    api.tasks.listTasks,
    session && activeTab === "completed" ? { status: "completed" } : "skip"
  );
  const countsQuery = useQuery(api.tasks.getTaskCounts, session ? {} : "skip");
  const calendarIntegrationStatus = useQuery(
    api.sync.getIntegrationStatus,
    session ? { provider: "google_calendar" } : "skip"
  );
  const gmailIntegrationStatus = useQuery(
    api.sync.getIntegrationStatus,
    session ? { provider: "gmail" } : "skip"
  );

  const activeQueryTasks =
    activeTab === "inbox"
      ? inboxQuery
      : activeTab === "timeline"
        ? scheduledQuery
        : completedQuery;

  const serverTasks = useMemo<MobileTask[]>(() => {
    return (
      (activeQueryTasks as Doc<"tasks">[] | undefined)?.map((task) => ({
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
  }, [activeQueryTasks]);
  const tasks = useMemo(() => optimisticTasks ?? serverTasks, [optimisticTasks, serverTasks]);

  const addTaskMutation = useMutation(api.tasks.addTask);
  const updateTaskMutation = useMutation(api.tasks.updateTask);
  const completeTaskMutation = useMutation(api.tasks.completeTask);
  const moveTaskMutation = useMutation(api.tasks.moveTask);
  const unscheduleTaskMutation = useMutation(api.tasks.unscheduleTask);
  const reopenTaskMutation = useMutation(api.tasks.reopenTask);
  const reorderInboxTasksMutation = useMutation(api.tasks.reorderInboxTasks);
  const reorderTasksMutation = useMutation(api.tasks.reorderTasks);
  const storeUserMutation = useMutation(api.users.store);
  const claimLegacyDataMutation = useMutation(api.users.claimLegacyData);
  const upsertIntegrationMutation = useMutation(api.sync.upsertIntegration);
  const importGoogleCalendarAction = useAction(api.syncActions.importGoogleCalendarAction);

  // ── Dates ───────────────────────────────────────────────────────────

  const today = toIsoDate(new Date());
  const tomorrow = toIsoDate(addDays(new Date(), 1));
  const weekEnd = toIsoDate(addDays(new Date(), 7));

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
  const timelineCount = countsQuery?.timelineCount ?? (activeTab === "timeline" ? scheduledTasks.length : 0);
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
  const googleSyncEnabled = Boolean(calendarIntegrationStatus?.integration?.syncEnabled);
  const gmailSyncEnabled = Boolean(gmailIntegrationStatus?.integration?.syncEnabled);
  const pendingGmailReviewCount = gmailIntegrationStatus?.pendingReviewCount ?? 0;
  const calendarSyncStatus = calendarIntegrationStatus?.integration?.status ?? "disconnected";
  const gmailSyncStatus = gmailIntegrationStatus?.integration?.status ?? "disconnected";
  const showToast = useCallback((next: ToastState) => setToast(next), []);
  const notificationsEnabled = notificationPermissionState === "granted";
  const syncSettingsBusy = isCalendarSyncing || isGoogleToggleSaving || isGmailToggleSaving;

  const tabBarBottomPadding = Math.max(insets.bottom, spacing.md);
  const tabBarHeight = 62 + tabBarBottomPadding;
  const fabBottom = tabBarHeight + spacing.xxl;

  // ── Effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: googleWebClientId,
      iosClientId: googleIosClientId,
      // Calendar sync needs the calendar scope; offlineAccess requests a
      // server auth code so the backend can obtain a refresh token.
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      offlineAccess: true,
    });
  }, [googleWebClientId, googleIosClientId]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await initializeNotificationsAsync();
      const [permission, dailyEnabled] = await Promise.all([
        getNotificationPermissionStateAsync(),
        isDailyReminderEnabledAsync(),
      ]);
      if (!mounted) return;
      setNotificationPermissionState(permission);
      setIsDailyReminderEnabled(dailyEnabled);
    })();

    return () => {
      mounted = false;
    };
  }, []);

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
            type: payload.deadline ? "deadline" : "open",
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

  const enqueueRetry = useCallback(
    (item: Omit<RetryQueueItem, "id" | "attempts">) => {
      setRetryQueue((cur) => {
        const next = [...cur, { id: `${Date.now()}-${cur.length}`, attempts: 0, ...item }];
        mobileLogger.warn("retry_enqueued", {
          label: item.label,
          nextQueueSize: next.length,
          payloadType: item.payload.type,
        });
        return next;
      });
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(RETRY_QUEUE_STORAGE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const parsed = JSON.parse(raw) as RetryQueueItem[];
        if (!Array.isArray(parsed)) return;
        const hydrated = parsed.filter(
          (item) =>
            typeof item?.id === "string" &&
            typeof item?.label === "string" &&
            typeof item?.attempts === "number" &&
            item?.payload !== undefined
        );
        setRetryQueue(hydrated);
        mobileLogger.info("retry_queue_hydrated", { hydratedCount: hydrated.length });
      } catch {
        void SecureStore.deleteItemAsync(RETRY_QUEUE_STORAGE_KEY);
        mobileLogger.warn("retry_queue_corrupt_reset");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Keep only the most recent items to stay within SecureStore's per-value
    // size limits. Older unsynced items are dropped; the banner still shows
    // the in-memory count so the user knows to retry manually.
    const toStore = retryQueue.slice(-MAX_RETRY_QUEUE_PERSIST);
    void SecureStore.setItemAsync(RETRY_QUEUE_STORAGE_KEY, JSON.stringify(toStore)).catch((err) => {
      mobileLogger.warn("retry_queue_persist_failed", { errorType: classifyError(err) });
    });
    if (!__DEV__) return;
    const now = Date.now();
    if (now - lastRetryPersistLogMsRef.current < 2000) return;
    lastRetryPersistLogMsRef.current = now;
    mobileLogger.debug("retry_queue_persisted", { queueSize: retryQueue.length, stored: toStore.length });
  }, [retryQueue]);

  const retryQueuedMutations = useCallback(async () => {
    if (!retryQueue.length) return;
    const actionId = createActionId("retry");
    const startedAt = Date.now();
    mobileLogger.info("retry_run_started", { actionId, queueSize: retryQueue.length });
    const snapshot = [...retryQueue];
    setRetryQueue([]);
    let failed = 0;
    for (const queued of snapshot) {
      try {
        await runRetryPayload(queued.payload);
      } catch {
        failed += 1;
        const nextAttempts = queued.attempts + 1;
        mobileLogger.warn("retry_item_failed", {
          actionId,
          label: queued.label,
          payloadType: queued.payload.type,
          attempts: nextAttempts,
          dropped: nextAttempts >= MAX_RETRY_ATTEMPTS,
        });
        if (nextAttempts < MAX_RETRY_ATTEMPTS) {
          setRetryQueue((cur) => [...cur, { ...queued, attempts: nextAttempts }]);
        }
      }
    }
    if (failed === 0) {
      showToast({ kind: "info", message: "Retry complete" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    mobileLogger.info("retry_run_finished", {
      actionId,
      elapsedMs: Date.now() - startedAt,
      attempted: snapshot.length,
      failed,
      succeeded: snapshot.length - failed,
    });
  }, [retryQueue, runRetryPayload, showToast]);

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
    }: {
      optimistic: (current: MobileTask[]) => MobileTask[];
      mutation: () => Promise<void>;
      errorMessage: string;
      actionName: string;
      retryLabel?: string;
      retryPayload?: RetryPayload;
      successHaptic?: SuccessHaptic;
    }): Promise<boolean> => {
      const actionId = createActionId("mutation");
      const startedAt = Date.now();
      mobileLogger.info("mutation_started", {
        actionId,
        actionName,
      });
      setPendingMutations((c) => c + 1);
      setOptimisticTasks((cur) => optimistic(cur ?? serverTasks));
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
        setOptimisticTasks(null);
        const canRetry = retryLabel && retryPayload && isLikelyOfflineError(error);
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
        // Remove from the current tab list immediately; the server will
        // add it to the completed tab once Convex reactivity fires.
        optimistic: (cur) => cur.filter((t) => t._id !== taskId),
        mutation: async () => { await completeTaskMutation({ taskId }); },
        errorMessage: "Could not mark task as done.",
        retryLabel: "Retry done",
        retryPayload: { type: "completeTask", taskId },
      });
    },
    [runOptimisticMutation, completeTaskMutation]
  );

  const moveToToday = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "move_task_today",
        // Remove from inbox immediately; it appears in Timeline once the
        // server update arrives via Convex reactivity.
        optimistic: (cur) => cur.filter((t) => t._id !== taskId),
        mutation: async () => { await moveTaskMutation({ taskId, targetDate: today }); },
        errorMessage: "Could not move task to today.",
        retryLabel: "Retry move to today",
        retryPayload: { type: "moveTask", taskId, targetDate: today },
        successHaptic: "light",
      });
    },
    [runOptimisticMutation, moveTaskMutation, today]
  );

  const sendToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "move_task_inbox",
        // Remove from timeline immediately; it appears in Inbox once the
        // server update arrives via Convex reactivity.
        optimistic: (cur) => cur.filter((t) => t._id !== taskId),
        mutation: async () => { await unscheduleTaskMutation({ taskId }); },
        errorMessage: "Could not move task back to inbox.",
        retryLabel: "Retry move to inbox",
        retryPayload: { type: "unscheduleTask", taskId },
        successHaptic: "light",
      });
    },
    [runOptimisticMutation, unscheduleTaskMutation]
  );

  const reopenToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        actionName: "reopen_task",
        // Remove from completed immediately; it appears in Inbox once the
        // server update arrives via Convex reactivity.
        optimistic: (cur) => cur.filter((t) => t._id !== taskId),
        mutation: async () => { await reopenTaskMutation({ taskId }); },
        errorMessage: "Could not reopen task.",
        retryLabel: "Retry reopen",
        retryPayload: { type: "reopenTask", taskId },
        successHaptic: "light",
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
          type: data.deadline ? "deadline" : "open",
          scheduledDate: data.mode === "today" ? today : undefined,
          priority: data.priority,
        });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        mobileLogger.info("add_task_succeeded", { actionId, elapsedMs: Date.now() - startedAt });
        return true;
      } catch (error) {
        if (isLikelyOfflineError(error)) {
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
          queuedForRetry: isLikelyOfflineError(error),
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
          cur.map((t) =>
            t._id === data.taskId
              ? {
                  ...t,
                  title: data.title,
                  description: data.description,
                  deadline: data.deadline,
                  priority: data.priority,
                  updatedAt: Date.now(),
                }
              : t
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
      });
    },
    [runOptimisticMutation, updateTaskMutation]
  );

  // ── Auth ────────────────────────────────────────────────────────────

  const handleGoogleSignIn = async () => {
    if (!googleWebClientId || isSigningIn) return;
    const actionId = createActionId("auth");
    const startedAt = Date.now();
    mobileLogger.info("google_signin_started", { actionId });
    setIsSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (result.type !== "success") {
        mobileLogger.info("google_signin_cancelled", { actionId });
        return;
      }
      const idToken = result.data.idToken;
      if (!idToken) {
        showToast({ kind: "error", message: "Google sign-in did not return an ID token." });
        return;
      }
      await authClient.signIn.social({
        provider: "google",
        idToken: { token: idToken },
        callbackURL: "/",
      });
      mobileLogger.info("google_signin_succeeded", { actionId, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: unknown }).code
          : undefined;
      const errorName =
        typeof error === "object" && error !== null && "name" in error
          ? (error as { name?: unknown }).name
          : undefined;
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "unknown";

      showToast({ kind: "error", message: "Google sign-in failed. Check OAuth client setup." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      mobileLogger.error("google_signin_failed", {
        actionId,
        elapsedMs: Date.now() - startedAt,
        errorType: classifyError(error),
        errorCode,
        errorName,
        errorMessage,
      });
    } finally {
      setIsSigningIn(false);
    }
  };

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

  const handleSignOut = useCallback(() => {
    mobileLogger.info("signout_confirmed");
    setIsSettingsModalOpen(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    void authClient.signOut();
    // Clear the native Google account so the next sign-in prompts account
    // selection rather than silently reusing the cached account.
    void GoogleSignin.signOut().catch(() => undefined);
  }, []);

  const persistIntegrationToggle = useCallback(
    async (provider: IntegrationProvider, syncEnabled: boolean) => {
      const prev =
        provider === "google_calendar" ? calendarIntegrationStatus?.integration : gmailIntegrationStatus?.integration;
      // Preserve the existing status if one exists; new records start as
      // "disconnected" until a real OAuth flow marks them "connected".
      await upsertIntegrationMutation({
        provider,
        status: prev?.status ?? "disconnected",
        syncEnabled,
        accountEmail: prev?.accountEmail,
      });
    },
    [calendarIntegrationStatus?.integration, gmailIntegrationStatus?.integration, upsertIntegrationMutation]
  );

  const toggleGoogleCalendarSync = useCallback(async () => {
    if (isGoogleToggleSaving) return;
    setIsGoogleToggleSaving(true);
    const next = !googleSyncEnabled;
    try {
      await persistIntegrationToggle("google_calendar", next);
      showToast({
        kind: "info",
        message: next ? "Google Calendar sync enabled." : "Google Calendar sync paused.",
      });
    } catch {
      showToast({ kind: "error", message: "Could not update Google Calendar sync." });
    } finally {
      setIsGoogleToggleSaving(false);
    }
  }, [googleSyncEnabled, isGoogleToggleSaving, persistIntegrationToggle, showToast]);

  const toggleGmailSync = useCallback(async () => {
    if (isGmailToggleSaving) return;
    setIsGmailToggleSaving(true);
    const next = !gmailSyncEnabled;
    try {
      await persistIntegrationToggle("gmail", next);
      showToast({
        kind: "info",
        message: next ? "Gmail sync enabled." : "Gmail sync paused.",
      });
    } catch {
      showToast({ kind: "error", message: "Could not update Gmail sync." });
    } finally {
      setIsGmailToggleSaving(false);
    }
  }, [gmailSyncEnabled, isGmailToggleSaving, persistIntegrationToggle, showToast]);

  const runGoogleCalendarSync = useCallback(async () => {
    if (isCalendarSyncing) return;
    setIsCalendarSyncing(true);
    try {
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.accessToken) {
        showToast({ kind: "error", message: "Could not get Google token. Please sign in again." });
        return;
      }
      await importGoogleCalendarAction({ accessToken: tokens.accessToken });
      // The calendarIntegrationStatus query is reactive — it updates
      // automatically once the action mutates the integration record.
      showToast({ kind: "info", message: "Google Calendar sync complete." });
    } catch {
      showToast({ kind: "error", message: "Google Calendar sync failed. Try again." });
    } finally {
      setIsCalendarSyncing(false);
    }
  }, [importGoogleCalendarAction, isCalendarSyncing, showToast]);

  const syncBothNow = useCallback(async () => {
    try {
      await Promise.all([
        persistIntegrationToggle("google_calendar", true),
        persistIntegrationToggle("gmail", true),
      ]);
      showToast({ kind: "info", message: "Both integrations enabled." });
      await runGoogleCalendarSync();
    } catch {
      showToast({ kind: "error", message: "Could not enable both integrations." });
    }
  }, [persistIntegrationToggle, runGoogleCalendarSync, showToast]);

  const requestNotificationsAccess = useCallback(async () => {
    if (isNotificationsBusy) return;
    setIsNotificationsBusy(true);
    try {
      const permission = await requestNotificationPermissionAsync();
      setNotificationPermissionState(permission);
      if (permission === "granted") {
        showToast({ kind: "info", message: "Notifications enabled." });
      } else {
        showToast({ kind: "error", message: "Notification permission not granted." });
      }
    } catch {
      showToast({ kind: "error", message: "Could not update notification permission." });
    } finally {
      setIsNotificationsBusy(false);
    }
  }, [isNotificationsBusy, showToast]);

  const toggleDailyReminder = useCallback(async () => {
    if (isNotificationsBusy) return;
    setIsNotificationsBusy(true);
    try {
      let permission = notificationPermissionState;
      if (permission !== "granted") {
        permission = await requestNotificationPermissionAsync();
        setNotificationPermissionState(permission);
      }

      if (permission !== "granted") {
        showToast({ kind: "error", message: "Enable notifications to use reminders." });
        return;
      }

      const next = !isDailyReminderEnabled;
      if (next) {
        await scheduleDailyReminderAsync();
        setIsDailyReminderEnabled(true);
        showToast({ kind: "info", message: "Daily reminder set for 9:00 AM." });
      } else {
        await disableDailyReminderAsync();
        setIsDailyReminderEnabled(false);
        showToast({ kind: "info", message: "Daily reminder disabled." });
      }
    } catch {
      showToast({ kind: "error", message: "Could not update daily reminder." });
    } finally {
      setIsNotificationsBusy(false);
    }
  }, [isDailyReminderEnabled, isNotificationsBusy, notificationPermissionState, showToast]);

  const sendTestNotification = useCallback(async () => {
    if (isNotificationsBusy) return;
    setIsNotificationsBusy(true);
    try {
      let permission = notificationPermissionState;
      if (permission !== "granted") {
        permission = await requestNotificationPermissionAsync();
        setNotificationPermissionState(permission);
      }
      if (permission !== "granted") {
        showToast({ kind: "error", message: "Enable notifications to send a test alert." });
        return;
      }

      await scheduleTestNotificationAsync();
      showToast({ kind: "info", message: "Test notification sent." });
    } catch {
      showToast({ kind: "error", message: "Could not send test notification." });
    } finally {
      setIsNotificationsBusy(false);
    }
  }, [isNotificationsBusy, notificationPermissionState, showToast]);

  const handleInboxDragEnd = useCallback(
    async ({ data }: { data: MobileTask[] }) => {
      if (hasPriorityBoundaryViolation(inboxTasks, data)) {
        showToast({ kind: "error", message: "Drag only within the same priority group." });
        return;
      }
      const taskIds = data.map((task) => task._id);
      const positionMap = new Map(taskIds.map((taskId, index) => [taskId, index]));
      const now = Date.now();
      setOptimisticTasks((current) =>
        (current ?? serverTasks).map((task) =>
          task.status === "inbox" && positionMap.has(task._id)
            ? {
                ...task,
                position: positionMap.get(task._id) ?? task.position,
                updatedAt: now,
              }
            : task
        )
      );
      try {
        await reorderInboxTasksMutation({ taskIds });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        setOptimisticTasks(null);
        showToast({ kind: "error", message: "Could not save inbox order." });
      }
    },
    [inboxTasks, reorderInboxTasksMutation, serverTasks, showToast]
  );

  const handleTimelineDragEnd = useCallback(
    async (dateKey: string, original: MobileTask[], data: MobileTask[]) => {
      if (hasPriorityBoundaryViolation(original, data)) {
        showToast({ kind: "error", message: "Drag only within the same priority group." });
        return;
      }
      const taskIds = data.map((task) => task._id);
      const positionMap = new Map(taskIds.map((taskId, index) => [taskId, index]));
      const now = Date.now();
      setOptimisticTasks((current) =>
        (current ?? serverTasks).map((task) =>
          task.status === "scheduled" && task.scheduledDate === dateKey && positionMap.has(task._id)
            ? {
                ...task,
                position: positionMap.get(task._id) ?? task.position,
                updatedAt: now,
              }
            : task
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

  const emptyState = useMemo(() => {
    if (activeTab === "timeline") {
      return {
        title: "No scheduled tasks",
        body: "No tasks on your timeline yet. Move one from Inbox to Today.",
      };
    }
    if (activeTab === "completed") {
      return {
        title: "Nothing completed yet",
        body: "Mark one task done to build momentum.",
      };
    }
    return {
      title: "Inbox zero",
      body: "You are all caught up. Tap + to capture the next task.",
    };
  }, [activeTab]);

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
        <Animated.View entering={FadeIn.duration(400)} style={styles.authCard}>
          <Text style={styles.kicker}>Pravah</Text>
          <Text style={styles.authTitle}>Welcome back</Text>
          <Text style={styles.authSubtitle}>
            Sign in with Google to sync your tasks across devices.
          </Text>
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

  // ── Header subtitle ─────────────────────────────────────────────────

  const headerSubtitle =
    activeTab === "timeline"
      ? `${timelineCount} task${timelineCount === 1 ? "" : "s"} scheduled`
      : activeTab === "completed"
        ? "Closed loops"
        : `${inboxCount} task${inboxCount === 1 ? "" : "s"} to triage`;

  // ── Main layout ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Single warm halo top-right — replaces the two saturated blur circles. */}
      <View pointerEvents="none" style={styles.halo} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.kicker}>Pravah</Text>
            <Text style={styles.headerTitle}>
              {activeTab === "timeline"
                ? "Timeline"
                : activeTab === "completed"
                  ? "Completed"
                  : "Inbox"}
            </Text>
          </View>
          <Pressable
            onPress={openSettingsModal}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <View style={styles.settingsIcon}>
              <View style={styles.settingsDot} />
              <View style={styles.settingsDot} />
              <View style={styles.settingsDot} />
            </View>
          </Pressable>
        </View>
        <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
      </View>

      {/* Toast */}
      {toast ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.toast, toast.kind === "error" ? styles.toastError : styles.toastInfo]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      ) : null}

      {/* Retry banner */}
      {retryQueue.length > 0 ? (
        <Pressable
          onPress={() => void retryQueuedMutations()}
          style={({ pressed }) => [styles.retryBanner, pressed && styles.pressed]}
        >
          <Text style={styles.retryBannerText}>
            {retryQueue.length} change{retryQueue.length === 1 ? "" : "s"} pending sync. Tap to retry now.
          </Text>
        </Pressable>
      ) : null}

      {/* Sync indicator */}
      {pendingMutations > 0 ? (
        <Text style={styles.syncText}>Syncing changes...</Text>
      ) : null}

      {/* Task list */}
      {activeTab === "inbox" ? (
        <DraggableFlatList
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 84 }]}
          data={inboxTasks}
          keyExtractor={(item) => item._id}
          renderItem={renderInboxTaskItem}
          onDragEnd={(params) => void handleInboxDragEnd(params)}
          activationDistance={10}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bgCard}
            />
          }
          ListEmptyComponent={
            <Animated.View entering={FadeIn.duration(300)} style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{emptyState.title}</Text>
              <Text style={styles.emptyText}>{emptyState.body}</Text>
            </Animated.View>
          }
        />
      ) : null}

      {activeTab === "timeline" ? (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 84 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bgCard}
            />
          }
        >
          {timelineSections.length ? (
            timelineSections.map(([dateKey, tasksForDate]) => (
              <View key={dateKey}>
                <Text style={styles.sectionDate}>{dateLabel(dateKey, today, tomorrow, weekEnd)}</Text>
                <DraggableFlatList
                  data={tasksForDate}
                  keyExtractor={(item) => item._id}
                  renderItem={renderTimelineTaskItem(dateKey)}
                  onDragEnd={({ data }) => void handleTimelineDragEnd(dateKey, tasksForDate, data)}
                  activationDistance={10}
                  scrollEnabled={false}
                  containerStyle={styles.timelineSectionList}
                />
              </View>
            ))
          ) : (
            <Animated.View entering={FadeIn.duration(300)} style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{emptyState.title}</Text>
              <Text style={styles.emptyText}>{emptyState.body}</Text>
            </Animated.View>
          )}
        </ScrollView>
      ) : null}

      {activeTab === "completed" ? (
        <FlatList
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 84 }]}
          data={completedTasks}
          keyExtractor={(item) => item._id}
          renderItem={renderCompletedTaskItem}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bgCard}
            />
          }
          ListEmptyComponent={
            <Animated.View entering={FadeIn.duration(300)} style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{emptyState.title}</Text>
              <Text style={styles.emptyText}>{emptyState.body}</Text>
            </Animated.View>
          }
        />
      ) : null}

      {/* FAB */}
      {!isAddSheetOpen && !isEditSheetOpen ? (
        <FAB bottom={fabBottom} onPress={() => addTaskSheetRef.current?.open()} />
      ) : null}

      {/* Bottom tab bar */}
      <BottomTabBar
        active={activeTab}
        onChange={setActiveTab}
        inboxCount={inboxCount}
        timelineCount={timelineCount}
        doneCount={completedCount}
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

      <Modal
        animationType="fade"
        transparent
        visible={isSettingsModalOpen}
        onRequestClose={() => setIsSettingsModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsSettingsModalOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>Workspace</Text>
                <Text style={styles.modalTitle}>Settings</Text>
                <Text style={styles.modalSubtitle}>Google sync, reminders, and account controls.</Text>
              </View>
              <Pressable
                onPress={() => setIsSettingsModalOpen(false)}
                style={({ pressed }) => [styles.modalCloseButton, pressed && styles.pressed]}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.integrationCard}>
                <View style={styles.integrationHeader}>
                  <View style={styles.integrationTitleWrap}>
                    <Text style={styles.integrationTitle}>Google Calendar</Text>
                    <Text style={styles.integrationHint}>Pull events and deadlines into Pravah.</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      getStatusTone(calendarSyncStatus) === "success" && styles.statusBadgeSuccess,
                      getStatusTone(calendarSyncStatus) === "warning" && styles.statusBadgeWarning,
                      getStatusTone(calendarSyncStatus) === "error" && styles.statusBadgeError,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>{formatStatusLabel(calendarSyncStatus)}</Text>
                  </View>
                </View>
                <View style={styles.integrationRow}>
                  <View style={styles.integrationCopy}>
                    <Text style={styles.integrationLabel}>Enable sync</Text>
                    <Text style={styles.integrationHelp}>Keep your task timeline aligned with Google Calendar.</Text>
                  </View>
                  <Switch
                    value={googleSyncEnabled}
                    onValueChange={() => void toggleGoogleCalendarSync()}
                    disabled={isGoogleToggleSaving}
                    trackColor={{ false: colors.border, true: colors.tabActive }}
                    thumbColor={colors.textPrimary}
                  />
                </View>
                <Pressable
                  onPress={() => void runGoogleCalendarSync()}
                  disabled={isCalendarSyncing}
                  style={({ pressed }) => [
                    styles.primaryActionButton,
                    isCalendarSyncing && styles.disabledButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryActionText}>{isCalendarSyncing ? "Syncing..." : "Sync now"}</Text>
                </Pressable>
              </View>

              <View style={styles.integrationCard}>
                <View style={styles.integrationHeader}>
                  <View style={styles.integrationTitleWrap}>
                    <Text style={styles.integrationTitle}>Gmail</Text>
                    <Text style={styles.integrationHint}>Surface pending email follow-ups for review.</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      getStatusTone(gmailSyncStatus) === "success" && styles.statusBadgeSuccess,
                      getStatusTone(gmailSyncStatus) === "warning" && styles.statusBadgeWarning,
                      getStatusTone(gmailSyncStatus) === "error" && styles.statusBadgeError,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>{formatStatusLabel(gmailSyncStatus)}</Text>
                  </View>
                </View>
                <View style={styles.integrationRow}>
                  <View style={styles.integrationCopy}>
                    <Text style={styles.integrationLabel}>Enable sync</Text>
                    <Text style={styles.integrationHelp}>Review email-based tasks before they enter your workspace.</Text>
                  </View>
                  <Switch
                    value={gmailSyncEnabled}
                    onValueChange={() => void toggleGmailSync()}
                    disabled={isGmailToggleSaving}
                    trackColor={{ false: colors.border, true: colors.tabActive }}
                    thumbColor={colors.textPrimary}
                  />
                </View>
                <View style={styles.metricPill}>
                  <Text style={styles.metricPillText}>Pending review items: {pendingGmailReviewCount}</Text>
                </View>
              </View>

              <View style={styles.integrationCard}>
                <View style={styles.integrationHeader}>
                  <View style={styles.integrationTitleWrap}>
                    <Text style={styles.integrationTitle}>Notifications</Text>
                    <Text style={styles.integrationHint}>Daily reminders and test alerts for mobile follow-through.</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      getStatusTone(notificationPermissionState) === "success" && styles.statusBadgeSuccess,
                      getStatusTone(notificationPermissionState) === "warning" && styles.statusBadgeWarning,
                      getStatusTone(notificationPermissionState) === "error" && styles.statusBadgeError,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>{formatStatusLabel(notificationPermissionState)}</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => void requestNotificationsAccess()}
                  disabled={isNotificationsBusy || notificationsEnabled}
                  style={({ pressed }) => [
                    styles.secondaryActionButton,
                    (isNotificationsBusy || notificationsEnabled) && styles.disabledButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryActionText}>
                    {notificationsEnabled ? "Permission granted" : "Enable notifications"}
                  </Text>
                </Pressable>
                <View style={styles.integrationRow}>
                  <View style={styles.integrationCopy}>
                    <Text style={styles.integrationLabel}>Daily reminder</Text>
                    <Text style={styles.integrationHelp}>Send one reminder at 9:00 AM every day.</Text>
                  </View>
                  <Switch
                    value={isDailyReminderEnabled}
                    onValueChange={() => void toggleDailyReminder()}
                    disabled={isNotificationsBusy}
                    trackColor={{ false: colors.border, true: colors.tabActive }}
                    thumbColor={colors.textPrimary}
                  />
                </View>
                <Pressable
                  onPress={() => void sendTestNotification()}
                  disabled={isNotificationsBusy}
                  style={({ pressed }) => [
                    styles.primaryActionButton,
                    isNotificationsBusy && styles.disabledButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryActionText}>Send test notification</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => void syncBothNow()}
                disabled={syncSettingsBusy}
                style={({ pressed }) => [
                  styles.syncAllButton,
                  syncSettingsBusy && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.syncAllButtonText}>Enable and sync both</Text>
              </Pressable>

              <View style={styles.accountCard}>
                <Text style={styles.accountTitle}>Account</Text>
                <Text style={styles.accountCopy}>Sign out if you want to switch Google accounts on this device.</Text>
                <Pressable
                  onPress={handleSignOut}
                  style={({ pressed }) => [styles.modalSignOutButton, pressed && styles.pressed]}
                >
                  <Text style={styles.modalSignOutText}>Sign out</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    Fraunces_500Medium,
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
              <MobileApp />
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
    ...typography.h2,
    textAlign: "center",
  },
  authCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    padding: spacing.xl,
    gap: spacing.md,
  },
  authTitle: {
    color: colors.textPrimary,
    ...typography.h1,
  },
  authSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  authHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  googleButton: {
    borderRadius: radii.md,
    backgroundColor: colors.textPrimary,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  googleButtonText: {
    color: colors.bg,
    fontWeight: "700",
    fontSize: 15,
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

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  kicker: {
    color: colors.accent,
    ...typography.kicker,
  },
  headerTitle: {
    color: colors.textPrimary,
    ...typography.h1,
    marginTop: 2,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  settingsButton: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    width: 38,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  settingsIcon: {
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textSecondary,
  },

  // Toast
  toast: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  toastError: {
    backgroundColor: colors.errorBg,
    borderColor: colors.errorBorder,
  },
  toastInfo: {
    backgroundColor: colors.infoBg,
    borderColor: colors.infoBorder,
  },
  toastText: {
    color: colors.infoText,
    ...typography.caption,
  },

  // Retry / sync
  retryBanner: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primaryBgHover,
    backgroundColor: "#0f2d1f",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  retryBannerText: {
    color: colors.primaryText,
    ...typography.label,
  },
  syncText: {
    color: colors.accent,
    ...typography.caption,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 160,
  },
  timelineSectionList: {
    marginBottom: spacing.sm,
  },
  sectionDate: {
    color: colors.accent,
    ...typography.label,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  // Empty states
  emptyCard: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    gap: spacing.sm,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  modalCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    padding: spacing.lg,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalEyebrow: {
    color: colors.accent,
    ...typography.kicker,
  },
  modalCloseButton: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.bgInput,
  },
  modalCloseText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: "700",
  },
  modalScroll: {
    marginTop: spacing.md,
  },
  modalScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  modalTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: {
    marginTop: spacing.md,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  integrationCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    padding: spacing.md,
    gap: spacing.md,
  },
  integrationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  integrationTitleWrap: {
    flex: 1,
    gap: 4,
  },
  integrationTitle: {
    color: colors.textPrimary,
    ...typography.body,
  },
  integrationHint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  integrationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  integrationCopy: {
    flex: 1,
    gap: 4,
    paddingRight: spacing.sm,
  },
  integrationLabel: {
    color: colors.textSecondary,
    ...typography.bodySmall,
  },
  integrationHelp: {
    color: colors.textMuted,
    ...typography.caption,
    lineHeight: 17,
  },
  statusBadge: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ghostBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeSuccess: {
    backgroundColor: colors.primaryBg,
    borderColor: colors.primaryBgHover,
  },
  statusBadgeWarning: {
    backgroundColor: "#3b2b11",
    borderColor: "#7c5a12",
  },
  statusBadgeError: {
    backgroundColor: colors.errorBg,
    borderColor: colors.errorBorder,
  },
  statusBadgeText: {
    color: colors.textPrimary,
    ...typography.caption,
    fontWeight: "700",
  },
  primaryActionButton: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primaryBgHover,
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: colors.primaryText,
    ...typography.bodySmall,
    fontWeight: "700",
  },
  secondaryActionButton: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ghostBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: colors.ghostText,
    ...typography.bodySmall,
    fontWeight: "700",
  },
  pendingText: {
    color: colors.textMuted,
    ...typography.caption,
  },
  metricPill: {
    alignSelf: "flex-start",
    borderRadius: radii.full,
    backgroundColor: colors.ghostBg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metricPillText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: "700",
  },
  syncAllButton: {
    borderRadius: radii.lg,
    backgroundColor: colors.textPrimary,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  syncAllButtonText: {
    color: colors.bg,
    ...typography.bodySmall,
    fontWeight: "800",
  },
  accountCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    padding: spacing.md,
    gap: spacing.sm,
  },
  accountTitle: {
    color: colors.textPrimary,
    ...typography.body,
  },
  accountCopy: {
    color: colors.textMuted,
    ...typography.caption,
    lineHeight: 18,
  },
  modalCancelButton: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontWeight: "700",
  },
  modalSignOutButton: {
    borderRadius: radii.md,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSignOutText: {
    color: colors.infoText,
    fontWeight: "800",
  },

  // Shared
  pressed: {
    opacity: 0.8,
  },
});
