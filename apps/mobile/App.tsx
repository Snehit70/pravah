import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  SectionList,
  type SectionListRenderItemInfo,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeIn } from "react-native-reanimated";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { authClient, authStorageReady } from "./src/lib/auth-client";
import { ConvexClientProvider } from "./src/lib/convex";
import { addDays, dateLabel, isIsoDate, toIsoDate } from "./src/lib/dates";
import { classifyError, createActionId, mobileLogger } from "./src/lib/logger";
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

type TaskSection = {
  key: string;
  dateKey?: string;
  data: MobileTask[];
};

type RetryPayload =
  | {
      type: "addTask";
      title: string;
      description?: string;
      deadline?: string;
      scheduledDate?: string;
    }
  | {
      type: "updateTask";
      taskId: Id<"tasks">;
      title: string;
      description?: string;
      deadline?: string;
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

const RETRY_QUEUE_STORAGE_KEY = "pravah_mobile_retry_queue_v1";

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

// ── Main App ───────────────────────────────────────────────────────────

function MobileApp() {
  const convex = useConvex();
  const insets = useSafeAreaInsets();
  const addTaskSheetRef = useRef<AddTaskSheetRef>(null);
  const editTaskSheetRef = useRef<EditTaskSheetRef>(null);
  const appStartMsRef = useRef<number>(Date.now());
  const lastListStateLogMsRef = useRef<number>(0);
  const lastRetryPersistLogMsRef = useRef<number>(0);

  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuthHydrated, setIsAuthHydrated] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<MobileTask[] | null>(null);
  const [retryQueue, setRetryQueue] = useState<RetryQueueItem[]>([]);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);

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

  // ── Dates ───────────────────────────────────────────────────────────

  const today = toIsoDate(new Date());
  const tomorrow = toIsoDate(addDays(new Date(), 1));
  const weekEnd = toIsoDate(addDays(new Date(), 7));

  // ── Derived data ────────────────────────────────────────────────────

  const inboxTasks = useMemo(() => {
    if (activeTab !== "inbox") return [];
    return [...tasks].sort((a, b) => a.position - b.position);
  }, [activeTab, tasks]);

  const scheduledTasks = useMemo(() => {
    if (activeTab !== "timeline") return [];
    return [...tasks].sort(
      (a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "") || a.position - b.position
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

  const tabBarBottomPadding = Math.max(insets.bottom, spacing.md);
  const tabBarHeight = 62 + tabBarBottomPadding;
  const fabBottom = tabBarHeight + spacing.xxl;

  // ── Effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    authStorageReady.finally(() => {
      if (mounted) {
        setIsAuthHydrated(true);
        mobileLogger.info("auth_storage_hydrated", {
          elapsedMs: Date.now() - appStartMsRef.current,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: googleWebClientId,
      iosClientId: googleIosClientId,
    });
  }, [googleWebClientId, googleIosClientId]);

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

  const showToast = useCallback((next: ToastState) => setToast(next), []);

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
          });
          return;
        }
        case "updateTask": {
          await updateTaskMutation({
            taskId: payload.taskId,
            title: payload.title,
            description: payload.description,
            deadline: payload.deadline,
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
    void SecureStore.setItemAsync(RETRY_QUEUE_STORAGE_KEY, JSON.stringify(retryQueue));
    if (!__DEV__) return;
    const now = Date.now();
    if (now - lastRetryPersistLogMsRef.current < 2000) return;
    lastRetryPersistLogMsRef.current = now;
    mobileLogger.debug("retry_queue_persisted", { queueSize: retryQueue.length });
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
        mobileLogger.warn("retry_item_failed", {
          actionId,
          label: queued.label,
          payloadType: queued.payload.type,
          attempts: queued.attempts + 1,
        });
        setRetryQueue((cur) => [...cur, { ...queued, attempts: queued.attempts + 1 }]);
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
        optimistic: (cur) =>
          cur.map((t) => (t._id === taskId ? { ...t, status: "completed" as const, updatedAt: Date.now() } : t)),
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
        optimistic: (cur) =>
          cur.map((t) =>
            t._id === taskId ? { ...t, status: "scheduled" as const, scheduledDate: today, updatedAt: Date.now() } : t
          ),
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
        optimistic: (cur) =>
          cur.map((t) =>
            t._id === taskId
              ? { ...t, status: "inbox" as const, scheduledDate: undefined, updatedAt: Date.now() }
              : t
          ),
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
        optimistic: (cur) =>
          cur.map((t) =>
            t._id === taskId
              ? { ...t, status: "inbox" as const, scheduledDate: undefined, updatedAt: Date.now() }
              : t
          ),
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
    async (data: { title: string; description?: string; deadline?: string; mode: "inbox" | "today" }) => {
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
    async (data: { taskId: Id<"tasks">; title: string; description?: string; deadline?: string }) => {
      return runOptimisticMutation({
        actionName: "update_task",
        optimistic: (cur) =>
          cur.map((t) =>
            t._id === data.taskId
              ? { ...t, title: data.title, description: data.description, deadline: data.deadline, updatedAt: Date.now() }
              : t
          ),
        mutation: async () => {
          await updateTaskMutation({
            taskId: data.taskId,
            title: data.title,
            description: data.description,
            deadline: data.deadline,
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
      if (result.type !== "success") return;
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
    } catch {
      showToast({ kind: "error", message: "Google sign-in failed. Check OAuth client setup." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      mobileLogger.error("google_signin_failed", { actionId, elapsedMs: Date.now() - startedAt });
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
      await convex.query(api.tasks.getTaskCounts, {});
      if (activeTab === "inbox") {
        await convex.query(api.tasks.listTasks, { status: "inbox" });
      } else if (activeTab === "timeline") {
        await convex.query(api.tasks.listTasks, { status: "scheduled" });
      } else {
        await convex.query(api.tasks.listTasks, { status: "completed" });
      }
      showToast({ kind: "info", message: "Workspace refreshed" });
      if (retryQueue.length) await retryQueuedMutations();
      mobileLogger.info("refresh_succeeded", { actionId, elapsedMs: Date.now() - startedAt });
    } catch {
      showToast({ kind: "error", message: "Could not refresh tasks. Check connection and retry." });
      mobileLogger.error("refresh_failed", { actionId, elapsedMs: Date.now() - startedAt });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEditTask = useCallback(
    (task: MobileTask) => editTaskSheetRef.current?.open(task),
    []
  );

  const confirmSignOut = useCallback(() => {
    mobileLogger.info("signout_prompt_opened");
    setIsSignOutModalOpen(true);
  }, []);

  const handleSignOut = useCallback(() => {
    mobileLogger.info("signout_confirmed");
    setIsSignOutModalOpen(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    void authClient.signOut();
  }, []);

  const listSections = useMemo<TaskSection[]>(() => {
    if (activeTab === "timeline") {
      return timelineSections.map(([dateKey, data]) => ({ key: dateKey, dateKey, data }));
    }
    if (activeTab === "completed") {
      return completedTasks.length ? [{ key: "completed", data: completedTasks }] : [];
    }
    return inboxTasks.length ? [{ key: "inbox", data: inboxTasks }] : [];
  }, [activeTab, timelineSections, completedTasks, inboxTasks]);

  const renderTaskItem = useCallback(
    ({ item, section }: SectionListRenderItemInfo<MobileTask, TaskSection>) => {
      if (activeTab === "timeline") {
        const sectionDate = section.dateKey ?? today;
        return (
          <TaskCard
            task={item}
            dateLabel={dateLabel(sectionDate, today, tomorrow, weekEnd)}
            onDone={markDone}
            onSendToInbox={sendToInbox}
            onEdit={handleEditTask}
          />
        );
      }

      if (activeTab === "completed") {
        return (
          <TaskCard
            task={item}
            onDone={markDone}
            onReopen={reopenToInbox}
            onEdit={handleEditTask}
          />
        );
      }

      return (
        <TaskCard
          task={item}
          onDone={markDone}
          onMoveToday={moveToToday}
          onEdit={handleEditTask}
        />
      );
    },
    [activeTab, today, tomorrow, weekEnd, markDone, sendToInbox, handleEditTask, reopenToInbox, moveToToday]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: TaskSection }) => {
      if (activeTab !== "timeline" || !section.dateKey) return null;
      return <Text style={styles.sectionDate}>{dateLabel(section.dateKey, today, tomorrow, weekEnd)}</Text>;
    },
    [activeTab, today, tomorrow, weekEnd]
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

  if (!isAuthHydrated || sessionLoading) {
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

      {/* Background glows */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

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
            onPress={confirmSignOut}
            style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
            hitSlop={8}
          >
            <Text style={styles.profileButtonText}>Sign out</Text>
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
      <SectionList
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 84 }]}
        showsVerticalScrollIndicator={false}
        sections={listSections}
        keyExtractor={(item) => item._id}
        renderItem={renderTaskItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        refreshing={isRefreshing}
        onRefresh={() => void handleRefresh()}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        windowSize={8}
        removeClippedSubviews
        ListEmptyComponent={
          <Animated.View entering={FadeIn.duration(300)} style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{emptyState.title}</Text>
            <Text style={styles.emptyText}>{emptyState.body}</Text>
          </Animated.View>
        }
      >
      </SectionList>

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
        visible={isSignOutModalOpen}
        onRequestClose={() => setIsSignOutModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsSignOutModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sign out?</Text>
            <Text style={styles.modalSubtitle}>You can sign in again anytime with Google.</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setIsSignOutModalOpen(false)}
                style={({ pressed }) => [styles.modalCancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSignOut}
                style={({ pressed }) => [styles.modalSignOutButton, pressed && styles.pressed]}
              >
                <Text style={styles.modalSignOutText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Root ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ConvexClientProvider>
          <MobileApp />
        </ConvexClientProvider>
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
  glowTop: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.glowCyan,
  },
  glowBottom: {
    position: "absolute",
    bottom: -140,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.glowGreen,
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
  profileButton: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  profileButtonText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: "700",
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
  },
  modalCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    padding: spacing.lg,
    gap: spacing.sm,
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
