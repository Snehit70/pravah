import { hasFlag, readOption } from "./args";
import { getLocalDateString } from "./date";
import {
  getWriteMetadata,
  readGoalCreateOptions,
  readGoalUpdateOptions,
  readOperationListOptions,
  readOperationUndoOptions,
  readReviewListOptions,
  readSearchOptions,
  readTaskAddOptions,
  readTaskListFilters,
  readTaskUpdateOptions,
  requireOption,
} from "./commandUtils";
import { CliCommandError } from "./errors";
import type { LiveCliClient } from "./liveClient";
import type { CliTaskStatus, ParsedArgs } from "./types";

interface CliTaskSummary {
  id: string;
  title: string;
  description?: string;
  status: CliTaskStatus;
  deadline?: string;
  time?: string;
  priority?: "p1" | "p2" | "p3";
  source?: "manual" | "ai-agent" | "gmail" | "gcal";
  createdAt?: number;
  updatedAt?: number;
  position?: number;
  scheduledAt?: number;
  completedAt?: number;
  cancelledAt?: number;
}

interface LiveGoalSummary {
  id: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  createdAt?: number;
}

interface CliReviewItem {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  provider?: string;
  sourceType?: string;
  externalId?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface CliSyncStatusSummary {
  provider: string;
  connected: boolean;
  healthy: boolean;
  syncEnabled?: boolean;
  accountEmail?: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  lastError?: string;
  pendingReviewCount: number;
}

function readDateString(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : undefined;
}

function readTimeString(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readPriority(value: unknown) {
  return value === "p1" || value === "p2" || value === "p3" ? value : undefined;
}

function readSource(value: unknown) {
  return value === "manual" ||
    value === "ai-agent" ||
    value === "gmail" ||
    value === "gcal"
    ? value
    : undefined;
}

function deriveTaskStatus(task: Record<string, unknown>): CliTaskStatus {
  const cancelledAt = readNumber(task.cancelledAt);
  const completedAt = readNumber(task.completedAt);
  const deadline = readDateString(task.deadline) ?? readDateString(task.scheduledDate);
  const legacyStatus = typeof task.status === "string" ? task.status : undefined;

  if (cancelledAt !== undefined || legacyStatus === "cancelled") return "cancelled";
  if (completedAt !== undefined || legacyStatus === "completed") return "completed";
  if (deadline) return "timeline";
  return "inbox";
}

function toCliTaskSummary(value: unknown): CliTaskSummary | null {
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
    typeof task.title !== "string"
  ) {
    return null;
  }
  const deadline = readDateString(task.deadline) ?? readDateString(task.scheduledDate);
  const createdAt = readNumber(task.createdAt);
  const updatedAt = readNumber(task.updatedAt);
  const scheduledAt = readNumber(task.scheduledAt) ?? createdAt;
  const completedAt =
    readNumber(task.completedAt) ??
    (task.status === "completed" ? updatedAt : undefined);
  const cancelledAt =
    readNumber(task.cancelledAt) ??
    (task.status === "cancelled" ? updatedAt : undefined);
  return {
    id,
    title: task.title,
    description:
      typeof task.description === "string" ? task.description : undefined,
    status: deriveTaskStatus(task),
    deadline,
    time: readTimeString(task.time),
    priority: readPriority(task.priority),
    source: readSource(task.source),
    createdAt,
    updatedAt,
    position: readNumber(task.position),
    scheduledAt,
    completedAt,
    cancelledAt,
  };
}

function toLiveGoalSummary(value: unknown): LiveGoalSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const goal = value as Record<string, unknown>;
  if (typeof goal.id !== "string" || typeof goal.text !== "string") {
    return null;
  }
  const priority =
    goal.priority === "p1" || goal.priority === "p2" || goal.priority === "p3"
      ? goal.priority
      : undefined;
  return {
    id: goal.id,
    text: goal.text,
    description: typeof goal.description === "string" ? goal.description : undefined,
    deadline: typeof goal.deadline === "string" ? goal.deadline : undefined,
    priority,
    createdAt: typeof goal.createdAt === "number" ? goal.createdAt : undefined,
  };
}

function normalizeTaskArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(toCliTaskSummary).filter((task) => task !== null)
    : [];
}

function normalizeLiveGoalArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(toLiveGoalSummary).filter((goal) => goal !== null)
    : [];
}

function normalizeTimeline(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, CliTaskSummary[]>;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([date, tasks]) => [
      date,
      normalizeTaskArray(tasks),
    ])
  ) as Record<string, CliTaskSummary[]>;
}

function normalizeGoalLinks(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function normalizeReviewItem(value: unknown): CliReviewItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as Record<string, unknown>;
  const id =
    typeof item._id === "string"
      ? item._id
      : typeof item.id === "string"
        ? item.id
        : undefined;
  const status =
    item.status === "pending" ||
    item.status === "approved" ||
    item.status === "rejected"
      ? item.status
      : undefined;
  if (!id || typeof item.title !== "string" || !status) {
    return null;
  }
  return {
    id,
    title: item.title,
    status,
    provider: typeof item.provider === "string" ? item.provider : undefined,
    sourceType: typeof item.sourceType === "string" ? item.sourceType : undefined,
    externalId: typeof item.externalId === "string" ? item.externalId : undefined,
    createdAt: readNumber(item.createdAt),
    updatedAt: readNumber(item.updatedAt),
  };
}

function normalizeReviewItems(value: unknown) {
  return Array.isArray(value)
    ? value.map(normalizeReviewItem).filter((item) => item !== null)
    : [];
}

function normalizeSyncStatus(value: unknown): CliSyncStatusSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const status = value as Record<string, unknown>;
  const integration =
    status.integration && typeof status.integration === "object"
      ? (status.integration as Record<string, unknown>)
      : null;
  const lastRun =
    status.lastRun && typeof status.lastRun === "object"
      ? (status.lastRun as Record<string, unknown>)
      : null;
  const provider =
    typeof status.provider === "string"
      ? status.provider
      : typeof integration?.provider === "string"
        ? integration.provider
        : "unknown";
  const connected =
    typeof status.connected === "boolean"
      ? status.connected
      : integration?.status === "connected";
  const healthy =
    typeof status.healthy === "boolean"
      ? status.healthy
      : connected && typeof integration?.lastError !== "string";
  const lastRunAt =
    typeof status.lastRunAt === "string"
      ? status.lastRunAt
      : typeof lastRun?.finishedAt === "number"
        ? new Date(lastRun.finishedAt).toISOString()
        : undefined;
  const lastRunStatus =
    typeof status.lastRunStatus === "string"
      ? status.lastRunStatus
      : typeof lastRun?.status === "string"
        ? lastRun.status
        : undefined;
  const pendingReviewCount =
    typeof status.pendingReviewCount === "number"
      ? status.pendingReviewCount
      : typeof status.pendingReviewItems === "number"
        ? status.pendingReviewItems
        : 0;

  return {
    provider,
    connected,
    healthy,
    syncEnabled:
      typeof status.syncEnabled === "boolean"
        ? status.syncEnabled
        : typeof integration?.syncEnabled === "boolean"
          ? integration.syncEnabled
          : undefined,
    accountEmail:
      typeof status.accountEmail === "string"
        ? status.accountEmail
        : typeof integration?.accountEmail === "string"
          ? integration.accountEmail
          : undefined,
    lastRunAt,
    lastRunStatus,
    lastError:
      typeof status.lastError === "string"
        ? status.lastError
        : typeof integration?.lastError === "string"
          ? integration.lastError
          : undefined,
    pendingReviewCount,
  };
}

