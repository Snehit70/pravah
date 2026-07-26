---
status: accepted
---

# Prioritized task horizon and attention views

`pravah tasks list` is a bounded planning horizon: overdue work, work due today, and the next 14 calendar days, followed by the Inbox count. `pravah inbox`, `pravah today`, `pravah overdue`, and `pravah upcoming` are dedicated attention views; Today excludes overdue work. This keeps default terminal output actionable while preserving an explicit `--all` escape hatch for exhaustive active-task inspection.

## Considered options

- **List all active tasks by default.** Rejected because a large Inbox and distant Timeline entries bury urgent work.
- **Merge overdue tasks into Today.** Rejected because the two states have different planning meaning and each needs an unambiguous command.
