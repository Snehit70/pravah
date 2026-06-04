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
  query: <T>(definition: T) => definition,
  httpAction: (
    handler: (ctx: MockCtx, request: Request) => Promise<Response>
  ) => handler,
}));

vi.mock("../../convex/_generated/api", () => ({
  components: {
    betterAuth: "betterAuth",
  },
  internal: {
    automationTools: {
      listTasks: "automationTools.listTasks",
      addTask: "automationTools.addTask",
      moveTask: "automationTools.moveTask",
      completeTask: "automationTools.completeTask",
      reopenTask: "automationTools.reopenTask",
      unscheduleTask: "automationTools.unscheduleTask",
      getTimeline: "automationTools.getTimeline",
      getIntegrationStatus: "automationTools.getIntegrationStatus",
      listReviewQueue: "automationTools.listReviewQueue",
    },
  },
  api: {
    automation: {
      exchangeBootstrapToken: "automation.exchangeBootstrapToken",
      markCredentialUsed: "automation.markCredentialUsed",
    },
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

vi.mock("../../convex/auth", () => ({
  authComponent: {
    registerRoutes: () => undefined,
  },
  createAuth: () => ({}),
}));

import "../../convex/http";
import { api, internal } from "../../convex/_generated/api";

const env = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;
const originalApiKey = env?.CONVEX_HTTP_API_KEY;
const originalHttpOwner = env?.PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER;
const originalGoogleClientId = env?.GOOGLE_OAUTH_CLIENT_ID;

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
    env.PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER = "admin-owner";
    env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
  }
});

beforeEach(() => {
  vi.restoreAllMocks();
  if (env) {
    env.CONVEX_HTTP_API_KEY = "secret";
    env.PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER = "admin-owner";
    env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
  }
});

afterAll(() => {
  if (env) {
    env.CONVEX_HTTP_API_KEY = originalApiKey;
    env.PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER = originalHttpOwner;
    env.GOOGLE_OAUTH_CLIENT_ID = originalGoogleClientId;
  }
});

describe("http route handlers", () => {
  it("exchanges bootstrap token without requiring API key", async () => {
    const handler = getHandler("/automation/bootstrap/exchange", "POST");
    const ctx = createCtx();
    ctx.runMutation.mockResolvedValue({
      credential: {
        secret: "pravah_cred_demo",
        label: "Laptop",
        scopes: ["tasks:read", "agent:read"],
        ownerTokenIdentifier: "user-1",
      },
    });

    const response = await handler(
      ctx,
      new Request("https://example.com/automation/bootstrap/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken: "pravah_bootstrap_demo",
        }),
      })
    );

    expect(ctx.runMutation).toHaveBeenCalledWith(api.automation.exchangeBootstrapToken, {
      bootstrapToken: "pravah_bootstrap_demo",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      credential: {
        secret: "pravah_cred_demo",
        label: "Laptop",
        scopes: ["tasks:read", "agent:read"],
        ownerTokenIdentifier: "user-1",
        siteUrl: "https://example.com",
      },
    });
  });

  it("returns 401 for protected routes without x-api-key", async () => {
    const handler = getHandler("/tasks", "GET");
    const ctx = createCtx();

    const response = await handler(ctx, new Request("https://example.com/tasks"));

    expect(response.status).toBe(401);
    expect(ctx.runQuery).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("accepts bearer automation credential for task reads", async () => {
    const handler = getHandler("/tasks", "GET");
    const ctx = createCtx();
    ctx.runMutation.mockResolvedValue({
      label: "Laptop",
      ownerTokenIdentifier: "user-1",
      scopes: ["tasks:read", "agent:read"],
    });
    ctx.runQuery.mockResolvedValue([{ _id: "task1", title: "A" }]);

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks?status=scheduled", {
        headers: { authorization: "Bearer pravah_cred_demo" },
      })
    );

    expect(ctx.runMutation).toHaveBeenCalledWith(api.automation.markCredentialUsed, {
      credentialSecret: "pravah_cred_demo",
    });
    expect(ctx.runQuery).toHaveBeenCalledWith(internal.automationTools.listTasks, {
      ownerTokenIdentifier: "user-1",
      date: undefined,
      status: "scheduled",
    });
    expect(response.status).toBe(200);
  });

  it("rejects bearer credential missing required write scope", async () => {
    const handler = getHandler("/tasks/complete", "POST");
    const ctx = createCtx();
    ctx.runMutation.mockResolvedValueOnce({
      label: "Laptop",
      ownerTokenIdentifier: "user-1",
      scopes: ["tasks:read"],
    });

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer pravah_cred_demo",
        },
        body: JSON.stringify({
          taskId: "task_abc",
        }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Forbidden",
      missingScopes: ["tasks:write"],
    });
  });

  it("requires an idempotency key for bearer task writes", async () => {
    const handler = getHandler("/tasks/complete", "POST");
    const ctx = createCtx();
    ctx.runMutation.mockResolvedValueOnce({
      label: "Laptop",
      ownerTokenIdentifier: "user-1",
      scopes: ["tasks:write"],
    });

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer pravah_cred_demo",
        },
        body: JSON.stringify({ taskId: "task_abc" }),
      })
    );

    expect(response.status).toBe(400);
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      error: "Idempotency-Key header must be between 1 and 200 characters",
    });
  });

  it("passes a bearer idempotency key to task writes", async () => {
    const handler = getHandler("/tasks/complete", "POST");
    const ctx = createCtx();
    ctx.runMutation
      .mockResolvedValueOnce({
        label: "Laptop",
        ownerTokenIdentifier: "user-1",
        scopes: ["tasks:write"],
      })
      .mockResolvedValueOnce({ result: { success: true }, replayed: false });

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer pravah_cred_demo",
          "Idempotency-Key": "complete-123",
        },
        body: JSON.stringify({ taskId: "task_abc" }),
      })
    );

    expect(ctx.runMutation).toHaveBeenNthCalledWith(
      2,
      internal.automationTools.completeTask,
      {
        ownerTokenIdentifier: "user-1",
        idempotencyKey: "complete-123",
        taskId: "task_abc",
      }
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      replayed: false,
    });
  });

  it("handles GET /tasks with query params and auth", async () => {
    const handler = getHandler("/tasks", "GET");
    const ctx = createCtx();
    ctx.runQuery.mockResolvedValue([{ _id: "task1", title: "A" }]);

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks?date=2026-04-09&status=scheduled", {
        headers: { "x-api-key": "secret" },
      })
    );

    expect(ctx.runQuery).toHaveBeenCalledWith(internal.automationTools.listTasks, {
      ownerTokenIdentifier: "admin-owner",
      date: "2026-04-09",
      status: "scheduled",
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
    ctx.runMutation.mockResolvedValue({ result: "task_123", replayed: false });

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

    expect(ctx.runMutation).toHaveBeenCalledWith(internal.automationTools.addTask, {
      ownerTokenIdentifier: "admin-owner",
      idempotencyKey: undefined,
      title: "Ship tests",
      description: undefined,
      type: "open",
      scheduledDate: "2026-04-09",
      deadline: undefined,
      source: "ai-agent",
      estimatedMinutes: undefined,
      tags: undefined,
      priority: undefined,
    });
    await expect(response.json()).resolves.toEqual({
      taskId: "task_123",
      replayed: false,
    });
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
      env.GOOGLE_OAUTH_CLIENT_ID = "";
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

  describe("/google/token CORS", () => {
    const originalSiteUrl = env?.SITE_URL;
    const originalAllowed = env?.ALLOWED_CORS_ORIGINS;

    afterAll(() => {
      if (env) {
        env.SITE_URL = originalSiteUrl;
        env.ALLOWED_CORS_ORIGINS = originalAllowed;
      }
    });

    beforeEach(() => {
      if (env) {
        env.SITE_URL = "https://app.example.com";
        delete env.ALLOWED_CORS_ORIGINS;
      }
    });

    it("echoes allow-origin only for SITE_URL origin on preflight", async () => {
      const handler = getHandler("/google/token", "OPTIONS");
      const ctx = createCtx();
      const response = await handler(
        ctx,
        new Request("https://example.com/google/token", {
          method: "OPTIONS",
          headers: { origin: "https://app.example.com" },
        })
      );
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://app.example.com"
      );
    });

    it("omits allow-origin for disallowed origins", async () => {
      const handler = getHandler("/google/token", "OPTIONS");
      const ctx = createCtx();
      const response = await handler(
        ctx,
        new Request("https://example.com/google/token", {
          method: "OPTIONS",
          headers: { origin: "https://evil.example.com" },
        })
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("honours ALLOWED_CORS_ORIGINS extras", async () => {
      if (env) {
        env.ALLOWED_CORS_ORIGINS = "https://staging.example.com";
      }
      const handler = getHandler("/google/token", "OPTIONS");
      const ctx = createCtx();
      const response = await handler(
        ctx,
        new Request("https://example.com/google/token", {
          method: "OPTIONS",
          headers: { origin: "https://staging.example.com" },
        })
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://staging.example.com"
      );
    });
  });
});
