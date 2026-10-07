/// <reference types="node" />
import { callConvexApi, ConvexHttpError } from "./automationHttpClient";
import { loadStoredCredential, type StoredCredential } from "./authStore";

interface CliEnv {
  PRAVAH_HTTP_URL?: string;
  CONVEX_SELF_HOSTED_SITE_URL?: string;
  CONVEX_SITE_URL?: string;
  VITE_CONVEX_SITE_URL?: string;
  CONVEX_URL?: string;
  VITE_CONVEX_URL?: string;
  CONVEX_HTTP_API_KEY?: string;
}

export const DEFAULT_PRAVAH_HTTP_URL = "https://combative-zebra-261.eu-west-1.convex.site";
const LEGACY_PRAVAH_HTTP_URL = "https://befitting-swan-125.eu-west-1.convex.site";

export interface LiveCliClient {
  mode: "live";
  credentialLabel: string;
  scopes: string[];
  getCredentialStatus(): Promise<{ label: string; scopes: string[]; ownerTokenIdentifier: string }>;
  listTasks(filters: { status?: string; date?: string; before?: string; after?: string }): Promise<unknown>;
  getTask(taskId: string): Promise<unknown>;
  resolveTaskTitle?(title: string): Promise<unknown>;
  listGoals(): Promise<unknown>;
  listGoalLinks(taskIds?: string[]): Promise<unknown>;
  listGoalTasks?(goalId?: string): Promise<{ tasks: unknown[]; links: Record<string, string> }>;
  getInbox(): Promise<unknown>;
  getTimeline(endDate: string): Promise<unknown>;
  getReviewQueue(status?: string, limit?: number): Promise<unknown>;
  getSyncStatus(provider?: string): Promise<unknown>;
  listOperations(options: { limit?: number; operationGroupId?: string }): Promise<unknown>;
  getOperation(operationId: string): Promise<unknown>;
  addTask(input: {
    title: string;
    deadline?: string;
    time?: string;
    description?: string;
    priority?: "p1" | "p2" | "p3";
    estimatedMinutes?: number;
    tags?: string[];
    operationGroupId?: string;
  }, idempotencyKey: string): Promise<unknown>;
  moveTask(input: { taskId: string; targetDate: string; operationGroupId?: string }, idempotencyKey: string): Promise<unknown>;
  updateTask(input: {
    taskId: string;
    title?: string;
    description?: string | null;
    deadline?: string | null;
    time?: string | null;
    priority?: "p1" | "p2" | "p3" | null;
    estimatedMinutes?: number | null;
    tags?: string[] | null;
    operationGroupId?: string;
  }, idempotencyKey: string): Promise<unknown>;
  completeTask(input: { taskId: string; operationGroupId?: string }, idempotencyKey: string): Promise<unknown>;
  reopenTask(input: { taskId: string; operationGroupId?: string }, idempotencyKey: string): Promise<unknown>;
  unscheduleTask(input: { taskId: string; operationGroupId?: string }, idempotencyKey: string): Promise<unknown>;
  updateGoal(input: {
    goalId: string;
    description?: string | null;
    deadline?: string | null;
    priority?: "p1" | "p2" | "p3" | null;
    operationGroupId?: string;
  }, idempotencyKey: string): Promise<unknown>;
  createGoal(input: {
    clientId?: string;
    text: string;
    description?: string;
    deadline?: string;
    priority?: "p1" | "p2" | "p3";
    operationGroupId?: string;
  }, idempotencyKey: string): Promise<unknown>;
  deleteGoal(input: {
    goalId: string;
    confirmGoalDelete: boolean;
    operationGroupId?: string;
  }, idempotencyKey: string): Promise<unknown>;
  setGoalLink(input: {
    taskId: string;
    goalId: string | null;
    operationGroupId?: string;
  }, idempotencyKey: string): Promise<unknown>;
  deleteTask(input: {
    taskId: string;
    confirmTaskDelete: boolean;
    operationGroupId?: string;
  }, idempotencyKey: string): Promise<unknown>;
  undoOperation(input: {
    operationId?: string;
    operationGroupId?: string;
  }, idempotencyKey: string): Promise<unknown>;
}

export interface CliAuthClient {
  baseUrl: string;
  exchangeBootstrapToken(bootstrapToken: string): Promise<StoredCredential>;
}

function normalizeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/\/+$/, "");
}

function deriveSiteUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return undefined;
  return normalized.includes(".convex.cloud")
    ? normalized.replace(".convex.cloud", ".convex.site")
    : normalized;
}

export function resolveStoredCredentialSiteUrl(siteUrl?: string): string | undefined {
  const normalized = normalizeHttpUrl(siteUrl);
  return normalized === LEGACY_PRAVAH_HTTP_URL ? DEFAULT_PRAVAH_HTTP_URL : normalized;
}

export function resolveCliHttpUrl(env: CliEnv): string | undefined {
  return (
    normalizeHttpUrl(env.PRAVAH_HTTP_URL) ??
    normalizeHttpUrl(env.CONVEX_SELF_HOSTED_SITE_URL) ??
    normalizeHttpUrl(env.CONVEX_SITE_URL) ??
    normalizeHttpUrl(env.VITE_CONVEX_SITE_URL) ??
    deriveSiteUrl(env.CONVEX_URL) ??
    deriveSiteUrl(env.VITE_CONVEX_URL) ??
    DEFAULT_PRAVAH_HTTP_URL
  );
}

export function createLiveClient(env: CliEnv): LiveCliClient | null {
  const storedCredential = loadStoredCredential();
  const baseUrl =
    normalizeHttpUrl(env.PRAVAH_HTTP_URL) ??
    normalizeHttpUrl(env.CONVEX_SELF_HOSTED_SITE_URL) ??
    resolveStoredCredentialSiteUrl(storedCredential?.siteUrl) ??
    normalizeHttpUrl(env.CONVEX_SITE_URL) ??
    normalizeHttpUrl(env.VITE_CONVEX_SITE_URL) ??
    deriveSiteUrl(env.CONVEX_URL) ??
    deriveSiteUrl(env.VITE_CONVEX_URL);
  const apiKey = env.CONVEX_HTTP_API_KEY;
  const bearerToken = storedCredential?.secret;
  if (!baseUrl || (!apiKey && !bearerToken)) {
    return null;
  }

  async function get(endpoint: string) {
    return callConvexApi({
      convexUrl: baseUrl,
      endpoint,
      method: "GET",
      apiKey,
      bearerToken,
    });
  }

  async function post(
    endpoint: string,
    body: Record<
      string,
      string | number | boolean | null | string[] | undefined
    >,
    idempotencyKey: string
  ) {
    const payload = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    ) as Record<string, string | number | boolean | null | string[]>;
    return callConvexApi({
      convexUrl: baseUrl,
      endpoint,
      method: "POST",
      body: payload,
      apiKey,
      bearerToken,
      idempotencyKey,
    });
  }

  return {
    mode: "live",
    credentialLabel: storedCredential?.label ?? "admin-api-key",
    scopes: storedCredential?.scopes ?? [
      "tasks:read",
      "tasks:write",
      "review:read",
      "sync:read",
    ],
    async getCredentialStatus() {
      const status = await get("/automation/credential");
      if (!status || typeof status !== "object" || Array.isArray(status)) throw new Error("Credential status response is invalid");
      const credential = status as { label?: unknown; scopes?: unknown; ownerTokenIdentifier?: unknown };
      if (typeof credential.label !== "string" || !Array.isArray(credential.scopes) || !credential.scopes.every((scope): scope is string => typeof scope === "string") || typeof credential.ownerTokenIdentifier !== "string") throw new Error("Credential status response is invalid");
      return { label: credential.label, scopes: credential.scopes, ownerTokenIdentifier: credential.ownerTokenIdentifier };
    },
    async listTasks(filters) {
      const query = new URLSearchParams();
      if (filters.status) {
        query.set(
          "status",
          filters.status === "timeline" || (filters.status === "active" && filters.date) ? "scheduled" : filters.status
        );
      }
      if (filters.date) query.set("date", filters.date);
      if (filters.before) query.set("before", filters.before);
      if (filters.after) query.set("after", filters.after);
      const qs = query.toString();
      // Exact-date and scheduled ranges already have selective server indexes.
      if (filters.date || ["inbox", "timeline", "scheduled"].includes(filters.status ?? "")) {
        return get(`/tasks${qs ? `?${qs}` : ""}`);
      }
      const tasks: unknown[] = []; const seen = new Set<string>();
      for (;;) {
        let raw: unknown;
        try { raw = await get(`/tasks/page?${query.toString()}`); } catch (error) {
          // Publishing the CLI may precede the backend rollout. Only an absent
          // FIRST page permits a legacy fallback; never mask auth or partial-read failures.
          if (!(error instanceof ConvexHttpError) || error.status !== 404 || seen.size > 0) throw error;
          const legacy = new URLSearchParams(query);
          if (filters.status === "active") legacy.delete("status");
          const result = await get(`/tasks?${legacy.toString()}`);
          if (!Array.isArray(result)) throw new Error("Invalid legacy task list");
          return filters.status === "active" ? result.filter((task) => task && typeof task === "object" && task.completedAt === undefined && task.cancelledAt === undefined && task.status !== "completed" && task.status !== "cancelled") : result;
        }
        if (!raw || typeof raw !== "object") throw new Error("Invalid task page");
        const page = raw as { page?: unknown; isDone?: unknown; continueCursor?: unknown };
        if (!Array.isArray(page.page) || typeof page.isDone !== "boolean") throw new Error("Invalid task page");
        tasks.push(...page.page);
        if (page.isDone) return tasks;
        if (typeof page.continueCursor !== "string" || !page.continueCursor || seen.has(page.continueCursor)) throw new Error("Task pagination did not advance");
        seen.add(page.continueCursor); query.set("cursor", page.continueCursor);
      }
    },
    getTask(taskId) {
      const query = new URLSearchParams({ taskId });
      return get(`/tasks/get?${query.toString()}`);
    },
    async resolveTaskTitle(title) {
      try {
        const rows = await get(`/tasks/resolve?${new URLSearchParams({title})}`);
        if (!Array.isArray(rows) || rows.length > 2 || rows.some(row => !row || typeof row !== "object" || typeof row._id !== "string" || row.title !== title)) {
          throw new Error("Invalid task title resolution");
        }
        return rows;
      } catch (error) {
        if (!(error instanceof ConvexHttpError) || error.status !== 404) throw error;
        return this.listTasks({});
      }
    },
    listGoals() {
      return get("/goals");
    },
    async listGoalTasks(goalId) {
      const query = new URLSearchParams(goalId === undefined ? {} : { goalId });
      const tasks = new Map<string, unknown>();
      const links: Record<string, string> = {};
      const seen = new Set<string>();
      for (;;) {
        let raw: unknown;
        try {
          raw = await get(`/goals/tasks${query.size ? `?${query}` : ""}`);
        } catch (error) {
          if (seen.size && error instanceof ConvexHttpError && error.status === 404) {
            throw new Error("Goal task pagination failed after the first page", { cause: error });
          }
          throw error;
        }
        const result = raw as { tasks?: unknown; links?: unknown; isDone?: unknown; continueCursor?: unknown } | null;
        if (!result || typeof result !== "object" || !Array.isArray(result.tasks) ||
          !result.links || typeof result.links !== "object" || Array.isArray(result.links) ||
          Object.values(result.links).some(value => typeof value !== "string") || typeof result.isDone !== "boolean") {
          throw new Error("Invalid goal tasks response");
        }
        for (const task of result.tasks) {
          if (!task || typeof task !== "object" || typeof task._id !== "string") throw new Error("Invalid goal task");
          tasks.set(task._id, task);
        }
        Object.assign(links, result.links);
        if (result.isDone) return { tasks: [...tasks.values()], links };
        if (typeof result.continueCursor !== "string" || !result.continueCursor || seen.has(result.continueCursor)) throw new Error("Goal task pagination did not advance");
        seen.add(result.continueCursor);
        query.set("cursor", result.continueCursor);
      }
    },
    async listGoalLinks(taskIds) {
      if (!taskIds) return get("/goal-links");
      const ids = [...new Set(taskIds)]; const links: Record<string, string> = {};
      for (let start = 0; start < ids.length; start += 100) {
        const query = new URLSearchParams({ taskIds: ids.slice(start, start + 100).join(",") });
        const result = await get(`/goal-links?${query.toString()}`);
        if (!result || typeof result !== "object" || Array.isArray(result) || Object.values(result).some((v) => typeof v !== "string")) throw new Error("Invalid goal links");
        Object.assign(links, result);
      }
      return links;
    },
    getInbox() {
      return get("/inbox");
    },
    getTimeline(endDate) {
      const query = new URLSearchParams({ endDate });
      return get(`/timeline?${query.toString()}`);
    },
    getReviewQueue(status, limit) {
      const query = new URLSearchParams();
      if (status) query.set("status", status);
      if (limit !== undefined) query.set("limit", String(limit));
      const qs = query.toString();
      return get(`/review-queue${qs ? `?${qs}` : ""}`);
    },
    getSyncStatus(provider = "google_calendar") {
      const query = new URLSearchParams({ provider });
      return get(`/sync/status?${query.toString()}`);
    },
    listOperations(options) {
      const query = new URLSearchParams();
      if (options.limit !== undefined) query.set("limit", String(options.limit));
      if (options.operationGroupId) query.set("operationGroupId", options.operationGroupId);
      const qs = query.toString();
      return get(`/operations${qs ? `?${qs}` : ""}`);
    },
    getOperation(operationId) {
      const query = new URLSearchParams({ operationId });
      return get(`/operations/get?${query.toString()}`);
    },
    addTask(input, idempotencyKey) {
      return post("/tasks", {
        title: input.title,
        description: input.description,
        deadline: input.deadline,
        time: input.time,
        priority: input.priority,
        estimatedMinutes: input.estimatedMinutes,
        tags: input.tags,
        operationGroupId: input.operationGroupId,
      }, idempotencyKey);
    },
    moveTask(input, idempotencyKey) {
      return post("/tasks/move", input, idempotencyKey);
    },
    updateTask(input, idempotencyKey) {
      return post("/tasks/update", input, idempotencyKey);
    },
    completeTask(input, idempotencyKey) {
      return post("/tasks/complete", input, idempotencyKey);
    },
    reopenTask(input, idempotencyKey) {
      return post("/tasks/reopen", input, idempotencyKey);
    },
    unscheduleTask(input, idempotencyKey) {
      return post("/tasks/unschedule", input, idempotencyKey);
    },
    updateGoal(input, idempotencyKey) {
      return post("/goals/update", {
        goalId: input.goalId,
        description: input.description,
        deadline: input.deadline,
        priority: input.priority,
        operationGroupId: input.operationGroupId,
      }, idempotencyKey);
    },
    createGoal(input, idempotencyKey) {
      return post("/goals", {
        clientId: input.clientId,
        text: input.text,
        description: input.description,
        deadline: input.deadline,
        priority: input.priority,
        operationGroupId: input.operationGroupId,
      }, idempotencyKey);
    },
    deleteGoal(input, idempotencyKey) {
      return post("/goals/delete", input, idempotencyKey);
    },
    setGoalLink(input, idempotencyKey) {
      return post("/goal-links/set", input, idempotencyKey);
    },
    deleteTask(input, idempotencyKey) {
      return post("/tasks/delete", input, idempotencyKey);
    },
    undoOperation(input, idempotencyKey) {
      return post("/operations/undo", input, idempotencyKey);
    },
  };
}

