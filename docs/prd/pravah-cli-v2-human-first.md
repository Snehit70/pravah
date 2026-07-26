# Pravah CLI v2 — Human-first terminal contract

## Problem Statement

Pravah's CLI is an effective automation API, but it is not currently a usable
terminal product. Except for help, commands always emit one-line JSON, even
without `--json`; resource operations use transport-shaped flags such as
`get --task-id`; the default task read does not prioritize the work that needs
attention; and `agent context` sends a large, weakly prioritized planning
payload.

The result is a CLI that is safer and more machine-readable than many task
tools, yet harder than it should be for a person or an agent to navigate. A
user should be able to answer “what needs attention?”, act on a Task or Goal,
recover a write, and diagnose setup without reading record dumps or learning
backend-shaped command names.

## Solution

Release Pravah CLI v2 as a deliberate SemVer-major, human-first terminal
contract.

- Human-readable output is the default; `--json` explicitly selects the v2
  machine envelope.
- Commands use the resource grammar `pravah <resource> <verb> [target]
  [filters]`.
- `tasks list` is a bounded planning horizon: Overdue, Today, and the next
  14 local calendar days, followed by an Inbox count.
- Attention views (`inbox`, `today`, `overdue`, `upcoming`) provide direct
  answers to common planning questions.
- Target references accept an ID or an exact unique Task/Goal title; ambiguity
  fails safely with candidates instead of guessing.
- Every recoverable write renders an Operation receipt with an Undo command.
- `agent context --json` becomes a compact task-planning v2 briefing.
- `auth login`, `auth logout`, `auth status`, and `doctor` make local setup
  discoverable and diagnosable.

The v2 contract does not carry forward the old API-shaped command surface,
and it deliberately excludes paused integration work.

## User Stories

1. As a terminal user, I want `pravah tasks list` to show urgent work first, so that I can plan without scanning every Task.
2. As a terminal user, I want the default list to separate Overdue, Today, and Upcoming work, so that each planning state is immediately legible.
3. As a terminal user, I want the default horizon to include the next 14 local calendar days, so that near-term work is visible without distant work becoming noise.
4. As a terminal user, I want an Inbox count at the end of the default horizon, so that unplanned work is visible without dominating my schedule.
5. As a terminal user, I want `pravah inbox` to show Inbox Tasks directly, so that I can triage unplanned work on demand.
6. As a terminal user, I want `pravah today` to contain only Tasks scheduled today, so that overdue work does not obscure today's plan.
7. As a terminal user, I want `pravah overdue` to remain separate from Today, so that neglected work is explicit.
8. As a terminal user, I want `pravah upcoming` to show the same 14-day local horizon, so that the shortcut and default list agree.
9. As a terminal user, I want compact rows to show due information, priority, and title, so that lists remain scannable.
10. As a terminal user, I want `--long` to reveal Goal, time, tags, estimate, description, and ID, so that I can inspect detail without leaving the list.
11. As a terminal user, I want colour only when it is safe terminal decoration, so that output remains understandable in plain or redirected terminals.
12. As a terminal user, I want `--all` to expand to all active Tasks only, so that history is never mixed into active planning by accident.
13. As a terminal user, I want composable Goal, priority, tag, status, and date filters, so that I can ask focused planning questions.
14. As a terminal user, I want comma-separated priority and tag filters to match any supplied value, so that common multi-value queries stay concise.
15. As a terminal user, I want strict date bounds and exact-date filters, so that adjacent date queries do not overlap unexpectedly.
16. As a terminal user, I want `tasks show`, `edit`, `complete`, `schedule`, and `remove` to read like normal object operations, so that commands are predictable.
17. As a terminal user, I want to target a Task by ID or exact unique title, so that I can act from what I see without an unnecessary ID lookup.
18. As a terminal user, I want ambiguous titles to stop with matching candidates and IDs, so that a mutation never selects the wrong Task.
19. As a terminal user, I want `tasks add "Title"` and `goals add "Title"`, so that creation reads naturally while metadata remains optional flags.
20. As a terminal user, I want `goals list` to show Goal, due date, priority, and progress, so that I can scan planning outcomes.
21. As a terminal user, I want Goal progress to mean completed active linked Tasks, so that cancelled work does not distort the denominator.
22. As a terminal user, I want `goals show` to show active linked Tasks and summarize history, so that Goal detail stays planning-focused.
23. As a terminal user, I want successful recoverable writes to show a ready-to-run Undo command and expiry, so that recovery is obvious at the moment I need it.
24. As a terminal user, I want Task and Goal removal to require `--confirm`, so that destructive intent is explicit and consistent.
25. As a terminal user, I want `operations list` to show the 20 newest operations with Undo availability, so that I can recover recent automation safely.
26. As a terminal user, I want single-operation and grouped Undo syntax to be obvious, so that I can reverse exactly the intended work.
27. As an automation agent, I want `--json` to return one versioned v2 contract, so that machine parsing never depends on human layout.
28. As an automation agent, I want `agent context --json` to include only ranked task-planning information, so that one-call context is useful and token-bounded.
29. As an automation agent, I want at most three Task summaries per urgency group plus an Inbox count, so that the briefing avoids duplicate or exhaustive records.
30. As an automation agent, I want `tasks show <target> --json` to be the single focused Task read, so that there is no parallel agent-only task model.
31. As an automation agent, I want every write to carry an idempotency key, so that retries are safe.
32. As an automation agent, I want caller-provided stable idempotency keys to remain optional but accurately documented, so that cross-invocation retries can be deliberate.
33. As a terminal user, I want concise actionable errors on stderr, so that normal failures do not dump backend internals.
34. As a debugger, I want `--debug` to provide sanitized remote diagnostics, so that I can investigate without making noisy diagnostics the default.
35. As a terminal user, I want `--json` and `--long` to be mutually exclusive, so that output selection is unambiguous.
36. As a new user, I want `auth login`, `auth logout`, and `auth status`, so that local CLI authentication is easy to understand.
37. As a user on a shared or changing machine, I want logout to remove only my local credential, so that it does not silently disable another automation environment.
38. As a user, I want `doctor` to check runtime, endpoint, credential, scopes, and reachability, so that setup failures come with a specific remedy.
39. As an automation agent, I want `capabilities --json` to describe the complete v2 command manifest, so that discovery does not require scraping help text.
40. As a current CLI user, I want a migration guide from v1 commands to v2 commands, so that the intentional major upgrade is actionable.

