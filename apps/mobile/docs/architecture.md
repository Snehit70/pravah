# Mobile Architecture

This document describes the current architecture of Pravah's Expo / React Native app.

It is intentionally specific to the mobile client. Repo-level docs describe the
product and backend broadly; this file explains how the mobile shell is actually
wired today.

## Goals

The current mobile architecture is optimized for four things:

1. Stable tab switching without blank lists
2. Isolated failures so one broken tab does not kill the whole app
3. Clear ownership boundaries between session state, query state, and mutation state
4. Android-safe bottom-sheet editing for settings and task sheets

## Auth and Session Model

Auth is intentionally split into two layers:

1. `useGoogleAuth` handles sign-in/sign-out transactions and user-facing auth actions.
2. `useWorkspaceState` consumes resolved Better Auth session state and drives shell transitions.

Recent hardening (May 2026):

- sign-out retries with bounded attempts
- timeout guard per sign-out attempt
- sign-in blocked while sign-out is in-flight
- structured diagnostics events for auth success/failure paths

See `auth-flow.md` for the exact transaction sequence and diagnostics event map.

## Top-Level Structure

```text
apps/mobile/
├── App.tsx
├── DEBUGGING.md
├── MOBILE_TESTING.md
├── src/
│   ├── components/
│   │   ├── AddTaskSheet.tsx       — Capture modal (centered Modal, not BottomSheet)
│   │   ├── BootScreen.tsx
│   │   ├── BottomTabBar.tsx
│   │   ├── BrandMark.tsx
│   │   ├── CompletionLineChart.tsx
│   │   ├── ConfirmDialog.tsx      — Theme-matched confirm overlay with BlurView backdrop
│   │   ├── DiagnosticsPanel.tsx
│   │   ├── EditTaskSheet.tsx      — Edit task modal (centered Modal, not BottomSheet)
│   │   ├── FAB.tsx                — Capture pill button with layered glow
│   │   ├── FlowingWaves.tsx
│   │   ├── GmailReviewSection.tsx
│   │   ├── GridBackground.tsx
│   │   ├── Kairo.tsx
│   │   ├── KairoChatList.tsx
│   │   ├── KairoMarkdown.tsx
│   │   ├── KairoSettingsSection.tsx
│   │   ├── LoadingSkeleton.tsx
│   │   ├── MobileAuthScreen.tsx
│   │   ├── RippleRings.tsx
│   │   ├── RootErrorBoundary.tsx
│   │   ├── ScreenErrorBoundary.tsx
│   │   ├── SettingsSheet.tsx
│   │   ├── TaskCard.tsx
│   │   ├── TaskMetaFields.tsx
│   │   ├── TaskTabContent.tsx
│   │   └── TimelineSectionHeader.tsx
│   ├── hooks/
│   │   ├── useConfirm.ts              — Imperative confirm dialog hook
│   │   ├── useConvexGoalsSync.ts      — Syncs Convex goals/links → local stores; migrates on first run
│   │   ├── useGoalMutations.ts        — Wraps goal add/delete/setLink/clearAll for Convex + local
│   │   ├── useGoals.ts                — useSyncExternalStore wrappers around goalsStore and goalLinksStore
│   │   ├── useGoogleAuth.ts
│   │   ├── useIncrementalRowCount.ts
│   │   ├── useIntegrationsSettings.ts
│   │   ├── useKairoChats.ts
│   │   ├── useKeyboardInset.ts
│   │   ├── useNotificationsSettings.ts
│   │   ├── useReducedMotion.ts
│   │   ├── useRetryQueue.ts
│   │   ├── useTaskMutations.ts
│   │   ├── useTaskQueries.ts
│   │   ├── useUserPreferences.ts
│   │   ├── useWorkspaceSnapshot.ts
│   │   └── useWorkspaceState.ts
│   ├── screens/
│   │   ├── CompletedScreen.tsx
│   │   ├── GoalsScreen.tsx        — Long-horizon goals list with detail modal and progress bars
│   │   ├── InboxScreen.tsx
│   │   ├── InsightsScreen.tsx
│   │   ├── StatsScreen.tsx
│   │   └── TimelineScreen.tsx
│   ├── lib/
│   │   ├── auth-client.ts
│   │   ├── convex.tsx
│   │   ├── dataReset.ts
│   │   ├── dates.ts
│   │   ├── deviceIdentity.ts
│   │   ├── goalLinks.ts           — In-memory pub/sub cache for task→goal links (backed by Convex)
│   │   ├── goalsStorage.ts        — In-memory pub/sub cache for goals (backed by Convex)
│   │   ├── haptic.ts              — Semantic haptic helpers: light/medium/heavy/success/error/warning
│   │   ├── kairoActions.ts
│   │   ├── kairoApi.ts
│   │   ├── kairoChatStorage.ts
│   │   ├── kairoConfig.ts
│   │   ├── logger.ts
│   │   ├── notifications.ts
│   │   ├── retry-queue-storage.ts
│   │   ├── retry-queue-utils.ts
│   │   ├── settingsSections.ts
│   │   ├── statsAggregators.ts
│   │   ├── task-form.ts
│   │   ├── task-optimistic.ts
│   │   ├── userPreferences.ts
│   │   └── workspace-snapshot.ts
│   ├── theme/
│   │   └── tokens.ts
│   └── test/
│       ├── addTaskSheet.test.tsx
│       ├── completedScreen.test.tsx
│       ├── editTaskSheet.test.tsx
│       ├── inboxScreen.test.tsx
│       ├── kairo.test.tsx
│       ├── kairoConfig.test.ts
│       ├── kairoSettingsSection.test.tsx
│       ├── mobileStateUtils.test.ts
│       ├── screenErrorBoundary.test.tsx
│       ├── settingsSections.test.ts
│       ├── timelineScreen.test.tsx
│       ├── useRetryQueue.test.ts
│       ├── useTaskMutations.test.ts
│       ├── useTaskQueries.test.ts
│       ├── useTaskQueriesGating.test.ts
│       └── workspaceSnapshot.test.ts
└── docs/
    ├── README.md
    ├── architecture.md
    └── ux-orchestration.md
```

