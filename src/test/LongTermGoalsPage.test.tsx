/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LongTermGoalsPage } from "../components/LongTermGoalsPage";

describe("LongTermGoalsPage", () => {
  it("renders server-backed read-only goals with progress", () => {
    render(
      <LongTermGoalsPage
        readOnly
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
});

