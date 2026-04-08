import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { z } from "zod";

const http = httpRouter();

// Validation schemas
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(5000, "Description too long").optional(),
  type: z.enum(["open", "deadline"]).default("open"),
  scheduledDate: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  source: z.enum(["manual", "ai-agent", "gmail", "gcal"]).default("ai-agent"),
  estimatedMinutes: z.number().int().positive("Estimated minutes must be positive").optional(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
});

const updateTaskSchema = z.object({
  taskId: z
    .string()
    .min(1, "Task ID is required")
    .transform((value) => value as Id<"tasks">),
  title: z.string().min(1, "Title cannot be empty").max(500, "Title too long").optional(),
  description: z.string().max(5000, "Description too long").optional(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  estimatedMinutes: z.number().int().positive("Estimated minutes must be positive").optional(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
});

function requireAuth(request: Request): Response | null {
  const env = (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  const envKey = env?.CONVEX_HTTP_API_KEY;
  if (!envKey) {
    return new Response(JSON.stringify({ error: "Server configuration error: API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const key = request.headers.get("x-api-key");
  if (key !== envKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
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

const moveTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
  targetDate: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  position: z.number().int().min(0).optional(),
});

const reorderTaskSchema = z.object({
  date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  taskIds: z.array(z.string().min(1).transform((v) => v as Id<"tasks">)).min(1, "At least one task ID required"),
});

const completeTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
});

const deleteTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
});

const googleTokenExchangeSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  codeVerifier: z.string().min(1, "PKCE code verifier is required"),
  redirectUri: z.string().url("Invalid redirect URI"),
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

export default http;
