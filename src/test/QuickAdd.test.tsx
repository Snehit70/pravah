/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuickAdd } from "../components/QuickAdd";
import { getLocalDateString } from "../lib/utils";

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTomorrowDateString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalDateString(tomorrow);
}

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

    const titleInput = screen.getByPlaceholderText("What needs to be done?");
    fireEvent.change(titleInput, { target: { value: "  Write tests  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));

    await waitFor(() => {
      expect(addTaskMock).toHaveBeenCalledWith({
        title: "Write tests",
        type: "open",
        deadline: undefined,
      });
    });

    expect(showSuccessMock).toHaveBeenCalledWith("Task added!");
    expect(onClose).toHaveBeenCalled();
  });

  it("submits deadline tasks with selected date and local minimum", async () => {
    const onClose = vi.fn();
    render(<QuickAdd onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Deadline" }));

    const deadlineInput = document.querySelector("input[type='date']") as HTMLInputElement;
    expect(deadlineInput).toBeTruthy();
    expect(deadlineInput.min).toBe(getLocalDateString());

    fireEvent.change(screen.getByPlaceholderText("What needs to be done?"), {
      target: { value: "Submit PR" },
    });
    fireEvent.change(deadlineInput, { target: { value: "2026-04-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));

    await waitFor(() => {
      expect(addTaskMock).toHaveBeenCalledWith({
        title: "Submit PR",
        type: "deadline",
        deadline: "2026-04-12",
      });
    });

    expect(showSuccessMock).toHaveBeenCalledWith("Task added!");
    expect(onClose).toHaveBeenCalled();
  });

  it("prefills deadline with tomorrow when deadline type is selected", () => {
    const onClose = vi.fn();
    render(<QuickAdd onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Deadline" }));
    const deadlineInput = document.querySelector("input[type='date']") as HTMLInputElement;

    expect(deadlineInput.value).toBe(getTomorrowDateString());
  });

  it("shows inline deadline error when deadline task is submitted without date", async () => {
    const onClose = vi.fn();
    render(<QuickAdd onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText("What needs to be done?"), {
      target: { value: "Due soon" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Deadline" }));

    const deadlineInput = document.querySelector("input[type='date']") as HTMLInputElement;
    fireEvent.change(deadlineInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));

    await waitFor(() => {
      expect(screen.getByText("Deadline date is required")).toBeInTheDocument();
    });
    expect(addTaskMock).not.toHaveBeenCalled();
  });
});
