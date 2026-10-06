# HTTP API and CLI Reference

Pravah exposes owner-bound Convex HTTP routes. External agents should use the authenticated `pravah` CLI rather than calling routes directly.

## Authentication

Automation credentials use:

```http
Authorization: Bearer pravah_cred_...
```

Bearer credentials are issued by exchanging a short-lived, one-time bootstrap token:

```bash
pravah auth login --url https://your-deployment.convex.site --bootstrap-token pravah_bootstrap_...
```

Settings issues read-only credentials by default. Enable **Allow task writes**
only for trusted workflows that need the accepted task mutation commands.

Legacy/admin integrations may use `x-api-key: <CONVEX_HTTP_API_KEY>`. Admin API-key routes require `PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER` for owner-bound operations.

Mock mode is an explicit local/testing opt-in through `PRAVAH_CLI_MOCK=1`. Real CLI execution should fail closed when authentication or routing is missing.

Every bearer-authenticated task write requires:

```http
Idempotency-Key: <unique key, 1-200 characters>
```

Exact retries replay the stored response for 30 days. Reusing a retained key for a different operation or payload fails.

Delete-class writes also require explicit confirmation flags. Routine reversible writes rely on idempotency, scoped credentials, and operation-ledger undo rather than extra confirmation syntax.

Agent writes should also record an operation ledger entry. Mutating CLI responses should include operation metadata; undoability is a property of the recorded operation:

```json
{
  "operationId": "op_...",
  "operationGroupId": "group_...",
  "undoAvailable": true,
  "undoExpiresAt": "2026-06-17T12:30:00.000Z"
}
```

## Automation Routes

Bearer scopes protect the routes available to the CLI:

| Route | Scope |
|---|---|
| `GET /tasks`, `GET /inbox`, `GET /timeline` | `tasks:read` |
| `GET /goals`, `GET /goal-links`, `GET /goals/tasks` | `tasks:read` |
| `POST /tasks`, `/tasks/move`, `/tasks/update`, `/tasks/complete`, `/tasks/reopen`, `/tasks/unschedule` | `tasks:write` |
| `GET /review-queue` | `review:read` |
| `GET /sync/status` | `sync:read` |

Admin API-key only routes remain for high-risk or broad operations: task delete, reorder, bulk-reschedule, sync imports, and review-queue decisions. `POST /tasks/update` is available on the bearer-authenticated automation path with idempotency keys.

`GET /goals/tasks?goalId=<id>&cursor=<cursor>` reads tasks associated with a
selected goal. Omitting `goalId` selects all goal-linked tasks. The response
contains `tasks`, `links`, `isDone` and `continueCursor`; follow every cursor for
complete progress counts, even when a page has no tasks because its links are
dangling or cancelled. Each query reads at most 100 link rows / 256 KiB before
fetching the associated tasks and their active image summaries. Task ownership
is checked independently of link ownership. Unlinked tasks are not read.

Planned write expansion should keep the existing coarse scopes initially. Task, Goal, Goal Link, delete, and operation undo commands may use `tasks:write` while `pravah capabilities` reports per-command `requiredScopes`, leaving room to split into narrower scopes later without changing command names.

`POST /automation/bootstrap/exchange` accepts a one-time bootstrap token and does not require an existing credential.

### Convex token exchange

`POST /automation/convex-token` requires `tasks:read`. It exchanges the automation
bearer for a short-lived Convex websocket token for the same owner:

```json
{
  "token": "<RS256 JWT>",
  "expiresAt": 1790000000000,
  "convexUrl": "https://<deployment>.eu-west-1.convex.cloud",
  "siteUrl": "https://<deployment>.eu-west-1.convex.site",
  "label": "Laptop"
}
```

The token is signed with the Better Auth JWKS key that `convex/auth.config.ts`
publishes, so the existing `customJwt` provider accepts it without a second
provider entry. `sub` is the subject half of the credential's stored
`ownerTokenIdentifier`; Convex rebuilds `identity.tokenIdentifier` as
`${iss}|${sub}`, so the subscription resolves to the same owner as every HTTP
route. The route returns `409` if the stored identifier was issued by a different
site URL.

The automation secret is never sent over a websocket. Default lifetime is 15
minutes, and the caller refreshes before expiry. A revoked credential therefore
keeps working for at most that long.

## CLI

The CLI command contract is a versioned JSON envelope on stdout. Agents should check `ok` and the process exit code before reading `data`. The `--json` flag remains accepted for compatibility, but command success and failure should stay structured for agent callers.

Stable error codes should be machine-readable and specific enough to avoid string matching:

| Code | Meaning |
|---|---|
| `invalid_command` | Unknown or malformed command namespace/action |
| `invalid_option` | Unknown option, malformed flag, or missing option value |
| `validation_failed` | Recognized command with invalid payload semantics |
| `unauthenticated` | Missing or invalid CLI credential |
| `forbidden` | Credential lacks a required scope |
| `not_found` | Referenced Task, Goal, Goal Link, or operation does not exist |
| `conflict` | Idempotency, lifecycle, or state conflict |
| `network_failed` | CLI could not reach the configured HTTP endpoint |
| `write_failed` | Write outcome is unknown or failed after reaching the server |
| `undo_unavailable` | Requested undo is expired, already undone, or lacks before-state |
| `server_error` | Server returned an unexpected failure |

