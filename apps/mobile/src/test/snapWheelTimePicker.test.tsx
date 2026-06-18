/** @vitest-environment happy-dom */
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

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
      accessibilityRole: ___,
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
        "aria-label": accessibilityLabel,
        "aria-selected": accessibilityState?.selected,
      },
      resolved,
    );
  };
  const ScrollView = React.forwardRef(
    ({ children, ...rest }: AnyProps, ref: React.Ref<{ scrollTo: () => void }>) => {
      const { style: _, contentContainerStyle: __, ...safe } = rest;
      React.useImperativeHandle(ref, () => ({ scrollTo: vi.fn() }));
      return React.createElement("div", safe, children);
    },
  );
  const Modal = ({
    children,
    visible,
  }: {
    children?: React.ReactNode;
    visible?: boolean;
    [key: string]: unknown;
  }) => (visible ? React.createElement("div", { "data-testid": "modal" }, children) : null);
  return {
    View,
    Text,
    Pressable,
    ScrollView,
    Modal,
    StyleSheet: {
      create: <T,>(s: T) => s,
      hairlineWidth: 0.5,
      absoluteFill: {},
    },
  };
});

vi.mock("expo-blur", () => ({
  BlurView: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("div", { "data-testid": "blur-view" }, children),
}));

vi.mock("../lib/haptic", () => ({
  haptic: { light: vi.fn(), selection: vi.fn() },
}));

import {
  SnapWheelTimePicker,
} from "../components/SnapWheelTimePicker";
import { selectedIndexFromOffset } from "../lib/snapWheelTimePicker";

describe("SnapWheelTimePicker", () => {
  it("rounds scroll offsets to the selected index", () => {
    expect(selectedIndexFromOffset(0, 42)).toBe(0);
    expect(selectedIndexFromOffset(20, 42)).toBe(0);
    expect(selectedIndexFromOffset(22, 42)).toBe(1);
    expect(selectedIndexFromOffset(84, 42)).toBe(2);
    expect(selectedIndexFromOffset(Number.NaN, 42)).toBe(0);
  });

  it("confirms HH:MM values and has no Clear affordance", () => {
    const onConfirm = vi.fn();
    render(
      <SnapWheelTimePicker
        visible
        title="Morning digest"
        value="07:05"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("Clear")).toBeNull();
    fireEvent.click(screen.getByLabelText("Hour 8 AM"));
    fireEvent.click(screen.getByLabelText("Minute :17"));
    fireEvent.click(screen.getByLabelText("Confirm time"));

    expect(onConfirm).toHaveBeenCalledWith("08:17");
  });
});
