# Pravah DevLoop v3 Roadmap (Sync-First)

## Locked Product Decisions

- User model: single user, multi-device.
- Priority: deep sync architecture first, then UI polish.
- Google Calendar direction: one-way import from Google to Pravah.
- Gmail task creation: candidate tasks are created, but require manual approval before becoming real tasks.

## Phase 0 - Stabilize Baseline

Goal: make the current branch reliable before layering sync features.

- Fix build blockers and type errors.
- Keep tests passing.
- Remove obvious docs drift and setup mismatches.
- Record roadmap and decision context in-repo.

Exit criteria:

- `bun test:run` passes.
- `bun run build` passes.

## Phase 1 - Separate Core Architecture

Goal: separate concerns so sync logic is not trapped inside UI components.

- Break orchestration in `src/App.tsx` into focused hooks/modules:
  - task selectors
  - drag/drop commands
  - modal and interaction state
- Move task rules (deadline constraints, scheduling rules) to shared domain utilities and Convex-backed invariants.
- Keep presentational components mostly dumb.

Exit criteria:

- Task rules are defined once and reused across UI + backend.
- App shell is smaller and easier to test.

## Phase 2 - Data Model for Sync

Goal: add persistent sync state for reliability across devices.

- Extend schema with integration-focused tables:
  - `integrations` (connection + status)
  - `syncCursors` (incremental import pointers)
  - `externalTaskMappings` (google event ID -> task ID)
  - `importQueue` / `reviewQueue` (manual approval pipeline)
  - `syncRuns` (run history + errors)
- Add indices for fast lookup by provider/external ID and status.

Exit criteria:

- Import state survives refresh/device change.
- We can inspect what was imported, when, and why.

## Phase 3 - Sync Pipeline (Google Calendar -> Pravah)

Goal: deterministic, idempotent import cycle.

- Build import flow:
  1. Fetch events
  2. Normalize event payload
  3. Deduplicate by external IDs + hash
  4. Upsert mapped tasks
  5. Log run summary + errors
- Handle update/delete semantics from Google.
- Handle all-day events and timezone-safe date conversion.
- Protect manual edits in Pravah using conflict policy.

Exit criteria:

- Re-running sync does not create duplicates.
- Event updates propagate correctly to mapped tasks.

## Phase 4 - Gmail Intake With Manual Approval

Goal: keep automation useful without introducing noisy tasks.

- Pull Gmail candidates via query/label rules.
- Convert candidates into review items (not direct tasks).
- Add approve/edit/reject workflow.
- Persist message/thread linkage for traceability.

Exit criteria:

- No Gmail item becomes an active task without approval.
- Approval decisions are auditable.

## Phase 5 - API + CLI Sync Surface

Goal: expose sync and approval operations for agents/tools.

- Expand HTTP routes and CLI commands for:
  - sync status
  - trigger sync
  - list review queue
  - approve/reject imports
  - inspect mapping/conflicts
- Harden auth/idempotency/error responses.

Exit criteria:

- External agents can run safe workflows without bypassing approval rules.

## Phase 6 - Multi-Device Consistency

Goal: avoid silent conflicts and stale state issues.

- Add deterministic ordering semantics for task moves/reorders.
- Add optimistic UI with reconciliation paths.
- Add conflict markers and user-facing resolution cues where needed.
- Add retry-safe mutation patterns for duplicate submissions.

Exit criteria:

- Near-simultaneous actions from multiple devices converge predictably.

## Phase 7 - UX and Motion Polish

Goal: improve experience after architecture is stable.

- Timeline zoom levels and better pan ergonomics.
- Better loading/empty/error states for sync-heavy screens.
- Motion tuning for drag, modal transitions, and status feedback.
- Sync badges/status indicators in relevant UI surfaces.

Exit criteria:

- Smooth interactions with clear sync state communication.

## Phase 8 - Hardening and Observability

Goal: production-grade confidence.

- Integration tests for sync, mapping, and review workflows.
- E2E coverage for manual approval + timeline behavior.
- Sync logging/metrics and failure monitoring hooks.
- Documentation updates for setup, operation, and failure recovery.

Exit criteria:

- Core sync and approval flows are test-covered and observable.
