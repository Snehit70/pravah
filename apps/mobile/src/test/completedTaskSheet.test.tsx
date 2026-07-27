/** @vitest-environment happy-dom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfirm = vi.fn(async () => true);

vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const strip = (rest: AnyProps) => {
    const safe = { ...rest };
    delete safe.style;
    delete safe.accessibilityRole;
    delete safe.accessibilityState;
    delete safe.accessibilityViewIsModal;
    delete safe.hitSlop;
    return safe;
  };
  const View = ({ children, ...rest }: AnyProps) => React.createElement("div", strip(rest), children);
  const Text = ({ children, ...rest }: AnyProps) => React.createElement("span", strip(rest), children);
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const { onPress, accessibilityLabel, ...remaining } = rest as AnyProps & {
      onPress?: () => void;
      accessibilityLabel?: string;
    };
    const resolved = typeof children === "function"
      ? (children as (state: { pressed: boolean }) => React.ReactNode)({ pressed: false })
      : children;
    return React.createElement(
      "button",
      {
        ...strip(remaining),
        type: "button",
        onClick: onPress,
        "aria-label": accessibilityLabel,
      },
      resolved,
    );
  };
  const Modal = ({ visible, children }: AnyProps & { visible?: boolean }) =>
    visible ? React.createElement("div", { "data-testid": "completed-sheet" }, children) : null;
  return {
    Modal,
    Pressable,
    ScrollView: View,
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1, absoluteFill: {} },
    Text,
    View,
  };
});

vi.mock("expo-blur", () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("../lib/dates", () => ({
  humanDate: (value: string) => value,
}));

vi.mock("../lib/task-form", () => ({
  formatTime12h: (value: string) => value,
  priorityDotColor: (value?: string) => value === "p1" ? "#f00" : "#999",
  priorityLabel: (value?: string) => value?.toUpperCase() ?? "—",
}));

vi.mock("../theme/tokens", () => ({
  colors: {
    bgCard: "#fff",
    bgSurface: "#fafafa",
    bgFloating: "#fff",
    bgInput: "#eee",
    border: "#333",
    borderSubtle: "#ddd",
    textPrimary: "#111",
    textSecondary: "#555",
    textMuted: "#777",
    textInverse: "#fff",
    success: "#080",
    accent: "#60f",
    error: "#c00",
  },
  radii: { full: 999, lg: 10, xl: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, section: 32 },
  typography: { micro: {}, headline: {}, bodyMd: {}, title: {} },
}));

vi.mock("../theme/themeRuntime", () => ({
  createThemedStyles: <T,>(styles: T) => styles,
  getThemeRuntimeSnapshot: () => ({ appearance: "light" }),
}));

vi.mock("../components/UiIcons", () => {
  const icon = (name: string) => () => React.createElement("span", { "data-icon": name });
  return {
    CalendarIcon: icon("calendar"),
    CheckIcon: icon("check"),
    CloseIcon: icon("close"),
    FileTextIcon: icon("file-text"),
    InfoCircleIcon: icon("info"),
    TrashIcon: icon("trash"),
  };
});

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
  priority: "p1",
  position: 0,
  updatedAt: 20,
  createdAt: 1,
};

describe("CompletedTaskSheet compact workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
  });

  it("renders the same read-only inspector hierarchy", () => {
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

    expect(screen.getByText("TASK")).toBeTruthy();
    expect(screen.getByText("Ship redesign")).toBeTruthy();
    expect(screen.getByText(/COMPLETED/)).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByText("Planning")).toBeTruthy();
    expect(screen.getByText("Mobile parity")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reopen ship redesign/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete ship redesign/i })).toBeNull();
  });

  it("keeps Task details, linked Goal, and deletion in overflow", async () => {
    const onDelete = vi.fn();
    const onViewGoal = vi.fn();
    render(
      <CompletedTaskSheet
        task={task}
        linkedGoalName="Mobile parity"
        onClose={vi.fn()}
        onDelete={onDelete}
        onReopen={vi.fn()}
        onViewGoal={onViewGoal}
      />,
    );

    fireEvent.click(screen.getByLabelText("More task actions"));
    expect(screen.getByText("Task details")).toBeTruthy();
    fireEvent.click(screen.getByText("View linked Goal"));
    expect(onViewGoal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("More task actions"));
    await act(async () => fireEvent.click(screen.getByText("Delete task")));

    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("restore it for 30 minutes"),
    }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("task-1"));
  });

  it("routes Reopen through the selected task id", () => {
    const onReopen = vi.fn();
    render(
      <CompletedTaskSheet
        task={task}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onReopen={onReopen}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /reopen ship redesign/i }));
    expect(onReopen).toHaveBeenCalledWith("task-1");
  });

  it("does not delete when confirmation is declined", async () => {
    mockConfirm.mockResolvedValue(false);
    const onDelete = vi.fn();
    render(
      <CompletedTaskSheet
        task={task}
        onClose={vi.fn()}
        onDelete={onDelete}
        onReopen={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("More task actions"));
    await act(async () => fireEvent.click(screen.getByText("Delete task")));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
