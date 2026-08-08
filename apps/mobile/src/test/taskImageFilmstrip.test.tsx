/** @vitest-environment happy-dom */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  type Props = Record<string, unknown> & { children?: React.ReactNode };
  const View = ({ children, style: _, ...props }: Props) => React.createElement("div", props, children);
  const Text = ({ children, style: _, ...props }: Props) => React.createElement("span", props, children);
  const TextInput = ({ value, defaultValue, onChangeText, accessibilityLabel, ...props }: Props & { value?: string; defaultValue?: string; onChangeText?: (value: string) => void }) =>
    React.createElement("input", {
      ...props,
      value: value ?? defaultValue ?? "",
      "aria-label": accessibilityLabel,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(event.target.value),
    });
  const Pressable = ({ children, onPress, accessibilityLabel, accessibilityRole, style: _, ...props }: Props) =>
    React.createElement(
      "button",
      {
        ...props,
        type: "button",
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        onClick: onPress as React.MouseEventHandler,
      },
      typeof children === "function"
        ? (children as (state: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children
    );
  return {
    View,
    Text,
    TextInput,
    Pressable,
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  };
});

vi.mock("expo-image", () => ({
  Image: ({ source, accessibilityLabel }: { source: { uri: string }; accessibilityLabel: string }) =>
    React.createElement("img", { src: source.uri, alt: accessibilityLabel }),
}));

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
    expect(screen.queryByRole("button", { name: "Retry Task image" })).toBeNull();
    expect(document.body.textContent).not.toContain("decoder");
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
    expect(onReorder).toHaveBeenCalledWith("image-1", "down");
    expect(onRemove).toHaveBeenCalledWith("image-1");
    expect(onSelectSource).toHaveBeenCalledWith("photos");
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
});
