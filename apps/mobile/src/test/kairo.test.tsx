/** @vitest-environment happy-dom */
/**
 * Kairo component tests
 *
 * Strategy: mock all external dependencies (bottom-sheet, convex, fetch, kairoConfig)
 * and test the message flow, deferred prompts, API calls, and task extraction.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── AsyncStorage mock ────────────────────────────────────────────────────────
// useKairoChats persists chats to AsyncStorage. We back the mock with an
// in-memory map so the hook hydrates immediately and writes are observable.
const asyncStorageBacking = new Map<string, string>();
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

// ─── react-native mock ────────────────────────────────────────────────────────
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
  const Keyboard = { dismiss: vi.fn() };
  return {
    View,
    Text,
    Pressable,
    FlatList,
    ActivityIndicator,
    Keyboard,
    StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 },
  };
});

// ─── @gorhom/bottom-sheet mock ────────────────────────────────────────────────
const mockExpand = vi.fn();
const mockClose = vi.fn();

vi.mock("@gorhom/bottom-sheet", () => {
  const BottomSheet = React.forwardRef(
    (
      {
        children,
        onChange,
      }: {
        children?: React.ReactNode;
        onChange?: (index: number) => void;
        [key: string]: unknown;
      },
      ref: React.Ref<{ expand: () => void; close: () => void }>
    ) => {
      React.useImperativeHandle(ref, () => ({
        expand: () => {
          mockExpand();
          onChange?.(0);
        },
        close: () => {
          mockClose();
          onChange?.(-1);
        },
      }));
      return React.createElement("div", { "data-testid": "bottom-sheet" }, children);
    }
  );
  return {
    default: BottomSheet,
    BottomSheetBackdrop: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", { "data-testid": "backdrop" }, children),
    BottomSheetTextInput: ({
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
      }),
    BottomSheetScrollView: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", { "data-testid": "bottom-sheet-scroll-view" }, children),
    BottomSheetFlatList: ({
      data,
      renderItem,
      keyExtractor,
      ListFooterComponent,
      ListEmptyComponent,
    }: {
      data?: unknown[];
      renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
      keyExtractor?: (item: unknown, index: number) => string;
      ListFooterComponent?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
      [key: string]: unknown;
    }) => {
      const items = data ?? [];
      return React.createElement(
        "div",
        { "data-testid": "bottom-sheet-flat-list" },
        items.length === 0 && ListEmptyComponent ? ListEmptyComponent : null,
        ...items.map((item, index) =>
          React.createElement(
            "div",
            { key: keyExtractor ? keyExtractor(item, index) : index },
            renderItem ? renderItem({ item, index }) : null
          )
        ),
        ListFooterComponent ?? null
      );
    },
  };
});

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
vi.mock("convex/react", () => ({
  useMutation: () => mockAddTask,
}));

// ─── kairoConfig mock ─────────────────────────────────────────────────────────
const mockGetKairoConfig = vi.fn();
const mockIsKairoConfigured = vi.fn();
vi.mock("../lib/kairoConfig", () => ({
  getKairoConfig: () => mockGetKairoConfig(),
  isKairoConfigured: (cfg: unknown) => mockIsKairoConfigured(cfg),
}));

// ─── kairoApi mock ────────────────────────────────────────────────────────────
vi.mock("../lib/kairoApi", () => ({
  KAIRO_SYSTEM_PROMPT: "You are Kairo. {CONTEXT}",
  buildKairoContext: vi.fn(() => ({ text: "mocked context", idMap: {} })),
  buildKairoStarters: vi.fn(() => ["Plan my week", "What's overdue?"]),
  buildAnthropicRequestBody: vi.fn(() => ({ model: "claude", messages: [] })),
  buildOpenAIRequestBody: vi.fn(() => ({ model: "gpt-4", messages: [] })),
  extractKairoActions: vi.fn((text: string) => ({ cleanText: text, actions: [] as Array<Record<string, unknown>> })),
  readKairoResponseText: vi.fn(() => "mocked response"),
}));

vi.mock("../hooks/useGoals", () => ({
  useGoals: () => ({ goals: [], isHydrated: true }),
  useGoalLinks: () => ({}),
}));

// Import the mocked module *after* vi.mock so we get the spy references.
import * as KairoApi from "../lib/kairoApi";

// Import component after all mocks are set up.
import { Kairo, type KairoSheetRef } from "../components/Kairo";
import type { KairoTaskInput } from "../lib/kairoApi";

// ─── helpers ──────────────────────────────────────────────────────────────────

const sampleTasks: KairoTaskInput[] = [
  { _id: "task1", title: "Task 1", status: "inbox" },
  { _id: "task2", title: "Task 2", scheduledDate: "2026-05-05", status: "scheduled" },
];

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
  let ref: { current: KairoSheetRef | null };

  beforeEach(() => {
    vi.clearAllMocks();
    asyncStorageBacking.clear();
    ref = { current: null };
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders greeting message on mount", async () => {
    useConfiguredKairo();

    render(
      <Kairo
        ref={ref}
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
      />
    );

    // Hook hydrates asynchronously; wait for the seeded greeting to land.
    await screen.findByText(/Hey, I'm Kairo/i);
  });

  it("calls onActiveChange when sheet opens and closes", async () => {
    useConfiguredKairo();
    const onActiveChange = vi.fn();

    render(
      <Kairo
        ref={ref}
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
        onActiveChange={onActiveChange}
      />
    );

    // Open the sheet
    act(() => {
      ref.current?.open();
    });

    await waitFor(() => expect(onActiveChange).toHaveBeenCalledWith(true));

    // Close the sheet
    act(() => {
      ref.current?.close();
    });

    await waitFor(() => expect(onActiveChange).toHaveBeenCalledWith(false));
  });

  it("defers message when isAllTasksReady is false", async () => {
    useConfiguredKairo();

    render(
      <Kairo
        ref={ref}
        tasks={[]}
        inboxTasks={[]}
        isAllTasksReady={false}
      />
    );

    await screen.findByText(/Hey, I'm Kairo/i);

    const input = screen.getByTestId("kairo-input") as HTMLInputElement;
    const sendBtn = screen.getByRole("button", { name: /send message/i });

    // Type a message
    fireEvent.change(input, { target: { value: "Plan my week" } });
    
    // Send the message
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should show the deferred message (preview bubble; the header title
    // does not auto-derive while the prompt is still pending).
    expect(screen.getByText("Plan my week")).toBeTruthy();
    expect(screen.getByText(/Loading your workspace/i)).toBeTruthy();

    // Should NOT call fetch (message is deferred)
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("replays deferred message once isAllTasksReady becomes true", async () => {
    useConfiguredKairo();
    vi.mocked(KairoApi.readKairoResponseText).mockReturnValue("Here's your plan");
    vi.mocked(KairoApi.extractKairoActions).mockReturnValue({ cleanText: "Here's your plan", actions: [] });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: "Here's your plan" }] }),
    });

    const { rerender } = render(
      <Kairo
        ref={ref}
        tasks={[]}
        inboxTasks={[]}
        isAllTasksReady={false}
      />
    );

    await screen.findByText(/Hey, I'm Kairo/i);

    const input = screen.getByTestId("kairo-input") as HTMLInputElement;
    const sendBtn = screen.getByRole("button", { name: /send message/i });

    // Send message while not ready
    fireEvent.change(input, { target: { value: "Plan my week" } });
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    expect(screen.getByText(/Loading your workspace/i)).toBeTruthy();

    // Now make workspace ready
    rerender(
      <Kairo
        ref={ref}
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
      />
    );

    // Should replay the deferred message
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Here's your plan")).toBeTruthy());

    // After replay: user bubble + auto-derived header title both show the text.
    expect(screen.getAllByText("Plan my week").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Loading your workspace/i)).toBeNull();
    expect(vi.mocked(KairoApi.buildAnthropicRequestBody)).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      [],
      "Plan my week"
    );
  });

  it("sends message successfully when workspace is ready", async () => {
    useConfiguredKairo();
    vi.mocked(KairoApi.readKairoResponseText).mockReturnValue("Got it!");
    vi.mocked(KairoApi.extractKairoActions).mockReturnValue({ cleanText: "Got it!", actions: [] });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: "Got it!" }] }),
    });

    render(
      <Kairo
        ref={ref}
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
      />
    );

    await screen.findByText(/Hey, I'm Kairo/i);

    const input = screen.getByTestId("kairo-input") as HTMLInputElement;
    const sendBtn = screen.getByRole("button", { name: /send message/i });

    fireEvent.change(input, { target: { value: "What's overdue?" } });

    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should show user message (bubble + auto-derived header title).
    expect(screen.getAllByText("What's overdue?").length).toBeGreaterThanOrEqual(1);

    // Should call fetch
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // Should show response
    await waitFor(() => expect(screen.getByText("Got it!")).toBeTruthy());
  });

  it("shows config prompt when Kairo is unconfigured", async () => {
    useUnconfiguredKairo();

    render(
      <Kairo
        ref={ref}
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
      />
    );

    await screen.findByText(/Hey, I'm Kairo/i);

    const input = screen.getByTestId("kairo-input") as HTMLInputElement;
    const sendBtn = screen.getByRole("button", { name: /send message/i });

    fireEvent.change(input, { target: { value: "Help me" } });
    
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

  it("extracts and creates tasks from response with task blocks", async () => {
    useConfiguredKairo();
    vi.mocked(KairoApi.readKairoResponseText).mockReturnValue("I've added these tasks");
    vi.mocked(KairoApi.extractKairoActions).mockReturnValue({
      cleanText: "I've added these tasks",
      actions: [
        { kind: "add", title: "Review PR", scheduledDate: "2026-05-05", type: "open" },
        { kind: "add", title: "Write tests", scheduledDate: null, type: "open" },
      ],
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: "I've added these tasks" }] }),
    });

    render(
      <Kairo
        ref={ref}
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
      />
    );

    await screen.findByText(/Hey, I'm Kairo/i);

    const input = screen.getByTestId("kairo-input") as HTMLInputElement;
    const sendBtn = screen.getByRole("button", { name: /send message/i });

    fireEvent.change(input, { target: { value: "Add some tasks" } });
    
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should call addTask mutation twice
    await waitFor(() => expect(mockAddTask).toHaveBeenCalledTimes(2));
    
    expect(mockAddTask).toHaveBeenCalledWith({
      title: "Review PR",
      type: "open",
      scheduledDate: "2026-05-05",
      deadline: undefined,
      source: "ai-agent",
    });
    
    expect(mockAddTask).toHaveBeenCalledWith({
      title: "Write tests",
      type: "open",
      scheduledDate: undefined,
      deadline: undefined,
      source: "ai-agent",
    });
  });

  it("handles API errors gracefully", async () => {
    useConfiguredKairo();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid API key" } }),
    });

    render(
      <Kairo
        ref={ref}
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
      />
    );

    await screen.findByText(/Hey, I'm Kairo/i);

    const input = screen.getByTestId("kairo-input") as HTMLInputElement;
    const sendBtn = screen.getByRole("button", { name: /send message/i });

    fireEvent.change(input, { target: { value: "Help" } });

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

    render(
      <Kairo
        ref={ref}
        tasks={sampleTasks}
        inboxTasks={[sampleTasks[0]]}
        isAllTasksReady={true}
      />
    );

    await screen.findByText(/Hey, I'm Kairo/i);

    const input = screen.getByTestId("kairo-input") as HTMLInputElement;
    const sendBtn = screen.getByRole("button", { name: /send message/i });

    fireEvent.change(input, { target: { value: "Help" } });
    
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Should show network error
    await waitFor(() => 
      expect(screen.getByText(/⚠ Network error/i)).toBeTruthy()
    );
  });
});
