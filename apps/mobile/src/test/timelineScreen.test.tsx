/** @vitest-environment happy-dom */
/**
 * TimelineScreen tests
 *
 * Strategy: mock react-native components and DraggableFlatList, test rendering
 * of date-grouped sections, empty states, and loading states.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
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
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const { onPress, style: _, hitSlop: __, accessibilityLabel, accessibilityRole: ___, ...safe } =
      rest as {
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
      resolved
    );
  };
  const StyleSheet = { create: (s: Record<string, unknown>) => s, hairlineWidth: 1 };
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
          { key: keyExtractor(item), "data-testid": `timeline-row-${index}` },
          renderItem({ item, index })
        )
      ),
      ListFooterComponent
    );
  };
  return {
    View,
    Text,
    Pressable,
    StyleSheet,
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
  FadeOut: { duration: () => undefined },
  withDelay: (_delay: number, value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#06f",
    bgCard: "#111",
    textPrimary: "#fff",
    textSecondary: "#ccc",
  },
  radii: { md: 16 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xxl: 48, section: 32 },
  typography: { headline: {}, bodyMd: {}, micro: {} },
}));

// ─── LoadingSkeleton mock ─────────────────────────────────────────────────────
vi.mock("../components/LoadingSkeleton", () => ({
  TaskListSkeleton: ({ variant }: { variant: string }) =>
    React.createElement("div", { "data-testid": `skeleton-${variant}` }),
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// ─── TimelineDayCarousel mock ─────────────────────────────────────────────────
vi.mock("../components/TimelineDayCarousel", () => ({
  TimelineDayCarousel: ({ sections }: { sections: unknown[] }) =>
    React.createElement(
      "div",
      { "data-testid": "day-carousel" },
      `carousel:${sections.length}`
    ),
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
        deadline: "2026-05-04",
        scheduledAt: 500,
        priority: "p1",
        position: 0,
        updatedAt: 1000,
        createdAt: 500,
      },
      {
        _id: "task2" as Id<"tasks">,
        title: "Task 2",
        deadline: "2026-05-04",
        scheduledAt: 1000,
        priority: "p2",
        position: 1,
        updatedAt: 2000,
        createdAt: 1000,
      },
    ],
  ],
  [
    "2026-05-05",
    [
      {
        _id: "task3" as Id<"tasks">,
        title: "Task 3",
        deadline: "2026-05-05",
        scheduledAt: 1500,
        priority: "p1",
        position: 0,
        updatedAt: 3000,
        createdAt: 1500,
      },
    ],
  ],
];

const extendedSections: [string, MobileTask[]][] = [
  ...sampleSections,
  [
    "2026-05-06",
    [
      {
        _id: "task4" as Id<"tasks">,
        title: "Task 4",
        deadline: "2026-05-06",
        scheduledAt: 1600,
        priority: "p2",
        position: 0,
        updatedAt: 4000,
        createdAt: 1600,
      },
    ],
  ],
  [
    "2026-05-07",
    [
      {
        _id: "task5" as Id<"tasks">,
        title: "Task 5",
        deadline: "2026-05-07",
        scheduledAt: 1700,
        priority: "p3",
        position: 0,
        updatedAt: 5000,
        createdAt: 1700,
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders loading skeleton when isLoading is true", () => {
    render(
      <TimelineScreen
        sections={[]}
        today="2026-05-04"
        tomorrow="2026-05-05"        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByTestId("skeleton-timeline")).toBeTruthy();
    expect(screen.queryByText("Today is clear.")).toBeNull();
  });

  it("shows empty state when no sections and not loading", () => {
    render(
      <TimelineScreen
        sections={[]}
        today="2026-05-04"
        tomorrow="2026-05-05"        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.getByText("Today is clear.")).toBeTruthy();
    expect(
      screen.getByText(
        "Upcoming work will appear here when it has a Deadline. Use Capture or Inbox to place the next task in time."
      )
    ).toBeTruthy();
  });

  it("renders date sections with headers and tasks", () => {
    render(
      <TimelineScreen
        sections={sampleSections}
        today="2026-05-04"
        tomorrow="2026-05-05"        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    // Should render section headers
    expect(screen.getByTestId("section-header-today").textContent).toContain("TODAY");
    expect(screen.getByTestId("section-header-other").textContent).toContain("TOMORROW");

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
        tomorrow="2026-05-05"        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
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
        tomorrow="2026-05-05"        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.queryByText("Today is clear.")).toBeNull();
    expect(screen.getByTestId("skeleton-timeline")).toBeTruthy();
  });

  it("collapses overdue into a tappable header and keeps it out of the list", () => {
    const onOpenOverdue = vi.fn();
    const overdueSections: [string, MobileTask[]][] = [
      [
        "2026-05-01",
        [
          {
            _id: "od1" as Id<"tasks">,
            title: "Late task",
            deadline: "2026-05-01",
            scheduledAt: 1,
            position: 0,
            updatedAt: 1,
            createdAt: 1,
          },
        ],
      ],
      ...sampleSections,
    ];

    render(
      <TimelineScreen
        sections={overdueSections}
        today="2026-05-04"
        tomorrow="2026-05-05"        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
        overdueCount={1}
        onOpenOverdue={onOpenOverdue}
      />
    );

    // The overdue task is not rendered inline...
    expect(screen.queryByTestId("task-od1")).toBeNull();
    // ...but the collapsed header is, and it opens the triage sheet on press.
    const header = screen.getByText("Overdue · 1");
    expect(header).toBeTruthy();
    header.click();
    expect(onOpenOverdue).toHaveBeenCalledTimes(1);
  });

  it("keeps overdue tasks visible inline when triage is unavailable", () => {
    const overdueSections: [string, MobileTask[]][] = [
      [
        "2026-05-01",
        [
          {
            _id: "od1" as Id<"tasks">,
            title: "Late task",
            deadline: "2026-05-01",
            scheduledAt: 1,
            position: 0,
            updatedAt: 1,
            createdAt: 1,
          },
        ],
      ],
      ...sampleSections,
    ];

    render(
      <TimelineScreen
        sections={overdueSections}
        today="2026-05-04"
        tomorrow="2026-05-05"        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
        overdueCount={1}
      />
    );

    expect(screen.getByTestId("task-od1")).toBeTruthy();
    expect(screen.queryByText("Overdue · 1")).toBeNull();
  });

  it("releases large timelines in small batches after the first paint", () => {
    vi.useFakeTimers();
    const tasks = Array.from({ length: 30 }, (_, index) => ({
      _id: `bulk-${index}` as Id<"tasks">,
      title: `Bulk task ${index}`,
      deadline: "2026-05-04",
      scheduledAt: index,
      priority: "p2" as const,
      position: index,
      updatedAt: index,
      createdAt: index,
    }));

    render(
      <TimelineScreen
        sections={[["2026-05-04", tasks]]}
        today="2026-05-04"
        tomorrow="2026-05-05"        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
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

  it("expands later sections so hidden tasks become reachable", () => {
    render(
      <TimelineScreen
        sections={extendedSections}
        today="2026-05-04"
        tomorrow="2026-05-05"
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.queryByTestId("task-task5")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show 1 later tasks/i }));

    expect(screen.getByTestId("task-task5")).toBeTruthy();
    expect(screen.queryByText("Later · 1 tasks")).toBeNull();
  });

  it("renders the compact list by default (no carousel)", () => {
    render(
      <TimelineScreen
        sections={sampleSections}
        today="2026-05-04"
        tomorrow="2026-05-05"
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
      />
    );

    expect(screen.queryByTestId("day-carousel")).toBeNull();
    expect(screen.getByTestId("task-task1")).toBeTruthy();
  });

  it("renders the day carousel in comfortable mode", () => {
    render(
      <TimelineScreen
        sections={sampleSections}
        today="2026-05-04"
        tomorrow="2026-05-05"
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
        layout="carousel"
      />
    );

    expect(screen.getByTestId("day-carousel").textContent).toBe("carousel:2");
    expect(screen.queryByTestId("task-task1")).toBeNull();
  });

  it("keeps the loading skeleton in carousel mode while data loads", () => {
    render(
      <TimelineScreen
        sections={[]}
        today="2026-05-04"
        tomorrow="2026-05-05"
        isLoading={true}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={mockOnRefresh}
        renderItem={mockRenderItem}
        layout="carousel"
      />
    );

    expect(screen.getByTestId("skeleton-timeline")).toBeTruthy();
    expect(screen.queryByTestId("day-carousel")).toBeNull();
  });
});
