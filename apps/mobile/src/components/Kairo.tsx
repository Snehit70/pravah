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
  ScrollView,
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
import {
  getKairoConfig,
  isKairoConfigured,
  type KairoConfig,
} from "../lib/kairoConfig";
import {
  KAIRO_SYSTEM_PROMPT,
  buildAnthropicRequestBody,
  buildKairoContext,
  buildOpenAIRequestBody,
  extractTaskBlocks,
  readKairoResponseText,
  type KairoMessage,
  type KairoTaskInput,
} from "../lib/kairoApi";

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

const STARTERS = [
  "Plan my week",
  "What's overdue?",
  "Summarize my progress",
  "What looks heavy this week?",
];

const GREETING: KairoMessage = {
  from: "kairo",
  text: "Hey, I'm Kairo. I can help you plan your week, prioritize tasks, or analyze your schedule. What do you need?",
};

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
  const [msgs, setMsgs] = useState<KairoMessage[]>([GREETING]);
  const [thinking, setThinking] = useState(false);
  const [config, setConfig] = useState<KairoConfig | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
  // edited their API key in the Settings sheet between visits.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getKairoConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (msgs.length === 0 && !thinking) return;
    // Defer scroll-to-end so the new content is laid out before we measure.
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [msgs, thinking]);

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
        setDeferredPrompt(trimmed);
        setMsgs((prev) => [
          ...prev,
          { from: "me", text: trimmed },
          {
            from: "kairo",
            text: "Loading your workspace… one moment.",
          },
        ]);
        setVal("");
        return;
      }

      const nextConfig = config ?? (await getKairoConfig());
      setConfig(nextConfig);

      // Snapshot history *before* the optimistic user-message append, since
      // the API expects the assistant's prior turns paired with their
      // matching user prompts.
      const history = msgs
        .slice(1)
        .map((m): { role: "user" | "assistant"; content: string } => ({
          role: m.from === "me" ? "user" : "assistant",
          content: m.text,
        }));

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
          setMsgs((prev) => [...prev, { from: "kairo", text: `⚠ ${message}` }]);
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Network error";
        setMsgs((prev) => [...prev, { from: "kairo", text: `⚠ ${message}` }]);
      } finally {
        setThinking(false);
      }
    },
    [addTaskMutation, config, inboxTasks, isAllTasksReady, msgs, tasks, thinking]
  );

  // Retry deferred prompt once the workspace loads. When a user sends a message
  // immediately after opening Kairo, the full-corpus query is still cold-starting.
  // We defer the prompt and show "Loading your workspace…" until isAllTasksReady
  // becomes true, then automatically replay the original prompt.
  useEffect(() => {
    if (!isAllTasksReady || !deferredPrompt) return;
    setDeferredPrompt(null);
    void sendMessage(deferredPrompt);
  }, [isAllTasksReady, deferredPrompt, sendMessage]);

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
      <View style={styles.header}>
        <View style={styles.headerLeftBlock}>
          <KairoMark size={20} />
          <Text style={styles.headerTitle}>Kairo</Text>
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

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {msgs.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {thinking ? <Thinking /> : null}

        {/* Starters render on first paint only (no user messages yet). */}
        {msgs.length === 1 && !thinking ? (
          <View style={styles.starters}>
            {STARTERS.map((p) => (
              <Pressable
                key={p}
                onPress={() => void sendMessage(p)}
                style={({ pressed }) => [styles.starterPill, pressed && { opacity: 0.7 }]}
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
          >
            <Text style={styles.configBannerText}>
              Set up your Kairo provider and API key →
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

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
          disabled={!val.trim() || thinking}
          style={({ pressed }) => [
            styles.sendButton,
            (!val.trim() || thinking) && styles.sendButtonDisabled,
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
    </BottomSheet>
  );
});

function Bubble({ message }: { message: KairoMessage }) {
  const isMe = message.from === "me";
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleKairo]}>
      <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{message.text}</Text>
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
