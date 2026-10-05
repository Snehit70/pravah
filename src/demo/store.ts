// In-memory demo data engine with localStorage persistence. Implements the
// subset of the Convex API the web app uses, with the same return shapes and
// ordering guarantees as the backend functions in convex/.
/* eslint-disable @typescript-eslint/no-explicit-any -- mock of the untyped Convex wire boundary */

import {
  buildDemoData,
  todayKey,
  type DemoCredential,
  type DemoData,
  type DemoGoal,
  type DemoIntegration,
  type DemoReviewItem,
  type DemoTask,
  type DemoUser,
} from "./seed";
import { DEMO_DATA_KEY } from "./demoFlag";

type TaskState = "inbox" | "scheduled" | "completed" | "cancelled";

const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_GRACE_MS = 30 * 60 * 1000;

function taskState(task: DemoTask): TaskState {
  if (task.cancelledAt) return "cancelled";
  if (task.completedAt) return "completed";
  return task.deadline ? "scheduled" : "inbox";
}

function priorityRank(priority: DemoTask["priority"]): number {
  if (priority === "p1") return 0;
  if (priority === "p2") return 1;
  if (priority === "p3") return 2;
  return 3;
}

function addDays(dateString: string, days: number): string {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function diffDays(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / DAY_MS);
}

function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

// ---------------------------------------------------------------- state ----

let data: DemoData = buildDemoData();
const listeners = new Set<() => void>();
const queryCache = new Map<string, unknown>();

function bump(): void {
  queryCache.clear();
  try {
    if (data) window.localStorage.setItem(DEMO_DATA_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable: the in-memory demo keeps working.
  }
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function snapshot<T>(name: string, args: unknown): T {
  const key = `${name}::${stableKey(args)}`;
  if (queryCache.has(key)) return queryCache.get(key) as T;
  const result = runQuery(name, args) as T;
  queryCache.set(key, result);
  return result;
}

export function loadState(): void {
  const raw = window.localStorage.getItem(DEMO_DATA_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DemoData;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.tasks)) {
        shiftToToday(parsed);
        data = parsed;
        return;
      }
    } catch {
      // Corrupt payload: fall through to a fresh seed.
    }
  }
  data = buildDemoData();
  bump();
}

// Keep the demo anchored to the real "today": if the stored seed was written
// on an earlier day, shift every date forward so the timeline stays alive.
function shiftToToday(stored: DemoData): void {
  const delta = diffDays(stored.dayKey, todayKey());
  if (delta === 0) return;
  const shiftMs = delta * DAY_MS;
  for (const task of stored.tasks) {
    if (task.deadline) task.deadline = addDays(task.deadline, delta);
    if (task.completedAt) task.completedAt += shiftMs;
    if (task.cancelledAt) task.cancelledAt += shiftMs;
    task.createdAt += shiftMs;
    task.updatedAt += shiftMs;
    task.scheduledAt += shiftMs;
    task._creationTime += shiftMs;
  }
  for (const goal of stored.goals) {
    if (goal.deadline) goal.deadline = addDays(goal.deadline, delta);
    goal.createdAt += shiftMs;
  }
  for (const integration of stored.integrations) {
    if (integration.lastSyncedAt) integration.lastSyncedAt += shiftMs;
    integration.createdAt += shiftMs;
    integration.updatedAt += shiftMs;
    integration._creationTime += shiftMs;
  }
  for (const run of stored.lastSyncRuns) {
    run.startedAt += shiftMs;
    if (run.finishedAt) run.finishedAt += shiftMs;
    run._creationTime += shiftMs;
  }
  for (const item of stored.reviewQueue) {
    if (item.scheduledDate) item.scheduledDate = addDays(item.scheduledDate, delta);
    if (item.deadline) item.deadline = addDays(item.deadline, delta);
    item.createdAt += shiftMs;
    item.updatedAt += shiftMs;
    item._creationTime += shiftMs;
  }
  for (const credential of stored.credentials) {
    credential.createdAt += shiftMs;
    credential.updatedAt += shiftMs;
    credential._creationTime += shiftMs;
    if (credential.lastUsedAt) credential.lastUsedAt += shiftMs;
    if (credential.revokedAt) credential.revokedAt += shiftMs;
  }
  stored.dayKey = todayKey();
}

export function resetDemoData(): void {
  window.localStorage.removeItem(DEMO_DATA_KEY);
  data = buildDemoData();
  bump();
}

function nextId(prefix: string): string {
  return `${prefix}-${data.nextId++}`;
}

