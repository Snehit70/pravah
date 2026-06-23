import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { getAllowedWebOrigins } from "./origins";
import {
  automationBootstrapExchangeSchema,
  bulkRescheduleSchema,
  completeTaskSchema,
  createGoalSchema,
  createTaskSchema,
  deleteGoalSchema,
  deleteTaskSchema,
  gmailCandidateSchema,
  googleCalendarImportSchema,
  googleTokenExchangeSchema,
  moveTaskSchema,
  operationListSchema,
  operationUndoSchema,
  reorderTaskSchema,
  reopenTaskSchema,
  reviewApproveSchema,
  reviewQueueListSchema,
  reviewRejectSchema,
  syncStatusSchema,
  setGoalLinkSchema,
  taskListSchema,
  unscheduleTaskSchema,
  updateGoalSchema,
  updateTaskSchema,
} from "./httpContracts";
import {
  requireIdempotencyKey,
  requireLegacyAuth,
  requireReviewReadAuth,
  requireSyncReadAuth,
  requireTaskReadAuth,
  requireTaskWriteAuth,
} from "./automationHttpAuth";
import {
  jsonResponse,
  parseJsonBody,
  runWithBadRequest,
  validationError,
} from "./httpResponses";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

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

function makeGoalClientIdFromIdempotencyKey(idempotencyKey: string) {
  const normalized = idempotencyKey.trim().replace(/[^A-Za-z0-9_-]/g, "_");
  return `goal_${normalized.slice(0, 195)}`;
}

