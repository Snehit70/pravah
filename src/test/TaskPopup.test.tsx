/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import { TaskPopup } from "../components/TaskPopup";

const updateTaskMock = vi.fn();
const completeTaskMock = vi.fn();
const reopenTaskMock = vi.fn();
const unscheduleTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();
const useMutationMock = vi.fn();

vi.mock("convex/react", () => {
  return {
    useMutation: (...args: unknown[]) => useMutationMock(...args),
  };
});

vi.mock("../components/useToast", () => ({
  useToast: () => ({
    showError: showErrorMock,
    showSuccess: showSuccessMock,
  }),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    _id: "task_1" as Id<"tasks">,
    title: "Existing task",
    type: "open",
    position: 0,
    status: "scheduled",
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("TaskPopup", () => {
  beforeEach(() => {
    updateTaskMock.mockReset();
    completeTaskMock.mockReset();
    reopenTaskMock.mockReset();
    unscheduleTaskMock.mockReset();
    deleteTaskMock.mockReset();
    showErrorMock.mockReset();
    showSuccessMock.mockReset();
    updateTaskMock.mockResolvedValue(undefined);
    deleteTaskMock.mockResolvedValue(undefined);

    let callIndex = 0;
    useMutationMock.mockReset();
    useMutationMock.mockImplementation(() => {
      callIndex += 1;
      const slot = ((callIndex - 1) % 5) + 1;
      if (slot === 1) return updateTaskMock;
      if (slot === 2) return completeTaskMock;
      if (slot === 3) return reopenTaskMock;
      if (slot === 4) return unscheduleTaskMock;
      if (slot === 5) return deleteTaskMock;
      return vi.fn();
    });
  });

  it("validates required title and saves trimmed values", async () => {
    const onClose = vi.fn();
    render(<TaskPopup task={makeTask({ title: "  Existing task  " })} onClose={onClose} />);

    const titleInput = screen.getByLabelText("Title");
    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTaskMock).not.toHaveBeenCalled();
    expect(screen.getByText("Title is required")).toBeInTheDocument();

    fireEvent.change(titleInput, { target: { value: "  Updated title  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateTaskMock).toHaveBeenCalledWith({
        taskId: "task_1",
        title: "Updated title",
        description: undefined,
        deadline: undefined,
        priority: undefined,
      });
    });

    expect(showSuccessMock).toHaveBeenCalledWith("Task updated successfully");
    expect(onClose).toHaveBeenCalled();
  });

  it("requires explicit delete confirmation before removing task", async () => {
    const onClose = vi.fn();
    render(<TaskPopup task={makeTask()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this task?")).toBeInTheDocument();
    expect(deleteTaskMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => {
      expect(deleteTaskMock).toHaveBeenCalledWith({ taskId: "task_1" });
    });

    expect(showSuccessMock).toHaveBeenCalledWith("Task deleted");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a specific message when unschedule mutation is unavailable on backend", async () => {
    const onClose = vi.fn();
    unscheduleTaskMock.mockRejectedValue(
      new Error("Could not find public function for 'tasks:unscheduleTask'")
    );

    render(<TaskPopup task={makeTask({ status: "scheduled" })} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Unschedule" }));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith(
        "Unschedule is unavailable on this backend. Run convex dev/deploy."
      );
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
