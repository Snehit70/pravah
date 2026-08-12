/** @vitest-environment happy-dom */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  type Props = Record<string, unknown> & { children?: React.ReactNode };
  const View = ({ children, style: _, accessibilityViewIsModal: __, ...props }: Props) => React.createElement("div", props, children);
  const Text = ({ children, style: _, ...props }: Props) => React.createElement("span", props, children);
  const TextInput = ({ value, defaultValue, onChangeText, accessibilityLabel, ...props }: Props & { value?: string; defaultValue?: string; onChangeText?: (value: string) => void }) =>
    React.createElement("input", {
      ...props,
      value: value ?? defaultValue ?? "",
      "aria-label": accessibilityLabel,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(event.target.value),
    });
  const Pressable = ({ children, onPress, onLongPress, accessibilityLabel, accessibilityRole, style: _, ...props }: Props) =>
    React.createElement(
      "button",
      {
        ...props,
        type: "button",
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        onClick: onPress as React.MouseEventHandler,
        onMouseDown: onLongPress as React.MouseEventHandler,
      },
      typeof children === "function"
        ? (children as (state: { pressed: boolean }) => React.ReactNode)({ pressed: false })
      : children
    );
  const ScrollView = ({ children, ...props }: Props) => React.createElement("div", props, children);
  const Modal = ({ children, visible, onRequestClose: _, transparent: __, animationType: ___, statusBarTranslucent: ____, ...props }: Props & { visible?: boolean }) =>
    visible === false ? null : React.createElement("div", props, children);
  return {
    View,
    Text,
    TextInput,
    Pressable,
    ScrollView,
    Modal,
    AccessibilityInfo: { announceForAccessibility: vi.fn() },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1, absoluteFill: {} },
  };
});

vi.mock("react-native-draggable-flatlist", () => ({
  default: ({ data, renderItem, ListFooterComponent, onDragBegin, onDragEnd }: {
    data: Array<{ taskImageId: string }>;
    renderItem: (params: { item: { taskImageId: string }; drag: () => void; isActive: boolean; getIndex: () => number }) => React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    onDragBegin?: (index: number) => void;
    onDragEnd?: (params: { data: Array<{ taskImageId: string }>; from: number; to: number }) => void;
  }) => React.createElement(
    "div",
    null,
    ...data.map((item, index) => renderItem({
      item,
      isActive: false,
      getIndex: () => index,
      drag: () => {
        onDragBegin?.(index);
        const reordered = [...data];
        const [moved] = reordered.splice(index, 1);
        const to = index === 0 ? reordered.length : 0;
        reordered.splice(to, 0, moved);
        onDragEnd?.({ data: reordered, from: index, to });
      },
    })),
    ListFooterComponent,
  ),
}));

