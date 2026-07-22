# Architecture

## Overview

Pravah is a Bun-based monorepo with a React web client, Convex backend, authenticated automation CLI, and Expo mobile app.

## Repository Layout

```
src/                        React web client
  App.tsx                   Root — auth shell, DnD context, overlay orchestration
  components/
    Timeline.tsx            Horizontal week grid, status bar
    DayColumn.tsx           Per-day sortable task column
    InboxSidebar.tsx        Right panel — inbox list with optimistic drag reorder
    Kairo.tsx               AI copilot dock (bottom-centre)
    QuickAdd.tsx            New-task modal (N shortcut)
    TaskPopup.tsx           Edit task modal
    TopNavbar.tsx           Header navigation
    Settings.tsx            Settings sheet
  hooks/
    useTaskBoardData.ts     Derives tasksByDate and inboxTasks from flat query
    useTaskDragHandlers.ts  DnD start/end logic, mutation calls
    useAppKeyboardShortcuts.ts  Global hotkeys
    useAppOverlays.ts       Open/close state for all overlays
  lib/
    motion.ts               Single-source motion tokens (DUR, EASE, tx())
    kairoConfig.ts          Kairo provider/key/model config (localStorage)
    taskRules.ts            Drag validation, priority boundaries
    utils.ts                Date helpers, cn()
convex/                     Backend
  schema.ts                 Table definitions and indexes
  tasks.ts                  Task queries and mutations
  syncActions.ts            Google Calendar sync action
  sync.ts                   Upsert and cursor helpers
  http.ts                   HTTP route router
  auth.ts                   Better Auth integration
apps/mobile/                Expo React Native client
  docs/                     Mobile-specific architecture and UX docs
packages/cli/               Standalone bun-targeted authenticated automation CLI
.agents/skills/pravah-cli/  Explicitly authorized read/write agent workflow
```

## Web UI Design System

- **Fonts**: Geist Sans + Geist Mono (self-hosted via fontsource)
- **Colour**: dark purple base (`#101013`), accent `oklch(0.78 0.14 260)`, deadline `oklch(0.72 0.16 30)`
- **Motion**: all timings and curves defined in `src/lib/motion.ts`; components use `tx()` for CSS transitions and `T_FAST`/`T_SLOW` Framer Motion presets
- **Drag and drop**: `@dnd-kit/core` + `@dnd-kit/sortable`; DnD context spans the full app shell; InboxSidebar holds a `useDndMonitor` listener for optimistic reorder

## Auth Model

- Better Auth + Convex plugin handles sessions.
- Pravah is currently a single-user system; it does not support shared or collaborative multi-user workspaces.
- Ownership is enforced via `ownerTokenIdentifier` on all domain records.
- Convex functions call `requireTokenIdentifier` before any data operation.
- Legacy ownerless records are intentionally claimed by the current signed-in user during bootstrap because they originate from older single-user app versions.

## Data Model

| Table | Purpose |
|---|---|
| `tasks` | All tasks — inbox and scheduled |
| `goals` | Long-horizon goals; synced across devices via Convex |
| `goalLinks` | taskId → goalClientId mapping; synced alongside goals |
| `integrations` | Per-user Google sync config |
| `syncCursors` | Resume cursors for Calendar sync |
| `externalTaskMappings` | Calendar event → task mapping |
| `reviewQueue` | Gmail candidate items pending review |
| `syncRuns` | Sync execution history |
| `users` | Bootstrapped user records |
| `automationCredentials` | Revocable scoped CLI credentials |
| `automationBootstrapTokens` | One-time CLI credential bootstrap |
| `automationIdempotencyKeys` | Atomic retry protection for automation writes |
| `automationAuditEvents` | Credential lifecycle and usage audit |

See `convex/schema.ts` for canonical field definitions and indexes.

## Task Lifecycle

1. User creates a task via QuickAdd (`N`) or Kairo.
2. Tasks start in the `inbox` when they have no `deadline`, or on the `timeline` when they do.
3. Drag from inbox → timeline column calls `moveTask`.
4. Drag within timeline or inbox calls `reorderTasks` / `reorderInboxTasks`.
5. Completing a task sets `completedAt`; reopening clears `completedAt` and returns the task to the inbox or timeline based on whether a deadline remains.

## Kairo Copilot

- Docked at the bottom centre; `⌘J` toggles open/closed. Clicking the backdrop closes it.
- Config (provider format, API key, endpoint URL, model) lives in `localStorage` via `src/lib/kairoConfig.ts`.
- Requests are made **browser-side** directly to the configured endpoint — the key never leaves the client.
- Supports OpenAI-compatible endpoints (`Authorization: Bearer`) and Anthropic (`x-api-key` + `anthropic-version`).
- Can emit `<add-task>` blocks that the UI presents for explicit confirmation before persisting via Convex mutation.

## Automation CLI

- External agents use the `pravah` CLI and versioned JSON envelopes.
- CLI credentials are revocable, owner-bound, and scope-limited.
- Accepted task writes are add, update, move, complete, reopen, and unschedule.
- Planned automation coverage should reach phone feature parity, then extend into agent-native workflows.
- Delete writes use soft deletion plus operation-ledger undo, with hard purge only after the canonical 30-minute undo window.
- Goal writes are create, update, and delete, using scoped, idempotent automation paths.
- Goal Link writes are link and unlink, using the same scoped, idempotent automation path.
- Bearer-authenticated writes require idempotency keys and replay exact retries atomically.
- The repo-local `pravah-cli` skill permits authenticated writes only when the
  user explicitly requests the corresponding mutation; otherwise the workflow
  remains read-only. Writes use scoped authorization, idempotency keys, and
  readback verification.

## Inbox Drag Reorder — Optimistic Flow

Because dnd-kit clears all transforms synchronously when drag ends, and the Convex query reflects the server order (pre-mutation), a naive implementation shows a snap-back followed by a re-settle. The fix:

1. `InboxSidebarComponent` calls `useDndMonitor({ onDragEnd })`.
2. On drop, `arrayMove` is applied to `localOrder` immediately — before the Convex round-trip.
3. The displayed list is derived from `localOrder` (when set) so the DOM is already correct when dnd-kit resets transforms.
4. `localOrder` is cleared once the server order matches or a task is added/removed.

## Google Calendar Sync Flow

1. Frontend obtains OAuth code via PKCE → calls `/google/token`.
2. Access token triggers `/sync/google-calendar/import`.
3. `syncActions.importGoogleCalendarAction` fetches events with cursor/retry.
4. `sync.importGoogleCalendarEvents` upserts mappings + tasks.
5. Integration status and sync run records are updated.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on PRs and pushes to `main`:
- **Lint** (`bun run lint`)
- **Build** (`bun run build`)

## Mobile Docs

The repo-level architecture file intentionally stays broad. For the current,
implementation-level mobile structure, see:

- `apps/mobile/docs/README.md`
- `apps/mobile/docs/architecture.md`
- `apps/mobile/docs/ux-orchestration.md`
