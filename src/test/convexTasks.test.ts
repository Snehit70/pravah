import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  addTask,
  backfillDeadlineTasksToDeadlineDate,
  bulkReschedule,
  getTimeline,
  moveTask,
  reorderInboxTasks,
  reorderTasks,
  shiftScheduledTaskPosition,
  updateTask,
} from "../../convex/tasks";

function makeId(value: string) {
  return value as Id<"tasks">;
}

type InternalHandler<TArgs, TResult> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

const moveTaskHandler = (
  moveTask as unknown as InternalHandler<
    { taskId: Id<"tasks">; targetDate: string; position?: number },
    void
  >
)._handler;

const reorderTasksHandler = (
  reorderTasks as unknown as InternalHandler<
    { date: string; taskIds: Id<"tasks">[] },
    void
  >
)._handler;

const reorderInboxTasksHandler = (
  reorderInboxTasks as unknown as InternalHandler<
    { taskIds: Id<"tasks">[] },
    void
  >
)._handler;

const bulkRescheduleHandler = (
  bulkReschedule as unknown as InternalHandler<
    { taskIds: Id<"tasks">[]; targetDate: string },
    { movedCount: number; skippedTaskIds: Id<"tasks">[] }
  >
)._handler;

const getTimelineHandler = (
  getTimeline as unknown as InternalHandler<
    { endDate: string },
    Record<string, Array<{ _id: Id<"tasks">; scheduledDate?: string; position: number }>>
  >
)._handler;

const shiftScheduledTaskPositionHandler = (
  shiftScheduledTaskPosition as unknown as InternalHandler<
    { taskId: Id<"tasks">; direction: "up" | "down" },
    void
  >
)._handler;

const addTaskHandler = (
  addTask as unknown as InternalHandler<
    {
      title: string;
      description?: string;
      type: "open" | "deadline";
      scheduledDate?: string;
      deadline?: string;
      source?: "manual" | "ai-agent" | "gmail" | "gcal";
      estimatedMinutes?: number;
      tags?: string[];
    },
    Id<"tasks">
  >
)._handler;

const updateTaskHandler = (
  updateTask as unknown as InternalHandler<
    {
      taskId: Id<"tasks">;
      title?: string;
      description?: string;
      deadline?: string;
      estimatedMinutes?: number;
      tags?: string[];
      priority?: "p1" | "p2" | "p3";
    },
    void
  >
)._handler;

const backfillDeadlineTasksHandler = (
  backfillDeadlineTasksToDeadlineDate as unknown as InternalHandler<
    Record<string, never>,
    { updatedCount: number; updatedTaskIds: Id<"tasks">[] }
  >
)._handler;

function createAuthedCtx(db: unknown) {
  return {
    db,
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({ tokenIdentifier: "user-1" }),
    },
  };
}

