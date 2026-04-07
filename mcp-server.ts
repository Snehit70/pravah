import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CONVEX_URL = process.env.CONVEX_URL ?? "https://befitting-swan-125.eu-west-1.convex.site";
const CONVEX_HTTP_API_KEY = process.env.CONVEX_HTTP_API_KEY;

async function callConvexAPI(endpoint: string, method: string, body?: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (CONVEX_HTTP_API_KEY) {
    headers["x-api-key"] = CONVEX_HTTP_API_KEY;
  }
  const response = await fetch(`${CONVEX_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_tasks": {
        const tasks = await callConvexAPI(`/tasks?status=${args.status || ""}&date=${args.date || ""}`, "GET");
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
        const completed = await callConvexAPI("/tasks/complete", "POST", { taskId: args.taskId });
        return { content: [{ type: "text", text: JSON.stringify(completed, null, 2) }] };
      }
      case "update_task": {
        const updated = await callConvexAPI("/tasks/update", "POST", args);
        return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
      }
      case "delete_task": {
        const deleted = await callConvexAPI("/tasks/delete", "POST", { taskId: args.taskId });
        return { content: [{ type: "text", text: JSON.stringify(deleted, null, 2) }] };
      }
      case "get_timeline": {
        const timeline = await callConvexAPI(`/timeline?startDate=${args.startDate}&endDate=${args.endDate}`, "GET");
        return { content: [{ type: "text", text: JSON.stringify(timeline, null, 2) }] };
      }
      case "get_inbox": {
        const inbox = await callConvexAPI("/inbox", "GET");
        return { content: [{ type: "text", text: JSON.stringify(inbox, null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);