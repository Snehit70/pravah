/// <reference types="node" />
import { randomUUID } from "node:crypto";
import { hasFlag, readOption } from "./args";
import { mockCredential, mockReviewQueue, mockSyncStatus, mockTasks } from "./mockData";
import type { CommandContext, MockTask, ParsedArgs } from "./types";

function requireOption(
  args: ParsedArgs,
  key: string,
  command: string
): string {
  const value = readOption(args.options, key);
  if (!value) {
    throw new Error(`Missing required option --${key} for ${command}`);
  }
  return value;
}

function getWriteMetadata(args: ParsedArgs) {
  return {
    dryRun: hasFlag(args.options, "dry-run"),
    idempotencyKey:
      readOption(args.options, "idempotency-key") ?? `cli_${randomUUID()}`,
  };
}

function filterTasks(args: ParsedArgs) {
  const status = readOption(args.options, "status");
  const date = readOption(args.options, "date");

  return mockTasks.filter((task) => {
    if (status && task.status !== status) return false;
    if (date && task.scheduledDate !== date) return false;
    return true;
  });
}

function findTask(taskId: string): MockTask {
  const task = mockTasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

function buildAgentTask(task: MockTask) {
  const sameDayNeighbors = task.scheduledDate
    ? mockTasks.filter(
        (candidate) =>
          candidate.id !== task.id && candidate.scheduledDate === task.scheduledDate
      )
    : [];

  return {
    task,
    goal: task.goal ?? null,
    neighbors: sameDayNeighbors.map((neighbor) => ({
      id: neighbor.id,
      title: neighbor.title,
      status: neighbor.status,
    })),
  };
}

export async function executeCommand(context: CommandContext, args: ParsedArgs) {
  const [namespace, action] = args.positionals;

  switch (`${namespace ?? ""}:${action ?? ""}`) {
    case "tasks:list":
      return {
        tasks: filterTasks(args),
      };
    case "tasks:inbox":
      return {
        tasks: mockTasks.filter((task) => task.status === "inbox"),
      };
    case "tasks:timeline": {
      const endDate = requireOption(args, "end-date", context.command);
      return {
        endDate,
        tasks: mockTasks.filter(
          (task) => task.status === "scheduled" && task.scheduledDate && task.scheduledDate <= endDate
        ),
      };
    }
    case "tasks:add": {
      const title = requireOption(args, "title", context.command);
      const scheduledDate = readOption(args.options, "scheduled-date");
      return {
        action: "tasks.add",
        title,
        scheduledDate,
        createdTaskId: "mock_task_new",
        ...getWriteMetadata(args),
      };
    }
    case "tasks:move": {
      const taskId = requireOption(args, "task-id", context.command);
      const targetDate = requireOption(args, "target-date", context.command);
      const task = findTask(taskId);
      return {
        action: "tasks.move",
        task: {
          id: task.id,
          title: task.title,
        },
        targetDate,
        ...getWriteMetadata(args),
      };
    }
    case "tasks:complete": {
      const taskId = requireOption(args, "task-id", context.command);
      const task = findTask(taskId);
      return {
        action: "tasks.complete",
        task: {
          id: task.id,
          title: task.title,
        },
        ...getWriteMetadata(args),
      };
    }
    case "tasks:reopen": {
      const taskId = requireOption(args, "task-id", context.command);
      const task = findTask(taskId);
      return {
        action: "tasks.reopen",
        task: {
          id: task.id,
          title: task.title,
        },
        ...getWriteMetadata(args),
      };
    }
    case "tasks:unschedule": {
      const taskId = requireOption(args, "task-id", context.command);
      const task = findTask(taskId);
      return {
        action: "tasks.unschedule",
        task: {
          id: task.id,
          title: task.title,
        },
        ...getWriteMetadata(args),
      };
    }
    case "review:list":
      return {
        items: mockReviewQueue,
      };
    case "sync:status":
      return {
        ...mockSyncStatus,
        provider: readOption(args.options, "provider") ?? mockSyncStatus.provider,
      };
    case "agent:context":
      return {
        today: "2026-06-04",
        scheduled: mockTasks
          .filter((task) => task.status === "scheduled")
          .map((task) => ({ id: task.id, title: task.title, scheduledDate: task.scheduledDate })),
        inboxSummary: {
          count: mockTasks.filter((task) => task.status === "inbox").length,
        },
        overdueSummary: {
          count: mockTasks.filter((task) => task.deadline && task.deadline < "2026-06-04").length,
        },
        reviewQueueSummary: {
          count: mockReviewQueue.length,
        },
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
      };
    case "agent:task": {
      const taskId = requireOption(args, "task-id", context.command);
      return buildAgentTask(findTask(taskId));
    }
    case "auth:whoami":
      return {
        userId: mockCredential.userId,
        email: mockCredential.email,
        credentialLabel: mockCredential.credentialLabel,
        siteUrl: mockCredential.siteUrl,
      };
    case "auth:list-scopes":
      return {
        scopes: mockCredential.scopes,
      };
    default:
      throw new Error(`Unknown command: ${context.command}`);
  }
}
