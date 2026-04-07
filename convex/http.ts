import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
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
  taskId: z.string().min(1, "Task ID is required"),
  title: z.string().min(1, "Title cannot be empty").max(500, "Title too long").optional(),
  description: z.string().max(5000, "Description too long").optional(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  estimatedMinutes: z.number().int().positive("Estimated minutes must be positive").optional(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
});

function requireAuth(request: Request): Response | null {
  const envKey = process.env.CONVEX_HTTP_API_KEY;
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
        details: validation.error.errors
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
    const { taskId, targetDate, position } = body;

    try {
      await ctx.runMutation(api.tasks.moveTask, {
        taskId,
        targetDate,
        position,
      });
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
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
    const { date, taskIds } = body;

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
    const { taskId } = body;

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
        details: validation.error.errors
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
    const { taskId } = body;

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

export default http;