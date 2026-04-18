# Mobile Roadmap

Last updated: 2026-04-18

## Scope decisions

Approved for near-term planning:

- Mobile settings entry for Google Calendar and Gmail sync
- Notifications and reminder system
- Task priority on mobile and priority-aware ordering
- Drag-and-drop on mobile

Explicitly deferred:

- Recurring tasks
- Voice capture and assistant shortcuts
- Tags and duration on mobile
- Subtasks and checklists
- Focus mode / Pomodoro
- Smart daily suggestions
- Location-based reminders
- Habit layer
- Widgets and lock screen surfaces

## Product direction

Pravah mobile should stay focused on three core jobs:

1. Capture quickly
2. Triage and schedule clearly
3. Stay reliable when offline

That means the next features should strengthen the existing mobile workflow instead of expanding the app into a broad productivity suite.

## Plan

### Phase 1: Settings and sync

Goal:
- Add a dedicated mobile settings surface for Google Calendar sync, Gmail review sync, and account actions.

UX direction:
- Replace the current text-only `Sign out` header action with a compact icon button in the top-right header.
- Tapping it should open a bottom sheet, not a full-screen page.
- Reason: the app already uses bottom sheets for add/edit task flows, so this keeps interaction patterns consistent and avoids navigation overhead.

Settings sheet sections:
- Integrations
- Notifications
- Account

Integrations section:
- Google Calendar row with connection state, sync toggle, and `Sync now` action
- Gmail row with connection state, sync toggle, and pending review count badge
- Optional `Review queue` action when Gmail has pending items
- Last synced time and error state when available

Implementation notes:
- Reuse `@gorhom/bottom-sheet` for the settings surface.
- Add mobile-facing Convex queries/actions for:
  - integration status
  - sync run status
  - Gmail review queue count and list
  - manual Google Calendar sync trigger
- Keep account actions in the same sheet, including sign out.

### Phase 2: Notifications and reminders

Goal:
- Add reminders that are useful for scheduled and deadline tasks without overcomplicating the first version.

First release:
- Per-task reminder toggle when creating or editing a task
- Time-based reminders only
- Local notifications first
- Basic reminder presets:
  - at time of task
  - 10 minutes before
  - 1 hour before
  - 1 day before

Why local notifications first:
- Lower implementation risk
- Works for single-user flow
- Lets us prove the reminder UX before adding remote push complexity

Data changes:
- Add reminder metadata to tasks or a dedicated reminders table
- Store reminder status so edits and cancellations stay correct

Technical direction:
- Use `expo-notifications`
- Request permission from inside the Notifications section in settings, not on first launch
- Create Android channels before token/permission flows

Second release:
- Daily planning reminder
- Overdue summary reminder
- Notification tap should deep-link into the relevant task or tab

### Phase 3: Priority

Goal:
- Let users mark task importance and use it to improve ordering.

Product behavior:
- Add priority at task creation and edit time
- Recommended scale:
  - P1
  - P2
  - P3
  - none

Ordering rule:
- Within a list, tasks sort by priority first and manual order second
- Tasks with no priority fall after prioritized tasks

Important constraint:
- We should not silently destroy manual ordering
- Best approach is to keep two dimensions:
  - priority bucket
  - position within bucket

Schema direction:
- Add `priority` to tasks
- Keep existing `position`
- Update reorder logic so drag-and-drop can persist correct order within priority groups

UX direction:
- Show priority chips in add/edit sheets
- Show a small priority marker on task cards

### Phase 4: Drag-and-drop

Goal:
- Make mobile scheduling feel closer to Pravah's timeline identity.

First release:
- Drag to reorder inside Inbox
- Drag to reorder inside a single Timeline day section

Second release:
- Drag across Timeline day sections
- Drag between Inbox and Timeline

Why split it:
- Cross-section dragging is much harder than single-list dragging
- A staged rollout lowers risk and gets usable value into the app sooner

Interaction model:
- Long press on a task card enters drag mode
- Haptics on drag start and drop
- Placeholder card during movement
- Optimistic reorder with mutation persistence

Technical direction:
- Use a drag-enabled list that works with React Native Gesture Handler and Reanimated
- Start with single-list drag support
- Validate performance before attempting nested multi-section drag

Backend work:
- Reuse existing reorder mutations where possible
- Extend them only when cross-section movement requires richer payloads

## Suggested implementation order

1. Settings sheet and sync controls
2. Notification infrastructure and local reminders
3. Priority field and ordering rules
4. Inbox drag-and-drop
5. Timeline intra-day drag-and-drop
6. Cross-day drag-and-drop

## Future backlog

Keep these documented but out of current implementation scope:

- Subtasks and checklists
- Widgets and lock screen surfaces
- Recurring tasks
- Smart daily suggestions
- Tags and duration on mobile
- Voice capture
- Focus mode
- Location reminders
- Habit layer

## Risks to watch

- Settings can become too dense if sync, notifications, and account actions are all mixed without clear grouping.
- Reminder systems are easy to ship incorrectly if task edits do not cancel and recreate scheduled notifications reliably.
- Priority can fight drag-and-drop if ordering rules are not defined upfront.
- Cross-section drag-and-drop can become visually unstable if attempted before single-list drag is solid.

## Recommended milestone definition

Milestone A:
- Settings bottom sheet
- Google Calendar and Gmail toggles
- Sync now action
- Gmail review queue visibility

Milestone B:
- Local task reminders
- Notification permissions flow
- Reminder editing and cancellation

Milestone C:
- Priority field
- Priority-aware list ordering
- Priority UI in task card and sheets

Milestone D:
- Inbox drag-and-drop
- Timeline same-day drag-and-drop

Milestone E:
- Cross-day drag-and-drop