function normalizeOperation(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const operation = value as Record<string, unknown>;
  if (typeof operation.operationId !== "string") return null;
  return {
    operationId: operation.operationId,
    operationGroupId:
      typeof operation.operationGroupId === "string"
        ? operation.operationGroupId
        : undefined,
    operation:
      typeof operation.operation === "string" ? operation.operation : undefined,
    status: typeof operation.status === "string" ? operation.status : undefined,
    targetType:
      typeof operation.targetType === "string" ? operation.targetType : undefined,
    targetId: typeof operation.targetId === "string" ? operation.targetId : undefined,
    undoAvailable:
      typeof operation.undoAvailable === "boolean"
        ? operation.undoAvailable
        : undefined,
    undoExpiresAt:
      typeof operation.undoExpiresAt === "string"
        ? operation.undoExpiresAt
        : undefined,
    createdAt: readNumber(operation.createdAt),
    undoneAt: readNumber(operation.undoneAt),
  };
}

function normalizeOperations(value: unknown) {
  return Array.isArray(value)
    ? value.map(normalizeOperation).filter((operation) => operation !== null)
    : [];
}

function textMatchesQuery(query: string, ...values: Array<string | undefined>) {
  return values.some((value) => value?.toLowerCase().includes(query));
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
        tasks: normalizeTaskArray(await client.listTasks(filters)),
        source: "live",
      };
    }
    case "tasks get": {
      requireScopes(client, ["tasks:read"]);
      const taskId = requireOption(args, "task-id", command);
      const task = normalizeTaskArray(await client.listTasks({})).find(
        (entry) => entry.id === taskId
      );
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      return { task, source: "live" };
    }
    case "tasks search": {
      requireScopes(client, ["tasks:read"]);
      const { query, limit } = readSearchOptions(args, command);
      const filters = readTaskListFilters(args);
      const tasks = normalizeTaskArray(await client.listTasks(filters))
        .filter((task) => textMatchesQuery(query, task.title, task.description))
        .slice(0, limit);
      return { tasks, query, limit, source: "live" };
    }
    case "tasks inbox":
      return { tasks: normalizeTaskArray(await client.getInbox()), source: "live" };
    case "goals list":
      requireScopes(client, ["tasks:read"]);
      return {
        goals: normalizeLiveGoalArray(await client.listGoals()),
        links: await client.listGoalLinks(),
        source: "live",
      };
    case "goals get": {
      requireScopes(client, ["tasks:read"]);
      const goalId = requireOption(args, "goal-id", command);
      const goal = normalizeLiveGoalArray(await client.listGoals()).find(
        (entry) => entry.id === goalId
      );
      if (!goal) {
        throw new Error(`Goal not found: ${goalId}`);
      }
      return { goal, source: "live" };
    }
    case "goals search": {
      requireScopes(client, ["tasks:read"]);
      const { query, limit } = readSearchOptions(args, command);
      const goals = normalizeLiveGoalArray(await client.listGoals())
        .filter((goal) => textMatchesQuery(query, goal.text, goal.description))
        .slice(0, limit);
      return { goals, query, limit, source: "live" };
    }
    case "tasks timeline": {
      const endDate = requireOption(args, "end-date", command);
      return {
        endDate,
        timeline: normalizeTimeline(await client.getTimeline(endDate)),
        source: "live",
      };
    }
    case "review list": {
      const options = readReviewListOptions(args);
      return {
        items: normalizeReviewItems(
          await client.getReviewQueue(options.status, options.limit)
        ),
        source: "live",
      };
    }
    case "sync status":
      return {
        status: normalizeSyncStatus(
          await client.getSyncStatus(readOption(args.options, "provider"))
        ),
        source: "live",
      };
    case "operations list": {
      requireScopes(client, ["tasks:read"]);
      const options = readOperationListOptions(args);
      return {
        operations: normalizeOperations(await client.listOperations(options)),
        ...options,
        source: "live",
      };
    }
    case "operations get": {
      requireScopes(client, ["tasks:read"]);
      const operationId = requireOption(args, "operation-id", command);
      return {
        operation: normalizeOperation(await client.getOperation(operationId)),
        source: "live",
      };
    }
    case "agent context": {
      requireScopes(client, [
        "tasks:read",
        "review:read",
        "sync:read",
      ]);
      const tasks = normalizeTaskArray(await client.listTasks({}));
      const goals = normalizeLiveGoalArray(await client.listGoals());
      const goalLinks = normalizeGoalLinks(await client.listGoalLinks());
      const reviewItems = normalizeReviewItems(
        await client.getReviewQueue("pending", 25)
      );
      const syncStatus = normalizeSyncStatus(
        await client.getSyncStatus("google_calendar")
      );
      const today = getLocalDateString();
      return {
        today,
        timeline: tasks
          .filter((task) => task.status === "timeline")
          .slice(0, 20)
          .map((task) => ({
            id: task.id,
            title: task.title,
            deadline: task.deadline,
          })),
        inboxSummary: {
          count: tasks.filter((task) => task.status === "inbox").length,
        },
        goals,
        goalLinksSummary: {
          count: Object.keys(goalLinks).length,
        },
        overdueSummary: {
          count: tasks.filter(
            (task) =>
              task.status === "timeline" &&
              typeof task.deadline === "string" &&
              task.deadline < today
          ).length,
        },
        reviewQueueSummary: { count: reviewItems.length },
        syncStatusSummary: syncStatus,
        automation: {
          credentialLabel: client.credentialLabel,
          scopes: client.scopes,
          kairoAllowedWrites: [
            "tasks.add",
            "tasks.update",
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
      const tasks = normalizeTaskArray(await client.listTasks({}));
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      const [goals, goalLinks] = await Promise.all([
        client.listGoals().then(normalizeLiveGoalArray),
        client.listGoalLinks().then(normalizeGoalLinks),
      ]);
      const linkedGoalId = goalLinks[task.id];
      return {
        task,
        goal: linkedGoalId
          ? goals.find((goal) => goal.id === linkedGoalId) ?? null
          : null,
        neighbors: tasks
          .filter(
            (entry) =>
              entry.id !== task.id &&
              entry.deadline &&
              task.deadline &&
              entry.deadline === task.deadline
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
    case "goals update": {
      requireScopes(client, ["tasks:write"]);
      const goalId = requireOption(args, "goal-id", command);
      const { description, deadline, priority } = readGoalUpdateOptions(args);
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite(
        "goals.update",
        metadata.idempotencyKey,
        () =>
          client.updateGoal(
            {
              goalId,
              description,
              deadline,
              priority,
              operationGroupId: metadata.operationGroupId,
            },
            metadata.idempotencyKey
          )
      );
      return {
        action: "goals.update",
        goal: { id: goalId },
        description,
        deadline,
        priority,
        ...metadata,
        result,
        source: "live",
      };
    }
    case "goals create": {
      requireScopes(client, ["tasks:write"]);
      const goal = readGoalCreateOptions(args, command);
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite(
        "goals.create",
        metadata.idempotencyKey,
        () =>
          client.createGoal(
            { ...goal, operationGroupId: metadata.operationGroupId },
            metadata.idempotencyKey
          )
      );
      return {
        action: "goals.create",
        ...goal,
        ...metadata,
        result,
        source: "live",
      };
    }
    case "goals delete": {
      requireScopes(client, ["tasks:write"]);
      const goalId = requireOption(args, "goal-id", command);
      if (!hasFlag(args.options, "confirm-goal-delete")) {
        throw new Error("--confirm-goal-delete is required for goals delete");
      }
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite(
        "goals.delete",
        metadata.idempotencyKey,
        () =>
          client.deleteGoal(
            {
              goalId,
              confirmGoalDelete: true,
              operationGroupId: metadata.operationGroupId,
            },
            metadata.idempotencyKey
          )
      );
      return {
        action: "goals.delete",
        goal: { id: goalId },
        ...metadata,
        result,
        source: "live",
      };
    }
    case "tasks add": {
      requireScopes(client, ["tasks:write"]);
      const task = readTaskAddOptions(args, command);
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite(
        "tasks.add",
        metadata.idempotencyKey,
        () =>
          client.addTask(
            { ...task, operationGroupId: metadata.operationGroupId },
            metadata.idempotencyKey
          )
      );
      return {
        action: "tasks.add",
        ...task,
        createdTaskId: readCreatedTaskId(result),
        ...metadata,
        replayed: readReplayStatus(result),
        source: "live",
      };
    }
    case "tasks move": {
      requireScopes(client, ["tasks:write"]);
      const taskId = requireOption(args, "task-id", command);
      const targetDate = requireOption(args, "target-date", command);
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite(
        "tasks.move",
        metadata.idempotencyKey,
        () =>
          client.moveTask(
            { taskId, targetDate, operationGroupId: metadata.operationGroupId },
            metadata.idempotencyKey
          )
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
    case "tasks update": {
      requireScopes(client, ["tasks:write"]);
      const patch = readTaskUpdateOptions(args, command);
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite(
        "tasks.update",
        metadata.idempotencyKey,
        () =>
          client.updateTask(
            { ...patch, operationGroupId: metadata.operationGroupId },
            metadata.idempotencyKey
          )
      );
      return {
        action: "tasks.update",
        ...patch,
        ...metadata,
        replayed: readReplayStatus(result),
        source: "live",
      };
    }
    case "tasks delete": {
      requireScopes(client, ["tasks:write"]);
      const taskId = requireOption(args, "task-id", command);
      if (!hasFlag(args.options, "confirm-task-delete")) {
        throw new Error("--confirm-task-delete is required for tasks delete");
      }
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite("tasks.delete", metadata.idempotencyKey, () =>
        client.deleteTask(
          {
            taskId,
            confirmTaskDelete: true,
            operationGroupId: metadata.operationGroupId,
          },
          metadata.idempotencyKey
        )
      );
      return {
        action: "tasks.delete",
        task: { id: taskId },
        ...metadata,
        result,
        source: "live",
      };
    }
    case "tasks link-goal":
    case "tasks unlink-goal": {
      requireScopes(client, ["tasks:write"]);
      const taskId = requireOption(args, "task-id", command);
      const goalId =
        command === "tasks link-goal"
          ? requireOption(args, "goal-id", command)
          : null;
      const metadata = getWriteMetadata(args);
      const action = command === "tasks link-goal" ? "tasks.linkGoal" : "tasks.unlinkGoal";
      const result = await executeLiveWrite(action, metadata.idempotencyKey, () =>
        client.setGoalLink(
          {
            taskId,
            goalId,
            operationGroupId: metadata.operationGroupId,
          },
          metadata.idempotencyKey
        )
      );
      return {
        action,
        task: { id: taskId },
        goal: goalId ? { id: goalId } : null,
        ...metadata,
        result,
        source: "live",
      };
    }
    case "tasks complete":
    case "tasks reopen":
    case "tasks unschedule": {
      requireScopes(client, ["tasks:write"]);
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
        method({ taskId, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey)
      );
      return {
        action,
        task: { id: taskId },
        ...metadata,
        replayed: readReplayStatus(result),
        source: "live",
      };
    }
    case "operations undo": {
      requireScopes(client, ["tasks:write"]);
      const options = readOperationUndoOptions(args);
      const metadata = getWriteMetadata(args);
      const result = await executeLiveWrite("operations.undo", metadata.idempotencyKey, () =>
        client.undoOperation(options, metadata.idempotencyKey)
      );
      return {
        action: "operations.undo",
        ...options,
        ...metadata,
        result,
        source: "live",
      };
    }
    default:
      return null;
  }
}
