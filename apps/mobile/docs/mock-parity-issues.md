# Mobile Redesign Mock Parity Issue Breakdown

Status: published vertical-slice breakdown derived from
`apps/mobile/docs/mock-parity-prd.md`.

Parent artifact:

- `apps/mobile/docs/mock-parity-prd.md`
- https://github.com/Snehit70/pravah/issues/153

## Published Tracker Issues

1. https://github.com/Snehit70/pravah/issues/154
2. https://github.com/Snehit70/pravah/issues/155
3. https://github.com/Snehit70/pravah/issues/156
4. https://github.com/Snehit70/pravah/issues/157
5. https://github.com/Snehit70/pravah/issues/158
6. https://github.com/Snehit70/pravah/issues/159
7. https://github.com/Snehit70/pravah/issues/160
8. https://github.com/Snehit70/pravah/issues/161
9. https://github.com/Snehit70/pravah/issues/162
10. https://github.com/Snehit70/pravah/issues/163
11. https://github.com/Snehit70/pravah/issues/164
12. https://github.com/Snehit70/pravah/issues/165
13. https://github.com/Snehit70/pravah/issues/166
14. https://github.com/Snehit70/pravah/issues/167
15. https://github.com/Snehit70/pravah/issues/168
16. https://github.com/Snehit70/pravah/issues/169
17. https://github.com/Snehit70/pravah/issues/170
18. https://github.com/Snehit70/pravah/issues/171

## Proposed Slices

1. **Title**: Lock mobile redesign parity acceptance
   **Type**: HITL
   **Blocked by**: None
   **User stories covered**: 9, 10, 12, 17, 18
   **What this slice delivers**: a reviewed parity checklist that maps every
   mock board element to `implemented`, `intentionally simplified`, or `missing
   and must build`, plus a signoff rule for future redesign work.

2. **Title**: Restore Settings home and section navigation
   **Type**: AFK
   **Blocked by**: 1
   **User stories covered**: 2, 10, 14, 15, 16
   **What this slice delivers**: the Settings landing surface, section rows,
   descriptions, ordering, and detail navigation match the approved Settings
   board closely enough to serve as the new Settings spine.

3. **Title**: Decide and implement truthful Settings appearance controls
   **Type**: HITL
   **Blocked by**: 1, 2
   **User stories covered**: 2, 9, 10, 14, 15, 17
   **What this slice delivers**: a settled decision on theme, accent, density,
   larger text, and font controls, followed by either real implementation or a
   revised design artifact that removes unsupported controls.

4. **Title**: Restore Settings interaction and sensory controls
   **Type**: AFK
   **Blocked by**: 1, 2
   **User stories covered**: 2, 10, 14, 15, 16
   **What this slice delivers**: launch behavior, quick capture behavior,
   swipe preference, sound, haptic, vibration, and reduced-motion controls match
   the agreed interaction model and remain accessible.

5. **Title**: Restore Settings reminders, sync, automation, and about details
   **Type**: AFK
   **Blocked by**: 1, 2
   **User stories covered**: 2, 10, 14, 15
   **What this slice delivers**: the deeper Settings detail sections match the
   board composition while preserving real notification, sync, automation,
   account, diagnostics, and legal behavior.

6. **Title**: Align Capture task sheet fundamentals
   **Type**: AFK
   **Blocked by**: 1
   **User stories covered**: 3, 10, 15, 16
   **What this slice delivers**: compact task capture, quick deadline chips,
   priority controls, details disclosure, keyboard behavior, and post-save
   feedback match the approved Capture board.

7. **Title**: Align Capture goal creation flow
   **Type**: AFK
   **Blocked by**: 1, 6
   **User stories covered**: 3, 10, 15, 16
   **What this slice delivers**: goal-mode capture, new-goal entry, linked-task
   setup, and success feedback match the agreed full-screen or sheet treatment
   for creating a goal from Capture.

8. **Title**: Align Goals list card hierarchy
   **Type**: AFK
   **Blocked by**: 1
   **User stories covered**: 4, 10, 15
   **What this slice delivers**: goal cards, progress display, next-task
   preview, empty states, and action affordances match the board’s scanning
   hierarchy.

9. **Title**: Align Goals detail and plan-next-task flow
   **Type**: AFK
   **Blocked by**: 1, 8
   **User stories covered**: 4, 10, 15, 16
   **What this slice delivers**: goal detail, plan-next-task entry, linked-task
   list behavior, and edit/overflow paths match the approved Goals detail
   model.

