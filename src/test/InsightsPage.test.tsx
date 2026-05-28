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
    type: "open",
    position: 0,
    status: "scheduled",
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
          makeTask({ _id: "a" as Id<"tasks">, status: "inbox", title: "Inbox" }),
          makeTask({ _id: "b" as Id<"tasks">, status: "completed", title: "Done", updatedAt: 40 }),
          makeTask({
            _id: "c" as Id<"tasks">,
            status: "scheduled",
            title: "Overdue",
            scheduledDate: yesterday < today ? yesterday : "2000-01-01",
          }),
          makeTask({ _id: "d" as Id<"tasks">, status: "scheduled", title: "Upcoming", scheduledDate: tomorrow }),
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
    render(
      <InsightsPage
        tasks={[
          makeTask({ _id: "a" as Id<"tasks">, title: "Complete me", status: "completed", updatedAt: 20 }),
          makeTask({ _id: "b" as Id<"tasks">, title: "Still open", status: "scheduled", scheduledDate: "2099-01-01" }),
          makeTask({ _id: "c" as Id<"tasks">, title: "Another done", status: "completed", updatedAt: 30 }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Completed" }));

    expect(screen.getByText("Completed Tasks")).toBeInTheDocument();
    expect(screen.getByText("Another done")).toBeInTheDocument();
    expect(screen.getByText("Complete me")).toBeInTheDocument();
    expect(screen.queryByText("Still open")).not.toBeInTheDocument();
  });
});
