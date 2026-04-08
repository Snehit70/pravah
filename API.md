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

### POST /tasks/reopen
Reopen a completed task back to inbox.

**Request Body:**
```json
{
  "taskId": "task_id"
}
```

### POST /tasks/unschedule
Move a task from timeline back to inbox.

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

### POST /tasks/bulk-reschedule
Reschedule multiple tasks to a single date.

**Request Body:**
```json
{
  "taskIds": ["id1", "id2"],
  "targetDate": "YYYY-MM-DD"
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

### GET /sync/status
Get integration health and latest sync status.

**Query Parameters:**
- `provider` (optional): `google_calendar` or `gmail` (default: `google_calendar`)

### POST /sync/google-calendar/import
Run one-way import from Google Calendar into Pravah.

**Request Body (optional):**
```json
{
  "accessToken": "google-oauth-access-token",
  "tokenExpiresAt": 1770000000000,
  "calendarId": "primary",
  "timeMin": "2026-04-01T00:00:00Z",
  "timeMax": "2026-04-30T23:59:59Z"
}
```

### GET /review-queue
List items waiting for manual approval.

**Query Parameters:**
- `status` (optional): `pending`, `approved`, `rejected`
- `limit` (optional): max items to return

### POST /review-queue/approve
Approve a queue item and create a real task.

**Request Body:**
```json
{
  "reviewId": "review_queue_id",
  "scheduledDate": "YYYY-MM-DD"
}
```

### POST /review-queue/reject
Reject a queue item.

**Request Body:**
```json
{
  "reviewId": "review_queue_id",
  "reason": "optional reason"
}
```

### POST /gmail/candidates
Enqueue Gmail-derived candidate task for manual approval.

**Request Body:**
```json
{
  "externalId": "gmail_message_id",
  "title": "Follow up with team",
  "description": "Optional details from email",
  "deadline": "YYYY-MM-DD",
  "estimatedMinutes": 20,
  "tags": ["email", "follow-up"],
  "payloadJson": "{\"threadId\":\"...\"}"
}
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
| reopen_task | Reopen completed task |
| unschedule_task | Move task back to inbox |
| bulk_reschedule | Reschedule multiple tasks |
| update_task | Update task details |
| delete_task | Delete a task |
| get_timeline | Get timeline for date range |
| get_inbox | Get all inbox tasks |
| get_sync_status | Get integration and sync status |
| import_google_calendar | Trigger Google Calendar import |
| list_review_queue | List manual approval queue |
| approve_review_item | Approve queue item into tasks |
| reject_review_item | Reject queue item |
| enqueue_gmail_candidate | Add Gmail candidate to review queue |
