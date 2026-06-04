/// <reference types="node" />
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hasFlag, readOption } from "./args";
import { loadStoredCredential, parseCredentialImport, saveStoredCredential } from "./authStore";
import { createCliAuthClient, createLiveReadClient, resolveCliHttpUrl } from "./liveReads";
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

function isTaskLike(value: unknown): value is {
  _id?: string;
  id?: string;
  title?: string;
  status?: string;
  scheduledDate?: string;
  deadline?: string;
} {
  return typeof value === "object" && value !== null;
}

function toLiveTaskSummary(value: unknown) {
  if (!isTaskLike(value)) {
    return null;
  }
  const id =
    typeof value._id === "string"
      ? value._id
      : typeof value.id === "string"
        ? value.id
        : undefined;
  const title = typeof value.title === "string" ? value.title : undefined;
  const status = typeof value.status === "string" ? value.status : undefined;
  const scheduledDate =
    typeof value.scheduledDate === "string" ? value.scheduledDate : undefined;
  const deadline = typeof value.deadline === "string" ? value.deadline : undefined;
  if (!id || !title || !status) {
    return null;
  }
  return { id, title, status, scheduledDate, deadline };
}

function normalizeLiveTaskArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(toLiveTaskSummary).filter((task) => task !== null);
}

async function executeLiveRead(command: string, args: ParsedArgs) {
  const client = createLiveReadClient(process.env);
  if (!client) {
    return null;
  }

  switch (command) {
    case "tasks list":
      return {
        tasks: await client.listTasks({
          status: readOption(args.options, "status"),
          date: readOption(args.options, "date"),
        }),
        source: "live",
      };
    case "tasks inbox":
      return {
        tasks: await client.getInbox(),
        source: "live",
      };
    case "tasks timeline": {
      const endDate = requireOption(args, "end-date", command);
      return {
        endDate,
        timeline: await client.getTimeline(endDate),
        source: "live",
      };
    }
    case "review list": {
      const status = readOption(args.options, "status");
      const rawLimit = readOption(args.options, "limit");
      const limit = rawLimit ? Number(rawLimit) : undefined;
      return {
        items: await client.getReviewQueue(
          status,
          Number.isFinite(limit) ? limit : undefined
        ),
        source: "live",
      };
    }
    case "sync status":
      return {
        status: await client.getSyncStatus(readOption(args.options, "provider")),
        source: "live",
      };
    case "agent context": {
      const tasks = normalizeLiveTaskArray(await client.listTasks({}));
      const reviewItemsRaw = await client.getReviewQueue("pending", 25);
      const reviewItems = Array.isArray(reviewItemsRaw) ? reviewItemsRaw : [];
      const syncStatus = await client.getSyncStatus("google_calendar");
      const today = new Date().toISOString().slice(0, 10);
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
        reviewQueueSummary: {
          count: reviewItems.length,
        },
        syncStatusSummary: syncStatus,
        automation: {
          credentialLabel: "api-key-live-read",
          scopes: ["tasks:read", "review:read", "sync:read", "agent:read"],
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
      const taskId = requireOption(args, "task-id", command);
      const tasks = normalizeLiveTaskArray(await client.listTasks({}));
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      const neighbors = tasks
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
        }));
      return {
        task,
        goal: null,
        neighbors,
        source: "live",
      };
    }
    case "auth whoami":
      return null;
    case "auth list-scopes":
      return null;
    case "tasks add": {
      if (hasFlag(args.options, "dry-run")) {
        return null;
      }
      const title = requireOption(args, "title", command);
      const scheduledDate = readOption(args.options, "scheduled-date");
      const description = readOption(args.options, "description");
      const result = await client.addTask({ title, scheduledDate, description });
      return {
        action: "tasks.add",
        title,
        scheduledDate,
        createdTaskId:
          result && typeof result === "object" && "taskId" in result && typeof result.taskId === "string"
            ? result.taskId
            : null,
        dryRun: false,
        idempotencyKey: readOption(args.options, "idempotency-key") ?? `cli_${randomUUID()}`,
        source: "live",
      };
    }
    case "tasks move": {
      if (hasFlag(args.options, "dry-run")) {
        return null;
      }
      const taskId = requireOption(args, "task-id", command);
      const targetDate = requireOption(args, "target-date", command);
      await client.moveTask({ taskId, targetDate });
      return {
        action: "tasks.move",
        task: { id: taskId },
        targetDate,
        dryRun: false,
        idempotencyKey: readOption(args.options, "idempotency-key") ?? `cli_${randomUUID()}`,
        source: "live",
      };
    }
    case "tasks complete": {
      if (hasFlag(args.options, "dry-run")) {
        return null;
      }
      const taskId = requireOption(args, "task-id", command);
      await client.completeTask({ taskId });
      return {
        action: "tasks.complete",
        task: { id: taskId },
        dryRun: false,
        idempotencyKey: readOption(args.options, "idempotency-key") ?? `cli_${randomUUID()}`,
        source: "live",
      };
    }
    case "tasks reopen": {
      if (hasFlag(args.options, "dry-run")) {
        return null;
      }
      const taskId = requireOption(args, "task-id", command);
      await client.reopenTask({ taskId });
      return {
        action: "tasks.reopen",
        task: { id: taskId },
        dryRun: false,
        idempotencyKey: readOption(args.options, "idempotency-key") ?? `cli_${randomUUID()}`,
        source: "live",
      };
    }
    case "tasks unschedule": {
      if (hasFlag(args.options, "dry-run")) {
        return null;
      }
      const taskId = requireOption(args, "task-id", command);
      await client.unscheduleTask({ taskId });
      return {
        action: "tasks.unschedule",
        task: { id: taskId },
        dryRun: false,
        idempotencyKey: readOption(args.options, "idempotency-key") ?? `cli_${randomUUID()}`,
        source: "live",
      };
    }
    default:
      return null;
  }
}

