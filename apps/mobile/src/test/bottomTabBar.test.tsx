/** @vitest-environment happy-dom */
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const View = ({ children, ...rest }: AnyProps) => {
    const { style: _, ...safe } = rest;
    return React.createElement("div", safe, children);
  };
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const {
      onPress,
      style: _,
      hitSlop: __,
      accessibilityLabel,
      accessibilityRole,
      accessibilityState,
      disabled,
      ...safe
    } = rest as {
      onPress?: () => void;
      hitSlop?: unknown;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { selected?: boolean };
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
        role: accessibilityRole === "tab" ? "tab" : "button",
        "aria-label": accessibilityLabel,
        "aria-selected": accessibilityState?.selected,
      },
      resolved,
    );
  };
  const StyleSheet = {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    hairlineWidth: 1,
  };
  return { View, Pressable, StyleSheet };
});

vi.mock("react-native-reanimated", () => {
  const AnimatedView = ({ children, ...rest }: { children?: React.ReactNode; style?: unknown }) => {
    const { style: _, ...safe } = rest;
    return React.createElement("div", safe, children);
  };
  return {
    default: {
      View: AnimatedView,
      createAnimatedComponent: (Component: React.ComponentType<Record<string, unknown>>) => Component,
    },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({
      value,
      set(next: number) {
        this.value = next;
      },
    }),
    withSequence: (...values: unknown[]) => values.at(-1),
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
  };
});

vi.mock("react-native-svg", () => {
  const Svg = ({ children }: { children?: React.ReactNode }) => React.createElement("svg", {}, children);
  const Shape = () => React.createElement("span");
  return { default: Svg, Circle: Shape, Line: Shape, Path: Shape };
});

vi.mock("../lib/haptic", () => ({
  haptic: { light: vi.fn(), medium: vi.fn() },
}));

import { BottomTabBar } from "../components/BottomTabBar";

describe("BottomTabBar", () => {
  it("renders the saved tab order around the fixed Capture slot", () => {
    const { container } = render(
      <BottomTabBar
        active="inbox"
        onChange={vi.fn()}
        onCapture={vi.fn()}
        tabOrder={["insights", "inbox", "goals", "timeline"]}
      />,
    );

    const labels = Array.from(container.querySelectorAll("button")).map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Progress",
      "Inbox",
      "Capture a new task",
      "Goals",
      "Timeline",
    ]);
  });

  it("marks the active tab as selected and calls onChange for inactive tabs", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <BottomTabBar active="inbox" onChange={onChange} onCapture={vi.fn()} />,
    );

    expect(getByRole("tab", { name: "Inbox" }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tab", { name: "Progress" }).getAttribute("aria-selected")).toBe("false");

    fireEvent.click(getByRole("tab", { name: "Progress" }));
    expect(onChange).toHaveBeenCalledWith("insights");
  });

  it("fires the capture action from the fixed center button", () => {
    const onCapture = vi.fn();
    const { getByRole } = render(
      <BottomTabBar active="inbox" onChange={vi.fn()} onCapture={onCapture} />,
    );

    fireEvent.click(getByRole("button", { name: "Capture a new task" }));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });
});
