/** @vitest-environment happy-dom */
/**
 * TimelineLayoutToggle tests: the header toggle shows the glyph of the layout
 * you'd switch TO, and writes the persisted `timelineLayout` preference.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const { onPress, style: _, hitSlop: __, accessibilityLabel, accessibilityRole: ___, ...safe } =
      rest as { onPress?: () => void; accessibilityLabel?: string } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      { ...safe, onClick: onPress, type: "button", "aria-label": accessibilityLabel },
      resolved,
    );
  };
  const StyleSheet = { create: (s: Record<string, unknown>) => s, hairlineWidth: 1 };
  return { Pressable, StyleSheet };
});

vi.mock("react-native-svg", () => {
  const Svg = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("svg", {}, children);
  const Shape = () => React.createElement("g");
  return { default: Svg, Line: Shape, Rect: Shape };
});

vi.mock("../theme/tokens", () => ({
  colors: { textMuted: "#666" },
  spacing: { xs: 4 },
}));

const setPreference = vi.fn();
let timelineLayout: "list" | "carousel" = "list";
vi.mock("../hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({
    prefs: { timelineLayout },
    ready: true,
    setPreference,
  }),
}));

import { TimelineLayoutToggle } from "../components/TimelineLayoutToggle";

describe("TimelineLayoutToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    timelineLayout = "list";
  });

  it("offers day cards from list mode and persists the switch", () => {
    render(<TimelineLayoutToggle />);
    const toggle = screen.getByRole("button", { name: "Switch to day cards" });
    fireEvent.click(toggle);
    expect(setPreference).toHaveBeenCalledWith("timelineLayout", "carousel");
  });

  it("offers the list from carousel mode and persists the switch back", () => {
    timelineLayout = "carousel";
    render(<TimelineLayoutToggle />);
    const toggle = screen.getByRole("button", { name: "Switch to list" });
    fireEvent.click(toggle);
    expect(setPreference).toHaveBeenCalledWith("timelineLayout", "list");
  });
});