## Shell Responsibilities

`App.tsx` is now an orchestrator instead of a monolithic app implementation.

It should own:

- app launch gate (`LaunchGate`)
- global providers (`ConvexClientProvider`)
- global crash fallback (`RootErrorBoundary`)
- header chrome and tab selection
- overlay mounting (`AddTaskSheet`, `EditTaskSheet`, `Kairo`, `SettingsSheet`)
- wiring between hooks and screen components

It should not re-implement complex query derivation or long-lived session/bootstrap logic.

## State Ownership

### 1. Workspace state - `useWorkspaceState.ts`

This hook is the mobile source of truth for app-level state that spans tabs or overlays.

It owns:

- Better Auth session via `authClient.useSession()`
- cached-session hint via `hasCachedAuthSessionHint()`
- bootstrap readiness (`storeUser`, `claimLegacyData`) for background reconciliation
- `isDataBootstrapReady` flag that gates task-action readiness (set to `true` once both bootstrap mutations complete)
- active tab
- refresh flag
- pending mutation count
- toast lifecycle and timeout clearing
- optimistic task override reset when pending mutations drain
- open/close state for add sheet, edit sheet, settings, and Kairo activity

This separation matters because task queries should not also be responsible for session bootstrapping or toast timing.

### 1a. Workspace snapshot - `useWorkspaceSnapshot.ts`

This hook owns the non-blocking boot cache used for the mobile shell.

It is responsible for:

- hydrating the last known inbox / timeline / completed lists from device storage
- showing that snapshot while Better Auth session validation and first task queries are still in flight
- persisting a bounded fresh snapshot after the live queries resolve
- clearing the snapshot when the session is known to be gone

This is what turns mobile boot from a blocking transaction into a staged handoff:

```text
launch gate
-> optimistic shell
-> brief BootScreen crossfade overlay
-> cached workspace snapshot (if present)
-> live Convex data reconciles in background
-> auth failure falls back to sign-in later if needed
```

`LaunchGate` owns that handoff. Once fonts and the SecureStore-backed auth cache
are ready, it renders the real shell immediately and fades the branded boot
surface out over the first frame so startup still feels intentional instead of
cutting abruptly from splash to content.

Snapshot caps are applied before persist: 120 inbox tasks, 160 scheduled tasks,
120 completed tasks (`workspace-snapshot.ts: prepareWorkspaceSnapshotForPersist`).
A monotonic clear token prevents race conditions where an in-flight hydration read
could resurrect a snapshot after sign-out.

### 2. Query state - `useTaskQueries.ts`

