# Pravah Mobile Docs

This directory is the source of truth for the Expo / React Native app in `apps/mobile/`.

Use these docs when changing the mobile shell, task views, Kairo settings flow,
loading behavior, or Android-specific ergonomics.

## Documents

- `architecture.md` - current mobile module map, data flow, and ownership boundaries
- `ux-orchestration.md` - loading strategy, keyboard behavior, motion rules, and settings UX
- `android-build-performance.md` - Android Gradle build tuning, expected speedups, and why (not Bazel)

## Quick Facts

- The mobile app is an Expo app rooted at `apps/mobile/App.tsx`.
- Global mobile workspace state lives in `src/hooks/useWorkspaceState.ts`.
- Mobile task subscriptions and derived lists live in `src/hooks/useTaskQueries.ts`.
- Task mutations and optimistic updates live in `src/hooks/useTaskMutations.ts`.
- The three task tabs are split into `src/screens/InboxScreen.tsx`, `src/screens/TimelineScreen.tsx`, and `src/screens/CompletedScreen.tsx`.
- Goals sync via Convex (`convex/goals.ts`). `useConvexGoalsSync` keeps the local stores hydrated; `useGoalMutations` is the single entrypoint for all goal writes.
- Kairo action surface now includes task + goal operations:
  - tasks: add/reschedule/complete/unschedule/update/delete
  - goals: add/update/delete
  - links: link task to goal / unlink task from goal
- The Capture surface (`AddTaskSheet`) and Edit task surface (`EditTaskSheet`) are centered `Modal` components, not `BottomSheet`.
- Kairo settings on mobile use `expo-secure-store`, not browser `localStorage`.
- Settings is a full-screen drill-down modal with category rows and detail screens.

## OTA Workflow (Android preview)

Use this for JS-only mobile updates without rebuilding the APK:

```bash
cd apps/mobile
bunx eas-cli update --branch preview --platform android --message "feat(mobile): <summary>"
```

Important constraints:

- Keep `apps/mobile/app.json` `expo.version` unchanged during OTA UI rounds.
- OTA update only reaches installs with matching runtime (`runtimeVersion.policy = "appVersion"`).
- If runtime mismatches, publish from the last commit that still has the installed version.

Canonical runtime-matching playbook: `apps/mobile/build.md`.

## Verification Shortlist

After changing mobile UX or task behavior, run:

```bash
# Fast type check (uses tsgo)
bun run typecheck:fast

# Canonical type check (uses tsc)
bun run typecheck

# Test suite
bun run test
```

For device-level debugging, see `apps/mobile/DEBUGGING.md`.
