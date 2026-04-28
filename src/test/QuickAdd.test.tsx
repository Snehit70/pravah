/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuickAdd } from "../components/QuickAdd";
import { getTomorrowDateString } from "../lib/quickAddDates";
import { getLocalDateString } from "../lib/utils";

const addTaskMock = vi.fn();
const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: () => addTaskMock,
}));

vi.mock("../components/useToast", () => ({
  useToast: () => ({
    showError: showErrorMock,
    showSuccess: showSuccessMock,
  }),
}));

describe("QuickAdd", () => {
  beforeEach(() => {
    addTaskMock.mockReset();
    addTaskMock.mockResolvedValue(undefined);
    showErrorMock.mockReset();
    showSuccessMock.mockReset();
  });

  it("submits open tasks with trimmed title", async () => {
    const onClose = vi.fn();
    render(<QuickAdd onClose={onClose} />);

    const titleInput = screen.getByPlaceholderText("What needs doing?");
    fireEvent.change(titleInput, { target: { value: "  Write tests  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => {
      expect(addTaskMock).toHaveBeenCalledWith({
        title: "Write tests",
        type: "open",
        deadline: undefined,
        priority: undefined,
      });
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("submits deadline tasks with selected date and local minimum", async () => {
    const onClose = vi.fn();
    render(<QuickAdd onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Deadline" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), {
      target: { value: "Submit PR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => {
      expect(addTaskMock).toHaveBeenCalledWith({
        title: "Submit PR",
        type: "deadline",
        deadline: getLocalDateString(),
        scheduledDate: getLocalDateString(),
        priority: undefined,
      });
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("uses tomorrow deadline when deadline type and tomorrow are selected", async () => {
    const onClose = vi.fn();
    render(<QuickAdd onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Deadline" }));
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), {
      target: { value: "Tomorrow deadline" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => {
      expect(addTaskMock).toHaveBeenCalledWith({
        title: "Tomorrow deadline",
        type: "deadline",
        deadline: getTomorrowDateString(),
        scheduledDate: getTomorrowDateString(),
        priority: undefined,
      });
    });
  });

  it("shows error when deadline task is submitted without date", async () => {
    const onClose = vi.fn();
    render(<QuickAdd onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), {
      target: { value: "Due soon" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Deadline" }));

    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith("Deadline tasks need a due date");
    });
    expect(addTaskMock).not.toHaveBeenCalled();
  });
});
