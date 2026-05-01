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

## Top-Level Structure

```text
apps/mobile/
├── App.tsx
├── DEBUGGING.md
├── src/
│   ├── components/
│   │   ├── AddTaskSheet.tsx
│   │   ├── EditTaskSheet.tsx
│   │   ├── Kairo.tsx
│   │   ├── KairoSettingsSection.tsx
│   │   ├── LoadingSkeleton.tsx
│   │   ├── RootErrorBoundary.tsx
│   │   ├── ScreenErrorBoundary.tsx
│   │   └── SettingsSheet.tsx
│   ├── hooks/
│   │   ├── useGoogleAuth.ts
│   │   ├── useIntegrationsSettings.ts
│   │   ├── useNotificationsSettings.ts
│   │   ├── useRetryQueue.ts
│   │   ├── useTaskMutations.ts
│   │   ├── useTaskQueries.ts
│   │   └── useWorkspaceState.ts
│   ├── screens/
│   │   ├── CompletedScreen.tsx
│   │   ├── InboxScreen.tsx
│   │   └── TimelineScreen.tsx
│   ├── lib/
│   │   ├── auth-client.ts
│   │   ├── convex.tsx
│   │   ├── dates.ts
│   │   ├── kairoApi.ts
│   │   ├── kairoConfig.ts
│   │   ├── logger.ts
│   │   └── task-optimistic.ts
│   └── test/
│       ├── mobileStateUtils.test.ts
│       ├── useRetryQueue.test.ts
│       ├── useTaskMutations.test.ts
│       └── useTaskQueries.test.ts
└── docs/
    ├── README.md
    ├── architecture.md
    └── ux-orchestration.md
```

## Shell Responsibilities

`App.tsx` is now an orchestrator instead of a monolithic app implementation.

It should own:

- app gates (`FontGate`, `StorageGate`)
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
- bootstrap readiness (`storeUser`, `claimLegacyData`)
- active tab
- refresh flag
- pending mutation count
- toast lifecycle and timeout clearing
- optimistic task override reset when pending mutations drain
- open/close state for add sheet, edit sheet, settings, and Kairo activity

This separation matters because task queries should not also be responsible for session bootstrapping or toast timing.

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
- `timelineSections`
- `inboxCount`, `timelineCount`, `completedCount`
- `today`, `tomorrow`, `weekEnd`

### 3. Mutation state - `useTaskMutations.ts`

This hook owns task-changing actions and optimistic list updates.

It handles:

- mark done
- move to today
- send back to inbox
- reopen completed task
- save edits
- inbox reorder
- timeline reorder
- within-day timeline shift actions

It does not own the session, Kairo settings, or notification settings.

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

The mobile timeline intentionally queries only a bounded window.

Current behavior:

- `today` = local current day
- `weekEnd` = `today + 6 days`
- timeline query passes `startDate` and `endDate`

Why:

- older scheduled history should not bloat active mobile rendering
- Kairo and archival flows can still use broader task context when needed
- the UI only shows a short mobile horizon, so the query should match the surface

`buildTimelineWindow()` is exported and regression-tested to keep this behavior pinned.

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

The app uses bottom sheets heavily, so overlay responsibilities must stay clear.

### Add / Edit sheets

- task creation and editing
- keyboard-aware
- use `BottomSheetTextInput`
- Android uses `adjustResize`

### Settings sheet

- long-form configuration surface
- includes sync, alerts, Kairo config, and account actions
- must remain scrollable and usable while keyboard is visible

### Kairo sheet

- near-full-screen assistant panel
- only time the app subscribes to all tasks for full-workspace AI context

## Settings Architecture

The mobile settings hierarchy is ordered for actionability, not for alphabetical grouping.

Current order:

1. Assistant (`Kairo`)
2. Sync
3. Alerts
4. Account

Reasoning:

- Kairo configuration is an active editing flow with text inputs, so burying it at the bottom makes the keyboard experience worse.
- Sync and alerts are mostly toggles and status surfaces.
- Account is low-frequency and belongs at the end.
- The Kairo section keeps provider and API key visible by default, while endpoint URL and model live behind an `Advanced` toggle so the default editing path stays short on mobile.

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

- retry queue hydration / persistence utils
- optimistic task list transforms
- task mutation hook behavior
- timeline date-window derivation

The intended regression pattern is:

```text
bug discovered
-> root cause identified
-> fix lands
-> one focused regression test added if logic is testable in isolation
```

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

### If a crash takes down the whole app unexpectedly

Check:

- whether the failing UI is wrapped in `ScreenErrorBoundary`
- whether the failure truly belongs at root-shell level

### If Kairo feels slow or causes extra churn

Check:

- `includeAllTasks` behavior in `useTaskQueries.ts`
- `Kairo.tsx` open/close flow
- `kairoConfig.ts` and `kairoApi.ts`
