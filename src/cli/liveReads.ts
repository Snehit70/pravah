/// <reference types="node" />
import { callConvexApi } from "../lib/mcpBridgeUtils";

interface CliEnv {
  PRAVAH_HTTP_URL?: string;
  CONVEX_SITE_URL?: string;
  VITE_CONVEX_SITE_URL?: string;
  CONVEX_URL?: string;
  VITE_CONVEX_URL?: string;
  CONVEX_HTTP_API_KEY?: string;
}

export interface LiveReadClient {
  mode: "live";
  listTasks(filters: { status?: string; date?: string }): Promise<unknown>;
  getInbox(): Promise<unknown>;
  getTimeline(endDate: string): Promise<unknown>;
  getReviewQueue(status?: string, limit?: number): Promise<unknown>;
  getSyncStatus(provider?: string): Promise<unknown>;
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

export function createLiveReadClient(env: CliEnv): LiveReadClient | null {
  const baseUrl = resolveCliHttpUrl(env);
  const apiKey = env.CONVEX_HTTP_API_KEY;
  if (!baseUrl || !apiKey) {
    return null;
  }

  async function get(endpoint: string) {
    return callConvexApi({
      convexUrl: baseUrl,
      endpoint,
      method: "GET",
      apiKey,
    });
  }

  return {
    mode: "live",
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
  };
}
