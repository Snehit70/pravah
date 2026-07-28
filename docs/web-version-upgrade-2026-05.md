# Web Version Upgrade (May 2026)

Status: merged to `main` via PR #54.

This document is the source of truth for what changed in the web client during
the May 2026 parity push and what remains open.

## Delivered Scope

1. Insights parity
- Added a first-class `Insights` page to the web shell.
- Added `Stats` and `Completed` modes for backlog/completion visibility.
- Wired through existing task data in `AuthenticatedApp`.

2. Kairo provider/runtime parity
- Added provider-profile based Kairo config (`openai`, `anthropic`, `gemini`).
- Added migration from legacy single-provider settings.
- Added Gemini runtime request/response handling parity.

3. Goals and linking parity
- Added server-backed goals + goal-link read model in web.
- Added linked-goal badge rendering in Timeline and Inbox task rows.
- Added TaskPopup goal picker and save flow.
- Added partial-failure behavior when task update succeeds but goal-link save fails.

4. Server-backed web goals CRUD
- Long-term Goals page now supports backend create/delete in web.
- Goal progress bars are derived from task-link state and completion status.

5. Task workflow parity
- Timed tasks are supported in web capture, task editing, Inbox rows, and Timeline rows.
- Inbox has priority filters, multi-select completion/deletion, schedule-to-date controls, and recoverable bulk delete.
- Overdue Timeline tasks have an action-first rescheduling drawer.

6. Progress, goals, and workspace controls
- Progress includes momentum bars, streaks, work-rhythm summaries, goal progress, and searchable completion history.
- Server-backed goals expose editable description, deadline, priority, and linked next-task previews.
- Web settings expose truthful reduced-motion, browser notification/test, and task-export controls.

## Runtime Flags

Server-backed goals/linking mode on web is enabled by default and can be controlled by:

- Env: `VITE_FF_WEB_GOALS_LINKING=1`
- Local override: `localStorage['pravah:ff:web-goals-linking']`

When explicitly disabled with `VITE_FF_WEB_GOALS_LINKING=0` or the local override `0`:
- Web falls back to legacy local goals behavior.

When enabled:
- Convex goals + goalLinks are the source of truth.
- Long-term goals page uses server-backed read/write mode.

## Key Files (Web)

- `src/components/AuthenticatedApp.tsx`
- `src/components/InsightsPage.tsx`
- `src/components/LongTermGoalsPage.tsx`
- `src/components/TaskPopup.tsx`
- `src/components/Timeline.tsx`
- `src/components/DayColumn.tsx`
- `src/components/InboxSidebar.tsx`
- `src/lib/kairoConfig.ts`
- `src/lib/kairoProviderRuntime.ts`
- `src/lib/featureFlags.ts`

## Validation Coverage

Added or updated tests:

- `src/test/InsightsPage.test.tsx`
- `src/test/kairoConfig.test.ts`
- `src/test/kairoProviderRuntime.test.ts`
- `src/test/LongTermGoalsPage.test.tsx`
- `src/test/TaskPopup.test.tsx`
- `src/test/InboxSidebar.test.tsx`
- `src/test/AppFlow.test.tsx`
- `src/test/accessibilityRegression.test.tsx`

## Known Follow-Ups

1. Add e2e cross-client consistency checks (web action -> mobile reflects change).
2. Add structured frontend telemetry for goal-link failure paths.
3. Consider a service-worker-backed reminder scheduler for background web delivery; the current browser reminder loop requires the tab to stay open.

## Mobile Relationship

Web and mobile were implemented on separate branches with non-overlapping
commit stacks. Shared backend concepts (goals, links, providers) were mapped
through platform-specific codepaths.
