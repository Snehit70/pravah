/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
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

    expect(screen.getByText("Total Tasks")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Completed" })).toBeInTheDocument();
    expect(screen.getByText("Tasks marked done.")).toBeInTheDocument();
    expect(screen.getByText("Scheduled before today and still open.")).toBeInTheDocument();
    expect(screen.getByText("Completion Rate")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
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

    expect(screen.getByText("Completed Tasks")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search completed tasks" }), {
      target: { value: "older" },
    });

    expect(screen.getByText("Older report")).toBeInTheDocument();
    expect(screen.queryByText("Recent report")).not.toBeInTheDocument();
  });
});
