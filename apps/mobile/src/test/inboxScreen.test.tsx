/** @vitest-environment happy-dom */
/**
 * InboxScreen tests
 *
 * Strategy: mock react-native components and DraggableFlatList, test rendering
 * states (loading, empty, with tasks) and user interactions.
 */

import { fireEvent, render, screen } from "@testing-library/react";
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
  }: {
    data: unknown[];
    renderItem: (params: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListEmptyComponent?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    if (data.length === 0 && ListEmptyComponent) {
      return React.createElement("div", { "data-testid": "flat-list" }, ListEmptyComponent);
    }
    return React.createElement(
      "div",
      { "data-testid": "flat-list" },
      data.map((item, index) =>
        React.createElement(
          "div",
          { key: keyExtractor(item), "data-testid": `task-item-${index}` },
          renderItem({ item, index })
        )
      )
    );
  };
  return {
    View,
    Text,
    Pressable,
    RefreshControl,
    FlatList,
  };
});

// ─── react-native-reanimated mock ─────────────────────────────────────────────
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", {}, children),
  },
  FadeIn: { duration: () => undefined },
}));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#06f",
    bgCard: "#111",
    textPrimary: "#fff",
    textSecondary: "#ccc",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xxl: 48, section: 32 },
  typography: { headline: {}, bodyMd: {}, micro: {} },
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
    status: "inbox",
    priority: "p1",
    position: 0,
    updatedAt: 1000,
  },
  {
    _id: "task2" as Id<"tasks">,
    title: "Task 2",
    status: "inbox",
    priority: "p2",
    position: 1,
    updatedAt: 2000,
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
    expect(screen.queryByText("Nothing to carry forward.")).toBeNull();
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

    expect(screen.getByText("Nothing to carry forward.")).toBeTruthy();
    expect(screen.getByText("When something comes up, capture it.")).toBeTruthy();
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

    expect(screen.queryByText("Nothing to carry forward.")).toBeNull();
    expect(screen.getByTestId("skeleton-inbox")).toBeTruthy();
  });
});
