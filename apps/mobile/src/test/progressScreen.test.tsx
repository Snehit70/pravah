/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  // react-native-web maps accessibility* onto ARIA. Model that here: without it
  // the seam silently swallows every View/Text label, so a chart's
  // accessibilityLabel — often the only text describing it — is untestable.
  const ROLE: Record<string, string> = { image: "img", header: "heading" };
  const passthrough = (tag: string) => ({ children, ...rest }: AnyProps) => {
    const {
      style: _,
      accessible: __,
      importantForAccessibility: ___,
      accessibilityLabel,
      accessibilityRole,
      ...safe
    } = rest as AnyProps & { accessibilityLabel?: string; accessibilityRole?: string };
    return React.createElement(
      tag,
      {
        ...safe,
        ...(accessibilityLabel ? { "aria-label": accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: ROLE[accessibilityRole] ?? accessibilityRole } : {}),
      },
      children,
    );
  };
  const View = passthrough("div");
  const Text = passthrough("span");
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const {
      onPress,
      style: _,
      hitSlop: __,
      accessibilityLabel,
      accessibilityRole: ___,
      accessibilityState,
      ...safe
    } = rest as AnyProps & {
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityState?: { selected?: boolean };
    };
    const resolved =
      typeof children === "function"
        ? (children as (state: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      {
        ...safe,
        type: "button",
        onClick: onPress,
        "aria-label": accessibilityLabel,
        "aria-pressed": accessibilityState?.selected,
      },
      resolved,
    );
  };
  const ScrollView = ({ children }: AnyProps) => React.createElement("div", {}, children);
  const Modal = ({ visible, children }: AnyProps & { visible?: boolean }) =>
    visible ? React.createElement("div", { "data-testid": "history-modal" }, children) : null;
  const TextInput = ({
    value,
    onChangeText,
    placeholder,
  }: AnyProps & {
    value?: string;
    onChangeText?: (value: string) => void;
    placeholder?: string;
  }) =>
    React.createElement("input", {
      value: value ?? "",
      placeholder,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onChangeText?.(event.target.value),
    });
  const FlatList = ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
  }: {
    data: unknown[];
    renderItem: (args: { item: unknown }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListEmptyComponent?: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      {},
      data.length
        ? data.map((item) =>
            React.createElement("div", { key: keyExtractor(item) }, renderItem({ item })),
          )
        : ListEmptyComponent,
    );
  const RefreshControl = () => null;
  const StyleSheet = {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    hairlineWidth: 1,
    absoluteFill: {},
  };
  return { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View };
});

// Charts pull in the native SVG + animation stack; stub them to inert nodes so
// the screen renders in happy-dom. We assert the screen's structure and the
// history flow, not the pixels (chart math is covered by chartGeometry tests).
vi.mock("react-native-svg", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", {}, children);
  return { default: Stub, Svg: Stub, Path: Stub, Rect: Stub, G: Stub, Defs: Stub, LinearGradient: Stub, Stop: Stub, Line: Stub, Circle: Stub, Text: Stub };
});

vi.mock("react-native-reanimated", () => {
  const animated = (tag: string) => ({ children, ...rest }: { children?: React.ReactNode }) => {
    const { entering: _, style: __, ...safe } = rest as Record<string, unknown>;
    return React.createElement(tag, safe, children);
  };
  const View = animated("div");
  const identity = (v: unknown) => v;
  const chain = () => {
    const o = { duration: () => o, delay: () => o };
    return o;
  };
  return {
    // Text is here because the Rhythm peak label is an Animated.Text; without it
    // the first test to render a peak would die on an undefined element type.
    default: { View, Text: animated("span"), createAnimatedComponent: identity },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedProps: () => ({}),
    useAnimatedStyle: () => ({}),
    // Null reads as "not mid-morph", so the charts render their static path.
    useDerivedValue: () => ({ value: null }),
    withTiming: identity,
    runOnJS: (fn: unknown) => fn,
    Easing: { out: () => identity, cubic: identity, inOut: () => identity, quad: identity },
    FadeIn: chain(),
    FadeInDown: chain(),
    FadeOut: chain(),
  };
});

// The hero chart attaches a Pan scrubber; stub gesture-handler to inert,
// chainable builders so the screen mounts without the native gesture stack.
vi.mock("react-native-gesture-handler", () => {
  const chainable = () => {
    const g: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of [
      "enabled",
      "activeOffsetX",
      "failOffsetY",
      "minDistance",
      "onBegin",
      "onStart",
      "onUpdate",
      "onEnd",
      "onFinalize",
    ]) {
      g[method] = () => g;
    }
    return g;
  };
  return {
    Gesture: { Pan: chainable, Tap: chainable },
    GestureDetector: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, {}, children),
  };
});

