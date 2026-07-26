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
  readTarget,
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

function resolveLiveTask(tasks: CliTaskSummary[], target: string) {
  const matches = tasks.filter((task) => task.id === target || task.title === target);
  if (!matches.length) throw new CliCommandError("not_found", `Task not found: ${target}`);
  if (matches.length > 1) throw new CliCommandError("ambiguous_target", `Task target is ambiguous: ${matches.map((task) => `${task.title} (${task.id})`).join(", ")}`);
  return matches[0];
}

function resolveLiveGoal(goals: LiveGoalSummary[], target: string) {
  const matches = goals.filter((goal) => goal.id === target || goal.text === target);
  if (!matches.length) throw new CliCommandError("not_found", `Goal not found: ${target}`);
  if (matches.length > 1) throw new CliCommandError("ambiguous_target", `Goal target is ambiguous: ${matches.map((goal) => `${goal.text} (${goal.id})`).join(", ")}`);
  return matches[0];
}

function v2Horizon(tasks: CliTaskSummary[]) {
  const today = getLocalDateString(); const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 14); const endDate = getLocalDateString(end);
  const priority = (task: CliTaskSummary) => task.priority === "p1" ? 0 : task.priority === "p2" ? 1 : 2;
  const active = tasks.filter((task) => task.status === "inbox" || task.status === "timeline");
  return { today, endDate, overdue: active.filter((task) => task.deadline && task.deadline < today).sort((a,b) => priority(a) - priority(b) || a.deadline!.localeCompare(b.deadline!)), todayTasks: active.filter((task) => task.deadline === today).sort((a,b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || priority(a) - priority(b)), upcoming: active.filter((task) => task.deadline && task.deadline > today && task.deadline <= endDate).sort((a,b) => `${a.deadline}${a.time ?? "99:99"}`.localeCompare(`${b.deadline}${b.time ?? "99:99"}`)), inboxCount: active.filter((task) => task.status === "inbox").length };
}

