import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
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
import { authClient, authStorageReady } from "./src/lib/auth-client";
import { ConvexClientProvider } from "./src/lib/convex";
import { addDays, dateLabel, isIsoDate, toIsoDate } from "./src/lib/dates";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

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
  run: () => Promise<void>;
};

type SuccessHaptic = "notification" | "light" | "medium";

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

  const sessionResult = authClient.useSession();
  const session = sessionResult.data;
  const sessionLoading = sessionResult.isPending;

  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
  const canGoogleSignIn = Boolean(googleWebClientId);

  // ── Data ────────────────────────────────────────────────────────────

  const queryTasks = useQuery(api.tasks.listTasks, session ? {} : "skip");
  const serverTasks = useMemo<MobileTask[]>(() => {
    return (
      (queryTasks as Doc<"tasks">[] | undefined)?.map((task) => ({
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
  }, [queryTasks]);
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

  const inboxTasks = useMemo(
    () => tasks.filter((t) => t.status === "inbox").sort((a, b) => a.position - b.position),
    [tasks]
  );
  const scheduledTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "scheduled")
        .sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "") || a.position - b.position),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === "completed").sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks]
  );
  const timelineCount = scheduledTasks.length;

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
      if (mounted) setIsAuthHydrated(true);
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

  const enqueueRetry = useCallback(
    (item: Omit<RetryQueueItem, "id" | "attempts">) => {
      setRetryQueue((cur) => [...cur, { id: `${Date.now()}-${cur.length}`, attempts: 0, ...item }]);
    },
    []
  );

  const retryQueuedMutations = useCallback(async () => {
    if (!retryQueue.length) return;
    const snapshot = [...retryQueue];
    setRetryQueue([]);
    let failed = 0;
    for (const queued of snapshot) {
      try {
        await queued.run();
      } catch {
        failed += 1;
        setRetryQueue((cur) => [...cur, { ...queued, attempts: queued.attempts + 1 }]);
      }
    }
    if (failed === 0) {
      showToast({ kind: "info", message: "Retry complete" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [retryQueue, showToast]);

  // ── Optimistic mutation runner ──────────────────────────────────────

  const runOptimisticMutation = useCallback(
    async ({
      optimistic,
      mutation,
      errorMessage,
      retryLabel,
      successHaptic = "notification",
    }: {
      optimistic: (current: MobileTask[]) => MobileTask[];
      mutation: () => Promise<void>;
      errorMessage: string;
      retryLabel?: string;
      successHaptic?: SuccessHaptic;
    }): Promise<boolean> => {
      setPendingMutations((c) => c + 1);
      setOptimisticTasks((cur) => optimistic(cur ?? serverTasks));
      try {
        await mutation();
        triggerSuccessHaptic(successHaptic);
        return true;
      } catch (error) {
        setOptimisticTasks(null);
        const canRetry = retryLabel && isLikelyOfflineError(error);
        if (canRetry) enqueueRetry({ label: retryLabel!, run: mutation });
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
        optimistic: (cur) =>
          cur.map((t) => (t._id === taskId ? { ...t, status: "completed" as const, updatedAt: Date.now() } : t)),
        mutation: async () => { await completeTaskMutation({ taskId }); },
        errorMessage: "Could not mark task as done.",
        retryLabel: "Retry done",
      });
    },
    [runOptimisticMutation, completeTaskMutation]
  );

  const moveToToday = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        optimistic: (cur) =>
          cur.map((t) =>
            t._id === taskId ? { ...t, status: "scheduled" as const, scheduledDate: today, updatedAt: Date.now() } : t
          ),
        mutation: async () => { await moveTaskMutation({ taskId, targetDate: today }); },
        errorMessage: "Could not move task to today.",
        retryLabel: "Retry move to today",
        successHaptic: "light",
      });
    },
    [runOptimisticMutation, moveTaskMutation, today]
  );

  const sendToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        optimistic: (cur) =>
          cur.map((t) =>
            t._id === taskId
              ? { ...t, status: "inbox" as const, scheduledDate: undefined, updatedAt: Date.now() }
              : t
          ),
        mutation: async () => { await unscheduleTaskMutation({ taskId }); },
        errorMessage: "Could not move task back to inbox.",
        retryLabel: "Retry move to inbox",
        successHaptic: "light",
      });
    },
    [runOptimisticMutation, unscheduleTaskMutation]
  );

  const reopenToInbox = useCallback(
    (taskId: Id<"tasks">) => {
      void runOptimisticMutation({
        optimistic: (cur) =>
          cur.map((t) =>
            t._id === taskId
              ? { ...t, status: "inbox" as const, scheduledDate: undefined, updatedAt: Date.now() }
              : t
          ),
        mutation: async () => { await reopenTaskMutation({ taskId }); },
        errorMessage: "Could not reopen task.",
        retryLabel: "Retry reopen",
        successHaptic: "light",
      });
    },
    [runOptimisticMutation, reopenTaskMutation]
  );

  // ── Add task handler (from sheet) ───────────────────────────────────

  const handleAddTask = useCallback(
    async (data: { title: string; description?: string; deadline?: string; mode: "inbox" | "today" }) => {
      try {
        await addTaskMutation({
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          type: data.deadline ? "deadline" : "open",
          scheduledDate: data.mode === "today" ? today : undefined,
        });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return true;
      } catch (error) {
        const mutation = async () => {
          await addTaskMutation({
            title: data.title,
            description: data.description,
            deadline: data.deadline,
            type: data.deadline ? "deadline" : "open",
            scheduledDate: data.mode === "today" ? today : undefined,
          });
        };
        if (isLikelyOfflineError(error)) {
          enqueueRetry({ label: `Add "${data.title}"`, run: mutation });
          showToast({ kind: "error", message: "Offline. Task queued for retry." });
        } else {
          showToast({ kind: "error", message: "Could not add task. Please try again." });
        }
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
        successHaptic: "medium",
      });
    },
    [runOptimisticMutation, updateTaskMutation]
  );

  // ── Auth ────────────────────────────────────────────────────────────

  const handleGoogleSignIn = async () => {
    if (!googleWebClientId || isSigningIn) return;
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
    } catch {
      showToast({ kind: "error", message: "Google sign-in failed. Check OAuth client setup." });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleRefresh = async () => {
    if (!session || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await convex.query(api.tasks.listTasks, {});
      showToast({ kind: "info", message: "Workspace refreshed" });
      if (retryQueue.length) await retryQueuedMutations();
    } catch {
      showToast({ kind: "error", message: "Could not refresh tasks. Check connection and retry." });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEditTask = useCallback(
    (task: MobileTask) => editTaskSheetRef.current?.open(task),
    []
  );

  const confirmSignOut = useCallback(() => {
    Alert.alert(
      "Sign out?",
      "You can sign in again anytime with Google.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void authClient.signOut();
          },
        },
      ]
    );
  }, []);

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
        : `${inboxTasks.length} task${inboxTasks.length === 1 ? "" : "s"} to triage`;

  // ── Render task list ────────────────────────────────────────────────

  const renderTaskList = () => {
    if (activeTab === "timeline") {
      if (!timelineSections.length) {
        return (
          <Animated.View entering={FadeIn.duration(300)} style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No scheduled tasks</Text>
            <Text style={styles.emptyText}>
              No tasks on your timeline yet. Move one from Inbox to Today.
            </Text>
          </Animated.View>
        );
      }
      return timelineSections.map(([dateKey, items]) => (
        <View key={dateKey}>
          <Text style={styles.sectionDate}>
            {dateLabel(dateKey, today, tomorrow, weekEnd)}
          </Text>
          {items.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              dateLabel={dateLabel(dateKey, today, tomorrow, weekEnd)}
              onDone={markDone}
              onSendToInbox={sendToInbox}
              onEdit={handleEditTask}
            />
          ))}
        </View>
      ));
    }

    if (activeTab === "completed") {
      if (!completedTasks.length) {
        return (
          <Animated.View entering={FadeIn.duration(300)} style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing completed yet</Text>
            <Text style={styles.emptyText}>
              Mark one task done to build momentum.
            </Text>
          </Animated.View>
        );
      }
      return completedTasks.map((task) => (
        <TaskCard
          key={task._id}
          task={task}
          onDone={markDone}
          onReopen={reopenToInbox}
          onEdit={handleEditTask}
        />
      ));
    }

    // Inbox
    if (!inboxTasks.length) {
      return (
          <Animated.View entering={FadeIn.duration(300)} style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Inbox zero</Text>
            <Text style={styles.emptyText}>
              You are all caught up. Tap + to capture the next task.
            </Text>
          </Animated.View>
        );
    }
    return inboxTasks.map((task) => (
      <TaskCard
        key={task._id}
        task={task}
        onDone={markDone}
        onMoveToday={moveToToday}
        onEdit={handleEditTask}
      />
    ));
  };

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
      <Animated.ScrollView
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
        {renderTaskList()}
      </Animated.ScrollView>

      {/* FAB */}
      {!isAddSheetOpen && !isEditSheetOpen ? (
        <FAB bottom={fabBottom} onPress={() => addTaskSheetRef.current?.open()} />
      ) : null}

      {/* Bottom tab bar */}
      <BottomTabBar
        active={activeTab}
        onChange={setActiveTab}
        inboxCount={inboxTasks.length}
        timelineCount={timelineCount}
        doneCount={completedTasks.length}
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

  // Shared
  pressed: {
    opacity: 0.8,
  },
});