export async function executeCommand(context: CommandContext, args: ParsedArgs) {
  const [namespace, action] = args.positionals;
  const command = `${namespace ?? ""} ${action ?? ""}`.trim();
  const liveReadResult = await executeLiveRead(command, args);
  if (liveReadResult) {
    return liveReadResult;
  }

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
    case "auth:import": {
      const credentialFile = readOption(args.options, "credential-file");
      const credentialJson = readOption(args.options, "credential-json");
      const bootstrapToken = readOption(args.options, "bootstrap-token");
      if (!credentialFile && !credentialJson && !bootstrapToken) {
        throw new Error(
          "Missing required option --bootstrap-token, --credential-file, or --credential-json"
        );
      }

      const imported = bootstrapToken
        ? await (() => {
            const authClient = createCliAuthClient(process.env);
            if (!authClient) {
              throw new Error(
                "CLI HTTP URL is not configured. Set PRAVAH_HTTP_URL or CONVEX_SITE_URL before importing a bootstrap token."
              );
            }
            return authClient.exchangeBootstrapToken(bootstrapToken);
          })()
        : parseCredentialImport(credentialJson ?? readFileSync(credentialFile!, "utf8"));
      saveStoredCredential(imported);
      return {
        imported: true,
        credentialLabel: imported.label,
        scopes: imported.scopes,
        ownerTokenIdentifier: imported.ownerTokenIdentifier,
        siteUrl: imported.siteUrl ?? null,
        source: bootstrapToken ? "bootstrap-token" : "credential-json",
      };
    }
    case "auth:whoami":
      return (() => {
        const stored = loadStoredCredential();
        if (stored) {
          return {
            userId: stored.userId ?? stored.ownerTokenIdentifier,
            email: stored.email ?? null,
            credentialLabel: stored.label,
            siteUrl: stored.siteUrl ?? resolveCliHttpUrl(process.env) ?? null,
            ownerTokenIdentifier: stored.ownerTokenIdentifier,
            source: "local",
          };
        }
        return {
          userId: mockCredential.userId,
          email: mockCredential.email,
          credentialLabel: mockCredential.credentialLabel,
          siteUrl: mockCredential.siteUrl,
          ownerTokenIdentifier: "mock-user",
          source: "mock",
        };
      })();
    case "auth:list-scopes":
      return (() => {
        const stored = loadStoredCredential();
        return {
          scopes: stored?.scopes ?? mockCredential.scopes,
          source: stored ? "local" : "mock",
        };
      })();
    default:
      throw new Error(`Unknown command: ${context.command}`);
  }
}