describe("convex/tasks handlers", () => {
  it("backfills existing deadline tasks onto their deadline date", async () => {
    const updateA = makeId("deadline-a");
    const updateB = makeId("deadline-b");
    const unchanged = makeId("deadline-ok");
    const completed = makeId("deadline-done");

    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: updateA,
              type: "deadline",
              deadline: "2026-04-16",
              scheduledDate: "2026-04-11",
              status: "scheduled",
              position: 0,
              createdAt: 1,
            },
            {
              _id: updateB,
              type: "deadline",
              deadline: "2026-04-17",
              scheduledDate: undefined,
              status: "inbox",
              position: 2,
              createdAt: 2,
            },
            {
              _id: unchanged,
              type: "deadline",
              deadline: "2026-04-18",
              scheduledDate: "2026-04-18",
              status: "scheduled",
              position: 3,
              createdAt: 3,
            },
            {
              _id: completed,
              type: "deadline",
              deadline: "2026-04-19",
              scheduledDate: "2026-04-10",
              status: "completed",
              position: 1,
              createdAt: 4,
            },
            {
              _id: makeId("open-task"),
              type: "open",
              deadline: undefined,
              scheduledDate: "2026-04-16",
              status: "scheduled",
              position: 4,
              createdAt: 5,
            },
          ]),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);

    const result = await backfillDeadlineTasksHandler(ctx, {});

    expect(result).toEqual({
      updatedCount: 2,
      updatedTaskIds: [updateA, updateB],
    });
    expect(db.patch).toHaveBeenCalledTimes(2);
    expect(db.patch).toHaveBeenNthCalledWith(1, updateA, {
      scheduledDate: "2026-04-16",
      status: "scheduled",
      position: 5,
      updatedAt: expect.any(Number),
    });
    expect(db.patch).toHaveBeenNthCalledWith(2, updateB, {
      scheduledDate: "2026-04-17",
      status: "scheduled",
      position: 0,
      updatedAt: expect.any(Number),
    });
  });

  it("addTask schedules deadline tasks on their deadline by default", async () => {
    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ position: 2 }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue(makeId("task-new")),
    };

    const ctx = createAuthedCtx(db);

    await addTaskHandler(ctx, {
      title: "Ship report",
      type: "deadline",
      deadline: "2026-04-15",
    });

    expect(db.insert).toHaveBeenCalledWith("tasks", {
      title: "Ship report",
      description: undefined,
      type: "deadline",
      scheduledDate: "2026-04-15",
      deadline: "2026-04-15",
      position: 3,
      status: "scheduled",
      source: "manual",
      estimatedMinutes: undefined,
        tags: undefined,
        createdBy: "user-1",
        ownerTokenIdentifier: "user-1",
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      });
  });

  it("moveTask rejects moves past deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T12:00:00.000Z"));

    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-1"),
        type: "deadline",
        deadline: "2026-04-10",
        ownerTokenIdentifier: "user-1",
      }),
      query: vi.fn(),
      patch: vi.fn(),
    };

    const ctx = createAuthedCtx(db);

    await expect(
      moveTaskHandler(ctx, {
        taskId: makeId("task-1"),
        targetDate: "2026-04-11",
      })
    ).rejects.toThrow("Cannot move task past its deadline");

    expect(db.patch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("moveTask allows overdue deadline tasks to be carried forward", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));

    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-overdue"),
        type: "deadline",
        deadline: "2026-04-10",
        status: "scheduled",
        ownerTokenIdentifier: "user-1",
      }),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ position: 2 }),
          }),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);

    await moveTaskHandler(ctx, {
      taskId: makeId("task-overdue"),
      targetDate: "2026-04-12",
    });

    expect(db.patch).toHaveBeenCalledWith(makeId("task-overdue"), {
      scheduledDate: "2026-04-12",
      position: 3,
      status: "scheduled",
      updatedAt: expect.any(Number),
    });

    vi.useRealTimers();
  });

  it("moveTask appends to end of target day when position is omitted", async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-2"),
        type: "open",
        status: "inbox",
        ownerTokenIdentifier: "user-1",
      }),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ position: 4 }),
          }),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);

    await moveTaskHandler(ctx, {
      taskId: makeId("task-2"),
      targetDate: "2026-04-12",
    });

    expect(db.patch).toHaveBeenCalledWith(makeId("task-2"), {
      scheduledDate: "2026-04-12",
      position: 5,
      status: "scheduled",
      updatedAt: expect.any(Number),
    });
  });

  it("getTimeline includes all overdue scheduled tasks through the requested end date", async () => {
    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: makeId("task-overdue-old"),
              scheduledDate: "2026-04-01",
              position: 1,
            },
            {
              _id: makeId("task-this-week"),
              scheduledDate: "2026-04-24",
              position: 0,
            },
            {
              _id: makeId("task-overdue-newer"),
              scheduledDate: "2026-04-20",
              position: 0,
            },
          ]),
        }),
      }),
    };

    const ctx = createAuthedCtx(db);

    const result = await getTimelineHandler(ctx, {
      endDate: "2026-04-30",
    });

    expect(result).toEqual({
      "2026-04-01": [
        {
          _id: makeId("task-overdue-old"),
          scheduledDate: "2026-04-01",
          position: 1,
        },
      ],
      "2026-04-20": [
        {
          _id: makeId("task-overdue-newer"),
          scheduledDate: "2026-04-20",
          position: 0,
        },
      ],
      "2026-04-24": [
        {
          _id: makeId("task-this-week"),
          scheduledDate: "2026-04-24",
          position: 0,
        },
      ],
    });
  });

  it("updateTask keeps inbox open tasks in inbox when they gain or keep a deadline", async () => {
    const taskId = makeId("task-inbox-deadline");
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: taskId,
        status: "inbox",
        type: "open",
        deadline: "2026-04-12",
        scheduledDate: undefined,
        ownerTokenIdentifier: "user-1",
      }),
      query: vi.fn(),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);

    await updateTaskHandler(ctx, {
      taskId,
      title: "Updated title",
      deadline: "2026-04-12",
    });

    expect(db.query).not.toHaveBeenCalled();
    expect(db.patch).toHaveBeenCalledWith(taskId, {
      title: "Updated title",
      deadline: "2026-04-12",
      type: "open",
      status: "inbox",
      scheduledDate: undefined,
      updatedAt: expect.any(Number),
    });
  });

  it("updateTask still auto-schedules deadline tasks when they are deadline-based", async () => {
    const taskId = makeId("task-scheduled-deadline");
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: taskId,
        status: "scheduled",
        type: "deadline",
        deadline: "2026-04-12",
        scheduledDate: "2026-04-12",
        position: 2,
        ownerTokenIdentifier: "user-1",
      }),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ position: 4 }),
          }),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);

    await updateTaskHandler(ctx, {
      taskId,
      deadline: "2026-04-15",
    });

    expect(db.patch).toHaveBeenCalledWith(taskId, {
      deadline: "2026-04-15",
      type: "deadline",
      status: "scheduled",
      scheduledDate: "2026-04-15",
      position: 5,
      updatedAt: expect.any(Number),
    });
  });

  it("reorderTasks rejects ids that do not belong to the specified day", async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-3"),
        scheduledDate: "2026-04-09",
        ownerTokenIdentifier: "user-1",
      }),
      patch: vi.fn(),
    };

    const ctx = createAuthedCtx(db);

    await expect(
      reorderTasksHandler(ctx, {
        date: "2026-04-10",
        taskIds: [makeId("task-3")],
      })
    ).rejects.toThrow("does not belong to date 2026-04-10");
  });

  it("shiftScheduledTaskPosition swaps with the adjacent scheduled task", async () => {
    const taskId = makeId("task-1");
    const adjacentTaskId = makeId("task-2");
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: taskId,
        status: "scheduled",
        scheduledDate: "2026-04-24",
        position: 0,
        ownerTokenIdentifier: "user-1",
      }),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: taskId,
              status: "scheduled",
              scheduledDate: "2026-04-24",
              position: 0,
            },
            {
              _id: adjacentTaskId,
              status: "scheduled",
              scheduledDate: "2026-04-24",
              position: 1,
            },
          ]),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);

    await shiftScheduledTaskPositionHandler(ctx, {
      taskId,
      direction: "down",
    });

    expect(db.patch).toHaveBeenNthCalledWith(1, taskId, {
      position: 1,
      updatedAt: expect.any(Number),
    });
    expect(db.patch).toHaveBeenNthCalledWith(2, adjacentTaskId, {
      position: 0,
      updatedAt: expect.any(Number),
    });
  });

  it("shiftScheduledTaskPosition no-ops when the task is already at the boundary", async () => {
    const taskId = makeId("task-top");
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: taskId,
        status: "scheduled",
        scheduledDate: "2026-04-24",
        position: 0,
        ownerTokenIdentifier: "user-1",
      }),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: taskId,
              status: "scheduled",
              scheduledDate: "2026-04-24",
              position: 0,
            },
          ]),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);

    await shiftScheduledTaskPositionHandler(ctx, {
      taskId,
      direction: "up",
    });

    expect(db.patch).not.toHaveBeenCalled();
  });

  it("reorderInboxTasks rejects ids that are not inbox tasks", async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-4"),
        status: "scheduled",
        scheduledDate: "2026-04-10",
        ownerTokenIdentifier: "user-1",
      }),
      patch: vi.fn(),
    };

    const ctx = createAuthedCtx(db);

    await expect(
      reorderInboxTasksHandler(ctx, {
        taskIds: [makeId("task-4")],
      })
    ).rejects.toThrow("does not belong to inbox");
  });

  it("bulkReschedule moves only valid tasks and reports skipped ids", async () => {
    const taskA = makeId("task-a");
    const taskB = makeId("task-b");
    const taskC = makeId("task-c");

    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ position: 2 }),
          }),
        }),
      }),
      get: vi.fn().mockImplementation(async (id: Id<"tasks">) => {
        if (id === taskA) {
          return {
            _id: taskA,
            status: "inbox",
            type: "open",
            ownerTokenIdentifier: "user-1",
          };
        }
        if (id === taskB) {
          return {
            _id: taskB,
            status: "completed",
            type: "open",
            ownerTokenIdentifier: "user-1",
          };
        }
        if (id === taskC) {
          return {
            _id: taskC,
            status: "scheduled",
            type: "deadline",
            deadline: "2026-04-08",
            ownerTokenIdentifier: "user-1",
          };
        }
        return null;
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);

    const result = await bulkRescheduleHandler(ctx, {
      taskIds: [taskA, taskB, taskC],
      targetDate: "2026-04-10",
    });

    expect(result).toEqual({
      movedCount: 1,
      skippedTaskIds: [taskB, taskC],
    });
    expect(db.patch).toHaveBeenCalledTimes(1);
    expect(db.patch).toHaveBeenCalledWith(taskA, {
      status: "scheduled",
      scheduledDate: "2026-04-10",
      position: 3,
      updatedAt: expect.any(Number),
    });
  });
});
