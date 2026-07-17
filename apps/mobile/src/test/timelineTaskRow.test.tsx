/** @vitest-environment happy-dom */
/**
 * TimelineTaskRow tests
 *
 * Strategy: mock react-native primitives (nested Pressables stop propagation
 * like native presses do), render the real row, and test the title/time/goal
 * content plus the tap / long-press / select-mode / complete interactions.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      onLongPress,
      delayLongPress: _,
      style: __,
      hitSlop: ___,
      accessibilityLabel,
      accessibilityRole,
      accessibilityState,
      accessibilityHint: ____,
      ...safe
    } = rest as {
      onPress?: (event: { stopPropagation: () => void }) => void;
      onLongPress?: () => void;
      delayLongPress?: number;
      hitSlop?: unknown;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { checked?: boolean };
      accessibilityHint?: string;
    } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "div",
      {
        ...safe,
        role: accessibilityRole,
        tabIndex: 0,
        "aria-label": accessibilityLabel,
        "aria-checked":
          typeof accessibilityState?.checked === "boolean"
            ? String(accessibilityState.checked)
            : undefined,
        // Native nested Pressables consume the press; mirror that by stopping
        // DOM propagation so an inner tap never also fires the row.
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          onPress?.(event);
        },
        onContextMenu: onLongPress ? () => onLongPress() : undefined,
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

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#06f",
    accentSoft: "#06f3",
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
  spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
  typography: { title: {} },
  fonts: { sans: "sans", sansSemibold: "sans-semibold", mono: "mono" },
}));

// Import component after all mocks are set up.
import { TimelineTaskRow } from "../components/TimelineTaskRow";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

// ─── helpers ──────────────────────────────────────────────────────────────────

const task: MobileTask = {
  _id: "task1" as Id<"tasks">,
  title: "Java Quiz 1",
  deadline: "2026-05-04",
  time: "09:00",
  scheduledAt: 500,
  priority: "p1",
  position: 0,
  updatedAt: 1000,
  createdAt: 500,
};

describe("TimelineTaskRow", () => {
  const onPress = vi.fn();
  const onLongPress = vi.fn();
  const onToggleSelect = vi.fn();
  const onComplete = vi.fn();

  const baseProps = {
    task,
    selectMode: false,
    selected: false,
    onPress,
    onLongPress,
    onToggleSelect,
    onComplete,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title with the time and goal in the trailing group", () => {
    render(<TimelineTaskRow {...baseProps} goalName="Java" />);

    expect(screen.getByText("Java Quiz 1")).toBeTruthy();
    expect(screen.getByText("9:00 AM")).toBeTruthy();
    expect(screen.getByText("Java")).toBeTruthy();
  });

  it("omits time and goal when the task has neither", () => {
    render(<TimelineTaskRow {...baseProps} task={{ ...task, time: undefined }} />);

    expect(screen.queryByText("9:00 AM")).toBeNull();
    expect(screen.queryByText("◈ ")).toBeNull();
  });

  it("opens the editor on tap and enters selection on long-press", () => {
    render(<TimelineTaskRow {...baseProps} />);

    const row = screen.getByRole("button", { name: "Java Quiz 1" });
    fireEvent.click(row);
    expect(onPress).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(row);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it("completes from the trailing check without opening the editor", () => {
    render(<TimelineTaskRow {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark Java Quiz 1 done" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("hides the check when completing is unavailable", () => {
    render(<TimelineTaskRow {...baseProps} onComplete={undefined} />);

    expect(screen.queryByRole("button", { name: "Mark Java Quiz 1 done" })).toBeNull();
  });

  it("becomes a checkbox in select mode and toggles instead of opening", () => {
    render(<TimelineTaskRow {...baseProps} selectMode selected />);

    const row = screen.getByRole("checkbox", { name: "Java Quiz 1" });
    expect(row.getAttribute("aria-checked")).toBe("true");
    // The one-tap complete hides while selecting; done is a bulk-bar act.
    expect(screen.queryByRole("button", { name: "Mark Java Quiz 1 done" })).toBeNull();

    fireEvent.click(row);
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