// Charts fire a haptic tick on scrub/cell-tap; stub it so importing the
// components doesn't pull in expo-haptics + the preferences store.
vi.mock("../lib/haptic", () => ({
  haptic: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    selection: vi.fn(),
  },
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => true, // reduced motion → components skip animation branches
}));

vi.mock("../hooks/useGoals", () => ({
  useGoals: () => ({ goals: [], isHydrated: true }),
  useGoalLinks: () => ({}),
}));

import type { Id } from "../../../../convex/_generated/dataModel";
import { InsightsScreen } from "../screens/InsightsScreen";
import type { MobileTask } from "../components/TaskCard";

function task(id: string, title: string, completedAt?: number): MobileTask {
  return {
    _id: id as Id<"tasks">,
    title,
    scheduledAt: 1,
    completedAt,
    position: 0,
    updatedAt: completedAt ?? 1,
    createdAt: 1,
  };
}

function renderScreen(completed: MobileTask[]) {
  return render(
    <InsightsScreen
      tasks={completed}
      completedTasks={completed}
      isLoading={false}
      isRefreshing={false}
      tabBarHeight={60}
      onRefresh={vi.fn(async () => undefined)}
      renderCompletedTaskItem={({ item }) => <span>{item.title}</span>}
    />,
  );
}

describe("Progress screen", () => {
  const completed = [
    task("one", "Ship redesign", Date.now()),
    task("two", "Write release notes", Date.now() - 1000),
  ];

  it("renders the analytics sections without legacy subtabs", () => {
    renderScreen(completed);
    expect(screen.getByText("Recent momentum")).toBeTruthy();
    expect(screen.getByText("Journey")).toBeTruthy();
    expect(screen.getByText("Rhythm")).toBeTruthy();
    // The inline "Recently completed" list was dropped in the redesign.
    expect(screen.queryByText("Recently completed")).toBeNull();
    expect(screen.queryByText("Insights")).toBeNull();
  });

  it("switches the momentum range", () => {
    renderScreen(completed);
    fireEvent.click(screen.getByRole("button", { name: /show last 7 days/i }));
    // The window is a rolling N days ending today, so the copy says so — it
    // used to claim "this week" while plotting the last 7 days.
    expect(screen.getByText("vs previous 7 days")).toBeTruthy();
  });

  it("names the momentum window as rolling, never as a calendar period", () => {
    renderScreen(completed);
    expect(screen.getByText("vs previous 30 days")).toBeTruthy();
    expect(screen.queryByText("this month")).toBeNull();
  });

  it("states the window for a screen reader, which cannot see the range pill", () => {
    // The visible eyebrow was dropped as the third restatement of "30 days" in
    // one card. Sighted users read the window off the pill; the hero's
    // accessibility summary is the only place left that spells it out.
    renderScreen(completed);
    expect(screen.getByLabelText(/tasks completed last 30 days/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /show last 7 days/i }));
    expect(screen.getByLabelText(/tasks completed last 7 days/i)).toBeTruthy();
  });

  it("toggles the rhythm metric between weekday and hour", () => {
    renderScreen(completed);
    // Both metrics live behind one full-width chart now, not side-by-side panels.
    fireEvent.click(screen.getByRole("button", { name: "Focus by hour" }));
    expect(
      screen.getByRole("button", { name: "Focus by hour" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "When you finish" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("toggles the rhythm chart shape independently of the metric", () => {
    renderScreen(completed);
    fireEvent.click(screen.getByRole("button", { name: /show as a line/i }));
    expect(
      screen.getByRole("button", { name: /show as a line/i }).getAttribute("aria-pressed"),
    ).toBe("true");

    // A chosen shape sticks across a metric switch; only the untouched default
    // is per-metric.
    fireEvent.click(screen.getByRole("button", { name: "Focus by hour" }));
    expect(
      screen.getByRole("button", { name: /show as a line/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("opens searchable full-screen completion history", () => {
    renderScreen(completed);
    fireEvent.click(screen.getByRole("button", { name: /view completion history/i }));
    expect(screen.getByText("Completion history")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search completed Tasks"), {
      target: { value: "release" },
    });
    expect(screen.getAllByText("Write release notes").length).toBeGreaterThan(0);
    // No inline recent list anymore, so a filtered-out task disappears entirely.
    expect(screen.queryByText("Ship redesign")).toBeNull();
  });
});
