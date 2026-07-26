# Pravah CLI: Human-first Unix Redesign Research

**Scope.** This note examines the current Pravah CLI from its local source, HTTP contract, and tests. It recommends a human-first terminal interface without weakening the existing automation contract. It is research only; it makes no production changes.

## Executive finding

The CLI is not merely *formatted* like an API: successful and failed non-help commands are unconditionally emitted as one-line JSON. `--json` is documented as the switch that enables the JSON envelope, but its value is not used by either success or error emission. [Entry point](../../packages/cli/src/pravah.ts#L15-L30) · [success/error emission](../../packages/cli/src/envelope.ts#L53-L79) · [documented option](../../packages/cli/src/commandSpec.ts#L31-L33)

So the product decision is not “prettify the current output.” It is to create an explicit **presentation layer** while retaining versioned JSON envelopes for callers that pass `--json`.

> **Scope update during design.** Google Calendar, Gmail, sync status, and the
> review queue are currently on hold because the integration system is not
> cleanly implemented. They are not part of this CLI-redesign PRD, even though
> the current code and older roadmap describe them.

## Current contract and its implications

### Commands

The command registry already has sensible resource namespaces (`tasks`, `goals`, `operations`, `review`, `sync`, and `agent`) and is the source for generated help/capabilities. Task reads today are `list`, `get`, `search`, `inbox`, and `timeline`; goals are `list`, `get`, `search`, `create`, `update`, and `delete`. [Namespaces](../../packages/cli/src/commandSpec.ts#L50-L58) · [task commands](../../packages/cli/src/commandSpec.ts#L119-L168) · [goal commands](../../packages/cli/src/commandSpec.ts#L291-L367) · [generated help contract](../../docs/adr/0003-publish-cli-as-standalone-bun-npm-package.md#L12-L17)

The command resolver recognizes only one- or two-word command paths. Any third positional is rejected during argument validation. Therefore `pravah tasks show <id>` cannot be added by aliasing `get`; resolver, validation, help usage, and tests must deliberately gain a **target positional** concept. [Resolution](../../packages/cli/src/commands.ts#L104-L142) · [validation](../../packages/cli/src/commandUtils.ts#L14-L43)

The raw argument parser is intentionally minimal: long options are supported, but it does not understand short options, `--flag=value`, or a `--` end-of-options marker. A redesign should not casually document those standard forms until the parser supports them. [Parser](../../packages/cli/src/args.ts#L3-L25)

### Data and API boundaries

The CLI uses coarse HTTP reads: `/tasks` accepts only `status` and exact `date`; `/goals` and `/goal-links` are independent reads. Task filtering by goal, priority, date range, or ordering would currently be client-side work or require new server query parameters. [HTTP request schema](../../convex/httpContracts.ts#L28-L31) · [task route](../../convex/http.ts#L115-L142) · [goal/link routes](../../convex/http.ts#L144-L176)

`goals list` returns all goals plus a separate task-to-goal map, so it can calculate progress, but it cannot know a goal's task count without also fetching tasks. [Current CLI result](../../packages/cli/src/liveCommands.ts#L446-L452) This matters for a proposed `GOAL / PROGRESS` table: either define progress as linked-task count from one additional task read, or add a purpose-built server summary; do not silently present it as completion progress before the data is available.

The existing task read includes lifecycle information, so the CLI can compute completed-versus-linked Goal progress with an additional task read. It needs a product rule for cancelled linked tasks: the current unfiltered task read excludes them while Goal Links can remain. A later aggregate goal endpoint would make the definition canonical and avoid client-side joins. [Task listing](../../convex/tasks.ts#L236-L285) · [Goal links](../../convex/automationTools.ts#L186-L198)

Write results already contain operation IDs, undo availability, and expiry in the backend, but the CLI drops or nests them inconsistently between commands. A human write renderer can therefore show one standard undo receipt without backend work, provided CLI result normalization preserves that receipt for every write. [Operation record](../../convex/automationTools.ts#L106-L148) · [task add result](../../packages/cli/src/liveCommands.ts#L686-L706)

`agent context` is composed in the CLI from full task and goal reads plus review and sync reads. It truncates scheduled tasks only after requesting everything, includes every goal at equal weight, and passes `syncStatus.lastError` through. This directly explains the noisy context and raw diagnostics reported in review. [Context construction](../../packages/cli/src/liveCommands.ts#L513-L569) · [live test proving primitive-route composition](../../src/test/pravahLiveCommands.test.ts#L155-L225) · [raw non-2xx body propagation](../../packages/cli/src/automationHttpClient.ts#L53-L57)

### Safety contract to preserve

Do not make the human CLI less safe. Writes retain scoped credentials, dry-run, operation groups, undo, and backend idempotency. The operation ledger intentionally supports reversing one operation or a recorded group. [Write metadata](../../packages/cli/src/commandUtils.ts#L60-L75) · [operation commands](../../packages/cli/src/commandSpec.ts#L370-L401) · [undo implementation](../../convex/automationOperations.ts#L290-L364) · [design decision](../adr/0001-operation-ledger-undo-for-agent-writes.md#L1-L3)

There is one terminology correction to make in the public contract: every CLI write receives a generated idempotency key when the caller omits one, but the caller-provided key is optional. `requiresIdempotencyKey: true` currently means the CLI/transport will send a key, not that the user must provide `--idempotency-key`. [Capability metadata](../../packages/cli/src/commandSpec.ts#L39-L43) · [key generation](../../packages/cli/src/commandUtils.ts#L60-L75) · [backend replay behavior](../../convex/automationIdempotency.ts#L56-L107)

## Recommended command direction

Adopt this grammar for the **human-oriented v2 surface**:

```text
pravah <resource> <verb> [target] [filters]
```

Use resources for objects and flags for attributes:

```sh
pravah tasks list
pravah tasks list --goal MLT --priority p1 --status active
pravah tasks show <task-id>
pravah tasks add "Study MLT"
pravah tasks complete <task-id>

pravah goals list
pravah goals show <goal-id-or-unique-name>
pravah goals add "Machine Learning"
```

This keeps `goals list` unambiguously about goals, while `tasks list --goal MLT` is unambiguously a task query. Priority is a task attribute, so `pravah priority list` should not be a primary command.

Keep a very small set of top-level convenience views only where they are stable, high-frequency questions:

```sh
pravah inbox
pravah today
pravah overdue
pravah upcoming
```

They must be documented aliases for an exact task query, not a second hidden command model.

## Output contract

Default output should be concise plain text, not a table full of internal metadata. For example:

```text
$ pravah tasks list --status active

DUE       PRI  TASK
Jul 26    P1   Java W6 Graded Assignment
Aug 02    P1   Java OPPE 1 — Must Pass

2 tasks
```

`--json` must continue to return a versioned `{ ok, version, command, data }` envelope with structured errors and stable exit semantics. The redesign intentionally advances the CLI contract to v2 so the existing `agent context` command can become the compact, task-planning-only authoritative briefing rather than retaining a parallel noisy shape. [Envelope test](../../src/test/pravahCli.test.ts#L113-L125) For a human-readable failure, print a one-line summary to stderr plus an actionable next command; never dump an HTTP response body or stack trace by default. The raw body can remain available via an explicit diagnostic mode such as `--debug`.

Do **not** change result format automatically when stdout is piped. A pipe may remove colour/TTY decoration, but it must not turn human text into JSON. Scripts and agents should opt in with `--json`. Add `--format tsv` or `--quiet` only after concrete pipeline use cases are specified and tested.

## Compatibility and phasing

### Phase 1 — Rendering and diagnostic compression (non-breaking)

- Add a renderer selected by `--json`; default to text for all non-help commands.
- Keep JSON envelope fields, error codes, command names, and exit codes unchanged under `--json`.
- Replace raw sync/backend detail in normal output with status, timestamp, short summary, and a narrow retrieval command.
- Change capability wording to distinguish **generated transport idempotency** from an optional **caller-stable replay key**.
- Add snapshot tests for text output and regression tests that no-flag output is no longer JSON.

### Phase 2 — Canonical v2 grammar and target positionals

- Replace API-shaped commands with canonical v2 commands such as `tasks show <target>` and `goals show <target>`. Targets accept an ID or exact unique title/name; ambiguous names return candidates and IDs, and fuzzy lookup remains Search-only. Publish the release as a SemVer major with a migration guide rather than retaining a parallel command surface.
- Add task list filters only after deciding whether they are client-side compatibility work or server-side query support. `--goal` needs the goal-link relation; `--priority`, `--before`, and status buckets need defined ordering and pagination.
- Make top-level views aliases with tested, documented expansions.

### Phase 3 — Purpose-built summaries

- Add a compact, prioritized task-planning `agent context` projection: overdue count and top items, today, next, and priority. Do not include held integrations or review-queue data.
- Move prioritisation/pagination to a backend projection when task counts make full `/tasks` fetches unsuitable. The current HTTP list contract cannot express it.
- Consider a Node/standalone distribution separately; Bun is an explicit current package/runtime constraint, not a renderer problem. [Package engine](../../packages/cli/package.json#L15-L17) · [ADR rationale](../adr/0003-publish-cli-as-standalone-bun-npm-package.md#L3-L10)

## Decisions to grill next

1. What does `tasks list` mean with no filters: all active tasks, or a prioritized horizon (overdue/today/next) with explicit `--all` for the rest?
2. Does a task target accept only an ID in v2, or an exact unique title too? Title lookup creates ambiguity and requires an explicit disambiguation rule.
3. What is the canonical active status vocabulary? The API exposes `inbox`, `timeline`, `completed`, and `cancelled`, while the CLI accepts `scheduled` as an alias. A human CLI should not expose all three words for the same scheduling concept.
4. Is a goal's displayed progress linked tasks, completed linked tasks, or a separately-defined outcome measure? The current data does not make these interchangeable.