async function executeV2LiveCommand(client: LiveCliClient, command: string, args: ParsedArgs): Promise<unknown | null> {
  const taskCommands = ["tasks list", "tasks show", "inbox", "today", "overdue", "upcoming", "agent context"];
  if (taskCommands.includes(command)) {
    requireScopes(client, ["tasks:read"]); const tasks = normalizeTaskArray(await client.listTasks({})); const horizon = v2Horizon(tasks);
    if (command === "tasks show") return { task: resolveLiveTask(tasks, readTarget(args, command)), source: "live" };
    if (command === "inbox") return { tasks: tasks.filter((task) => task.status === "inbox"), source: "live" };
    if (command === "today") return { tasks: horizon.todayTasks, today: horizon.today, source: "live" };
    if (command === "overdue") return { tasks: horizon.overdue, today: horizon.today, source: "live" };
    if (command === "upcoming") return { tasks: horizon.upcoming, today: horizon.today, endDate: horizon.endDate, source: "live" };
    if (command === "agent context") { const slim = (items: CliTaskSummary[]) => items.slice(0, 3).map((task) => ({ id: task.id, title: task.title, deadline: task.deadline, priority: task.priority })); return { today: horizon.today, overdue: { count: horizon.overdue.length, tasks: slim(horizon.overdue) }, todayTasks: { count: horizon.todayTasks.length, tasks: slim(horizon.todayTasks) }, next: { count: horizon.upcoming.length, tasks: slim(horizon.upcoming) }, inbox: { count: horizon.inboxCount }, source: "live" }; }
    return hasFlag(args.options, "all") || readOption(args.options, "status") ? { tasks, source: "live" } : { ...horizon, source: "live" };
  }
  if (command === "goals list" || command === "goals show") { requireScopes(client, ["tasks:read"]); const [goals, tasks, links] = await Promise.all([client.listGoals().then(normalizeLiveGoalArray), client.listTasks({}).then(normalizeTaskArray), client.listGoalLinks().then(normalizeGoalLinks)]); const summaries = goals.map((goal) => { const linked = tasks.filter((task) => links[task.id] === goal.id && task.status !== "cancelled"); return { ...goal, progress: { completed: linked.filter((task) => task.status === "completed").length, active: linked.filter((task) => task.status !== "cancelled").length }, activeTasks: linked.filter((task) => task.status === "inbox" || task.status === "timeline") }; }); if (command === "goals list") return { goals: summaries, source: "live" }; const goal = resolveLiveGoal(goals, readTarget(args, command)); return { goal: summaries.find((item) => item.id === goal.id), source: "live" }; }
  if (command === "operations list") { requireScopes(client, ["tasks:read"]); return { operations: normalizeOperations(await client.listOperations({ limit: Number(readOption(args.options, "limit") ?? 20), operationGroupId: readOption(args.options, "group") })), source: "live" }; }
  if (command === "operations show") { requireScopes(client, ["tasks:read"]); return { operation: normalizeOperation(await client.getOperation(readTarget(args, command))), source: "live" }; }
  if (command === "operations undo") { requireScopes(client, ["tasks:write"]); const metadata = getWriteMetadata(args); const operationId = readOption(args.options, "group") ? undefined : readTarget(args, command); const operationGroupId = readOption(args.options, "group"); if (metadata.dryRun) return { action: "operations.undo", target: { id: operationGroupId ?? operationId! }, ...metadata, source: "dry-run" }; const result = await client.undoOperation({ operationId, operationGroupId }, metadata.idempotencyKey); return { action: "operations.undo", target: { id: operationGroupId ?? operationId! }, ...metadata, operation: normalizeOperation(result), source: "live" }; }
  if (command.startsWith("tasks ")) {
    requireScopes(client, ["tasks:write"]); const verb = command.slice(6); const metadata = getWriteMetadata(args); const title = readTarget(args, command); const target = verb === "add" ? { id: "pending", title } : resolveLiveTask(normalizeTaskArray(await client.listTasks({})), title);
    if (verb === "remove" && !hasFlag(args.options, "confirm")) throw new CliCommandError("confirmation_required", "--confirm is required for tasks remove");
    if (metadata.dryRun) return { action: `tasks.${verb}`, target, ...metadata, source: "dry-run" };
    let result: unknown;
    if (verb === "add") result = await client.addTask({ title, description: readOption(args.options, "description"), deadline: readOption(args.options, "deadline"), time: readOption(args.options, "time"), priority: readPriority(readOption(args.options, "priority")), tags: readOption(args.options, "tags")?.split(",").map((tag) => tag.trim()).filter(Boolean), operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey);
    else if (verb === "edit") result = await client.updateTask({ taskId: target.id, title: readOption(args.options, "title"), description: readOption(args.options, "description"), deadline: readOption(args.options, "deadline"), time: readOption(args.options, "time"), priority: readPriority(readOption(args.options, "priority")), operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey);
    else if (verb === "schedule") result = await client.moveTask({ taskId: target.id, targetDate: readOption(args.options, "date") ?? "", operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey);
    else if (verb === "complete") result = await client.completeTask({ taskId: target.id, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey);
    else if (verb === "reopen") result = await client.reopenTask({ taskId: target.id, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey);
    else if (verb === "unschedule") result = await client.unscheduleTask({ taskId: target.id, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey);
    else if (verb === "remove") result = await client.deleteTask({ taskId: target.id, confirmTaskDelete: true, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey);
    else return null;
    return { action: `tasks.${verb}`, target, ...metadata, operation: normalizeOperation(result), source: "live" };
  }
  if (command.startsWith("goals ")) {
    requireScopes(client, ["tasks:write"]); const verb = command.slice(6); const metadata = getWriteMetadata(args); const title = readTarget(args, command); const target = verb === "add" ? { id: "pending", text: title } : resolveLiveGoal(normalizeLiveGoalArray(await client.listGoals()), title);
    if (verb === "remove" && !hasFlag(args.options, "confirm")) throw new CliCommandError("confirmation_required", "--confirm is required for goals remove");
    if (metadata.dryRun) return { action: `goals.${verb}`, target: { id: target.id, title: target.text }, ...metadata, source: "dry-run" };
    const result = verb === "add" ? await client.createGoal({ text: title, description: readOption(args.options, "description"), deadline: readOption(args.options, "deadline"), priority: readPriority(readOption(args.options, "priority")), operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey) : verb === "edit" ? await client.updateGoal({ goalId: target.id, description: readOption(args.options, "description"), deadline: readOption(args.options, "deadline"), priority: readPriority(readOption(args.options, "priority")), operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey) : verb === "remove" ? await client.deleteGoal({ goalId: target.id, confirmGoalDelete: true, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey) : null;
    if (result === null) return null; return { action: `goals.${verb}`, target: { id: target.id, title: target.text }, ...metadata, operation: normalizeOperation(result), source: "live" };
  }
  return null;
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
  const v2 = await executeV2LiveCommand(client, command, args);
  if (v2 !== null) return v2;
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