export function createCliAuthClient(env: CliEnv): CliAuthClient | null {
  const baseUrl = resolveCliHttpUrl(env);
  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl,
    async exchangeBootstrapToken(bootstrapToken) {
      const response = await callConvexApi({
        convexUrl: baseUrl,
        endpoint: "/automation/bootstrap/exchange",
        method: "POST",
        body: { bootstrapToken },
      });

      if (
        !response ||
        typeof response !== "object" ||
        !("credential" in response) ||
        !response.credential ||
        typeof response.credential !== "object"
      ) {
        throw new Error("Bootstrap exchange response is invalid");
      }

      const credential = response.credential as Partial<StoredCredential>;
      if (
        typeof credential.secret !== "string" ||
        typeof credential.label !== "string" ||
        !Array.isArray(credential.scopes) ||
        typeof credential.ownerTokenIdentifier !== "string"
      ) {
        throw new Error("Bootstrap exchange response is invalid");
      }

      return {
        secret: credential.secret,
        label: credential.label,
        scopes: credential.scopes.filter((scope): scope is string => typeof scope === "string"),
        ownerTokenIdentifier: credential.ownerTokenIdentifier,
        siteUrl: typeof credential.siteUrl === "string" ? credential.siteUrl : baseUrl,
        userId: typeof credential.userId === "string" ? credential.userId : undefined,
        email: typeof credential.email === "string" ? credential.email : undefined,
      };
    },
  };
}
