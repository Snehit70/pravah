import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { getAllowedWebOrigins } from "./origins";
import {
  automationBootstrapExchangeSchema,
  bulkRescheduleSchema,
  completeTaskSchema,
  createTaskSchema,
  deleteTaskSchema,
  gmailCandidateSchema,
  googleCalendarImportSchema,
  googleTokenExchangeSchema,
  moveTaskSchema,
  reorderTaskSchema,
  reopenTaskSchema,
  requireApiKeyAuth,
  reviewApproveSchema,
  reviewQueueListSchema,
  reviewRejectSchema,
  syncStatusSchema,
  unscheduleTaskSchema,
  updateTaskSchema,
} from "./httpContracts";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

type AutomationScope =
  | "tasks:read"
  | "tasks:write"
  | "review:read"
  | "review:write"
  | "sync:read"
  | "sync:run"
  | "agent:read";

interface AuthorizedRequest {
  kind: "admin" | "automation";
  scopes: AutomationScope[];
  ownerTokenIdentifier: string;
  credentialLabel?: string;
}

type AuthRouteCtx = Pick<ActionCtx, "runMutation">;

function getEnv() {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}

function parseBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

function forbiddenResponse(missingScopes: AutomationScope[]) {
  return jsonResponse(
    {
      error: "Forbidden",
      missingScopes,
    },
    403
  );
}

function ownerFromAuth(auth: AuthorizedRequest | undefined) {
  if (!auth) {
    throw new Error("Authorized request context missing");
  }
  return auth.ownerTokenIdentifier;
}

async function requireAuth(
  ctx: AuthRouteCtx,
  request: Request,
  requiredScopes: AutomationScope[]
): Promise<{ response: Response | null; auth?: AuthorizedRequest }> {
  const bearerToken = parseBearerToken(request);
  if (bearerToken) {
    try {
      const authResult = await ctx.runMutation(api.automation.markCredentialUsed, {
        credentialSecret: bearerToken,
      });
      if (
        !authResult ||
        typeof authResult !== "object" ||
        !("scopes" in authResult) ||
        !Array.isArray(authResult.scopes) ||
        !("ownerTokenIdentifier" in authResult) ||
        typeof authResult.ownerTokenIdentifier !== "string"
      ) {
        return { response: jsonResponse({ error: "Unauthorized" }, 401) };
      }
      const scopes = authResult.scopes.filter(
        (scope): scope is AutomationScope => typeof scope === "string"
      );
      const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
      if (missingScopes.length > 0) {
        return { response: forbiddenResponse(missingScopes) };
      }

      return {
        response: null,
        auth: {
          kind: "automation",
          scopes,
          ownerTokenIdentifier: authResult.ownerTokenIdentifier,
          credentialLabel:
            "label" in authResult && typeof authResult.label === "string"
              ? authResult.label
              : undefined,
        },
      };
    } catch {
      return { response: jsonResponse({ error: "Unauthorized" }, 401) };
    }
  }

  const env = getEnv();
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    const authError = requireApiKeyAuth({
      request,
      envKey: env?.CONVEX_HTTP_API_KEY,
    });
    if (authError) {
      return { response: authError };
    }
    const ownerTokenIdentifier = env?.PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER;
    if (!ownerTokenIdentifier) {
      return {
        response: jsonResponse(
          {
            error:
              "Server configuration error: PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER is required for API key auth",
          },
          500
        ),
      };
    }
    return {
      response: null,
      auth: {
        kind: "admin",
        scopes: requiredScopes,
        ownerTokenIdentifier,
      },
    };
  }

  return { response: jsonResponse({ error: "Unauthorized" }, 401) };
}

async function requireTaskReadAuth(ctx: AuthRouteCtx, request: Request) {
  return requireAuth(ctx, request, ["tasks:read"]);
}

async function requireTaskWriteAuth(ctx: AuthRouteCtx, request: Request) {
  return requireAuth(ctx, request, ["tasks:write"]);
}

async function requireReviewReadAuth(ctx: AuthRouteCtx, request: Request) {
  return requireAuth(ctx, request, ["review:read"]);
}

async function requireSyncReadAuth(ctx: AuthRouteCtx, request: Request) {
  return requireAuth(ctx, request, ["sync:read"]);
}