vi.mock("../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("../lib/haptic", () => ({ haptic: { selection: vi.fn() } }));

vi.mock("react-native-gesture-handler", () => {
  const gesture = () => {
    const value: Record<string, unknown> = {};
    for (const method of ["onUpdate", "onEnd", "onStart", "onFinalize", "numberOfTaps", "enabled", "activeOffsetX", "failOffsetY", "minDistance"]) {
      value[method] = () => value;
    }
    return value;
  };
  return {
    Gesture: {
      Pan: gesture,
      Pinch: gesture,
      Tap: gesture,
      Exclusive: (...gestures: unknown[]) => gestures[0] ?? gesture(),
      Simultaneous: (...gestures: unknown[]) => gestures[0] ?? gesture(),
    },
    GestureDetector: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
    GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
  };
});

vi.mock("react-native-reanimated", () => {
  const AnimatedView = ({ children, style: _, ...props }: { children?: React.ReactNode; style?: unknown; [key: string]: unknown }) => React.createElement("div", props, children);
  return {
    default: { View: AnimatedView },
    runOnJS: (callback: (...args: never[]) => unknown) => callback,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: <T,>(value: T) => {
      const ref = React.useRef({
        value,
        get() { return this.value; },
        set(next: T) { this.value = next; },
      });
      return ref.current;
    },
    withTiming: <T,>(value: T) => value,
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("../components/UiIcons", () => {
  const Icon = () => React.createElement("span");
  return {
    AlertCircleIcon: Icon,
    ChevronLeftIcon: Icon,
    ChevronRightIcon: Icon,
    CloseIcon: Icon,
    CopyIcon: Icon,
    GripHorizontalIcon: Icon,
    ImagePlusIcon: Icon,
    PlusIcon: Icon,
    RetryArrowIcon: Icon,
    SmartphoneIcon: Icon,
    StackPlusIcon: Icon,
    TrashIcon: Icon,
  };
});

vi.mock("expo-image", () => {
  const Image = Object.assign(
    ({ source, accessibilityLabel }: { source: { uri: string }; accessibilityLabel: string }) =>
      React.createElement("img", { src: source.uri, alt: accessibilityLabel }),
    { prefetch: vi.fn(async () => true) },
  );
  return { Image };
});

vi.mock("../theme/tokens", () => ({
  colors: {
    bgSurface: "#111",
    bgFloating: "#222",
    border: "#333",
    borderSubtle: "#444",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textMuted: "#999",
    accent: "#70f",
    accentSoft: "#507",
    error: "#f55",
    success: "#5f5",
  },
  radii: { md: 8, lg: 12 },
  spacing: { xs: 4, sm: 8, md: 12 },
  typography: { micro: {}, bodySm: {} },
}));

vi.mock("../theme/themeRuntime", () => ({
  createThemedStyles: <T,>(styles: T) => styles,
}));

import { TaskImageFilmstrip } from "../components/TaskImageFilmstrip";

describe("TaskImageFilmstrip", () => {
  it("offers explicit Photos, Camera, and Paste actions with accessible names", () => {
    const onSelectSource = vi.fn();
    render(<TaskImageFilmstrip images={[]} onSelectSource={onSelectSource} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Task image from Photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Take Task image with Camera" }));
    fireEvent.click(screen.getByRole("button", { name: "Paste Task image from clipboard" }));

    expect(onSelectSource.mock.calls.map(([kind]) => kind)).toEqual([
      "photos",
      "camera",
      "paste",
    ]);
  });

  it("renders pending and failed placeholders with safe state and recovery copy", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <TaskImageFilmstrip
        images={[{ taskImageId: "image-1", position: 0, state: "uploading" }]}
      />
    );
    expect(screen.getByText("Uploading image")).toBeTruthy();

    rerender(
      <TaskImageFilmstrip
        images={[
          {
            taskImageId: "image-1",
            position: 0,
            state: "failed",
            failure: { code: "animated_image", retryable: false },
          },
        ]}
        onRetry={onRetry}
      />
    );
    expect(screen.getByText("Animated images are not supported.")).toBeTruthy();
    expect(screen.getByText("Image could not be prepared")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry Task image" })).toBeNull();
    expect(document.body.textContent).not.toContain("decoder");
  });

  it("does not present a locally staged image as waiting", () => {
    render(
      <TaskImageFilmstrip
        surface="capture"
        images={[{
          taskImageId: "image-1",
          position: 0,
          state: "pending",
          previewUri: "file:///private/preview.jpg",
        }]}
      />
    );

    expect(screen.queryByText("Waiting")).toBeNull();
    expect(screen.queryByText("Waiting to upload")).toBeNull();
  });

  it("resolves a ready image through the authenticated boundary and labels it semantically", async () => {
    const resolveDelivery = vi.fn(async () => ({
      kind: "ready" as const,
      url: "https://transient.example/signed-card",
    }));
    render(
      <TaskImageFilmstrip
        images={[{ taskImageId: "image-1", position: 0, state: "ready" }]}
        resolveDelivery={resolveDelivery}
      />
    );

    expect(await screen.findByAltText("Primary Task image")).toBeTruthy();
    expect(resolveDelivery).toHaveBeenCalledWith("image-1", "card");
    expect(screen.queryByText("https://transient.example/signed-card")).toBeNull();
  });

  it("fails closed to an unavailable placeholder when delivery is not authorized", async () => {
    render(
      <TaskImageFilmstrip
        images={[{ taskImageId: "image-1", position: 0, state: "ready" }]}
        resolveDelivery={vi.fn(async () => ({ kind: "not_found" as const }))}
      />
    );

    await waitFor(() => expect(screen.getByText("Image unavailable")).toBeTruthy());
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps image actions ordered, editable, removable, and replaceable up to five", () => {
    const onCaptionChange = vi.fn();
    const onReorder = vi.fn();
    const onRemove = vi.fn();
    const onSelectSource = vi.fn();
    render(
      <TaskImageFilmstrip
        images={[
          { taskImageId: "image-2", position: 1, state: "pending", caption: "Second" },
          { taskImageId: "image-1", position: 0, state: "ready", caption: "First" },
        ]}
        onCaptionChange={onCaptionChange}
        onReorder={onReorder}
        onRemove={onRemove}
        onSelectSource={onSelectSource}
      />
    );

    expect(screen.getByDisplayValue("First")).toBeTruthy();
    expect(screen.getByDisplayValue("Second")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("First"), { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Move Task image down" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove Task image" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Add Task image from Photos" }));

    expect(onCaptionChange).toHaveBeenCalledWith("image-1", "Updated");
    expect(onReorder).toHaveBeenCalledWith(["image-2", "image-1"]);
    expect(onRemove).toHaveBeenCalledWith("image-1");
    expect(onSelectSource).toHaveBeenCalledWith("photos");
  });

  it("preserves capture caption spaces while exposing direct image reordering", () => {
    const onCaptionChange = vi.fn();
    const onReorder = vi.fn();
    render(
      <TaskImageFilmstrip
        surface="capture"
        images={[
          { taskImageId: "image-1", position: 0, state: "pending", caption: "First" },
          { taskImageId: "image-2", position: 1, state: "pending", caption: "Second" },
        ]}
        onCaptionChange={onCaptionChange}
        onReorder={onReorder}
      />
    );

    const caption = screen.getByDisplayValue("First");
    fireEvent.change(caption, { target: { value: "First " } });
    expect((caption as HTMLInputElement).value).toBe("First ");
    expect(screen.queryByText("Earlier")).toBeNull();
    expect(screen.queryByText("Later")).toBeNull();
    fireEvent.mouseDown(screen.getAllByRole("button", { name: "Hold and drag to reorder Task image" })[1]);
    expect(onCaptionChange).toHaveBeenCalledWith("image-1", "First ");
    expect(onReorder).toHaveBeenCalledWith(["image-2", "image-1"]);
  });

  it("uses the plus tile as the Capture add-image entry point", async () => {
    const onSelectSource = vi.fn();
    render(
      <TaskImageFilmstrip
        surface="capture"
        images={[{ taskImageId: "image-1", position: 0, state: "pending" }]}
        onSelectSource={onSelectSource}
      />
    );

    expect(screen.queryByRole("button", { name: "Add Task image from Photos" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Task image" }));
    await waitFor(() => expect(screen.getByText("Choose where the visual reference should come from.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add Task image from Photos" }));

    expect(onSelectSource).toHaveBeenCalledWith("photos");
  });

  it("keeps Edit caption text local until blur commits it", () => {
    const onCaptionChange = vi.fn();
    render(
      <TaskImageFilmstrip
        surface="edit"
        images={[{ taskImageId: "image-1", position: 0, state: "pending", caption: "First" }]}
        onCaptionChange={onCaptionChange}
      />
    );

    const caption = screen.getByDisplayValue("First");
    fireEvent.change(caption, { target: { value: "Updated caption" } });
    expect((caption as HTMLInputElement).value).toBe("Updated caption");
    expect(onCaptionChange).not.toHaveBeenCalled();
    fireEvent.blur(caption);
    expect(onCaptionChange).toHaveBeenCalledWith("image-1", "Updated caption");
  });

  it("exposes recently removed images for restoration", () => {
    const onRestore = vi.fn();
    render(
      <TaskImageFilmstrip
        images={[]}
        recoverable={[{ taskImageId: "removed-1", caption: "Reference" }]}
        onRestore={onRestore}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore removed Task image" }));
    expect(onRestore).toHaveBeenCalledWith("removed-1");
  });

  it("offers replacement targets when the active collection is full", () => {
    const onRestore = vi.fn();
    const active = Array.from({ length: 5 }, (_, index) => ({
      taskImageId: `active-${index}`,
      position: index,
      state: "pending" as const,
    }));
    render(
      <TaskImageFilmstrip
        images={active}
        recoverable={[{ taskImageId: "removed-1" }]}
        onRestore={onRestore}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore removed Task image by replacing image 3" }));
    expect(onRestore).toHaveBeenCalledWith("removed-1", "active-2");
  });

  it("removes expired recovery actions without waiting for a database write", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      render(
        <TaskImageFilmstrip
          images={[]}
          recoverable={[{ taskImageId: "removed-1", recoverableUntil: 2_000 }]}
          onRestore={vi.fn()}
        />
      );
      expect(screen.getByRole("button", { name: "Restore removed Task image" })).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(screen.queryByRole("button", { name: "Restore removed Task image" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the selected Capture Filmstrip empty state and source actions", async () => {
    const onSelectSource = vi.fn();
    render(<TaskImageFilmstrip surface="capture" images={[]} onSelectSource={onSelectSource} />);

    expect(screen.getByText("Add a visual reference")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Task image" }));
    await waitFor(() => expect(screen.getByText("Choose where the visual reference should come from.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add Task image from Photos" }));
    expect(onSelectSource).toHaveBeenCalledWith("photos");
  });

  it("keeps clipboard paste behind the explicit source chooser", async () => {
    const onSelectSource = vi.fn();
    render(<TaskImageFilmstrip surface="capture" images={[]} onSelectSource={onSelectSource} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Task image" }));
    await waitFor(() => expect(screen.getByText("Choose where the visual reference should come from.")).toBeTruthy());
    expect(onSelectSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Paste Task image from clipboard" }));
    expect(onSelectSource).toHaveBeenCalledWith("paste");
  });

  it("hides Capture source actions at the five-image limit", () => {
    render(
      <TaskImageFilmstrip
        surface="capture"
        images={Array.from({ length: 5 }, (_, position) => ({
          taskImageId: `image-${position}`,
          position,
          state: "ready" as const,
        }))}
        onSelectSource={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Add Task image from Photos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Take Task image with Camera" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Paste Task image from clipboard" })).toBeNull();
  });

  it("keeps recoverable images restorable from an empty Edit surface", () => {
    const onRestore = vi.fn();
    render(
      <TaskImageFilmstrip
        surface="edit"
        images={[]}
        recoverable={[{ taskImageId: "removed-1", caption: "Reference" }]}
        onRestore={onRestore}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore removed Task image" }));
    expect(onRestore).toHaveBeenCalledWith("removed-1");
  });

  it("expires Edit recovery actions while the surface remains open", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      render(
        <TaskImageFilmstrip
          surface="edit"
          images={[]}
          recoverable={[{ taskImageId: "removed-1", recoverableUntil: 2_000 }]}
          onRestore={vi.fn()}
        />
      );
      expect(screen.getByRole("button", { name: "Restore removed Task image" })).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(screen.queryByRole("button", { name: "Restore removed Task image" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides Edit source actions at the five-image limit", () => {
    render(
      <TaskImageFilmstrip
        surface="edit"
        images={Array.from({ length: 5 }, (_, position) => ({
          taskImageId: `image-${position}`,
          position,
          state: "ready" as const,
        }))}
        onSelectSource={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Add Task image" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Task image from Photos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Take Task image with Camera" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Paste Task image from clipboard" })).toBeNull();
  });

  it("keeps Edit image actions on the compact filmstrip", async () => {
    const onSelectSource = vi.fn();
    const onRemove = vi.fn();
    render(
      <TaskImageFilmstrip
        surface="edit"
        images={[{ taskImageId: "image-1", position: 0, state: "ready" }]}
        onSelectSource={onSelectSource}
        onRemove={onRemove}
      />
    );

    expect(screen.queryByText("Photos")).toBeNull();
    expect(screen.queryByText("Camera")).toBeNull();
    expect(screen.queryByText("Paste")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Task image" }));
    await waitFor(() => expect(screen.getByText("Choose where the visual reference should come from.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add Task image from Photos" }));
    expect(onSelectSource).toHaveBeenCalledWith("photos");

    fireEvent.click(screen.getByRole("button", { name: "Remove Task image" }));
    expect(onRemove).toHaveBeenCalledWith("image-1");
  });

  it("renders compact Inbox and Completed presentations", () => {
    const images = [
      { taskImageId: "image-1", position: 0, state: "ready" as const },
      { taskImageId: "image-2", position: 1, state: "ready" as const, caption: "Second reference" },
    ];

    const { rerender } = render(<TaskImageFilmstrip surface="inbox" images={images} />);
    expect(screen.getByText("+1")).toBeTruthy();

    rerender(<TaskImageFilmstrip surface="completed" images={images} />);
    expect(screen.getByText("2 images retained")).toBeTruthy();
    expect(screen.getByText("Second reference")).toBeTruthy();
  });

  it("opens the viewer from Inbox and Management image previews", () => {
    const images = [{ taskImageId: "image-1", position: 0, state: "ready" as const }];
    const { rerender } = render(
      <TaskImageFilmstrip
        surface="inbox"
        images={images}
        resolveDelivery={vi.fn(async () => ({ kind: "ready" as const, url: "https://transient.example/image-1" }))}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open primary Task image" }));
    expect(screen.getByText("1 of 1 · Primary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close image viewer" }));

    rerender(<TaskImageFilmstrip surface="management" images={images} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Task image 1" }));
    expect(screen.getByText("1 of 1 · Primary")).toBeTruthy();
  });

  it("shows Primary identity, captions, and retries unavailable private delivery in the viewer", async () => {
    const resolveDelivery = vi.fn()
      .mockResolvedValueOnce({ kind: "ready" as const, url: "https://transient.example/card" })
      .mockResolvedValueOnce({ kind: "not_found" as const })
      .mockResolvedValueOnce({ kind: "ready" as const, url: "https://transient.example/retried" });
    render(
      <TaskImageFilmstrip
        surface="inbox"
        images={[{ taskImageId: "image-1", position: 0, state: "ready", caption: "Error screenshot for reference" }]}
        resolveDelivery={resolveDelivery}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open primary Task image" }));
    expect(screen.getByText("1 of 1 · Primary")).toBeTruthy();
    expect(screen.getByText("Error screenshot for reference")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry loading Task image" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Retry loading Task image" }));
    await waitFor(() => expect(screen.getByAltText("Task image 1 of 1, Primary")).toBeTruthy());
    expect(resolveDelivery).toHaveBeenCalledTimes(3);
  });

  it("opens the Edit hero in the private viewer while thumbnails only select", async () => {
    const resolveDelivery = vi.fn(async (taskImageId: string) => ({
      kind: "ready" as const,
      url: `https://transient.example/${taskImageId}`,
    }));
    render(
      <TaskImageFilmstrip
        surface="edit"
        images={[
          { taskImageId: "image-1", position: 0, state: "ready" },
          { taskImageId: "image-2", position: 1, state: "ready" },
        ]}
        resolveDelivery={resolveDelivery}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Task image 2" }));
    expect(screen.getByText("IMAGE 2 OF 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close image viewer" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Task image 2" }));
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(await screen.findByAltText("Task image 2 of 2")).toBeTruthy();
    expect(resolveDelivery).toHaveBeenCalledWith("image-2", "detail");
  });

  it("navigates from the tapped image and closes without persisting viewer state", async () => {
    const resolveDelivery = vi.fn(async (taskImageId: string) => ({
      kind: "ready" as const,
      url: `https://transient.example/${taskImageId}`,
    }));
    render(
      <TaskImageFilmstrip
        surface="completed"
        images={[
          { taskImageId: "image-1", position: 0, state: "ready" },
          { taskImageId: "image-2", position: 1, state: "ready" },
        ]}
        resolveDelivery={resolveDelivery}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Completed Task image 2" }));
    expect(screen.getByText("2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous Task image" }));
    await waitFor(() => expect(screen.getByText("1 of 2 · Primary")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Close image viewer" }));
    expect(screen.queryByRole("button", { name: "Close image viewer" })).toBeNull();
  });

  it("opens a local preview without requesting secure delivery", () => {
    const resolveDelivery = vi.fn();
    render(
      <TaskImageFilmstrip
        surface="capture"
        images={[{ taskImageId: "image-1", position: 0, state: "uploading", previewUri: "file:///preview.jpg" }]}
        resolveDelivery={resolveDelivery}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Task image 1" }));
    expect(screen.getByText("1 of 1 · Primary")).toBeTruthy();
    expect(resolveDelivery).not.toHaveBeenCalled();
    expect(screen.getByAltText("Task image 1 of 1, Primary")).toBeTruthy();
  });

  it("uses the detail delivery variant and exposes retry in the Edit surface", async () => {
    const onRetry = vi.fn();
    const resolveDelivery = vi.fn(async () => ({
      kind: "ready" as const,
      url: "https://transient.example/signed-detail",
    }));
    render(
      <TaskImageFilmstrip
        surface="edit"
        images={[
          { taskImageId: "image-1", position: 0, state: "ready" },
          { taskImageId: "image-2", position: 1, state: "failed", failure: { code: "upload_failed", retryable: true } },
        ]}
        onRetry={onRetry}
        resolveDelivery={resolveDelivery}
      />
    );

    expect((await screen.findAllByAltText("Primary Task image")).length).toBeGreaterThan(0);
    expect(resolveDelivery).toHaveBeenCalledWith("image-1", "detail");
    fireEvent.click(screen.getByRole("button", { name: "Select Task image 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry Task image" }));
    expect(onRetry).toHaveBeenCalledWith("image-2");
  });
});
