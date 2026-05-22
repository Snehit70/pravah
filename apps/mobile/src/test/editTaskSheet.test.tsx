/** @vitest-environment happy-dom */
/**
 * EditTaskSheet tests
 *
 * Strategy: mock bottom sheet and test form interactions, validation,
 * and task update flow.
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
  const Alert = { alert: vi.fn() };
  const Platform = { OS: "ios", select: <T,>(options: { ios?: T; android?: T; default?: T }) => options.ios ?? options.default };
  const TextInput = ({ value, onChangeText, placeholder, ...rest }: AnyProps & { value?: string; onChangeText?: (v: string) => void; placeholder?: string }) =>
    React.createElement("input", {
      ...rest,
      value: value ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      placeholder,
      "data-testid": placeholder === "Task title" ? "title-input" : "description-input",
    });
  return {
    View,
    Text,
    Pressable,
    KeyboardAvoidingView: View,
    Keyboard,
    Alert,
    Modal: ({ children, visible }: AnyProps & { visible?: boolean }) => (visible ? React.createElement("div", {}, children) : null),
    Platform,
    ScrollView: View,
    StyleSheet: { create: <T,>(s: T) => s },
    TextInput,
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
        "data-testid": placeholder === "Task title" ? "title-input" : "description-input",
      }),
  };
});

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

// ─── react-native-reanimated mock ─────────────────────────────────────────────
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children, ...rest }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", rest, children),
  },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
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
  TaskMetaFields: () => React.createElement("div", { "data-testid": "task-meta-fields" }),
}));

// ─── ConfirmDialog mock ───────────────────────────────────────────────────────
// Avoid pulling reanimated/worklets into the test by stubbing the hook.
// Auto-confirm so discard flows resolve to true.
vi.mock("../hooks/useConfirm", () => ({
  useConfirm: () => async () => true,
  ConfirmProvider: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", {}, children),
}));

// Import component after all mocks are set up.
import { EditTaskSheet, type EditTaskSheetRef } from "../components/EditTaskSheet";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

// ─── helpers ──────────────────────────────────────────────────────────────────

const sampleTask: MobileTask = {
  _id: "task1" as Id<"tasks">,
  title: "Original task",
  description: "Original description",
  status: "inbox",
  priority: "p1",
  position: 0,
  updatedAt: 1000,
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("EditTaskSheet", () => {
  let ref: { current: EditTaskSheetRef | null };
  const mockOnSave = vi.fn(async () => true);
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

  it("opens with pre-filled task data", async () => {
    render(
      <EditTaskSheet
        ref={ref}
        onSave={mockOnSave}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    await act(async () => {
      ref.current?.open(sampleTask);
      await Promise.resolve();
    });

    expect(mockOnSheetChange).toHaveBeenCalledWith(true);

    const titleInput = screen.getByTestId("title-input") as HTMLInputElement;
    expect(titleInput.value).toBe("Original task");
  });

  it("updates task title", async () => {
    render(
      <EditTaskSheet
        ref={ref}
        onSave={mockOnSave}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    await act(async () => {
      ref.current?.open(sampleTask);
      await Promise.resolve();
    });

    const titleInput = screen.getByTestId("title-input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Updated task" } });

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });

    expect(mockOnSave).toHaveBeenCalledWith({
      taskId: "task1",
      title: "Updated task",
      description: "Original description",
      deadline: undefined,
      priority: "p1",
    });
  });

  it("closes via ref method", async () => {
    render(
      <EditTaskSheet
        ref={ref}
        onSave={mockOnSave}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    await act(async () => {
      ref.current?.open(sampleTask);
      await Promise.resolve();
    });

    act(() => {
      ref.current?.close();
    });

    expect(mockOnSheetChange).toHaveBeenLastCalledWith(false);
  });

  it("closes after successful save", async () => {
    render(
      <EditTaskSheet
        ref={ref}
        onSave={mockOnSave}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    await act(async () => {
      ref.current?.open(sampleTask);
      await Promise.resolve();
    });

    const titleInput = screen.getByTestId("title-input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Updated" } });

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(mockOnSheetChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("does not close when save fails", async () => {
    mockOnSave.mockResolvedValueOnce(false);

    render(
      <EditTaskSheet
        ref={ref}
        onSave={mockOnSave}
        isValidDeadline={mockIsValidDeadline}
        onSheetChange={mockOnSheetChange}
      />
    );

    await act(async () => {
      ref.current?.open(sampleTask);
      await Promise.resolve();
    });

    const titleInput = screen.getByTestId("title-input") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Updated" } });

    const saveBtn = screen.getByText("Save");
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });

    // Should not close on failure.
    expect(mockOnSheetChange).not.toHaveBeenLastCalledWith(false);
  });
});
