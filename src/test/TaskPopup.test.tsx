/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Task } from "../types";
import { TaskPopup } from "../components/TaskPopup";

const updateTaskMock = vi.fn();
const setGoalLinkMock = vi.fn();
const completeTaskMock = vi.fn();
const reopenTaskMock = vi.fn();
const moveTaskMock = vi.fn();
const unscheduleTaskMock = vi.fn();
const softDeleteTaskMock = vi.fn();
const restoreTaskMock = vi.fn();
const showToastMock = vi.fn();
const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();

const mutationMocks: Record<string, ReturnType<typeof vi.fn>> = {
  "tasks.updateTask": updateTaskMock,
  "goals.setLink": setGoalLinkMock,
  "tasks.completeTask": completeTaskMock,
  "tasks.reopenTask": reopenTaskMock,
  "tasks.moveTask": moveTaskMock,
  "tasks.unscheduleTask": unscheduleTaskMock,
  "tasks.softDeleteTask": softDeleteTaskMock,
  "tasks.restoreTask": restoreTaskMock,
};

vi.mock("convex/react", () => ({
  useQuery: (ref: string) => {
    if (ref === "goals.list") return [{ id: "g1", text: "Goal Alpha" }];
    if (ref === "goals.listLinks") return { task_1: "g1" };
    return undefined;
  },
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

vi.mock("../components/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
    showError: showErrorMock,
    showSuccess: showSuccessMock,
  }),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    _id: "task_1" as Id<"tasks">,
    title: "Existing task",
    position: 0,
    scheduledAt: 1,
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("TaskPopup", () => {
  beforeEach(() => {
    localStorage.setItem("pravah:ff:web-goals-linking", "1");
    updateTaskMock.mockReset();
    setGoalLinkMock.mockReset();
    completeTaskMock.mockReset();
    reopenTaskMock.mockReset();
    moveTaskMock.mockReset();
    unscheduleTaskMock.mockReset();
    softDeleteTaskMock.mockReset();
    restoreTaskMock.mockReset();
    showToastMock.mockReset();
    showErrorMock.mockReset();
    showSuccessMock.mockReset();
    updateTaskMock.mockResolvedValue(undefined);
    setGoalLinkMock.mockResolvedValue(undefined);
    softDeleteTaskMock.mockResolvedValue(undefined);
    restoreTaskMock.mockResolvedValue(undefined);
  });

  it("saves changed goal link with task update", async () => {
    const onClose = vi.fn();
    render(<TaskPopup task={makeTask()} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Linked Goal"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(setGoalLinkMock).toHaveBeenCalledWith({
        taskId: "task_1",
        goalClientId: null,
      });
    });
    expect(showSuccessMock).toHaveBeenCalledWith("Task updated successfully");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows partial success when task saves but goal link fails", async () => {
    const onClose = vi.fn();
    setGoalLinkMock.mockRejectedValueOnce(new Error("link failed"));
    render(<TaskPopup task={makeTask()} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Linked Goal"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith("Task saved, but goal link failed. Try Save again.");
    });
    expect(onClose).not.toHaveBeenCalled();
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
        deadline: null,
        time: null,
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
    expect(softDeleteTaskMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => {
      expect(softDeleteTaskMock).toHaveBeenCalledWith({ taskId: "task_1" });
    });

    expect(showToastMock).toHaveBeenCalledWith("Task moved to trash", "info", expect.objectContaining({ label: "Undo" }));
    expect(onClose).toHaveBeenCalled();

    const undoAction = showToastMock.mock.calls[0]?.[2] as { run: () => Promise<void> };
    await undoAction.run();
    expect(restoreTaskMock).toHaveBeenCalledWith({ taskId: "task_1" });
    expect(showSuccessMock).toHaveBeenCalledWith("Task restored");
  });

  it("quick-schedules an open task without requiring Save", async () => {
    const onClose = vi.fn();
    render(<TaskPopup task={makeTask()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    await waitFor(() => {
      expect(moveTaskMock).toHaveBeenCalledWith({
        taskId: "task_1",
        targetDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });
    expect(showSuccessMock).toHaveBeenCalledWith("Scheduled for Today");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a specific message when unschedule mutation is unavailable on backend", async () => {
    const onClose = vi.fn();
    unscheduleTaskMock.mockRejectedValue(
      new Error("Could not find public function for 'tasks:unscheduleTask'")
    );

    render(<TaskPopup task={makeTask({ deadline: "2026-04-10" })} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Unschedule" }));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith(
        "Unschedule is unavailable on this backend. Run convex dev/deploy."
      );
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
