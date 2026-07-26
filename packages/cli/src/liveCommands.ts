import { hasFlag, readOption } from "./args";
import { getWriteMetadata, readTarget } from "./commandUtils";
import { getLocalDateString } from "./date";
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
  tags?: string[];
  estimatedMinutes?: number;
  goal?: { id: string; text: string };
}

interface LiveGoalSummary {
  id: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const priorityRank = (value?: string) => value === "p1" ? 0 : value === "p2" ? 1 : 2;

function readDate(value: unknown) { return typeof value === "string" && DATE.test(value) ? value : undefined; }
function readTime(value: unknown) { return typeof value === "string" && TIME.test(value) ? value : undefined; }
function readPriority(value: unknown): CliTaskSummary["priority"] { return value === "p1" || value === "p2" || value === "p3" ? value : undefined; }
function statusOf(task: Record<string, unknown>): CliTaskStatus {
  if (task.cancelledAt || task.status === "cancelled") return "cancelled";
  if (task.completedAt || task.status === "completed") return "completed";
  return (readDate(task.deadline) ?? readDate(task.scheduledDate)) ? "timeline" : "inbox";
}
function toTask(value: unknown): CliTaskSummary | null {
  if (!value || typeof value !== "object") return null;
  const task = value as Record<string, unknown>;
  const id = typeof task._id === "string" ? task._id : typeof task.id === "string" ? task.id : undefined;
  if (!id || typeof task.title !== "string") return null;
  return { id, title: task.title, description: typeof task.description === "string" ? task.description : undefined, status: statusOf(task), deadline: readDate(task.deadline) ?? readDate(task.scheduledDate), time: readTime(task.time), priority: readPriority(task.priority), tags: Array.isArray(task.tags) ? task.tags.filter((tag): tag is string => typeof tag === "string") : undefined, estimatedMinutes: typeof task.estimatedMinutes === "number" ? task.estimatedMinutes : undefined };
}
function toGoal(value: unknown): LiveGoalSummary | null {
  if (!value || typeof value !== "object") return null;
  const goal = value as Record<string, unknown>;
  if (typeof goal.id !== "string" || typeof goal.text !== "string") return null;
  return { id: goal.id, text: goal.text, description: typeof goal.description === "string" ? goal.description : undefined, deadline: readDate(goal.deadline), priority: readPriority(goal.priority) };
}
const tasksOf = (value: unknown) => Array.isArray(value) ? value.map(toTask).filter((task): task is CliTaskSummary => task !== null) : [];
const goalsOf = (value: unknown) => Array.isArray(value) ? value.map(toGoal).filter((goal): goal is LiveGoalSummary => goal !== null) : [];
function linksOf(value: unknown): Record<string, string> { return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {}; }
function operationOf(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const operation = raw.operation && typeof raw.operation === "object" ? raw.operation as Record<string, unknown> : raw;
  const operationId = typeof operation.operationId === "string" ? operation.operationId : typeof raw.operationId === "string" ? raw.operationId : undefined;
  if (!operationId) return null;
  return { operationId, operationGroupId: typeof operation.operationGroupId === "string" ? operation.operationGroupId : undefined, operation: typeof operation.operation === "string" ? operation.operation : undefined, status: typeof operation.status === "string" ? operation.status : undefined, targetType: typeof operation.targetType === "string" ? operation.targetType : undefined, targetId: typeof operation.targetId === "string" ? operation.targetId : undefined, undoAvailable: typeof operation.undoAvailable === "boolean" ? operation.undoAvailable : undefined, undoExpiresAt: typeof operation.undoExpiresAt === "string" ? operation.undoExpiresAt : undefined };
}
const operationsOf = (value: unknown) => Array.isArray(value) ? value.map(operationOf).filter((operation) => operation !== null) : [];

function requireScopes(client: LiveCliClient, scopes: string[]) {
  const missing = scopes.filter((scope) => !client.scopes.includes(scope));
  if (missing.length) throw new CliCommandError("forbidden", `Credential is missing required scopes: ${missing.join(", ")}`);
}
function resolveTask(tasks: CliTaskSummary[], target: string) {
  const matches = tasks.filter((task) => task.id === target || task.title === target);
  if (!matches.length) throw new CliCommandError("not_found", `Task not found: ${target}`);
  if (matches.length > 1) throw new CliCommandError("ambiguous_target", `Task target is ambiguous: ${matches.map((task) => `${task.title} (${task.id})`).join(", ")}`);
  return matches[0];
}
function resolveGoal(goals: LiveGoalSummary[], target: string) {
  const matches = goals.filter((goal) => goal.id === target || goal.text === target);
  if (!matches.length) throw new CliCommandError("not_found", `Goal not found: ${target}`);
  if (matches.length > 1) throw new CliCommandError("ambiguous_target", `Goal target is ambiguous: ${matches.map((goal) => `${goal.text} (${goal.id})`).join(", ")}`);
  return matches[0];
}
const active = (task: CliTaskSummary) => task.status === "inbox" || task.status === "timeline";
function horizon(tasks: CliTaskSummary[]) {
  const today = getLocalDateString(); const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 14); const endDate = getLocalDateString(end);
  const byDue = (a: CliTaskSummary, b: CliTaskSummary) => `${a.deadline ?? "9999"}${a.time ?? "99:99"}`.localeCompare(`${b.deadline ?? "9999"}${b.time ?? "99:99"}`) || priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title);
  const matching = tasks.filter(active);
  return { today, endDate, overdue: matching.filter((task) => task.deadline && task.deadline < today).sort(byDue), todayTasks: matching.filter((task) => task.deadline === today).sort(byDue), upcoming: matching.filter((task) => task.deadline && task.deadline > today && task.deadline <= endDate).sort(byDue), inboxCount: matching.filter((task) => task.status === "inbox").length };
}
function split(value?: string) { return value?.split(",").map((part) => part.trim()).filter(Boolean) ?? []; }
function readFilterDate(name: string, args: ParsedArgs) { const value = readOption(args.options, name); if (value !== undefined && !DATE.test(value)) throw new CliCommandError("validation_failed", `--${name} must use YYYY-MM-DD format`); return value; }
async function filterTasks(client: LiveCliClient, args: ParsedArgs, includeGoal = false) {
  const [tasks, goals, links] = await Promise.all([client.listTasks({}).then(tasksOf), includeGoal || readOption(args.options, "goal") ? client.listGoals().then(goalsOf) : Promise.resolve([] as LiveGoalSummary[]), includeGoal || readOption(args.options, "goal") ? client.listGoalLinks().then(linksOf) : Promise.resolve({} as Record<string, string>)]);
  const goalTarget = readOption(args.options, "goal"); const goalId = goalTarget ? resolveGoal(goals, goalTarget).id : undefined;
  const statuses = readOption(args.options, "status"); const priorities = split(readOption(args.options, "priority")); const tags = split(readOption(args.options, "tag")); const date = readFilterDate("date", args); const before = readFilterDate("before", args); const after = readFilterDate("after", args);
  if (statuses && !["active", "inbox", "timeline", "completed", "cancelled"].includes(statuses)) throw new CliCommandError("validation_failed", "--status must be one of: active, inbox, timeline, completed, cancelled");
  if (priorities.some((priority) => !["p1", "p2", "p3"].includes(priority))) throw new CliCommandError("validation_failed", "--priority must contain only p1, p2, or p3");
  const filtered = tasks.filter((task) => {
    if (statuses === "active" ? !active(task) : statuses && task.status !== statuses) return false;
    if (!statuses && !hasFlag(args.options, "all") && !active(task)) return false;
    if (goalId && links[task.id] !== goalId) return false;
    if (priorities.length && (!task.priority || !priorities.includes(task.priority))) return false;
    if (tags.length && !(task.tags ?? []).some((tag) => tags.includes(tag))) return false;
    if (date && task.deadline !== date) return false;
    if (before && (!task.deadline || task.deadline >= before)) return false;
    if (after && (!task.deadline || task.deadline <= after)) return false;
    return true;
  }).map((task) => ({ ...task, goal: links[task.id] ? goals.find((goal) => goal.id === links[task.id]) : undefined })).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || `${a.deadline ?? "9999"}${a.time ?? "99:99"}`.localeCompare(`${b.deadline ?? "9999"}${b.time ?? "99:99"}`) || a.title.localeCompare(b.title));
  return filtered;
}

