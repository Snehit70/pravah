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
    },
    taskImages: {
      listWorkspaceImageCollections: { __ref: "taskImages.listWorkspaceImageCollections" },
    },
  },
}));

import {
  TIMELINE_FAR_FUTURE,
  buildTimelineWindow,
  nextIsoDate,
  useTaskQueries,
} from "../hooks/useTaskQueries";

const LIST_REF = { __ref: "tasks.listTasks" };
const TIMELINE_REF = { __ref: "tasks.getTimeline" };
const COUNTS_REF = { __ref: "tasks.getTaskCounts" };
const IMAGE_COLLECTIONS_REF = { __ref: "taskImages.listWorkspaceImageCollections" };

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

  it("skips history, today's completed count, and images until a screen asks", () => {
    const { result } = renderHook(() => useTaskQueries({ isAuthenticated: true }));

    expect(callsTo(LIST_REF, {})).toHaveLength(0);
    expect(callsTo(COUNTS_REF)).toHaveLength(0);
    expect(callsTo(LIST_REF, { status: "inbox" })).toHaveLength(1);
    expect(callsTo(LIST_REF, { status: "completed" })).toHaveLength(0);
    expect(callsTo(IMAGE_COLLECTIONS_REF, "skip")).toHaveLength(1);
    expect(result.current.isAllTasksReady).toBe(true);
    expect(result.current.isImageCollectionsReady).toBe(true);
  });

  it("subscribes to completed history only when that screen is open", () => {
    renderHook(() =>
      useTaskQueries({ isAuthenticated: true, includeCompletedHistory: true })
    );

    expect(callsTo(LIST_REF, { status: "completed" })).toHaveLength(1);
    expect(callsTo(LIST_REF, {})).toHaveLength(0);
  });

  it("asks for today's completed tasks by deadline instead of the full history", () => {
    const window = buildTimelineWindow(new Date());
    renderHook(() =>
      useTaskQueries({ isAuthenticated: true, includeCompletedToday: true })
    );

    expect(callsTo(LIST_REF, { status: "completed", date: window.today })).toHaveLength(1);
    expect(callsTo(LIST_REF, { status: "completed" })).toHaveLength(0);
  });

  it("does not report image metadata readiness before its subscription resolves", () => {
    useQueryMock.mockImplementation((ref: { __ref?: string }) =>
      ref.__ref === IMAGE_COLLECTIONS_REF.__ref ? undefined : []
    );

    const { result } = renderHook(() =>
      useTaskQueries({ isAuthenticated: true, includeImages: true })
    );

    expect(result.current.isImageCollectionsReady).toBe(false);
  });

  it.each([LIST_REF.__ref, TIMELINE_REF.__ref])("waits for %s before task readiness", (pending) => {
    useQueryMock.mockImplementation((ref: { __ref?: string }, args: unknown) =>
      ref.__ref === pending && args !== "skip" ? undefined : []);
    const { result } = renderHook(() => useTaskQueries({ isAuthenticated: true }));
    expect(result.current.isAllTasksReady).toBe(false);
  });

  it("never reports signed-out task queries ready", () => {
    const { result } = renderHook(() => useTaskQueries({ isAuthenticated: false }));
    expect(result.current.isAllTasksReady).toBe(false);
  });

  it("omits startDate so overdue scheduled tasks remain visible in the timeline", () => {
    const window = buildTimelineWindow(new Date());

    renderHook(() => useTaskQueries({ isAuthenticated: true }));

    expect(callsTo(TIMELINE_REF, { endDate: window.queryEndDate })).toHaveLength(1);
    expect(
      callsTo(TIMELINE_REF).some(
        ([, payload]) =>
          payload && typeof payload === "object" && "startDate" in (payload as object)
      )
    ).toBe(false);
  });
});

describe("useTaskQueries — later dates on demand", () => {
  const NEAR_END = "2026-11-21";
  const task = (id: string, deadline: string) => ({ _id: id, title: id, deadline, position: 0 });

  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue([]);
  });

  it("subscribes to the near window only until later dates are asked for", () => {
    const { result } = renderHook(() =>
      useTaskQueries({ isAuthenticated: true, nearTimelineEnd: NEAR_END })
    );

    expect(callsTo(TIMELINE_REF, { endDate: NEAR_END })).toHaveLength(1);
    expect(callsTo(TIMELINE_REF).filter(([, payload]) => payload !== "skip")).toHaveLength(1);
    expect(result.current.isLaterTimelineLoading).toBe(false);
    expect(result.current.hasLaterTimeline).toBe(false);
  });

  it("adds a disjoint later query without changing the near subscription", () => {
    const later = { startDate: "2026-11-22", endDate: TIMELINE_FAR_FUTURE };
    let laterResult: unknown = undefined;
    useQueryMock.mockImplementation((ref: { __ref?: string }, args: unknown) => {
      if (ref.__ref !== TIMELINE_REF.__ref) return [];
      if (JSON.stringify(args) === JSON.stringify(later)) return laterResult;
      return args === "skip" ? undefined : { "2026-11-08": [task("near", "2026-11-08")] };
    });
    const { result, rerender } = renderHook(
      ({ includeLaterTimeline }) =>
        useTaskQueries({ isAuthenticated: true, nearTimelineEnd: NEAR_END, includeLaterTimeline }),
      { initialProps: { includeLaterTimeline: false } }
    );

    rerender({ includeLaterTimeline: true });
    expect(callsTo(TIMELINE_REF, later).length).toBeGreaterThan(0);
    expect(result.current.isTimelineLoading).toBe(false);
    expect(result.current.isLaterTimelineLoading).toBe(true);
    expect(result.current.isAllTasksReady).toBe(false);
    expect(result.current.scheduledTasks.map((t) => t._id)).toEqual(["near"]);

    laterResult = { "2026-12-01": [task("later", "2026-12-01")] };
    rerender({ includeLaterTimeline: true });
    expect(result.current.hasLaterTimeline).toBe(true);
    expect(result.current.isLaterTimelineLoading).toBe(false);
    expect(result.current.scheduledTasks.map((t) => t._id)).toEqual(["near", "later"]);
    // The near query keeps the same args throughout, so it never re-runs.
    expect(
      callsTo(TIMELINE_REF).every(
        ([, payload]) =>
          JSON.stringify(payload) === JSON.stringify({ endDate: NEAR_END }) ||
          JSON.stringify(payload) === JSON.stringify(later) ||
          payload === "skip"
      )
    ).toBe(true);
  });

  it("steps across month and year ends", () => {
    expect(nextIsoDate("2026-11-30")).toBe("2026-12-01");
    expect(nextIsoDate("2026-12-31")).toBe("2027-01-01");
    expect(nextIsoDate("2028-02-28")).toBe("2028-02-29");
  });
});
