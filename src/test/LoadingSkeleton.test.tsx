/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { LongTermGoalsPage } from "../components/LongTermGoalsPage";
import { GoalTaskListSkeleton } from "../components/loading/PageSkeleton";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Current workspace loading layouts", () => {
  it("uses the three-tab header and current timeline dimensions, with no stale rail labels", () => {
    const { container } = render(<LoadingSkeleton page="timeline" />);
    expect(screen.getByRole("status", { name: "Loading timeline workspace" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Insights")).toBeInTheDocument();
    expect(screen.queryByText("OPEN")).not.toBeInTheDocument();
    expect(screen.queryByText("DEADLINE")).not.toBeInTheDocument();
    expect(screen.queryByText("SYNCING WORKSPACE")).not.toBeInTheDocument();
    expect(container.querySelector('header')).toHaveStyle({ height: "56px" });
    expect(container.querySelector('[data-skeleton-page="timeline"]')).toBeInTheDocument();
    expect(container.querySelector('[data-skeleton-inbox]')).toBeInTheDocument();
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(4);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["goals", "insights", "settings"] as const)("restores the %s loading layout instead of flashing the timeline", (page) => {
    sessionStorage.setItem("pravah_active_page", page);
    const { container } = render(<LoadingSkeleton />);
    expect(screen.getByRole("status", { name: `Loading ${page} workspace` })).toBeInTheDocument();
    expect(container.querySelector(`[data-skeleton-page="${page}"]`)).toBeInTheDocument();
    expect(container.querySelector('[data-skeleton-page="timeline"]')).not.toBeInTheDocument();
    expect(Boolean(container.querySelector('[data-skeleton-inbox]'))).toBe(page === "insights");
  });

  it("falls back to timeline when browser storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); } });
    render(<LoadingSkeleton />);
    expect(screen.getByRole("status", { name: "Loading timeline workspace" })).toBeInTheDocument();
  });

  it("shows goal loading rather than reporting a false empty workspace", () => {
    const view = render(<LongTermGoalsPage serverBacked />);
    expect(screen.getByRole("status", { name: "Loading goals" })).toBeInTheDocument();
    expect(screen.queryByText("No goals yet.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Goal title")).not.toBeInTheDocument();
    view.rerender(<LongTermGoalsPage serverBacked serverGoals={[]} />);
    expect(screen.queryByRole("status", { name: "Loading goals" })).not.toBeInTheDocument();
    expect(screen.getByText("No goals yet.")).toBeInTheDocument();
  });

  it("keeps linked-task placeholders non-interactive in read-only views", () => {
    const { container } = render(<GoalTaskListSkeleton readOnly />);
    expect(screen.getByRole("status", { name: "Loading linked tasks" })).toBeInTheDocument();
    expect(container.querySelector("button, input")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 linked tasks/)).not.toBeInTheDocument();
  });
});
