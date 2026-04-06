# Pravah API Documentation

## Base URL
```
https://befitting-swan-125.eu-west-1.convex.site
```

## Endpoints

### GET /tasks
List all tasks, optionally filtered.

**Query Parameters:**
- `date` (optional): Filter by date (YYYY-MM-DD)
- `status` (optional): Filter by status (inbox, scheduled, completed)

**Example:**
```bash
curl "https://befitting-swan-125.eu-west-1.convex.site/tasks?status=inbox"
```

### POST /tasks
Add a new task.

**Request Body:**
```json
{
  "title": "Task title",
  "description": "Optional description",
  "type": "open" | "deadline",
  "scheduledDate": "YYYY-MM-DD",
  "deadline": "YYYY-MM-DD",
  "source": "manual" | "ai-agent" | "gmail" | "gcal",
  "estimatedMinutes": 30,
  "tags": ["tag1", "tag2"]
}
```

**Example:**
```bash
curl -X POST "https://befitting-swan-125.eu-west-1.convex.site/tasks" \
  -H "Content-Type: application/json" \
  -d '{"title": "New task", "type": "open"}'
```

### POST /tasks/move
Move a task to a different date.

**Request Body:**
```json
{
  "taskId": "task_id",
  "targetDate": "YYYY-MM-DD",
  "position": 0
}
```

### POST /tasks/reorder
Reorder tasks within a day.

**Request Body:**
```json
{
  "taskIds": ["id1", "id2", "id3"]
}
```

### POST /tasks/complete
Mark a task as completed.

**Request Body:**
```json
{
  "taskId": "task_id"
}
```

### POST /tasks/update
Update a task.

**Request Body:**
```json
{
  "taskId": "task_id",
  "title": "New title",
  "description": "New description",
  "deadline": "YYYY-MM-DD"
}
```

### POST /tasks/delete
Delete a task.

**Request Body:**
```json
{
  "taskId": "task_id"
}
```

### GET /timeline
Get timeline for date range.

**Query Parameters:**
- `startDate` (required): Start date (YYYY-MM-DD)
- `endDate` (required): End date (YYYY-MM-DD)

**Example:**
```bash
curl "https://befitting-swan-125.eu-west-1.convex.site/timeline?startDate=2026-04-01&endDate=2026-04-07"
```

### GET /inbox
Get all inbox tasks.

**Example:**
```bash
curl "https://befitting-swan-125.eu-west-1.convex.site/inbox"
```

## MCP Server

Run the MCP server for AI agent integration:

```bash
bun run mcp-server.ts
```

### MCP Tools

| Tool | Description |
|------|-------------|
| list_tasks | List tasks with optional filters |
| add_task | Add a new task |
| move_task | Move task to different date |
| reorder_tasks | Reorder tasks within a day |
| complete_task | Mark task as completed |
| update_task | Update task details |
| delete_task | Delete a task |
| get_timeline | Get timeline for date range |
| get_inbox | Get all inbox tasks |