---
status: accepted
---

# CLI task-list presentation contract

Human task lists use compact `DUE / PRI / TASK` rows by default and expose extended detail only through `--long`. `--all` means all active tasks, not historical work. Ordering reflects planning urgency: overdue work is priority-first then oldest due date; Today is timed work by time then priority with untimed work last; Upcoming is nearest date/time then priority. Colour is optional TTY decoration and must never carry meaning unavailable in plain text.

Agent context follows the same 14-day upcoming horizon, returns at most three task summaries per urgency group, and represents Inbox only as a count. This avoids duplicates and keeps one-call context bounded.

## Considered options

- **Show all metadata by default.** Rejected because it turns terminal planning into an unreadable record dump.
- **Sort one way everywhere.** Rejected because an overdue backlog, today’s timed work, and a future schedule answer different planning questions.
- **Use colour as the only priority signal.** Rejected because redirected and no-colour terminals must remain equally understandable.
