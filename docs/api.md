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
| `POST /tasks`, `/tasks/move`, `/tasks/update`, `/tasks/complete`, `/tasks/reopen`, `/tasks/unschedule` | `tasks:write` |
| `GET /review-queue` | `review:read` |
| `GET /sync/status` | `sync:read` |

Admin API-key only routes remain for high-risk or broad operations: task delete, reorder, bulk-reschedule, sync imports, and review-queue decisions. `POST /tasks/update` is available on the bearer-authenticated automation path with idempotency keys.

`POST /automation/bootstrap/exchange` accepts a one-time bootstrap token and does not require an existing credential.

## CLI

The CLI always emits a versioned JSON envelope when `--json` is used. Agents should check `ok` and the process exit code before reading `data`.

```bash
pravah auth whoami --json
pravah auth list-scopes --json
pravah tasks list --status timeline --json
pravah tasks inbox --json
pravah tasks timeline --end-date 2026-06-10 --json
pravah goals list --json
pravah agent context --json
```

### Canonical task model

The CLI uses product language, not storage-model compatibility fields:

- `inbox`: active task without a `deadline`
- `timeline`: active task with a `deadline`
- `completed`: task with `completedAt`
- `cancelled`: task removed from the active workflow

The stable task read shape is a curated subset:

```json
{
  "id": "task_id",
  "title": "Draft CLI contract",
  "description": "Optional description",
  "status": "timeline",
  "deadline": "2026-06-05",
  "priority": "p2",
  "source": "manual",
  "position": 0,
  "createdAt": 1780000000000,
  "updatedAt": 1780000100000,
  "scheduledAt": 1780000000000,
  "completedAt": null,
  "cancelledAt": null
}
```

Legacy input alias:

- `tasks list --status scheduled` is still accepted temporarily as an alias for `timeline`.

### Core operator recipes

Verify auth and scopes:

```bash
pravah auth whoami --json
pravah auth list-scopes --json
```

Read the current planning state:

```bash
pravah agent context --json
pravah tasks list --status timeline --json
pravah tasks inbox --json
pravah goals list --json
```

Inspect one task with goal context:

```bash
pravah agent task --task-id <task-id> --json
```

Allowed idempotent writes:

```bash
pravah tasks add --title "Prepare brief" --description "Include rollout notes" --deadline 2026-06-06 --priority p2 --estimated-minutes 30 --tags cli,brief --idempotency-key brief-2026-06-04 --json
pravah tasks update --task-id <id> --description "Refined brief" --priority p1 --estimated-minutes clear --tags cli,shipping --idempotency-key update-<id> --json
pravah tasks move --task-id <id> --target-date 2026-06-06 --idempotency-key move-<id>-2026-06-06 --json
pravah tasks complete --task-id <id> --idempotency-key complete-<id> --json
pravah tasks reopen --task-id <id> --idempotency-key reopen-<id> --json
pravah tasks unschedule --task-id <id> --idempotency-key unschedule-<id> --json
pravah goals update --goal-id <goal-id> --deadline clear --json
```

Use `--dry-run` to validate and preview a write without authentication or a network request.

### Live smoke workflow

Use one reversible write to validate auth, routing, idempotency, and cleanup:

```bash
pravah auth whoami --json
pravah agent context --json
pravah tasks add --title "CLI smoke test" --description "Verify add fields" --deadline 2026-06-20 --priority p2 --estimated-minutes 15 --tags smoke,cli --idempotency-key smoke-add-2026-06-20 --json
pravah tasks list --date 2026-06-20 --json
pravah tasks unschedule --task-id <created-task-id> --idempotency-key smoke-unschedule-<created-task-id> --json
pravah tasks inbox --json
```

Verify that the added task appears on the Timeline first, then in the Inbox after `tasks unschedule`.

## Request Shapes

Create task:

```json
{
  "title": "Task title",
  "description": "Optional description",
  "deadline": "2026-06-10",
  "source": "ai-agent",
  "estimatedMinutes": 30,
  "tags": ["project"],
  "priority": "p2"
}
```

List tasks query parameters:

```json
{
  "status": "timeline",
  "date": "2026-06-10"
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

Update task:

```json
{
  "taskId": "<task-id>",
  "description": "Refined brief",
  "deadline": null,
  "estimatedMinutes": null,
  "tags": ["cli", "shipping"],
  "priority": "p1"
}
```
