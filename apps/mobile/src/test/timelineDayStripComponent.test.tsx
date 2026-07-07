/** @vitest-environment happy-dom */
/**
 * TimelineDayStrip component: renders a tappable weekday cell per card-bearing
 * day, leaves empty days non-navigable, and surfaces the "back to today"
 * affordance only when the visible week isn't today's.
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
    const { style: _, ...safe } = rest;
    return React.createElement("span", safe, children);
  };
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const {
      onPress,
      style: _,
      accessibilityRole: __,
      accessibilityLabel,
      accessibilityState,
      disabled,
      ...safe
    } = rest as {
      onPress?: (event: unknown) => void;
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
        role: "button",
        "aria-label": accessibilityLabel,
        "aria-selected": accessibilityState?.selected,
      },
      resolved
    );
  };
  const StyleSheet = { create: (s: Record<string, unknown>) => s, hairlineWidth: 1 };
  const useWindowDimensions = () => ({ width: 400, height: 800 });
  return { View, Text, Pressable, StyleSheet, useWindowDimensions };
});

// ─── react-native-reanimated mock ─────────────────────────────────────────────
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children, ...rest }: { children?: React.ReactNode; [key: string]: unknown }) => {
      const { style: _, pointerEvents: __, ...safe } = rest;
      return React.createElement("div", safe, children);
    },
  },
  interpolate: () => 0,
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => {
    const sv = {
      value,
      get: () => sv.value,
      set: (next: number) => {
        sv.value = next;
      },
    };
    return sv;
  },
  withSequence: (...values: number[]) => values[values.length - 1],
  withTiming: (value: number) => value,
}));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: new Proxy({}, { get: () => "#000" }),
  fonts: { sans: "sans", sansSemibold: "sans-sb", mono: "mono" },
  radii: { sm: 4, md: 6, lg: 10, xl: 16, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32, rowY: 12 },
}));

import { TimelineDayStrip } from "../components/TimelineDayStrip";
import type { DayCarouselCard } from "../lib/timelineCarousel";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

const TODAY = "2026-07-05"; // Sunday

function dayCard(dateKey: string, count: number): DayCarouselCard {
  return {
    kind: "day",
    dateKey,
    tasks: Array.from({ length: count }, (_, i) => ({
      _id: `${dateKey}-${i}` as Id<"tasks">,
      title: "t",
      deadline: dateKey,
      scheduledAt: 0,
      position: 0,
      updatedAt: 0,
      createdAt: 0,
    })) as MobileTask[],
  };
}

function renderStrip(overrides: Partial<React.ComponentProps<typeof TimelineDayStrip>> = {}) {
  const onJumpToCard = vi.fn();
  const scrollX = { value: 0, get: () => 0, set: () => {} } as never;
  const props: React.ComponentProps<typeof TimelineDayStrip> = {
    cards: [dayCard(TODAY, 1), dayCard("2026-07-08", 1)],
    currentIndex: 0,
    today: TODAY,
    scrollX,
    interval: 340,
    landingIndex: 0,
    reducedMotion: true,
    onJumpToCard,
    ...overrides,
  };
  render(<TimelineDayStrip {...props} />);
  return { onJumpToCard };
}

describe("TimelineDayStrip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("jumps to a card-bearing day's card index when its cell is tapped", () => {
    const { onJumpToCard } = renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Jump to Sun · Jul 5" }));
    expect(onJumpToCard).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "Jump to Wed · Jul 8" }));
    expect(onJumpToCard).toHaveBeenCalledWith(1);
  });

  it("leaves empty days non-navigable", () => {
    renderStrip();
    // 2026-07-07 (Tuesday) has no card, so it exposes no jump target.
    expect(screen.queryByRole("button", { name: "Jump to Tue · Jul 7" })).toBeNull();
  });

  it("jumps home from the back-to-today affordance when off today's week", () => {
    const { onJumpToCard } = renderStrip({
      cards: [dayCard(TODAY, 1), dayCard("2026-07-20", 1)],
      currentIndex: 1,
      landingIndex: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "Jump back to today" }));
    expect(onJumpToCard).toHaveBeenCalledWith(0);
  });
});
