/** @vitest-environment happy-dom */
/**
 * CompletedScreen tests
 *
 * Strategy: mock react-native components and FlatList, test rendering
 * states (loading, empty, with tasks).
 */

import { act, render, screen } from "@testing-library/react";
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
  const FlatList = ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ListFooterComponent,
  }: {
    data: unknown[];
    renderItem: (params: { item: unknown }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    if (data.length === 0 && ListEmptyComponent) {
      return React.createElement("div", { "data-testid": "flatlist" }, ListEmptyComponent);
    }
    return React.createElement(
      "div",
      { "data-testid": "flatlist" },
      data.map((item, index) =>
        React.createElement(
          "div",
          { key: keyExtractor(item), "data-testid": `task-item-${index}` },
          renderItem({ item })
        )
      ),
      ListFooterComponent
    );
  };
  const RefreshControl = () => React.createElement("div", { "data-testid": "refresh-control" });
  return {
    View,
    Text,
    FlatList,
    RefreshControl,
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
import { CompletedScreen } from "../screens/CompletedScreen";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

// ─── helpers ──────────────────────────────────────────────────────────────────

const sampleTasks: MobileTask[] = [
  {
    _id: "task1" as Id<"tasks">,
    title: "Completed Task 1",
    status: "completed",
    priority: "p1",
    position: 0,
    updatedAt: 1000,
  },
  {
    _id: "task2" as Id<"tasks">,
    title: "Completed Task 2",
    status: "completed",
    priority: "p2",
    position: 1,
    updatedAt: 2000,
  },
];

// ─── tests ────────────────────────────────────────────────────────────────────

describe("CompletedScreen", () => {
  const mockRenderItem = vi.fn((params: { item: MobileTask }) =>
    React.createElement("div", { "data-testid": `task-${params.item._id}` }, params.item.title)
  );
  const mockOnRefresh = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders loading skeleton when isLoading is true", () => {
    render(
      <CompletedScreen
        tasks={[]}
        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByTestId("skeleton-completed")).toBeTruthy();
    expect(screen.queryByText("A quiet ledger — for now.")).toBeNull();
  });

  it("shows empty state when no tasks and not loading", () => {
    render(
      <CompletedScreen
        tasks={[]}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByText("A quiet ledger — for now.")).toBeTruthy();
    expect(screen.getByText("Closed loops will gather here.")).toBeTruthy();
  });

  it("renders completed task list when tasks are present", () => {
    render(
      <CompletedScreen
        tasks={sampleTasks}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByTestId("task-task1")).toBeTruthy();
    expect(screen.getByTestId("task-task2")).toBeTruthy();
    expect(screen.getByText("Completed Task 1")).toBeTruthy();
    expect(screen.getByText("Completed Task 2")).toBeTruthy();
    expect(mockRenderItem).toHaveBeenCalledTimes(2);
  });

  it("does not show empty state when loading", () => {
    render(
      <CompletedScreen
        tasks={[]}
        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.queryByText("A quiet ledger — for now.")).toBeNull();
    expect(screen.getByTestId("skeleton-completed")).toBeTruthy();
  });

  it("releases large completed lists in small batches after the first paint", () => {
    vi.useFakeTimers();
    const tasks = Array.from({ length: 30 }, (_, index) => ({
      _id: `bulk-${index}` as Id<"tasks">,
      title: `Bulk completed ${index}`,
      status: "completed" as const,
      priority: "p2" as const,
      position: index,
      updatedAt: index,
    }));

    render(
      <CompletedScreen
        tasks={tasks}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByTestId("task-bulk-23")).toBeTruthy();
    expect(screen.queryByTestId("task-bulk-24")).toBeNull();
    expect(screen.getByText("Preparing more tasks...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(32);
    });

    expect(screen.getByTestId("task-bulk-29")).toBeTruthy();
    expect(screen.queryByText("Preparing more tasks...")).toBeNull();
  });
});
