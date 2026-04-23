/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import { QuickAdd } from "../components/QuickAdd";
import { TaskPopup } from "../components/TaskPopup";
import { renderWithProviders } from "./renderWithProviders";

const addTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const completeTaskMock = vi.fn();
const reopenTaskMock = vi.fn();
const unscheduleTaskMock = vi.fn();
const deleteTaskMock = vi.fn();

const mutationMocks: Record<string, ReturnType<typeof vi.fn>> = {
  "tasks.addTask": addTaskMock,
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
      addTask: "tasks.addTask",
      updateTask: "tasks.updateTask",
      completeTask: "tasks.completeTask",
      reopenTask: "tasks.reopenTask",
      unscheduleTask: "tasks.unscheduleTask",
      deleteTask: "tasks.deleteTask",
    },
  },
}));

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

    renderWithProviders(<QuickAdd onClose={onClose} />);

    const titleInput = screen.getByPlaceholderText("What needs to be done?");
    expect(document.activeElement).toBe(titleInput);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("announces quick-add success in aria-live region", async () => {
    const onClose = vi.fn();

    renderWithProviders(<QuickAdd onClose={onClose} />);

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

    renderWithProviders(<TaskPopup task={makeTask()} onClose={onClose} />);

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
