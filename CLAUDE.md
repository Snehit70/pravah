# Pravah — Claude Code Configuration

## Commit rules

- Never add Claude as a co-author or collaborator in commit messages, PR descriptions, or anywhere else. Do not include any "Co-Authored-By", "Generated with", or similar lines referencing Claude in any git output.
- Create clean commits with only the actual change.

## Project layout

- `apps/mobile/` — Expo / React Native app
- `convex/` — Convex backend (queries, mutations, actions, schema)
- `src/` — Web app (Vite + React)

## Product assumptions

- Pravah is currently a single-user system, not a collaborative multi-user workspace.
- `ownerTokenIdentifier` is still used across Convex records for auth scoping, sync ownership, and legacy-data migration safety.
- When reviewing or changing ownership logic, prefer solutions that preserve the single-user product assumption unless the task explicitly introduces multi-user support.

## Mobile specifics

- All Convex types are imported from `../../convex/_generated/` (relative to `apps/mobile/`). The `apps/mobile/convex/` directory is intentionally empty — do not put files there.
- Env vars are prefixed `EXPO_PUBLIC_`.
- `better-auth` session storage uses a synchronous in-memory cache backed by `expo-secure-store` (`src/lib/auth-client.ts`). Auth-dependent code must wait for `authStorageReady` to resolve before making session calls.