This hook owns all task subscriptions and the pure derivation of task lists.

It subscribes to:

- inbox tasks
- timeline tasks
- completed tasks
- task counts
- all tasks (only when Kairo needs full context)

Important rules:

- Inbox / timeline / completed queries remain active whenever the user is authenticated.
- They are not gated on the current tab.
- This avoids a regression where switching tabs caused the previous tab to drop to `undefined` and briefly render as blank.

Derived outputs include:

- `inboxTasks`
- `scheduledTasks`
- `completedTasks`
- `allWorkspaceTasks`
- `timelineSections`
- `inboxCount`, `timelineCount`, `overdueCount`, `thisWeekCount`, `completedCount`
- `today`, `tomorrow`, `weekEnd`
- loading flags: `isInboxLoading`, `isTimelineLoading`, `isCompletedLoading`, `isAllTasksReady`

### 3. Mutation state - `useTaskMutations.ts`

This hook owns task-changing actions and optimistic list updates.

It handles:

- mark done
- move to today
- send back to inbox
- reopen completed task
- save edits
- inbox reorder *(currently disabled in the UI — see "List rendering" below)*
- timeline reorder *(currently disabled in the UI — see "List rendering" below)*
- within-day timeline shift actions

It does not own the session, Kairo settings, or notification settings.

### 4. Integrations settings - `useIntegrationsSettings.ts`

Owns Google Calendar and Gmail sync toggle state, sync-busy flags, and calendar
sync actions. Exposes `pendingGmailReviewCount` derived from the integration
status query.

### 5. Notifications settings - `useNotificationsSettings.ts`

Owns permission state, daily reminder toggle, and test notification dispatch.
Bootstraps notification channels on first mount via `initializeNotificationsAsync`.

### 6. Incremental row budget - `useIncrementalRowCount.ts`

Shared hook used by all three task-list screens. Releases rows in timed batches
to prevent large workspaces from blocking the JS thread on first paint:

- first paint: `INITIAL_INCREMENTAL_ROWS` (24)
- follow-up batches: 24 rows every 32ms until all rows are released
- live updates (task added/completed while scrolled deep) preserve the existing
  budget rather than collapsing back to 24

### List rendering

Inbox and Timeline render with plain `FlatList`. Drag-to-reorder via
`react-native-draggable-flatlist` is wired through the mutation layer but
disabled in the UI: the library is not compatible with
`react-native-reanimated@4` and rendered the lists as silently blank
(headers visible, list area empty). Re-enable only after the drag library
catches up to Reanimated 4 — see `apps/mobile/DEBUGGING.md`.

## Inbox Priority Bucketing

`InboxScreen` groups tasks into named priority sections before rendering.
`buildInboxRows()` produces a mixed `InboxRow[]` list of `{ kind: "header" }`
and `{ kind: "task" }` entries. Bucket order is always P1 → P2 → P3 →
Unprioritized; empty buckets are omitted.

Tasks arrive pre-sorted from `useTaskQueries` (priority rank first, then
`position`), so the grouping pass is a single O(n) scan — no secondary sort.

Section headers render as quiet muted labels above each group, matching the
timeline's date-section header style.

## Query Lifetime Model

### Old failure mode

```text
Active tab changes
-> inactive tab query is skipped
-> skipped query returns undefined
-> switching back briefly renders empty state or blank list
```

### Current model

```text
Authenticated user
-> inbox query stays live
-> timeline query stays live
-> completed query stays live
-> switching tabs reads warm Convex cache
```

## Timeline Window

The mobile timeline intentionally queries only a bounded upper window, and
deliberately omits a lower bound to surface overdue tasks.

Current behavior:

- `today` = local current day
- `weekEnd` = `today + 6 days`
- timeline query passes **only `endDate` = weekEnd** — `startDate` is omitted
- tasks scheduled before `today` (overdue) are still surfaced so the user
  cannot silently lose backlog items by switching to mobile
- tasks after `weekEnd` are excluded — those live beyond the active mobile horizon

Why no lower bound:

- Bounding with `startDate = today` would silently hide overdue items
- The mobile timeline header already distinguishes overdue vs. this-week counts:
  `NN overdue · NN this week` when any overdue tasks exist

`buildTimelineWindow()` is exported and regression-tested to keep the upper
bound pinned. The overdue-surfacing behavior is implicit in the absence of
`startDate` — do not add a lower bound without updating the header copy.

