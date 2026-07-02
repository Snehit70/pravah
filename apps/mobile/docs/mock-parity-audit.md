# Mock Parity Audit

Status: archival pre-fix audit of the `v3.0.0` redesign drift. The current
shipped-state truth now lives in `apps/mobile/docs/mock-parity-signoff.md`.

This document compares the approved mock boards in `apps/mobile/docs/assets/`
against the currently shipped implementation in `apps/mobile/`.

The goal is not to grade code quality. The goal is to answer a stricter
question: did the shipped app actually match the agreed redesign?

## Method

- Read the planning document: `apps/mobile/docs/ux-redesign-draft.md`
- Inspected the shipped implementation in:
  - `apps/mobile/App.tsx`
  - `apps/mobile/src/screens/*`
  - `apps/mobile/src/components/*`
- Visually reviewed the mock boards:
  - Inbox
  - Timeline
  - Goals
  - Progress
  - Capture
  - Kairo
  - Settings

## Verdict

The redesign shipped with meaningful behavioral improvements, but it did not
ship at strict mock parity.

Severity by surface:

- `Settings`: high drift
- `Capture`: medium drift
- `Goals`: medium drift
- `Timeline`: medium drift
- `Progress`: medium drift
- `Inbox`: low to medium drift
- `Kairo`: low to medium drift

The largest mismatch is not color or typography. The largest mismatch is
surface scope and control set, especially in Settings and some full-screen vs
sheet decisions.

## Why This Was Missed

This was reviewed as a behavior, accessibility, and CI-hardening PR, not as a
strict screen-parity PR.

What the review loop did enforce:

- green CI
- truthful settings over fake toggles
- interaction correctness
- reduced-motion and screen-reader semantics
- sound/haptic wiring
- no unresolved review findings

What the review loop did not enforce:

- 1:1 mock-to-screen acceptance
- explicit mapping of every mock element to shipped code
- a final screenshot parity pass before merge
- a decision log for mock elements that were intentionally cut

That means review quality was real, but it was aimed at the wrong bar.

## Surface Audit

### Inbox

Mock expectation:

- default triage list with `Search or filter`
- active filter pills
- dedicated search/filter bottom sheet
- dedicated task quick-action sheet
- schedule-state bottom sheet
- empty state matching the board

Shipped state:

- triage list exists
- active filter pills exist
- collapsible inline filter panel exists
- schedule action exists
- empty state exists
- task actions are mostly inline or via edit sheet, not the same quick-action
  sheet model shown in the mock

Assessment:

- `Implemented`: core triage structure, filters, active pills, empty state
- `Drifted`: filter interaction changed from sheet to inline disclosure
- `Drifted`: task quick-action sheet is not a close visual/interaction match
- `Drifted`: schedule sheet details differ from the mock language and options

Severity: low to medium

Decision:

- acceptable if documented as an intentional interaction simplification
- not acceptable if claiming the mock shipped faithfully

### Timeline

Mock expectation:

- date scoping control plus `Jump`
- strong overdue banner and triage sheet
- timeline task quick-action sheet
- reschedule bottom sheet
- jump/date-jump sheet
- richer empty-today state with next-step CTA

Shipped state:

- overdue doorway exists
- triage sheet exists
- date-grouped timeline exists
- `Jump` exists conceptually in the mocks, but shipped section behavior is
  lighter and less explicit
- later sections collapse into a simple summary row
- empty state is much simpler than the board

Assessment:

- `Implemented`: overdue triage model, execution-first list, core task actions
- `Approximate`: timeline quick actions and reschedule flows
- `Missing or softened`: mock-level jump/date-jump treatment and richer empty
  state

Severity: medium

Decision:

- behaviorally aligned
- not visually or structurally at board parity

### Goals

Mock expectation:

- default goals list with progress and next-task preview
- inline expansion into next linked tasks
- full-screen goal detail
- `Plan next Task` sheet
- `New Goal` entry directly from Goals
- goal overflow/edit path

Shipped state:

- goals list exists
- progress and linked-task information exist
- goal detail exists as a full-screen `Modal`
- `Plan next Task` entry exists
- goal creation exists from Goals

Assessment:

- `Implemented`: core IA and workflow direction
- `Drifted`: exact card anatomy, preview density, and detail-screen composition
- `Drifted`: overflow/edit affordances are not a close board match

Severity: medium

Decision:

- one of the closer surfaces conceptually
- still not a faithful visual match

### Progress

Mock expectation:

- momentum summary cards
- recent completed task emphasis
- full-screen completed history
- completed-task detail bottom sheet
- richer empty and toast states

Shipped state:

- momentum summary exists
- recent completed tasks exist
- full-screen completion history exists
- empty state exists

Assessment:

