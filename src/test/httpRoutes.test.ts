import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

interface MockCtx {
  runQuery: ReturnType<typeof vi.fn>;
  runMutation: ReturnType<typeof vi.fn>;
  runAction: ReturnType<typeof vi.fn>;
}

interface RouteDef {
  path: string;
  method: string;
  handler: (ctx: MockCtx, request: Request) => Promise<Response>;
}

const routeRegistry = vi.hoisted(() => [] as RouteDef[]);

vi.mock("convex/server", () => ({
  httpRouter: () => ({
    route: (def: RouteDef) => {
      routeRegistry.push(def);
    },
  }),
}));

vi.mock("../../convex/_generated/server", () => ({
  httpAction: (
    handler: (ctx: MockCtx, request: Request) => Promise<Response>
  ) => handler,
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    tasks: {
      listTasks: "tasks.listTasks",
      addTask: "tasks.addTask",
      moveTask: "tasks.moveTask",
    },
    sync: {
      getIntegrationStatus: "sync.getIntegrationStatus",
    },
  },
}));

import "../../convex/http";
import { api } from "../../convex/_generated/api";

const env = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;
const originalApiKey = env?.CONVEX_HTTP_API_KEY;
const originalGoogleClientId = env?.VITE_GOOGLE_CLIENT_ID;

function getHandler(path: string, method: string) {
  const route = routeRegistry.find((entry) => entry.path === path && entry.method === method);
  if (!route) {
    throw new Error(`Missing route for ${method} ${path}`);
  }
  return route.handler;
}

function createCtx(): MockCtx {
  return {
    runQuery: vi.fn(),
    runMutation: vi.fn(),
    runAction: vi.fn(),
  };
}

beforeAll(() => {
  if (env) {
    env.CONVEX_HTTP_API_KEY = "secret";
  }
});

beforeEach(() => {
  vi.restoreAllMocks();
  if (env) {
    env.CONVEX_HTTP_API_KEY = "secret";
    env.VITE_GOOGLE_CLIENT_ID = "client-id";
  }
});

afterAll(() => {
  if (env) {
    env.CONVEX_HTTP_API_KEY = originalApiKey;
    env.VITE_GOOGLE_CLIENT_ID = originalGoogleClientId;
  }
});

describe("http route handlers", () => {
  it("returns 401 for protected routes without x-api-key", async () => {
    const handler = getHandler("/tasks", "GET");
    const ctx = createCtx();

    const response = await handler(ctx, new Request("https://example.com/tasks"));

    expect(response.status).toBe(401);
    expect(ctx.runQuery).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("handles GET /tasks with query params and auth", async () => {
    const handler = getHandler("/tasks", "GET");
    const ctx = createCtx();
    ctx.runQuery.mockResolvedValue([{ _id: "task1", title: "A" }]);

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks?date=2026-04-09&status=open", {
        headers: { "x-api-key": "secret" },
      })
    );

    expect(ctx.runQuery).toHaveBeenCalledWith(api.tasks.listTasks, {
      date: "2026-04-09",
      status: "open",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ _id: "task1", title: "A" }]);
  });

  it("rejects invalid payload for POST /tasks", async () => {
    const handler = getHandler("/tasks", "POST");
    const ctx = createCtx();

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "secret",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    expect(ctx.runMutation).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.error).toBe("Validation failed");
  });

  it("applies defaults and calls addTask for valid POST /tasks", async () => {
    const handler = getHandler("/tasks", "POST");
    const ctx = createCtx();
    ctx.runMutation.mockResolvedValue("task_123");

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "secret",
        },
        body: JSON.stringify({
          title: "Ship tests",
          scheduledDate: "2026-04-09",
        }),
      })
    );

    expect(ctx.runMutation).toHaveBeenCalledWith(api.tasks.addTask, {
      title: "Ship tests",
      description: undefined,
      type: "open",
      scheduledDate: "2026-04-09",
      deadline: undefined,
      source: "ai-agent",
      estimatedMinutes: undefined,
      tags: undefined,
    });
    await expect(response.json()).resolves.toEqual({ taskId: "task_123" });
  });

  it("returns mutation error when POST /tasks/move fails", async () => {
    const handler = getHandler("/tasks/move", "POST");
    const ctx = createCtx();
    ctx.runMutation.mockRejectedValue(new Error("Cannot move task across locked date"));

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "secret",
        },
        body: JSON.stringify({
          taskId: "task_abc",
          targetDate: "2026-04-10",
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot move task across locked date",
    });
  });

  it("does not require API key for POST /google/token", async () => {
    if (env) {
      env.VITE_GOOGLE_CLIENT_ID = "";
    }
    const handler = getHandler("/google/token", "POST");
    const ctx = createCtx();

    const response = await handler(
      ctx,
      new Request("https://example.com/google/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "auth-code",
          codeVerifier: "verifier",
          redirectUri: "https://app.example.com/auth/callback",
        }),
      })
    );

    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error:
        "Google OAuth not configured (set GOOGLE_OAUTH_CLIENT_ID on Convex deployment).",
    });
  });
});
