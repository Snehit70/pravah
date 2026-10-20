/** @vitest-environment happy-dom */
/**
 * Kairo component tests
 *
 * Strategy: mock all external dependencies (react-native, convex, fetch,
 * kairoConfig) and test the message flow, deferred prompts, API calls, and
 * task extraction.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

// ─── AsyncStorage mock ────────────────────────────────────────────────────────
// useKairoChats persists chats to AsyncStorage. We back the mock with an
// in-memory map so the hook hydrates immediately and writes are observable.
const asyncStorageBacking = new Map<string, string>();
vi.mock("../components/ScrollViewWithScrollbar", async () => {
  const { ScrollView } = await import("react-native");
  return { ScrollViewWithScrollbar: ScrollView };
});

vi.mock("../components/FlatListWithScrollbar", async () => {
  const { FlatList } = await import("react-native");
  return { FlatListWithScrollbar: FlatList };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageBacking.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageBacking.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageBacking.delete(key);
    }),
  },
}));

vi.mock("expo-blur", () => ({
  BlurView: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("div", { "data-testid": "blur-view" }, children),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => undefined),
  getStringAsync: vi.fn(async () => ""),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("../assets/icons/settings-kairo.svg", () => ({
  default: () => React.createElement("svg", { "data-testid": "kairo-mark-icon" }),
}));

// The page gates its transition on this, which would otherwise drag in
// useUserPreferences and the whole preference store for no benefit here.
vi.mock("../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));

// ─── react-native mock ────────────────────────────────────────────────────────
// Hardware-back registry. `pressHardwareBack` mirrors RN's real dispatch
// order — most recently registered handler first — so tests observe which
// handler actually wins when a page and its parent both listen.
const backSubscribers: Array<() => boolean> = [];

const pressHardwareBack = () => {
  for (let i = backSubscribers.length - 1; i >= 0; i -= 1) {
    if (backSubscribers[i]()) return true;
  }
  return false;
};

vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const View = ({ children, ...rest }: AnyProps) => {
    const { style: _, ...safe } = rest;
    return React.createElement("div", safe, children);
  };
  const Text = ({ children, ...rest }: AnyProps) => {
    const { style: _, ...safe } = rest;
    return React.createElement("span", safe, children);
  };
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const {
      onPress,
      style: _,
      hitSlop: __,
      disabled,
      accessibilityLabel,
      accessibilityRole: ___,
      ...safe
    } = rest as {
      onPress?: () => void;
      hitSlop?: unknown;
      disabled?: boolean;
      accessibilityLabel?: string;
      accessibilityRole?: string;
    } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      { ...safe, onClick: onPress, type: "button", disabled: disabled ?? false, "aria-label": accessibilityLabel },
      resolved,
    );
  };
  type FlatListProps = AnyProps & {
    data?: unknown[];
    renderItem?: (params: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown) => string;
    ListFooterComponent?: React.ReactNode;
  };
  const FlatList = React.forwardRef(
    (props: FlatListProps, ref: React.Ref<{ scrollToEnd: (opts?: { animated?: boolean }) => void }>) => {
      const { data = [], renderItem, keyExtractor, ListFooterComponent, ...rest } = props;
      const { style: _, contentContainerStyle: __, ...safe } = rest;
      React.useImperativeHandle(ref, () => ({
        scrollToEnd: vi.fn(),
      }));
      return React.createElement(
        "div",
        { ...safe, "data-testid": "chat-list" },
        data.map((item, index) => {
          if (!renderItem || !keyExtractor) return null;
          return React.createElement("div", { key: keyExtractor(item) }, renderItem({ item, index }));
        }),
        ListFooterComponent
      );
    }
  );
  const ActivityIndicator = () => React.createElement("div", { "data-testid": "activity-indicator" });
  const ScrollView = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "scroll-view" }, children);
  // Kairo is a full-screen Modal page, so the mock has to honour `visible` —
  // a Modal that always rendered children couldn't assert the closed state.
  const Modal = ({
    children,
    visible,
  }: {
    children?: React.ReactNode;
    visible?: boolean;
  }) =>
    visible
      ? React.createElement("div", { "data-testid": "kairo-modal" }, children)
      : null;
  const TextInput = ({
    value,
    onChangeText,
    onSubmitEditing,
    placeholder,
  }: {
    value?: string;
    onChangeText?: (v: string) => void;
    onSubmitEditing?: () => void;
    placeholder?: string;
    [key: string]: unknown;
  }) =>
    React.createElement("input", {
      value: value ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") onSubmitEditing?.();
      },
      placeholder,
      "data-testid": "kairo-input",
    });
  // BackHandler stands in for the real listener registry so a test can fire a
  // hardware back press and observe which handler wins.
  const BackHandler = {
    addEventListener: (_event: string, handler: () => boolean) => {
      backSubscribers.push(handler);
      return {
        remove: () => {
          const index = backSubscribers.indexOf(handler);
          if (index >= 0) backSubscribers.splice(index, 1);
        },
      };
    },
  };
  const Keyboard = {
    dismiss: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  };
  const Platform = {
    OS: "web",
    select: <T,>(spec: { web?: T; default?: T; ios?: T; android?: T }) =>
      spec.web ?? spec.default ?? spec.ios ?? spec.android,
  };
  const TurboModuleRegistry = {
    get: vi.fn(),
    getEnforcing: vi.fn(),
  };
  // Kairo gates its page transition on useReducedMotion.
  const AccessibilityInfo = {
    isReduceMotionEnabled: vi.fn(async () => false),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  };
  return {
    View,
    Text,
    Pressable,
    FlatList,
    ActivityIndicator,
    ScrollView,
    Modal,
    TextInput,
    BackHandler,
    Keyboard,
    Platform,
    TurboModuleRegistry,
    AccessibilityInfo,
    StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 },
  };
});

// ─── react-native-keyboard-controller mock ────────────────────────────────
// The page lifts its composer with this, so the mock is a plain passthrough.
vi.mock("react-native-keyboard-controller", () => ({
  KeyboardAvoidingView: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("div", { "data-testid": "keyboard-avoiding-view" }, children),
}));

// ─── react-native-reanimated mock ─────────────────────────────────────────────
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", {}, children),
  },
  Easing: { bezier: () => undefined },
  useAnimatedStyle: () => ({}),
  useSharedValue: (v: number) => ({ value: v }),
  withDelay: (_ms: number, v: unknown) => v,
  withRepeat: (v: unknown) => v,
  withSequence: (v: unknown) => v,
  withTiming: (v: unknown) => v,
}));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#06f",
    bg: "#000",
    bgFloating: "#111",
    bgCardGlass: "#222",
    bgInput: "#333",
    border: "#444",
    borderSubtle: "#555",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textMuted: "#999",
    textInverse: "#000",
    warning: "#fa0",
    success: "#0a0",
  },
  fonts: { sans: "sans-serif", sansSemibold: "sans-serif" },
  motion: { easing: { inOutQuart: [0.76, 0, 0.24, 1] } },
  radii: { sm: 4, lg: 12, xl: 16, full: 9999 },
  spacing: { sm: 8, md: 16, lg: 24 },
  typography: { micro: {}, bodyMd: {}, title: {}, numeric: {} },
}));

// ─── convex/react mock ────────────────────────────────────────────────────────
const mockAddTask = vi.fn(async () => undefined);
const mockConvexQuery = vi.fn(async (..._args: unknown[]) => ({
  totalOverdue: 0,
  groups: [],
  orphans: [],
  planToken: "preview-token",
}));
vi.mock("convex/react", () => ({
  useMutation: () => mockAddTask,
  useConvex: () => ({
    query: (queryRef: unknown, args: unknown) => mockConvexQuery(queryRef, args),
  }),
}));

// ─── kairoConfig mock ─────────────────────────────────────────────────────────
const mockGetKairoConfig = vi.fn();
const mockIsKairoConfigured = vi.fn();
const mockGetKairoProviderLabel = vi.fn((provider: string) =>
  provider === "anthropic" ? "Anthropic" : provider === "gemini" ? "Gemini" : "OpenAI"
);
vi.mock("../lib/kairoConfig", () => ({
  getKairoConfig: () => mockGetKairoConfig(),
  isKairoConfigured: (cfg: unknown) => mockIsKairoConfigured(cfg),
  getKairoProviderLabel: (provider: string) => mockGetKairoProviderLabel(provider),
}));

// kairoApi / kairoTools / kairoAgent are NOT mocked — they're pure and already
// unit-tested, so we drive the real tool-calling loop against a mocked `fetch`.
// That exercises the actual request shaping, response parsing, and action
// application end-to-end.

vi.mock("../hooks/useGoals", () => ({
  useGoals: () => ({ goals: [], isHydrated: true }),
  useGoalLinks: () => ({}),
}));

const mockConfirm = vi.fn(async () => true);
vi.mock("../hooks/useConfirm", () => ({
  useConfirm: () => mockConfirm,
}));

// Import component after all mocks are set up.
import { Kairo } from "../components/Kairo";
import type { KairoTaskInput } from "../lib/kairoApi";

// ─── helpers ──────────────────────────────────────────────────────────────────

const sampleTasks: KairoTaskInput[] = [
  { _id: "task1", title: "Task 1" },
  { _id: "task2", title: "Task 2", deadline: "2026-05-05" },
];

function noop() {}

function useConfiguredKairo() {
  mockGetKairoConfig.mockResolvedValue({
    apiKey: "sk-test",
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-sonnet-20241022",
    providerFormat: "anthropic",
  });
  mockIsKairoConfigured.mockReturnValue(true);
}

function useUnconfiguredKairo() {
  mockGetKairoConfig.mockResolvedValue({
    apiKey: "",
    baseUrl: "",
    model: "",
    providerFormat: "anthropic",
  });
  mockIsKairoConfigured.mockReturnValue(false);
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("Kairo", () => {
  // Kairo is a controlled page, so the tests drive visibility through props the
  // same way the app does: render closed, flip `visible` to true.
  const renderKairo = (
    props: Partial<Parameters<typeof Kairo>[0]> & { visible?: boolean } = {}
  ) => {
    const { visible = false, ...rest } = props;
    const view = render(
      <Kairo
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
        visible={visible}
        onClose={noop}
        {...rest}
      />
    );
    return {
      ...view,
      setVisible: (next: boolean, nextProps = {}) =>
        view.rerender(
          <Kairo
            tasks={sampleTasks}
            inboxTasks={[sampleTasks[0]]}
            isAllTasksReady={true}
            visible={next}
            onClose={noop}
            {...rest}
            {...nextProps}
          />
        ),
    };
  };

  const openKairo = (view: { setVisible: (v: boolean, p?: object) => void }) =>
    act(() => {
      view.setVisible(true);
    });

  // A fresh chat opens empty, so there's no greeting text to await. The real
  // readiness gate for every send path is the chat hook hydrating `activeChat`
  // — the Send button stays disabled until it does. So type first, then wait
  // for Send to enable; that is the same precondition the user hits.
  //
  // Asserted via the raw `disabled` property rather than `toBeEnabled()`:
  // jest-dom is not registered in this suite, so its matchers don't exist.
  const compose = async (text: string) => {
    fireEvent.change(await screen.findByTestId("kairo-input"), {
      target: { value: text },
    });
    const send = screen.getByRole("button", { name: /send message/i }) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));
    return send;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    asyncStorageBacking.clear();
    backSubscribers.length = 0;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while closed, then the page once opened", async () => {
    useConfiguredKairo();

    const view = renderKairo();

    expect(screen.queryByTestId("kairo-modal")).toBeNull();
    expect(screen.queryByTestId("kairo-input")).toBeNull();

    openKairo(view);

    // Hook hydrates asynchronously; wait for the composer to land.
    expect(await screen.findByTestId("kairo-input")).toBeTruthy();
    expect(screen.getByTestId("kairo-modal")).toBeTruthy();
  });

  it("asks the parent to close when the back control is pressed", async () => {
    useConfiguredKairo();
    const onClose = vi.fn();

    renderKairo({ visible: true, onClose });
    await screen.findByTestId("kairo-input");

    fireEvent.click(screen.getByRole("button", { name: /close kairo/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("unwinds history before closing on hardware back", async () => {
    useConfiguredKairo();
    const onClose = vi.fn();

    renderKairo({ visible: true, onClose });
    await screen.findByTestId("kairo-input");

    // Open the history page.
    fireEvent.click(screen.getByRole("button", { name: /show chat list/i }));
    expect(screen.getByText("Chats")).toBeTruthy();

    // First back press unwinds history to the chat, and must not close.
    let handled = false;
    act(() => {
      handled = pressHardwareBack();
    });
    expect(handled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Chats")).toBeNull();
    expect(screen.getByTestId("kairo-input")).toBeTruthy();

    // Second back press dismisses the page.
    act(() => {
      handled = pressHardwareBack();
    });
    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("defers message when isAllTasksReady is false", async () => {
    useConfiguredKairo();

    const view = renderKairo({
      tasks: [],
      inboxTasks: [],
      isAllTasksReady: false,
    });

    openKairo(view);
    const sendBtn = await compose("Plan my week");

    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should show the deferred message as a preview bubble.
    expect(screen.getByText("Plan my week")).toBeTruthy();
    expect(screen.getByText(/Loading your workspace/i)).toBeTruthy();

    // Should NOT call fetch (message is deferred)
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("replays deferred message once isAllTasksReady becomes true", async () => {
    useConfiguredKairo();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "Here's your plan" }] }),
    });

    const view = renderKairo({
      tasks: [],
      inboxTasks: [],
      isAllTasksReady: false,
    });

    openKairo(view);
    const sendBtn = await compose("Plan my week");

    await act(async () => {
      fireEvent.click(sendBtn);
    });

    expect(screen.getByText(/Loading your workspace/i)).toBeTruthy();

    // Now the full-corpus query resolves and the workspace populates.
    view.setVisible(true, {
      tasks: sampleTasks,
      inboxTasks: [sampleTasks[0]],
      isAllTasksReady: true,
    });

    // Should replay the deferred message
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Here's your plan")).toBeTruthy());

    // After replay: the user bubble shows the text and the loading bubble is gone.
    expect(screen.getAllByText("Plan my week").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Loading your workspace/i)).toBeNull();
  });

  it("sends message successfully when workspace is ready", async () => {
    useConfiguredKairo();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "Got it!" }] }),
    });

    const view = renderKairo();

    openKairo(view);
    const sendBtn = await compose("What's overdue?");

    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should show the user message bubble.
    expect(screen.getAllByText("What's overdue?").length).toBeGreaterThanOrEqual(1);

    // Should call fetch
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // Should show response
    await waitFor(() => expect(screen.getByText("Got it!")).toBeTruthy());
  });

  it("shows config prompt when Kairo is unconfigured", async () => {
    useUnconfiguredKairo();

    const view = renderKairo();

    openKairo(view);
    const sendBtn = await compose("Help me");
    
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should show config prompt
    await waitFor(() => 
      expect(screen.getByText(/I need a provider, API key/i)).toBeTruthy()
    );

    // Should NOT call fetch
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("creates tasks from add_task tool calls in the response", async () => {
    useConfiguredKairo();

    // Round 1: the model emits two add_task tool calls. Round 2: it finishes
    // with prose. The real loop maps the calls to actions and applies them.
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "add_task",
              input: { title: "Review PR", deadline: "2026-05-05" },
            },
            {
              type: "tool_use",
              id: "t2",
              name: "add_task",
              input: { title: "Write tests" },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "I've added these tasks" }] }),
      });

    const view = renderKairo();

    openKairo(view);
    const sendBtn = await compose("Add some tasks");
    
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should call addTask mutation twice
    await waitFor(() => expect(mockAddTask).toHaveBeenCalledTimes(2));
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    
    expect(mockAddTask).toHaveBeenCalledWith({
      title: "Review PR",
      deadline: "2026-05-05",
      source: "ai-agent",
    });
    
    expect(mockAddTask).toHaveBeenCalledWith({
      title: "Write tests",
      deadline: undefined,
      source: "ai-agent",
    });
  });

  it("does not apply a task mutation when confirmation is declined", async () => {
    useConfiguredKairo();
    mockConfirm.mockResolvedValueOnce(false);
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "add_task",
              input: { title: "Review PR" },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "I left it unchanged." }] }),
      });

    const view = renderKairo();

    openKairo(view);
    const sendBtn = await compose("Add a task");
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => expect(screen.getByText("I left it unchanged.")).toBeTruthy());
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockAddTask).not.toHaveBeenCalled();
  });

  it("handles API errors gracefully", async () => {
    useConfiguredKairo();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid API key" } }),
    });

    const view = renderKairo();

    openKairo(view);
    const sendBtn = await compose("Help");

    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should show error message
    await waitFor(() =>
      expect(screen.getByText(/⚠ Invalid API key/i)).toBeTruthy()
    );
  });

  it("handles network errors gracefully", async () => {
    useConfiguredKairo();

    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );

    const view = renderKairo();

    openKairo(view);
    const sendBtn = await compose("Help");
    
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should show network error
    await waitFor(() => 
      expect(screen.getByText(/⚠ Network error/i)).toBeTruthy()
    );
  });
});