```bash
pravah auth whoami --json
pravah auth list-scopes --json
pravah capabilities --json
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
  "time": "09:30",
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
pravah capabilities --json
```

Read the current planning state:

```bash
pravah agent context --json
pravah tasks list --status timeline --json
pravah tasks inbox --json
pravah goals list --json
```

### Watch mode

`pravah watch` is the only command that does not return once. It opens a real
Convex websocket as the credential's owner, subscribes to the board, today's
completions, goals, and goal links, and rewrites one snapshot file on every
update. Every other command stays on HTTP.

```bash
pravah watch                      # maintain the snapshot until interrupted
pravah watch --path               # print the snapshot path and exit
pravah watch --print              # print the current snapshot, no network call
pravah watch --format waybar      # one {text,tooltip,class} JSON line per update
```

`--format=waybar` is accepted as well as `--format waybar`.

The snapshot lives at `$XDG_RUNTIME_DIR/pravah/snapshot.json`, falling back to
`$TMPDIR/pravah-$UID/snapshot.json` and then `/tmp/pravah-$UID/snapshot.json`.
It is written to a temp file and renamed, so a reader watching the path never
sees a partial write, and the file is mode `0600`. A pid lock beside it keeps
two daemons from fighting over the same file; a lock left behind by a dead
process is reclaimed.

Two behaviours are deliberate:

- **Watch is subscribe-only.** It never falls back to HTTP polling. A widget on
  watch transport that loses its daemon shows a stale snapshot and says so,
  rather than silently reverting to polling and hiding the failure.
- **"Today" bounds are re-subscribed at local midnight.** A subscribed query's
  arguments are fixed for its lifetime, so a day-bounded query would otherwise
  keep serving yesterday's completions.

Because the subscription only carries today's completions, `completedTasks` on a
snapshot goal counts completions inside the subscribed day and understates
long-running goals.

Inspect one task with goal context:

```bash
pravah agent task --task-id <task-id> --json
```

Focused reads make agent writes safer by helping callers resolve IDs before mutation:

```bash
pravah tasks search --query "brief" --status timeline --limit 10 --json
pravah tasks get --task-id <task-id> --json
pravah goals search --query "mobile beta" --limit 10 --json
pravah goals get --goal-id <goal-id> --json
```

Allowed idempotent writes:

```bash
pravah tasks add --title "Prepare brief" --description "Include rollout notes" --deadline 2026-06-06 --time 09:30 --priority p2 --estimated-minutes 30 --tags cli,brief --idempotency-key brief-2026-06-04 --json
pravah tasks update --task-id <id> --description "Refined brief" --time clear --priority p1 --estimated-minutes clear --tags cli,shipping --idempotency-key update-<id> --json
pravah tasks move --task-id <id> --target-date 2026-06-06 --idempotency-key move-<id>-2026-06-06 --json
pravah tasks complete --task-id <id> --idempotency-key complete-<id> --json
pravah tasks reopen --task-id <id> --idempotency-key reopen-<id> --json
pravah tasks unschedule --task-id <id> --idempotency-key unschedule-<id> --json
pravah goals update --goal-id <goal-id> --deadline clear --json
```

Delete writes use soft deletion with operation-ledger undo and the canonical 30-minute purge window, not immediate hard deletion:

```bash
pravah tasks delete --task-id <id> --confirm-task-delete --idempotency-key task-delete-<id> --json
pravah goals delete --goal-id <goal-id> --confirm-goal-delete --idempotency-key goal-delete-<goal-id> --json
```

Goal Link writes use the same `tasks:write` scope and idempotency contract:

```bash
pravah tasks link-goal --task-id <id> --goal-id <goal-id> --idempotency-key link-goal-<id>-<goal-id> --json
pravah tasks unlink-goal --task-id <id> --idempotency-key unlink-goal-<id> --json
```

Goal writes give agents the same Goal lifecycle control available in the apps:

```bash
pravah goals create --text "Ship mobile beta" --description "Release-ready scope" --deadline 2026-07-01 --priority p1 --idempotency-key goal-create-mobile-beta --json
```

Operation history and undo:

```bash
pravah operations list --limit 20 --json
pravah operations get --operation-id <operation-id> --json
pravah operations list --operation-group-id <operation-group-id> --json
pravah operations undo --operation-id <operation-id> --idempotency-key undo-<operation-id> --json
pravah operations undo --operation-group-id <operation-group-id> --idempotency-key undo-group-<operation-group-id> --json
```

Single-step operations are the default. Grouped workflows may pass `--operation-group-id <id>` on each write so related agent changes can be inspected and undone together.

Use `--dry-run` to validate and preview a write without authentication or a network request.

### Live smoke workflow

Use one reversible write to validate auth, routing, idempotency, and cleanup:

```bash
pravah auth whoami --json
pravah agent context --json
pravah tasks add --title "CLI smoke test" --description "Verify add fields" --deadline 2026-06-20 --time 14:00 --priority p2 --estimated-minutes 15 --tags smoke,cli --idempotency-key smoke-add-2026-06-20 --json
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
  "time": "09:30",
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
  "time": null,
  "estimatedMinutes": null,
  "tags": ["cli", "shipping"],
  "priority": "p1"
}
```
