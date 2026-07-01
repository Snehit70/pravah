/** @vitest-environment happy-dom */
/**
 * InboxScreen tests
 *
 * Strategy: mock react-native components and DraggableFlatList, test rendering
 * states (loading, empty, with tasks) and user interactions.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      accessibilityLabel,
      accessibilityRole: ___,
      ...safe
    } = rest as {
      onPress?: () => void;
      hitSlop?: unknown;
      accessibilityLabel?: string;
      accessibilityRole?: string;
    } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      { ...safe, onClick: onPress, type: "button", "aria-label": accessibilityLabel },
      resolved,
    );
  };
  const RefreshControl = () => React.createElement("div", { "data-testid": "refresh-control" });
  const FlatList = ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
  }: {
    data: unknown[];
    renderItem: (params: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    if (data.length === 0 && ListEmptyComponent) {
      return React.createElement(
        "div",
        { "data-testid": "flat-list" },
        ListHeaderComponent,
        ListEmptyComponent
      );
    }
    return React.createElement(
      "div",
      { "data-testid": "flat-list" },
      ListHeaderComponent,
      data.map((item, index) =>
        React.createElement(
          "div",
          { key: keyExtractor(item), "data-testid": `task-item-${index}` },
          renderItem({ item, index })
        )
      ),
      ListFooterComponent
    );
  };
  const TextInput = ({ value, onChangeText, placeholder, ...rest }: AnyProps & {
    value?: string;
    onChangeText?: (text: string) => void;
    placeholder?: string;
  }) => {
    const { style: _, ...safe } = rest;
    return React.createElement("input", {
      ...safe,
      value: value ?? "",
      placeholder,
      onChange: (e: { target: { value: string } }) => onChangeText?.(e.target.value),
    });
  };
  const StyleSheet = {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    hairlineWidth: 1,
  };
  return {
    View,
    Text,
    Pressable,
    RefreshControl,
    FlatList,
    TextInput,
    StyleSheet,
  };
});

// ─── react-native-reanimated mock ─────────────────────────────────────────────
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", {}, children),
  },
  FadeIn: { duration: () => undefined },
  FadeOut: { duration: () => undefined },
}));

// ─── goals hooks mock ─────────────────────────────────────────────────────────
vi.mock("../hooks/useGoals", () => ({
  useGoals: () => ({
    goals: [
      { id: "g1", text: "Blog" },
      { id: "g2", text: "Fitness" },
    ],
    isHydrated: true,
  }),
  // task1 → Blog; task2 is unlinked.
  useGoalLinks: () => ({ task1: "g1" }),
}));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#06f",
    bg: "#000",
    bgCard: "#111",
    border: "#222",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textMuted: "#888",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xxl: 48, section: 32 },
  typography: { headline: {}, bodyMd: {}, micro: {} },
  radii: { sm: 4, md: 8, lg: 12, xl: 16, full: 999 },
}));

// ─── LoadingSkeleton mock ─────────────────────────────────────────────────────
vi.mock("../components/LoadingSkeleton", () => ({
  TaskListSkeleton: ({ variant }: { variant: string }) =>
    React.createElement("div", { "data-testid": `skeleton-${variant}` }),
}));

// Import component after all mocks are set up.
import { InboxScreen } from "../screens/InboxScreen";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

// ─── helpers ──────────────────────────────────────────────────────────────────

const sampleTasks: MobileTask[] = [
  {
    _id: "task1" as Id<"tasks">,
    title: "Task 1",
    scheduledAt: 100,
    priority: "p1",
    position: 0,
    updatedAt: 1000,
    createdAt: 100,
  },
  {
    _id: "task2" as Id<"tasks">,
    title: "Task 2",
    scheduledAt: 200,
    priority: "p2",
    position: 1,
    updatedAt: 2000,
    createdAt: 200,
  },
];

// ─── tests ────────────────────────────────────────────────────────────────────

describe("InboxScreen", () => {
  const mockRenderItem = vi.fn((params: { item: MobileTask }) =>
    React.createElement("div", { "data-testid": `task-${params.item._id}` }, params.item.title)
  );
  const mockOnRefresh = vi.fn(async () => undefined);
  const mockOnCapture = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders loading skeleton when isLoading is true", () => {
    render(
      <InboxScreen
        tasks={[]}
        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onCapture={mockOnCapture}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByTestId("skeleton-inbox")).toBeTruthy();
    expect(screen.queryByText("Everything has a place.")).toBeNull();
  });

  it("shows empty state when no tasks and not loading", () => {
    render(
      <InboxScreen
        tasks={[]}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onCapture={mockOnCapture}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByText("Everything has a place.")).toBeTruthy();
    expect(screen.getByText("Capture new loose work when it appears.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /capture a task/i })).toBeTruthy();
  });

  it("renders task list when tasks are present", () => {
    render(
      <InboxScreen
        tasks={sampleTasks}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onCapture={mockOnCapture}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByTestId("task-task1")).toBeTruthy();
    expect(screen.getByTestId("task-task2")).toBeTruthy();
    expect(screen.getByText("Task 1")).toBeTruthy();
    expect(screen.getByText("Task 2")).toBeTruthy();
    expect(mockRenderItem).toHaveBeenCalledTimes(2);
  });

  it("calls onCapture when capture button is pressed", () => {
    render(
      <InboxScreen
        tasks={[]}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onCapture={mockOnCapture}
        renderItem={mockRenderItem}
      />
    );

    const captureBtn = screen.getByRole("button", { name: /capture a task/i });
    fireEvent.click(captureBtn);

    expect(mockOnCapture).toHaveBeenCalledTimes(1);
  });

  it("does not show empty state when loading", () => {
    render(
      <InboxScreen
        tasks={[]}
        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onCapture={mockOnCapture}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.queryByText("Everything has a place.")).toBeNull();
    expect(screen.getByTestId("skeleton-inbox")).toBeTruthy();
  });

  it("filters to tasks linked to the selected goal", () => {
    render(
      <InboxScreen
        tasks={sampleTasks}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onCapture={mockOnCapture}
        renderItem={mockRenderItem}
      />
    );

    // Open the filter launcher, then the goal dropdown, then pick "Blog".
    fireEvent.click(screen.getByRole("button", { name: /search or filter/i }));
    fireEvent.click(screen.getByRole("button", { name: /goal filter/i }));
    fireEvent.click(screen.getByRole("button", { name: "Blog" }));

    // task1 is linked to Blog; task2 (unlinked) is filtered out.
    expect(screen.getByTestId("task-task1")).toBeTruthy();
    expect(screen.queryByTestId("task-task2")).toBeNull();
  });

  it("filters to unlinked tasks with the No goal option", () => {
    render(
      <InboxScreen
        tasks={sampleTasks}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onCapture={mockOnCapture}
        renderItem={mockRenderItem}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /search or filter/i }));
    fireEvent.click(screen.getByRole("button", { name: /goal filter/i }));
    fireEvent.click(screen.getByRole("button", { name: "No goal" }));

    // task2 has no goal link; task1 (linked to Blog) is filtered out.
    expect(screen.getByTestId("task-task2")).toBeTruthy();
    expect(screen.queryByTestId("task-task1")).toBeNull();
  });

  it("releases large inboxes in small batches after the first paint", () => {
    vi.useFakeTimers();
    const tasks = Array.from({ length: 30 }, (_, index) => ({
      _id: `bulk-${index}` as Id<"tasks">,
      title: `Bulk task ${index}`,
      scheduledAt: index,
      priority: "p1" as const,
      position: index,
      updatedAt: index,
      createdAt: index,
    }));

    render(
      <InboxScreen
        tasks={tasks}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onCapture={mockOnCapture}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByTestId("task-bulk-22")).toBeTruthy();
    expect(screen.queryByTestId("task-bulk-23")).toBeNull();
    expect(screen.getByText("Preparing more tasks...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(32);
    });

    expect(screen.getByTestId("task-bulk-29")).toBeTruthy();
    expect(screen.queryByText("Preparing more tasks...")).toBeNull();
  });
});
