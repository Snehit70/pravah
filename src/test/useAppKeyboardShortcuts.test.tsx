/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useAppKeyboardShortcuts } from "../hooks/useAppKeyboardShortcuts";

function TestHarness({
  openQuickAdd,
  closeQuickAdd,
  closeTaskPopup,
}: {
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  closeTaskPopup: () => void;
}) {
  useAppKeyboardShortcuts({
    openQuickAdd,
    closeQuickAdd,
    closeTaskPopup,
  });
  return null;
}

describe("useAppKeyboardShortcuts", () => {
  it("opens quick add on Cmd/Ctrl + N", () => {
    const openQuickAdd = vi.fn();
    const closeQuickAdd = vi.fn();
    const closeTaskPopup = vi.fn();

    render(
      <TestHarness
        openQuickAdd={openQuickAdd}
        closeQuickAdd={closeQuickAdd}
        closeTaskPopup={closeTaskPopup}
      />
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true }));
    expect(openQuickAdd).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", metaKey: true }));
    expect(openQuickAdd).toHaveBeenCalledTimes(2);
  });

  it("closes overlays on Escape", () => {
    const openQuickAdd = vi.fn();
    const closeQuickAdd = vi.fn();
    const closeTaskPopup = vi.fn();

    render(
      <TestHarness
        openQuickAdd={openQuickAdd}
        closeQuickAdd={closeQuickAdd}
        closeTaskPopup={closeTaskPopup}
      />
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(closeQuickAdd).toHaveBeenCalledTimes(1);
    expect(closeTaskPopup).toHaveBeenCalledTimes(1);
  });
});
