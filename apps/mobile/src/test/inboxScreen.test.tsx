/** @vitest-environment happy-dom */
/**
 * InboxScreen tests
 *
 * Strategy: mock react-native primitives, the compact row, the quick-schedule
 * sheet, and the confirm hook, then test rendering states (loading, empty, with
 * tasks), filtering, quick-schedule, and multi-select complete.
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
      accessibilityState?: { expanded?: boolean; selected?: boolean };
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
        "aria-expanded": accessibilityState?.expanded,
        "aria-pressed": accessibilityState?.selected,
      },
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
  FadeInDown: { duration: () => ({ delay: () => undefined }) },
}));

// ─── react-native-svg mock ────────────────────────────────────────────────────
// The header's search glyph and empty-state icon draw with react-native-svg;
// the tests only need it to render inertly.
vi.mock("react-native-svg", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("svg", {}, children);
  return { __esModule: true, default: Stub, Svg: Stub, Path: Stub, Circle: Stub };
});

// ─── compact row mock ─────────────────────────────────────────────────────────
// Drive interactions through simple buttons keyed by task id.
vi.mock("../components/InboxTaskRow", () => ({
  InboxTaskRow: ({
    task,
    goalName,
    selectMode,
    selected,
    onPress,
    onLongPress,
    onToggleSelect,
    onSchedule,
  }: {
    task: { _id: string; title: string };
    goalName?: string;
    selectMode: boolean;
    selected: boolean;
    onPress: () => void;
    onLongPress: () => void;
    onToggleSelect: () => void;
    onSchedule: () => void;
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
        "row",
      ),
      React.createElement("button", { "aria-label": `long-${task._id}`, onClick: onLongPress }, "long"),
      React.createElement("button", { "aria-label": `sched-${task._id}`, onClick: onSchedule }, "sched"),
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
      ? React.createElement("button", { "aria-label": "quick-pick", onClick: () => onPick("2026-07-20") }, "pick")
      : null,
}));

// ─── confirm hook mock ────────────────────────────────────────────────────────
vi.mock("../hooks/useConfirm", () => ({ useConfirm: () => vi.fn(async () => true) }));

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
    textInverse: "#000",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xxl: 48, section: 32 },
  typography: { title: {}, headline: {}, bodyMd: {}, micro: {}, numeric: {} },
  radii: { sm: 4, md: 8, lg: 12, xl: 16, full: 999 },
  fonts: { sans: "sans", sansSemibold: "sans-semibold" },
}));

// The real header animates with Reanimated hooks the mock above doesn't
// provide; the inbox tests only care that a header row renders per bucket.
vi.mock("../components/TimelineSectionHeader", () => ({
  TimelineSectionHeader: ({ label, count }: { label: string; count?: number }) =>
    React.createElement("div", {}, count === undefined ? label : `${label} ${count}`),
}));

// ─── LoadingSkeleton mock ─────────────────────────────────────────────────────
vi.mock("../components/LoadingSkeleton", () => ({
  TaskListSkeleton: ({ variant }: { variant: string }) =>
    React.createElement("div", { "data-testid": `skeleton-${variant}` }),
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
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

const mockOnRefresh = vi.fn(async () => undefined);
const mockOnCapture = vi.fn();
const mockOnEditTask = vi.fn();
const mockOnScheduleToDate = vi.fn();
const mockOnMarkManyDone = vi.fn(async () => true);

function renderInbox(overrides: Partial<React.ComponentProps<typeof InboxScreen>> = {}) {
  return render(
    <InboxScreen
      tasks={sampleTasks}
      isLoading={false}
      isRefreshing={false}
      tabBarHeight={60}
      onRefresh={mockOnRefresh}
      onCapture={mockOnCapture}
      onEditTask={mockOnEditTask}
      onScheduleToDate={mockOnScheduleToDate}
      onMarkManyDone={mockOnMarkManyDone}
      canAct
      {...overrides}
    />
  );
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("InboxScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders loading skeleton when isLoading is true", () => {
    renderInbox({ tasks: [], isLoading: true });

    expect(screen.getByTestId("skeleton-inbox")).toBeTruthy();
    expect(screen.queryByText("Everything has a place.")).toBeNull();
  });

  it("shows empty state when no tasks and not loading", () => {
    renderInbox({ tasks: [] });

    expect(screen.getByText("Everything has a place.")).toBeTruthy();
    expect(screen.getByText("Capture new loose work when it appears.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /capture a task/i })).toBeTruthy();
  });

  it("renders a compact row per task with its linked goal", () => {
    renderInbox();

    expect(screen.getByTestId("task-task1")).toBeTruthy();
    expect(screen.getByTestId("task-task2")).toBeTruthy();
    expect(screen.getByText("Task 1")).toBeTruthy();
    expect(screen.getByText("Task 2")).toBeTruthy();
    // task1 is linked to Blog; task2 is unlinked.
    expect(screen.getByTestId("goal-task1").textContent).toBe("Blog");
    expect(screen.queryByTestId("goal-task2")).toBeNull();
  });

  it("opens the editor when a row body is tapped", () => {
    renderInbox();

    fireEvent.click(screen.getByRole("button", { name: "row-task1" }));

    expect(mockOnEditTask).toHaveBeenCalledTimes(1);
    expect(mockOnEditTask.mock.calls[0][0]._id).toBe("task1");
  });

  it("schedules a task through the quick-schedule sheet", () => {
    renderInbox();

    // No sheet until a schedule icon is pressed.
    expect(screen.queryByRole("button", { name: "quick-pick" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "sched-task1" }));
    fireEvent.click(screen.getByRole("button", { name: "quick-pick" }));

    expect(mockOnScheduleToDate).toHaveBeenCalledWith("task1", "2026-07-20");
  });

  it("calls onCapture when capture button is pressed", () => {
    renderInbox({ tasks: [] });

    fireEvent.click(screen.getByRole("button", { name: /capture a task/i }));

    expect(mockOnCapture).toHaveBeenCalledTimes(1);
  });

  it("does not show empty state when loading", () => {
    renderInbox({ tasks: [], isLoading: true });

    expect(screen.queryByText("Everything has a place.")).toBeNull();
    expect(screen.getByTestId("skeleton-inbox")).toBeTruthy();
  });

  it("enters select mode on long-press and bulk-completes with confirm", async () => {
    renderInbox();

    // Long-press task1 → select mode with task1 selected.
    fireEvent.click(screen.getByRole("button", { name: "long-task1" }));
    expect(screen.getByTestId("selected-task1")).toBeTruthy();

    // In select mode, tapping task2's row toggles it into the selection.
    fireEvent.click(screen.getByRole("button", { name: "row-task2" }));
    expect(screen.getByTestId("selected-task2")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /mark 2 tasks as done/i }));
    });

    expect(mockOnMarkManyDone).toHaveBeenCalledTimes(1);
    expect(mockOnMarkManyDone).toHaveBeenCalledWith(["task1", "task2"]);
  });

  it("filters to tasks linked to the selected goal", () => {
    renderInbox();

    // Open the goal dropdown, then pick "Blog".
    fireEvent.click(screen.getByRole("button", { name: /goal filter/i }));
    fireEvent.click(screen.getByRole("button", { name: "Blog" }));

    // task1 is linked to Blog; task2 (unlinked) is filtered out.
    expect(screen.getByTestId("task-task1")).toBeTruthy();
    expect(screen.queryByTestId("task-task2")).toBeNull();
  });

  it("exposes expanded state for the goal disclosure", () => {
    renderInbox();

    const goals = screen.getByRole("button", { name: /goal filter/i });
    expect(goals.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(goals);
    expect(goals.getAttribute("aria-expanded")).toBe("true");
  });

  it("filters to unlinked tasks with the No goal option", () => {
    renderInbox();

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

    renderInbox({ tasks });

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
