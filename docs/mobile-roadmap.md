# Mobile Roadmap

Last updated: 2026-05-16

## Scope decisions

Approved for near-term planning:

- Mobile settings entry for Google Calendar and Gmail sync ✅ shipped
- Notifications and reminder system ✅ shipped
- Task priority on mobile and priority-aware ordering ✅ shipped
- Drag-and-drop on mobile — in progress (blocked, see Phase 4)

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

### Phase 1: Settings and sync ✅ Shipped

Goal:
- Add a dedicated mobile settings surface for Google Calendar sync, Gmail review sync, and account actions.

**Status: complete.** The settings bottom sheet exists with four sections:
Assistant (Kairo), Sync (Google Calendar + Gmail), Alerts (notifications), and
Account. Section jump chips are wired to scroll offsets and stay in sync with
manual scroll position. Integration status queries drive the Sync section.

### Phase 2: Notifications and reminders ✅ Shipped

Goal:
- Add reminders that are useful for scheduled and deadline tasks without overcomplicating the first version.

**Status: complete.** `useNotificationsSettings` owns permission state, daily
reminder toggle (9:00 AM), and test notification dispatch. Notification channels
are initialized on first mount. Permission is requested from the Alerts section
in settings, not on first launch. `expo-notifications` handles local scheduling.

### Phase 3: Priority ✅ Shipped

Goal:
- Let users mark task importance and use it to improve ordering.

**Status: complete.** Tasks have `priority: "p1" | "p2" | "p3" | undefined`.
`InboxScreen` groups tasks into named priority buckets (P1 → P2 → P3 →
Unprioritized) with section headers. `useTaskQueries` sorts by priority rank
first, then `position`. Priority chips are present in `AddTaskSheet`,
`EditTaskSheet`, and `TaskMetaFields`.

### Phase 4: Drag-and-drop — blocked

Goal:
- Make mobile scheduling feel closer to Pravah's timeline identity.

**Status: blocked.** `react-native-draggable-flatlist@4.0.3` silently renders
blank under `react-native-reanimated@4.x` — the list header and FAB appear but
the row area is empty. Drag handlers (`handleInboxDragEnd`,
`handleTimelineDragEnd`) exist in `useTaskMutations` but are disabled in the
UI. Long-press currently does nothing.

Resume when the drag library ships Reanimated 4 compatibility or when an
alternative library is validated. See `DEBUGGING.md` for the symptom checklist.

First release (still to ship):
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

1. ~~Settings sheet and sync controls~~ ✅
2. ~~Notification infrastructure and local reminders~~ ✅
3. ~~Priority field and ordering rules~~ ✅
4. Inbox drag-and-drop ← current focus (blocked on library compat)
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

- Reminder systems are easy to ship incorrectly if task edits do not cancel and recreate scheduled notifications reliably.
- Priority can fight drag-and-drop if ordering rules are not defined upfront — the current bucketed-header approach in Inbox must be preserved when drag is re-enabled so P1 tasks cannot be dragged into the P3 bucket.
- Cross-section drag-and-drop can become visually unstable if attempted before single-list drag is solid.
- The drag library pin (`react-native-draggable-flatlist@4.0.3`) must be co-validated with `react-native-reanimated` and `@gorhom/bottom-sheet` as a set before upgrading.

## Recommended milestone definition

Milestone A: ✅ complete
- Settings bottom sheet
- Google Calendar and Gmail toggles
- Sync now action
- Gmail review queue visibility

Milestone B: ✅ complete
- Local task reminders
- Notification permissions flow
- Reminder editing and cancellation

Milestone C: ✅ complete
- Priority field
- Priority-aware list ordering
- Priority UI in task card and sheets

Milestone D: blocked (library compat)
- Inbox drag-and-drop
- Timeline same-day drag-and-drop

Milestone E: not started
- Cross-day drag-and-drop
