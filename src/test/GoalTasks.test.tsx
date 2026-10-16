/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GoalTasks } from "../components/goals/GoalTasks";
import type { Task } from "../types";

const mock = vi.hoisted(() => ({ results: [] as Task[], status: "Exhausted", loadMore: vi.fn(), mutate: vi.fn(), query: vi.fn() }));
vi.mock("../lib/data", () => ({
  usePaginatedQuery: (...args: unknown[]) => { mock.query(...args); return { results: mock.results, status: mock.status, loadMore: mock.loadMore }; },
  useMutation: (ref: Record<symbol, string>) => (args: unknown) => mock.mutate(ref[Symbol.for("functionName")], args),
}));
const task = (id: string, extra: Partial<Task> = {}): Task => ({ _id: id as Task["_id"], title: id, position: 1, scheduledAt: 1, createdBy: "user", createdAt: 1, updatedAt: 1, ...extra });
const open = vi.fn();
const renderTasks = (readOnly = false) => render(<GoalTasks goal={{ id: "g1", text: "Ship" }} progress={{ total: 100, done: 1 }} onOpenTask={open} readOnly={readOnly} />);

beforeEach(() => { mock.results = []; mock.status = "Exhausted"; vi.clearAllMocks(); mock.mutate.mockResolvedValue(undefined); });

describe("Goal linked tasks", () => {
  it("replaces loading rows with fetched goal tasks without showing an empty list first", () => {
    mock.status = "LoadingFirstPage";
    const view = renderTasks();
    expect(screen.getByRole("status", { name: "Loading linked tasks" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Active tasks" })).not.toBeInTheDocument();
    mock.status = "Exhausted";
    mock.results = [task("loaded")];
    view.rerender(<GoalTasks goal={{ id: "g1", text: "Ship" }} readOnly={false} />);
    expect(screen.queryByRole("status", { name: "Loading linked tasks" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "loaded" })).toBeInTheDocument();
  });

  it("reads this goal, displays every returned task, deduplicates and separates completed tasks", () => {
    mock.results = [task("one"), task("two"), task("three"), task("one"), task("done", { completedAt: 100 }), task("deleted", { cancelledAt: 100 })];
    renderTasks();
    expect(mock.query).toHaveBeenCalledWith(expect.anything(), { goalClientId: "g1" }, { initialNumItems: 50 });
    expect(within(screen.getByRole("region", { name: "Active tasks" })).getAllByRole("listitem")).toHaveLength(3);
    expect(within(screen.getByRole("region", { name: "Completed tasks" })).getByText("done")).toBeInTheDocument();
    expect(screen.queryByText("deleted")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "three" }));
    expect(open).toHaveBeenCalledWith(mock.results[2]);
  });

  it("can continue after an empty scanned page and disables concurrent pagination", () => {
    mock.status = "CanLoadMore";
    const view = renderTasks();
    fireEvent.click(screen.getByRole("button", { name: "Load more linked tasks" }));
    expect(mock.loadMore).toHaveBeenCalledWith(50);
    mock.status = "LoadingMore";
    view.rerender(<GoalTasks goal={{ id: "g1", text: "Ship" }} readOnly={false} />);
    expect(screen.getByRole("button", { name: "Loading more…" })).toBeDisabled();
  });

  it("completes, reopens and schedules tasks using their actual ids", async () => {
    mock.results = [task("inbox"), task("done", { completedAt: 100 })];
    renderTasks();
    fireEvent.click(screen.getByLabelText("Complete inbox"));
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledWith("tasks:completeTask", { taskId: "inbox" }));
    fireEvent.click(screen.getByLabelText("Reopen done"));
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledWith("tasks:reopenTask", { taskId: "done" }));
    await waitFor(() => expect(screen.getByLabelText("Schedule inbox")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Schedule inbox"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledWith("tasks:moveTask", { taskId: "inbox", targetDate: "2026-12-01" }));
  });

  it("keeps a failed task creation draft and retries with the same idempotency key", async () => {
    mock.mutate.mockRejectedValueOnce(new Error("lost response")).mockResolvedValue(undefined);
    renderTasks();
    fireEvent.change(screen.getByLabelText("Add a linked task"), { target: { value: "Write release notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is kept");
    expect(screen.getByLabelText("Add a linked task")).toHaveValue("Write release notes");
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(screen.getByLabelText("Add a linked task")).toHaveValue(""));
    expect(mock.mutate.mock.calls[0]).toEqual(mock.mutate.mock.calls[1]);
    expect(mock.mutate.mock.calls[0]).toEqual(["tasks:bulkCreateTasks", { idempotencyKey: expect.any(String), tasks: [{ title: "Write release notes", deadline: undefined, goalClientId: "g1" }] }]);
  });

  it("reports failed task actions without removing the task", async () => {
    mock.results = [task("inbox")];
    mock.mutate.mockRejectedValue(new Error("offline"));
    renderTasks();
    fireEvent.click(screen.getByLabelText("Complete inbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update this task");
    expect(screen.getByRole("button", { name: "inbox" })).toBeInTheDocument();
    expect(screen.getByLabelText("Complete inbox")).toBeEnabled();
  });

  it("exposes no write controls in read-only mode", () => {
    mock.results = [task("inbox"), task("done", { completedAt: 100 })];
    renderTasks(true);
    expect(screen.queryByRole("form", { name: "Add task to goal" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Complete inbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reopen done")).not.toBeInTheDocument();
  });
});
