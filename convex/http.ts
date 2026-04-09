import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import {
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

function requireAuth(request: Request): Response | null {
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

// GET /tasks - List all tasks
http.route({
  path: "/tasks",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authError = requireAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const date = url.searchParams.get("date") || undefined;
    const status = url.searchParams.get("status") || undefined;

    const tasks = await ctx.runQuery(api.tasks.listTasks, { date, status });
    
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
    const authError = requireAuth(request);
    if (authError) return authError;

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

    const taskId = await ctx.runMutation(api.tasks.addTask, {
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
    const authError = requireAuth(request);
    if (authError) return authError;

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
      await ctx.runMutation(api.tasks.moveTask, {
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
    const authError = requireAuth(request);
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
    const authError = requireAuth(request);
    if (authError) return authError;

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

    await ctx.runMutation(api.tasks.completeTask, { taskId });
    
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
    const authError = requireAuth(request);
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
    const authError = requireAuth(request);
    if (authError) return authError;

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

    await ctx.runMutation(api.tasks.reopenTask, validation.data);
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
    const authError = requireAuth(request);
    if (authError) return authError;

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

    await ctx.runMutation(api.tasks.unscheduleTask, validation.data);
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
    const authError = requireAuth(request);
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
    const authError = requireAuth(request);
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
    const authError = requireAuth(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const timeline = await ctx.runQuery(api.tasks.getTimeline, { startDate, endDate });
    
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
    const authError = requireAuth(request);
    if (authError) return authError;

    const tasks = await ctx.runQuery(api.tasks.listTasks, { status: "inbox" });
    
    return new Response(JSON.stringify(tasks), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// POST /google/token - Exchange authorization code for tokens (server-side)
http.route({
  path: "/google/token",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const body = await request.json();
    const validation = googleTokenExchangeSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({
        error: "Validation failed",
        details: validation.error.issues
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { code, codeVerifier, redirectUri } = validation.data;
    
    const env = (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env;
    const clientId = env?.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = env?.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId) {
      return new Response(JSON.stringify({ error: "Google OAuth not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: `Token exchange failed: ${errorText}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenData = await response.json();
    return new Response(JSON.stringify(tokenData), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// GET /sync/status - Get integration and sync status
http.route({
  path: "/sync/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authError = requireAuth(request);
    if (authError) return authError;

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
    const status = await ctx.runQuery(api.sync.getIntegrationStatus, { provider });
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
    const authError = requireAuth(request);
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
    const authError = requireAuth(request);
    if (authError) return authError;

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

    const queue = await ctx.runQuery(api.sync.listReviewQueue, validation.data);
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
    const authError = requireAuth(request);
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
    const authError = requireAuth(request);
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
    const authError = requireAuth(request);
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