10. **Title**: Align Progress summary and recent completions
    **Type**: AFK
    **Blocked by**: 1
    **User stories covered**: 5, 10, 15
    **What this slice delivers**: momentum cards, recent completed task
    emphasis, empty state, and feedback language match the Progress board.

11. **Title**: Align Progress history and completed-task detail
    **Type**: AFK
    **Blocked by**: 1, 10
    **User stories covered**: 5, 10, 15, 16
    **What this slice delivers**: full-screen history, completed-task detail
    treatment, and return behavior match the approved Progress history model.

12. **Title**: Align Timeline jump and date navigation
    **Type**: AFK
    **Blocked by**: 1
    **User stories covered**: 6, 10, 15, 16
    **What this slice delivers**: Timeline date scoping, jump affordance,
    section navigation, and empty-day treatment match the approved board.

13. **Title**: Align Timeline task actions and overdue doorway
    **Type**: AFK
    **Blocked by**: 1, 12
    **User stories covered**: 6, 10, 15, 16
    **What this slice delivers**: overdue entry, triage doorway, task
    quick-action treatment, reschedule flow, and completion feedback match the
    approved Timeline board without flooding the main list.

14. **Title**: Align Inbox search, filters, and triage defaults
    **Type**: AFK
    **Blocked by**: 1
    **User stories covered**: 7, 10, 15, 16
    **What this slice delivers**: Inbox default state, search/filter entry,
    active filter pills, and empty state either match the board or are revised
    in the design docs as intentional simplifications.

15. **Title**: Align Inbox task action and schedule flows
    **Type**: AFK
    **Blocked by**: 1, 14
    **User stories covered**: 7, 10, 15, 16
    **What this slice delivers**: task quick actions, schedule states, edit
    entry, and feedback behavior match the approved Inbox interaction model.

16. **Title**: Align Kairo setup and contextual entry states
    **Type**: AFK
    **Blocked by**: 1
    **User stories covered**: 8, 10, 15, 16
    **What this slice delivers**: Kairo entry from each tab, starter prompts,
    provider setup, and unavailable/degraded states match the approved Kairo
    board.

17. **Title**: Align Kairo proposal, apply, and history flows
    **Type**: AFK
    **Blocked by**: 1, 16
    **User stories covered**: 8, 10, 15, 16
    **What this slice delivers**: proposal review, edit/apply loop, success
    feedback, history view, and session detail match the approved Kairo flow.

18. **Title**: Publish shipped-state mobile redesign docs and boards
    **Type**: HITL
    **Blocked by**: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17
    **User stories covered**: 9, 10, 13, 17, 18
    **What this slice delivers**: the final docs and boards describe the
    design that actually ships, including every intentional simplification and
    the final parity signoff result.

## Recommended Dependency View

The minimal dependency chain is:

1. Lock mobile redesign parity acceptance
2. Settings home and section navigation
3. Settings appearance decision and implementation
4. Settings interaction and sensory controls
5. Settings reminders, sync, automation, and about details
6. Capture task sheet fundamentals
7. Capture goal creation flow
8. Goals list card hierarchy
9. Goals detail and plan-next-task flow
10. Progress summary and recent completions
11. Progress history and completed-task detail
12. Timeline jump and date navigation
13. Timeline task actions and overdue doorway
14. Inbox search, filters, and triage defaults
15. Inbox task action and schedule flows
16. Kairo setup and contextual entry states
17. Kairo proposal, apply, and history flows
18. Shipped-state docs and boards

## Granularity Check

This breakdown is intentionally granular. Each slice should be small enough to
review against one board area while still delivering a complete user-visible
path.

The two HITL issues are deliberate:

- the first issue sets the acceptance bar before code changes continue
- the final issue signs off the shipped docs and boards after implementation

The Settings appearance issue is also HITL because fake customization controls
would be worse than a documented cut.

## Suggested Issue Template

Use this when publishing each slice:

### What to build

Describe the end-to-end user-visible slice, not file-by-file implementation.

### Acceptance criteria

- [ ] The shipped surface matches the approved board or revised truth source
- [ ] Existing accessibility and reduced-motion guarantees remain intact
- [ ] Relevant surface tests and manual parity checks pass
- [ ] Any intentional simplifications are documented explicitly

### Blocked by

List the approved blocker ticket, or `None - can start immediately`.
