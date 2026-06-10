# Pravah

This context defines the planning language for the timeline-first personal task manager.

## Language

**Timeline**:
The dated planning surface where scheduled tasks live.
_Avoid_: calendar, planner

**Inbox**:
The holding area for tasks that do not yet have a deadline.
Inbox tasks are still part of the system and may still be completed.
_Avoid_: backlog, unscheduled list

**Task**:
A unit of planned work that can live on the timeline, in the inbox, or be completed.
_Avoid_: item, todo

**Deadline**:
The single user-facing date that marks when a task is expected to be completed.
Tasks with a deadline appear on the Timeline. Tasks without a deadline live in the Inbox. The Timeline is a single ordered lane keyed by deadline.
_Avoid_: due date, scheduled date

**Scheduled At**:
An immutable timestamp recording when a task was created in Pravah.
It exists for history and statistics, not for planning.
_Avoid_: scheduled date

**Completed At**:
An immutable timestamp recording when a task was marked complete.
It exists for history and statistics, not for planning.
_Avoid_: completion date

**Completed Task**:
A task that has been marked done. Reopening the task clears its completion timestamp and returns it to the Timeline if a deadline exists, otherwise to the Inbox.
_Avoid_: archived task

**Goal**:
A larger outcome that gives tasks strategic direction.
_Avoid_: objective, target

**Kairo**:
The built-in AI copilot that reasons about schedule and task creation.
_Avoid_: assistant, bot
