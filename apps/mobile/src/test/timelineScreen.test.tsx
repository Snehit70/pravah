/** @vitest-environment happy-dom */
/**
 * TimelineScreen tests
 *
 * Strategy: mock react-native components and DraggableFlatList, test rendering
 * of date-grouped sections, empty states, and loading states.
 */

import { render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── react-native mock ────────────────────────────────────────────────────────
vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const View = ({ children, ...rest }: AnyProps) => {
    const { style: _, pointerEvents: __, ...safe } = rest;
    return React.createElement("div", safe, children);
  };
  const Text = ({ children, ...rest }: AnyProps) => {
    const { style: _, ...safe } = rest;
    return React.createElement("span", safe, children);
  };
  const RefreshControl = () => React.createElement("div", { "data-testid": "refresh-control" });
  return {
    View,
    Text,
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

// ─── react-native-draggable-flatlist mock ─────────────────────────────────────
vi.mock("react-native-draggable-flatlist", () => ({
  default: ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
  }: {
    data: unknown[];
    renderItem: (params: { item: unknown; drag: () => void; isActive: boolean; getIndex: () => number }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListEmptyComponent?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    if (data.length === 0 && ListEmptyComponent) {
      return React.createElement("div", { "data-testid": "draggable-flatlist" }, ListEmptyComponent);
    }
    return React.createElement(
      "div",
      { "data-testid": "draggable-flatlist" },
      data.map((item, index) =>
        React.createElement(
          "div",
          { key: keyExtractor(item), "data-testid": `timeline-row-${index}` },
          renderItem({ item, drag: vi.fn(), isActive: false, getIndex: () => index })
        )
      )
    );
  },
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

// ─── TimelineSectionHeader mock ───────────────────────────────────────────────
vi.mock("../components/TimelineSectionHeader", () => ({
  TimelineSectionHeader: ({ label, isToday }: { label: string; isToday: boolean }) =>
    React.createElement(
      "div",
      { "data-testid": `section-header-${isToday ? "today" : "other"}` },
      label
    ),
}));

// ─── dates mock ───────────────────────────────────────────────────────────────
vi.mock("../lib/dates", () => ({
  dateLabel: (dateKey: string, today: string, tomorrow: string) => {
    if (dateKey === today) return "TODAY";
    if (dateKey === tomorrow) return "TOMORROW";
    return dateKey;
  },
}));

// Import component after all mocks are set up.
import { TimelineScreen } from "../screens/TimelineScreen";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

// ─── helpers ──────────────────────────────────────────────────────────────────

const sampleSections: [string, MobileTask[]][] = [
  [
    "2026-05-04",
    [
      {
        _id: "task1" as Id<"tasks">,
        title: "Task 1",
        status: "scheduled",
        scheduledDate: "2026-05-04",
        priority: "p1",
        position: 0,
        updatedAt: 1000,
      },
      {
        _id: "task2" as Id<"tasks">,
        title: "Task 2",
        status: "scheduled",
        scheduledDate: "2026-05-04",
        priority: "p2",
        position: 1,
        updatedAt: 2000,
      },
    ],
  ],
  [
    "2026-05-05",
    [
      {
        _id: "task3" as Id<"tasks">,
        title: "Task 3",
        status: "scheduled",
        scheduledDate: "2026-05-05",
        priority: "p1",
        position: 0,
        updatedAt: 3000,
      },
    ],
  ],
];

// ─── tests ────────────────────────────────────────────────────────────────────

describe("TimelineScreen", () => {
  const mockRenderItem = vi.fn((dateKey: string, params: { item: MobileTask }) =>
    React.createElement(
      "div",
      { "data-testid": `task-${params.item._id}` },
      `${dateKey}: ${params.item.title}`
    )
  );
  const mockOnRefresh = vi.fn(async () => undefined);
  const mockOnDragEnd = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading skeleton when isLoading is true", () => {
    render(
      <TimelineScreen
        sections={[]}
        today="2026-05-04"
        tomorrow="2026-05-05"
        weekEnd="2026-05-10"
        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onDragEnd={mockOnDragEnd}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByTestId("skeleton-timeline")).toBeTruthy();
    expect(screen.queryByText("An open day.")).toBeNull();
  });

  it("shows empty state when no sections and not loading", () => {
    render(
      <TimelineScreen
        sections={[]}
        today="2026-05-04"
        tomorrow="2026-05-05"
        weekEnd="2026-05-10"
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onDragEnd={mockOnDragEnd}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByText("An open day.")).toBeTruthy();
    expect(screen.getByText("Move a task from the inbox to fill it.")).toBeTruthy();
  });

  it("renders date sections with headers and tasks", () => {
    render(
      <TimelineScreen
        sections={sampleSections}
        today="2026-05-04"
        tomorrow="2026-05-05"
        weekEnd="2026-05-10"
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onDragEnd={mockOnDragEnd}
        renderItem={mockRenderItem}
      />
    );

    // Should render section headers
    expect(screen.getByText("TODAY")).toBeTruthy();
    expect(screen.getByText("TOMORROW")).toBeTruthy();

    // Should render tasks
    expect(screen.getByTestId("task-task1")).toBeTruthy();
    expect(screen.getByTestId("task-task2")).toBeTruthy();
    expect(screen.getByTestId("task-task3")).toBeTruthy();

    // Should call renderItem with correct dateKey
    expect(mockRenderItem).toHaveBeenCalledWith(
      "2026-05-04",
      expect.objectContaining({ item: expect.objectContaining({ _id: "task1" }) })
    );
    expect(mockRenderItem).toHaveBeenCalledWith(
      "2026-05-05",
      expect.objectContaining({ item: expect.objectContaining({ _id: "task3" }) })
    );
  });

  it("marks today section header correctly", () => {
    render(
      <TimelineScreen
        sections={sampleSections}
        today="2026-05-04"
        tomorrow="2026-05-05"
        weekEnd="2026-05-10"
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onDragEnd={mockOnDragEnd}
        renderItem={mockRenderItem}
      />
    );

    // Today section should have the "today" testid
    expect(screen.getByTestId("section-header-today")).toBeTruthy();
    // Tomorrow section should have the "other" testid
    expect(screen.getByTestId("section-header-other")).toBeTruthy();
  });

  it("does not show empty state when loading", () => {
    render(
      <TimelineScreen
        sections={[]}
        today="2026-05-04"
        tomorrow="2026-05-05"
        weekEnd="2026-05-10"
        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        onDragEnd={mockOnDragEnd}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.queryByText("An open day.")).toBeNull();
    expect(screen.getByTestId("skeleton-timeline")).toBeTruthy();
  });
});
