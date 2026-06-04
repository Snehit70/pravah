import { readOption } from "./args";
import { getWriteMetadata, requireOption } from "./commandUtils";
import { mockCredential, mockReviewQueue, mockSyncStatus, mockTasks } from "./mockData";
import type { MockTask, ParsedArgs } from "./types";

function findTask(taskId: string): MockTask {
  const task = mockTasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

function buildTaskAction(action: string, taskId: string, args: ParsedArgs) {
  const task = findTask(taskId);
  return {
    action,
    task: { id: task.id, title: task.title },
    ...getWriteMetadata(args),
    source: "mock",
  };
}

export function executeMockCommand(command: string, args: ParsedArgs) {
  switch (command) {
    case "tasks list": {
      const status = readOption(args.options, "status");
      const date = readOption(args.options, "date");
      return {
        tasks: mockTasks.filter(
          (task) =>
            (!status || task.status === status) &&
            (!date || task.scheduledDate === date)
        ),
        source: "mock",
      };
    }
    case "tasks inbox":
      return {
        tasks: mockTasks.filter((task) => task.status === "inbox"),
        source: "mock",
      };
    case "tasks timeline": {
      const endDate = requireOption(args, "end-date", command);
      return {
        endDate,
        tasks: mockTasks.filter(
          (task) =>
            task.status === "scheduled" &&
            task.scheduledDate &&
            task.scheduledDate <= endDate
        ),
        source: "mock",
      };
    }
    case "tasks add":
      return {
        action: "tasks.add",
        title: requireOption(args, "title", command),
        scheduledDate: readOption(args.options, "scheduled-date"),
        createdTaskId: "mock_task_new",
        ...getWriteMetadata(args),
        source: "mock",
      };
    case "tasks move":
      return {
        ...buildTaskAction(
          "tasks.move",
          requireOption(args, "task-id", command),
          args
        ),
        targetDate: requireOption(args, "target-date", command),
      };
    case "tasks complete":
      return buildTaskAction(
        "tasks.complete",
        requireOption(args, "task-id", command),
        args
      );
    case "tasks reopen":
      return buildTaskAction(
        "tasks.reopen",
        requireOption(args, "task-id", command),
        args
      );
    case "tasks unschedule":
      return buildTaskAction(
        "tasks.unschedule",
        requireOption(args, "task-id", command),
        args
      );
    case "review list":
      return { items: mockReviewQueue, source: "mock" };
    case "sync status":
      return {
        ...mockSyncStatus,
        provider: readOption(args.options, "provider") ?? mockSyncStatus.provider,
        source: "mock",
      };
    case "agent context":
      return {
        today: "2026-06-04",
        scheduled: mockTasks
          .filter((task) => task.status === "scheduled")
          .map((task) => ({
            id: task.id,
            title: task.title,
            scheduledDate: task.scheduledDate,
          })),
        inboxSummary: {
          count: mockTasks.filter((task) => task.status === "inbox").length,
        },
        overdueSummary: {
          count: mockTasks.filter(
            (task) => task.deadline && task.deadline < "2026-06-04"
          ).length,
        },
        reviewQueueSummary: { count: mockReviewQueue.length },
        syncStatusSummary: {
          provider: mockSyncStatus.provider,
          healthy: mockSyncStatus.healthy,
          lastRunAt: mockSyncStatus.lastRunAt,
        },
        automation: {
          credentialLabel: mockCredential.credentialLabel,
          scopes: mockCredential.scopes,
          kairoAllowedWrites: [
            "tasks.add",
            "tasks.move",
            "tasks.complete",
            "tasks.reopen",
            "tasks.unschedule",
          ],
        },
        source: "mock",
      };
    case "agent task": {
      const task = findTask(requireOption(args, "task-id", command));
      return {
        task,
        goal: task.goal ?? null,
        neighbors: task.scheduledDate
          ? mockTasks
              .filter(
                (candidate) =>
                  candidate.id !== task.id &&
                  candidate.scheduledDate === task.scheduledDate
              )
              .map((neighbor) => ({
                id: neighbor.id,
                title: neighbor.title,
                status: neighbor.status,
              }))
          : [],
        source: "mock",
      };
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
