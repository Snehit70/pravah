/** @vitest-environment happy-dom */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImagePasteEvent } from "../lib/taskImageInput";

const { native, listeners } = vi.hoisted(() => {
  const listeners = new Set<(event: ImagePasteEvent) => void>();
  return {
    listeners,
    native: {
      attach: vi.fn(async (_tag: number, _session: string) => undefined),
      detach: vi.fn(async (_tag: number, _session: string) => undefined),
      release: vi.fn(async (_uri: string) => undefined),
      addListener: vi.fn((_name: string, listener: (event: ImagePasteEvent) => void) => {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      }),
    },
  };
});

vi.mock("../lib/taskImageInput", () => ({ taskImageInput: native }));
vi.mock("react-native", () => ({
  findNodeHandle: () => 7,
  TextInput: React.forwardRef<HTMLInputElement, { value?: string; onChangeText?: (value: string) => void }>(
    function MockTextInput({ value, onChangeText }, ref) {
      return <input ref={ref} value={value ?? ""} onChange={(event) => onChangeText?.(event.target.value)} />;
    },
  ),
}));

import { TaskImagePasteInput } from "../components/TaskImagePasteInput";

function send(event: ImagePasteEvent) {
  for (const listener of [...listeners]) listener(event);
}

describe("TaskImagePasteInput", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  it("keeps text edits intact and routes the received image before releasing its cached file", async () => {
    const onPasteImage = vi.fn(async () => undefined);
    const onChangeText = vi.fn();
    const onPasteError = vi.fn();
    render(<TaskImagePasteInput onPasteImage={onPasteImage} onPasteError={onPasteError} onChangeText={onChangeText} />);
    await waitFor(() => expect(native.attach).toHaveBeenCalledTimes(1));
    const session = native.attach.mock.calls[0][1];
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep my notes" } });
    expect(onChangeText).toHaveBeenCalledWith("Keep my notes");
    await act(async () => send({ session, uri: "file:///keyboard.png" }));
    expect(onPasteImage).toHaveBeenCalledWith({ kind: "paste", uri: "file:///keyboard.png", previewUri: "file:///keyboard.png" });
    expect(native.release).toHaveBeenCalledWith("file:///keyboard.png");
    expect(onPasteImage.mock.invocationCallOrder[0]).toBeLessThan(native.release.mock.invocationCallOrder[0]);
    expect(onPasteError).not.toHaveBeenCalled();
  });

  it("releases queued images instead of attaching them after the field is closed", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => { resolve = done; });
    const onPasteImage = vi.fn(() => pending);
    const { unmount } = render(<TaskImagePasteInput onPasteImage={onPasteImage} onPasteError={vi.fn()} />);
    await waitFor(() => expect(native.attach).toHaveBeenCalledTimes(1));
    const session = native.attach.mock.calls[0][1];
    await act(async () => {
      send({ session, uri: "file:///first.png" });
      send({ session, uri: "file:///second.png" });
    });
    expect(onPasteImage).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { resolve(); await pending; });
    await waitFor(() => expect(native.release).toHaveBeenCalledWith("file:///second.png"));
    expect(onPasteImage).toHaveBeenCalledTimes(1);
    expect(native.detach).toHaveBeenCalledWith(7, session);
    expect(listeners.size).toBe(0);
  });

  it("revokes the old Task session and ignores its delayed image result", async () => {
    const onPasteImage = vi.fn(async () => undefined);
    const onPasteError = vi.fn();
    const { rerender } = render(<TaskImagePasteInput pasteSession="task-a" onPasteImage={onPasteImage} onPasteError={onPasteError} />);
    await waitFor(() => expect(native.attach).toHaveBeenCalledTimes(1));
    const oldSession = native.attach.mock.calls[0][1];
    rerender(<TaskImagePasteInput pasteSession="task-b" onPasteImage={onPasteImage} onPasteError={onPasteError} />);
    await waitFor(() => expect(native.attach).toHaveBeenCalledTimes(2));
    await act(async () => send({ session: oldSession, uri: "file:///old-task.png" }));
    expect(native.detach).toHaveBeenCalledWith(7, oldSession);
    expect(onPasteImage).not.toHaveBeenCalled();
  });

  it("shows image processing errors and releases the source so a later paste can succeed", async () => {
    const onPasteImage = vi.fn().mockRejectedValueOnce(new Error("bad image")).mockResolvedValue(undefined);
    const onPasteError = vi.fn();
    render(<TaskImagePasteInput onPasteImage={onPasteImage} onPasteError={onPasteError} />);
    await waitFor(() => expect(native.attach).toHaveBeenCalledTimes(1));
    const session = native.attach.mock.calls[0][1];
    await act(async () => {
      send({ session, uri: "file:///bad.png" });
      send({ session, uri: "file:///good.png" });
    });
    expect(onPasteError).toHaveBeenCalledWith("Could not paste this image. Try again.");
    expect(onPasteImage).toHaveBeenCalledTimes(2);
    expect(native.release).toHaveBeenCalledWith("file:///bad.png");
    expect(native.release).toHaveBeenCalledWith("file:///good.png");
  });
});
