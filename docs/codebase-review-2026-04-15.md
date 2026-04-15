# Codebase Review (2026-04-15)

This review summarizes current strengths, risks, and high-value improvements discovered from the latest `main` code.

## Strengths

- Clear domain split between task operations (`convex/tasks.ts`) and sync flows (`convex/sync.ts`, `convex/syncActions.ts`).
- Strong ownership checks (`ownerTokenIdentifier`) across mutations/queries.
- Good request validation with Zod contracts in `convex/httpContracts.ts`.
- Good automated test coverage across route contracts, task logic, and sync behavior.
- MCP bridge structure is straightforward and maps cleanly to HTTP endpoints.

## Risks and Improvement Areas

1. Query parameter encoding in MCP bridge
- In `mcp-server.ts`, some query URLs are built via string interpolation (for example `status` and `date`).
- Recommendation: construct URLs with `URLSearchParams` to avoid malformed params and reduce edge-case bugs.

2. N+1 style patch loops in reorder mutations
- `reorderTasks` and `reorderInboxTasks` patch one by one.
- Acceptable for small lists, but can be a hot path on larger datasets.
- Recommendation: monitor with timing metrics; consider batch abstractions if list sizes grow.

3. API docs drift risk
- Legacy docs had hardcoded deployment URLs and did not always reflect current route auth/behavior.
- Recommendation: keep docs in `docs/` as single source and avoid environment-specific constants.

4. Secret handling hygiene
- Repo history and notes suggest local secret handling iterations.
- Recommendation: rotate OAuth secrets if ever exposed outside local machine and prefer placeholder values in all docs/examples.

## Recommended Next Engineering Tasks

1. Harden MCP URL building
- Replace string-concatenated query URLs with helper utility using `URLSearchParams`.

2. Add focused API smoke tests
- Add a lightweight script or test suite that checks route auth requirements and basic schema validation against a dev deployment.

3. Add docs CI checks
- Add markdown lint and link check in CI to prevent stale docs regressions.

4. Add architecture decision records (ADRs)
- Capture key decisions: ownership model, sync strategy, and separate OAuth callback flows.

## Review Scope

- `README.md`
- `convex/` modules (auth, tasks, sync, HTTP routes/contracts)
- `src/` app composition and Google integration utilities
- `mcp-server.ts`
- existing test coverage shape in `src/test/`
