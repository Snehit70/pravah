/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const strip = (rest: AnyProps): AnyProps => {
    const out: AnyProps = {};
    for (const [key, value] of Object.entries(rest)) {
      if (
        key === "style" ||
        key === "hitSlop" ||
        key === "accessible" ||
        key === "onLayout"
      ) continue;
      if (key === "accessibilityLabel") out["aria-label"] = value;
      else if (key === "accessibilityRole") out.role = value;
      else if (key === "accessibilityState") {
        const state = value as { selected?: boolean } | undefined;
        if (state?.selected !== undefined) out["aria-pressed"] = state.selected;
      } else out[key] = value;
    }
    return out;
  };
  const View = ({ children, ...rest }: AnyProps) =>
    React.createElement("div", strip(rest), children);
  const Text = ({ children, ...rest }: AnyProps) =>
    React.createElement("span", strip(rest), children);
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const { onPress, ...safe } = strip(rest) as AnyProps & { onPress?: () => void };
    return React.createElement(
      "button",
      { ...safe, onClick: onPress },
      Object.prototype.toString.call(children) === "[object Function]"
        ? (children as unknown as (s: unknown) => React.ReactNode)({ pressed: false })
        : children,
    );
  };
  return {
    View,
    Text,
    Pressable,
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  };
});

vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", {}, children),
    Text: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("span", {}, children),
  },
  interpolateColor: () => "#000",
  useAnimatedStyle: (fn: () => object) => fn(),
  useSharedValue: (init: number) => {
    const shared = {
      value: init,
      set(value: number) {
        shared.value = value;
      },
    };
    return shared;
  },
  withSpring: (v: number) => v,
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

import { InlineSegmented } from "../components/InlineSegmented";

describe("InlineSegmented", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("renders all options", () => {
    render(<InlineSegmented options={options} value="a" onSelect={() => {}} />);
    expect(screen.getByText("Alpha")).toBeDefined();
    expect(screen.getByText("Beta")).toBeDefined();
    expect(screen.getByText("Gamma")).toBeDefined();
  });

  it("calls onSelect with the correct value on press", () => {
    const onSelect = vi.fn();
    render(<InlineSegmented options={options} value="a" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Beta"));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("marks the active option as selected", () => {
    render(<InlineSegmented options={options} value="b" onSelect={() => {}} />);
    const betaButton = screen.getByText("Beta").closest("button");
    expect(betaButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("marks inactive options as not selected", () => {
    render(<InlineSegmented options={options} value="b" onSelect={() => {}} />);
    const alphaButton = screen.getByText("Alpha").closest("button");
    expect(alphaButton?.getAttribute("aria-pressed")).toBe("false");
  });

  it("gives icon-only options an accessible label", () => {
    const iconOptions = [
      {
        value: "bars",
        accessibilityLabel: "Show as bars",
        Icon: () => React.createElement("svg"),
      },
      {
        value: "line",
        accessibilityLabel: "Show as a line",
        Icon: () => React.createElement("svg"),
      },
    ];
    render(<InlineSegmented options={iconOptions} value="bars" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Show as bars" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Show as a line" })).toBeDefined();
  });

  it("handles mixed label and icon-only options", () => {
    const mixedOptions = [
      { value: "text", label: "Text Only" },
      { value: "icon", Icon: () => React.createElement("svg") },
    ];
    render(<InlineSegmented options={mixedOptions} value="text" onSelect={() => {}} />);
    expect(screen.getByText("Text Only")).toBeDefined();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
  });
});
