import { describe, expect, it } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MobileTask } from "../components/TaskCard";
import { deriveDisplayWorkspace, type DisplayWorkspaceInput } from "../hooks/useDisplayWorkspace";

function makeTask(overrides: Partial<MobileTask> = {}): MobileTask {
  return {
    _id: (overrides._id ?? "task") as Id<"tasks">,
    title: "Task",
    scheduledAt: 1,
    position: 0,
    updatedAt: 1,
    createdAt: 1,
    ...overrides,
  };
}

function baseInput(overrides: Partial<DisplayWorkspaceInput> = {}): DisplayWorkspaceInput {
  return {
    activeTab: "inbox",
    sessionReady: true,
    sessionLoading: false,
    hasCachedSessionHint: false,
    today: "2026-06-16",
    inboxTasks: [makeTask({ _id: "live-inbox", title: "Live inbox" })],
    scheduledTasks: [makeTask({ _id: "live-timeline", title: "Live timeline", deadline: "2026-06-17" })],
    completedTasks: [makeTask({ _id: "live-done", title: "Live done", completedAt: 1 })],
    allWorkspaceTasks: [makeTask({ _id: "all-task", title: "All task" })],
    loading: {
      inbox: false,
      timeline: false,
      completed: false,
      allTasksReady: true,
    },
    snapshot: null,
    isSnapshotHydrated: false,
    optimisticTasks: null,
    ...overrides,
  };
}

describe("deriveDisplayWorkspace", () => {
  it("uses live task lists when all workspace queries have resolved", () => {
    const display = deriveDisplayWorkspace(baseInput());

    expect(display.shouldUseWorkspaceSnapshot).toBe(false);
    expect(display.displayInboxTasks.map((task) => task._id)).toEqual(["live-inbox"]);
    expect(display.workspaceTaskCorpus.map((task) => task._id)).toEqual(["all-task"]);
    expect(display.displayUpcomingCount).toBe(1);
  });

  it("uses hydrated snapshot only after session is ready and live data is unavailable", () => {
    const display = deriveDisplayWorkspace(
      baseInput({
        loading: { inbox: true, timeline: true, completed: true, allTasksReady: false },
        snapshot: {
          capturedAt: 1,
          inboxTasks: [makeTask({ _id: "snapshot-inbox" })],
          scheduledTasks: [makeTask({ _id: "snapshot-overdue", deadline: "2026-06-15" })],
          completedTasks: [makeTask({ _id: "snapshot-done", completedAt: 1 })],
        },
        isSnapshotHydrated: true,
      })
    );

    expect(display.shouldUseWorkspaceSnapshot).toBe(true);
    expect(display.displayInboxTasks.map((task) => task._id)).toEqual(["snapshot-inbox"]);
    expect(display.workspaceTaskCorpus.map((task) => task._id)).toEqual([
      "snapshot-inbox",
      "snapshot-overdue",
      "snapshot-done",
    ]);
    expect(display.displayOverdueCount).toBe(1);
    expect(display.isActiveListLoading).toBe(false);
  });

  it("keeps optimistic tasks scoped to the active tab display", () => {
    const display = deriveDisplayWorkspace(
      baseInput({
        activeTab: "timeline",
        optimisticTasks: [makeTask({ _id: "optimistic", deadline: "2026-06-18" })],
      })
    );

    expect(display.activeServerTasks.map((task) => task._id)).toEqual(["live-timeline"]);
    expect(display.tasks.map((task) => task._id)).toEqual(["optimistic"]);
    expect(display.visibleTasks.map((task) => task._id)).toEqual(["optimistic"]);
  });
});
