---
status: accepted
---

# V2 query, Goal, and diagnostic contract

V2 Task filters use comma-separated OR matching for priority and tags; date bounds are strict and exact-date filtering is explicit. Goals sort by priority, then due date, then name, and Goal detail shows active linked Tasks while historical work remains counts. Operations default to the latest 20 entries, newest first, with actionable Undo availability.

Errors are concise by default; `--debug` appends sanitized remote diagnostics on stderr and JSON retains structured details. Doctor reports every prerequisite and exits non-zero if any fail without changing local or remote state. `--json` and `--long` are mutually exclusive so machine and human output modes remain unambiguous.

## Considered options

- **Inclusive `before`/`after`.** Rejected because inclusive bounds make adjacent date queries overlap unexpectedly.
- **All Goal history in Goal detail.** Rejected because it buries the active planning surface.
- **Always print diagnostics.** Rejected because backend detail is noisy, costly, and can be inappropriate for default terminal output.
