/** @vitest-environment happy-dom */
/**
 * TimelineScreen tests
 *
 * Strategy: mock react-native primitives, the compact row, the quick-schedule
 * sheet, and the confirm hook, then test rendering of date-grouped sections,
 * empty/loading states, the overdue header, and the select-mode bulk actions
 * (mark done / reschedule).
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const {
      onPress,
      disabled,
      style: _,
      hitSlop: __,
      accessibilityLabel,
      accessibilityRole: ___,
      accessibilityState,
      ...safe
    } = rest as {
      onPress?: () => void;
      disabled?: boolean;
      hitSlop?: unknown;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { selected?: boolean };
    } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      {
        ...safe,
        onClick: disabled ? undefined : onPress,
        disabled,
        type: "button",
        "aria-label": accessibilityLabel,
        "aria-pressed": accessibilityState?.selected,
      },
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
  FadeInDown: { duration: () => ({ delay: () => undefined }) },
  withDelay: (_delay: number, value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#06f",
    accentSoft: "#06f3",
    bg: "#000",
    bgCard: "#111",
    bgSurface: "#151515",
    bgFloating: "#181818",
    border: "#222",
    borderSubtle: "#1a1a1a",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textMuted: "#888",
    textInverse: "#000",
  },
  radii: { sm: 4, md: 8, lg: 12, xl: 16, full: 999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xxl: 48, section: 32 },
  typography: { title: {}, headline: {}, bodyMd: {}, micro: {} },
}));

// ─── UiIcons mock ─────────────────────────────────────────────────────────────
vi.mock("../components/UiIcons", () => ({
  CalendarIcon: () => React.createElement("span", { "data-testid": "icon-calendar" }),
  CheckIcon: () => React.createElement("span", { "data-testid": "icon-check" }),
  CloseIcon: () => React.createElement("span", { "data-testid": "icon-close" }),
}));

// ─── compact row mock ─────────────────────────────────────────────────────────
// Drive interactions through simple buttons keyed by task id.
vi.mock("../components/TimelineTaskRow", () => ({
  TimelineTaskRow: ({
    task,
    goalName,
    selectMode,
    selected,
    onPress,
    onLongPress,
    onToggleSelect,
    onComplete,
  }: {
    task: { _id: string; title: string };
    goalName?: string;
    selectMode: boolean;
    selected: boolean;
    onPress: () => void;
    onLongPress: () => void;
    onToggleSelect: () => void;
    onComplete?: () => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": `task-${task._id}` },
      React.createElement("span", {}, task.title),
      goalName ? React.createElement("span", { "data-testid": `goal-${task._id}` }, goalName) : null,
      selected ? React.createElement("span", { "data-testid": `selected-${task._id}` }) : null,
      React.createElement(
        "button",
        { "aria-label": `row-${task._id}`, onClick: selectMode ? onToggleSelect : onPress },
        "row"
      ),
      React.createElement(
        "button",
        { "aria-label": `long-${task._id}`, onClick: onLongPress },
        "long"
      ),
      onComplete
        ? React.createElement(
            "button",
            { "aria-label": `complete-${task._id}`, onClick: onComplete },
            "done"
          )
        : null
    ),
}));

// ─── quick-schedule sheet mock ────────────────────────────────────────────────
vi.mock("../components/QuickScheduleSheet", () => ({
  QuickScheduleSheet: ({
    visible,
    onPick,
  }: {
    visible: boolean;
    onPick: (iso: string) => void;
  }) =>
    visible
      ? React.createElement(
          "button",
          { "aria-label": "quick-pick", onClick: () => onPick("2026-05-09") },
          "pick"
        )
      : null,
}));

// ─── confirm hook mock ────────────────────────────────────────────────────────
vi.mock("../hooks/useConfirm", () => ({ useConfirm: () => vi.fn(async () => true) }));

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
  const mockOnRefresh = vi.fn(async () => undefined);

  const baseProps = {
    today: "2026-05-04",
    tomorrow: "2026-05-05",
    isLoading: false,
    isRefreshing: false,
    tabBarHeight: 60,
    onRefresh: mockOnRefresh,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders loading skeleton when isLoading is true", () => {
    render(<TimelineScreen {...baseProps} sections={[]} isLoading={true} />);

    expect(screen.getByTestId("skeleton-timeline")).toBeTruthy();
    expect(screen.queryByText("Today is clear.")).toBeNull();
  });

  it("shows empty state when no sections and not loading", () => {
    render(<TimelineScreen {...baseProps} sections={[]} />);

    expect(screen.getByText("Today is clear.")).toBeTruthy();
    expect(
      screen.getByText(
        "Upcoming work will appear here when it has a Deadline. Use Capture or Inbox to place the next task in time."
      )
    ).toBeTruthy();
  });

  it("renders date sections with headers, tasks, and goal names", () => {
    render(
      <TimelineScreen
        {...baseProps}
        sections={sampleSections}
        getGoalName={(taskId) => (taskId === "task1" ? "Blog" : undefined)}
      />
    );

    expect(screen.getByTestId("section-header-today").textContent).toContain("TODAY");
    expect(screen.getByTestId("section-header-other").textContent).toContain("TOMORROW");

    expect(screen.getByTestId("task-task1")).toBeTruthy();
    expect(screen.getByTestId("task-task2")).toBeTruthy();
    expect(screen.getByTestId("task-task3")).toBeTruthy();

    expect(screen.getByTestId("goal-task1").textContent).toBe("Blog");
    expect(screen.queryByTestId("goal-task2")).toBeNull();
  });

  it("opens the editor from a row tap and completes from the row check", () => {
    const onEditTask = vi.fn();
    const onCompleteTask = vi.fn();
    render(
      <TimelineScreen
        {...baseProps}
        sections={sampleSections}
        onEditTask={onEditTask}
        onCompleteTask={onCompleteTask}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "row-task1" }));
    expect(onEditTask).toHaveBeenCalledWith(expect.objectContaining({ _id: "task1" }));

    fireEvent.click(screen.getByRole("button", { name: "complete-task2" }));
    expect(onCompleteTask).toHaveBeenCalledWith("task2");
  });

  it("does not show empty state when loading", () => {
    render(<TimelineScreen {...baseProps} sections={[]} isLoading={true} />);

    expect(screen.queryByText("Today is clear.")).toBeNull();
    expect(screen.getByTestId("skeleton-timeline")).toBeTruthy();
  });

  it("keeps overdue tasks visible inline when triage actions are available", () => {
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
        {...baseProps}
        sections={overdueSections}
        overdueCount={1}
        onTriageOverdue={vi.fn()}
      />
    );

    expect(screen.getByTestId("task-od1")).toBeTruthy();
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

    render(<TimelineScreen {...baseProps} sections={overdueSections} overdueCount={1} />);

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

    render(<TimelineScreen {...baseProps} sections={[["2026-05-04", tasks]]} />);

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
    render(<TimelineScreen {...baseProps} sections={extendedSections} />);

    expect(screen.queryByTestId("task-task5")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show 1 later tasks/i }));

    expect(screen.getByTestId("task-task5")).toBeTruthy();
    expect(screen.queryByText("Later · 1 tasks")).toBeNull();
  });

  it("renders the compact list by default (no carousel)", () => {
    render(<TimelineScreen {...baseProps} sections={sampleSections} />);

    expect(screen.queryByTestId("day-carousel")).toBeNull();
    expect(screen.getByTestId("task-task1")).toBeTruthy();
  });

  it("renders the day carousel in comfortable mode", () => {
    render(<TimelineScreen {...baseProps} sections={sampleSections} layout="carousel" />);

    expect(screen.getByTestId("day-carousel").textContent).toBe("carousel:2");
    expect(screen.queryByTestId("task-task1")).toBeNull();
  });

  it("keeps the loading skeleton in carousel mode while data loads", () => {
    render(
      <TimelineScreen {...baseProps} sections={[]} isLoading={true} layout="carousel" />
    );

    expect(screen.getByTestId("skeleton-timeline")).toBeTruthy();
    expect(screen.queryByTestId("day-carousel")).toBeNull();
  });

  it("enters select mode from a long-press and toggles selection on tap", () => {
    render(
      <TimelineScreen
        {...baseProps}
        sections={sampleSections}
        onMarkManyDone={vi.fn(async () => true)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "long-task1" }));

    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByTestId("selected-task1")).toBeTruthy();

    // Select-mode tap toggles another row on, then the first off.
    fireEvent.click(screen.getByRole("button", { name: "row-task2" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "row-task1" }));
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.queryByTestId("selected-task1")).toBeNull();
  });

  it("stays out of select mode when no bulk actions are available", () => {
    render(<TimelineScreen {...baseProps} sections={sampleSections} />);

    fireEvent.click(screen.getByRole("button", { name: "long-task1" }));

    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("marks the selection done through the confirm and exits select mode", async () => {
    const onMarkManyDone = vi.fn(async () => true);
    render(
      <TimelineScreen
        {...baseProps}
        sections={sampleSections}
        onMarkManyDone={onMarkManyDone}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "long-task1" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("3 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Mark 3 tasks as done" }));

    await waitFor(() => {
      expect(onMarkManyDone).toHaveBeenCalledWith(["task1", "task2", "task3"]);
      expect(screen.queryByText("3 selected")).toBeNull();
    });
  });

  it("reschedules the selection through the quick-schedule sheet", async () => {
    const onScheduleMany = vi.fn(async () => true);
    render(
      <TimelineScreen
        {...baseProps}
        sections={sampleSections}
        onScheduleMany={onScheduleMany}
        onMarkManyDone={vi.fn(async () => true)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "long-task1" }));
    fireEvent.click(screen.getByRole("button", { name: "row-task3" }));
    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reschedule 2 tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "quick-pick" }));

    await waitFor(() => {
      expect(onScheduleMany).toHaveBeenCalledWith(["task1", "task3"], "2026-05-09");
      expect(screen.queryByText("2 selected")).toBeNull();
    });
  });

  it("shows the select bar while overdue tasks remain inline", () => {
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
        {...baseProps}
        sections={overdueSections}
        overdueCount={1}
        onTriageOverdue={vi.fn()}
        onMarkManyDone={vi.fn(async () => true)}
      />
    );

    expect(screen.getByTestId("task-od1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "long-task1" }));

    expect(screen.getByText("1 selected")).toBeTruthy();
  });
});
