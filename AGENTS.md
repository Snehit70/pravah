# Pravah — Codex Configuration

## Commit rules

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

## Release and versioning policy

- GitHub release automation is managed by `release-please` via `.github/workflows/release-please.yml`.
- Agents should follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) so semver bumps are generated correctly.
- Version sources are:
  - web: root `package.json`
  - mobile: `apps/mobile/package.json`
- Mobile Expo version must stay in sync with mobile package version. This is automated through `release-please-config.json` by updating `apps/mobile/app.json` at `$.expo.version` during release PR generation.

### Convex deployment target

- Pravah uses `befitting-swan-125` (`https://befitting-swan-125.eu-west-1.convex.cloud`) as the single canonical Convex deployment for local development, EAS builds, OTA bundles, and release workflows.
- Do not point the mobile app or release automation at `fortunate-dogfish-953`. That is a separate Convex deployment and is not an application environment for Pravah.
- If a release-control function is missing from `befitting-swan-125`, deploy the backend there before publishing a mobile release. Do not “fix” the mismatch by changing the app to another deployment.
- An OTA update can correct a wrongly bundled `EXPO_PUBLIC_CONVEX_URL` because that value is compiled into the JavaScript bundle. The target deployment must already contain the required Convex functions, and the OTA workflow must publish with the canonical EAS environment values.
