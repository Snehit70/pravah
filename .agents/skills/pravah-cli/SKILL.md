---
name: pravah-cli
description: Safely inspect and manage the authenticated user's Pravah v2 tasks, goals, operations, and compact planning context through the Pravah CLI. Use for current planning context, local CLI diagnosis, and explicitly requested task, goal, or undo mutations.
---

# Pravah CLI v2

Use this skill against the live `pravah` CLI. Pravah is a single-user planning system. Run a write only when the user explicitly requests that exact change; do not infer permission to mutate planning data from an inspection request.

Pravah CLI v2 prints human-readable output by default. Pass `--json` whenever structured data will be read or verified. Its JSON envelope is the machine contract: require a successful exit, `ok: true`, then use `data`.

## Start and discover

1. Run `pravah doctor --json` when diagnosing setup or before a workflow whose local readiness is unknown. It is read-only.
2. Run `pravah auth status --json` when authentication or scopes matter. Do not use removed v1 commands such as `auth whoami` or `auth list-scopes`.
3. Use `pravah capabilities --json` or the specific command's `--help` for the current contract. Do not scrape human output or assume this page is exhaustive.
4. Use the narrowest command and `--json` for agent work.

If `pravah` is unavailable and the current checkout is Pravah, run `bun run pravah -- <command> ...`. Never edit the credential store, print credentials, or bypass server authorization. Use `auth login` or `auth logout` only when the user explicitly asks to configure or remove this host's local credential.

## Read commands

```bash
pravah tasks list --json
pravah inbox --json
pravah today --json
pravah overdue --json
pravah upcoming --json
pravah tasks show <task-id-or-exact-title> --json
pravah goals list --json
pravah goals show <goal-id-or-exact-name> --json
pravah operations list --json
pravah operations show <operation-id> --json
pravah agent context --json
```

`tasks list` is the prioritized planning horizon. Filter it with `--goal`, `--priority`, `--tag`, `--status`, `--date`, `--before`, `--after`, or `--all` as needed. Use `--long` only for human-readable expanded detail; it cannot be combined with `--json`.

Task and Goal targets accept an ID or an exact unique title/name. If a target is ambiguous, stop and present the candidates; never guess or fuzzy-match a write target.

All v2 reads above require `tasks:read` except `doctor` and `capabilities`, which require no scopes. `agent context` is task-only and deliberately compact; use `tasks show` for focused task detail.

## Explicit writes

Task and Goal writes, including `operations undo`, require `tasks:write`. For an explicitly requested write:

1. Resolve the exact target first when it is not already unambiguous.
2. Run the same command with `--dry-run --json`.
3. Apply the command with `--json`.
4. Read back the affected Task, Goal, or operation and verify the requested state.
5. Report the operation receipt and Undo reference when returned.

The CLI generates an idempotency key for each write. Supply `--idempotency-key <stable-key>` only when a caller needs to retry safely across separate invocations; reuse that key for the preview, apply, and retry of the same intended change. Use `--operation-group-id <group-id>` when multiple requested writes should be undoable together.

```bash
# Create, edit, and plan a Task
pravah tasks add "Title" --priority p1 --dry-run --json
pravah tasks add "Title" --priority p1 --json
pravah tasks edit <task> --description "Notes" --dry-run --json
pravah tasks schedule <task> --date YYYY-MM-DD --dry-run --json
pravah tasks unschedule <task> --dry-run --json
pravah tasks complete <task> --dry-run --json
pravah tasks reopen <task> --dry-run --json

# Create or edit a Goal
pravah goals add "Title" --deadline YYYY-MM-DD --dry-run --json
pravah goals edit <goal> --priority p1 --dry-run --json

# Recover one write or a requested group
pravah operations undo <operation-id> --dry-run --json
pravah operations undo --group <group-id> --dry-run --json
```

Apply the corresponding non-dry-run command only after its preview succeeds. Use the same options, including a caller-provided stable key where applicable.

`tasks remove` and `goals remove` are recoverable, but still require both clear user intent for that exact target and `--confirm`. Completion, reopening, scheduling, unscheduling, editing, creation, and undo also change live planning data, so require explicit user intent even though they do not take `--confirm`.

## Guardrails

- Never mutate Pravah data from an implied request or a planning discussion.
- Treat a non-zero exit or `ok: false` as a real failure; report the actionable failure and do not try alternate auth paths or mock data.
- Never use removed v1 commands or held integration commands: `review`, `sync`, `agent task`, `tasks get/update/move/delete`, `goals create/get/delete`, `auth whoami`, and `auth list-scopes` are not the v2 contract.
- Prefer `operations list` and `operations show` to inspect recovery history. Undo only an operation or group the user explicitly identifies.
- Keep bootstrap tokens and bearer credentials out of output, logs, and command history whenever possible.
