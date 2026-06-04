import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  callConvexApi,
  readStringArg,
  toToolArguments,
  type ToolArguments,
} from "./src/lib/automationHttpClient";

const env = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

const CONVEX_URL = env?.CONVEX_URL;
const CONVEX_HTTP_API_KEY = env?.CONVEX_HTTP_API_KEY;

async function callConvexAPI(endpoint: string, method: string, body?: ToolArguments) {
  return callConvexApi({
    convexUrl: CONVEX_URL,
    apiKey: CONVEX_HTTP_API_KEY,
    endpoint,
    method,
    body,
  });
}

const server = new Server(
  {
    name: "pravah-tasks",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_tasks",
        description: "List all tasks, optionally filtered by date or status",
        inputSchema: {
          type: "object",
          properties: {
            date: { type: "string", description: "Filter by date (YYYY-MM-DD)" },
            status: { type: "string", description: "Filter by status (inbox, scheduled, completed)" },
          },
        },
      },
      {
        name: "add_task",
        description: "Add a new task to Pravah",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Task title" },
            description: { type: "string", description: "Task description" },
            type: { type: "string", enum: ["open", "deadline"], description: "Task type" },
            scheduledDate: { type: "string", description: "Date to schedule (YYYY-MM-DD)" },
            deadline: { type: "string", description: "Deadline date (YYYY-MM-DD)" },
            estimatedMinutes: { type: "number", description: "Estimated duration in minutes" },
            tags: { type: "array", items: { type: "string" }, description: "Task tags" },
          },
          required: ["title"],
        },
      },
      {
        name: "move_task",
        description: "Move a task to a different date",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID" },
            targetDate: { type: "string", description: "Target date (YYYY-MM-DD)" },
          },
          required: ["taskId", "targetDate"],
        },
      },
      {
        name: "reorder_tasks",
        description: "Reorder tasks within a day",
        inputSchema: {
          type: "object",
          properties: {
            date: { type: "string", description: "The date the tasks belong to (YYYY-MM-DD)" },
            taskIds: { type: "array", items: { type: "string" }, description: "Array of task IDs in new order" },
          },
          required: ["date", "taskIds"],
        },
      },
      {
        name: "complete_task",
        description: "Mark a task as completed",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "reopen_task",
        description: "Reopen a completed task back into inbox",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "unschedule_task",
        description: "Move a scheduled task back to inbox",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "bulk_reschedule",
        description: "Reschedule multiple tasks to one date",
        inputSchema: {
          type: "object",
          properties: {
            taskIds: { type: "array", items: { type: "string" } },
            targetDate: { type: "string", description: "Target date YYYY-MM-DD" },
          },
          required: ["taskIds", "targetDate"],
        },
      },
      {
        name: "update_task",
        description: "Update a task's details",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID" },
            title: { type: "string", description: "New title" },
            description: { type: "string", description: "New description" },
            deadline: { type: "string", description: "New deadline" },
            estimatedMinutes: { type: "number", description: "New estimated duration" },
            tags: { type: "array", items: { type: "string" }, description: "New tags" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "delete_task",
        description: "Delete a task",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "get_timeline",
        description: "Get timeline for a date range",
        inputSchema: {
          type: "object",
          properties: {
            startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
            endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "get_inbox",
        description: "Get all inbox tasks",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_sync_status",
        description: "Get sync status, last run, and integration health",
        inputSchema: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["google_calendar", "gmail"],
              description: "Integration provider",
            },
          },
        },
      },
      {
        name: "import_google_calendar",
        description: "Run one-way Google Calendar import into Pravah",
        inputSchema: {
          type: "object",
          properties: {
            accessToken: { type: "string", description: "Google OAuth access token" },
            tokenExpiresAt: { type: "number", description: "Token expiry timestamp in ms" },
            calendarId: { type: "string", description: "Calendar ID (default: primary)" },
            timeMin: { type: "string", description: "Optional lower bound ISO datetime" },
            timeMax: { type: "string", description: "Optional upper bound ISO datetime" },
          },
          required: ["accessToken"],
        },
      },
      {
        name: "list_review_queue",
        description: "List review queue items for manual approval",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "approved", "rejected"] },
            limit: { type: "number", description: "Max number of items" },
          },
        },
      },
      {
        name: "approve_review_item",
        description: "Approve a review queue item and create a real task",
        inputSchema: {
          type: "object",
          properties: {
            reviewId: { type: "string", description: "Review queue item ID" },
            scheduledDate: { type: "string", description: "Optional target date YYYY-MM-DD" },
          },
          required: ["reviewId"],
        },
      },
      {
        name: "reject_review_item",
        description: "Reject a review queue item",
        inputSchema: {
          type: "object",
          properties: {
            reviewId: { type: "string", description: "Review queue item ID" },
            reason: { type: "string", description: "Optional rejection reason" },
          },
          required: ["reviewId"],
        },
      },
      {
        name: "enqueue_gmail_candidate",
        description: "Add a Gmail-derived candidate task into manual review queue",
        inputSchema: {
          type: "object",
          properties: {
            externalId: { type: "string", description: "Source message ID" },
            title: { type: "string", description: "Candidate task title" },
            description: { type: "string", description: "Candidate task description" },
            deadline: { type: "string", description: "Optional deadline YYYY-MM-DD" },
            estimatedMinutes: { type: "number", description: "Optional effort estimate" },
            tags: { type: "array", items: { type: "string" } },
            payloadJson: { type: "string", description: "Optional source payload snapshot" },
          },
          required: ["externalId", "title"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = toToolArguments(request.params.arguments);

  try {
    switch (name) {
      case "list_tasks": {
        const status = readStringArg(args, "status");
        const date = readStringArg(args, "date");
        const query = new URLSearchParams();
        if (status) query.set("status", status);
        if (date) query.set("date", date);
        const qs = query.toString();
        const tasks = await callConvexAPI(`/tasks${qs ? `?${qs}` : ""}`, "GET");
        return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
      }
      case "add_task": {
        const newTask = await callConvexAPI("/tasks", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(newTask, null, 2) }] };
      }
      case "move_task": {
        const moved = await callConvexAPI("/tasks/move", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(moved, null, 2) }] };
      }
      case "reorder_tasks": {
        const reordered = await callConvexAPI("/tasks/reorder", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(reordered, null, 2) }] };
      }
      case "complete_task": {
        const taskId = readStringArg(args, "taskId");
        const completed = await callConvexAPI("/tasks/complete", "POST", taskId ? { taskId } : {});
        return { content: [{ type: "text", text: JSON.stringify(completed, null, 2) }] };
      }
      case "reopen_task": {
        const reopened = await callConvexAPI("/tasks/reopen", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(reopened, null, 2) }] };
      }
      case "unschedule_task": {
        const unscheduled = await callConvexAPI("/tasks/unschedule", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(unscheduled, null, 2) }] };
      }
      case "bulk_reschedule": {
        const moved = await callConvexAPI("/tasks/bulk-reschedule", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(moved, null, 2) }] };
      }
      case "update_task": {
        const updated = await callConvexAPI("/tasks/update", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
      }
      case "delete_task": {
        const taskId = readStringArg(args, "taskId");
        const deleted = await callConvexAPI("/tasks/delete", "POST", taskId ? { taskId } : {});
        return { content: [{ type: "text", text: JSON.stringify(deleted, null, 2) }] };
      }
      case "get_timeline": {
        const startDate = readStringArg(args, "startDate") ?? "";
        const endDate = readStringArg(args, "endDate") ?? "";
        const query = new URLSearchParams({ startDate, endDate });
        const timeline = await callConvexAPI(`/timeline?${query.toString()}`, "GET");
        return { content: [{ type: "text", text: JSON.stringify(timeline, null, 2) }] };
      }
      case "get_inbox": {
        const inbox = await callConvexAPI("/inbox", "GET");
        return { content: [{ type: "text", text: JSON.stringify(inbox, null, 2) }] };
      }
      case "get_sync_status": {
        const provider = readStringArg(args, "provider") ?? "google_calendar";
        const query = new URLSearchParams({ provider });
        const status = await callConvexAPI(`/sync/status?${query.toString()}`, "GET");
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
      }
      case "import_google_calendar": {
        const imported = await callConvexAPI("/sync/google-calendar/import", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(imported, null, 2) }] };
      }
      case "list_review_queue": {
        const status = readStringArg(args, "status");
        const limit = typeof args.limit === "number" ? args.limit : undefined;
        const query = new URLSearchParams();
        if (status) query.set("status", status);
        if (limit !== undefined) query.set("limit", String(limit));
        const qs = query.toString();
        const queue = await callConvexAPI(`/review-queue${qs ? `?${qs}` : ""}`, "GET");
        return { content: [{ type: "text", text: JSON.stringify(queue, null, 2) }] };
      }
      case "approve_review_item": {
        const approved = await callConvexAPI("/review-queue/approve", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(approved, null, 2) }] };
      }
      case "reject_review_item": {
        const rejected = await callConvexAPI("/review-queue/reject", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(rejected, null, 2) }] };
      }
      case "enqueue_gmail_candidate": {
        const queued = await callConvexAPI("/gmail/candidates", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(queued, null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
