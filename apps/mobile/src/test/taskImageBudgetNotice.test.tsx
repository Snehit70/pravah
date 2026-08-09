/** @vitest-environment happy-dom */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-native", async () => {
  const ReactModule = await import("react");
  return {
    View: ({ children, accessibilityRole, accessibilityLiveRegion, accessible: _, style: __, ...props }:
      React.PropsWithChildren<Record<string, unknown>>) => ReactModule.createElement("div", {
        ...props,
        role: accessibilityRole,
        "aria-live": accessibilityLiveRegion,
      }, children),
    Text: ({ children, style: _, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      ReactModule.createElement("span", props, children),
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  };
});

vi.mock("../theme/tokens", () => ({
  colors: { warning: "#805712", warningMuted: "#f8ead0", text: "#241a12" },
  radii: { md: 12 },
  spacing: { sm: 8, md: 12 },
  typography: { bodyMd: { fontSize: 13 } },
}));

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
