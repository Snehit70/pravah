# Architecture

## Overview

Pravah is a Bun-based monorepo with a React web client, Convex backend, MCP bridge, and Expo mobile app.

## Components

- `src/` (web)
  - React app shell, timeline UI, inbox, settings, auth views
  - DnD via `@dnd-kit`
  - state from Convex queries/mutations
- `convex/` (backend)
  - schema + indexes
  - auth setup (Better Auth + Convex plugin)
  - task and sync domain logic
  - HTTP API router
- `mcp-server.ts`
  - stdio MCP server
  - maps MCP tools to Convex HTTP endpoints
- `apps/mobile/`
  - Expo client using shared Convex backend and Better Auth

## Auth Model

- Auth is handled by Better Auth integrated with Convex.
- Ownership is enforced using `ownerTokenIdentifier` on domain records.
- Convex functions call `requireTokenIdentifier` before data operations.

## Data Model (high level)

- `tasks`
- `integrations`
- `syncCursors`
- `externalTaskMappings`
- `reviewQueue`
- `syncRuns`
- `users`

See `convex/schema.ts` for canonical definitions and indexes.

## Task Flow

1. User creates/schedules tasks from web/mobile.
2. Tasks are stored in Convex with status and timeline position.
3. Timeline and inbox views query filtered task sets.
4. Drag/drop updates ordering and schedule through mutations.

## Sync Flow (Google Calendar)

1. Frontend obtains OAuth code via PKCE and calls `/google/token`.
2. Access token is used to trigger `/sync/google-calendar/import`.
3. `syncActions.importGoogleCalendarAction` fetches events, handles cursoring/retries.
4. `sync.importGoogleCalendarEvents` upserts mappings + tasks.
5. Integration status and sync runs are updated for visibility.

## Review Queue Flow (Gmail candidates)

1. Candidate items are sent to `/gmail/candidates`.
2. Items are stored in `reviewQueue` as `pending`.
3. User approves/rejects via review queue routes.
4. Approved items become real tasks.

## Testing

- Vitest configured in `vite.config.ts`.
- Tests include:
  - route/contract validation
  - task rules and drag handlers
  - UI behavior tests
  - sync action tests

## Operational Notes

- API key auth for most Convex HTTP routes via `CONVEX_HTTP_API_KEY`.
- Google token exchange endpoint intentionally skips API key to support browser OAuth callback flow.
