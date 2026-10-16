/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "../types";
import type { Id } from "../../convex/_generated/dataModel";
import { InsightsPage } from "../components/InsightsPage";
import { getLocalDateString } from "../lib/utils";

function makeTask(overrides: Partial<Task>): Task {
  return {
    _id: "task_1" as Id<"tasks">,
    title: "Task",
    position: 0,
    scheduledAt: 1,
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("InsightsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps heatmap completions on their actual dates after Sunday alignment", () => {
    const now = new Date(2026, 9, 15, 12).getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    render(<InsightsPage tasks={[
      makeTask({ _id: "today" as Id<"tasks">, completedAt: now }),
      makeTask({ _id: "old" as Id<"tasks">, completedAt: new Date(2026, 3, 17, 12).getTime() }),
    ]} />);
    expect(screen.getByRole("button", { name: "Thu, Oct 15: 1 completed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fri, Apr 17: 1 completed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sun, Apr 12: no completions" })).toBeInTheDocument();
  });

  it("uses the chart's calendar-day boundary for completion history", () => {
    const now = new Date(2026, 9, 15, 12).getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    render(<InsightsPage tasks={[
      makeTask({ _id: "start" as Id<"tasks">, title: "First day", completedAt: new Date(2026, 8, 16).getTime() }),
      makeTask({ _id: "before" as Id<"tasks">, title: "Outside window", completedAt: new Date(2026, 8, 15, 18).getTime() }),
      makeTask({ _id: "today" as Id<"tasks">, title: "Today", completedAt: now }),
      makeTask({ _id: "future" as Id<"tasks">, title: "Future", completedAt: now + 60_000 }),
    ]} />);
    expect(screen.getByText("tasks completed").previousElementSibling).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("tab", { name: "Completed" }));
    expect(screen.getByText("1–2 of 2 shown")).toBeInTheDocument();
    expect(screen.getByText("First day")).toBeInTheDocument();
    expect(screen.queryByText("Outside window")).not.toBeInTheDocument();
    expect(screen.queryByText("Future")).not.toBeInTheDocument();
  });

  it("lets users browse every completed task and resets pagination on search", () => {
    const now = Date.now();
    const tasks = Array.from({ length: 239 }, (_, index) => makeTask({
      _id: `history-${index}` as Id<"tasks">,
      title: `History task ${index}`,
      completedAt: now - index * 1000,
    }));
    render(<InsightsPage tasks={[]} completedTasks={tasks} />);
    fireEvent.click(screen.getByRole("tab", { name: "Completed" }));
    expect(screen.getByText("1–100 of 239 shown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("101–200 of 239 shown")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("History task 238")).toBeInTheDocument();
    expect(screen.getByText("201–239 of 239 shown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search completed tasks" }), { target: { value: "History task 0" } });
    expect(screen.getByText("1–1 of 1 shown")).toBeInTheDocument();
    expect(screen.getByText("History task 0")).toBeInTheDocument();
  });

  it("renders lean stats metrics from task data", () => {
    const today = getLocalDateString();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    render(
      <InsightsPage
        tasks={[
          makeTask({ _id: "a" as Id<"tasks">, title: "Inbox" }),
          makeTask({ _id: "b" as Id<"tasks">, completedAt: 40, title: "Done", updatedAt: 40 }),
          makeTask({
            _id: "c" as Id<"tasks">,
            title: "Overdue",
            deadline: yesterday < today ? yesterday : "2000-01-01",
          }),
          makeTask({ _id: "d" as Id<"tasks">, title: "Upcoming", deadline: tomorrow }),
        ]}
      />
    );

    expect(screen.getByText("Recent momentum")).toBeInTheDocument();
    expect(screen.getByText("tasks completed")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Completed" })).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("switches to Completed tab and shows only completed tasks", () => {
    const now = Date.now();
    render(
      <InsightsPage
        tasks={[
          makeTask({ _id: "a" as Id<"tasks">, title: "Complete me", completedAt: now - 2 * 86400000, updatedAt: now - 2 * 86400000 }),
          makeTask({ _id: "b" as Id<"tasks">, title: "Still open", deadline: "2099-01-01" }),
          makeTask({ _id: "c" as Id<"tasks">, title: "Another done", completedAt: now - 86400000, updatedAt: now - 86400000 }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Completed" }));

    expect(screen.getByText("Completion history")).toBeInTheDocument();
    expect(screen.getByText("Another done")).toBeInTheDocument();
    expect(screen.getByText("Complete me")).toBeInTheDocument();
    expect(screen.queryByText("Still open")).not.toBeInTheDocument();
  });

  it("searches and filters the server-backed completion history", () => {
    const now = Date.now();
    render(
      <InsightsPage
        tasks={[]}
        completedTasks={[
          makeTask({ _id: "recent" as Id<"tasks">, title: "Recent report", completedAt: now - 2 * 86400000 }),
          makeTask({ _id: "older" as Id<"tasks">, title: "Older report", completedAt: now - 45 * 86400000 }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Completed" }));
    expect(screen.getByText("Recent report")).toBeInTheDocument();
    expect(screen.queryByText("Older report")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "All time" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search completed tasks" }), {
      target: { value: "older" },
    });

    expect(screen.getByText("Older report")).toBeInTheDocument();
    expect(screen.queryByText("Recent report")).not.toBeInTheDocument();
  });
});
