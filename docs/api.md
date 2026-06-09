# HTTP API and CLI Reference

Pravah exposes owner-bound Convex HTTP routes. External agents should use the authenticated `pravah` CLI rather than calling routes directly.

## Authentication

Automation credentials use:

```http
Authorization: Bearer pravah_cred_...
```

Bearer credentials are issued by exchanging a short-lived, one-time bootstrap token:

```bash
pravah auth import --bootstrap-token pravah_bootstrap_... --json
```

Settings issues read-only credentials by default. Enable **Allow task writes**
only for trusted workflows that need the accepted task mutation commands.

Legacy/admin integrations may use `x-api-key: <CONVEX_HTTP_API_KEY>`. Admin API-key routes require `PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER` for owner-bound operations.

Every bearer-authenticated task write requires:

```http
Idempotency-Key: <unique key, 1-200 characters>
```

Exact retries replay the stored response for 30 days. Reusing a retained key for a different operation or payload fails.

## Automation Routes

Bearer scopes protect the routes available to the CLI:

| Route | Scope |
|---|---|
| `GET /tasks`, `GET /inbox`, `GET /timeline` | `tasks:read` |
| `POST /tasks`, `/tasks/move`, `/tasks/complete`, `/tasks/reopen`, `/tasks/unschedule` | `tasks:write` |
| `GET /review-queue` | `review:read` |
| `GET /sync/status` | `sync:read` |

High-risk or broad operations remain admin API-key only, including task update/delete/reorder/bulk-reschedule, sync imports, and review-queue decisions.

`POST /automation/bootstrap/exchange` accepts a one-time bootstrap token and does not require an existing credential.

## CLI

The CLI always emits a versioned JSON envelope when `--json` is used. Agents should check `ok` and the process exit code before reading `data`.

```bash
pravah auth whoami --json
pravah auth list-scopes --json
pravah tasks list --status scheduled --json
pravah tasks timeline --end-date 2026-06-10 --json
pravah agent context --json
```

Allowed idempotent writes:

```bash
pravah tasks add --title "Prepare brief" --idempotency-key brief-2026-06-04 --json
pravah tasks move --task-id <id> --target-date 2026-06-06 --idempotency-key move-<id>-2026-06-06 --json
pravah tasks complete --task-id <id> --idempotency-key complete-<id> --json
pravah tasks reopen --task-id <id> --idempotency-key reopen-<id> --json
pravah tasks unschedule --task-id <id> --idempotency-key unschedule-<id> --json
```

Use `--dry-run` to validate and preview a write without authentication or a network request.

## Request Shapes

Create task:

```json
{
  "title": "Task title",
  "description": "Optional description",
  "type": "open",
  "scheduledDate": "2026-06-05",
  "deadline": "2026-06-10",
  "source": "ai-agent",
  "estimatedMinutes": 30,
  "tags": ["project"],
  "priority": "p2"
}
```

Move task:

```json
{
  "taskId": "<task-id>",
  "targetDate": "2026-06-06",
  "position": 0
}
```
