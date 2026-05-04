# Pravah Mobile Docs

This directory is the source of truth for the Expo / React Native app in `apps/mobile/`.

Use these docs when changing the mobile shell, task views, Kairo settings flow,
loading behavior, or Android-specific ergonomics.

## Documents

- `architecture.md` - current mobile module map, data flow, and ownership boundaries
- `ux-orchestration.md` - loading strategy, keyboard behavior, motion rules, and settings UX

## Quick Facts

- The mobile app is an Expo app rooted at `apps/mobile/App.tsx`.
- Global mobile workspace state lives in `src/hooks/useWorkspaceState.ts`.
- Mobile task subscriptions and derived lists live in `src/hooks/useTaskQueries.ts`.
- Task mutations and optimistic updates live in `src/hooks/useTaskMutations.ts`.
- The three task tabs are split into `src/screens/InboxScreen.tsx`, `src/screens/TimelineScreen.tsx`, and `src/screens/CompletedScreen.tsx`.
- Kairo settings on mobile use `expo-secure-store`, not browser `localStorage`.
- The settings sheet is a `@gorhom/bottom-sheet` surface and must remain keyboard-safe on Android.

## Verification Shortlist

After changing mobile UX or task behavior, run:

```bash
bunx tsc --noEmit
bun run test
```

For device-level debugging, see `apps/mobile/DEBUGGING.md`.
