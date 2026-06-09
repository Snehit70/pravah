## Problem Statement

Pravah's native task model currently splits planning behavior across multiple overlapping fields and flags. The mutable `scheduledDate`, the separate `deadline`, the `status` field, and the `type` field can drift apart and no longer represent a single clear product truth. This creates visible inconsistencies across mobile and web, makes task movement and completion behavior harder to reason about, and makes historical reporting unreliable because planning state and history are mixed together.

From the user's perspective, there should be one planning date for a Task, not two competing date concepts. Historical analytics should come from immutable timestamps, not from reusing a mutable planning field.

## Solution

Redesign native Pravah tasks around one planning date and two immutable history timestamps.

- `deadline` becomes the only planning date for a Task.
- `scheduledAt` becomes an immutable timestamp set when the Task is created in Pravah.
- `completedAt` becomes an immutable timestamp set when a Task is marked complete and cleared when the Task is reopened.

After the migration:

- a Task with no `deadline` and no `completedAt` is in the Inbox
- a Task with a `deadline` and no `completedAt` is on the Timeline
- a Task with `completedAt` is completed
- cancelled Tasks continue to use the existing soft-delete lifecycle and remain out of scope for this redesign

The migration is a one-way cutover for native Pravah tasks only. Existing native task data is rewritten into the new model immediately rather than supporting old and new shapes in parallel.

## User Stories

1. As a Pravah user, I want one date to represent a Task's planned completion date, so that I do not see conflicting date behavior across the app.
2. As a Pravah user, I want Inbox membership to mean "no deadline", so that the difference between Inbox and Timeline is obvious.
3. As a Pravah user, I want Timeline membership to be derived from `deadline`, so that moving a Task on the Timeline updates one source of truth.
4. As a Pravah user, I want to complete Inbox Tasks that have no deadline, so that quick-capture tasks can still be finished without extra planning steps.
5. As a Pravah user, I want completed Tasks to keep their last deadline, so that my past plan is preserved for later review.
6. As a Pravah user, I want reopening a Task to clear its completion history and return it to the right surface, so that recovery from accidental completion is predictable.
7. As a Pravah user, I want a reopened Task with a deadline to return to the Timeline, so that planned work stays planned.
8. As a Pravah user, I want a reopened Task without a deadline to return to the Inbox, so that unplanned work stays unplanned.
9. As a Pravah user, I want clearing a deadline to move a Task back to the Inbox, so that the Task immediately reflects its unplanned state.
10. As a Pravah user, I want historical timestamps to remain stable while I reschedule work, so that analytics are not corrupted by planning edits.
11. As a Pravah user, I want `scheduledAt` to reflect when a Task entered Pravah, so that creation and aging metrics remain trustworthy.
12. As a Pravah user, I want `completedAt` to reflect when a Task was actually completed, so that completion metrics do not depend on whether the Task had a deadline.
13. As a Pravah user, I want the mobile task sheets to edit one planning date, so that add/edit flows do not expose hidden duplicate semantics.
14. As a Pravah user, I want the mobile Timeline and task cards to reflect the new single-date model, so that visible metadata matches behavior.
15. As a Pravah user, I want the web Timeline to be a single ordered lane keyed by deadline, so that the UI no longer implies separate task types with different meanings.
16. As a Pravah user, I want Timeline ordering within a day to be preserved after migration, so that the app feels stable despite the schema change.
17. As a Pravah user, I want all my existing native tasks migrated without losing planning or completion information, so that the redesign does not destroy my history.
18. As a Pravah user, I want previously completed Tasks to receive a best-effort completion timestamp during migration, so that old data still participates in reporting.
19. As a developer, I want task state to be derived from real fields instead of drifting flags, so that future task features are easier to implement safely.
20. As a developer, I want the old native-task fields removed after cutover, so that accidental reads and writes cannot reintroduce the same class of bug.

## Implementation Decisions

- Native Pravah Tasks are the only in-scope records for this migration. Gmail, Calendar, review-queue, and other external import semantics are explicitly deferred.
- `deadline` is the canonical planning field for a native Task. It replaces the old mutable planning role previously carried by `scheduledDate`.
- `scheduledAt` is introduced as an immutable creation timestamp for native Tasks. It is set when a Task is created in Pravah and is never modified by rescheduling, completion, or reopening.
- `completedAt` is introduced as an immutable completion timestamp for native Tasks. It is set when a Task is marked complete and cleared when the Task is reopened.
- Active task placement is derived, not stored as a separate mutable concept:
  - no `deadline` and no `completedAt` means Inbox
  - `deadline` present and no `completedAt` means Timeline
  - `completedAt` present means Completed
