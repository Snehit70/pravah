# Pravah

This context defines the planning language for the timeline-first personal task manager.

## Language

**Timeline**:
The dated planning surface where scheduled tasks live.
Within a single day, Tasks whose Deadline has a time-of-day are ordered chronologically and shown above date-only Tasks, which keep their manual position.
_Avoid_: calendar, planner

**Inbox**:
The holding area for tasks that do not yet have a deadline.
Inbox tasks are still part of the system and may still be completed.
_Avoid_: backlog, unscheduled list

**Task**:
A unit of planned work that can live on the timeline, in the inbox, or be completed.
_Avoid_: item, todo

**Task Series**:
A set of independent Tasks created together from one numbered title pattern.
The series is a creation convenience and does not remain linked after creation.
_Avoid_: recurring task, repeated task

**Multi-Goal Capture**:
A creation convenience that accepts several Goals and creates one independent Task for each selected Goal.
The resulting Tasks do not synchronize completion, edits, or deletion.
_Avoid_: multi-goal task, shared task

**Deadline**:
The single user-facing date that marks when a task is expected to be completed.
A Deadline may optionally carry a **time-of-day**; without one it is a date-only deadline.
A time-of-day cannot exist without a deadline date. Semantically the Deadline is still a deadline, but the optional time also lets a user mark a moment-in-day event.
Tasks with a deadline appear on the Timeline. Tasks without a deadline live in the Inbox. The Timeline is a single ordered lane keyed by deadline.
_Avoid_: due date, scheduled date

**Reminder**:
A local device notification Pravah raises for a dated Task. A Task whose Deadline has a time-of-day is reminded at that time; a date-only Deadline is reminded at a default morning time the user can change.
_Avoid_: alert, push (this system is local-only, not server push)

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

**Goal Link**:
The association between one Task and one Goal. It gives the Task strategic context without changing the Task's lifecycle or placement.
_Avoid_: task-goal mapping, goal assignment

**Day Strip**:
A horizontal week navigator above the Timeline's day cards. It presents a real calendar week (Sunday–Saturday) and lets the user jump directly to a day. Days that hold tasks are reachable destinations; days without tasks are shown for orientation but are not destinations. The Day Strip always contains the day the user is currently viewing, sliding to a new week when the user crosses a week boundary.
_Avoid_: date picker, calendar bar, week scroller

**Kairo**:
The built-in AI copilot that reasons about schedule and task creation.
_Avoid_: assistant, bot

**Progress**:
The surface that reports on-device statistics derived from a user's Tasks — completion velocity, streaks, and workload — together with the history of Completed Tasks.
_Avoid_: Insights, Stats, Analytics, Dashboard

**OTA Update**:
A JavaScript/asset bundle delivered to an already-installed build over the air, without changing the installed binary. It applies only to builds whose app version matches the bundle's runtime version. This is the "push of UI."
_Avoid_: hot update, code push, patch

**App Update**:
A new native binary (a freshly built, signed APK) carrying a bumped app version, delivered by sideloading because Pravah is not published to any app store. Reaching a new App Update requires installing the binary; it cannot arrive over the air. This is the "push of app updates."
_Avoid_: store update, native update (there is no store)

**Update Check**:
A manual, user-initiated action in the app that asks whether a newer App Update exists and, if so, offers to install it. It does not concern OTA Updates, which arrive on their own.
_Avoid_: auto-update, version check
