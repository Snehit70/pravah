/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LongTermGoalsPage } from "../components/LongTermGoalsPage";

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

    expect(screen.getByText("Source of truth: Convex goals + goal links.")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("1/2 done")).toBeInTheDocument();
    expect(screen.getByText("0/0 done")).toBeInTheDocument();
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

    fireEvent.change(screen.getByPlaceholderText("Add a long-term goal..."), {
      target: { value: " New goal " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add long-term goal" }));
    await waitFor(() => {
      expect(onCreateServerGoal).toHaveBeenCalledWith("New goal");
    });

    fireEvent.click(screen.getByLabelText("Delete goal: Existing goal"));
    await waitFor(() => {
      expect(onDeleteServerGoal).toHaveBeenCalledWith("g1");
    });
  });
});