- `type` is removed from native Tasks. The presence or absence of `deadline` replaces the old `open` vs `deadline` split.
- The active `status` field is removed from native Tasks for Inbox, Timeline, and Completed derivation. Existing cancellation behavior remains as a special-case lifecycle concern and is not simplified in this round.
- `scheduledDate` is removed from native Tasks after migration. It is not retained as a deprecated field.
- The web Timeline is simplified from separate `OPEN` and `DEADLINE` lanes into a single ordered Timeline keyed by `deadline`.
- The mobile task add/edit surfaces are simplified so the user edits one planning date rather than a mutable planning date plus a second due-date concept.
- Timeline ordering behavior is preserved, but day grouping and reorder operations are keyed by `deadline` instead of `scheduledDate`.
- Reopen behavior becomes deterministic:
  - clear `completedAt`
  - if `deadline` exists, the Task returns to the Timeline
  - otherwise, the Task returns to the Inbox
- Clearing a Task's `deadline` moves it back to the Inbox without changing `scheduledAt`.
- The migration is one-way and immediate. The application does not support old and new native-task shapes side-by-side.
- Existing native task data is backfilled as follows:
  - old `scheduledDate` is copied into `deadline`
  - `scheduledAt` is backfilled from `createdAt`
  - `completedAt` is backfilled only for Tasks already completed
  - for previously completed Tasks with no explicit completion timestamp, `updatedAt` is used as the best available approximation
- Existing cancellation markers and the soft-delete grace-window flow remain untouched unless they need strictly mechanical compatibility updates caused by the schema change.
- The migration should include an explicit native-task rewrite path that is safe to run once and leaves no native records depending on `scheduledDate`, `status`, or `type`.

## Testing Decisions

- Good tests should assert external behavior and migrated outcomes rather than implementation details. They should verify how Tasks appear in Inbox, Timeline, and Completed surfaces, how mutations rewrite fields, and how migration preserves historical information.
- The highest-value backend seam is the native task query/mutation surface that currently owns add, move, complete, reopen, unschedule, reorder, and timeline derivation behavior. Tests should verify that the new derived-state model produces the correct visible Task collections and mutation outcomes.
- The highest-value migration seam is a dedicated migration entry point that rewrites representative native task records into the new shape. Tests should cover Inbox tasks, Timeline tasks, completed tasks, tasks with no prior planning date, and reopened tasks after migration.
- The highest-value mobile seam is the task creation/editing flow plus task-list derivation. Tests should verify that mobile add/edit forms write a single planning date, that clearing a deadline moves a Task into Inbox, and that reopening routes the Task back to the correct surface.
- The highest-value web seam is Timeline derivation and rendering. Tests should verify that a single Timeline keyed by deadline replaces lane-based rendering without changing per-day ordering semantics.
- Historical analytics tests should verify that:
  - `scheduledAt` is stable across deadline edits
  - `completedAt` is written on complete
  - `completedAt` is cleared on reopen
  - completed Tasks retain their last `deadline`
- Prior art already exists in the current task-mutation, task-query, timeline-screen, task-sheet, and overdue-reflow test suites. Those seams should be reused and updated instead of introducing low-level implementation-detail tests.

## Out of Scope

- Gmail import behavior
- Google Calendar import behavior
- Review-queue semantics
- Reinterpreting or redesigning external provider fields
- Broader cancellation/soft-delete redesign beyond compatibility fixes required by the native task schema cutover
- New analytics dashboards or reporting features built on top of `scheduledAt` / `completedAt`
- Recurring tasks, subtasks, reminders, or other unrelated task-model expansions

## Further Notes

- This change is intentionally domain-first. The main goal is to remove ambiguity from the native task model before expanding related features.
- Because the migration is destructive with respect to old field names, rollout should prioritize explicit validation over backward-compat branching.
- The cutover should preserve the user's visible planning data first and treat historical completion backfill as best-effort where exact timestamps do not already exist.
