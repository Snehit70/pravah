/** @vitest-environment happy-dom */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    tasks: {
      listTasks: { __ref: "tasks.listTasks" },
      getTimeline: { __ref: "tasks.getTimeline" },
      getTaskCounts: { __ref: "tasks.getTaskCounts" },
    },
  },
}));

import { buildTimelineWindow, useTaskQueries } from "../hooks/useTaskQueries";

const LIST_REF = { __ref: "tasks.listTasks" };
const TIMELINE_REF = { __ref: "tasks.getTimeline" };

function callsTo(ref: { __ref: string }, args?: unknown) {
  return useQueryMock.mock.calls.filter(([fn, payload]) => {
    if ((fn as { __ref?: string }).__ref !== ref.__ref) return false;
    if (args === undefined) return true;
    return JSON.stringify(payload) === JSON.stringify(args);
  });
}

describe("useTaskQueries — full corpus gating", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue([]);
  });

  afterEach(() => {
    useQueryMock.mockReset();
  });

  it("skips the all-tasks query when not authenticated", () => {
    renderHook(() => useTaskQueries({ isAuthenticated: false }));

    // The {} payload that listTasks uses for the full corpus must be "skip"
    // — not just when Kairo is closed, but always when the user is signed out.
    const fullCorpus = callsTo(LIST_REF).filter(
      ([, payload]) => payload === "skip" || JSON.stringify(payload) === "{}"
    );
    expect(fullCorpus.every(([, payload]) => payload === "skip")).toBe(true);
  });

  it("skips the all-tasks query when authenticated but Kairo is inactive", () => {
    renderHook(() =>
      useTaskQueries({ isAuthenticated: true, includeAllTasks: false })
    );

    const fullCorpusActive = callsTo(LIST_REF, {});
    expect(fullCorpusActive).toHaveLength(0);

    // The narrow status-scoped subscriptions still fire so tab switching is instant.
    expect(callsTo(LIST_REF, { status: "inbox" })).toHaveLength(1);
    expect(callsTo(LIST_REF, { status: "completed" })).toHaveLength(1);
  });

  it("subscribes to the full corpus when Kairo is active", () => {
    renderHook(() =>
      useTaskQueries({ isAuthenticated: true, includeAllTasks: true })
    );

    expect(callsTo(LIST_REF, {})).toHaveLength(1);
  });

  it("omits startDate so overdue scheduled tasks remain visible in the timeline", () => {
    const window = buildTimelineWindow(new Date());

    renderHook(() =>
      useTaskQueries({ isAuthenticated: true, includeAllTasks: false })
    );

    expect(callsTo(TIMELINE_REF, { endDate: window.weekEnd })).toHaveLength(1);
    expect(
      callsTo(TIMELINE_REF).some(
        ([, payload]) =>
          payload && typeof payload === "object" && "startDate" in (payload as object)
      )
    ).toBe(false);
  });
});
