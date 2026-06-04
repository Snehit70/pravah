/// <reference types="node" />
import { callConvexApi } from "../lib/automationHttpClient";
import { loadStoredCredential, type StoredCredential } from "./authStore";

interface CliEnv {
  PRAVAH_HTTP_URL?: string;
  CONVEX_SITE_URL?: string;
  VITE_CONVEX_SITE_URL?: string;
  CONVEX_URL?: string;
  VITE_CONVEX_URL?: string;
  CONVEX_HTTP_API_KEY?: string;
}

export interface LiveCliClient {
  mode: "live";
  credentialLabel: string;
  scopes: string[];
  listTasks(filters: { status?: string; date?: string }): Promise<unknown>;
  getInbox(): Promise<unknown>;
  getTimeline(endDate: string): Promise<unknown>;
  getReviewQueue(status?: string, limit?: number): Promise<unknown>;
  getSyncStatus(provider?: string): Promise<unknown>;
  addTask(input: {
    title: string;
    scheduledDate?: string;
    description?: string;
  }, idempotencyKey: string): Promise<unknown>;
  moveTask(input: { taskId: string; targetDate: string }, idempotencyKey: string): Promise<unknown>;
  completeTask(input: { taskId: string }, idempotencyKey: string): Promise<unknown>;
  reopenTask(input: { taskId: string }, idempotencyKey: string): Promise<unknown>;
  unscheduleTask(input: { taskId: string }, idempotencyKey: string): Promise<unknown>;
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

export function resolveCliHttpUrl(env: CliEnv): string | undefined {
  return (
    normalizeHttpUrl(env.PRAVAH_HTTP_URL) ??
    normalizeHttpUrl(env.CONVEX_SITE_URL) ??
    normalizeHttpUrl(env.VITE_CONVEX_SITE_URL) ??
    deriveSiteUrl(env.CONVEX_URL) ??
    deriveSiteUrl(env.VITE_CONVEX_URL)
  );
}

export function createLiveClient(env: CliEnv): LiveCliClient | null {
  const storedCredential = loadStoredCredential();
  const baseUrl =
    normalizeHttpUrl(env.PRAVAH_HTTP_URL) ??
    storedCredential?.siteUrl ??
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
    body: Record<string, string | number | boolean | undefined>,
    idempotencyKey: string
  ) {
    const payload = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    ) as Record<string, string | number | boolean>;
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
      "review:write",
      "sync:read",
      "sync:run",
      "agent:read",
    ],
    listTasks(filters) {
      const query = new URLSearchParams();
      if (filters.status) query.set("status", filters.status);
      if (filters.date) query.set("date", filters.date);
      const qs = query.toString();
      return get(`/tasks${qs ? `?${qs}` : ""}`);
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
    addTask(input, idempotencyKey) {
      return post("/tasks", {
        title: input.title,
        description: input.description,
        scheduledDate: input.scheduledDate,
      }, idempotencyKey);
    },
    moveTask(input, idempotencyKey) {
      return post("/tasks/move", input, idempotencyKey);
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
