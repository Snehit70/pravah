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
const moveTaskMock = vi.fn();
const unscheduleTaskMock = vi.fn();
const softDeleteTaskMock = vi.fn();
const restoreTaskMock = vi.fn();
const setGoalLinkMock = vi.fn();

const mutationMocks: Record<string, ReturnType<typeof vi.fn>> = {
  "tasks.addTask": addTaskMock,
  "tasks.updateTask": updateTaskMock,
  "tasks.completeTask": completeTaskMock,
  "tasks.reopenTask": reopenTaskMock,
  "tasks.moveTask": moveTaskMock,
  "tasks.unscheduleTask": unscheduleTaskMock,
  "tasks.softDeleteTask": softDeleteTaskMock,
  "tasks.restoreTask": restoreTaskMock,
  "goals.setLink": setGoalLinkMock,
};

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
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
      moveTask: "tasks.moveTask",
      unscheduleTask: "tasks.unscheduleTask",
      softDeleteTask: "tasks.softDeleteTask",
      restoreTask: "tasks.restoreTask",
    },
    goals: {
      list: "goals.list",
      listLinks: "goals.listLinks",
      setLink: "goals.setLink",
    },
  },
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    _id: "task_1" as Id<"tasks">,
    title: "Accessibility Task",
    position: 0,
    scheduledAt: 1,
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
    moveTaskMock.mockReset();
    unscheduleTaskMock.mockReset();
    softDeleteTaskMock.mockReset();
    restoreTaskMock.mockReset();
    setGoalLinkMock.mockReset();

    addTaskMock.mockResolvedValue(undefined);
    updateTaskMock.mockResolvedValue(undefined);
    completeTaskMock.mockResolvedValue(undefined);
    reopenTaskMock.mockResolvedValue(undefined);
    unscheduleTaskMock.mockResolvedValue(undefined);
    softDeleteTaskMock.mockResolvedValue(undefined);
    restoreTaskMock.mockResolvedValue(undefined);
    setGoalLinkMock.mockResolvedValue(undefined);
  });

  it("focuses quick-add title input on open and supports Escape close", async () => {
    const onClose = vi.fn();

    renderWithProviders(<QuickAdd onClose={onClose} />);

    const titleInput = screen.getByPlaceholderText("What needs doing?");
    await waitFor(() => {
      expect(document.activeElement).toBe(titleInput);
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits quick-add task and closes modal", async () => {
    const onClose = vi.fn();

    renderWithProviders(<QuickAdd onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), {
      target: { value: "  Announced task  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => {
      expect(addTaskMock).toHaveBeenCalledWith({
        title: "Announced task",
        description: undefined,
        deadline: undefined,
        time: undefined,
        priority: undefined,
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("captures a scheduled task time", async () => {
    const onClose = vi.fn();
    renderWithProviders(<QuickAdd onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), {
      target: { value: "Timed task" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    fireEvent.change(screen.getByLabelText("Task time"), {
      target: { value: "09:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => {
      expect(addTaskMock).toHaveBeenCalledWith({
        title: "Timed task",
        description: undefined,
        deadline: expect.any(String),
        time: "09:30",
        priority: undefined,
      });
    });
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
