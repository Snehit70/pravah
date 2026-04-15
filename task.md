# Pravah Mobile - Pending Implementation Tasks

## Priority P0 (Stability / ANR)

- [x] Replace heavy task list rendering with virtualization (`SectionList` or `FlashList`) instead of full `ScrollView` + `map` rendering.
- [ ] Reduce initial mount cost for large datasets (example observed: very high timeline item count) to avoid UI thread stalls.
- [ ] Introduce incremental rendering strategy for timeline sections (lazy section expansion and/or capped initial items per section).
- [ ] Add large-list performance safeguards so input remains responsive under stress.

## Priority P1 (UX Consistency)

- [x] Replace system sign-out popup (`Alert.alert`) with a themed in-app confirmation modal/sheet.
- [x] Ensure sign-out confirmation copy, colors, spacing, and buttons match Pravah design tokens.

## Priority P1 (Debuggability / Detailed Logs)

- [x] Add structured app-level logging utility for mobile (`debug`, `info`, `warn`, `error`) with consistent tags and context fields.
- [x] Add feature-level logs around critical flows:
  - auth (sign-in, sign-out, token/session restore)
  - task mutations (add, edit, move, done, reopen)
  - retry queue (enqueue, persist, hydrate, retry start/success/failure)
  - refresh/sync cycles
- [x] Add timing logs for expensive paths (initial load, large list render, mutation latency, retry latency).
- [x] Add correlation IDs per user action/mutation so related logs can be traced end-to-end.
- [x] Add error classification in logs (network/offline/validation/server/unexpected) with user-visible message mapping.
- [ ] Add optional development diagnostics overlay/screen showing key runtime counters (task counts, queue size, pending mutations, render timings).
- [x] Ensure logs are easy to filter in Logcat (stable prefix/tag format).
- [x] Add documentation for log capture commands and troubleshooting workflow for QA runs.

## Priority P2 (QA Reliability)

- [ ] No synthetic/test data generation. Use existing production-scale data for performance validation.
- [ ] Define a repeatable ANR repro script with steps + timestamps for faster triage.
- [ ] Add a post-test checklist template (failed step, timestamp, expected vs actual, log marker).