function requireLegacyAuth(request: Request): Response | null {
  const env = (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  return requireApiKeyAuth({
    request,
    envKey: env?.CONVEX_HTTP_API_KEY,
  });
}

function getGoogleCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowed = getAllowedWebOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function googleJsonResponse(request: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getGoogleCorsHeaders(request),
    },
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// POST /automation/bootstrap/exchange - Exchange one-time bootstrap token for CLI credential
http.route({
  path: "/automation/bootstrap/exchange",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const validation = automationBootstrapExchangeSchema.safeParse(body);
    if (!validation.success) {
      return jsonResponse(
        {
          error: "Validation failed",
          details: validation.error.issues,
        },
        400
      );
    }

    try {
      const result = await ctx.runMutation(api.automation.exchangeBootstrapToken, {
        bootstrapToken: validation.data.bootstrapToken,
      });
      const url = new URL(request.url);
      return jsonResponse({
        credential: {
          ...result.credential,
          siteUrl: url.origin,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to exchange bootstrap token";
      return jsonResponse({ error: message }, 400);
    }
  }),
});

// GET /tasks - List all tasks
http.route({
  path: "/tasks",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireTaskReadAuth(ctx, request);
    if (response) return response;

    const url = new URL(request.url);
    const date = url.searchParams.get("date") || undefined;
    const rawStatus = url.searchParams.get("status") || undefined;
    const status =
      rawStatus === "inbox" ||
      rawStatus === "scheduled" ||
      rawStatus === "completed" ||
      rawStatus === "cancelled"
        ? rawStatus
        : undefined;

    const tasks = await ctx.runQuery(internal.automationTools.listTasks, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      date,
      status,
    });
    
    return new Response(JSON.stringify(tasks), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /tasks - Add a task
http.route({
  path: "/tasks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireTaskWriteAuth(ctx, request);
    if (response) return response;

    const body = await request.json();

    // Validate request body
    const validation = createTaskSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = validation.data;

    const taskId = await ctx.runMutation(internal.automationTools.addTask, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      title: data.title,
      description: data.description,
      type: data.type,
      scheduledDate: data.scheduledDate,
      deadline: data.deadline,
      source: data.source,
      estimatedMinutes: data.estimatedMinutes,
      tags: data.tags,
    });

    return new Response(JSON.stringify({ taskId }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /tasks/move - Move task to different date
http.route({
  path: "/tasks/move",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireTaskWriteAuth(ctx, request);
    if (response) return response;

    const body = await request.json();
    const validation = moveTaskSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { taskId, targetDate, position } = validation.data;

    try {
      await ctx.runMutation(internal.automationTools.moveTask, {
        ownerTokenIdentifier: ownerFromAuth(auth),
        taskId,
        targetDate,
        position,
      });
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to move task";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// POST /tasks/reorder - Reorder tasks within a day
http.route({
  path: "/tasks/reorder",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = requireLegacyAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const validation = reorderTaskSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { date, taskIds } = validation.data;

    await ctx.runMutation(api.tasks.reorderTasks, { date, taskIds });
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /tasks/complete - Complete a task
http.route({
  path: "/tasks/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireTaskWriteAuth(ctx, request);
    if (response) return response;

    const body = await request.json();
    const validation = completeTaskSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { taskId } = validation.data;

    await ctx.runMutation(internal.automationTools.completeTask, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      taskId,
    });
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /tasks/update - Update a task
http.route({
  path: "/tasks/update",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = requireLegacyAuth(request);
    if (authError) return authError;

    const body = await request.json();

    // Validate request body
    const validation = updateTaskSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { taskId, ...updates } = validation.data;

    await ctx.runMutation(api.tasks.updateTask, { taskId, ...updates });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /tasks/reopen - Reopen a completed task back to inbox
http.route({
  path: "/tasks/reopen",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireTaskWriteAuth(ctx, request);
    if (response) return response;

    const body = await request.json();
    const validation = reopenTaskSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ctx.runMutation(internal.automationTools.reopenTask, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      ...validation.data,
    });
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /tasks/unschedule - Move task into inbox
http.route({
  path: "/tasks/unschedule",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireTaskWriteAuth(ctx, request);
    if (response) return response;

    const body = await request.json();
    const validation = unscheduleTaskSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ctx.runMutation(internal.automationTools.unscheduleTask, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      ...validation.data,
    });
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /tasks/bulk-reschedule - Reschedule multiple tasks in one operation
http.route({
  path: "/tasks/bulk-reschedule",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = requireLegacyAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const validation = bulkRescheduleSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await ctx.runMutation(api.tasks.bulkReschedule, validation.data);
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /tasks/delete - Delete a task
http.route({
  path: "/tasks/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = requireLegacyAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const validation = deleteTaskSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { taskId } = validation.data;

    await ctx.runMutation(api.tasks.deleteTask, { taskId });
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /timeline - Get timeline for date range
http.route({
  path: "/timeline",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireTaskReadAuth(ctx, request);
    if (response) return response;

    const url = new URL(request.url);
    const endDate = url.searchParams.get("endDate");

    if (!endDate) {
      return new Response(JSON.stringify({ error: "endDate is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const timeline = await ctx.runQuery(internal.automationTools.getTimeline, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      endDate,
    });
    
    return new Response(JSON.stringify(timeline), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /inbox - Get inbox tasks
http.route({
  path: "/inbox",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireTaskReadAuth(ctx, request);
    if (response) return response;

    const tasks = await ctx.runQuery(internal.automationTools.listTasks, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      status: "inbox",
    });
    
    return new Response(JSON.stringify(tasks), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /google/token - Exchange authorization code for tokens (server-side)
http.route({
  path: "/google/token",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: getGoogleCorsHeaders(request),
    });
  }),
});

http.route({
  path: "/google/token",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const body = await request.json();
    const validation = googleTokenExchangeSchema.safeParse(body);
    if (!validation.success) {
      return googleJsonResponse(request, {
        error: "Validation failed",
        details: validation.error.issues
      }, 400);
    }

    const { code, codeVerifier, redirectUri } = validation.data;
    
    const env = (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env;
    const clientId = env?.GOOGLE_OAUTH_CLIENT_ID ?? env?.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = env?.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId) {
      return googleJsonResponse(request, {
        error:
          "Google OAuth not configured (set GOOGLE_OAUTH_CLIENT_ID on Convex deployment).",
      }, 500);
    }

    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    });

    if (clientSecret) {
      tokenParams.set("client_secret", clientSecret);
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return googleJsonResponse(request, { error: `Token exchange failed: ${errorText}` }, 400);
    }

    const tokenData = await response.json();
    return googleJsonResponse(request, tokenData);
  }),
});

// GET /sync/status - Get integration and sync status
http.route({
  path: "/sync/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireSyncReadAuth(ctx, request);
    if (response) return response;

    const url = new URL(request.url);
    const validation = syncStatusSchema.safeParse({
      provider: url.searchParams.get("provider") || undefined,
    });
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { provider } = validation.data;
    const status = await ctx.runQuery(internal.automationTools.getIntegrationStatus, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      provider,
    });
    return new Response(JSON.stringify(status), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /sync/google-calendar/import - Trigger one-way import into Pravah
http.route({
  path: "/sync/google-calendar/import",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = requireLegacyAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const validation = googleCalendarImportSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = validation.data;

    const result = await ctx.runAction(api.syncActions.importGoogleCalendarAction, {
      accessToken: data.accessToken,
      tokenExpiresAt: data.tokenExpiresAt,
      calendarId: data.calendarId,
      calendarIds: data.calendarIds,
      fullResync: data.fullResync,
      timeMin: data.timeMin,
      timeMax: data.timeMax,
    });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /review-queue - List review queue items
http.route({
  path: "/review-queue",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const { response, auth } = await requireReviewReadAuth(ctx, request);
    if (response) return response;

    const url = new URL(request.url);
    const validation = reviewQueueListSchema.safeParse({
      status: url.searchParams.get("status") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const queue = await ctx.runQuery(internal.automationTools.listReviewQueue, {
      ownerTokenIdentifier: ownerFromAuth(auth),
      ...validation.data,
    });
    return new Response(JSON.stringify(queue), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /review-queue/approve - Approve one review item into tasks
http.route({
  path: "/review-queue/approve",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = requireLegacyAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const validation = reviewApproveSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await ctx.runMutation(api.sync.approveReviewItem, validation.data);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /review-queue/reject - Reject one review item
http.route({
  path: "/review-queue/reject",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = requireLegacyAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const validation = reviewRejectSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ctx.runMutation(api.sync.rejectReviewItem, validation.data);
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /gmail/candidates - Enqueue Gmail-derived candidate for manual approval
http.route({
  path: "/gmail/candidates",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authError = requireLegacyAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const validation = gmailCandidateSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await ctx.runMutation(api.sync.enqueueGmailCandidate, validation.data);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
