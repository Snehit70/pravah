import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  addTask,
  backfillDeadlineTasksToDeadlineDate,
  bulkReschedule,
  moveTask,
  reorderTasks,
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

const bulkRescheduleHandler = (
  bulkReschedule as unknown as InternalHandler<
    { taskIds: Id<"tasks">[]; targetDate: string },
    { movedCount: number; skippedTaskIds: Id<"tasks">[] }
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

const backfillDeadlineTasksHandler = (
  backfillDeadlineTasksToDeadlineDate as unknown as InternalHandler<
    Record<string, never>,
    { updatedCount: number; updatedTaskIds: Id<"tasks">[] }
  >
)._handler;

describe("convex/tasks handlers", () => {
  it("backfills existing deadline tasks onto their deadline date", async () => {
    const updateA = makeId("deadline-a");
    const updateB = makeId("deadline-b");
    const unchanged = makeId("deadline-ok");
    const completed = makeId("deadline-done");

    const db = {
      query: vi.fn().mockReturnValue({
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
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = { db };

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
        filter: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue([{ position: 0 }, { position: 2 }]),
      }),
      insert: vi.fn().mockResolvedValue(makeId("task-new")),
    };

    const ctx = { db };

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
      createdBy: "user",
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });

  it("moveTask rejects moves past deadline", async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-1"),
        type: "deadline",
        deadline: "2026-04-10",
      }),
      query: vi.fn(),
      patch: vi.fn(),
    };

    const ctx = { db };

    await expect(
      moveTaskHandler(ctx, {
        taskId: makeId("task-1"),
        targetDate: "2026-04-11",
      })
    ).rejects.toThrow("Cannot move task past its deadline");

    expect(db.patch).not.toHaveBeenCalled();
  });

  it("moveTask appends to end of target day when position is omitted", async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-2"),
        type: "open",
        status: "inbox",
      }),
      query: vi.fn().mockReturnValue({
        filter: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue([
          { position: 1 },
          { position: 4 },
        ]),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = { db };

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

  it("reorderTasks rejects ids that do not belong to the specified day", async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-3"),
        scheduledDate: "2026-04-09",
      }),
      patch: vi.fn(),
    };

    const ctx = { db };

    await expect(
      reorderTasksHandler(ctx, {
        date: "2026-04-10",
        taskIds: [makeId("task-3")],
      })
    ).rejects.toThrow("does not belong to date 2026-04-10");
  });

  it("bulkReschedule moves only valid tasks and reports skipped ids", async () => {
    const taskA = makeId("task-a");
    const taskB = makeId("task-b");
    const taskC = makeId("task-c");

    const db = {
      query: vi.fn().mockReturnValue({
        filter: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue([{ position: 2 }]),
      }),
      get: vi.fn().mockImplementation(async (id: Id<"tasks">) => {
        if (id === taskA) {
          return {
            _id: taskA,
            status: "inbox",
            type: "open",
          };
        }
        if (id === taskB) {
          return {
            _id: taskB,
            status: "completed",
            type: "open",
          };
        }
        if (id === taskC) {
          return {
            _id: taskC,
            status: "scheduled",
            type: "deadline",
            deadline: "2026-04-08",
          };
        }
        return null;
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = { db };

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