## Error Containment

There are two levels of protection:

### Root level - `RootErrorBoundary.tsx`

Use this only for shell-wide failures. If something here trips, the whole workspace cannot safely continue.

### Screen level - `ScreenErrorBoundary.tsx`

Each task screen is wrapped individually:

- Inbox
- Timeline
- Completed

This means a render crash inside one tab only replaces that tab content with a local fallback instead of taking down the entire app shell.

## Sheets and Overlay Model

The app mixes bottom sheets and centered modals; each surface has a clear role.

### Add task / Capture modal (`AddTaskSheet`)

- centered `Modal` with blur+dim backdrop, not a `BottomSheet`
- opened via the FAB (Capture pill)
- supports task mode and "New goal" mode in a single surface
- `hasDraftChanges` guard blocks accidental dismiss when the user has typed

### Edit task modal (`EditTaskSheet`)

- centered `Modal` with blur+dim backdrop
- includes goal picker chip for link / relink / unlink on any existing task

### Goal detail modal (inline in `GoalsScreen`)

- `GoalDetailSheet` component rendered inside `GoalsScreen`
- tapping a goal card opens it with description, priority, deadline, progress bar, linked tasks, and delete

### Settings sheet

- full-screen configuration modal with a category home and detail screens
- includes Kairo, Sync, Reminders, Interaction, Appearance, and About
- must remain scrollable and usable while keyboard is visible

### Kairo sheet

- near-full-screen assistant panel
- only time the app subscribes to all tasks for full-workspace AI context

## Settings Architecture

The mobile settings hierarchy is ordered for actionability, not for alphabetical grouping.

Current order:

1. Kairo
2. Sync
3. Reminders
4. Interaction
5. Appearance
6. About

Reasoning:

- Kairo configuration is an active editing flow with text inputs, so burying it at the bottom makes the keyboard experience worse.
- Sync and reminders are operational trust surfaces.
- Interaction and Appearance hold durable preferences.
- About is low-frequency and belongs at the end.
- The Kairo section keeps provider and API key visible by default, while endpoint URL and model live behind an `Advanced` toggle so the default editing path stays short on mobile.

### Category navigation

Implementation rules:

- `settingsNavigationReducer` owns the shallow list/detail state.
- the home screen renders one icon-plus-text row per category with a short
  status summary
- exactly one detail category renders at a time, so heavier sections such as
  Kairo and Gmail review do not keep active UI mounted while the user is
  elsewhere
- opening Settings always lands on the category list
- Android separators are explicit `View` dividers between rows, not
  `StyleSheet.hairlineWidth` borders on pressable rows

The earlier chip-scroll model (`src/lib/settingsSections.ts` + `selectActiveSection`)
and the tab-bar model are no longer wired in. The helper remains in the tree as
a legacy artifact and is not imported.

### Advanced auto-open rule

`hasCustomKairoEndpoint(config)` decides whether the Kairo `Advanced` section should be open on initial load:

- it returns `true` only when the saved endpoint URL or model diverges from the active provider's defaults
- empty strings are treated as "use defaults" and do not count as custom
- the decision runs once on cold load against the persisted config, not on every keystroke, so editing a field never triggers the section to spring open

This helper is unit-tested in `src/test/kairoConfig.test.ts`.

## Input Rules for Bottom Sheets

When an input lives inside `@gorhom/bottom-sheet`, prefer `BottomSheetTextInput` over plain RN `TextInput`.

Why:

- the bottom-sheet library can track focus correctly
- keyboard expansion and restoration work more predictably
- Android resize behavior is less fragile

This rule applies especially to:

- add/edit task sheets
- Kairo settings inputs

## Loading Strategy

The mobile app should not use a single generic loading pattern everywhere.

Current loading rules:

- boot gates use `BootScreen`
- first list load uses structural skeletons shaped like real rows
- settings form load uses a form-shaped skeleton, not plain text placeholders
- background refresh keeps existing data visible instead of swapping back to a skeleton

The goal is to avoid both of these bad outcomes:

1. fake spinners that provide no layout continuity
2. overly accurate, expensive skeletons that act like a fully animated fake UI

## Testing

Current mobile test coverage includes:

