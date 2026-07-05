/** @vitest-environment happy-dom */
/**
 * TimelineDayCarousel tests
 *
 * Covers the carousel-specific behavior the PRD calls out: overdue card
 * leftmost with the Review door, slim rows completing via the checkbox (no
 * swipe wrapper exists in this layout at all), and the Day-clear hold — a
 * locally emptied card stays rendered with its checked rows so unchecking
 * is possible until the user swipes away.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── react-native mock ────────────────────────────────────────────────────────
vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const View = ({ children, ...rest }: AnyProps) => {
    const { style: _, pointerEvents: __, ...safe } = rest;
    return React.createElement("div", safe, children);
  };
  const Text = ({ children, ...rest }: AnyProps) => {
    const { style: _, numberOfLines: __, ellipsizeMode: ___, ...safe } = rest;
    return React.createElement("span", safe, children);
  };
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const {
      onPress,
      style: _,
      hitSlop: __,
      accessibilityLabel,
      accessibilityRole,
      accessibilityState,
      accessibilityHint: ___,
      disabled,
      ...safe
    } = rest as {
      onPress?: (event: unknown) => void;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { checked?: boolean };
      disabled?: boolean;
    } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      {
        ...safe,
        onClick: onPress,
        type: "button",
        disabled,
        role: accessibilityRole === "checkbox" ? "checkbox" : "button",
        "aria-label": accessibilityLabel,
        "aria-checked": accessibilityState?.checked,
      },
      resolved,
    );
  };
  const StyleSheet = { create: (s: Record<string, unknown>) => s, hairlineWidth: 1 };
  const RefreshControl = () => React.createElement("div", { "data-testid": "refresh-control" });
  const FlatList = ({
    data,
    renderItem,
    keyExtractor,
    ListHeaderComponent,
  }: {
    data: unknown[];
    renderItem: (params: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListHeaderComponent?: React.ReactNode;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "div",
      {},
      ListHeaderComponent,
      data.map((item, index) =>
        React.createElement(
          "div",
          { key: keyExtractor(item) },
          renderItem({ item, index })
        )
      )
    );
  const useWindowDimensions = () => ({ width: 400, height: 800 });
  return { View, Text, Pressable, StyleSheet, RefreshControl, FlatList, useWindowDimensions };
});

// ─── react-native-reanimated mock ─────────────────────────────────────────────
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", {}, children),
  },
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
}));

// ─── react-native-svg mock ────────────────────────────────────────────────────
vi.mock("react-native-svg", () => {
  const Svg = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("svg", {}, children);
  const Shape = () => React.createElement("g");
  return { default: Svg, Circle: Shape, Line: Shape, Path: Shape, Rect: Shape };
});

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: new Proxy({}, { get: () => "#000" }),
  fonts: { sans: "sans", sansSemibold: "sans-sb", mono: "mono" },
  radii: { sm: 6, md: 8, lg: 10, xl: 16, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32, rowY: 12 },
  typography: { micro: {}, bodyMd: {}, numeric: {}, title: {} },
  shadow: { sm: {} },
  motion: { duration: { fast: 200 } },
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

vi.mock("../hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({
    prefs: { density: "cozy", taskColorScheme: "purple" },
    ready: true,
    setPreference: vi.fn(),
  }),
}));

import { TimelineDayCarousel } from "../components/TimelineDayCarousel";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

const TODAY = "2026-07-05";
const TOMORROW = "2026-07-06";

function task(id: string, deadline: string, title = `Task ${id}`): MobileTask {
  return {
    _id: id as Id<"tasks">,
    title,
    deadline,
    scheduledAt: 0,
    position: 0,
    updatedAt: 0,
    createdAt: 0,
  };
}

function renderCarousel(
  sections: [string, MobileTask[]][],
  overrides: Partial<React.ComponentProps<typeof TimelineDayCarousel>> = {}
) {
  const props: React.ComponentProps<typeof TimelineDayCarousel> = {
    sections,
    today: TODAY,
    tomorrow: TOMORROW,
    isRefreshing: false,
    tabBarHeight: 60,
    onRefresh: vi.fn(async () => undefined),
    emptyComponent: React.createElement("div", { "data-testid": "empty-state" }),
    ...overrides,
  };
  return { ...render(<TimelineDayCarousel {...props} />), props };
}

describe("TimelineDayCarousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the overdue card first with the Review door", () => {
    const onOpenOverdue = vi.fn();
    renderCarousel(
      [
        ["2026-07-01", [task("od1", "2026-07-01")]],
        [TODAY, [task("t1", TODAY)]],
      ],
      { onOpenOverdue, overdueCount: 1 }
    );

    // Overdue collapses to a single muted card — its task rows never render.
    expect(screen.queryByText("Task od1")).toBeNull();
    const door = screen.getByRole("button", { name: "1 overdue. Open triage." });
    fireEvent.click(door);
    expect(onOpenOverdue).toHaveBeenCalledTimes(1);
    // The day card is still there behind it.
    expect(screen.getByText("Task t1")).toBeTruthy();
  });

  it("drops overdue silently when the triage door is unavailable", () => {
    renderCarousel([
      ["2026-07-01", [task("od1", "2026-07-01")]],
      [TODAY, [task("t1", TODAY)]],
    ]);
    expect(screen.queryByText(/overdue/i)).toBeNull();
    expect(screen.getByText("Task t1")).toBeTruthy();
  });

  it("completes a task from the slim row checkbox", () => {
    const onCompleteTask = vi.fn();
    renderCarousel([[TODAY, [task("t1", TODAY, "Write tests")]]], { onCompleteTask });

    fireEvent.click(screen.getByRole("checkbox", { name: "Mark Write tests complete" }));
    expect(onCompleteTask).toHaveBeenCalledWith("t1");
  });

  it("renders the description and goal meta lines on the row", () => {
    renderCarousel(
      [[TODAY, [{ ...task("t1", TODAY, "Write tests"), description: "Cover the axis rules." }]]],
      { getGoalName: () => "Ship carousel" }
    );

    expect(screen.getByText("Cover the axis rules.")).toBeTruthy();
    expect(screen.getByText(/Ship carousel/)).toBeTruthy();
  });

  it("opens the edit sheet when the row itself is tapped", () => {
    const onEditTask = vi.fn();
    renderCarousel([[TODAY, [task("t1", TODAY, "Write tests")]]], {
      onCompleteTask: vi.fn(),
      onEditTask,
    });

    fireEvent.click(screen.getByRole("button", { name: "Write tests" }));
    expect(onEditTask).toHaveBeenCalledWith(expect.objectContaining({ _id: "t1" }));
  });

  it("holds a locally emptied day as Day clear with uncheckable rows", () => {
    const onCompleteTask = vi.fn();
    const onReopenTask = vi.fn();
    const first = renderCarousel([[TODAY, [task("t1", TODAY, "Write tests")]]], {
      onCompleteTask,
      onReopenTask,
    });

    // Complete the only task, then live data drops the day entirely.
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark Write tests complete" }));
    first.rerender(
      <TimelineDayCarousel {...first.props} sections={[]} />
    );

    // The card stays on the axis in the Day-clear state...
    expect(screen.getByText("Day clear")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    // ...with the completed row still visible and uncheckable.
    const uncheck = screen.getByRole("checkbox", { name: "Mark Write tests incomplete" });
    expect(uncheck.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(uncheck);
    expect(onReopenTask).toHaveBeenCalledWith("t1");
  });

  it("shows Day clear without rows when remote changes empty the viewed day", () => {
    const first = renderCarousel([[TODAY, [task("t1", TODAY, "Write tests")]]], {
      onCompleteTask: vi.fn(),
    });

    first.rerender(<TimelineDayCarousel {...first.props} sections={[]} />);

    expect(screen.getByText("Day clear")).toBeTruthy();
    // Nothing was completed locally, so there is no row to uncheck.
    expect(screen.queryByText("Write tests")).toBeNull();
  });

  it("renders the shared empty state when there are no cards at all", () => {
    renderCarousel([]);
    expect(screen.getByTestId("empty-state")).toBeTruthy();
  });
});
