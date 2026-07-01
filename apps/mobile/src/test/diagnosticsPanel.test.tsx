/** @vitest-environment happy-dom */
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

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
      style: _,
      hitSlop: __,
      accessibilityLabel,
      accessibilityRole: ___,
      accessibilityState,
      ...safe
    } = rest as {
      onPress?: () => void;
      hitSlop?: unknown;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      accessibilityState?: { selected?: boolean };
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
        "aria-label": accessibilityLabel,
        "aria-pressed": accessibilityState?.selected,
      },
      resolved,
    );
  };
  return {
    View,
    Text,
    Pressable,
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  };
});

vi.mock("../theme/tokens", () => ({
  colors: {
    bg: "#111",
    bgFloating: "#222",
    border: "#333",
    textPrimary: "#fff",
    textMuted: "#999",
    textSecondary: "#ccc",
    accent: "#7b61ff",
  },
  radii: { full: 999, lg: 12, md: 8 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  typography: { micro: {}, title: {} },
}));

import { DiagnosticsPanel } from "../components/DiagnosticsPanel";

describe("DiagnosticsPanel", () => {
  it("exposes event filters as toggle buttons and filters the timeline", () => {
    render(
      <DiagnosticsPanel
        visible
        activeTab="timeline"
        inboxCount={2}
        timelineCount={3}
        completedCount={4}
        pendingMutations={0}
        retryQueueCount={0}
        isKairoActive={false}
        isAllTasksReady
        usingSnapshot={false}
        isDataBootstrapReady
        onToggle={() => {}}
        events={[
          {
            sessionId: "1",
            seq: 1,
            level: "info",
            flow: "network",
            event: "network ok",
            ts: 1,
          },
          {
            sessionId: "1",
            seq: 2,
            level: "error",
            flow: "ui",
            event: "render failed",
            ts: 2,
          },
        ]}
      />,
    );

    const networkFilter = screen.getByRole("button", { name: /hide network events/i });
    expect(networkFilter.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("[info] network ok")).toBeTruthy();

    fireEvent.click(networkFilter);

    expect(screen.getByRole("button", { name: /show network events/i }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.queryByText("[info] network ok")).toBeNull();
    expect(screen.getByText("[error] render failed")).toBeTruthy();
  });
});
