/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

let reducedMotion = false;
const { withTimingMock } = vi.hoisted(() => ({
  withTimingMock: vi.fn(
    (value: number, _config?: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    }
  ),
}));

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
      style: _,
      hitSlop: __,
      accessibilityLabel,
      accessibilityRole,
      accessibilityState,
      accessibilityHint: ___,
      accessibilityActions,
      onAccessibilityAction: _____,
      onLongPress: ______,
      delayLongPress: _______,
      ...safe
    } = rest as {
      onPress?: (event: { stopPropagation: () => void }) => void;
      hitSlop?: unknown;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { checked?: boolean };
      accessibilityHint?: string;
      accessibilityActions?: Array<{ name: string; label: string }>;
      onAccessibilityAction?: unknown;
      onLongPress?: unknown;
      delayLongPress?: unknown;
    } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "div",
      {
        ...safe,
        onClick: () => onPress?.({ stopPropagation: () => undefined }),
        role: accessibilityRole,
        tabIndex: 0,
        "aria-label": accessibilityLabel,
        "aria-checked":
          typeof accessibilityState?.checked === "boolean"
            ? String(accessibilityState.checked)
            : undefined,
        "data-accessibility-actions": accessibilityActions
          ? JSON.stringify(accessibilityActions)
          : undefined,
      },
      resolved
    );
  };
  const StyleSheet = {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    hairlineWidth: 1,
  };
  return { View, Text, Pressable, StyleSheet };
});

vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  default: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
}));

vi.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
    Text: ({ children }: { children?: React.ReactNode }) => React.createElement("span", {}, children),
  },
  Easing: { bezier: () => "bezier" },
  interpolate: () => 0,
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withTiming: withTimingMock,
}));

vi.mock("../theme/tokens", () => ({
  colors: {
    bgCard: "#111",
    bgFloating: "#222",
    border: "#333",
    borderSubtle: "#444",
    accent: "#06f",
    accentSoft: "#99c2ff",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textMuted: "#999",
    textCompleted: "#777",
    textInverse: "#000",
    bgInput: "#222",
    bgSurface: "#181818",
    success: "#0a0",
    deadline: "#b65",
    priorityP1: "#f00",
    priorityP2: "#fa0",
    priorityP3: "#ff0",
    primary: "#06f",
    primaryInk: "#fff",
    error: "#f44",
  },
  fonts: { mono: "monospace" },
  motion: {
    duration: { deliberate: 300, fast: 120 },
    easing: { outQuart: [0.25, 1, 0.5, 1] },
  },
  radii: { lg: 12, full: 999 },
  shadow: { sm: {} },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  typography: { title: {}, bodyMd: {}, micro: {} },
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => reducedMotion,
}));

vi.mock("../hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({
    prefs: {
      density: "cozy",
      taskColorScheme: "purple",
    },
  }),
}));

import { TaskCard, type MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

function makeTask(overrides: Partial<MobileTask> = {}): MobileTask {
  return {
    _id: "task1" as Id<"tasks">,
    title: "Ship redesign",
    scheduledAt: 1000,
    position: 0,
    updatedAt: 1000,
    createdAt: 1000,
    ...overrides,
  };
}

describe("TaskCard", () => {
  beforeEach(() => {
    reducedMotion = false;
    withTimingMock.mockClear();
  });

  it("uses checkbox semantics for completion controls", () => {
    const { rerender } = render(
      <TaskCard
        task={makeTask()}
        onDone={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(
      screen.getByRole("checkbox", { name: "Mark Ship redesign complete" }).getAttribute("aria-checked")
    ).toBe("false");

    rerender(
      <TaskCard
        task={makeTask({ completedAt: 2000 })}
        onDone={vi.fn()}
        onReopen={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(
      screen.getByRole("checkbox", { name: "Mark Ship redesign incomplete" }).getAttribute("aria-checked")
    ).toBe("true");
  });

  it("suppresses the completion sweep when reduced motion is enabled in app settings", () => {
    const { rerender } = render(
      <TaskCard
        task={makeTask()}
        onDone={vi.fn()}
        onReopen={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    reducedMotion = true;
    withTimingMock.mockClear();

    rerender(
      <TaskCard
        task={makeTask({ completedAt: 2000 })}
        onDone={vi.fn()}
        onReopen={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(withTimingMock).not.toHaveBeenCalled();
  });

  it("only advertises accessibility actions with available handlers", () => {
    const { rerender } = render(
      <TaskCard
        task={makeTask()}
        onDone={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    const row = screen.getByRole("button", { name: "Ship redesign" });
    expect(row.getAttribute("data-accessibility-actions")).toBe(
      JSON.stringify([
        { name: "activate", label: "Edit task" },
        { name: "complete", label: "Mark done" },
      ])
    );

    rerender(
      <TaskCard
        task={makeTask()}
        onDone={vi.fn()}
        onMoveToday={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(row.getAttribute("data-accessibility-actions")).toContain("move_today");
  });
});
