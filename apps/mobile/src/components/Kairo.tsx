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
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { colors, fonts, motion, radii, spacing, typography } from "../theme/tokens";
import { classifyError, createActionId, mobileLogger } from "../lib/logger";
import {
  getKairoConfig,
  isKairoConfigured,
  type KairoConfig,
} from "../lib/kairoConfig";
import {
  KAIRO_SYSTEM_PROMPT,
  buildAnthropicRequestBody,
  buildKairoContext,
  buildKairoStarters,
  buildOpenAIRequestBody,
  extractTaskBlocks,
  readKairoResponseText,
  type KairoMessage,
  type KairoTaskInput,
} from "../lib/kairoApi";
import { getLocalDateString } from "../lib/dates";
import { useKairoChats } from "../hooks/useKairoChats";
import { KairoChatList } from "./KairoChatList";
import { KairoMarkdown } from "./KairoMarkdown";

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
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [thinking, setThinking] = useState(false);
  const [config, setConfig] = useState<KairoConfig | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<string | null>(null);
  const [deferredPromptPreview, setDeferredPromptPreview] = useState<string | null>(null);
  // "chat" shows the active conversation, "list" shows the chat picker.
  const [view, setView] = useState<"chat" | "list">("chat");
  // Local-date snapshot used to derive starters. Refreshed each time the
  // sheet opens so an app left mounted across midnight still picks up the
  // new day's "What's on today?" / overdue counts on next visit.
  const [today, setToday] = useState(() => getLocalDateString());
  const listRef = useRef<FlatList<KairoChatRow>>(null);

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

  const addTaskMutation = useMutation(api.tasks.addTask);

  // Single snap point at 92% — leaves a sliver of the dimmed app visible at
  // the top as a peek, the same affordance the web overlay leaves.
  const snapPoints = useMemo(() => ["92%"], []);

  useImperativeHandle(
    ref,
    () => ({
      open: () => sheetRef.current?.expand(),
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
    void getKairoConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch((error) => {
        mobileLogger.warn("kairo_config_load_failed", { errorType: classifyError(error) });
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


  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const handleRetry = useCallback((prompt: string) => {
    sendMessageRef.current(prompt);
  }, []);

  const renderChatRow = useCallback(
    ({ item }: { item: KairoChatRow }) => {
      if (item.kind === "thinking") return <Thinking />;
      return <Bubble message={item.message} onRetry={handleRetry} />;
    },
    [handleRetry]
  );

  const handleSheetChange = useCallback((index: number) => {
    setOpen(index >= 0);
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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking) return;

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

      // Snapshot history *before* the optimistic user-message append, since
      // the API expects the assistant's prior turns paired with their
      // matching user prompts. We start from the first user message so the
      // greeting (or any leading assistant-only turns) never lands in
      // context — a positional `slice(1)` would mis-fire on chats where
      // front-trimming has already removed the greeting.
      const firstUserIdx = msgs.findIndex((m) => m.from === "me");
      const history =
        firstUserIdx === -1
          ? []
          : msgs.slice(firstUserIdx).map((m): { role: "user" | "assistant"; content: string } => ({
              role: m.from === "me" ? "user" : "assistant",
              content: m.text,
            }));

      setDeferredPromptPreview(null);
      setMsgs((prev) => [...prev, { from: "me", text: trimmed }]);
      setVal("");
      Keyboard.dismiss();
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
        return;
      }

      try {
        const context = buildKairoContext(tasks, inboxTasks);
        const systemPrompt = KAIRO_SYSTEM_PROMPT.replace("{CONTEXT}", context);
        const body =
          nextConfig.providerFormat === "anthropic"
            ? buildAnthropicRequestBody(nextConfig, systemPrompt, history, trimmed)
            : buildOpenAIRequestBody(nextConfig, systemPrompt, history, trimmed);

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (nextConfig.providerFormat === "anthropic") {
          headers["x-api-key"] = nextConfig.apiKey;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["Authorization"] = `Bearer ${nextConfig.apiKey}`;
        }

        const res = await fetch(nextConfig.baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errPayload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          const inner = errPayload.error;
          const message =
            inner && typeof inner === "object" && "message" in inner
              ? String((inner as Record<string, unknown>).message)
              : `API error ${res.status}`;
          setMsgs((prev) => [
            ...prev,
            { from: "kairo", text: `⚠ ${message}`, retryPrompt: trimmed },
          ]);
          mobileLogger.warn("kairo_provider_failed", {
            actionId,
            providerFormat: nextConfig.providerFormat,
            status: res.status,
          });
          return;
        }

        const data = await res.json();
        const rawText = readKairoResponseText(data, nextConfig.providerFormat);
        const { cleanText, tasks: taskBlocks } = extractTaskBlocks(rawText);

        for (const t of taskBlocks) {
          await addTaskMutation({
            title: t.title,
            type: t.type,
            scheduledDate: t.scheduledDate ?? undefined,
            deadline: t.type === "deadline" ? t.scheduledDate ?? undefined : undefined,
            source: "ai-agent",
          });
        }

        setMsgs((prev) => [
          ...prev,
          {
            from: "kairo",
            text: cleanText || "(no response text)",
            tasks: taskBlocks.length ? taskBlocks : undefined,
          },
        ]);
        mobileLogger.info("kairo_send_succeeded", {
          actionId,
          providerFormat: nextConfig.providerFormat,
          taskBlocks: taskBlocks.length,
        });
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
      }
    },
    [addTaskMutation, config, inboxTasks, isAllTasksReady, msgs, setMsgs, tasks, thinking]
  );

  useEffect(() => {
    sendMessageRef.current = (text: string) => {
      void sendMessage(text);
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
    void sendMessage(deferredPrompt);
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

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
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
        <Pressable
          onPress={() => setView("list")}
          hitSlop={12}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          accessibilityLabel="Show chat list"
          accessibilityRole="button"
          disabled={thinking}
        >
          <Text
            style={[styles.headerChats, thinking && { opacity: 0.4 }]}
          >
            Chats
          </Text>
        </Pressable>
        <View style={styles.headerLeftBlock}>
          <KairoMark size={20} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activeChat?.title && activeChat.title !== "New chat"
              ? activeChat.title
              : "Kairo"}
          </Text>
        </View>
        <Pressable
          onPress={() => sheetRef.current?.close()}
          hitSlop={12}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          accessibilityLabel="Close Kairo"
          accessibilityRole="button"
        >
          <Text style={styles.headerClose}>Close</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={styles.scroll}
        data={chatRows}
        renderItem={renderChatRow}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={
          <>
            {/* Starters render on first paint only (no user messages yet). */}
            {msgs.length === 1 && !thinking && !deferredPromptPreview ? (
          <View style={styles.starters}>
            {starters.map((p) => (
              <Pressable
                key={p}
                onPress={() => void sendMessage(p)}
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
            style={({ pressed }) => [styles.configBanner, pressed && { opacity: 0.7 }]}
            hitSlop={12}
          >
            <Text style={styles.configBannerText}>
              Set up your Kairo provider and API key →
            </Text>
          </Pressable>
            ) : null}
          </>
        }
      />

      <View style={styles.inputBar}>
        <BottomSheetTextInput
          style={styles.input}
          value={val}
          onChangeText={setVal}
          placeholder="Ask Kairo anything…"
          placeholderTextColor={colors.textMuted}
          editable={!thinking}
          onSubmitEditing={() => void sendMessage(val)}
          returnKeyType="send"
          blurOnSubmit
        />
        <Pressable
          onPress={() => void sendMessage(val)}
          disabled={!val.trim() || thinking || !activeChat}
          hitSlop={12}
          style={({ pressed }) => [
            styles.sendButton,
            (!val.trim() || thinking || !activeChat) && styles.sendButtonDisabled,
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {thinking ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </Pressable>
      </View>
      </>
      )}
    </BottomSheet>
  );
});

function Bubble({
  message,
  onRetry,
}: {
  message: KairoMessage;
  onRetry?: (prompt: string) => void;
}) {
  const isMe = message.from === "me";
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleKairo]}>
      {isMe ? (
        <Text style={[styles.bubbleText, styles.bubbleTextMe]}>{message.text}</Text>
      ) : (
        <KairoMarkdown text={message.text} baseStyle={styles.bubbleText} />
      )}
      {message.tasks?.length ? (
        <View style={styles.taskAddedList}>
          {message.tasks.map((t, i) => (
            <Text key={i} style={styles.taskAddedItem}>
              + {t.title}
              {t.scheduledDate ? `  ·  ${t.scheduledDate}` : "  ·  inbox"}
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
    </View>
  );
}

/** Web parity (src/index.css:296-305 kairoShine + kairoSkeletonSweep): a
 *  shimmering "thinking" line + 3 skeleton bars whose backgrounds sweep
 *  left-to-right on a loop. RN doesn't render `background-position`, so we
 *  fake the sweep with translateX on a gradient strip masked by the bar. */
function Thinking() {
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.bezier(...motion.easing.inOutQuart) }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
  }, [sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${(sweep.value - 0.5) * 220}%` }],
  }));

  return (
    <View style={styles.thinkingCard}>
      <Text style={styles.thinkingLabel}>thinking</Text>
      {[0.92, 0.74, 0.48].map((w, i) => (
        <View key={i} style={[styles.thinkingBar, { width: `${w * 100}%` }]}>
          <Animated.View style={[styles.thinkingBarSweep, sweepStyle]} />
        </View>
      ))}
    </View>
  );
}

/** Tiny gradient mark — RN can't do CSS gradient backgrounds without an SVG
 *  or LinearGradient, so a flat indigo disc with the brand glyph is good
 *  enough for a 20px header lockup. */
function KairoMark({ size = 20 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: size * 0.32,
          height: size * 0.32,
          borderRadius: (size * 0.32) / 2,
          backgroundColor: colors.bg,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.bgFloating,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  indicator: {
    backgroundColor: colors.border,
    width: 36,
    height: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeftBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  headerClose: {
    color: colors.textSecondary,
    ...typography.micro,
  },
  headerChats: {
    color: colors.accent,
    ...typography.micro,
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
    backgroundColor: colors.bgCardGlass,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  bubbleText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  bubbleTextMe: {
    color: colors.textInverse,
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
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    gap: spacing.sm,
  },
  thinkingLabel: {
    color: colors.textSecondary,
    ...typography.micro,
  },
  thinkingBar: {
    height: 8,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  thinkingBarSweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "60%",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  starters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
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
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.warning,
  },
  configBannerText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
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
  sendButtonText: {
    color: colors.textInverse,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
});