function clearable(value: string | undefined, name: string) { if (value === undefined) return undefined; const cleaned = value.trim(); if (!cleaned) throw new CliCommandError("validation_failed", `--${name} requires a value`); return ["clear", "none", "null"].includes(cleaned.toLowerCase()) ? null : cleaned; }
function taskWriteFields(args: ParsedArgs, editing: boolean) {
  const title = editing ? clearable(readOption(args.options, "title"), "title") : readTarget(args, "tasks add");
  if (title === null) throw new CliCommandError("validation_failed", "--title cannot be cleared");
  const description = editing ? clearable(readOption(args.options, "description"), "description") : readOption(args.options, "description")?.trim() || undefined;
  const deadline = editing ? clearable(readOption(args.options, "deadline"), "deadline") : readOption(args.options, "deadline");
  const time = editing ? clearable(readOption(args.options, "time"), "time") : readOption(args.options, "time");
  const priorityRaw = editing ? clearable(readOption(args.options, "priority"), "priority") : readOption(args.options, "priority");
  const tagsRaw = editing ? clearable(readOption(args.options, "tags"), "tags") : readOption(args.options, "tags");
  const estimateRaw = editing ? clearable(readOption(args.options, "estimated-minutes"), "estimated-minutes") : readOption(args.options, "estimated-minutes");
  if (deadline && !DATE.test(deadline)) throw new CliCommandError("validation_failed", "--deadline must use YYYY-MM-DD format, or clear");
  if (time && !TIME.test(time)) throw new CliCommandError("validation_failed", "--time must use HH:MM 24-hour format, or clear");
  if (time && deadline === null) throw new CliCommandError("validation_failed", "--time cannot be set when clearing --deadline");
  if (priorityRaw && !["p1", "p2", "p3"].includes(priorityRaw)) throw new CliCommandError("validation_failed", "--priority must be one of: p1, p2, p3, or clear");
  const tags = tagsRaw === null ? null : tagsRaw === undefined ? undefined : split(tagsRaw); if (tags && !tags.length) throw new CliCommandError("validation_failed", "--tags must include at least one non-empty tag"); if (tags && (tags.length > 20 || tags.some((tag) => tag.length > 50))) throw new CliCommandError("validation_failed", "--tags supports up to 20 entries of 50 characters");
  const estimatedMinutes = estimateRaw === null ? null : estimateRaw === undefined ? undefined : Number(estimateRaw); if (estimatedMinutes !== undefined && estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)) throw new CliCommandError("validation_failed", "--estimated-minutes must be a positive integer, or clear");
  const fields = { title: title ?? undefined, description, deadline, time, priority: priorityRaw as "p1" | "p2" | "p3" | null | undefined, tags, estimatedMinutes };
  if (editing && Object.values(fields).every((value) => value === undefined)) throw new CliCommandError("validation_failed", "tasks edit requires at least one editable field");
  return fields;
}
function goalWriteFields(args: ParsedArgs, editing: boolean) {
  const description = editing ? clearable(readOption(args.options, "description"), "description") : readOption(args.options, "description")?.trim() || undefined;
  const deadline = editing ? clearable(readOption(args.options, "deadline"), "deadline") : readOption(args.options, "deadline");
  const priorityRaw = editing ? clearable(readOption(args.options, "priority"), "priority") : readOption(args.options, "priority");
  if (deadline && !DATE.test(deadline)) throw new CliCommandError("validation_failed", "--deadline must use YYYY-MM-DD format, or clear");
  if (priorityRaw && !["p1", "p2", "p3"].includes(priorityRaw)) throw new CliCommandError("validation_failed", "--priority must be one of: p1, p2, p3, or clear");
  if (editing && description === undefined && deadline === undefined && priorityRaw === undefined) throw new CliCommandError("validation_failed", "goals edit requires at least one editable field");
  return { description, deadline, priority: priorityRaw as "p1" | "p2" | "p3" | null | undefined };
}
async function write<T>(action: string, idempotencyKey: string, execute: () => Promise<T>) { try { return await execute(); } catch (error) { const message = error instanceof Error ? error.message : `Failed to execute ${action}`; const retryable = /fetch failed|network|ECONN|ENOTFOUND|\b5\d\d\b|server error/i.test(message); throw new CliCommandError("write_failed", message, { action, idempotencyKey, retryExactRequestWithSameIdempotencyKey: retryable }); } }

