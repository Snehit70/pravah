# Pravah Mobile Improvement Backlog

This file tracks the current mobile audit backlog on `review/mobile-improvement-audit`.

## P0 - Core Workflow Regressions

- [ ] Restore drag-to-reorder in Inbox using a real `DraggableFlatList` path instead of `noopDrag`, manually disabled for now due to known edge cases; handle last after the rest of the mobile audit is stable.
- [ ] Restore drag-to-reorder in Timeline using a mixed-row `DraggableFlatList` without nesting it inside a `ScrollView`, manually disabled for now due to known edge cases; handle last after the rest of the mobile audit is stable.
- [ ] Reconnect `handleInboxDragEnd` and `handleTimelineDragEnd` from `useTaskMutations` into the live screen flow, manually disabled for now due to known edge cases; handle last after the rest of the mobile audit is stable.
- [ ] Keep same-day reorder validation and reject cross-day timeline drops safely, manually disabled for now due to known edge cases; handle last after the rest of the mobile audit is stable.
- [ ] Re-bound the mobile timeline query by passing `startDate` again from `apps/mobile/src/hooks/useTaskQueries.ts`.
- [ ] Add a regression test that asserts the real `getTimeline` query args include both `startDate` and `endDate`.
- [ ] Fix Kairo deferred prompt replay so a prompt sent before `isAllTasksReady` does not duplicate the user message.
- [ ] Ensure the temporary `Loading your workspace...` assistant placeholder is not replayed into final model history.
- [ ] Add a Kairo test that covers deferred send and asserts there is no duplicated message or polluted history.

## P0 - Settings Safety

- [ ] Gate Kairo settings save on `loaded === true` so unresolved SecureStore reads cannot overwrite a valid config.
- [ ] Disable or visually downgrade the Kairo save action while config is still loading.
- [ ] Add component tests for `KairoSettingsSection` covering:
- [ ] Advanced section hidden by default on default config.
- [ ] Advanced section opens when tapped.
- [ ] Advanced section auto-opens for persisted custom endpoint/model.
- [ ] Save is disabled while loading.
- [ ] Save label transitions through idle -> saving -> saved -> idle.
- [ ] Make Kairo settings surface storage write/delete failures instead of always showing success.

## P1 - Feature Parity With Web

- [ ] Bring Gmail review queue workflows to mobile: list pending items, approve, reject, and optionally choose schedule date.
- [ ] Extend mobile Google auth/integration flow to support Gmail access where required.
- [ ] Bring fuller Google Calendar controls to mobile: account visibility, calendar selection, and full resync.
- [ ] Improve mobile task capture parity with web QuickAdd: add fast schedule options like Tomorrow and Next Week.
- [ ] Improve mobile task editing parity with web TaskPopup: expose delete/unschedule/reopen paths more directly.
- [ ] Add inbox search and filtering on mobile for larger task volumes.
- [ ] Decide whether Long-term Goals should exist on mobile; if yes, design and implement the mobile surface.

## P1 - Performance And Startup

- [x] Implement optimistic async mobile boot: one launch gate, early shell reveal, background bootstrap, and local workspace snapshot fallback.
- [ ] Reduce initial mount cost for large datasets to avoid UI thread stalls on heavy workspaces.
- [ ] Introduce incremental rendering or other safeguards for large timeline datasets.
- [ ] Add large-list performance safeguards so input remains responsive under stress.
- [ ] Review whether `claimLegacyData` should stay on every mobile bootstrap or move behind an explicit one-time migration gate.
- [ ] Audit Kairo conversation rendering for long chats and replace plain `ScrollView` if it becomes a scaling problem.
- [ ] Run an EAS Android preview build after the first round of fixes: `bunx eas-cli build --platform android --profile preview`.

## P1 - Accessibility And UX Ergonomics

- [ ] Enforce minimum `hitSlop={12}` across all small mobile `Pressable` targets.
- [ ] Audit `AddTaskSheet.tsx`, `EditTaskSheet.tsx`, `TaskMetaFields.tsx`, `BottomTabBar.tsx`, and `TaskCard.tsx` for undersized touch targets.
- [x] Ensure `BootScreen` respects reduced-motion preferences instead of always pulsing.
- [ ] Revisit bottom tab tap affordance and spacing on smaller Android devices.
- [ ] Add onboarding or first-run guidance beyond auth for a first-time mobile user.
- [ ] Review empty states and inline recovery paths for Inbox, Timeline, Completed, and Kairo.

## P1 - Logging, Debugging, And Runtime Visibility

- [ ] Add optional developer diagnostics overlay/screen with runtime counters such as task counts, queue size, pending mutations, and recent timings.
- [ ] Add richer error logging in integration and notification hooks instead of generic `catch {}` handling.
- [ ] Add logging around Kairo deferred sends, replay, and provider failures for faster device-side triage.
- [ ] Validate the existing `DEBUGGING.md` flow against a current Android device pass and update any stale commands.

## P1 - Release And CI Coverage

- [ ] Add a mobile CI job in `.github/workflows/ci.yml` for `apps/mobile` typecheck.
- [ ] Add a mobile CI job in `.github/workflows/ci.yml` for `apps/mobile` lint.
- [ ] Add a mobile CI job in `.github/workflows/ci.yml` for `apps/mobile` tests.
- [ ] Consider adding a lightweight mobile smoke/build validation step so CI catches platform-specific regressions earlier.

## P2 - QA Reliability

- [ ] Use existing production-scale data for performance validation rather than synthetic test data.
- [ ] Define a repeatable ANR/performance repro script with steps and timestamps.
- [ ] Add a post-test checklist template with failed step, timestamp, expected vs actual, and log marker.
- [ ] Run a full manual mobile smoke walk from `apps/mobile/MOBILE_TESTING.md` after major fixes.

## P2 - Documentation Consistency

- [ ] Reconcile `apps/mobile/docs/architecture.md` with actual timeline query behavior after the timeline window fix.
- [ ] Reconcile docs and comments around drag support so shipped behavior and documentation match.
- [ ] Keep `apps/mobile/docs/ux-orchestration.md` aligned with real keyboard, hitSlop, and motion policies.
- [ ] Add a short parity-tracking doc section for web-only vs mobile-supported features.
