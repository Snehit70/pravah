/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TaskImageBudgetNotice } from "../components/TaskImageBudgetNotice";

describe("Task-image budget notice", () => {
  it("stays hidden during normal usage", () => {
    const { container } = render(
      <TaskImageBudgetNotice status={{
        status: "normal",
        warning: false,
        grantsBlocked: false,
        usage: { pooledPercentage: 20 },
      }} />
    );
    expect(container.textContent).toBe("");
  });

  it("shows a persistent warning at 70% without provider context", () => {
    render(
      <TaskImageBudgetNotice status={{
        status: "warning",
        warning: true,
        grantsBlocked: false,
        usage: { pooledPercentage: 70 },
      }} />
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Task image usage is at 70%. New uploads pause at 85%."
    );
    expect(screen.getByRole("alert").textContent).not.toMatch(/cloudinary|provider|upload[_ -]?id/i);
  });

  it("explains fail-closed grant blocking while leaving existing images usable", () => {
    render(
      <TaskImageBudgetNotice status={{
        status: "unavailable",
        warning: false,
        grantsBlocked: true,
        usage: null,
      }} />
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "New Task image uploads are paused while usage is unavailable. Existing images remain available."
    );
  });
});