function makeGeneratedGoalClientId() {
  return `goal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// POST /automation/bootstrap/exchange - Exchange one-time bootstrap token for CLI credential
http.route({
  path: "/automation/bootstrap/exchange",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = automationBootstrapExchangeSchema.safeParse(body.data);
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const exchange = await runWithBadRequest(
      () =>
        ctx.runMutation(api.automation.exchangeBootstrapToken, {
          bootstrapToken: validation.data.bootstrapToken,
        }),
      "Failed to exchange bootstrap token"
    );
    if (exchange.response) return exchange.response;
    const url = new URL(request.url);
    return jsonResponse({
      credential: {
        ...exchange.data.credential,
        siteUrl: url.origin,
      },
    });
  }),
});

// GET /tasks - List all tasks
http.route({
  path: "/tasks",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;

    const url = new URL(request.url);
    const validation = taskListSchema.safeParse({
      date: url.searchParams.get("date") || undefined,
      status: url.searchParams.get("status") || undefined,
    });
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const tasks = await ctx.runQuery(internal.automationTools.listTasks, {
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
      ...validation.data,
    });
    
    return new Response(JSON.stringify(tasks), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /goals - List long-term goals for the authenticated owner
http.route({
  path: "/goals",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;

    const goals = await ctx.runQuery(internal.automationTools.listGoals, {
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
    });

    return jsonResponse(goals);
  }),
});

// GET /goal-links - List task-to-goal links for the authenticated owner
http.route({
  path: "/goal-links",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;

    const links = await ctx.runQuery(internal.automationTools.listGoalLinks, {
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
    });

    return jsonResponse(links);
  }),
});

// POST /goals/update - Update an existing goal's description, deadline, or priority
http.route({
  path: "/goals/update",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;

    const validation = updateGoalSchema.safeParse(body.data);
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const { goalId, description, deadline, priority } = validation.data;

    const result = await ctx.runMutation(internal.automationTools.updateGoal, {
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
      idempotencyKey: idempotency.key,
      goalClientId: goalId,
      description,
      deadline,
      priority,
      operationGroupId: validation.data.operationGroupId,
    });

    const goalUpdate = "result" in result ? result.result : result;
    const replayed = "replayed" in result ? result.replayed : false;

    if (!goalUpdate?.updated) {
      return jsonResponse({ error: "Goal not found", goalId }, 404);
    }

    return jsonResponse({ goalId, ...goalUpdate, replayed });
  }),
});

// POST /goals - Create a goal
http.route({
  path: "/goals",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = createGoalSchema.safeParse(body.data);
    if (!validation.success) return validationError(validation.error.issues);

    const data = validation.data;
    const clientId =
      data.clientId ??
      (idempotency.key
        ? makeGoalClientIdFromIdempotencyKey(idempotency.key)
        : makeGeneratedGoalClientId());
    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.createGoal, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          clientId,
          text: data.text,
          description: data.description,
          deadline: data.deadline,
          priority: data.priority,
          operationGroupId: data.operationGroupId,
        }),
      "Failed to create goal"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({ ...mutation.data.result, replayed: mutation.data.replayed });
  }),
});

// POST /goals/delete - Soft-delete a goal and unlink its tasks
http.route({
  path: "/goals/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = deleteGoalSchema.safeParse(body.data);
    if (!validation.success) return validationError(validation.error.issues);
    if (!validation.data.confirmGoalDelete) {
      return jsonResponse({ error: "confirmGoalDelete is required" }, 400);
    }

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.deleteGoal, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          goalClientId: validation.data.goalId,
          operationGroupId: validation.data.operationGroupId,
        }),
      "Failed to delete goal"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({ ...mutation.data.result, replayed: mutation.data.replayed });
  }),
});

// POST /goal-links/set - Link or unlink a task and goal
http.route({
  path: "/goal-links/set",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = setGoalLinkSchema.safeParse(body.data);
    if (!validation.success) return validationError(validation.error.issues);

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.setGoalLink, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          taskId: validation.data.taskId,
          goalClientId: validation.data.goalId,
          operationGroupId: validation.data.operationGroupId,
        }),
      "Failed to update goal link"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({ ...mutation.data.result, replayed: mutation.data.replayed });
  }),
});

// POST /tasks - Add a task
http.route({
  path: "/tasks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;

    // Validate request body
    const validation = createTaskSchema.safeParse(body.data);
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const data = validation.data;

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.addTask, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          title: data.title,
          description: data.description,
          deadline: data.deadline,
          time: data.time,
          source: data.source,
          estimatedMinutes: data.estimatedMinutes,
          tags: data.tags,
          priority: data.priority,
          operationGroupId: data.operationGroupId,
        }),
      "Failed to add task"
    );
    if (mutation.response) return mutation.response;

    return jsonResponse({
      ...mutation.data.result,
      replayed: mutation.data.replayed,
    });
  }),
});

// POST /tasks/move - Move task to different date
http.route({
  path: "/tasks/move",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = moveTaskSchema.safeParse(body.data);
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const { taskId, targetDate, position, operationGroupId } = validation.data;

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.moveTask, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          taskId,
          targetDate,
          position,
          operationGroupId,
        }),
      "Failed to move task"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({
      ...mutation.data.result,
      replayed: mutation.data.replayed,
    });
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
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = completeTaskSchema.safeParse(body.data);
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.completeTask, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          ...validation.data,
        }),
      "Failed to complete task"
    );
    if (mutation.response) return mutation.response;
    
    return jsonResponse({
      ...mutation.data.result,
      replayed: mutation.data.replayed,
    });
  }),
});

// POST /tasks/update - Update a task
http.route({
  path: "/tasks/update",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = updateTaskSchema.safeParse(body.data);
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.updateTask, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          ...validation.data,
        }),
      "Failed to update task"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({
      ...mutation.data.result,
      replayed: mutation.data.replayed,
    });
  }),
});

// POST /tasks/reopen - Reopen a completed task back to inbox
http.route({
  path: "/tasks/reopen",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = reopenTaskSchema.safeParse(body.data);
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.reopenTask, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          ...validation.data,
        }),
      "Failed to reopen task"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({
      ...mutation.data.result,
      replayed: mutation.data.replayed,
    });
  }),
});

// POST /tasks/unschedule - Move task into inbox
http.route({
  path: "/tasks/unschedule",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = unscheduleTaskSchema.safeParse(body.data);
    if (!validation.success) {
      return validationError(validation.error.issues);
    }

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.unscheduleTask, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          ...validation.data,
        }),
      "Failed to unschedule task"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({
      ...mutation.data.result,
      replayed: mutation.data.replayed,
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

// POST /tasks/delete - Soft-delete a task with operation-ledger undo
http.route({
  path: "/tasks/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = deleteTaskSchema.safeParse(body.data);
    if (!validation.success) return validationError(validation.error.issues);
    if (!validation.data.confirmTaskDelete) {
      return jsonResponse({ error: "confirmTaskDelete is required" }, 400);
    }

    const { taskId } = validation.data;

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationTools.deleteTask, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          taskId,
          operationGroupId: validation.data.operationGroupId,
        }),
      "Failed to delete task"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({ ...mutation.data.result, replayed: mutation.data.replayed });
  }),
});

// GET /operations - List recent operation ledger records
http.route({
  path: "/operations",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const url = new URL(request.url);
    const validation = operationListSchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
      operationGroupId: url.searchParams.get("operationGroupId") ?? undefined,
    });
    if (!validation.success) return validationError(validation.error.issues);
    const operations = await ctx.runQuery(internal.automationOperations.list, {
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
      limit: validation.data.limit,
      operationGroupId: validation.data.operationGroupId,
    });
    return jsonResponse(operations);
  }),
});

// GET /operations/get - Inspect one operation ledger record
http.route({
  path: "/operations/get",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const url = new URL(request.url);
    const operationId = url.searchParams.get("operationId");
    if (!operationId) return jsonResponse({ error: "operationId is required" }, 400);
    const operation = await ctx.runQuery(internal.automationOperations.get, {
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
      operationId,
    });
    if (!operation) return jsonResponse({ error: "Operation not found", operationId }, 404);
    return jsonResponse(operation);
  }),
});

// POST /operations/undo - Undo one operation or a grouped set of operations
http.route({
  path: "/operations/undo",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskWriteAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;
    const idempotency = requireIdempotencyKey(request, auth);
    if (idempotency.response) return idempotency.response;

    const body = await parseJsonBody(request);
    if (body.response) return body.response;
    const validation = operationUndoSchema.safeParse(body.data);
    if (!validation.success) return validationError(validation.error.issues);
    if (!validation.data.operationId && !validation.data.operationGroupId) {
      return jsonResponse({ error: "operationId or operationGroupId is required" }, 400);
    }
    if (validation.data.operationId && validation.data.operationGroupId) {
      return jsonResponse(
        { error: "Provide only one of operationId or operationGroupId" },
        400
      );
    }

    const mutation = await runWithBadRequest(
      () =>
        ctx.runMutation(internal.automationOperations.undo, {
          ownerTokenIdentifier: auth.ownerTokenIdentifier,
          idempotencyKey: idempotency.key,
          operationId: validation.data.operationId,
          operationGroupId: validation.data.operationGroupId,
        }),
      "Failed to undo operation"
    );
    if (mutation.response) return mutation.response;
    return jsonResponse({ ...mutation.data.result, replayed: mutation.data.replayed });
  }),
});

// GET /timeline - Get timeline for date range
http.route({
  path: "/timeline",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authCheck = await requireTaskReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;

    const url = new URL(request.url);
    const endDate = url.searchParams.get("endDate");

    if (!endDate) {
      return new Response(JSON.stringify({ error: "endDate is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const timeline = await ctx.runQuery(internal.automationTools.getTimeline, {
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
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
    const authCheck = await requireTaskReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;

    const tasks = await ctx.runQuery(internal.automationTools.listTasks, {
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
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
    const authCheck = await requireSyncReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;

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
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
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
    const authCheck = await requireReviewReadAuth(ctx, request);
    if (authCheck.response) return authCheck.response;
    const { auth } = authCheck;

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
      ownerTokenIdentifier: auth.ownerTokenIdentifier,
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
