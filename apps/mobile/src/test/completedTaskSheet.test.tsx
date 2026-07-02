/** @vitest-environment happy-dom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mockConfirm = vi.fn(async () => true);

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
    const { onPress, style: _, accessibilityLabel, accessibilityRole, ...safe } = rest as AnyProps & {
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityRole?: string;
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
        role: accessibilityRole,
      },
      resolved,
    );
  };
  const Modal = ({ visible, children }: AnyProps & { visible?: boolean }) =>
    visible ? React.createElement("div", { "data-testid": "completed-sheet" }, children) : null;
  const ScrollView = ({ children }: AnyProps) => React.createElement("div", {}, children);
  const StyleSheet = {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    hairlineWidth: 1,
    absoluteFill: {},
  };
  return { Modal, Pressable, ScrollView, StyleSheet, Text, View };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("../lib/dates", () => ({
  humanDate: (value: string) => value,
}));

vi.mock("../lib/task-form", () => ({
  formatTime12h: (value: string) => value,
}));

vi.mock("../theme/tokens", () => ({
  colors: {
    backdrop: "rgba(0,0,0,0.4)",
    bgCard: "#111",
    bgSurface: "#181818",
    border: "#333",
    borderSubtle: "#444",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textMuted: "#999",
    textInverse: "#000",
    success: "#0a0",
    accent: "#06f",
    error: "#f44",
    errorMuted: "#fee",
  },
  radii: { full: 999, lg: 12, xl: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  typography: { micro: {}, headline: {}, bodyMd: {}, bodyLg: {}, title: { fontFamily: "Geist" } },
}));

vi.mock("../hooks/useConfirm", () => ({
  useConfirm: () => mockConfirm,
}));

import { CompletedTaskSheet } from "../components/CompletedTaskSheet";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

const task: MobileTask = {
  _id: "task-1" as Id<"tasks">,
  title: "Ship redesign",
  description: "Polish Progress parity",
  deadline: "2026-07-02",
  time: "09:00",
  scheduledAt: 10,
  completedAt: 20,
  position: 0,
  updatedAt: 20,
  createdAt: 1,
};

describe("CompletedTaskSheet", () => {
  it("renders read-only completion details and actions", () => {
    mockConfirm.mockResolvedValue(true);
    render(
      <CompletedTaskSheet
        task={task}
        linkedGoalName="Mobile parity"
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onReopen={vi.fn()}
        onViewGoal={vi.fn()}
      />,
    );

    expect(screen.getByText("Completed task")).toBeTruthy();
    expect(screen.getByText("Ship redesign")).toBeTruthy();
    expect(screen.getByText("Mobile parity")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reopen ship redesign/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /view linked goal for ship redesign/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /delete ship redesign/i })).toBeTruthy();
  });

  it("routes actions through the selected task id", () => {
    mockConfirm.mockResolvedValue(true);
    const onReopen = vi.fn();
    const onDelete = vi.fn();
    const onViewGoal = vi.fn();

    render(
      <CompletedTaskSheet
        task={task}
        linkedGoalName="Mobile parity"
        onClose={vi.fn()}
        onDelete={onDelete}
        onReopen={onReopen}
        onViewGoal={onViewGoal}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /reopen ship redesign/i }));
    fireEvent.click(screen.getByRole("button", { name: /view linked goal for ship redesign/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete ship redesign/i }));

    expect(onReopen).toHaveBeenCalledWith("task-1");
    expect(onViewGoal).toHaveBeenCalledTimes(1);
    return waitFor(() => expect(onDelete).toHaveBeenCalledWith("task-1"));
  });

  it("does not delete when confirmation is declined", () => {
    mockConfirm.mockResolvedValue(false);
    const onDelete = vi.fn();

    render(
      <CompletedTaskSheet
        task={task}
        linkedGoalName="Mobile parity"
        onClose={vi.fn()}
        onDelete={onDelete}
        onReopen={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /delete ship redesign/i }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows inbox-capture origin and hides goal action when unlinked", () => {
    mockConfirm.mockResolvedValue(true);
    const noDeadlineTask = {
      ...task,
      deadline: undefined,
      time: undefined,
    };

    render(
      <CompletedTaskSheet
        task={noDeadlineTask}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onReopen={vi.fn()}
      />
    );

    expect(screen.getByText("Inbox capture")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /view linked goal/i })).toBeNull();
  });
});
