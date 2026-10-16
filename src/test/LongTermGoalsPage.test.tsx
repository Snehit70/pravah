/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LongTermGoalsPage } from "../components/LongTermGoalsPage";

vi.mock("../components/goals/GoalTasks", () => ({ GoalTasks: ({ goal }: { goal: { id: string } }) => <div>All tasks for {goal.id}</div> }));

describe("LongTermGoalsPage", () => {
  it("renders server-backed goals with progress", () => {
    render(
      <LongTermGoalsPage
        serverBacked
        serverGoals={[
          { id: "g2", text: "Second", createdAt: 20 },
          { id: "g1", text: "First", createdAt: 10 },
        ]}
        progressByGoalId={{
          g1: { done: 1, total: 2 },
          g2: { done: 0, total: 0 },
        }}
      />
    );

    expect(screen.getByText("Open a goal to see all its linked tasks.")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    expect(screen.getByText("No tasks linked")).toBeInTheDocument();
  });

  it("calls create and delete handlers in server-backed mode", async () => {
    const onCreateServerGoal = vi.fn().mockResolvedValue(undefined);
    const onDeleteServerGoal = vi.fn().mockResolvedValue(undefined);

    render(
      <LongTermGoalsPage
        serverBacked
        serverGoals={[{ id: "g1", text: "Existing goal", createdAt: 10 }]}
        onCreateServerGoal={onCreateServerGoal}
        onDeleteServerGoal={onDeleteServerGoal}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("What do you want to achieve?"), {
      target: { value: " New goal " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add long-term goal" }));
    await waitFor(() => {
      expect(onCreateServerGoal).toHaveBeenCalledWith("New goal");
    });

    fireEvent.click(screen.getByLabelText("Delete goal: Existing goal"));
    expect(onDeleteServerGoal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete goal permanently" }));
    await waitFor(() => {
      expect(onDeleteServerGoal).toHaveBeenCalledWith("g1");
    });
  });

  it("passes notes, priority and deadline from the composer at creation", async () => {
    const onCreateServerGoal = vi.fn().mockResolvedValue(undefined);

    render(
      <LongTermGoalsPage
        serverBacked
        serverGoals={[{ id: "g1", text: "Existing goal", createdAt: 10 }]}
        onCreateServerGoal={onCreateServerGoal}
      />
    );

    fireEvent.focus(screen.getByPlaceholderText("What do you want to achieve?"));
    fireEvent.change(screen.getByPlaceholderText("What do you want to achieve?"), {
      target: { value: "Rich goal" },
    });
    fireEvent.change(screen.getByLabelText("Goal notes"), {
      target: { value: "Ship it calm" },
    });
    fireEvent.click(screen.getByRole("button", { name: "P1" }));
    fireEvent.change(screen.getByLabelText("New goal deadline"), {
      target: { value: "2026-12-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add long-term goal" }));

    await waitFor(() => {
      expect(onCreateServerGoal).toHaveBeenCalledWith("Rich goal", {
        description: "Ship it calm",
        deadline: "2026-12-31",
        priority: "p1",
      });
    });
  });
});


describe("Goal workspace navigation", () => {
  it("opens a full goal workspace and returns to the filtered overview", () => {
    render(<LongTermGoalsPage serverBacked serverGoals={[{ id: "g1", text: "Ship" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "View all tasks for Ship" }));
    expect(screen.getByText("All tasks for g1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Ship" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← All goals" }));
    expect(screen.getByLabelText("Search goals")).toBeInTheDocument();
  });

  it("separates finished goals, searches notes and sorts by name", () => {
    render(<LongTermGoalsPage serverBacked serverGoals={[{ id: "a", text: "Zebra", description: "Travel" }, { id: "b", text: "Alpha" }, { id: "c", text: "Finished" }]} progressByGoalId={{ c: { total: 1, done: 1 } }} />);
    expect(screen.queryByText("Finished", { selector: "h2 button" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sort goals"), { target: { value: "name" } });
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Alpha", "Zebra"]);
    fireEvent.change(screen.getByLabelText("Search goals"), { target: { value: "travel" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Zebra")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search goals"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "finished" }));
    expect(screen.getByRole("heading", { level: 2, name: "Finished" })).toBeInTheDocument();
  });

  it("renames a goal and clears optional metadata", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    render(<LongTermGoalsPage serverBacked serverGoals={[{ id: "g1", text: "Old", description: "Notes", deadline: "2026-12-01", priority: "p1" }]} onUpdateServerGoal={update} />);
    fireEvent.click(screen.getByLabelText("Edit goal: Old"));
    fireEvent.change(screen.getByLabelText("Name for Old"), { target: { value: " New " } });
    fireEvent.change(screen.getByLabelText("Description for Old"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Deadline for Old"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Priority for Old"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save goal" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("g1", { text: "New", description: undefined, deadline: undefined, priority: undefined }));
  });

  it("keeps deletion confirmation available after a failed request", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("offline"));
    render(<LongTermGoalsPage serverBacked serverGoals={[{ id: "g1", text: "Ship" }]} onDeleteServerGoal={remove} />);
    fireEvent.click(screen.getByLabelText("Delete goal: Ship"));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal permanently" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete goal");
    expect(screen.getByRole("button", { name: "Delete goal permanently" })).toBeEnabled();
  });
});
