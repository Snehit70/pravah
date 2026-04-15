# API and MCP Reference

Pravah exposes a Convex HTTP API plus an MCP server bridge for agent-driven automation.

## Base URL

Use your deployed Convex site URL:

```text
https://<your-deployment>.convex.site
```

## Authentication

Most HTTP routes require an API key header:

```http
x-api-key: <CONVEX_HTTP_API_KEY>
```

Route exception:

- `POST /google/token` (used for OAuth token exchange) does not require API key.

## HTTP Routes

### Tasks

- `GET /tasks` - list tasks, optional query: `date`, `status`
- `POST /tasks` - create task
- `POST /tasks/move` - move task to date
- `POST /tasks/reorder` - reorder tasks within a date
- `POST /tasks/complete` - mark completed
- `POST /tasks/reopen` - reopen to inbox
- `POST /tasks/unschedule` - move scheduled task to inbox
- `POST /tasks/update` - update task fields
- `POST /tasks/delete` - delete task
- `POST /tasks/bulk-reschedule` - move multiple tasks to one date

### Timeline and Inbox

- `GET /timeline?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- `GET /inbox`

### Google OAuth and Sync

- `OPTIONS /google/token`
- `POST /google/token` - exchange OAuth auth code + PKCE verifier
- `GET /sync/status?provider=google_calendar|gmail`
- `POST /sync/google-calendar/import`

### Review Queue

- `GET /review-queue?status=pending|approved|rejected&limit=100`
- `POST /review-queue/approve`
- `POST /review-queue/reject`
- `POST /gmail/candidates`

## Important Request Shapes

### Create task

```json
{
  "title": "Task title",
  "description": "Optional description",
  "type": "open",
  "scheduledDate": "2026-04-15",
  "deadline": "2026-04-20",
  "source": "manual",
  "estimatedMinutes": 30,
  "tags": ["project"]
}
```

### Move task

```json
{
  "taskId": "<task-id>",
  "targetDate": "2026-04-16",
  "position": 0
}
```

### Google token exchange

```json
{
  "code": "<auth-code>",
  "codeVerifier": "<pkce-verifier>",
  "redirectUri": "http://localhost:5173/google-callback"
}
```

### Import calendar

```json
{
  "accessToken": "<google-access-token>",
  "tokenExpiresAt": 1770000000000,
  "calendarIds": ["primary"],
  "fullResync": false,
  "timeMin": "2026-04-01T00:00:00Z",
  "timeMax": "2026-04-30T23:59:59Z"
}
```

## MCP Server

Run:

```bash
bun run mcp
```

MCP server is implemented in `mcp-server.ts` and proxies to Convex HTTP routes.

### MCP tools

- `list_tasks`
- `add_task`
- `move_task`
- `reorder_tasks`
- `complete_task`
- `reopen_task`
- `unschedule_task`
- `bulk_reschedule`
- `update_task`
- `delete_task`
- `get_timeline`
- `get_inbox`
- `get_sync_status`
- `import_google_calendar`
- `list_review_queue`
- `approve_review_item`
- `reject_review_item`
- `enqueue_gmail_candidate`
