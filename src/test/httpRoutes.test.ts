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
      listGoals: "automationTools.listGoals",
      listGoalLinks: "automationTools.listGoalLinks",
      updateGoal: "automationTools.updateGoal",
      addTask: "automationTools.addTask",
      moveTask: "automationTools.moveTask",
      updateTask: "automationTools.updateTask",
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
        scopes: ["tasks:read"],
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
        scopes: ["tasks:read"],
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
      scopes: ["tasks:read"],
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

  it("accepts bearer automation credential for goal reads", async () => {
    const handler = getHandler("/goals", "GET");
    const ctx = createCtx();
    ctx.runMutation.mockResolvedValue({
      label: "Laptop",
      ownerTokenIdentifier: "user-1",
      scopes: ["tasks:read"],
    });
    ctx.runQuery.mockResolvedValue([{ id: "goal_1", text: "Planning" }]);

    const response = await handler(
      ctx,
      new Request("https://example.com/goals", {
        headers: { authorization: "Bearer pravah_cred_demo" },
      })
    );

    expect(ctx.runMutation).toHaveBeenCalledWith(api.automation.markCredentialUsed, {
      credentialSecret: "pravah_cred_demo",
    });
    expect(ctx.runQuery).toHaveBeenCalledWith(internal.automationTools.listGoals, {
      ownerTokenIdentifier: "user-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: "goal_1", text: "Planning" }]);
  });

  it("accepts bearer automation credential for goal link reads", async () => {
    const handler = getHandler("/goal-links", "GET");
    const ctx = createCtx();
    ctx.runMutation.mockResolvedValue({
      label: "Laptop",
      ownerTokenIdentifier: "user-1",
      scopes: ["tasks:read"],
    });
    ctx.runQuery.mockResolvedValue({ task_1: "goal_1" });

    const response = await handler(
      ctx,
      new Request("https://example.com/goal-links", {
        headers: { authorization: "Bearer pravah_cred_demo" },
      })
    );

    expect(ctx.runQuery).toHaveBeenCalledWith(internal.automationTools.listGoalLinks, {
      ownerTokenIdentifier: "user-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ task_1: "goal_1" });
  });

  it("passes nullable goal clears through goal updates", async () => {
    const handler = getHandler("/goals/update", "POST");
    const ctx = createCtx();
    ctx.runMutation
      .mockResolvedValueOnce({
        label: "Laptop",
        ownerTokenIdentifier: "user-1",
        scopes: ["tasks:write"],
      })
      .mockResolvedValueOnce({ updated: true });

    const response = await handler(
      ctx,
      new Request("https://example.com/goals/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer pravah_cred_demo",
          "Idempotency-Key": "goal-update-123",
        },
        body: JSON.stringify({
          goalId: "goal_1",
          description: null,
          deadline: null,
          priority: null,
        }),
      })
    );

    expect(ctx.runMutation).toHaveBeenNthCalledWith(
      2,
      internal.automationTools.updateGoal,
      {
        ownerTokenIdentifier: "user-1",
        idempotencyKey: "goal-update-123",
        goalClientId: "goal_1",
        description: null,
        deadline: null,
        priority: null,
        operationGroupId: undefined,
      }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      updated: true,
      goalId: "goal_1",
      replayed: false,
    });
  });

  it("rejects ambiguous undo requests that provide both operation targets", async () => {
    const handler = getHandler("/operations/undo", "POST");
    const ctx = createCtx();
    ctx.runMutation.mockResolvedValueOnce({
      label: "Laptop",
      ownerTokenIdentifier: "user-1",
      scopes: ["tasks:write"],
    });

    const response = await handler(
      ctx,
      new Request("https://example.com/operations/undo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer pravah_cred_demo",
          "Idempotency-Key": "undo-123",
        },
        body: JSON.stringify({
          operationId: "op_1",
          operationGroupId: "group_1",
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      error: "Provide only one of operationId or operationGroupId",
    });
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

  it("rejects invalid GET /tasks filters instead of returning all tasks", async () => {
    const handler = getHandler("/tasks", "GET");
    const ctx = createCtx();

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks?status=typo", {
        headers: { "x-api-key": "secret" },
      })
    );

    expect(response.status).toBe(400);
    expect(ctx.runQuery).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: "Validation failed",
    });
  });

  it("rejects malformed JSON for CLI-supported task writes", async () => {
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
        body: "{broken",
      })
    );

    expect(response.status).toBe(400);
    expect(ctx.runMutation).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON",
    });
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
          deadline: "2026-04-09",
        }),
      })
    );

    expect(ctx.runMutation).toHaveBeenCalledWith(internal.automationTools.addTask, {
      ownerTokenIdentifier: "admin-owner",
      idempotencyKey: undefined,
      title: "Ship tests",
      description: undefined,
      deadline: "2026-04-09",
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

  it("accepts bearer automation credential for bounded task updates", async () => {
    const handler = getHandler("/tasks/update", "POST");
    const ctx = createCtx();
    ctx.runMutation
      .mockResolvedValueOnce({
        label: "Laptop",
        ownerTokenIdentifier: "user-1",
        scopes: ["tasks:write"],
      })
      .mockResolvedValueOnce({
        result: { success: true },
        replayed: false,
      });

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer pravah_cred_demo",
          "Idempotency-Key": "task-update-123",
        },
        body: JSON.stringify({
          taskId: "task_abc",
          description: null,
          priority: "p1",
        }),
      })
    );

    expect(ctx.runMutation).toHaveBeenNthCalledWith(1, api.automation.markCredentialUsed, {
      credentialSecret: "pravah_cred_demo",
    });
    expect(ctx.runMutation).toHaveBeenNthCalledWith(2, internal.automationTools.updateTask, {
      ownerTokenIdentifier: "user-1",
      idempotencyKey: "task-update-123",
      taskId: "task_abc",
      description: null,
      priority: "p1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      replayed: false,
    });
  });

  it.each([
    ["/tasks", { title: "Rejected task" }],
    ["/tasks/complete", { taskId: "task_abc" }],
    ["/tasks/reopen", { taskId: "task_abc" }],
    ["/tasks/unschedule", { taskId: "task_abc" }],
  ])("returns a 400 domain error when POST %s fails", async (path, body) => {
    const handler = getHandler(path, "POST");
    const ctx = createCtx();
    ctx.runMutation.mockRejectedValue(new Error("Domain rejected request"));

    const response = await handler(
      ctx,
      new Request(`https://example.com${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "secret",
        },
        body: JSON.stringify(body),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Domain rejected request",
    });
  });

  it("returns a 400 domain error when POST /tasks/update fails", async () => {
    const handler = getHandler("/tasks/update", "POST");
    const ctx = createCtx();
    ctx.runMutation
      .mockResolvedValueOnce({
        label: "Laptop",
        ownerTokenIdentifier: "user-1",
        scopes: ["tasks:write"],
      })
      .mockRejectedValueOnce(new Error("Domain rejected request"));

    const response = await handler(
      ctx,
      new Request("https://example.com/tasks/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer pravah_cred_demo",
          "Idempotency-Key": "domain-error-123",
        },
        body: JSON.stringify({
          taskId: "task_abc",
          description: "Updated",
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Domain rejected request",
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
