import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
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

describe("convex/tasks handlers", () => {
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
