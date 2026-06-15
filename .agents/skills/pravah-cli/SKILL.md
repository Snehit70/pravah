---
name: pravah-cli
description: Read the authenticated user's Pravah tasks, timeline, review queue, sync status, and bounded agent context through the Pravah CLI. Use when an agent needs current Pravah planning context without making changes.
---

# Pravah CLI

Use this skill only for read-only planning and inspection. Never run task write commands.

The CLI contract uses product vocabulary:

- `inbox`: active task without a `deadline`
- `timeline`: active task with a `deadline`
- `completed`: task with `completedAt`
- `cancelled`: task removed from the active workflow

Trust the curated JSON contract returned by the CLI. Do not depend on storage-model compatibility fields like `scheduledDate`, `status`, or `type`, even if older rows still contain them internally.

## Workflow

1. Run `pravah auth whoami --json`.
2. Run `pravah auth list-scopes --json`.
3. Verify the required read scope is present.
4. Run the narrowest allowed command with `--json`.
5. Check the process exit code and top-level `ok` before using `data`.
6. If auth fails, a scope is missing, or `ok: false`, stop and report the failure clearly instead of trying another path.

If `pravah` is not installed and the current checkout is Pravah, use `bun run pravah -- <namespace> <command> ... --json`.

## Allowed Commands

```bash
pravah tasks list --status timeline --json
pravah goals list --json
pravah tasks inbox --json
pravah tasks timeline --end-date YYYY-MM-DD --json
pravah review list --status pending --limit 25 --json
pravah sync status --provider google_calendar --json
pravah agent context --json
pravah agent task --task-id <id> --json
```

Required scopes:

- Task reads: `tasks:read`.
- Goal reads: `tasks:read`.
- `agent context`: `tasks:read`, `review:read`, and `sync:read`.
- `agent task`: `tasks:read`.
- Review queue reads: `review:read`.
- Sync status reads: `sync:read`.

## Guardrails

- Never run `tasks add`, `tasks update`, `tasks move`, `tasks complete`, `tasks reopen`, or `tasks unschedule`.
- Never read, print, or transmit the credential file or bearer secret.
- Do not silently use mock data. Treat a non-zero exit or `ok: false` as a real failure.
- Prefer `agent context` for a bounded operational snapshot and `agent task` for one-task detail.
- Prefer `tasks list --status timeline --json` when the agent needs currently planned active work rather than every visible task.
- Report missing scopes or authentication clearly instead of attempting another auth method.
