# Mobile Task Inspector — Compact Workbench

This document records the approved interaction and visual contract for Pravah's mobile task inspector. It is the implementation reference for active Inbox tasks, active Timeline tasks, Goal-linked tasks, and completed task history.

## Product model

The surface is a **task inspector with direct editing affordances**, not a permanent form and not a separate full-screen editor.

- At rest, the task reads like content.
- Tapping a field edits that field directly or enters a focused picker mode.
- Changes are staged locally.
- A flat sticky footer changes to **Discard / Save changes** only while the draft differs from the committed task.
- Saving commits the draft and keeps the inspector open.

## Shell

- Adaptive bottom sheet that hugs content and expands when editing, searching, or showing the keyboard.
- Soft blur with minimal dimming preserves source context.
- Drag handle plus explicit utility header: Close, `TASK`, overflow.
- Android Back and swipe-down leave a focused picker first; clean inspectors close; dirty inspectors require discard confirmation.
- Footer remains keyboard-aware and above the safe-area inset.

## Information hierarchy

1. Utility header.
2. Title as a heading. The full title area is tappable and exposes an inline editor with a pencil cue.
3. Quiet state line: `INBOX TASK`, `PLANNED · …`, or `COMPLETED · …`.
4. Notes as readable content at rest; tap to enter an auto-growing multiline editor.
5. One structured Planning block with rows for When, Priority, and Goal.
6. Sticky state-aware action footer.

Empty values are explicit states: `Inbox`, `No priority`, `No goal`, and `Add notes`.

## Focused picker modes

The sheet transforms in place rather than stacking another task sheet.

### When

- Inbox, Today, Tomorrow, custom date, and optional time.
- Date and time are presented as one value.
- Clearing the schedule removes both date and time and stages a move to Inbox.
- Schedule and Move to Inbox footer shortcuts use the same staged draft model.

### Priority

- Visible options: No priority, P1 — High, P2 — Medium, P3 — Low.
- No tap-to-cycle behavior.
- Semantic color supports the text label but never replaces it.

### Goal

- Dedicated searchable picker.
- `No goal` is a first-class option.
- Selection returns to the inspector and remains staged until Save.
- The Goal is shown only once in the inspector.

## Action hierarchy

Clean active task:

- Inbox: **Schedule** / **Complete**.
- Timeline: **Move to Inbox** / **Complete**.

Dirty task:

- **Discard** / **Save changes**.
- Completion and scheduling actions are hidden until the draft is resolved.

Completed task:

- Read-only title, Notes, Planning values, and completion context.
- Single **Reopen task** footer action.
- Editing becomes available only after reopening.

Rare and destructive actions live in overflow:

- Task details.
- Delete task.
- Completed task may also expose View linked Goal.

Delete confirmation must describe recoverability accurately: the task can be restored for 30 minutes. It must never say that the action cannot be undone.

## Save, close, and failure behavior

- Save disables duplicate submissions.
- Success updates the committed baseline, clears the dirty state, and keeps the sheet open.
- Failure preserves the entire draft and shows an inline retryable error.
- Closing a dirty task asks only: Keep editing or Discard changes.
- Complete and Reopen remain immediate state actions, close the inspector, and rely on the existing app-level Undo feedback.

## Visual direction

Use the approved **Compact Workbench** direction:

- balanced density;
- compact 44pt+ rows;
- one Planning container with subtle hairline dividers;
- warm Pravah surfaces and restrained accent use;
- no giant capsules, excessive cards, gradients, or decorative chrome;
- title and Notes receive more visual weight than metadata;
- footer is flat and structurally anchored rather than floating.

## Regression expectations

Tests should cover:

- readable resting state and explicit title editing;
- staged draft and save-without-close;
- explicit priority selection;
- searchable Goal selection;
- staged Move to Inbox / scheduling behavior;
- dirty-close protection;
- completed read-only state and Reopen;
- recoverable deletion copy.
