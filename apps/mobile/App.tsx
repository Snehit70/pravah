import * as Google from "expo-auth-session/providers/google";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import * as Haptics from "expo-haptics";
import { authClient, authStorageReady } from "./src/lib/auth-client";
import { ConvexClientProvider } from "./src/lib/convex";
import { addDays, dateLabel, toIsoDate } from "./src/lib/dates";

type ActiveTab = "inbox" | "timeline" | "completed";
type ComposerMode = "inbox" | "today";

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

type MobileTask = {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  deadline?: string;
  status: "inbox" | "scheduled" | "completed" | "cancelled";
  scheduledDate?: string;
  position: number;
  updatedAt: number;
};

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

function MobileApp() {
  if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const convex = useConvex();
  const pulse = useState(() => new Animated.Value(1))[0];
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftDeadline, setDraftDeadline] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("inbox");
  const [composerMode, setComposerMode] = useState<ComposerMode>("inbox");
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuthHydrated, setIsAuthHydrated] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<MobileTask[] | null>(null);
  const [retryQueue, setRetryQueue] = useState<RetryQueueItem[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<Id<"tasks"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [isEditSaving, setIsEditSaving] = useState(false);

  const sessionResult = authClient.useSession();
  const session = sessionResult.data;
  const sessionLoading = sessionResult.isPending;

  const [googleRequest, , promptGoogle] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const queryTasks = useQuery(api.tasks.listTasks, session ? {} : "skip");
  const serverTasks = useMemo<MobileTask[]>(() => {
    return (queryTasks as Doc<"tasks">[] | undefined)?.map((task) => ({
      _id: task._id,
      title: task.title,
      description: task.description,
      deadline: task.deadline,
      status: task.status,
      scheduledDate: task.scheduledDate,
      position: task.position,
      updatedAt: task.updatedAt,
    })) ?? [];
  }, [queryTasks]);
  const tasks = useMemo(() => optimisticTasks ?? serverTasks, [optimisticTasks, serverTasks]);

  const addTaskMutation = useMutation(api.tasks.addTask);
  const updateTaskMutation = useMutation(api.tasks.updateTask);
  const completeTaskMutation = useMutation(api.tasks.completeTask);
  const moveTaskMutation = useMutation(api.tasks.moveTask);
  const unscheduleTaskMutation = useMutation(api.tasks.unscheduleTask);
  const reopenTaskMutation = useMutation(api.tasks.reopenTask);

  const showToast = (nextToast: ToastState) => {
    setToast(nextToast);
  };

  useEffect(() => {
    let mounted = true;
    authStorageReady.finally(() => {
      if (mounted) {
        setIsAuthHydrated(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => {
      setToast(null);
    }, 3200);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (pendingMutations === 0) {
      setOptimisticTasks(null);
    }
  }, [pendingMutations, serverTasks]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.05,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulse]);

  const today = toIsoDate(new Date());
  const tomorrow = toIsoDate(addDays(new Date(), 1));
  const weekEnd = toIsoDate(addDays(new Date(), 7));

  const inboxTasks = useMemo(
    () => tasks.filter((task) => task.status === "inbox").sort((a, b) => a.position - b.position),
    [tasks]
  );
  const scheduledTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "scheduled")
        .sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "") || a.position - b.position),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "completed").sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks]
  );

  const todayCount = useMemo(
    () => tasks.filter((task) => task.status === "scheduled" && task.scheduledDate === today).length,
    [tasks, today]
  );

  const timelineSections = useMemo(() => {
    const grouped = new Map<string, typeof scheduledTasks>();
    for (const task of scheduledTasks) {
      const key = task.scheduledDate ?? "unscheduled";
      const existing = grouped.get(key) ?? [];
      existing.push(task);
      grouped.set(key, existing);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scheduledTasks]);

  const headerSubtitle =
    activeTab === "timeline"
      ? "See what is scheduled next"
      : activeTab === "completed"
        ? "Closed loops from this week"
        : "Capture first, organize later";

  const enqueueRetry = (item: Omit<RetryQueueItem, "id" | "attempts">) => {
    setRetryQueue((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, attempts: 0, ...item },
    ]);
  };

  const retryQueuedMutations = async () => {
    if (!retryQueue.length) return;
    const queueSnapshot = [...retryQueue];
    setRetryQueue([]);
    let failed = 0;
    for (const queued of queueSnapshot) {
      try {
        await queued.run();
      } catch {
        failed += 1;
        setRetryQueue((current) => [
          ...current,
          {
            ...queued,
            attempts: queued.attempts + 1,
          },
        ]);
      }
    }
    if (failed === 0) {
      showToast({ kind: "info", message: "Retry complete" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const openTaskSheet = (task: MobileTask) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingTaskId(task._id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditDeadline(task.deadline ?? "");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const closeTaskSheet = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingTaskId(null);
    setEditTitle("");
    setEditDescription("");
    setEditDeadline("");
  };

  const runOptimisticMutation = async ({
    optimistic,
    mutation,
    errorMessage,
    retryLabel,
  }: {
    optimistic: (currentTasks: MobileTask[]) => MobileTask[];
    mutation: () => Promise<void>;
    errorMessage: string;
    retryLabel?: string;
  }) => {
    setPendingMutations((count) => count + 1);
    setOptimisticTasks((current) => optimistic(current ?? serverTasks));
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await mutation();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setOptimisticTasks(null);
      if (retryLabel) {
        enqueueRetry({
          label: retryLabel,
          run: mutation,
        });
      }
      showToast({
        kind: "error",
        message: retryLabel ? `${errorMessage} Queued for retry.` : errorMessage,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPendingMutations((count) => Math.max(0, count - 1));
    }
  };

  const handleRefresh = async () => {
    if (!session || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await convex.query(api.tasks.listTasks, {});
      showToast({ kind: "info", message: "Workspace refreshed" });
      if (retryQueue.length) {
        await retryQueuedMutations();
      }
    } catch {
      showToast({ kind: "error", message: "Could not refresh tasks. Check connection and retry." });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!googleRequest) return;
    const result = await promptGoogle();
    if (result.type !== "success") return;

    const idToken = result.params.id_token;
    if (!idToken) return;

    await authClient.signIn.social({
      provider: "google",
      idToken: { token: idToken },
      callbackURL: "/",
    });
  };

  const addTask = async () => {
    const title = draftTitle.trim();
    if (!title || isSaving) return;
    setIsSaving(true);
    try {
      await addTaskMutation({
        title,
        description: draftDescription.trim() || undefined,
        deadline: draftDeadline.trim() || undefined,
        type: draftDeadline.trim() ? "deadline" : "open",
        scheduledDate: composerMode === "today" ? today : undefined,
      });
      setDraftTitle("");
      setDraftDescription("");
      setDraftDeadline("");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      const mutation = async () => {
        await addTaskMutation({
          title,
          description: draftDescription.trim() || undefined,
          deadline: draftDeadline.trim() || undefined,
          type: draftDeadline.trim() ? "deadline" : "open",
          scheduledDate: composerMode === "today" ? today : undefined,
        });
      };
      if (isLikelyOfflineError(error)) {
        enqueueRetry({ label: `Add "${title}"`, run: mutation });
        showToast({ kind: "error", message: "Offline. Task queued for retry." });
      } else {
        showToast({ kind: "error", message: "Could not add task. Please try again." });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveTaskEdits = async () => {
    if (!editingTaskId || !editTitle.trim() || isEditSaving) return;
    setIsEditSaving(true);
    const title = editTitle.trim();
    const description = editDescription.trim() || undefined;
    const deadline = editDeadline.trim() || undefined;
    const mutation = async () => {
      await updateTaskMutation({
        taskId: editingTaskId,
        title,
        description,
        deadline,
      });
    };

    try {
      await runOptimisticMutation({
        optimistic: (currentTasks) =>
          currentTasks.map((task) =>
            task._id === editingTaskId
              ? {
                  ...task,
                  title,
                  description,
                  deadline,
                  updatedAt: Date.now(),
                }
              : task
          ),
        mutation,
        errorMessage: "Could not save task details.",
        retryLabel: `Update "${title}"`,
      });
      closeTaskSheet();
    } finally {
      setIsEditSaving(false);
    }
  };

  const markDone = async (taskId: Id<"tasks">) => {
    await runOptimisticMutation({
      optimistic: (currentTasks) =>
        currentTasks.map((task) =>
          task._id === taskId
            ? {
                ...task,
                status: "completed",
                updatedAt: Date.now(),
              }
            : task
        ),
      mutation: async () => {
        await completeTaskMutation({ taskId });
      },
      errorMessage: "Could not mark task as done.",
      retryLabel: "Retry done",
    });
  };

  const moveToToday = async (taskId: Id<"tasks">) => {
    await runOptimisticMutation({
      optimistic: (currentTasks) =>
        currentTasks.map((task) =>
          task._id === taskId
            ? {
                ...task,
                status: "scheduled",
                scheduledDate: today,
                updatedAt: Date.now(),
              }
            : task
        ),
      mutation: async () => {
        await moveTaskMutation({ taskId, targetDate: today });
      },
      errorMessage: "Could not move task to today.",
      retryLabel: "Retry move to today",
    });
  };

  const sendToInbox = async (taskId: Id<"tasks">) => {
    await runOptimisticMutation({
      optimistic: (currentTasks) =>
        currentTasks.map((task) =>
          task._id === taskId
            ? {
                ...task,
                status: "inbox",
                scheduledDate: undefined,
                updatedAt: Date.now(),
              }
            : task
        ),
      mutation: async () => {
        await unscheduleTaskMutation({ taskId });
      },
      errorMessage: "Could not move task back to inbox.",
      retryLabel: "Retry move to inbox",
    });
  };

  const reopenToInbox = async (taskId: Id<"tasks">) => {
    await runOptimisticMutation({
      optimistic: (currentTasks) =>
        currentTasks.map((task) =>
          task._id === taskId
            ? {
                ...task,
                status: "inbox",
                scheduledDate: undefined,
                updatedAt: Date.now(),
              }
            : task
        ),
      mutation: async () => {
        await reopenTaskMutation({ taskId });
      },
      errorMessage: "Could not reopen task.",
      retryLabel: "Retry reopen",
    });
  };

  if (!isAuthHydrated || sessionLoading) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <Text style={styles.authTitle}>Loading your workspace...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar style="light" />
        <View style={styles.authCard}>
          <Text style={styles.kicker}>Pravah Mobile</Text>
          <Text style={styles.authTitle}>Continue with Google</Text>
          <Text style={styles.authSubtitle}>Use the same account as your web app to keep tasks in sync.</Text>
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={!googleRequest}
            style={({ pressed }) => [
              styles.googleButton,
              !googleRequest ? styles.disabledButton : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const visibleCount =
    activeTab === "timeline"
      ? scheduledTasks.length
      : activeTab === "completed"
        ? completedTasks.length
        : inboxTasks.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <View style={styles.header}>
        <Text style={styles.kicker}>Pravah Mobile</Text>
        <Text style={styles.title}>Flow through your day</Text>
        <Text style={styles.subtitle}>{headerSubtitle}</Text>
      </View>

      {toast ? (
        <View style={[styles.toast, toast.kind === "error" ? styles.toastError : styles.toastInfo]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      ) : null}

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{inboxTasks.length}</Text>
          <Text style={styles.metricLabel}>Inbox</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{todayCount}</Text>
          <Text style={styles.metricLabel}>Today</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{completedTasks.length}</Text>
          <Text style={styles.metricLabel}>Done</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        {(["inbox", "timeline", "completed"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={({ pressed }) => [styles.tab, activeTab === tab ? styles.tabActive : null, pressed ? styles.pressed : null]}
          >
            <Text style={[styles.tabText, activeTab === tab ? styles.tabTextActive : null]}>
              {tab === "completed" ? "Done" : tab[0].toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={draftTitle}
          onChangeText={setDraftTitle}
          placeholder="Capture a task"
          placeholderTextColor="#6d7e9a"
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => {
            void addTask();
          }}
        />
        <Animated.View style={[styles.pulseWrap, { transform: [{ scale: pulse }] }]}> 
        <Pressable
          onPress={() => {
            void addTask();
          }}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.addButton,
            isSaving ? styles.disabledButton : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.addButtonText}>{isSaving ? "Saving" : "Add"}</Text>
        </Pressable>
        </Animated.View>
      </View>

      <View style={styles.metaInputRow}>
        <TextInput
          value={draftDescription}
          onChangeText={setDraftDescription}
          placeholder="Notes (optional)"
          placeholderTextColor="#6d7e9a"
          style={[styles.input, styles.metaInput]}
        />
        <TextInput
          value={draftDeadline}
          onChangeText={setDraftDeadline}
          placeholder="Deadline YYYY-MM-DD"
          placeholderTextColor="#6d7e9a"
          style={[styles.input, styles.metaInput]}
        />
      </View>

      <View style={styles.composerModeRow}>
        <Pressable
          onPress={() => setComposerMode("inbox")}
          style={({ pressed }) => [styles.modeChip, composerMode === "inbox" ? styles.modeChipActive : null, pressed ? styles.pressed : null]}
        >
          <Text style={[styles.modeChipText, composerMode === "inbox" ? styles.modeChipTextActive : null]}>
            Add to Inbox
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setComposerMode("today")}
          style={({ pressed }) => [styles.modeChip, composerMode === "today" ? styles.modeChipActive : null, pressed ? styles.pressed : null]}
        >
          <Text style={[styles.modeChipText, composerMode === "today" ? styles.modeChipTextActive : null]}>
            Add to Today
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void authClient.signOut();
          }}
          style={({ pressed }) => [styles.modeChip, pressed ? styles.pressed : null]}
        >
          <Text style={styles.modeChipText}>Sign out</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.listWrap}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void handleRefresh();
            }}
            tintColor="#7dd3fc"
            colors={["#7dd3fc"]}
            progressBackgroundColor="#0d1a2f"
          />
        }
      >
        <Text style={styles.sectionTitle}>
          {activeTab === "timeline" ? "Timeline" : activeTab === "completed" ? "Completed" : "Inbox"} ({visibleCount})
        </Text>
        {retryQueue.length > 0 ? (
          <Pressable
            onPress={() => {
              void retryQueuedMutations();
            }}
            style={({ pressed }) => [styles.retryBanner, pressed ? styles.pressed : null]}
          >
            <Text style={styles.retryBannerText}>Retry {retryQueue.length} queued change(s)</Text>
          </Pressable>
        ) : null}
        {pendingMutations > 0 ? <Text style={styles.syncText}>Syncing changes...</Text> : null}

        {activeTab === "timeline" ? (
          timelineSections.length ? (
            timelineSections.map(([dateKey, items]) => (
              <View key={dateKey}>
                <Text style={styles.bucketLabel}>{dateLabel(dateKey, today, tomorrow, weekEnd)}</Text>
                {items.map((task) => (
                  <View key={task._id} style={styles.taskCard}>
                    <View style={styles.taskTextWrap}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <Text style={styles.taskMeta}>{dateLabel(dateKey, today, tomorrow, weekEnd)}</Text>
                      {task.description ? <Text style={styles.taskDetail}>{task.description}</Text> : null}
                    </View>
                    <View style={styles.actionRow}>
                      <Pressable
                        onPress={() => openTaskSheet(task)}
                        style={({ pressed }) => [styles.ghostButton, pressed ? styles.pressed : null]}
                      >
                        <Text style={styles.ghostButtonText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          void sendToInbox(task._id);
                        }}
                        style={({ pressed }) => [styles.ghostButton, pressed ? styles.pressed : null]}
                      >
                        <Text style={styles.ghostButtonText}>Inbox</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          void markDone(task._id);
                        }}
                        style={({ pressed }) => [styles.doneButton, pressed ? styles.pressed : null]}
                      >
                        <Text style={styles.doneButtonText}>Done</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No scheduled tasks yet. Promote inbox items to Today.</Text>
            </View>
          )
        ) : activeTab === "completed" ? (
          completedTasks.length ? (
            completedTasks.map((task) => (
              <View key={task._id} style={[styles.taskCard, styles.completedCard]}>
                <Text style={[styles.taskTitle, styles.completedTitle]}>{task.title}</Text>
                <Pressable
                  onPress={() => {
                    void reopenToInbox(task._id);
                  }}
                  style={({ pressed }) => [styles.reopenButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.reopenButtonText}>Reopen</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nothing completed yet. Mark tasks done to build momentum.</Text>
            </View>
          )
        ) : inboxTasks.length ? (
          inboxTasks.map((task) => (
            <View key={task._id} style={styles.taskCard}>
              <View style={styles.taskTextWrap}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                {task.description ? <Text style={styles.taskDetail}>{task.description}</Text> : null}
                {task.deadline ? <Text style={styles.taskMeta}>Due {task.deadline}</Text> : null}
              </View>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => openTaskSheet(task)}
                  style={({ pressed }) => [styles.ghostButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.ghostButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void moveToToday(task._id);
                  }}
                  style={({ pressed }) => [styles.ghostButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.ghostButtonText}>Today</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void markDone(task._id);
                  }}
                  style={({ pressed }) => [styles.doneButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Your inbox is clear. Add a task or route one from timeline.</Text>
          </View>
        )}
      </ScrollView>

      <Modal transparent visible={!!editingTaskId} animationType="slide" onRequestClose={closeTaskSheet}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Task details</Text>
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Task title"
              placeholderTextColor="#6d7e9a"
              style={styles.sheetInput}
            />
            <TextInput
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Notes"
              placeholderTextColor="#6d7e9a"
              style={[styles.sheetInput, styles.sheetTextarea]}
              multiline
            />
            <TextInput
              value={editDeadline}
              onChangeText={setEditDeadline}
              placeholder="Deadline YYYY-MM-DD"
              placeholderTextColor="#6d7e9a"
              style={styles.sheetInput}
            />

            <View style={styles.sheetActions}>
              <Pressable onPress={closeTaskSheet} style={({ pressed }) => [styles.sheetGhostButton, pressed ? styles.pressed : null]}>
                <Text style={styles.sheetGhostButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void saveTaskEdits();
                }}
                disabled={isEditSaving}
                style={({ pressed }) => [styles.sheetPrimaryButton, isEditSaving ? styles.disabledButton : null, pressed ? styles.pressed : null]}
              >
                <Text style={styles.sheetPrimaryButtonText}>{isEditSaving ? "Saving" : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ConvexClientProvider>
      <MobileApp />
    </ConvexClientProvider>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: "#09111f",
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  authCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1f3655",
    backgroundColor: "#0d1a2f",
    padding: 20,
    gap: 12,
  },
  authTitle: {
    color: "#f1f5f9",
    fontSize: 24,
    fontWeight: "700",
  },
  authSubtitle: {
    color: "#9fb3cc",
    fontSize: 14,
    lineHeight: 20,
  },
  googleButton: {
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    paddingVertical: 12,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: "#0b1323",
    fontWeight: "700",
  },
  container: {
    flex: 1,
    backgroundColor: "#09111f",
    paddingHorizontal: 16,
  },
  backgroundGlowTop: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#0ea5e91e",
  },
  backgroundGlowBottom: {
    position: "absolute",
    bottom: -140,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#34d39914",
  },
  header: {
    paddingTop: 12,
    paddingBottom: 6,
  },
  kicker: {
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  title: {
    color: "#f1f5f9",
    fontSize: 30,
    fontWeight: "700",
    marginTop: 4,
  },
  subtitle: {
    color: "#9fb3cc",
    fontSize: 14,
    marginTop: 4,
  },
  toast: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 8,
  },
  toastError: {
    backgroundColor: "#3a1221",
    borderColor: "#7f1d1d",
  },
  toastInfo: {
    backgroundColor: "#102846",
    borderColor: "#1e3a8a",
  },
  toastText: {
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f3655",
    backgroundColor: "#0d1a2f",
    paddingVertical: 10,
    alignItems: "center",
  },
  metricValue: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 19,
  },
  metricLabel: {
    color: "#8fa8c4",
    fontSize: 12,
    marginTop: 3,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#101d33",
    borderRadius: 12,
    padding: 4,
    marginTop: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: "#1f4ca6",
  },
  tabText: {
    color: "#86a1c1",
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#f1f5f9",
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#101d33",
    color: "#e8f0f8",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    borderWidth: 1,
    borderColor: "#1f3655",
  },
  addButton: {
    backgroundColor: "#22c55e",
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseWrap: {
    borderRadius: 12,
  },
  addButtonText: {
    color: "#052e16",
    fontWeight: "700",
  },
  metaInputRow: {
    gap: 8,
    marginTop: 8,
  },
  metaInput: {
    fontSize: 13,
  },
  composerModeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  modeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#20406a",
    backgroundColor: "#0d1a2f",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  modeChipActive: {
    backgroundColor: "#113468",
    borderColor: "#2e74c0",
  },
  modeChipText: {
    color: "#9ab4cf",
    fontSize: 12,
    fontWeight: "700",
  },
  modeChipTextActive: {
    color: "#dbeafe",
  },
  listWrap: {
    paddingTop: 14,
    paddingBottom: 30,
  },
  sectionTitle: {
    color: "#b4c8de",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  syncText: {
    color: "#7dd3fc",
    fontSize: 12,
    marginBottom: 10,
  },
  retryBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#14532d",
    backgroundColor: "#0f2d1f",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  retryBannerText: {
    color: "#bbf7d0",
    fontWeight: "700",
    fontSize: 12,
  },
  bucketLabel: {
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  taskCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f3655",
    backgroundColor: "#0e1a2d",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  taskTextWrap: {
    flexShrink: 1,
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  taskTitle: {
    color: "#f1f5f9",
    fontSize: 15,
    fontWeight: "600",
  },
  taskMeta: {
    color: "#7dd3fc",
    marginTop: 3,
    fontSize: 12,
  },
  taskDetail: {
    color: "#94a3b8",
    marginTop: 4,
    fontSize: 12,
  },
  ghostButton: {
    backgroundColor: "#102646",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  ghostButtonText: {
    color: "#bfdbfe",
    fontSize: 12,
    fontWeight: "700",
  },
  doneButton: {
    backgroundColor: "#133b2a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  doneButtonText: {
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1f3655",
    backgroundColor: "#0d1a2f",
    marginBottom: 12,
  },
  emptyText: {
    color: "#92a9c4",
    lineHeight: 20,
  },
  completedCard: {
    backgroundColor: "#101b2b",
    borderColor: "#2c3a4f",
  },
  completedTitle: {
    color: "#8ca2bc",
    textDecorationLine: "line-through",
  },
  reopenButton: {
    backgroundColor: "#1f3655",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  reopenButtonText: {
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "700",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "#020617cc",
    justifyContent: "flex-end",
    padding: 14,
  },
  sheetCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1f3655",
    backgroundColor: "#0d1a2f",
    padding: 14,
    gap: 10,
  },
  sheetTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  sheetInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f3655",
    backgroundColor: "#101d33",
    color: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sheetTextarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  sheetGhostButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2c3a4f",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sheetGhostButtonText: {
    color: "#cbd5e1",
    fontWeight: "700",
  },
  sheetPrimaryButton: {
    borderRadius: 10,
    backgroundColor: "#22c55e",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  sheetPrimaryButtonText: {
    color: "#052e16",
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.8,
  },
});
