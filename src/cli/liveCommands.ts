import { readOption } from "./args";
import { getLocalDateString } from "../lib/utils";
import {
  getWriteMetadata,
  readReviewListOptions,
  readTaskListFilters,
  requireOption,
} from "./commandUtils";
import { CliCommandError } from "./errors";
import type { LiveCliClient } from "./liveClient";
import type { ParsedArgs } from "./types";

interface LiveTaskSummary {
  id: string;
  title: string;
  status: string;
  scheduledDate?: string;
  deadline?: string;
}

function toLiveTaskSummary(value: unknown): LiveTaskSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const task = value as Record<string, unknown>;
  const id =
    typeof task._id === "string"
      ? task._id
      : typeof task.id === "string"
        ? task.id
        : undefined;
  if (
    !id ||
    typeof task.title !== "string" ||
    typeof task.status !== "string"
  ) {
    return null;
  }
  return {
    id,
    title: task.title,
    status: task.status,
    scheduledDate:
      typeof task.scheduledDate === "string" ? task.scheduledDate : undefined,
    deadline: typeof task.deadline === "string" ? task.deadline : undefined,
  };
}

function normalizeLiveTaskArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(toLiveTaskSummary).filter((task) => task !== null)
    : [];
}

function readReplayStatus(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "replayed" in value &&
      value.replayed === true
  );
}

function readCreatedTaskId(value: unknown) {
  return value &&
    typeof value === "object" &&
    "taskId" in value &&
    typeof value.taskId === "string"
    ? value.taskId
    : null;
}

function requireScopes(client: LiveCliClient, requiredScopes: string[]) {
  const missingScopes = requiredScopes.filter(
    (scope) => !client.scopes.includes(scope)
  );
  if (missingScopes.length > 0) {
    throw new Error(`Credential is missing required scopes: ${missingScopes.join(", ")}`);
  }
}

async function executeLiveWrite<T>(
  action: string,
  idempotencyKey: string,
  execute: () => Promise<T>
) {
  try {
    return await execute();
  } catch (error: unknown) {
    throw new CliCommandError(
      "write_failed",
      error instanceof Error ? error.message : `Failed to execute ${action}`,
      {
        action,
        idempotencyKey,
        retryExactRequestWithSameIdempotencyKey: true,
      }
    );
  }
}

export async function executeLiveCommand(
  client: LiveCliClient,
  command: string,
  args: ParsedArgs
): Promise<unknown | null> {
  switch (command) {
    case "tasks list": {
      const filters = readTaskListFilters(args);
      return {
        tasks: await client.listTasks(filters),
        source: "live",
      };
    }
    case "tasks inbox":
      return { tasks: await client.getInbox(), source: "live" };
    case "tasks timeline": {
      const endDate = requireOption(args, "end-date", command);
      return {
        endDate,
        timeline: await client.getTimeline(endDate),
        source: "live",
      };
    }
    case "review list": {
      const options = readReviewListOptions(args);
      return {
        items: await client.getReviewQueue(options.status, options.limit),
        source: "live",
      };
    }
    case "sync status":
      return {
        status: await client.getSyncStatus(readOption(args.options, "provider")),
        source: "live",
      };
    case "agent context": {
      requireScopes(client, [
        "tasks:read",
        "review:read",
        "sync:read",
      ]);
      const tasks = normalizeLiveTaskArray(await client.listTasks({}));
      const reviewItemsRaw = await client.getReviewQueue("pending", 25);
      const reviewItems = Array.isArray(reviewItemsRaw) ? reviewItemsRaw : [];
      const syncStatus = await client.getSyncStatus("google_calendar");
      const today = getLocalDateString();
      return {
        today,
        scheduled: tasks
          .filter((task) => task.status === "scheduled")
          .slice(0, 20)
          .map((task) => ({
            id: task.id,
            title: task.title,
            scheduledDate: task.scheduledDate,
            deadline: task.deadline,
          })),
        inboxSummary: {
          count: tasks.filter((task) => task.status === "inbox").length,
        },
        overdueSummary: {
          count: tasks.filter(
            (task) =>
              task.status === "scheduled" &&
              typeof task.scheduledDate === "string" &&
              task.scheduledDate < today
          ).length,
        },
        reviewQueueSummary: { count: reviewItems.length },
        syncStatusSummary: syncStatus,
        automation: {
          credentialLabel: client.credentialLabel,
          scopes: client.scopes,
          kairoAllowedWrites: [
            "tasks.add",
            "tasks.move",
            "tasks.complete",
            "tasks.reopen",
            "tasks.unschedule",
          ],
        },
        source: "live",
      };
    }
    case "agent task": {
      requireScopes(client, ["tasks:read"]);
      const taskId = requireOption(args, "task-id", command);
      const tasks = normalizeLiveTaskArray(await client.listTasks({}));
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      return {
        task,
        goal: null,
        neighbors: tasks
          .filter(
            (entry) =>
              entry.id !== task.id &&
              entry.scheduledDate &&
              task.scheduledDate &&
              entry.scheduledDate === task.scheduledDate
          )
          .slice(0, 5)
          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            status: entry.status,
          })),
        source: "live",
      };
    }
    case "tasks add": {
      const title = requireOption(args, "title", command);
      const scheduledDate = readOption(args.options, "scheduled-date");
      const description = readOption(args.options, "description");
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite(
        "tasks.add",
        metadata.idempotencyKey,
        () =>
          client.addTask(
            { title, scheduledDate, description },
            metadata.idempotencyKey
          )
      );
      return {
        action: "tasks.add",
        title,
        scheduledDate,
        createdTaskId: readCreatedTaskId(result),
        ...metadata,
        replayed: readReplayStatus(result),
        source: "live",
      };
    }
    case "tasks move": {
      const taskId = requireOption(args, "task-id", command);
      const targetDate = requireOption(args, "target-date", command);
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite(
        "tasks.move",
        metadata.idempotencyKey,
        () => client.moveTask({ taskId, targetDate }, metadata.idempotencyKey)
      );
      return {
        action: "tasks.move",
        task: { id: taskId },
        targetDate,
        ...metadata,
        replayed: readReplayStatus(result),
        source: "live",
      };
    }
    case "tasks complete":
    case "tasks reopen":
    case "tasks unschedule": {
      const taskId = requireOption(args, "task-id", command);
      const metadata = getWriteMetadata(args);
      const method =
        command === "tasks complete"
          ? client.completeTask
          : command === "tasks reopen"
            ? client.reopenTask
            : client.unscheduleTask;
      const action = command.replace(" ", ".");
      const result = await executeLiveWrite(action, metadata.idempotencyKey, () =>
        method({ taskId }, metadata.idempotencyKey)
      );
      return {
        action,
        task: { id: taskId },
        ...metadata,
        replayed: readReplayStatus(result),
        source: "live",
      };
    }
    default:
      return null;
  }
}
