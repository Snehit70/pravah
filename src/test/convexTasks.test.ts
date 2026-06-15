import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  addTask,
  bulkReschedule,
  completeTask,
  getTimeline,
  listTodayCompletedTasks,
  migrateAllNativeTasksToDeadlineModel,
  migrateNativeTasksToDeadlineModel,
  moveTask,
  reopenTask,
  updateTask,
} from "../../convex/tasks";

function makeId(value: string) {
  return value as Id<"tasks">;
}

type InternalHandler<TArgs, TResult> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

const addTaskHandler = (
  addTask as unknown as InternalHandler<
    {
      title: string;
      description?: string;
      deadline?: string;
      source?: "manual" | "ai-agent" | "gmail" | "gcal";
      estimatedMinutes?: number;
      tags?: string[];
      priority?: "p1" | "p2" | "p3";
    },
    Id<"tasks">
  >
)._handler;

const moveTaskHandler = (
  moveTask as unknown as InternalHandler<
    { taskId: Id<"tasks">; targetDate: string; position?: number },
    void
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

const getTimelineHandler = (
  getTimeline as unknown as InternalHandler<
    { startDate?: string; endDate: string },
    Record<string, Array<{ _id: Id<"tasks">; deadline?: string; position: number }>>
  >
)._handler;

const listTodayCompletedTasksHandler = (
  listTodayCompletedTasks as unknown as InternalHandler<
    { dayStartMs: number; dayEndMs: number },
    Array<{ _id: Id<"tasks">; completedAt?: number }>
  >
)._handler;

const completeTaskHandler = (
  completeTask as unknown as InternalHandler<{ taskId: Id<"tasks"> }, void>
)._handler;

const reopenTaskHandler = (
  reopenTask as unknown as InternalHandler<{ taskId: Id<"tasks"> }, void>
)._handler;

const bulkRescheduleHandler = (
  bulkReschedule as unknown as InternalHandler<
    { taskIds: Id<"tasks">[]; targetDate: string },
    { movedCount: number; skippedTaskIds: Id<"tasks">[] }
  >
)._handler;

const migrateNativeTasksHandler = (
  migrateNativeTasksToDeadlineModel as unknown as InternalHandler<
    Record<string, never>,
    { migratedCount: number; migratedTaskIds: Id<"tasks">[] }
  >
)._handler;

const migrateAllNativeTasksHandler = (
  migrateAllNativeTasksToDeadlineModel as unknown as InternalHandler<
    Record<string, never>,
    { migratedCount: number; migratedTaskIds: Id<"tasks">[] }
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
  it("migrates native tasks onto deadline/scheduledAt/completedAt and strips legacy fields", async () => {
    const nativeScheduled = makeId("native-scheduled");
    const nativeCompleted = makeId("native-completed");
    const externalTask = makeId("external-task");

    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: nativeScheduled,
              ownerTokenIdentifier: "user-1",
              source: "manual",
              deadline: "2026-04-20",
              scheduledDate: "2026-04-12",
              status: "scheduled",
              type: "deadline",
              createdAt: 100,
              updatedAt: 150,
            },
            {
              _id: nativeCompleted,
              ownerTokenIdentifier: "user-1",
              source: "ai-agent",
              deadline: "2026-04-10",
              scheduledDate: "2026-04-10",
              status: "completed",
              type: "deadline",
              createdAt: 200,
              updatedAt: 260,
            },
            {
              _id: externalTask,
              ownerTokenIdentifier: "user-1",
              source: "gcal",
              deadline: "2026-04-14",
              scheduledDate: "2026-04-14",
              status: "scheduled",
              type: "deadline",
              createdAt: 300,
              updatedAt: 320,
            },
          ]),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);
    const result = await migrateNativeTasksHandler(ctx, {});

    expect(result).toMatchObject({
      migratedCount: 2,
      migratedTaskIds: [nativeScheduled, nativeCompleted],
    });
    expect(db.patch).toHaveBeenNthCalledWith(1, nativeScheduled, {
      deadline: "2026-04-12",
      scheduledAt: 100,
      completedAt: undefined,
      cancelledAt: undefined,
      scheduledDate: undefined,
      status: undefined,
      type: undefined,
      updatedAt: 150,
    });
    expect(db.patch).toHaveBeenNthCalledWith(2, nativeCompleted, {
      deadline: "2026-04-10",
      scheduledAt: 200,
      completedAt: 260,
      cancelledAt: undefined,
      scheduledDate: undefined,
      status: undefined,
      type: undefined,
      updatedAt: 260,
    });
  });

  it("migrates native tasks across every owner from the internal rollout entry point", async () => {
    const nativeTask = makeId("native-other-owner");
    const externalTask = makeId("external-other-owner");
    const collect = vi.fn().mockResolvedValue([
      {
        _id: nativeTask,
        ownerTokenIdentifier: "user-2",
        source: "manual",
        scheduledDate: "2026-05-01",
        createdAt: 10,
        updatedAt: 20,
      },
      {
        _id: externalTask,
        ownerTokenIdentifier: "user-3",
        source: "gcal",
        scheduledDate: "2026-05-02",
        createdAt: 30,
        updatedAt: 40,
      },
    ]);
    const db = {
      query: vi.fn().mockReturnValue({ collect }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const result = await migrateAllNativeTasksHandler({ db }, {});

    expect(db.query).toHaveBeenCalledWith("tasks");
    expect(result).toEqual({ migratedCount: 1, migratedTaskIds: [nativeTask] });
    expect(db.patch).toHaveBeenCalledTimes(1);
    expect(db.patch).toHaveBeenCalledWith(
      nativeTask,
      expect.objectContaining({
        deadline: "2026-05-01",
        scheduledAt: 10,
        scheduledDate: undefined,
        status: undefined,
        type: undefined,
      })
    );
  });

  it("adds tasks with deadline as the single planning date and scheduledAt as creation history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T09:30:00.000Z"));

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
      deadline: "2026-04-15",
    });

    expect(db.insert).toHaveBeenCalledWith("tasks", {
      title: "Ship report",
      description: undefined,
      deadline: "2026-04-15",
      scheduledAt: 1776245400000,
      completedAt: undefined,
      position: 3,
      source: "manual",
      estimatedMinutes: undefined,
      tags: undefined,
      priority: undefined,
      createdBy: "user-1",
      ownerTokenIdentifier: "user-1",
      createdAt: 1776245400000,
      updatedAt: 1776245400000,
      cancelledAt: undefined,
    });
  });

  it("moves active tasks by rewriting deadline", async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-1"),
        ownerTokenIdentifier: "user-1",
        deadline: "2026-04-10",
        createdAt: 1,
        updatedAt: 2,
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
      taskId: makeId("task-1"),
      targetDate: "2026-04-12",
    });

    expect(db.patch).toHaveBeenCalledWith(makeId("task-1"), {
      deadline: "2026-04-12",
      position: 5,
      updatedAt: expect.any(Number),
    });
  });

  it("clears deadline on active tasks and moves them into inbox ordering", async () => {
    const taskId = makeId("task-inbox");
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: taskId,
        ownerTokenIdentifier: "user-1",
        deadline: "2026-04-12",
        scheduledAt: 111,
        createdAt: 111,
        updatedAt: 222,
      }),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: makeId("other-inbox"),
              ownerTokenIdentifier: "user-1",
              deadline: undefined,
              createdAt: 1,
              updatedAt: 1,
              position: 2,
            },
          ]),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);
    await updateTaskHandler(ctx, {
      taskId,
      deadline: undefined,
      title: "Retitle",
    });

    expect(db.patch).toHaveBeenCalledWith(taskId, {
      title: "Retitle",
      deadline: undefined,
      position: 3,
      updatedAt: expect.any(Number),
    });
  });

  it("does not clear omitted task update fields", async () => {
    const taskId = makeId("task-update-omit");
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: taskId,
        ownerTokenIdentifier: "user-1",
        deadline: "2026-04-12",
        description: "Keep me",
        estimatedMinutes: 25,
        tags: ["cli"],
        priority: "p2",
        position: 5,
        scheduledAt: 111,
        createdAt: 111,
        updatedAt: 222,
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);
    await updateTaskHandler(ctx, {
      taskId,
      title: "Retitle only",
    });

    expect(db.patch).toHaveBeenCalledWith(taskId, {
      title: "Retitle only",
      updatedAt: expect.any(Number),
    });
  });

  it("writes completedAt on complete and clears it on reopen", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T08:00:00.000Z"));

    const completeDb = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-complete"),
        ownerTokenIdentifier: "user-1",
        deadline: "2026-04-20",
        createdAt: 1,
        updatedAt: 2,
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    await completeTaskHandler(createAuthedCtx(completeDb), {
      taskId: makeId("task-complete"),
    });

    expect(completeDb.patch).toHaveBeenCalledWith(makeId("task-complete"), {
      completedAt: 1776672000000,
      updatedAt: 1776672000000,
    });

    const reopenDb = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-complete"),
        ownerTokenIdentifier: "user-1",
        deadline: undefined,
        completedAt: 1776672000000,
        createdAt: 1,
        updatedAt: 1776672000000,
      }),
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: makeId("other-inbox"),
              ownerTokenIdentifier: "user-1",
              deadline: undefined,
              createdAt: 1,
              updatedAt: 1,
              position: 1,
            },
          ]),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    await reopenTaskHandler(createAuthedCtx(reopenDb), {
      taskId: makeId("task-complete"),
    });

    expect(reopenDb.patch).toHaveBeenCalledWith(makeId("task-complete"), {
      completedAt: undefined,
      position: 2,
      updatedAt: 1776672000000,
    });
  });

  it("does not rewrite completedAt when completion is repeated", async () => {
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: makeId("task-complete"),
        ownerTokenIdentifier: "user-1",
        completedAt: 123,
        createdAt: 1,
        updatedAt: 123,
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    await completeTaskHandler(createAuthedCtx(db), {
      taskId: makeId("task-complete"),
    });

    expect(db.patch).not.toHaveBeenCalled();
  });

  it("groups timeline tasks by deadline and excludes completed/cancelled tasks", async () => {
    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: makeId("task-overdue"),
              ownerTokenIdentifier: "user-1",
              deadline: "2026-04-01",
              createdAt: 1,
              updatedAt: 1,
              position: 1,
            },
            {
              _id: makeId("task-completed"),
              ownerTokenIdentifier: "user-1",
              deadline: "2026-04-20",
              completedAt: 1000,
              createdAt: 1,
              updatedAt: 1000,
              position: 0,
            },
            {
              _id: makeId("task-this-week"),
              ownerTokenIdentifier: "user-1",
              deadline: "2026-04-24",
              createdAt: 1,
              updatedAt: 1,
              position: 0,
            },
            {
              _id: makeId("task-cancelled"),
              ownerTokenIdentifier: "user-1",
              deadline: "2026-04-22",
              cancelledAt: 123,
              createdAt: 1,
              updatedAt: 123,
              position: 2,
            },
          ]),
        }),
      }),
    };

    const ctx = createAuthedCtx(db);
    const result = await getTimelineHandler(ctx, {
      endDate: "2026-04-24",
    });

    expect(result).toEqual({
      "2026-04-01": [
        {
          _id: makeId("task-overdue"),
          ownerTokenIdentifier: "user-1",
          deadline: "2026-04-01",
          createdAt: 1,
          updatedAt: 1,
          position: 1,
          scheduledAt: 1,
          completedAt: undefined,
        },
      ],
      "2026-04-24": [
        {
          _id: makeId("task-this-week"),
          ownerTokenIdentifier: "user-1",
          deadline: "2026-04-24",
          createdAt: 1,
          updatedAt: 1,
          position: 0,
          scheduledAt: 1,
          completedAt: undefined,
        },
      ],
    });
  });

  it("filters today's completions using client-local timestamp boundaries", async () => {
    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: makeId("before"),
              title: "Before",
              ownerTokenIdentifier: "user-1",
              completedAt: 99,
              scheduledAt: 1,
              position: 0,
              createdBy: "user-1",
              createdAt: 1,
              updatedAt: 99,
            },
            {
              _id: makeId("inside"),
              title: "Inside",
              ownerTokenIdentifier: "user-1",
              completedAt: 150,
              scheduledAt: 1,
              position: 0,
              createdBy: "user-1",
              createdAt: 1,
              updatedAt: 150,
            },
            {
              _id: makeId("end"),
              title: "End",
              ownerTokenIdentifier: "user-1",
              completedAt: 200,
              scheduledAt: 1,
              position: 0,
              createdBy: "user-1",
              createdAt: 1,
              updatedAt: 200,
            },
          ]),
        }),
      }),
    };

    const result = await listTodayCompletedTasksHandler(createAuthedCtx(db), {
      dayStartMs: 100,
      dayEndMs: 200,
    });

    expect(result.map((task) => task._id)).toEqual([makeId("inside")]);
  });

  it("bulk-reschedules only active tasks and skips completed or cancelled ones", async () => {
    const firstTask = makeId("task-1");
    const secondTask = makeId("task-2");
    const skippedCompleted = makeId("task-completed");
    const skippedCancelled = makeId("task-cancelled");

    const tasksById = new Map<Id<"tasks">, Record<string, unknown>>([
      [
        firstTask,
        {
          _id: firstTask,
          ownerTokenIdentifier: "user-1",
          deadline: undefined,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      [
        secondTask,
        {
          _id: secondTask,
          ownerTokenIdentifier: "user-1",
          deadline: "2026-04-09",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      [
        skippedCompleted,
        {
          _id: skippedCompleted,
          ownerTokenIdentifier: "user-1",
          deadline: "2026-04-08",
          completedAt: 999,
          createdAt: 1,
          updatedAt: 999,
        },
      ],
      [
        skippedCancelled,
        {
          _id: skippedCancelled,
          ownerTokenIdentifier: "user-1",
          deadline: "2026-04-07",
          cancelledAt: 888,
          createdAt: 1,
          updatedAt: 888,
        },
      ],
    ]);

    const db = {
      get: vi.fn(async (id: Id<"tasks">) => tasksById.get(id)),
      query: vi.fn()
        .mockReturnValueOnce({
          withIndex: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ position: 4 }),
            }),
          }),
        }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);
    const result = await bulkRescheduleHandler(ctx, {
      taskIds: [firstTask, secondTask, skippedCompleted, skippedCancelled],
      targetDate: "2026-04-12",
    });

    expect(result).toEqual({
      movedCount: 2,
      skippedTaskIds: [skippedCompleted, skippedCancelled],
    });
    expect(db.patch).toHaveBeenNthCalledWith(1, firstTask, {
      deadline: "2026-04-12",
      position: 5,
      updatedAt: expect.any(Number),
    });
    expect(db.patch).toHaveBeenNthCalledWith(2, secondTask, {
      deadline: "2026-04-12",
      position: 6,
      updatedAt: expect.any(Number),
    });
  });
});
