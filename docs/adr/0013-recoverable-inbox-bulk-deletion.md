---
status: accepted
---

# Recoverable Inbox bulk deletion

Inbox selection exposes a direct red `Delete {num} tasks` action beside the accent `Mark {num} done` action. Delete is recoverable rather than permanent: one atomic operation removes the selected Inbox tasks, the selection closes on success, and one Undo atomically restores the batch within the 30-minute recovery window.

The confirmation remains title-only (`Delete {num} tasks from your inbox?`). Undo restores every task to the end of its original priority section while preserving the batch's relative order. A stale selection fails as a whole rather than partially changing the Inbox; this keeps the grouped Undo truthful. The Undo toast remains visible for five seconds. Cancelled tasks are eligible for physical cleanup after the 30-minute recovery window, and restoration only succeeds while the batch remains recoverable.

## Considered options

- **Permanent bulk deletion.** Rejected because Inbox triage mistakes should be recoverable and the product already supports recoverable deletion in overdue triage.
- **One deletion request per task.** Rejected because network or concurrency failures could produce a partial batch that cannot be represented by one truthful Undo.
- **Hidden overflow action.** Rejected because bulk deletion is an essential selection-mode action; confirmation is the safety boundary.