## Implementation Decisions

- The CLI contract advances from v1 to v2 as a SemVer-major release. The old
  API-shaped commands are removed rather than retained as aliases.
- The canonical public command surface is:
  - top-level: `inbox`, `today`, `overdue`, `upcoming`, `doctor`, and
    `capabilities`
  - Tasks: `list`, `show`, `add`, `edit`, `complete`, `reopen`, `schedule`,
    `unschedule`, `remove`
  - Goals: `list`, `show`, `add`, `edit`, `remove`
  - Operations: `list`, `show`, `undo`
  - Auth: `login`, `logout`, `status`
- The command registry must model positional targets, target reference
  resolution, input schemas, output modes, safety metadata, and the complete
  v2 capabilities manifest from one source of truth.
- Human output is rendered after normalized command results. JSON output is a
  versioned v2 envelope and does not depend on TTY detection. TTY detection may
  affect only colour.
- Standard human lists use compact rows. `--long` adds contextual detail;
  `--json` and `--long` are invalid together.
- Task horizon and views use the CLI host's local timezone. Overdue sorts by
  priority then oldest due date; Today sorts timed work by time then priority
  with untimed work last; Upcoming sorts nearest date/time then priority.
- `--all` removes the default horizon cap. Active means Inbox plus Timeline;
  Completed and Cancelled require explicit status selection.
- Task filters compose. Comma-separated priority and tag values are OR
  matches. `before` and `after` are strict; `date` is exact.
- A Task or Goal target may be an ID or exact unique title/name. Ambiguity
  returns candidate IDs and titles. Fuzzy matching exists only in Search.
- Goal progress is completed active linked Tasks divided by active linked
  Tasks. Cancelled linked Tasks do not count in progress.
