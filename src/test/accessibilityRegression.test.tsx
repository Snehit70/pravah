/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import { QuickAdd } from "../components/QuickAdd";
import { TaskPopup } from "../components/TaskPopup";
import { ToastProvider } from "../components/Toast";

const useMutationMock = vi.fn();
const addTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const completeTaskMock = vi.fn();
const reopenTaskMock = vi.fn();
const unscheduleTaskMock = vi.fn();
const deleteTaskMock = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

function renderWithToasts(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    _id: "task_1" as Id<"tasks">,
    title: "Accessibility Task",
    type: "open",
    position: 0,
    status: "scheduled",
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("accessibility regressions", () => {
  beforeEach(() => {
    useMutationMock.mockReset();
    addTaskMock.mockReset();
    updateTaskMock.mockReset();
    completeTaskMock.mockReset();
    reopenTaskMock.mockReset();
    unscheduleTaskMock.mockReset();
    deleteTaskMock.mockReset();

    addTaskMock.mockResolvedValue(undefined);
    updateTaskMock.mockResolvedValue(undefined);
    completeTaskMock.mockResolvedValue(undefined);
    reopenTaskMock.mockResolvedValue(undefined);
    unscheduleTaskMock.mockResolvedValue(undefined);
    deleteTaskMock.mockResolvedValue(undefined);
  });

  it("focuses quick-add title input on open and supports Escape close", () => {
    const onClose = vi.fn();
    useMutationMock.mockImplementation(() => addTaskMock);

    renderWithToasts(<QuickAdd onClose={onClose} />);

    const titleInput = screen.getByPlaceholderText("What needs to be done?");
    expect(document.activeElement).toBe(titleInput);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("announces quick-add success in aria-live region", async () => {
    const onClose = vi.fn();
    useMutationMock.mockImplementation(() => addTaskMock);

    renderWithToasts(<QuickAdd onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText("What needs to be done?"), {
      target: { value: "  Announced task  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));

    await waitFor(() => {
      expect(addTaskMock).toHaveBeenCalledWith({
        title: "Announced task",
        type: "open",
        deadline: undefined,
      });
    });

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Task added!");
  });

  it("announces task completion from popup mutations", async () => {
    const onClose = vi.fn();

    let callIndex = 0;
    useMutationMock.mockImplementation(() => {
      callIndex += 1;
      const slot = ((callIndex - 1) % 5) + 1;
      if (slot === 1) return updateTaskMock;
      if (slot === 2) return completeTaskMock;
      if (slot === 3) return reopenTaskMock;
      if (slot === 4) return unscheduleTaskMock;
      return deleteTaskMock;
    });

    renderWithToasts(<TaskPopup task={makeTask()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Complete" }));

    await waitFor(() => {
      expect(completeTaskMock).toHaveBeenCalledWith({ taskId: "task_1" });
      expect(onClose).toHaveBeenCalled();
    });

    const region = screen.getByRole("status");
    await waitFor(() => {
      expect(region).toHaveTextContent("Task completed!");
    });
  });
});
