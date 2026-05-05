/** @vitest-environment happy-dom */
/**
 * AddTaskSheet tests
 *
 * Strategy: mock bottom sheet and test form interactions, validation,
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
  const Keyboard = { dismiss: vi.fn() };
  return {
    View,
    Text,
    Pressable,
    Keyboard,
    StyleSheet: { create: <T,>(s: T) => s },
  };
});

// ─── @gorhom/bottom-sheet mock ────────────────────────────────────────────────
const mockExpand = vi.fn();
const mockClose = vi.fn();

vi.mock("@gorhom/bottom-sheet", () => {
  const BottomSheet = React.forwardRef(
    (
      {
        children,
        onChange,
      }: {
        children?: React.ReactNode;
        onChange?: (index: number) => void;
        [key: string]: unknown;
      },
      ref: React.Ref<{ expand: () => void; close: () => void }>
    ) => {
      React.useImperativeHandle(ref, () => ({
        expand: () => {
          mockExpand();
          onChange?.(0);
        },
        close: () => {
          mockClose();
          onChange?.(-1);
        },
      }));
      return React.createElement("div", { "data-testid": "bottom-sheet" }, children);
    }
  );
  return {
    default: BottomSheet,
    BottomSheetBackdrop: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", { "data-testid": "backdrop" }, children),
    BottomSheetView: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", {}, children),
    BottomSheetTextInput: ({
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
        "data-testid": placeholder === "What needs to be done?" ? "title-input" : "description-input",
      }),
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

// ─── react-native-safe-area-context mock ──────────────────────────────────────
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ─── useKeyboardInset mock ────────────────────────────────────────────────────
vi.mock("../hooks/useKeyboardInset", () => ({
  useKeyboardInset: (bottom: number) => bottom,
}));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#06f",
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
  radii: { md: 8, lg: 12, xl: 16 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
  typography: { title: {}, bodyMd: {}, micro: {} },
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
    mockExpand.mockClear();
    mockClose.mockClear();
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

    expect(mockExpand).toHaveBeenCalledTimes(1);

    act(() => {
      ref.current?.close();
    });

    expect(mockClose).toHaveBeenCalledTimes(1);
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
    
    // Type the title
    fireEvent.change(titleInput, { target: { value: "New task" } });
    
    // Trigger submit via Enter key
    await act(async () => {
      fireEvent.keyDown(titleInput, { key: "Enter" });
    });

    // Should call onAdd with the correct data
    await waitFor(() => {
      expect(mockOnAdd).toHaveBeenCalledTimes(1);
    });
    
    expect(mockOnAdd).toHaveBeenCalledWith({
      title: "New task",
      description: undefined,
      deadline: undefined,
      mode: "inbox",
      priority: undefined,
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

    // When title is empty, should show "Add task" button that is disabled
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

    // Add must remain visible so the user can submit; Discard is added
    // as a secondary affordance once a draft exists.
    expect(screen.getByText("Add task")).toBeTruthy();
    expect(screen.getByText("Discard")).toBeTruthy();
  });
});