function requireTask(taskId: string): DemoTask {
  const task = data?.tasks.find((candidate) => candidate._id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  return task;
}

function nextPositionInLane(deadline: string | undefined): number {
  if (!data) return 0;
  let max = -1;
  for (const task of data.tasks) {
    if (task.cancelledAt || task.completedAt) continue;
    if (task.deadline !== deadline) continue;
    max = Math.max(max, task.position);
  }
  return max + 1;
}

// ---------------------------------------------------------------- query ----

function toCanonical(task: DemoTask) {
  return { ...task };
}

function sortInboxFirst(a: DemoTask, b: DemoTask): number {
  return (
    (a.deadline ?? "").localeCompare(b.deadline ?? "") ||
    priorityRank(a.priority) - priorityRank(b.priority) ||
    a.position - b.position
  );
}

function runQuery(name: string, args: any): unknown {
  switch (name) {
    case "tasks:listBoardTasks": {
      const visible = data.tasks.filter((task) => {
        const state = taskState(task);
        return state === "inbox" || state === "scheduled";
      });
      const inbox = visible
        .filter((task) => taskState(task) === "inbox")
        .sort((a, b) => a.position - b.position);
      const dated = visible
        .filter((task) => taskState(task) === "scheduled")
        .sort((a, b) => a.deadline!.localeCompare(b.deadline!) || a.position - b.position);
      return [...inbox, ...dated].map(toCanonical);
    }
    case "tasks:listTasks": {
      const status = args?.status as TaskState | undefined;
      const date = args?.date as string | undefined;
      let rows = data.tasks.slice();
      if (status) rows = rows.filter((task) => taskState(task) === status);
      if (date) rows = rows.filter((task) => task.deadline === date);
      if (!status) rows = rows.filter((task) => taskState(task) !== "cancelled");
      if (status === "completed") {
        return rows
          .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
          .map(toCanonical);
      }
      return rows.sort(sortInboxFirst).map(toCanonical);
    }
    case "goals:list": {
      return data.goals.map((goal) => ({
        id: goal.clientId,
        text: goal.text,
        description: goal.description,
        deadline: goal.deadline,
        priority: goal.priority,
        createdAt: goal.createdAt,
      }));
    }
    case "goals:listLinks": {
      const ids = args?.taskIds as string[] | undefined;
      return ids ? Object.fromEntries(ids.filter((id) => data.goalLinks[id] !== undefined).map((id) => [id, data.goalLinks[id]])) : { ...data.goalLinks };
    }
    case "sync:getIntegrationStatus": {
      const provider = args?.provider as "google_calendar" | "gmail";
      const integration =
        data.integrations.find((candidate) => candidate.provider === provider) ?? null;
      const lastRun =
        data.lastSyncRuns.find((candidate) => candidate.provider === provider) ?? null;
      const pendingReviewCount = data.reviewQueue.filter(
        (item) => item.provider === provider && item.status === "pending"
      ).length;
      return { integration, lastRun, pendingReviewCount };
    }
    case "sync:listReviewQueue": {
      const status = args?.status as DemoReviewItem["status"] | undefined;
      const provider = args?.provider as DemoReviewItem["provider"] | undefined;
      const limit = (args?.limit as number | undefined) ?? 100;
      return data.reviewQueue
        .filter(
          (item) =>
            (!status || item.status === status) && (!provider || item.provider === provider)
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((item) => ({ ...item }));
    }
    case "auth:getCurrentUser": {
      const user = data.user;
      return { _id: "demo-user", name: user.name, email: user.email, emailVerified: true };
    }
    case "automation:listCredentials": {
      return data.credentials
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((credential) => ({ ...credential }));
    }
    default:
      throw new Error(`demo: no query handler for ${name}`);
  }
}

// ------------------------------------------------------------- mutation ----

function findGoal(goalClientId: string): DemoGoal | undefined {
  return data?.goals.find((goal) => goal.clientId === goalClientId);
}

export function dispatch(name: string, args: any): unknown {
  const result = runMutation(name, args);
  bump();
  return result;
}

function runMutation(name: string, args: any): unknown {
  switch (name) {
    case "users:store": {
      return "demo-user";
    }
    case "tasks:addTask": {
      const now = Date.now();
      const deadline = args?.deadline as string | undefined;
      const task: DemoTask = {
        _id: nextId("demo-task"),
        _creationTime: now,
        title: args?.title as string,
        description: args?.description as string | undefined,
        deadline,
        time: deadline ? (args?.time as string | undefined) : undefined,
        scheduledAt: now,
        position: nextPositionInLane(deadline),
        source: args?.source ?? "manual",
        estimatedMinutes: args?.estimatedMinutes as number | undefined,
        tags: args?.tags as string[] | undefined,
        priority: args?.priority as DemoTask["priority"],
        createdBy: args?.source === "ai-agent" ? "kairo" : "user",
        ownerTokenIdentifier: "demo:local",
        createdAt: now,
        updatedAt: now,
      };
      data.tasks.push(task);
      return task._id;
    }
    case "tasks:moveTask": {
      const task = requireTask(args?.taskId);
      if (task.cancelledAt) throw new Error("Task is cancelled");
      if (task.completedAt) throw new Error("Task is completed");
      const targetDate = args?.targetDate as string;
      task.deadline = targetDate;
      task.time = undefined;
      task.position = (args?.position as number | undefined) ?? nextPositionInLane(targetDate);
      task.updatedAt = Date.now();
      return undefined;
    }
    case "tasks:completeTask": {
      const task = requireTask(args?.taskId);
      if (task.cancelledAt) throw new Error("Task is cancelled");
      if (!task.completedAt) {
        task.completedAt = Date.now();
        task.updatedAt = task.completedAt;
      }
      return undefined;
    }
    case "tasks:reopenTask": {
      const task = requireTask(args?.taskId);
      if (!task.completedAt) throw new Error("Task is not completed");
      task.completedAt = undefined;
      if (!task.deadline) task.position = nextPositionInLane(undefined);
      task.updatedAt = Date.now();
      return undefined;
    }
    case "tasks:unscheduleTask": {
      const task = requireTask(args?.taskId);
      if (!task.deadline) throw new Error("Task is not scheduled");
      task.deadline = undefined;
      task.time = undefined;
      task.position = nextPositionInLane(undefined);
      task.updatedAt = Date.now();
      return undefined;
    }
    case "tasks:reorderTasks": {
      const date = args?.date as string;
      const taskIds = args?.taskIds as string[];
      taskIds.forEach((taskId, index) => {
        const task = requireTask(taskId);
        if (task.deadline !== date) throw new Error(`Task ${taskId} does not belong to ${date}`);
        if (task.completedAt || task.cancelledAt) throw new Error("Task is not active");
        task.position = index;
        task.updatedAt = Date.now();
      });
      return undefined;
    }
    case "tasks:reorderInboxTasks": {
      const taskIds = args?.taskIds as string[];
      taskIds.forEach((taskId, index) => {
        const task = requireTask(taskId);
        if (taskState(task) !== "inbox") throw new Error(`Task ${taskId} is not in the inbox`);
        task.position = index;
        task.updatedAt = Date.now();
      });
      return undefined;
    }
    case "tasks:bulkSoftDeleteInboxTasks": {
      const taskIds = new Set(args?.taskIds as string[]);
      if (taskIds.size !== (args?.taskIds as string[]).length) {
        throw new Error("Duplicate task ids");
      }
      for (const taskId of taskIds) {
        const task = requireTask(taskId);
        if (taskState(task) !== "inbox") throw new Error(`Task ${taskId} is not in the inbox`);
      }
      const now = Date.now();
      for (const taskId of taskIds) {
        const task = requireTask(taskId);
        task.cancelledAt = now;
        task.completedAt = undefined;
        task.updatedAt = now;
      }
      return undefined;
    }
    case "tasks:restoreInboxTasks": {
      const now = Date.now();
      for (const taskId of args?.taskIds as string[]) {
        const task = requireTask(taskId);
        if (!task.cancelledAt) throw new Error("Task is not deleted");
        if (now - task.cancelledAt > PURGE_GRACE_MS) {
          throw new Error("Task recovery window expired");
        }
        task.cancelledAt = undefined;
        task.position = nextPositionInLane(undefined);
        task.updatedAt = now;
      }
      return undefined;
    }
    case "tasks:updateTask": {
      const task = requireTask(args?.taskId);
      if (args?.title !== undefined) task.title = args.title;
      if (args?.description !== undefined) task.description = args.description ?? undefined;
      if (args?.estimatedMinutes !== undefined) task.estimatedMinutes = args.estimatedMinutes;
      if (args?.tags !== undefined) task.tags = args.tags ?? undefined;
      if (args?.priority !== undefined) task.priority = args.priority ?? undefined;
      if (args?.deadline !== undefined) {
        const deadline = args.deadline ?? undefined;
        if (args?.time !== undefined) {
          task.time = deadline ? (args.time ?? undefined) : undefined;
        } else if (!deadline) {
          task.time = undefined;
        }
        if (deadline !== task.deadline) {
          task.deadline = deadline;
          if (deadline) task.position = nextPositionInLane(deadline);
          else task.position = nextPositionInLane(undefined);
        }
      } else if (args?.time !== undefined && task.deadline) {
        task.time = args.time ?? undefined;
      }
      task.updatedAt = Date.now();
      return undefined;
    }
    case "tasks:softDeleteTask": {
      const task = requireTask(args?.taskId);
      if (!task.cancelledAt) {
        task.cancelledAt = Date.now();
        task.updatedAt = task.cancelledAt;
      }
      return undefined;
    }
    case "tasks:restoreTask": {
      const task = requireTask(args?.taskId);
      if (!task.cancelledAt) throw new Error("Task is not deleted");
      if (Date.now() - task.cancelledAt > PURGE_GRACE_MS) {
        throw new Error("Task recovery window expired");
      }
      task.cancelledAt = undefined;
      task.position = task.deadline ? nextPositionInLane(task.deadline) : nextPositionInLane(undefined);
      task.updatedAt = Date.now();
      return undefined;
    }
    case "goals:upsert": {
      const clientId = args?.clientId as string;
      const existing = findGoal(clientId);
      const now = Date.now();
      if (existing) {
        existing.text = args?.text as string;
        existing.description = args?.description ?? undefined;
        existing.deadline = args?.deadline ?? undefined;
        existing.priority = args?.priority ?? undefined;
      } else {
        data.goals.push({
          clientId,
          text: args?.text as string,
          description: args?.description ?? undefined,
          deadline: args?.deadline ?? undefined,
          priority: args?.priority ?? undefined,
          createdAt: (args?.createdAt as number) ?? now,
        });
      }
      return undefined;
    }
    case "goals:remove": {
      const clientId = args?.clientId as string;
      data.goals = data.goals.filter((goal) => goal.clientId !== clientId);
      for (const [taskId, goalId] of Object.entries(data.goalLinks)) {
        if (goalId === clientId) delete data.goalLinks[taskId];
      }
      return undefined;
    }
    case "goals:setLink": {
      const taskId = args?.taskId as string;
      const goalClientId = args?.goalClientId as string | null;
      if (goalClientId === null) delete data.goalLinks[taskId];
      else data.goalLinks[taskId] = goalClientId;
      return undefined;
    }
    case "sync:upsertIntegration": {
      const provider = args?.provider as DemoIntegration["provider"];
      const now = Date.now();
      let integration = data.integrations.find((candidate) => candidate.provider === provider);
      if (!integration) {
        integration = {
          _id: nextId("demo-integration"),
          _creationTime: now,
          provider,
          status: args?.status ?? "disconnected",
          syncEnabled: args?.syncEnabled ?? false,
          ownerTokenIdentifier: "demo:local",
          createdAt: now,
          updatedAt: now,
        };
        data.integrations.push(integration);
      }
      integration.status = args?.status ?? integration.status;
      integration.syncEnabled = args?.syncEnabled ?? integration.syncEnabled;
      if (args?.accountEmail !== undefined) integration.accountEmail = args.accountEmail;
      if (args?.lastError !== undefined) integration.lastError = args.lastError;
      integration.updatedAt = now;
      return integration._id;
    }
    case "sync:enqueueGmailCandidate": {
      const externalId = args?.externalId as string;
      const existing = data.reviewQueue.find(
        (item) => item.provider === "gmail" && item.externalId === externalId
      );
      if (existing) return { reviewId: existing._id, deduplicated: true };
      const now = Date.now();
      const reviewId = nextId("demo-review");
      data.reviewQueue.push({
        _id: reviewId,
        _creationTime: now,
        provider: "gmail",
        sourceType: "gmail_candidate",
        externalId,
        title: args?.title as string,
        description: args?.description ?? undefined,
        deadline: args?.deadline ?? undefined,
        estimatedMinutes: args?.estimatedMinutes ?? undefined,
        tags: args?.tags ?? undefined,
        status: "pending",
        ownerTokenIdentifier: "demo:local",
        createdAt: now,
        updatedAt: now,
      });
      return { reviewId, deduplicated: false };
    }
    case "sync:approveReviewItem": {
      const item = data.reviewQueue.find((candidate) => candidate._id === args?.reviewId);
      if (!item) throw new Error("Review item not found");
      if (item.status !== "pending") throw new Error("Review item is not pending");
      const now = Date.now();
      const scheduledDate =
        (args?.clearScheduledDate ? undefined : (args?.scheduledDate ?? item.scheduledDate)) ||
        undefined;
      const taskId = nextId("demo-task");
      data.tasks.push({
        _id: taskId,
        _creationTime: now,
        title: item.title,
        description: item.description,
        deadline: item.deadline ?? scheduledDate,
        scheduledAt: now,
        position: nextPositionInLane(item.deadline ?? scheduledDate),
        source: "gmail",
        estimatedMinutes: item.estimatedMinutes,
        tags: item.tags,
        priority: undefined,
        createdBy: "gmail",
        ownerTokenIdentifier: "demo:local",
        createdAt: now,
        updatedAt: now,
      });
      item.status = "approved";
      item.reviewedAt = now;
      item.updatedAt = now;
      return { taskId };
    }
    case "sync:rejectReviewItem": {
      const item = data.reviewQueue.find((candidate) => candidate._id === args?.reviewId);
      if (!item) throw new Error("Review item not found");
      if (item.status !== "pending") throw new Error("Review item is not pending");
      item.status = "rejected";
      item.rejectionReason = args?.reason;
      item.reviewedAt = Date.now();
      item.updatedAt = item.reviewedAt;
      return undefined;
    }
    case "automation:issueBootstrapToken": {
      const ttlMinutes = Math.min(Math.max(args?.ttlMinutes ?? 15, 1), 60);
      const token =
        "pravah_bootstrap_" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      return {
        bootstrapTokenId: nextId("demo-token"),
        bootstrapToken: token,
        expiresAt: Date.now() + ttlMinutes * 60_000,
        label: args?.label as string,
        scopes: args?.scopes as string[],
      };
    }
    case "automation:revokeCredential": {
      const credential = data.credentials.find((candidate) => candidate._id === args?.credentialId);
      if (!credential) throw new Error("Credential not found");
      if (credential.status === "revoked") return { revoked: false, alreadyRevoked: true };
      credential.status = "revoked";
      credential.revokedAt = Date.now();
      credential.updatedAt = Date.now();
      return { revoked: true };
    }
    case "syncActions:importGoogleCalendarAction": {
      // Simulate a small calendar import so the demo shows real movement.
      const now = Date.now();
      const base = new Date();
      const imports = [
        { title: "1:1 with Meera", dayOffset: 1, time: "11:00", minutes: 30 },
        { title: "Design review — Kairo panel", dayOffset: 2, time: "16:00", minutes: 45 },
        { title: "Table tennis with the floor", dayOffset: 4, time: "19:00", minutes: 60 },
      ];
      for (const event of imports) {
        data.tasks.push({
          _id: nextId("demo-task"),
          _creationTime: now,
          title: event.title,
          deadline: addDays(
            `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(
              base.getDate()
            ).padStart(2, "0")}`,
            event.dayOffset
          ),
          time: event.time,
          scheduledAt: now,
          position: nextPositionInLane(addDays(todayKey(), event.dayOffset)),
          source: "gcal",
          estimatedMinutes: event.minutes,
          createdBy: "gcal",
          ownerTokenIdentifier: "demo:local",
          createdAt: now,
          updatedAt: now,
        });
      }
      const gmailIntegration = data.integrations.find(
        (candidate) => candidate.provider === "google_calendar"
      );
      if (gmailIntegration) {
        gmailIntegration.status = "connected";
        gmailIntegration.syncEnabled = true;
        gmailIntegration.accountEmail = gmailIntegration.accountEmail ?? data.user.email;
        gmailIntegration.lastSyncedAt = now;
        gmailIntegration.updatedAt = now;
      }
      data.lastSyncRuns = data.lastSyncRuns.filter((run) => run.provider !== "google_calendar");
      data.lastSyncRuns.push({
        _id: nextId("demo-sync-run"),
        _creationTime: now,
        provider: "google_calendar",
        direction: "import",
        status: "success",
        startedAt: now - 1500,
        finishedAt: now,
        importedCount: imports.length,
        updatedCount: 0,
        skippedCount: 22,
      });
      return {
        importedCount: imports.length,
        updatedCount: 0,
        skippedCount: 22,
        maxUpdatedAt: new Date(now).toISOString(),
      };
    }
    default:
      throw new Error(`demo: no mutation handler for ${name}`);
  }
}

export type { DemoCredential, DemoData, DemoGoal, DemoTask, DemoUser };