- All writes preserve the operation receipt consistently in normalized results.
  Human output renders action, target, Undo command, and expiry when present.
- Removal uses `--confirm`. Single Undo takes a positional operation ID;
  grouped Undo takes `--group <group-id>`.
- Every write has generated transport idempotency. A caller-stable key is
  optional and should be used by callers that may retry across invocations.
- `agent context --json` is task-only: counts plus up to three summaries for
  Overdue, Today, and Next; Inbox is a count; priority is annotated inside
  urgency groups instead of duplicated in a separate section.
- `agent task` is removed. `tasks show <target> --json` is the focused read.
- Human errors go to stderr with an actionable message. Debug mode appends
  sanitized remote diagnostics; JSON errors remain structured.
- `doctor` is read-only, prints every prerequisite check, and exits non-zero
  if any prerequisite fails. It never repairs credentials or remote state.
- `auth login` is the guided bootstrap-token setup flow. `auth status` reports
  local credential health, identity, endpoint, and scopes. `auth logout`
  removes only the local credential.
- `capabilities --json` is the machine-readable v2 manifest, including command
  syntax, positional targets, options, output modes, scopes, dry-run,
  confirmation, and idempotency behavior.
- A migration guide maps every supported v1 CLI command to its v2 replacement.
- Google Calendar, Gmail, sync, and review are removed from the v2 public CLI
  contract and documentation. Their existing backend/code is not modified.

## Testing Decisions

- Tests assert observable CLI behavior: stdout, stderr, exit status, JSON
  envelopes, input validation, and normalized command results. They do not
  assert renderer internals.
- The highest seam for human output is the CLI process boundary. Snapshot tests
  cover compact and long output for Task, Goal, operation, auth, doctor, write
  receipt, and error paths with colour disabled.
- Contract tests cover every canonical v2 command in the capabilities manifest,
  its positional/option schema, scopes, dry-run, confirmation, output modes,
  and idempotency metadata.
- JSON tests assert v2 success and error envelopes, machine-readable error
  codes, and that `--json` never depends on TTY state.
- Target-resolution tests cover ID targets, unique exact titles/names,
  ambiguous targets, missing targets, and the rule that fuzzy matching is
  Search-only.
- Task-query tests cover the 14-day local horizon, section membership,
  ordering, Inbox count, all-active expansion, explicit historical status,
  OR filter semantics, and strict date bounds.
- Goal tests cover ordering, active-only progress denominators, cancelled-link
  exclusion, and active-versus-historical detail rendering.
- Write tests cover generated and caller-stable idempotency keys, dry runs,
  standard receipts, confirmation requirements, single Undo, grouped Undo,
  expiry display, and result normalization for every write command.
- Agent-context tests cover the compact v2 schema, urgency ranking, three-item
  caps, non-duplicated priority annotation, Inbox count, and exclusion of
  held integration/review data.
- Auth and doctor tests cover local-only logout, status fields, every failed
  prerequisite, exact remedies, non-zero doctor exits, and the guarantee that
  doctor has no mutation side effects.
- Existing CLI process, command-spec, live-command, mock-command, and HTTP
  contract tests are the preferred seams. New tests should extend those seams
  rather than testing parsing or rendering helpers in isolation.

## Out of Scope

- Google Calendar, Gmail, sync, review-queue, and external-import redesign.
- Changes to the paused integration backend/code.
- Remote credential revocation from `auth logout`.
- New Task concepts such as blocked state, recurring Tasks, subtasks, or
  dependency management.
- Automatic repair, credential re-import, or remote mutation by `doctor`.
- Automatic JSON/text selection based on pipes or TTY detection.
- TSV, quiet, or other additional export formats beyond the agreed JSON and
  human compact/long modes.
- Backward-compatible aliases for the v1 API-shaped commands.

## Further Notes

- This PRD is grounded in the CLI redesign research and ADRs 0014 through
  0022.
- Current integration documentation may still describe sync as shipped. This
  PRD deliberately supersedes that scope for the CLI v2 redesign: integrations
  are on hold because they are not cleanly implemented.
- The new public contract must be described in generated help, capabilities,
  package documentation, and the migration guide as one coherent v2 surface.
