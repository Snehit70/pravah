/** @vitest-environment happy-dom */
/**
 * AddTaskSheet tests
 *
 * Strategy: mock RN primitives and test form interactions, validation,
 * and task creation flow.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      style: _,
      hitSlop: __,
      disabled,
      accessibilityLabel,
      accessibilityRole: ___,
      ...safe
    } = rest as {
      onPress?: () => void;
      hitSlop?: unknown;
      disabled?: boolean;
      accessibilityLabel?: string;
      accessibilityRole?: string;
    } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      { ...safe, onClick: onPress, type: "button", disabled: disabled ?? false, "aria-label": accessibilityLabel },
      resolved,
    );
  };
  const TextInput = ({
    value,
    onChangeText,
    onSubmitEditing,
    placeholder,
  }: {
    value?: string;
    onChangeText?: (v: string) => void;
    onSubmitEditing?: () => void;
    placeholder?: string;
    [key: string]: unknown;
  }) =>
    React.createElement("input", {
      value: value ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") onSubmitEditing?.();
      },
      placeholder,
      "data-testid":
        placeholder === "What needs to be done?"
          ? "title-input"
          : placeholder === "Notes (optional)"
          ? "description-input"
          : undefined,
    });
  const ScrollView = ({ children, ...rest }: AnyProps) => {
    const { style: _, contentContainerStyle: __, ...safe } = rest;
    return React.createElement("div", safe, children);
  };
  const Modal = ({
    children,
    visible,
  }: {
    children?: React.ReactNode;
    visible?: boolean;
    [key: string]: unknown;
  }) => (visible ? React.createElement("div", { "data-testid": "modal" }, children) : null);
  const KeyboardAvoidingView = ({ children, ...rest }: AnyProps) => {
    const { style: _, behavior: __, keyboardVerticalOffset: ___ } = rest;
    return React.createElement("div", {}, children);
  };
  const Keyboard = { dismiss: vi.fn() };
  const Platform = { OS: "android" };
  return {
    View,
    Text,
    Pressable,
    TextInput,
    ScrollView,
    Modal,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    StyleSheet: {
      create: <T,>(s: T) => s,
      hairlineWidth: 0.5,
      absoluteFill: {},
    },
  };
});

// ─── react-native-reanimated mock ─────────────────────────────────────────────
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", {}, children),
  },
  FadeIn: { duration: () => undefined },
  FadeOut: { duration: () => undefined },
}));

// ─── expo-haptics mock ────────────────────────────────────────────────────────
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

// ─── expo-blur mock ───────────────────────────────────────────────────────────
vi.mock("expo-blur", () => ({
  BlurView: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("div", { "data-testid": "blur-view" }, children),
}));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#06f",
    accentSoft: "#003",
    bg: "#000",
    bgCard: "#111",
    bgFloating: "#111",
    bgInput: "#222",
    border: "#333",
    borderSubtle: "#444",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textMuted: "#999",
    textInverse: "#000",
    error: "#f00",
  },
  radii: { md: 8, lg: 12, xl: 16, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  typography: { title: {}, bodyMd: {}, bodyLg: {}, headline: {}, micro: {} },
}));

// ─── TaskMetaFields mock ──────────────────────────────────────────────────────
vi.mock("../components/TaskMetaFields", () => ({
  TaskMetaFields: ({
    deadline,
    priority,
    onDeadlineChange,
    onPriorityChange,
  }: {
    deadline: string;
    priority?: string;
    onDeadlineChange: (v: string) => void;
    onPriorityChange: (v: string | undefined) => void;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "task-meta-fields" },
      React.createElement("input", {
        value: deadline,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onDeadlineChange(e.target.value),
        placeholder: "Deadline",
        "data-testid": "deadline-input",
      }),
      React.createElement("input", {
        value: priority ?? "",
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onPriorityChange(e.target.value || undefined),
        placeholder: "Priority",
        "data-testid": "priority-input",
      })
    ),
}));

// ─── useGoals mock ────────────────────────────────────────────────────────────
vi.mock("../hooks/useGoals", () => ({
  useGoals: () => ({ goals: [] }),
}));

// ─── useGoalMutations mock ────────────────────────────────────────────────────
vi.mock("../hooks/useGoalMutations", () => ({
  useGoalMutations: () => ({
    addGoal: vi.fn(async () => ({ id: "g1", text: "Goal" })),
    deleteGoal: vi.fn(),
    setGoalLink: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

// Import component after all mocks are set up.
import { AddTaskSheet, type AddTaskSheetRef } from "../components/AddTaskSheet";

// ─── tests ────────────────────────────────────────────────────────────────────

describe("AddTaskSheet", () => {
  let ref: { current: AddTaskSheetRef | null };
  const mockOnAdd = vi.fn(async () => true);
  const mockIsValidDeadline = vi.fn((raw: string) => {
    if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: "Invalid date format" };
    }
    return { value: raw || undefined };
  });
  const mockOnSheetChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    ref = { current: null };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens and closes via ref methods", () => {
    render(
      <AddTaskSheet
        ref={ref}
        onAdd={mockOnAdd}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    act(() => {
      ref.current?.open();
    });

    expect(mockOnSheetChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("modal")).toBeTruthy();

    act(() => {
      ref.current?.close();
    });

    expect(mockOnSheetChange).toHaveBeenCalledWith(false);
  });

  it("creates inbox task with title only", async () => {
    render(
      <AddTaskSheet
        ref={ref}
        onAdd={mockOnAdd}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    act(() => {
      ref.current?.open();
    });

    const titleInput = screen.getByTestId("title-input") as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: "New task" } });

    await act(async () => {
      fireEvent.keyDown(titleInput, { key: "Enter" });
    });

    await waitFor(() => {
      expect(mockOnAdd).toHaveBeenCalledTimes(1);
    });

    expect(mockOnAdd).toHaveBeenCalledWith({
      title: "New task",
      description: undefined,
      deadline: undefined,
      priority: undefined,
    });
  });

  it("uses timeline shortcuts to set the single deadline field", async () => {
    render(
      <AddTaskSheet
        ref={ref}
        onAdd={mockOnAdd}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    act(() => {
      ref.current?.open();
    });

    fireEvent.click(screen.getByRole("button", { name: "Set deadline Today" }));
    fireEvent.change(screen.getByTestId("title-input"), { target: { value: "Today task" } });
    fireEvent.click(screen.getByText("Add task"));

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    await waitFor(() => {
      expect(mockOnAdd).toHaveBeenCalledWith({
        title: "Today task",
        description: undefined,
        deadline: today,
        priority: undefined,
      });
    });
  });

  it("disables submit when title is empty", () => {
    render(
      <AddTaskSheet
        ref={ref}
        onAdd={mockOnAdd}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    act(() => {
      ref.current?.open();
    });

    const addBtn = screen.getByText("Add task");
    expect(addBtn.parentElement).toHaveProperty("disabled", true);
  });

  it("shows discard alongside add when there are draft changes", () => {
    render(
      <AddTaskSheet
        ref={ref}
        onAdd={mockOnAdd}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    act(() => {
      ref.current?.open();
    });

    const titleInput = screen.getByTestId("title-input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Draft" } });

    expect(screen.getByText("Add task")).toBeTruthy();
    expect(screen.getByText("Discard")).toBeTruthy();
  });
});
