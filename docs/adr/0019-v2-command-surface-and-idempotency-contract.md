---
status: accepted
---

# V2 command surface and idempotency contract

V2 uses `tasks list/show/add/edit/complete/reopen/schedule/unschedule/remove`, `goals list/show/add/edit/remove`, `operations list/show/undo`, and `auth login/logout/status`. Task collection filters compose through Goal, priority, tag, status, exact date, date bounds, and all-active selection. `agent task` is removed: `tasks show <target> --json` is the focused read for every caller.

Every write carries an idempotency key. Pravah generates one by default; a caller-stable `--idempotency-key` remains optional and is the explicit choice for safe retries across separate invocations. Help and capabilities must describe this transport guarantee accurately.