export async function executeLiveCommand(client: LiveCliClient, command: string, args: ParsedArgs): Promise<unknown | null> {
  if (["tasks list", "inbox", "today", "overdue", "upcoming", "agent context", "tasks show"].includes(command)) {
    requireScopes(client, ["tasks:read"]);
    if (command === "tasks show") { const [allTasks, goals, links] = await Promise.all([client.listTasks({}).then(tasksOf), client.listGoals().then(goalsOf), client.listGoalLinks().then(linksOf)]); const task = resolveTask(allTasks, readTarget(args, command)); return { task: { ...task, goal: links[task.id] ? goals.find((goal) => goal.id === links[task.id]) : undefined }, source: "live" }; }
    const tasks = await filterTasks(client, args, command === "agent context" || args.options.long === true);
    const data = horizon(tasks);
    if (command === "inbox") return { tasks: tasks.filter((task) => task.status === "inbox"), source: "live" };
    if (command === "today") return { tasks: data.todayTasks, today: data.today, source: "live" };
    if (command === "overdue") return { tasks: data.overdue, today: data.today, source: "live" };
    if (command === "upcoming") return { tasks: data.upcoming, today: data.today, endDate: data.endDate, source: "live" };
    if (command === "agent context") { const slim = (items: CliTaskSummary[]) => items.slice(0, 3).map(({ id, title, deadline, priority, goal }) => ({ id, title, deadline, priority, goal })); return { today: data.today, overdue: { count: data.overdue.length, tasks: slim(data.overdue) }, todayTasks: { count: data.todayTasks.length, tasks: slim(data.todayTasks) }, next: { count: data.upcoming.length, tasks: slim(data.upcoming) }, inbox: { count: data.inboxCount }, source: "live" }; }
    return hasFlag(args.options, "all") || readOption(args.options, "status") ? { tasks, source: "live" } : { ...data, source: "live" };
  }
  if (command === "goals list" || command === "goals show") {
    requireScopes(client, ["tasks:read"]); const [goals, tasks, links] = await Promise.all([client.listGoals().then(goalsOf), client.listTasks({}).then(tasksOf), client.listGoalLinks().then(linksOf)]);
    const summaries = goals.map((goal) => { const linked = tasks.filter((task) => links[task.id] === goal.id && task.status !== "cancelled"); return { ...goal, progress: { completed: linked.filter((task) => task.status === "completed").length, active: linked.length }, activeTasks: linked.filter(active).map((task) => ({ ...task, goal: { id: goal.id, text: goal.text } })), historicalTaskCount: linked.filter((task) => !active(task)).length }; }).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31") || a.text.localeCompare(b.text));
    if (command === "goals list") return { goals: summaries, source: "live" }; const goal = resolveGoal(goals, readTarget(args, command)); return { goal: summaries.find((item) => item.id === goal.id), source: "live" };
  }
  if (command === "operations list") { requireScopes(client, ["tasks:read"]); const raw = readOption(args.options, "limit"); const limit = raw === undefined ? 20 : Number(raw); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new CliCommandError("validation_failed", "--limit must be an integer between 1 and 100"); return { operations: operationsOf(await client.listOperations({ limit, operationGroupId: readOption(args.options, "group") })), source: "live" }; }
  if (command === "operations show") { requireScopes(client, ["tasks:read"]); return { operation: operationOf(await client.getOperation(readTarget(args, command))), source: "live" }; }
  if (command === "operations undo") { requireScopes(client, ["tasks:write"]); const metadata = getWriteMetadata(args); const group = readOption(args.options, "group")?.trim() || undefined; const operationId = args.positionals.length === 3 ? readTarget(args, command) : undefined; const target = { id: group ?? operationId! }; if (metadata.dryRun) return { action: "operations.undo", target, ...metadata, source: "dry-run" }; const result = await write("operations.undo", metadata.idempotencyKey, () => client.undoOperation({ operationId, operationGroupId: group }, metadata.idempotencyKey)); return { action: "operations.undo", target, ...metadata, operation: operationOf(result), source: "live" }; }
  if (command.startsWith("tasks ")) {
    requireScopes(client, ["tasks:write"]); const verb = command.slice(6); const metadata = getWriteMetadata(args); const title = readTarget(args, command); const target = verb === "add" ? { id: "pending", title } : resolveTask(tasksOf(await client.listTasks({})), title);
    const fields = verb === "add" || verb === "edit" ? taskWriteFields(args, verb === "edit") : undefined;
    const scheduleDate = verb === "schedule" ? readFilterDate("date", args) : undefined;
    if (verb === "schedule" && !scheduleDate) throw new CliCommandError("validation_failed", "tasks schedule requires --date");
    if (metadata.dryRun) return { action: `tasks.${verb}`, target, ...metadata, source: "dry-run" };
    let result: unknown;
    if (verb === "add") { result = await write("tasks.add", metadata.idempotencyKey, () => client.addTask({ title: fields!.title!, description: fields!.description ?? undefined, deadline: fields!.deadline ?? undefined, time: fields!.time ?? undefined, priority: fields!.priority ?? undefined, tags: fields!.tags ?? undefined, estimatedMinutes: fields!.estimatedMinutes ?? undefined, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey)); }
    else if (verb === "edit") { result = await write("tasks.edit", metadata.idempotencyKey, () => client.updateTask({ taskId: target.id, ...fields!, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey)); }
    else if (verb === "schedule") result = await write("tasks.schedule", metadata.idempotencyKey, () => client.moveTask({ taskId: target.id, targetDate: scheduleDate!, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey));
    else if (verb === "complete") result = await write("tasks.complete", metadata.idempotencyKey, () => client.completeTask({ taskId: target.id, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey));
    else if (verb === "reopen") result = await write("tasks.reopen", metadata.idempotencyKey, () => client.reopenTask({ taskId: target.id, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey));
    else if (verb === "unschedule") result = await write("tasks.unschedule", metadata.idempotencyKey, () => client.unscheduleTask({ taskId: target.id, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey));
    else if (verb === "remove") result = await write("tasks.remove", metadata.idempotencyKey, () => client.deleteTask({ taskId: target.id, confirmTaskDelete: true, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey));
    else return null;
    return { action: `tasks.${verb}`, target, ...metadata, operation: operationOf(result), source: "live" };
  }
  if (command.startsWith("goals ")) {
    requireScopes(client, ["tasks:write"]); const verb = command.slice(6); const metadata = getWriteMetadata(args); const title = readTarget(args, command); const target = verb === "add" ? { id: "pending", text: title } : resolveGoal(goalsOf(await client.listGoals()), title);
    const fields = verb === "add" || verb === "edit" ? goalWriteFields(args, verb === "edit") : undefined;
    if (metadata.dryRun) return { action: `goals.${verb}`, target: { id: target.id, title: target.text }, ...metadata, source: "dry-run" };
    let result: unknown;
    if (verb === "add") { result = await write("goals.add", metadata.idempotencyKey, () => client.createGoal({ text: title, description: fields!.description ?? undefined, deadline: fields!.deadline ?? undefined, priority: fields!.priority ?? undefined, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey)); }
    else if (verb === "edit") { result = await write("goals.edit", metadata.idempotencyKey, () => client.updateGoal({ goalId: target.id, ...fields!, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey)); }
    else if (verb === "remove") result = await write("goals.remove", metadata.idempotencyKey, () => client.deleteGoal({ goalId: target.id, confirmGoalDelete: true, operationGroupId: metadata.operationGroupId }, metadata.idempotencyKey));
    else return null;
    return { action: `goals.${verb}`, target: { id: target.id, title: target.text }, ...metadata, operation: operationOf(result), source: "live" };
  }
  return null;
}
