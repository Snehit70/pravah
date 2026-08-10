---
status: accepted
---

# Compact mobile Timeline attention order

The mobile Compact Timeline uses one overdue review entry followed by Today and future date groups. Each date group is a contiguous paper surface with one leading completion checkbox per task, a tappable row for editing, and optional one-line context metadata. This keeps overdue triage distinct from scheduled work and makes the vertical mode fast to scan without changing the horizontal carousel.

## Consequences

- The overdue review entry is the only Compact Timeline representation of overdue tasks.
- Today progress counts active and completed tasks whose deadline is Today, so completion does not shrink the denominator.
- Future groups retain the existing Later valve after the initial visible groups.