- `Implemented`: the major IA split, especially full-screen history
- `Missing or softened`: completed-task detail bottom sheet parity, richer card
  treatment, and some visual feedback states from the board
- `Drifted`: shipped Progress is structurally simpler and more text-led than the
  board

Severity: medium

Decision:

- direction shipped
- polish and fidelity did not

### Capture

Mock expectation:

- compact bottom-sheet capture
- quick deadline chips
- expandable `More`
- clean Task/Goal mode switch
- complex `New Goal` full-screen mode
- strong post-save bottom toast variants

Shipped state:

- compact capture sheet exists
- quick date chips exist
- `More` / details disclosure exists
- Task/Goal mode switch exists
- goal creation exists

Assessment:

- `Implemented`: most of the IA and most important task-capture mechanics
- `Drifted`: sheet layout, control density, and goal-mode/full-screen treatment
- `Drifted`: post-save feedback exists, but not at close board parity

Severity: medium

Decision:

- functionally strong
- visually and structurally looser than the board

### Kairo

Mock expectation:

- cross-cutting sheet
- proposal/edit/apply loop
- success feedback
- full-screen history/session view
- full-screen provider/setup view

Shipped state:

- cross-cutting near-full-screen sheet exists
- chat history exists
- provider setup path exists
- action proposal/apply loop exists

Assessment:

- `Implemented`: cross-cutting model and most workflow concepts
- `Drifted`: full-screen history/setup treatments are not mirrored literally
- `Drifted`: detailed plan-editing states are less board-faithful than implied

Severity: low to medium

Decision:

- good conceptual parity
- incomplete screen-state parity

### Settings

Mock expectation:

- settings home with six rows and explicit status summaries
- Kairo detail screen with provider and model structure
- Sync detail with issue banner, status blocks, account/device info, sync
  frequency, and pause toggle
- Reminders detail with permissions, critical alerts, due reminder behavior, and
  daily summary controls
- Interaction detail with swipe, haptic detail, default launch view, quick
  capture, reduced motion, autoplay
- Appearance detail with theme cards, accent choices, density, larger text
- About/diagnostics detail with version, what's new, diagnostics, export logs,
  report issue, and legal links

Shipped state:

- drill-down settings home exists
- Kairo detail exists
- Sync detail exists
- Reminders detail exists
- Interaction detail exists
- Appearance detail exists
- About detail exists

Major drift:

- `Appearance` is the biggest mismatch in the whole redesign.
  - mock shows theme, accent, density, larger text
  - shipped screen only has a static `Visual system` note, `Bulk task capture`,
    and `Tab order`
- `Interaction` is materially reduced.
  - mock shows default launch view and quick capture options
  - shipped screen does not
- `Sync` detail differs in structure and density from the board
- `About` detail uses a different composition from the board
- the board implies a more product-finished settings experience than what
  shipped

Important nuance:

Some cuts were intentional because fake controls were removed. For example,
theme/font toggles were not shipped because there was only one real visual
system. That was the correct product call, but the mock and planning docs were
not updated to reflect it before merge.

Severity: high

Decision:

- not acceptable to describe as full mock parity
- acceptable only if reframed as a partial implementation with intentional cuts

## Must-Fix vs Intentional-Cut

### Must-Fix For Mock Fidelity

- Decide whether `Appearance` should actually ship the missing options or the
  mock should be formally revised downward
- Reconcile `Interaction` with the mock on:
  - default launch view
  - quick capture options
  - haptic-detail structure
- Reconcile the Settings home/detail compositions with the board or publish an
  explicit revised board set
- Add a final shipped-state design doc that says what is truly in `v3`

### Reasonable Intentional Cuts

- fake theme/font switching when only one real visual system exists
- simplified filter disclosure in Inbox instead of a dedicated filter sheet
- lighter Progress composition if the product prefers clarity over ornamental
  card density
- simplified Kairo full-screen transitions if the cross-cutting sheet model is
  preferred in production

These are valid cuts only if they are documented as cuts. They are not valid if
the mocks continue to imply that those surfaces shipped.

## Recommendation

Do not treat the current mock boards as a truthful representation of the
shipped app.

Next step should be one of:

1. `Implementation-first`: bring the app up to the mock boards, starting with
   Settings, then Capture, then Progress.
2. `Truth-first`: freeze the shipped app as the product baseline and regenerate
   the mock boards/docs so they match reality.
3. `Hybrid`: patch the highest-drift surfaces in code, then regenerate the
   remaining boards to the new truth.

Recommended order:

1. Settings
2. Capture
3. Progress
4. Timeline polish
5. Goals polish
6. Board/doc regeneration for every surface

## Bottom Line

The app that shipped is not nonsense, and it is not purely lower quality than
the mocks. But it is not the same design.

The biggest failure was not coding quality. The biggest failure was acceptance
discipline: we merged a redesign without a final parity gate.
