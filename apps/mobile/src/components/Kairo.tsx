import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Clipboard from "expo-clipboard";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { colors, fonts, motion, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { classifyError, createActionId, mobileLogger } from "../lib/logger";
import { PlusIcon } from "./UiIcons";
import {
  getKairoConfig,
  isKairoConfigured,
  getKairoProviderLabel,
  type KairoConfig,
} from "../lib/kairoConfig";
import {
  KAIRO_AGENT_SYSTEM_PROMPT,
  buildKairoStarters,
  contextWindowForModel,
  estimateTokens,
  type AgentTurn,
  type KairoAction,
  type KairoMessage,
  type KairoMessageAction,
  type KairoTaskInput,
} from "../lib/kairoApi";
import {
  buildThinContext,
  buildToolDefs,
  createHandleRegistry,
} from "../lib/kairoTools";
import { formatRelative } from "../lib/formatRelative";
import {
  runKairoAgent,
  type ApplyAgentActions,
  type KairoAgentCaller,
} from "../lib/kairoAgent";
import {
  createKairoActionExecutor,
  type KairoActionResult,
  type TaskSnapshot,
} from "../lib/kairoActions";
import { applyConfirmedKairoActions } from "../lib/kairoPolicy";
import { getLocalDateString } from "../lib/dates";
import { useKairoChats } from "../hooks/useKairoChats";
import { useGoalLinks, useGoals } from "../hooks/useGoals";
import { KairoChatList } from "./KairoChatList";
import { KairoMarkdown } from "./KairoMarkdown";
import { haptic } from "../lib/haptic";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useConfirm } from "../hooks/useConfirm";

export type KairoSheetRef = {
  open: () => void;
  close: () => void;
};

type KairoProps = {
  /** All loaded tasks across tabs — used to build the model's context. */
  tasks: KairoTaskInput[];
  /** Inbox tasks specifically (sometimes a separate query in the parent). */
  inboxTasks: KairoTaskInput[];
  /** True when the full-corpus query has resolved. Prevents sending messages
   *  with an empty or partial workspace snapshot on cold start. */
  isAllTasksReady: boolean;
  /** Notify the parent when the sheet opens/closes so it can dim the rest of
   *  the app, matching web's 0.38-opacity fade behind the active Kairo. */
  onActiveChange?: (active: boolean) => void;
  /** Called when the user taps "Configure" on the unconfigured empty state. */
  onOpenSettings?: () => void;
};

const DEFERRED_LOADING_TEXT = "Loading your workspace... one moment.";

function buildGeminiRequestUrl(baseUrl: string, model: string, apiKey: string): string {
  const modelName = encodeURIComponent(model.trim());
  const expandedBase = baseUrl.includes("{model}") ? baseUrl.replace("{model}", modelName) : baseUrl;
  const separator = expandedBase.includes("?") ? "&" : "?";
  return `${expandedBase}${separator}key=${encodeURIComponent(apiKey.trim())}`;
}

/** Render a short human-readable label for an applied action chip. The
 *  before-state lookup gives us the original title for reference actions
 *  (reschedule/complete/etc.) — for adds we already know the title from the
 *  action itself. */
function labelForAction(
  action: KairoAction,
  beforeTitle: string | null
): string {
  switch (action.kind) {
    case "add":
      return action.deadline
        ? `Added "${action.title}" → ${action.deadline}`
        : `Added "${action.title}" to inbox`;
    case "reschedule":
      return beforeTitle
        ? `Rescheduled "${beforeTitle}" → ${action.deadline}`
        : `Rescheduled task → ${action.deadline}`;
    case "complete":
      return beforeTitle ? `Completed "${beforeTitle}"` : "Completed task";
    case "reopen":
      return beforeTitle ? `Reopened "${beforeTitle}"` : "Reopened task";
    case "unschedule":
      return beforeTitle ? `Sent "${beforeTitle}" to inbox` : "Sent task to inbox";
  }
}

function actionResultToMessageAction(
  result: KairoActionResult,
  beforeTitle: string | null
): { chip: KairoMessageAction; undo: (() => Promise<void>) | null } {
  const id = `${result.action.kind}-${Math.random().toString(36).slice(2, 9)}`;
  if (result.status === "applied") {
    return {
      chip: {
        id,
        kind: result.action.kind,
        label: labelForAction(result.action, beforeTitle),
        state: "applied",
      },
      undo: result.undo,
    };
  }
  if (result.status === "skipped") {
    return {
      chip: {
        id,
        kind: result.action.kind,
        label: labelForAction(result.action, beforeTitle),
        state: "skipped",
        detail: result.reason,
      },
      undo: null,
    };
  }
  return {
    chip: {
      id,
      kind: result.action.kind,
      label: labelForAction(result.action, beforeTitle),
      state: "failed",
      detail: result.error,
    },
    undo: null,
  };
}

type KairoChatRow =
  | { kind: "message"; id: string; message: KairoMessage }
  | { kind: "thinking"; id: string };

/**
 * Mobile Kairo. Presents as a near-full-screen bottom sheet that takes the
 * app over when active. The parent uses the `onActiveChange` callback to
 * dim everything behind it (web parity: src/components/AuthenticatedApp.tsx
 * lines 130-132).
 *
 * Provider support is deliberately kept narrow — Anthropic and OpenAI, both
 * via plain fetch with a user-supplied API key. The key is stored in
 * expo-secure-store via `lib/kairoConfig.ts`, never sent to our servers.
 */
