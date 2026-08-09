/** @vitest-environment happy-dom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockConfirm,
  mockGoals,
  mockGoalFor,
  mockSetGoalLink,
} = vi.hoisted(() => ({
  mockConfirm: vi.fn(async () => true),
  mockGoals: [
    { id: "goal-systemd", text: "Systemd Manager" },
    { id: "goal-pravah", text: "Pravah Mobile Polish" },
  ],
  mockGoalFor: vi.fn(() => null as string | null),
  mockSetGoalLink: vi.fn(),
}));

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
  const View = ({ children, ...rest }: AnyProps) =>
    React.createElement("div", strip(rest), children);
  const Text = ({ children, ...rest }: AnyProps) =>
    React.createElement("span", strip(rest), children);
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const {
      onPress,
      disabled,
      accessibilityLabel,
      ...remaining
    } = rest as AnyProps & {
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    };
    const resolved =
      typeof children === "function"
        ? (children as (state: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      {
        ...strip(remaining),
        type: "button",
        disabled: Boolean(disabled),
        onClick: onPress,
        "aria-label": accessibilityLabel,
      },
      resolved,
    );
  };
  const TextInput = React.forwardRef<
    { focus: () => void },
    AnyProps & {
      value?: string;
      onChangeText?: (value: string) => void;
      onSubmitEditing?: () => void;
      onBlur?: () => void;
      placeholder?: string;
      accessibilityLabel?: string;
      multiline?: boolean;
    }
  >(function MockTextInput(
    {
      value,
      onChangeText,
      onSubmitEditing,
      onBlur,
      placeholder,
      accessibilityLabel,
      multiline,
      autoFocus: _autoFocus,
      returnKeyType: _returnKeyType,
      textAlignVertical: _textAlignVertical,
      ...rest
    },
    ref,
  ) {
    React.useImperativeHandle(ref, () => ({ focus: () => undefined }));
    const props = {
      ...strip(rest),
      value: value ?? "",
      placeholder,
      "aria-label": accessibilityLabel,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        (onChangeText as ((value: string) => void) | undefined)?.(event.target.value),
      onBlur,
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !multiline) {
          (onSubmitEditing as (() => void) | undefined)?.();
        }
      },
      "data-testid":
        placeholder === "Task title"
          ? "title-input"
          : placeholder === "Search goals…"
            ? "goal-search"
            : "description-input",
    };
    return multiline
      ? React.createElement("textarea", props)
      : React.createElement("input", props);
  });

  return {
    View,
    Text,
    Pressable,
    TextInput,
    ScrollView: View,
    Keyboard: { dismiss: vi.fn() },
    Modal: ({ children, visible }: AnyProps & { visible?: boolean }) =>
      visible ? React.createElement("div", {}, children) : null,
    StyleSheet: { hairlineWidth: 1, absoluteFill: {}, create: <T,>(styles: T) => styles },
  };
});

vi.mock("react-native-keyboard-controller", () => ({
  KeyboardAvoidingView: ({
    children,
    behavior,
    automaticOffset,
  }: {
    children?: React.ReactNode;
    behavior?: string;
    automaticOffset?: boolean;
  }) =>
    React.createElement(
      "div",
      {
        "data-testid": "keyboard-avoiding-view",
        "data-behavior": behavior,
        "data-automatic-offset": String(Boolean(automaticOffset)),
      },
      children,
    ),
}));

vi.mock("expo-blur", () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "blur-view" }, children),
}));

vi.mock("expo-image", () => ({
  Image: ({ source, accessibilityLabel }: { source?: { uri?: string }; accessibilityLabel?: string }) =>
    React.createElement("img", { src: source?.uri, alt: accessibilityLabel }),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("react-native-svg", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", {}, children);
  return { __esModule: true, default: Stub, Svg: Stub, Path: Stub, Circle: Stub, Line: Stub };
});

vi.mock("../components/UiIcons", () => {
  const icon = (name: string) => ({ color, size }: { color?: string; size?: number }) =>
    React.createElement("span", { "data-icon": name, style: { color, fontSize: size } });
  return {
    CalendarIcon: icon("calendar"),
    AlertCircleIcon: icon("alert-circle"),
    CheckIcon: icon("check"),
    ChevronLeftIcon: icon("chevron-left"),
    ChevronRightIcon: icon("chevron-right"),
    ClockIcon: icon("clock"),
    CloseIcon: icon("close"),
    FileTextIcon: icon("file-text"),
    InboxTrayIcon: icon("inbox"),
    InfoCircleIcon: icon("info"),
    PencilIcon: icon("pencil"),
    PlusIcon: icon("plus"),
    CopyIcon: icon("copy"),
    RetryArrowIcon: icon("retry"),
    SmartphoneIcon: icon("smartphone"),
    StackPlusIcon: icon("stack-plus"),
    SearchIcon: icon("search"),
    TrashIcon: icon("trash"),
  };
});

vi.mock("../theme/tokens", () => ({
  colors: {
    bg: "#f7f1e8",
    bgSurface: "#fbf7ef",
    bgCard: "#fffaf2",
    bgFloating: "#fffdf7",
    bgInput: "rgba(0,0,0,0.04)",
    border: "#333",
    borderSubtle: "#444",
    accent: "#6753c7",
    accentSoft: "rgba(103,83,199,0.16)",
    accentDim: "rgba(103,83,199,0.07)",
    textPrimary: "#201914",
    textSecondary: "#5b5048",
    textMuted: "#6f6358",
    textInverse: "#fffaf2",
    error: "#a43f32",
    success: "#226b4b",
    warning: "#805712",
    priorityP1: "#934536",
    priorityP2: "#805712",
    priorityP3: "#5e6662",
  },
  radii: { sm: 4, md: 6, lg: 10, xl: 16, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 },
  typography: {
    headline: { fontSize: 20 },
    title: { fontSize: 16 },
    bodyMd: { fontSize: 13 },
    micro: { fontSize: 11 },
  },
}));

vi.mock("../theme/themeRuntime", () => ({
  createThemedStyles: <T,>(styles: T) => styles,
  getThemeRuntimeSnapshot: () => ({ appearance: "light" }),
}));

vi.mock("../lib/haptic", () => ({
  haptic: {
    light: vi.fn(),
    selection: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../hooks/useConfirm", () => ({
  useConfirm: () => mockConfirm,
}));

vi.mock("../hooks/useGoals", () => ({
  useGoals: () => ({ goals: mockGoals }),
}));

vi.mock("../hooks/useGoalMutations", () => ({
  useGoalMutations: () => ({ setGoalLink: mockSetGoalLink }),
}));

vi.mock("../lib/goalLinks", () => ({
  goalLinksStore: {
    hydrate: vi.fn(() => Promise.resolve()),
    goalFor: mockGoalFor,
  },
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

vi.mock("../components/ThemedDatePicker", () => ({
  ThemedDatePicker: () => React.createElement("div", { "data-testid": "date-picker" }),
}));

vi.mock("../components/ThemedTimePicker", () => ({
  ThemedTimePicker: () => React.createElement("div", { "data-testid": "time-picker" }),
}));

import { EditTaskSheet, type EditTaskSheetRef } from "../components/EditTaskSheet";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

const timelineTask: MobileTask = {
  _id: "task1" as Id<"tasks">,
  title: "Original task",
  description: "Original description",
  deadline: "2026-07-28",
  scheduledAt: 500,
  priority: "p1",
  position: 0,
  updatedAt: 1000,
  createdAt: 500,
};

function setup(props: Record<string, unknown> = {}) {
  const ref = { current: null as EditTaskSheetRef | null };
  const onSave = vi.fn(async () => true);
  const onSheetChange = vi.fn();
  const onComplete = vi.fn();
  const onReopen = vi.fn();
  const onDelete = vi.fn();
  render(
    <EditTaskSheet
      ref={ref}
      onSave={onSave}
      isValidDeadline={(raw) => ({ value: raw || undefined })}
      onSheetChange={onSheetChange}
      onComplete={onComplete}
      onReopen={onReopen}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { ref, onSave, onSheetChange, onComplete, onReopen, onDelete };
}

async function open(ref: { current: EditTaskSheetRef | null }, task: MobileTask = timelineTask) {
  await act(async () => {
    ref.current?.open(task);
    await Promise.resolve();
  });
}

describe("EditTaskSheet compact workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
    mockGoalFor.mockReturnValue(null);
  });

  it("opens as a readable inspector instead of a permanent form", async () => {
    const { ref, onSheetChange } = setup();
    await open(ref);

    expect(screen.getByText("Original task")).toBeTruthy();
    expect(screen.queryByTestId("title-input")).toBeNull();
    expect(screen.getByText(/PLANNED/)).toBeTruthy();
    expect(screen.getByText("Planning")).toBeTruthy();
    expect(screen.getByText("Move to Inbox")).toBeTruthy();
    expect(screen.getByText("Complete")).toBeTruthy();
    expect(onSheetChange).toHaveBeenCalledWith(true);

    const keyboardView = screen.getByTestId("keyboard-avoiding-view");
    expect(keyboardView.getAttribute("data-behavior")).toBe("padding");
    expect(keyboardView.getAttribute("data-automatic-offset")).toBe("true");
  });

  it("stages title edits, saves, and remains open", async () => {
    const { ref, onSave, onSheetChange } = setup();
    await open(ref);

    fireEvent.click(screen.getByLabelText("Edit task title"));
    fireEvent.change(screen.getByTestId("title-input"), {
      target: { value: "Updated task" },
    });

    expect(screen.getByText("Discard")).toBeTruthy();
    expect(screen.getByText("Save changes")).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByText("Save changes")));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        taskId: "task1",
        title: "Updated task",
        description: "Original description",
        deadline: "2026-07-28",
        time: undefined,
        priority: "p1",
      });
    });
    expect(screen.getByText("Updated task")).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull();
    expect(onSheetChange).not.toHaveBeenLastCalledWith(false);
  });

  it("uses an explicit priority selector instead of cycling", async () => {
    const { ref, onSave } = setup();
    await open(ref);

    fireEvent.click(screen.getByLabelText("Priority, P1 — High"));
    expect(screen.getByText("Priority")).toBeTruthy();
    fireEvent.click(screen.getByText("P2 — Medium"));
    await act(async () => fireEvent.click(screen.getByText("Save changes")));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ priority: "p2" }));
    });
  });

  it("searches and stages a Goal selection", async () => {
    const { ref, onSave } = setup();
    await open(ref);

    fireEvent.click(screen.getByLabelText("Goal, No goal"));
    fireEvent.change(screen.getByTestId("goal-search"), {
      target: { value: "Systemd" },
    });
    fireEvent.click(screen.getByText("Systemd Manager"));
    await act(async () => fireEvent.click(screen.getByText("Save changes")));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(mockSetGoalLink).toHaveBeenCalledWith("task1", "goal-systemd");
  });

  it("turns Move to Inbox into a staged scheduling edit", async () => {
    const { ref, onSave } = setup();
    await open(ref);

    fireEvent.click(screen.getByText("Move to Inbox"));
    expect(screen.getByText("Save changes")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText("Save changes")));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        deadline: undefined,
        time: undefined,
      }));
    });
  });

  it("protects dirty edits on backdrop dismissal", async () => {
    mockConfirm.mockResolvedValueOnce(false);
    const { ref, onSheetChange } = setup();
    await open(ref);

    fireEvent.click(screen.getByLabelText("Edit task title"));
    fireEvent.change(screen.getByTestId("title-input"), {
      target: { value: "Unsaved title" },
    });
    await act(async () => fireEvent.click(screen.getByLabelText("Dismiss")));

    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "Discard your changes?",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
    }));
    expect((screen.getByTestId("title-input") as HTMLInputElement).value).toBe("Unsaved title");
    expect(onSheetChange).not.toHaveBeenCalledWith(false);
  });

  it("keeps completed tasks read-only until reopened", async () => {
    const completedTask: MobileTask = {
      ...timelineTask,
      completedAt: Date.now(),
    };
    const { ref, onReopen } = setup();
    await open(ref, completedTask);

    expect(screen.getByText(/COMPLETED/)).toBeTruthy();
    expect(screen.queryByLabelText("Edit task title")).toBeNull();
    fireEvent.click(screen.getByText("Reopen task"));
    expect(onReopen).toHaveBeenCalledWith("task1");
  });

  it("keeps completed Task image editing read-only", async () => {
    const completedTask: MobileTask = {
      ...timelineTask,
      completedAt: Date.now(),
      imageCollection: {
        revision: 1,
        observedAt: 100,
        active: [{ taskImageId: "image-1", position: 0, state: "ready" }],
        recoverable: [{ taskImageId: "removed-1", caption: "Removed" }],
      },
    };
    const { ref } = setup({
      onSelectTaskImage: vi.fn(),
      onRestoreTaskImage: vi.fn(),
    });
    await open(ref, completedTask);

    expect(screen.queryByLabelText("Add Task image")).toBeNull();
    expect(screen.queryByLabelText("Add Task image from Photos")).toBeNull();
    expect(screen.queryByLabelText("Restore removed Task image")).toBeNull();
  });

  it("updates local image positions when reordering a Task image", async () => {
    const onReorderTaskImages = vi.fn(async () => ({
      stale: false as const,
      revision: 5,
      active: [
        {
          taskImageId: "image-b",
          position: 0,
          state: "pending" as const,
          previewUri: "file:///image-b.jpg",
        },
        {
          taskImageId: "image-a",
          position: 1,
          state: "pending" as const,
          previewUri: "file:///image-a.jpg",
        },
      ],
      primary: {
        taskImageId: "image-b",
        position: 0,
        state: "pending" as const,
        previewUri: "file:///image-b.jpg",
      },
      recoverable: [],
    }));
    const taskWithImages: MobileTask = {
      ...timelineTask,
      imageCollection: {
        revision: 4,
        observedAt: 100,
        active: [
          {
            taskImageId: "image-a",
            position: 0,
            state: "pending",
            previewUri: "file:///image-a.jpg",
          },
          {
            taskImageId: "image-b",
            position: 1,
            state: "pending",
            previewUri: "file:///image-b.jpg",
          },
        ],
      },
    };
    const { ref } = setup({ onReorderTaskImages });
    await open(ref, taskWithImages);

    expect(screen.getAllByAltText("Selected Task image preview")[0].getAttribute("src"))
      .toBe("file:///image-a.jpg");
    fireEvent.click(screen.getByLabelText("Select Task image 2"));
    fireEvent.click(screen.getByLabelText("Move Task image up"));

    await waitFor(() => {
      expect(screen.getAllByAltText("Selected Task image preview")[0].getAttribute("src"))
        .toBe("file:///image-b.jpg");
    });
    expect(onReorderTaskImages).toHaveBeenCalledWith({
      taskId: "task1",
      orderedTaskImageIds: ["image-b", "image-a"],
      expectedRevision: 4,
    });
  });

  it("applies the returned Task image collection after attaching an image", async () => {
    const onSelectTaskImage = vi.fn(async () => ({
      stale: false as const,
      revision: 5,
      active: [{
        taskImageId: "image-new",
        position: 0,
        state: "pending" as const,
        previewUri: "file:///image-new.jpg",
      }],
      primary: {
        taskImageId: "image-new",
        position: 0,
        state: "pending" as const,
        previewUri: "file:///image-new.jpg",
      },
      recoverable: [],
    }));
    const { ref } = setup({ onSelectTaskImage });
    await open(ref);

    fireEvent.click(screen.getByLabelText("Add Task image from Photos"));

    await waitFor(() => {
      expect(screen.getByAltText("Selected Task image preview").getAttribute("src"))
        .toBe("file:///image-new.jpg");
    });
    expect(onSelectTaskImage).toHaveBeenCalledWith({
      taskId: "task1",
      expectedRevision: 0,
      kind: "photos",
    });
  });

  it("keeps deletion in overflow and explains recovery", async () => {
    const { ref, onDelete } = setup();
    await open(ref);

    fireEvent.click(screen.getByLabelText("More task actions"));
    await act(async () => fireEvent.click(screen.getByText("Delete task")));

    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining("restore it for 30 minutes"),
    }));
    expect(onDelete).toHaveBeenCalledWith("task1");
  });
});
