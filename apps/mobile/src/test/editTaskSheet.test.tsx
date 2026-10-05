/** @vitest-environment happy-dom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockConfirm,
  mockGoals,
  mockGoalFor,
  mockSetGoalLink,
  imagePasteHandlers,
} = vi.hoisted(() => ({
  mockConfirm: vi.fn(async () => true),
  mockGoals: [
    { id: "goal-systemd", text: "Systemd Manager" },
    { id: "goal-pravah", text: "Pravah Mobile Polish" },
  ],
  mockGoalFor: vi.fn(() => null as string | null),
  mockSetGoalLink: vi.fn(),
  imagePasteHandlers: new Set<(source: { kind: "paste"; uri: string; previewUri: string }) => Promise<void>>(),
}));

vi.mock("../components/TaskImagePasteInput", async () => {
  const { TextInput } = await import("react-native");
  return {
    TaskImagePasteInput: React.forwardRef(function PasteInput(
      { imagePasteEnabled, pasteSession: _, onPasteImage, onPasteError: __, ...props }: React.ComponentProps<typeof import("../components/TaskImagePasteInput").TaskImagePasteInput>, ref: React.Ref<import("react-native").TextInput>,
    ) {
      React.useEffect(() => {
        if (!imagePasteEnabled) return;
        imagePasteHandlers.add(onPasteImage);
        return () => { imagePasteHandlers.delete(onPasteImage); };
      }, [imagePasteEnabled, onPasteImage]);
      return <TextInput {...props} ref={ref} />;
    }),
  };
});

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
      onLongPress,
      disabled,
      accessibilityLabel,
      ...remaining
    } = rest as AnyProps & {
      onPress?: () => void;
      onLongPress?: () => void;
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
        onMouseDown: onLongPress,
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
  class MockAnimatedValue {
    constructor(public value: number) {}
    setValue(value: number) { this.value = value; }
    stopAnimation() {}
    interpolate() { return this.value; }
  }
  const Animated = {
    View,
    Value: MockAnimatedValue,
    timing: () => ({ start: () => undefined }),
  };

  return {
    Animated,
    View,
    Text,
    Pressable,
    TextInput,
    ScrollView: View,
    Keyboard: { dismiss: vi.fn() },
    Modal: ({ children, visible }: AnyProps & { visible?: boolean }) =>
      visible ? React.createElement("div", {}, children) : null,
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
    StyleSheet: { hairlineWidth: 1, absoluteFill: {}, create: <T,>(styles: T) => styles },
  };
});

vi.mock("react-native-gesture-handler", () => {
  const gesture = () => {
    const value: Record<string, unknown> = {};
    for (const method of ["onUpdate", "onEnd", "onStart", "onFinalize", "numberOfTaps", "enabled", "activeOffsetX", "failOffsetY", "minDistance", "activateAfterLongPress"]) value[method] = () => value;
    return value;
  };
  return {
    Gesture: { Pan: gesture, Pinch: gesture, Tap: gesture, Simultaneous: (...gestures: unknown[]) => gestures[0] ?? gesture(), Exclusive: (...gestures: unknown[]) => gestures[0] ?? gesture() },
    GestureDetector: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
    GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
  };
});

vi.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children) },
  runOnJS: (callback: (...args: never[]) => unknown) => callback,
  useAnimatedStyle: () => ({}),
  useSharedValue: <T,>(value: T) => ({ value }),
  withTiming: <T,>(value: T) => value,
}));

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
    ImagePlusIcon: icon("image-plus"),
    GripHorizontalIcon: icon("grip-horizontal"),
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
import { createTaskImageCoordinator, type TaskImageCoordinatorDependencies } from "../lib/taskImageCoordinator";
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
    imagePasteHandlers.clear();
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
    const content = document.body.textContent ?? "";
    expect(content.indexOf("Notes")).toBeLessThan(content.indexOf("Visual reference"));
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
        time: null,
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
    fireEvent.click(screen.getByLabelText("Goal, Systemd Manager"));
    expect((screen.getByTestId("goal-search") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByLabelText("Back to task inspector"));
    await act(async () => fireEvent.click(screen.getByText("Save changes")));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(mockSetGoalLink).toHaveBeenCalledWith("task1", "goal-systemd");
  });

  it("shows a clear empty state when Goal search has no matches", async () => {
    const { ref } = setup();
    await open(ref);

    fireEvent.click(screen.getByLabelText("Goal, No goal"));
    fireEvent.change(screen.getByTestId("goal-search"), {
      target: { value: "missing" },
    });

    expect(screen.getByText("No Goals match “missing”.")).toBeTruthy();
  });

  it("moves a timeline task to Inbox immediately", async () => {
    const onUnschedule = vi.fn();
    const { ref, onSave, onSheetChange } = setup({ onUnschedule });
    await open(ref);

    fireEvent.click(screen.getByText("Move to Inbox"));

    expect(onUnschedule).toHaveBeenCalledWith("task1");
    expect(onSave).not.toHaveBeenCalled();
    expect(onSheetChange).toHaveBeenCalledWith(false);
  });

  it("stages Clear schedule through Save when onUnschedule is absent", async () => {
    const { ref, onSave } = setup();
    await open(ref);

    fireEvent.click(screen.getByLabelText(/^When,/));
    fireEvent.click(screen.getByLabelText("Clear schedule"));
    expect(screen.getByText("Save changes")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText("Save changes")));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        deadline: null,
        time: null,
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

  it("updates the selected image when choosing a Task image thumbnail", async () => {
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

    await waitFor(() => {
      expect(screen.getAllByAltText("Selected Task image preview")[0].getAttribute("src"))
        .toBe("file:///image-b.jpg");
    });
    expect(screen.getAllByLabelText("Hold and drag to reorder Task image")).toHaveLength(2);
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

    fireEvent.click(screen.getByLabelText("Add Task image"));
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

  it("routes the exact keyboard image from Notes into Task images", async () => {
    const onSelectTaskImage = vi.fn(async () => ({
      stale: false as const,
      revision: 5,
      active: [{
        taskImageId: "image-pasted",
        position: 0,
        state: "pending" as const,
        previewUri: "file:///pasted-image.png",
      }],
      primary: {
        taskImageId: "image-pasted",
        position: 0,
        state: "pending" as const,
        previewUri: "file:///pasted-image.png",
      },
      recoverable: [],
    }));
    const { ref } = setup({ onSelectTaskImage });
    await open(ref);

    fireEvent.click(screen.getByLabelText("Edit task notes"));
    await act(async () => {
      for (const handler of [...imagePasteHandlers]) {
        await handler({ kind: "paste", uri: "file:///keyboard-image.png", previewUri: "file:///keyboard-image.png" });
      }
    });

    await waitFor(() => {
      expect(screen.getByAltText("Selected Task image preview").getAttribute("src"))
        .toBe("file:///pasted-image.png");
    });
    expect(onSelectTaskImage).toHaveBeenCalledWith({
      taskId: "task1",
      expectedRevision: 0,
      kind: "paste",
      source: { kind: "paste", uri: "file:///keyboard-image.png", previewUri: "file:///keyboard-image.png" },
    });
  });

  it("updates upload status from live collections while keeping the notes draft", async () => {
    const task = {
      ...timelineTask,
      imageCollection: {
        revision: 5,
        observedAt: 1000,
        active: [{ taskImageId: "image-pasted", position: 0, state: "uploading" as const }],
        recoverable: [],
      },
    };
    const ref = React.createRef<EditTaskSheetRef>();
    const props = { ref, onSave: vi.fn(async () => true), isValidDeadline: (raw: string) => ({ value: raw }) };
    const { rerender } = render(<EditTaskSheet {...props} imageCollections={new Map([["task1", task.imageCollection]])} />);
    await open(ref, task);
    expect(screen.getAllByText("Uploading image").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("Edit task notes"));
    fireEvent.change(screen.getByTestId("description-input"), { target: { value: "Unsaved notes" } });

    rerender(<EditTaskSheet {...props} imageCollections={new Map([["task1", {
      ...task.imageCollection,
      active: [{ taskImageId: "image-pasted", position: 0, state: "failed", failure: { code: "network_error", retryable: true } }],
    }]])} />);
    await waitFor(() => expect(screen.queryAllByText("Uploading image")).toHaveLength(0));
    expect(screen.getAllByText("Upload failed").length).toBeGreaterThan(0);
    expect((screen.getByTestId("description-input") as HTMLTextAreaElement).value).toBe("Unsaved notes");
  });

  it("lets a current server failure replace a stale local verifying state and keeps retry available", async () => {
    const providerResult = {
      publicId: "provider-id",
      version: 1,
      signature: "signature",
      resourceType: "image",
      deliveryType: "authenticated",
      format: "png",
      width: 800,
      height: 600,
      bytes: 1000,
      eager: [],
    };
    const coordinator = createTaskImageCoordinator({
      createUploadId: () => "upl_mobile_1",
      acquireSource: async (kind) => ({ kind, uri: "file:///clipboard.png", previewUri: "file:///clipboard.png" }),
      normalize: async () => ({ uri: "file:///normalized.png", previewUri: "file:///clipboard.png", encodingClass: "png", width: 800, height: 600, bytes: 1000 }),
      stage: async () => undefined,
      issueGrant: async () => ({ uploadUrl: "https://upload.example", signature: "signature", apiKey: "key", signedParameters: {} }),
      upload: async () => providerResult,
      verify: async () => ({ state: "verifying" as const }),
    });
    const imageCollection: NonNullable<MobileTask["imageCollection"]> = {
      revision: 5,
      observedAt: 1000,
      active: [{ taskImageId: "image-pasted", position: 0, state: "uploading", attempt: 1 }],
      recoverable: [],
    };
    const task: MobileTask = {
      ...timelineTask,
      imageCollection,
    };
    const onRetryTaskImage = vi.fn();
    const ref = React.createRef<EditTaskSheetRef>();
    const props = {
      ref,
      onSave: vi.fn(async () => true),
      isValidDeadline: (raw: string) => ({ value: raw }),
      taskImageCoordinator: coordinator,
      onRetryTaskImage,
    };
    const uploadIds = await coordinator.select("paste");
    coordinator.associateUploadsWithTask("task1", uploadIds);
    coordinator.associateTaskImageOrder("task1", ["image-pasted"]);
    await coordinator.beginUploadAfterSave();
    expect(coordinator.getTaskImageViewStates("task1")).toMatchObject([{ state: "verifying", attempt: 1 }]);

    const { rerender } = render(<EditTaskSheet {...props} imageCollections={new Map([["task1", imageCollection]])} />);
    await open(ref, task);
    expect(screen.getByText("Preparing image")).toBeTruthy();

    const failedCollection: NonNullable<MobileTask["imageCollection"]> = {
      ...imageCollection,
      revision: 6,
      active: [{
        taskImageId: "image-pasted",
        position: 0,
        state: "failed" as const,
        attempt: 1,
        failure: { code: "verification_timeout", retryable: true },
      }],
    };
    rerender(<EditTaskSheet {...props} imageCollections={new Map([["task1", failedCollection]])} />);
    await waitFor(() => expect(screen.getByText("Upload failed")).toBeTruthy());
    expect(screen.getByText("Your image is saved on this device. Try uploading again.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry Task image" }));
    await waitFor(() => expect(onRetryTaskImage).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task1",
      taskImageId: "image-pasted",
      failure: { code: "verification_timeout", retryable: true },
    })));
    coordinator.dispose();
  });

  it("keeps a hidden upload running when closed and restores its preview and percentage", async () => {
    let finishUpload!: (value: Awaited<ReturnType<TaskImageCoordinatorDependencies["upload"]>>) => void;
    const uploaded = new Promise<Awaited<ReturnType<TaskImageCoordinatorDependencies["upload"]>>>((resolve) => { finishUpload = resolve; });
    let reportProgress!: (progress: number) => void;
    const coordinator = createTaskImageCoordinator({
      createUploadId: () => "upl_mobile_1",
      acquireSource: async () => ({ kind: "paste", uri: "file:///clipboard.png", previewUri: "file:///clipboard.png" }),
      normalize: async () => ({ uri: "file:///normalized.png", previewUri: "file:///normalized.png", encodingClass: "png", width: 800, height: 600, bytes: 1000 }),
      sourceStore: {
        persist: async () => ({ sourceKey: "upl_mobile_1.png", uri: "file:///durable.png" }),
        resolve: async () => "file:///durable.png",
        remove: vi.fn(async () => undefined),
      },
      stage: async () => undefined,
      issueGrant: async () => ({ uploadUrl: "https://upload.example", signature: "signature", apiKey: "key", signedParameters: {} }),
      upload: async (_uri, _grant, options) => {
        reportProgress = options!.onProgress;
        reportProgress(0.42);
        return uploaded;
      },
      verify: async () => ({ state: "verifying" }),
    });
    try {
      const selected = await coordinator.select("paste");
      coordinator.associateUploadsWithTask("task1", selected);
      coordinator.associateTaskImageOrder("task1", ["image-pasted"]);
      coordinator.clearAfterSaveAndStay(selected);
      expect(coordinator.getViewStates()).toEqual([]);
      const task: MobileTask = { ...timelineTask, imageCollection: {
        revision: 5, observedAt: 1000,
        active: [{ taskImageId: "image-pasted", position: 0, state: "uploading" }], recoverable: [],
      } };
      const { ref } = setup({ taskImageCoordinator: coordinator });
      await open(ref, task);
      let completion!: Promise<void>;
      await act(async () => { completion = coordinator.beginUploadAfterSave(); });
      expect(screen.getByText("Uploading · 42%")).toBeTruthy();

      await act(async () => { ref.current?.close(); });
      expect(screen.queryByText("Original task")).toBeNull();
      expect(coordinator.getTaskImageViewStates("task1")[0].state).toBe("uploading");
      await act(async () => { reportProgress(0.73); });
      await open(ref, task);
      expect(screen.getByAltText("Selected Task image preview").getAttribute("src")).toBe("file:///durable.png");
      expect(screen.getByText("Uploading · 73%")).toBeTruthy();

      await act(async () => {
        finishUpload({ publicId: "provider-id", version: 1, signature: "signature", resourceType: "image", deliveryType: "authenticated", format: "png", width: 800, height: 600, bytes: 1000, eager: [] });
        await completion;
      });
      expect(screen.getByText("Preparing image")).toBeTruthy();
    } finally {
      coordinator.dispose();
    }
  });

  it("serializes rapid keyboard pastes with the revision returned by the previous attachment", async () => {
    let finishFirst!: (value: { stale: false; revision: number; active: []; recoverable: [] }) => void;
    const firstResult = new Promise<{ stale: false; revision: number; active: []; recoverable: [] }>((resolve) => { finishFirst = resolve; });
    const onSelectTaskImage = vi.fn()
      .mockImplementationOnce(() => firstResult)
      .mockResolvedValue({ stale: false, revision: 10, active: [], recoverable: [] });
    const { ref } = setup({ onSelectTaskImage });
    await open(ref);
    fireEvent.click(screen.getByLabelText("Edit task notes"));
    const handler = [...imagePasteHandlers][0];
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = handler({ kind: "paste", uri: "file:///first.png", previewUri: "file:///first.png" });
      second = handler({ kind: "paste", uri: "file:///second.png", previewUri: "file:///second.png" });
    });
    expect(onSelectTaskImage).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishFirst({ stale: false, revision: 9, active: [], recoverable: [] });
      await Promise.all([first, second]);
    });
    expect(onSelectTaskImage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      taskId: "task1", expectedRevision: 9,
      source: expect.objectContaining({ uri: "file:///second.png" }),
    }));
  });

  it("does not apply an attachment result or start queued pastes after switching Tasks", async () => {
    let finishFirst!: (value: unknown) => void;
    const result = new Promise((resolve) => { finishFirst = resolve; });
    const onSelectTaskImage = vi.fn(() => result);
    const { ref } = setup({ onSelectTaskImage });
    await open(ref);
    fireEvent.click(screen.getByLabelText("Edit task notes"));
    const handler = [...imagePasteHandlers][0];
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = handler({ kind: "paste", uri: "file:///first.png", previewUri: "file:///first.png" });
      second = handler({ kind: "paste", uri: "file:///second.png", previewUri: "file:///second.png" });
    });
    await open(ref, { ...timelineTask, _id: "task2" as MobileTask["_id"], title: "Another Task" });
    await act(async () => {
      finishFirst({ stale: false, revision: 9, active: [{ taskImageId: "old-image", position: 0, state: "pending", previewUri: "file:///old.png" }], recoverable: [] });
      await Promise.all([first, second]);
    });
    expect(onSelectTaskImage).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Another Task")).toBeTruthy();
    expect(screen.queryByAltText("Selected Task image preview")).toBeNull();
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