export const Kairo = forwardRef<KairoSheetRef, KairoProps>(function Kairo(
  { tasks, inboxTasks, isAllTasksReady, onActiveChange, onOpenSettings },
  ref
) {
  const sheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const bottomInset = useKeyboardInset(insets.bottom);
  const keyboardLift = Math.max(0, bottomInset - spacing.lg);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const hasPresentedRef = useRef(false);
  const [val, setVal] = useState("");
  const [thinking, setThinking] = useState(false);
  const [config, setConfig] = useState<KairoConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  // Live status line shown in the thinking skeleton, driven by the agent's
  // onProgress callback ("Checking your inbox…", "Updating your tasks…").
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  // Two-tap Stop guard: the first tap arms, the second (within 3s) confirms.
  const [stopArmed, setStopArmed] = useState(false);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<string | null>(null);
  const [deferredPromptPreview, setDeferredPromptPreview] = useState<string | null>(null);
  // "chat" shows the active conversation, "list" shows the chat picker.
  const [view, setView] = useState<"chat" | "list">("chat");
  // Local-date snapshot used to derive starters. Refreshed each time the
  // sheet opens so an app left mounted across midnight still picks up the
  // new day's "What's on today?" / overdue counts on next visit.
  const [today, setToday] = useState(() => getLocalDateString());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listRef = useRef<any>(null);
  // Undo closures keyed by KairoMessageAction.id. Held in a ref so the closure
  // identity is stable across renders; messages only carry the serializable
  // chip state and reference back into this map by id.
  const undoMap = useRef<Map<string, () => Promise<void>>>(new Map());
  const confirm = useConfirm();

  const {
    chats,
    activeChat,
    createChat,
    switchChat,
    deleteChat,
    setMessages: setMsgs,
  } = useKairoChats();
  const msgs = useMemo<KairoMessage[]>(
    () => activeChat?.messages ?? [],
    [activeChat?.messages]
  );

  useEffect(() => {
    if (!copyFeedback) return;
    const timeout = setTimeout(() => setCopyFeedback(null), 1600);
    return () => clearTimeout(timeout);
  }, [copyFeedback]);

  const addTaskMutation = useMutation(api.tasks.addTask);
  const moveTaskMutation = useMutation(api.tasks.moveTask);
  const completeTaskMutation = useMutation(api.tasks.completeTask);
  const reopenTaskMutation = useMutation(api.tasks.reopenTask);
  const unscheduleTaskMutation = useMutation(api.tasks.unscheduleTask);
  const softDeleteTaskMutation = useMutation(api.tasks.softDeleteTask);
  const { goals } = useGoals();
  const goalLinks = useGoalLinks();

  // Single snap point at 92% — leaves a sliver of the dimmed app visible at
  // the top as a peek, the same affordance the web overlay leaves.
  const snapPoints = useMemo(() => ["92%"], []);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        hasPresentedRef.current = false;
        setMounted(true);
        setOpen(true);
      },
      close: () => sheetRef.current?.close(),
    }),
    []
  );

  useEffect(() => {
    onActiveChange?.(open);
  }, [open, onActiveChange]);

  // Reload Kairo config every time the sheet opens — the user might have
  // edited their API key in the Settings sheet between visits. Also refresh
  // `today` so the starters memo recomputes if the app sat idle past midnight.
  useEffect(() => {
    if (!open) return;
    const refreshToday = () =>
      setToday((prev) => {
        const now = getLocalDateString();
        return prev === now ? prev : now;
      });
    refreshToday();
    // Tick every minute so a midnight rollover while the sheet is open still
    // recomputes starters without needing a close/re-open.
    const timer = setInterval(refreshToday, 60_000);
    let cancelled = false;
    setConfigLoaded(false);
    void getKairoConfig()
      .then((c) => {
        if (!cancelled) {
          setConfig(c);
          setConfigLoaded(true);
        }
      })
      .catch((error) => {
        mobileLogger.warn("kairo_config_load_failed", { errorType: classifyError(error) });
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    if (msgs.length === 0 && !thinking && !deferredPromptPreview) return;
    // Defer scroll-to-end so the new content is laid out before we measure.
    // Deferred prompt previews append two bubbles outside of `msgs`, so
    // include them in the dependency list to keep the queued send visible.
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [msgs, thinking, deferredPromptPreview]);

  const chatRows = useMemo<KairoChatRow[]>(() => {
    const rows: KairoChatRow[] = msgs.map((message, index) => ({
      kind: "message",
      id: `msg-${index}`,
      message,
    }));
    if (deferredPromptPreview) {
      rows.push({
        kind: "message",
        id: "deferred-user-preview",
        message: { from: "me", text: deferredPromptPreview },
      });
      rows.push({
        kind: "message",
        id: "deferred-loading-preview",
        message: { from: "kairo", text: DEFERRED_LOADING_TEXT },
      });
    }
    if (thinking) rows.push({ kind: "thinking", id: "thinking" });
    return rows;
  }, [deferredPromptPreview, msgs, thinking]);

  const starters = useMemo(
    () => buildKairoStarters(tasks, inboxTasks, today),
    [tasks, inboxTasks, today]
  );
  const isConfigPending = open && !configLoaded;
  const isConfigured = configLoaded && config ? isKairoConfigured(config) : false;
  const setupSummary = config
    ? `${getKairoProviderLabel(config.providerFormat)} · ${config.model}`
    : "Loading provider";
  const activeChatSummary = activeChat
    ? `${Math.max(activeChat.messages.length - 1, 0)} turns · ${formatRelative(activeChat.updatedAt)}`
    : "No chat loaded";

  // Live context meter. The base — system prompt + thin workspace context +
  // visible history — only changes when the workspace or conversation does, so
  // it's memoized; only the draft tokens recompute on each keystroke. Mirrors
  // exactly what `sendMessage` assembles, so the number reflects the real turn.
  const baseContextTokens = useMemo(() => {
    const registry = createHandleRegistry();
    const ctx = buildThinContext({ tasks, inboxTasks, goals, goalLinks, registry, today });
    const systemPrompt = KAIRO_AGENT_SYSTEM_PROMPT.replace("{CONTEXT}", ctx);
    const historyText = msgs.map((m) => m.text).join("\n");
    return estimateTokens(systemPrompt) + estimateTokens(historyText);
  }, [tasks, inboxTasks, goals, goalLinks, today, msgs]);

  const totalTokens = baseContextTokens + estimateTokens(val);
  const contextWindow = contextWindowForModel(config?.model);
  const contextPct = Math.min(100, (totalTokens / contextWindow) * 100);

  // Direction of travel vs the previous render, for the up/down arrow.
  const prevTokensRef = useRef(0);
  const tokenTrend: "up" | "down" | "flat" =
    totalTokens > prevTokensRef.current
      ? "up"
      : totalTokens < prevTokensRef.current
        ? "down"
        : "flat";
  useEffect(() => {
    prevTokensRef.current = totalTokens;
  }, [totalTokens]);

  const sendMessageRef = useRef<(text: string, options?: { replayDeferred?: boolean }) => void>(
    () => {}
  );
  const handleRetry = useCallback((prompt: string) => {
    sendMessageRef.current(prompt);
  }, []);

  const handleUndo = useCallback(
    async (chipId: string) => {
      const undoFn = undoMap.current.get(chipId);
      if (!undoFn) return;
      try {
        await undoFn();
        // Only remove the closure after a confirmed success so transient
        // failures leave it available for a retry.
        undoMap.current.delete(chipId);
        setMsgs((prev) =>
          prev.map((m) =>
            m.actions?.some((a) => a.id === chipId)
              ? {
                  ...m,
                  actions: m.actions.map((a) =>
                    a.id === chipId ? { ...a, state: "undone" as const } : a
                  ),
                }
              : m
          )
        );
      } catch (error) {
        mobileLogger.warn("kairo_undo_failed", { errorType: classifyError(error) });
        setMsgs((prev) =>
          prev.map((m) =>
            m.actions?.some((a) => a.id === chipId)
              ? {
                  ...m,
                  actions: m.actions.map((a) =>
                    a.id === chipId
                      ? {
                          ...a,
                          state: "failed" as const,
                          detail: error instanceof Error ? error.message : "Undo failed",
                        }
                      : a
                  ),
                }
              : m
          )
        );
      }
    },
    [setMsgs]
  );

  const handleCopyMessage = useCallback(
    async (message: KairoMessage) => {
      const text = message.text.trim();
      if (!text) return;
      try {
        await Clipboard.setStringAsync(text);
        haptic.success();
        // In-sheet banner is the only feedback channel visible while the
        // Kairo sheet covers the screen; a toast would render behind it.
        setCopyFeedback("Copied to clipboard");
        mobileLogger.info("kairo_message_copied", {
          from: message.from,
          length: text.length,
        });
      } catch (error) {
        haptic.error();
        setCopyFeedback("Could not copy message");
        mobileLogger.warn("kairo_copy_failed", {
          errorType: classifyError(error),
          from: message.from,
        });
      }
    },
    []
  );

  const renderChatRow = useCallback(
    ({ item }: { item: KairoChatRow }) => {
      if (item.kind === "thinking") return <Thinking label={statusLabel} />;
      return (
        <Bubble
          message={item.message}
          onRetry={handleRetry}
          onUndo={handleUndo}
          isUndoable={(id) => undoMap.current.has(id)}
          onCopyMessage={handleCopyMessage}
        />
      );
    },
    [handleCopyMessage, handleRetry, handleUndo, statusLabel]
  );

  // Two-tap Stop: first tap arms (auto-disarms after 3s), second confirms by
  // flagging cancellation and aborting the in-flight request. Mutations already
  // applied stay (with their undo chips); we never interrupt one mid-flight.
  const handleStopPress = useCallback(() => {
    if (!thinking) return;
    if (stopArmed) {
      cancelledRef.current = true;
      abortRef.current?.abort();
      setStopArmed(false);
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
    } else {
      haptic.light();
      setStopArmed(true);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopTimerRef.current = setTimeout(() => setStopArmed(false), 3000);
    }
  }, [stopArmed, thinking]);

  const handleSheetChange = useCallback((index: number) => {
    setOpen(index >= 0);
    if (index >= 0) {
      hasPresentedRef.current = true;
    } else if (hasPresentedRef.current) {
      setMounted(false);
    }
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.6}
        pressBehavior="close"
      />
    ),
    []
  );

  const sendMessage = useCallback(
    async (text: string, options?: { replayDeferred?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || thinking || (deferredPrompt && !options?.replayDeferred)) return;
      haptic.light();

      // Guard against sending with an empty or partial workspace snapshot.
      // The full-corpus query is cold-started when Kairo opens, so a user who
      // sends a message immediately after opening would get responses based on
      // zero context. Defer the prompt and replay it once the query resolves.
      if (!isAllTasksReady) {
        mobileLogger.info("kairo_send_deferred", {
          promptLength: trimmed.length,
          taskCount: tasks.length,
          inboxCount: inboxTasks.length,
        });
        setDeferredPrompt(trimmed);
        setDeferredPromptPreview(trimmed);
        setVal("");
        return;
      }

      const nextConfig = config ?? (await getKairoConfig());
      setConfig(nextConfig);
      const actionId = createActionId("kairo");
      mobileLogger.info("kairo_send_started", {
        actionId,
        providerFormat: nextConfig.providerFormat,
        taskCount: tasks.length,
        inboxCount: inboxTasks.length,
        historyTurns: Math.max(msgs.length - 1, 0),
      });

      // Text-only history from the first user message (skip the greeting). The
      // agent rebuilds fresh workspace context each turn, so prior tool calls
      // are never replayed — only the visible conversation carries over.
      const firstUserIdx = msgs.findIndex((m) => m.from === "me");
      const history: AgentTurn[] =
        firstUserIdx === -1
          ? []
          : msgs.slice(firstUserIdx).map((m): AgentTurn =>
              m.from === "me"
                ? { role: "user", text: m.text }
                : { role: "assistant", text: m.text, toolCalls: [] }
            );

      setDeferredPromptPreview(null);
      setMsgs((prev) => [...prev, { from: "me", text: trimmed }]);
      setVal("");
      Keyboard.dismiss();
      cancelledRef.current = false;
      const abortController = new AbortController();
      abortRef.current = abortController;
      setStatusLabel(null);
      setThinking(true);

      if (!isKairoConfigured(nextConfig)) {
        await new Promise((r) => setTimeout(r, 350));
        setMsgs((prev) => [
          ...prev,
          {
            from: "kairo",
            text: "I need a provider, API key, base URL, and model first. Open Settings → Kairo to configure them, then ask me anything.",
          },
        ]);
        setThinking(false);
        abortRef.current = null;
        return;
      }

      // Thin always-on context + read tools; handles are seeded into a per-send
      // registry that read-tool results append to as the loop runs.
      const registry = createHandleRegistry();
      const todayStr = getLocalDateString();
      const systemPrompt = KAIRO_AGENT_SYSTEM_PROMPT.replace(
        "{CONTEXT}",
        buildThinContext({ tasks, inboxTasks, goals, goalLinks, registry, today: todayStr })
      );
      const tools = buildToolDefs(nextConfig.providerFormat);

      const lookupTask = (taskId: string): TaskSnapshot | null => {
        const t = tasks.find((x) => x._id === taskId) ?? inboxTasks.find((x) => x._id === taskId);
        if (!t) return null;
        return {
          _id: t._id,
          title: t.title,
          deadline: t.deadline,
          completedAt: t.completedAt,
          cancelledAt: t.cancelledAt,
        };
      };

      const mutations = {
        addTask: (args: Parameters<typeof addTaskMutation>[0]) => addTaskMutation(args),
        moveTask: (args: { taskId: string; targetDate: string }) =>
          moveTaskMutation({ taskId: args.taskId as Id<"tasks">, targetDate: args.targetDate }),
        completeTask: (args: { taskId: string }) =>
          completeTaskMutation({ taskId: args.taskId as Id<"tasks"> }),
        reopenTask: (args: { taskId: string }) =>
          reopenTaskMutation({ taskId: args.taskId as Id<"tasks"> }),
        unscheduleTask: (args: { taskId: string }) =>
          unscheduleTaskMutation({ taskId: args.taskId as Id<"tasks"> }),
        softDeleteTask: (args: { taskId: string }) =>
          softDeleteTaskMutation({ taskId: args.taskId as Id<"tasks"> }),
      };
      const actionExecutor = createKairoActionExecutor(
        { taskIdMap: registry.taskIdMap },
        { mutations, lookupTask }
      );
      const taskTitles = new Map(
        [...tasks, ...inboxTasks].map((task) => [task._id, task.title] as const)
      );
      const attemptedActionKeys = new Set<string>();
      const applyActions: ApplyAgentActions = (actions) =>
        applyConfirmedKairoActions(actions, {
          confirm,
          attemptedActionKeys,
          beforeTitleFor: (action) => {
            if (action.kind === "add") return null;
            const taskId = registry.taskIdMap[action.handle];
            return taskId ? taskTitles.get(taskId) ?? null : null;
          },
          apply: async (action) => {
            const result = await actionExecutor.apply(action);
            if (result.status === "applied" && action.kind === "add" && result.taskId) {
              taskTitles.set(result.taskId, action.title);
            }
            return result;
          },
        });

      const call: KairoAgentCaller = async (body) => {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (nextConfig.providerFormat === "anthropic") {
            headers["x-api-key"] = nextConfig.apiKey;
            headers["anthropic-version"] = "2023-06-01";
          } else if (nextConfig.providerFormat === "openai") {
            headers["Authorization"] = `Bearer ${nextConfig.apiKey}`;
          }
          const requestUrl =
            nextConfig.providerFormat === "gemini"
              ? buildGeminiRequestUrl(nextConfig.baseUrl, nextConfig.model, nextConfig.apiKey)
              : nextConfig.baseUrl;
          const res = await fetch(requestUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: abortController.signal,
          });
          if (!res.ok) {
            const errPayload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            const inner = errPayload.error;
            const message =
              inner && typeof inner === "object" && "message" in inner
                ? String((inner as Record<string, unknown>).message)
                : `API error ${res.status}`;
            throw new Error(message);
          }
          return res.json();
        };

      try {
        const result = await runKairoAgent([...history, { role: "user", text: trimmed }], {
          config: nextConfig,
          systemPrompt,
          tools,
          call,
          readEnv: { tasks, inboxTasks, registry, today: todayStr },
          registry,
          applyActions,
          onProgress: (label) => setStatusLabel(label),
          shouldCancel: () => cancelledRef.current,
        });

        const wasCancelled = cancelledRef.current;
        const chips: KairoMessageAction[] = [];
        result.outcomes.forEach(({ result: res, beforeTitle }) => {
          const { chip, undo } = actionResultToMessageAction(res, beforeTitle);
          chips.push(chip);
          if (undo) undoMap.current.set(chip.id, undo);
        });
        const appliedCount = result.outcomes.filter((o) => o.result.status === "applied").length;
        const skippedCount = result.outcomes.filter((o) => o.result.status === "skipped").length;
        const failedCount = result.outcomes.filter((o) => o.result.status === "failed").length;

        if (result.error && !wasCancelled) {
          let errorText = `⚠ ${result.error}`;
          if (/tool/i.test(result.error)) {
            errorText +=
              "\n\nThis model may not support tool calling — try another in Settings → Kairo.";
          }
          setMsgs((prev) => [
            ...prev,
            {
              from: "kairo",
              text: errorText,
              retryPrompt: trimmed,
              actions: chips.length ? chips : undefined,
            },
          ]);
          mobileLogger.warn("kairo_agent_failed", {
            actionId,
            providerFormat: nextConfig.providerFormat,
          });
        } else {
          let displayText =
            result.text ||
            (appliedCount > 0
              ? appliedCount === 1
                ? "Done. I made that change."
                : `Done. I made ${appliedCount} changes.`
              : skippedCount > 0
                ? "I could not apply that change. Check the action status below."
                : "I did not receive a readable response. Try again in a moment.");
          if (failedCount > 0) {
            displayText += `\n\n⚠ ${failedCount} action${failedCount > 1 ? "s" : ""} failed to apply.`;
          }
          if (wasCancelled) {
            displayText += "\n\n(Stopped.)";
          } else if (result.stopped && result.stopReason === "max_rounds") {
            displayText += "\n\n(Paused after several steps — ask me to continue if you need more.)";
          }
          setMsgs((prev) => [
            ...prev,
            { from: "kairo", text: displayText, actions: chips.length ? chips : undefined },
          ]);
          mobileLogger.info("kairo_send_succeeded", {
            actionId,
            providerFormat: nextConfig.providerFormat,
            actionsApplied: appliedCount,
            actionsSkipped: skippedCount,
            actionsFailed: failedCount,
            stopped: result.stopped,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Network error";
        setMsgs((prev) => [
          ...prev,
          { from: "kairo", text: `⚠ ${message}`, retryPrompt: trimmed },
        ]);
        mobileLogger.error("kairo_send_failed", {
          actionId,
          providerFormat: nextConfig.providerFormat,
          errorType: classifyError(error),
        });
      } finally {
        setThinking(false);
        setStatusLabel(null);
        setStopArmed(false);
        if (stopTimerRef.current) {
          clearTimeout(stopTimerRef.current);
          stopTimerRef.current = null;
        }
        abortRef.current = null;
      }
    },
    [
      addTaskMutation,
      moveTaskMutation,
      completeTaskMutation,
      reopenTaskMutation,
      unscheduleTaskMutation,
      softDeleteTaskMutation,
      confirm,
      config,
      deferredPrompt,
      goalLinks,
      goals,
      inboxTasks,
      isAllTasksReady,
      msgs,
      setMsgs,
      tasks,
      thinking,
    ]
  );

  useEffect(() => {
    sendMessageRef.current = (text: string, options?: { replayDeferred?: boolean }) => {
      void sendMessage(text, options);
    };
  }, [sendMessage]);

  // Retry deferred prompt once the workspace loads. When a user sends a message
  // immediately after opening Kairo, the full-corpus query is still cold-starting.
  // We defer the prompt and show "Loading your workspace…" until isAllTasksReady
  // becomes true, then automatically replay the original prompt.
  useEffect(() => {
    if (!isAllTasksReady || !deferredPrompt) return;
    mobileLogger.info("kairo_deferred_replay_started", {
      promptLength: deferredPrompt.length,
      taskCount: tasks.length,
      inboxCount: inboxTasks.length,
    });
    setDeferredPrompt(null);
    void sendMessage(deferredPrompt, { replayDeferred: true });
  }, [inboxTasks.length, isAllTasksReady, deferredPrompt, sendMessage, tasks.length]);

  const clearDeferred = useCallback(() => {
    setDeferredPrompt(null);
    setDeferredPromptPreview(null);
  }, []);

  const handleCreateChat = useCallback(() => {
    if (thinking) return;
    clearDeferred();
    createChat();
    setView("chat");
  }, [clearDeferred, createChat, thinking]);

  const handleSwitchChat = useCallback(
    (id: string) => {
      if (thinking) return;
      clearDeferred();
      switchChat(id);
      setView("chat");
    },
    [clearDeferred, switchChat, thinking]
  );

  const handleDeleteChat = useCallback(
    (id: string) => {
      // Block deleting the chat currently waiting on a response so the
      // in-flight reply doesn't try to append to a deleted chat.
      if (thinking && id === activeChat?.id) return;
      clearDeferred();
      deleteChat(id);
    },
    [activeChat?.id, clearDeferred, deleteChat, thinking]
  );

  if (!mounted) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      // v5 defaults enableDynamicSizing to true, which makes the sheet
      // measure its children's intrinsic height and ignore snapPoints.
      // Our children are plain <View>s with no fixed height, so the sheet
      // collapses to 0px and never visibly appears. Pin to snapPoints.
      enableDynamicSizing={false}
      enablePanDownToClose
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.indicator}
      backgroundStyle={styles.sheetBg}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      {view === "list" ? (
        <KairoChatList
          chats={chats}
          activeChatId={activeChat?.id ?? null}
          onSelect={handleSwitchChat}
          onCreate={handleCreateChat}
          onDelete={handleDeleteChat}
          onClose={() => setView("chat")}
        />
      ) : (
      <>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable
            onPress={() => setView("list")}
            hitSlop={12}
            style={({ pressed }) => [
              styles.headerHistoryButton,
              thinking && styles.headerButtonDisabled,
              pressed && { opacity: 0.72 },
            ]}
            accessibilityLabel="Show chat list"
            accessibilityRole="button"
            disabled={thinking}
          >
            <Text style={styles.headerHistoryText}>Chat history</Text>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleCreateChat}
              hitSlop={12}
              style={({ pressed }) => [
                styles.headerNewButton,
                thinking && styles.headerButtonDisabled,
                pressed && { opacity: 0.72 },
              ]}
              accessibilityLabel="Start new chat"
              accessibilityRole="button"
              disabled={thinking}
            >
              <View style={styles.headerInlineAction}>
                <PlusIcon color={colors.accent} size={14} />
                <Text style={styles.headerNewText}>New</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => sheetRef.current?.close()}
              hitSlop={12}
              style={({ pressed }) => [styles.headerCloseButton, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Close Kairo"
              accessibilityRole="button"
            >
              <Text style={styles.headerClose}>Close</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={() => setView("list")}
          hitSlop={10}
          style={({ pressed }) => [
            styles.headerTitleRow,
            thinking && styles.headerButtonDisabled,
            pressed && { opacity: 0.78 },
          ]}
          accessibilityLabel="Open chat history"
          accessibilityHint="Shows all chats and lets you switch conversations"
          accessibilityRole="button"
          disabled={thinking}
        >
          <View style={styles.headerTitleCopy}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {activeChat?.title && activeChat.title !== "New chat"
                ? activeChat.title
                : "Kairo"}
            </Text>
            <Text style={styles.headerTitleHint}>{activeChatSummary}</Text>
          </View>
        </Pressable>
      </View>

      <BottomSheetScrollView
        ref={listRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {chatRows.map((item) => (
          <View key={item.id}>{renderChatRow({ item })}</View>
        ))}

        <View style={styles.contextCard}>
          <View style={styles.contextRow}>
            <View style={styles.contextMetric}>
              <Text style={styles.contextKicker}>Workspace</Text>
              <Text style={styles.contextValue}>{tasks.length}</Text>
              <Text style={styles.contextMeta}>tasks in context</Text>
            </View>
            <View style={styles.contextMetric}>
              <Text style={styles.contextKicker}>Inbox</Text>
              <Text style={styles.contextValue}>{inboxTasks.length}</Text>
              <Text style={styles.contextMeta}>unplaced tasks</Text>
            </View>
          </View>
          <Text style={styles.contextStatusLabel}>
            {isConfigPending ? "Loading" : isConfigured ? "Ready" : "Setup needed"}
          </Text>
          <Text style={styles.contextStatusText}>
            {isConfigPending
              ? "Checking your saved provider configuration."
              : isConfigured
              ? setupSummary
              : "Add a provider, API key, base URL, and model in Settings → Kairo."}
          </Text>
        </View>

        {/* Starters render on first paint only (no user messages yet). */}
        {msgs.length === 1 && !thinking && !deferredPromptPreview ? (
          <View style={styles.starters}>
            {starters.map((p) => (
              <Pressable
                key={p}
                onPress={() => void sendMessage(p)}
                accessibilityRole="button"
                accessibilityLabel={`Ask Kairo: ${p}`}
                style={({ pressed }) => [styles.starterPill, pressed && { opacity: 0.7 }]}
                hitSlop={12}
              >
                <Text style={styles.starterText}>{p}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {config && !isKairoConfigured(config) ? (
          <Pressable
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Set up Kairo"
            style={({ pressed }) => [styles.configBanner, pressed && { opacity: 0.7 }]}
            hitSlop={12}
          >
            <Text style={styles.configBannerText}>
              Open Settings → Kairo and finish provider setup →
            </Text>
          </Pressable>
        ) : null}
      </BottomSheetScrollView>

      {copyFeedback ? (
        <View
          style={styles.feedbackBanner}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.feedbackText}>{copyFeedback}</Text>
        </View>
      ) : null}

      <View style={[styles.inputDock, { marginBottom: keyboardLift }]}>
        <View style={styles.inputBar}>
          <BottomSheetTextInput
            style={styles.input}
            value={val}
            onChangeText={setVal}
            placeholder="Ask Kairo anything…"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Message Kairo"
            editable={!thinking}
            onSubmitEditing={() => void sendMessage(val)}
            returnKeyType="send"
            blurOnSubmit
          />
          {thinking ? (
            <Pressable
              onPress={handleStopPress}
              hitSlop={12}
              style={({ pressed }) => [
                styles.sendButton,
                stopArmed ? styles.stopButtonArmed : styles.stopButton,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={stopArmed ? "Confirm stop" : "Stop"}
            >
              {stopArmed ? (
                <Text style={styles.sendButtonText}>Tap again</Text>
              ) : (
                <View style={styles.stopInner}>
                  <ActivityIndicator color={colors.textInverse} size="small" />
                  <Text style={styles.sendButtonText}>Stop</Text>
                </View>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void sendMessage(val)}
              disabled={!val.trim() || !!deferredPrompt || !activeChat}
              hitSlop={12}
              style={({ pressed }) => [
                styles.sendButton,
                (!val.trim() || !!deferredPrompt || !activeChat) && styles.sendButtonDisabled,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          )}
        </View>
        <View
          style={styles.tokenMeter}
          pointerEvents="none"
          accessibilityRole="text"
          accessibilityLabel={`Estimated ${totalTokens} tokens, ${contextPct.toFixed(
            1
          )} percent of context window`}
        >
          <Text
            style={[
              styles.tokenMeterArrow,
              tokenTrend === "down" && styles.tokenMeterArrowDown,
            ]}
          >
            {tokenTrend === "down" ? "▾" : "▴"}
          </Text>
          <Text style={styles.tokenMeterCount}>~{totalTokens.toLocaleString()}</Text>
          <Text style={styles.tokenMeterUnit}>tokens</Text>
          <Text style={styles.tokenMeterDot}>·</Text>
          <Text
            style={[
              styles.tokenMeterPct,
              contextPct >= 90
                ? styles.tokenMeterPctDanger
                : contextPct >= 70
                  ? styles.tokenMeterPctWarn
                  : null,
            ]}
          >
            {contextPct < 0.1 ? "<0.1" : contextPct.toFixed(1)}% context
          </Text>
        </View>
      </View>
      </>
      )}
    </BottomSheet>
  );
});

function Bubble({
  message,
  onRetry,
  onUndo,
  isUndoable,
  onCopyMessage,
}: {
  message: KairoMessage;
  onRetry?: (prompt: string) => void;
  onUndo?: (chipId: string) => void;
  isUndoable?: (id: string) => boolean;
  onCopyMessage?: (message: KairoMessage) => void;
}) {
  const isMe = message.from === "me";
  return (
    <Pressable
      onLongPress={() => onCopyMessage?.(message)}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel="Copy message"
      style={({ pressed }) => [
        styles.bubble,
        isMe ? styles.bubbleMe : styles.bubbleKairo,
        pressed && { opacity: 0.9 },
      ]}
    >
      {isMe ? (
        <Text style={[styles.bubbleText, styles.bubbleTextMe]}>{message.text}</Text>
      ) : (
        <KairoMarkdown text={message.text} baseStyle={styles.bubbleText} />
      )}
      {message.actions?.length ? (
        <View style={styles.actionChipList}>
          {message.actions.map((a) => (
            <ActionChip key={a.id} action={a} onUndo={onUndo} isUndoable={isUndoable} />
          ))}
        </View>
      ) : null}
      {message.tasks?.length ? (
        <View style={styles.taskAddedList}>
          {message.tasks.map((t, i) => (
            <Text key={i} style={styles.taskAddedItem}>
              + {t.title}
              {t.deadline ? `  ·  ${t.deadline}` : "  ·  inbox"}
            </Text>
          ))}
        </View>
      ) : null}
      {message.retryPrompt && onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => onRetry(message.retryPrompt as string)}
          style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function ActionChip({
  action,
  onUndo,
  isUndoable,
}: {
  action: KairoMessageAction;
  onUndo?: (chipId: string) => void;
  isUndoable?: (id: string) => boolean;
}) {
  const chipStyle =
    action.state === "applied"
      ? styles.chipApplied
      : action.state === "undone"
        ? styles.chipUndone
        : action.state === "skipped"
          ? styles.chipSkipped
          : styles.chipFailed;
  // Show Undo for "applied" (normal) and "failed" (undo failed, retryable).
  // isUndoable gates both cases — if the closure is gone (e.g. after restart
  // or when the action itself failed) the button stays hidden.
  const canUndo =
    (action.state === "applied" || action.state === "failed") &&
    !!onUndo &&
    (isUndoable?.(action.id) ?? true);
  return (
    <View style={[styles.chip, chipStyle]}>
      <View style={styles.chipTextStack}>
        <Text style={styles.chipKicker}>{action.kind}</Text>
        <Text style={styles.chipLabel}>
          {action.label}
        </Text>
      </View>
      {action.detail ? (
        <Text style={styles.chipDetail}>
          {action.detail}
        </Text>
      ) : null}
      {canUndo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo"
          onPress={() => onUndo!(action.id)}
          hitSlop={8}
          style={({ pressed }) => [styles.chipUndoButton, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.chipUndoText}>Undo</Text>
        </Pressable>
      ) : action.state === "undone" ? (
        <Text style={styles.chipStateLabel}>Undone</Text>
      ) : null}
    </View>
  );
}

const THINKING_BARS = [0.92, 0.74, 0.48];
const BAR_STAGGER_MS = 130;
const DOT_CYCLE_MS = 420;

function Thinking({ label }: { label?: string | null }) {
  // Each bar gets its own sweep value so stagger offsets work independently.
  const sweeps = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  useEffect(() => {
    sweeps.forEach((sv, i) => {
      sv.value = withDelay(
        i * BAR_STAGGER_MS,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1200, easing: Easing.bezier(...motion.easing.inOutQuart) }),
            withTiming(0, { duration: 0 }),
          ),
          -1,
          false,
        ),
      );
    });
  // sweeps refs are stable across renders — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sweepStyles = sweeps.map((sv) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      transform: [{ translateX: `${(sv.value - 0.5) * 220}%` }],
    }))
  );

  // Cycle dot count 1 → 2 → 3 → 1 …
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d % 3) + 1), DOT_CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.thinkingCard}>
      <Text style={styles.thinkingLabel}>{label ?? "thinking" + ".".repeat(dots)}</Text>
      {THINKING_BARS.map((w, i) => (
        <View key={i} style={[styles.thinkingBar, { width: `${w * 100}%` }]}>
          <Animated.View style={[styles.thinkingBarSweep, sweepStyles[i]]} />
        </View>
      ))}
    </View>
  );
}

const styles = createThemedStyles({
  sheetBg: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  indicator: {
    backgroundColor: colors.border,
    width: 36,
    height: 4,
  },
  header: {
    flexDirection: "column",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  headerTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  headerTitleHint: {
    color: colors.textMuted,
    ...typography.micro,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerInlineAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerHistoryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  headerHistoryText: {
    color: colors.accent,
    ...typography.micro,
    fontFamily: fonts.sansSemibold,
  },
  headerNewButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
  },
  headerNewText: {
    color: colors.textInverse,
    ...typography.micro,
    fontFamily: fonts.sansSemibold,
  },
  headerClose: {
    color: colors.textSecondary,
    ...typography.micro,
  },
  headerCloseButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 7,
  },
  headerButtonDisabled: {
    opacity: 0.45,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  // Bubbles use the same translucent fill / hairline border / left-rail
  // language as TaskCard so the surface reads as one product. User messages
  // sit right-aligned with an accent fill, Kairo messages left-aligned with
  // an accent left rail.
  bubble: {
    maxWidth: "82%",
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  bubbleKairo: {
    alignSelf: "flex-start",
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
  },
  bubbleText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  bubbleTextMe: {
    color: colors.textInverse,
  },
  actionChipList: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCardGlass,
  },
  chipApplied: {
    borderColor: colors.success,
    backgroundColor: colors.successMuted,
  },
  chipUndone: {
    borderColor: colors.textMuted,
    opacity: 0.7,
  },
  chipSkipped: {
    borderColor: colors.warning,
  },
  chipFailed: {
    borderColor: colors.warning,
  },
  chipTextStack: {
    alignSelf: "stretch",
    gap: 2,
  },
  chipKicker: {
    color: colors.textMuted,
    ...typography.micro,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipLabel: {
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  chipDetail: {
    color: colors.textSecondary,
    ...typography.micro,
  },
  chipUndoButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
  },
  chipUndoText: {
    ...typography.micro,
    fontFamily: fonts.sansSemibold,
    color: colors.textPrimary,
  },
  chipStateLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  taskAddedList: {
    marginTop: spacing.sm,
    gap: 2,
  },
  taskAddedItem: {
    color: colors.success,
    ...typography.numeric,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCardGlass,
  },
  retryButtonText: {
    ...typography.bodyMd,
    fontFamily: fonts.sansSemibold,
    color: colors.textPrimary,
  },
  // Skeleton card matches web's KairoThinking — left rule, dim shimmer bars.
  thinkingCard: {
    alignSelf: "flex-start",
    width: "82%",
    padding: spacing.md,
    backgroundColor: colors.bgCardGlass,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  thinkingLabel: {
    color: colors.textSecondary,
    ...typography.micro,
  },
  thinkingBar: {
    height: 8,
    borderRadius: 2,
    backgroundColor: colors.bgInput,
    overflow: "hidden",
  },
  thinkingBarSweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "60%",
    backgroundColor: colors.accentSoft,
  },
  starters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  contextCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  contextRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  contextMetric: {
    flex: 1,
    gap: 2,
  },
  contextKicker: {
    color: colors.textMuted,
    ...typography.micro,
  },
  contextValue: {
    color: colors.textPrimary,
    ...typography.title,
  },
  contextMeta: {
    color: colors.textMuted,
    ...typography.bodyMd,
  },
  contextStatusLabel: {
    color: colors.textMuted,
    ...typography.micro,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  contextStatusText: {
    color: colors.textSecondary,
    ...typography.bodyMd,
  },
  starterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgCardGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  starterText: {
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  configBanner: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warning,
    borderRadius: radii.md,
    backgroundColor: colors.warningMuted,
  },
  configBannerText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  feedbackBanner: {
    alignSelf: "center",
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  feedbackText: {
    color: colors.textPrimary,
    ...typography.micro,
  },
  inputDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bg,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tokenMeter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  tokenMeterArrow: {
    color: colors.success,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: fonts.sansSemibold,
  },
  tokenMeterArrowDown: {
    color: colors.textMuted,
  },
  tokenMeterCount: {
    color: colors.textSecondary,
    ...typography.micro,
    fontFamily: fonts.mono,
    fontVariant: ["tabular-nums"],
  },
  tokenMeterUnit: {
    color: colors.textMuted,
    ...typography.micro,
  },
  tokenMeterDot: {
    color: colors.textMuted,
    ...typography.micro,
  },
  tokenMeterPct: {
    color: colors.textMuted,
    ...typography.micro,
    fontVariant: ["tabular-nums"],
  },
  tokenMeterPctWarn: {
    color: colors.warning,
  },
  tokenMeterPctDanger: {
    color: colors.error,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontFamily: fonts.sans,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sendButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  stopButton: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stopButtonArmed: {
    backgroundColor: colors.warning,
  },
  stopInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sendButtonText: {
    color: colors.textInverse,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
});
