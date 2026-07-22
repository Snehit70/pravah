---
name: pravah-cli
description: Read and manage the authenticated user's Pravah tasks, goals, timeline, review queue, sync status, and bounded agent context through the Pravah CLI. Use for current planning context and for explicit user-requested task or goal mutations such as creating, updating, moving, completing, or linking work.
---

# Pravah CLI

Use read commands for inspection. Run write commands only when the user explicitly requests the corresponding Pravah change; do not infer permission to mutate live planning data from a read-only request.

The CLI contract uses product vocabulary:

- `inbox`: active task without a `deadline`
- `timeline`: active task with a `deadline`
- `completed`: task with `completedAt`
- `cancelled`: task removed from the active workflow

Trust the curated JSON contract returned by the CLI. Do not depend on storage-model compatibility fields like `scheduledDate`, `status`, or `type`, even if older rows still contain them internally.

## Workflow

1. Run `pravah auth whoami --json`.
2. Run `pravah auth list-scopes --json`.
3. Verify the scopes required by the intended command are present.
4. Run the narrowest matching command with `--json`.
5. Check the process exit code and top-level `ok` before using `data`.
6. For a requested write, use `--dry-run` first when supported, then apply it with an explicit `--idempotency-key`.
7. Read the affected task or goal back after a write and verify the requested state.
8. If auth fails, a scope is missing, or `ok: false`, report the exact failure. Do not bypass server authorization or edit the credential store to manufacture a missing scope.

If `pravah` is not installed and the current checkout is Pravah, use `bun run pravah -- <namespace> <command> ... --json`.

## Common Commands

```bash
pravah tasks list --status timeline --json
pravah goals list --json
pravah tasks inbox --json
pravah tasks timeline --end-date YYYY-MM-DD --json
pravah review list --status pending --limit 25 --json
pravah sync status --provider google_calendar --json
pravah agent context --json
pravah agent task --task-id <id> --json
# For each requested write: preview first, apply with the same explicit key,
# then read the affected task back with `agent task`.
pravah tasks add --title <title> --description <notes> --dry-run --idempotency-key <key> --json
pravah tasks add --title <title> --description <notes> --idempotency-key <key> --json
pravah tasks update --task-id <task-id> <fields> --dry-run --idempotency-key <key> --json
pravah tasks update --task-id <task-id> <fields> --idempotency-key <key> --json
pravah tasks link-goal --task-id <task-id> --goal-id <goal-id> --dry-run --idempotency-key <key> --json
pravah tasks link-goal --task-id <task-id> --goal-id <goal-id> --idempotency-key <key> --json
pravah tasks unlink-goal --task-id <task-id> --dry-run --idempotency-key <key> --json
pravah tasks unlink-goal --task-id <task-id> --idempotency-key <key> --json
pravah agent task --task-id <task-id> --json
```

Use `pravah capabilities --json` or `<namespace> <command> --help` to discover the current contract rather than treating this list as exhaustive.

Required scopes:

- Task reads: `tasks:read`.
- Goal reads: `tasks:read`.
- `agent context`: `tasks:read`, `review:read`, and `sync:read`.
- `agent task`: `tasks:read`.
- Review queue reads: `review:read`.
- Sync status reads: `sync:read`.
- Task and goal writes: `tasks:write`.

## Guardrails

- Never mutate Pravah data unless the user explicitly requested that mutation.
- Treat destructive or lifecycle-changing operations such as delete, cancel, complete, revoke, and undo as requiring clear user intent for that exact action.
- Prefer `--dry-run` for supported writes, use an idempotency key for the live command, and verify by readback.
- Never read, print, or transmit the credential file or bearer secret.
- Do not silently use mock data. Treat a non-zero exit or `ok: false` as a real failure.
- Prefer `agent context` for a bounded operational snapshot and `agent task` for one-task detail.
- Prefer `tasks list --status timeline --json` when the agent needs currently planned active work rather than every visible task.
- Report missing scopes or authentication clearly instead of attempting another auth method.
