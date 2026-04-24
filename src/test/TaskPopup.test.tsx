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

const mutationMocks: Record<string, ReturnType<typeof vi.fn>> = {
  "tasks.updateTask": updateTaskMock,
  "tasks.completeTask": completeTaskMock,
  "tasks.reopenTask": reopenTaskMock,
  "tasks.unscheduleTask": unscheduleTaskMock,
  "tasks.deleteTask": deleteTaskMock,
};

vi.mock("convex/react", () => ({
  useMutation: (ref: string) => {
    const mock = mutationMocks[ref];
    if (!mock) throw new Error(`Unexpected useMutation target: ${ref}`);
    return mock;
  },
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    tasks: {
      updateTask: "tasks.updateTask",
      completeTask: "tasks.completeTask",
      reopenTask: "tasks.reopenTask",
      unscheduleTask: "tasks.unscheduleTask",
      deleteTask: "tasks.deleteTask",
    },
  },
}));

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