- retry queue hydration / persistence utils (`useRetryQueue.test.ts`)
- optimistic task list transforms (`mobileStateUtils.test.ts`)
- task mutation hook behavior (`useTaskMutations.test.ts`)
- timeline date-window derivation (`useTaskQueries.test.ts`)
- full-corpus gating for `allTasksQuery` (`useTaskQueriesGating.test.ts`)
- Kairo advanced auto-open decision (`kairoConfig.test.ts`)
- user preferences sanitization (`userPreferences.test.ts`)
- `ScreenErrorBoundary` render / fallback / retry (`screenErrorBoundary.test.tsx`)
- workspace snapshot hydration and clear-token race safety (`workspaceSnapshot.test.ts`)
- `AddTaskSheet` interaction tests (`addTaskSheet.test.tsx`)
- `EditTaskSheet` interaction tests (`editTaskSheet.test.tsx`)
- `KairoSettingsSection` interaction tests (`kairoSettingsSection.test.tsx`)
- `InboxScreen` incremental row rendering (`inboxScreen.test.tsx`)
- `TimelineScreen` incremental row rendering (`timelineScreen.test.tsx`)
- `CompletedScreen` incremental row rendering (`completedScreen.test.tsx`)
- Kairo chat FlatList, deferred send, deferred replay (`kairo.test.tsx`)

The intended regression pattern is:

```text
bug discovered
-> root cause identified
-> fix lands
-> one focused regression test added if logic is testable in isolation
```

## Goals Architecture

Goals are long-horizon objectives that tasks can be linked to. They sync across devices via Convex.

### Data flow

```text
Convex (goals + goalLinks tables)
  ↓  useConvexGoalsSync (runs in App.tsx)
goalsStore / goalLinksStore   ← in-memory pub/sub cache
  ↓  useGoals() / useGoalLinks()
GoalsScreen / AddTaskSheet / EditTaskSheet
```

### Stores

`goalsStorage.ts` and `goalLinks.ts` are thin in-memory pub/sub stores with the same `useSyncExternalStore` shape. Their primary purpose is to avoid prop-drilling and let multiple screens subscribe to the same data. AsyncStorage is used as a fast-start fallback only — Convex is the source of truth.

### Sync

`useConvexGoalsSync` (called once in `App.tsx`) subscribes to `api.goals.list` and `api.goals.listLinks`. When either query resolves, it calls `_syncFromServer` on the corresponding store. On the first run after the feature ships, if Convex has no goals but the local store does, it uploads the local goals as a one-time migration.

### Mutations

`useGoalMutations` is used by every callsite that adds, deletes, or links goals. Each mutation writes optimistically to the local store and then fires the Convex mutation. Wipe (`clearAll`) also deletes server-side goal data.

### Adding goals

Goals can only be created via the Capture modal ("New goal" mode). The Goals tab has no inline composer.

## What To Touch For Common Changes

### If inbox/timeline/completed tab behavior is wrong

Check:

- `src/hooks/useTaskQueries.ts`
- `src/hooks/useTaskMutations.ts`
- `src/screens/*.tsx`
- `convex/tasks.ts`

### If settings inputs are hidden by keyboard or not editable

Check:

- `src/components/SettingsSheet.tsx`
- `src/components/KairoSettingsSection.tsx`
- bottom-sheet keyboard props

### If goal sync is broken or goals don't appear after reinstall

Check:

- `convex/goals.ts` — `list`, `upsert`, `remove`, `listLinks`, `setLink`, `clearAll`
- `src/hooks/useConvexGoalsSync.ts` — Convex → local sync and one-time migration logic
- `src/hooks/useGoalMutations.ts` — mutation wrapper
- `src/lib/goalsStorage.ts` and `src/lib/goalLinks.ts` — `_syncFromServer` and store shape

### If a crash takes down the whole app unexpectedly

Check:

- whether the failing UI is wrapped in `ScreenErrorBoundary`
- whether the failure truly belongs at root-shell level

### If Kairo feels slow or causes extra churn

Check:

- `includeAllTasks` behavior in `useTaskQueries.ts`
- `Kairo.tsx` open/close flow
- `kairoConfig.ts` and `kairoApi.ts`

### If list performance is poor on large workspaces

Check:

- `useIncrementalRowCount.ts` — batch size and delay constants
- `FlatList` virtualization props in the relevant screen (`initialNumToRender`,
  `maxToRenderPerBatch`, `updateCellsBatchingPeriod`, `windowSize`)
- `DiagnosticsPanel` counts in a dev build to confirm rendering vs. data mismatch
