# Mobile Redesign Mock Parity PRD

Status: published implementation PRD for reconciling the shipped `v3.0.0`
mobile app with the approved redesign boards.

Published tracker issue:

- https://github.com/Snehit70/pravah/issues/153

Related inputs:

- `apps/mobile/docs/ux-redesign-draft.md`
- `apps/mobile/docs/mock-parity-audit.md`
- `apps/mobile/docs/assets/*-redesign-board.png`

## Problem Statement

Pravah mobile `v3.0.0` shipped a major UX redesign that improved navigation,
task flow, accessibility, and feedback, but it did not ship at strict parity
with the approved mock boards.

The mismatch is not primarily about code quality. The mismatch is that the
agreed design language, control inventory, and screen compositions were only
partially implemented, especially in Settings. That means the team currently
lacks a trustworthy answer to the question "what exactly is the redesign we are
standing behind?"

Without an explicit parity PRD, the product is vulnerable to three problems:

- future UI work will continue from shipped code instead of agreed design
- review will pass behaviorally correct changes that still drift from the
  intended surface
- mock boards will stop being a reliable acceptance target

## Solution

Define a single parity target for the mobile redesign, then implement or revise
each shipped surface until the code and the design source of truth agree.

The parity effort should not be a vague "polish pass". It should be a bounded
reconciliation effort with explicit acceptance criteria per surface. Each
surface must end in one of two states:

- the implementation is updated to match the approved board closely enough to be
  called shipped design
- the board is revised to reflect intentional simplifications, and the revised
  board becomes the new source of truth

The result should be a mobile app whose shipped UI, supporting docs, and review
criteria all point to the same design.

## User Stories

1. As a Pravah user, I want the shipped app to match the agreed redesign, so
   that the product feels coherent and intentional.
2. As a Pravah user, I want Settings to expose the promised controls and
   sections, so that personalization and system behavior feel complete rather
   than half-finished.
3. As a Pravah user, I want Capture to match the planned task and goal entry
   flows, so that quick capture and structured planning feel like one system.
4. As a Pravah user, I want Goals cards and detail screens to reflect the
   planned information hierarchy, so that planning work is readable at a glance.
5. As a Pravah user, I want Progress to present momentum and completed work with
   the intended density and detail, so that review feels rewarding and useful.
6. As a Pravah user, I want Timeline to preserve the approved execution-first
   model, including jump, overdue, and empty states, so that date-based work is
   easy to navigate.
7. As a Pravah user, I want Inbox triage interactions to match the approved
   model, so that task intake feels consistent with the rest of the app.
8. As a Pravah user, I want Kairo surfaces to match the intended setup,
   proposal, and history flows, so that AI assistance feels integrated rather
   than bolted on.
9. As a designer or product owner, I want every mock-only element to be either
   implemented or explicitly cut, so that there is no silent drift.
10. As a reviewer, I want a clear acceptance checklist for each surface, so
    that review enforces parity instead of only code correctness.
11. As a developer, I want each parity fix split into narrow vertical slices, so
    that the work is reviewable and testable.
12. As a developer, I want the acceptance seams to be explicit, so that tests
    and visual verification target stable behaviors.
13. As a future maintainer, I want the final shipped-state design documented, so
    that future redesign work starts from truth instead of folklore.
14. As a user who changes preferences, I want Settings appearance, interaction,
    notification, sound, haptic, sync, and about flows to reflect the approved
    information architecture, so that the app feels complete.
15. As a user who relies on accessibility features, I want parity work to keep
    reduced motion, safe targets, and screen-reader semantics intact, so that
    fidelity does not regress usability.
16. As a user who moves between screens often, I want sheets, full-screen
    flows, and modals to be used consistently with the agreed rules, so that the
    app’s navigation model is predictable.
17. As a product owner, I want mock updates when intentional cuts are chosen, so
    that design artifacts remain truthful.
18. As a release reviewer, I want a final parity signoff process before merge,
    so that another design drift does not ship unnoticed.

## Implementation Decisions

- The parity source of truth is the combination of the redesign draft, the
  approved mock boards, and this PRD. Shipped code alone is not the acceptance
  source of truth.
- The work should preserve the existing mobile information architecture:
  `Inbox`, `Timeline`, `Goals`, `Progress`, `Capture`, `Kairo`, and `Settings`.
  The problem is fidelity within these surfaces, not tab renaming.
- Settings is the highest-priority reconciliation surface because it has the
  largest control-set and composition drift from the board.
- The parity effort must distinguish three states for each mock element:
  `implemented`, `intentionally simplified`, or `missing and must build`.
- If a mock element is intentionally cut, the board or supporting design doc
  must be updated in the same effort. Silent divergence is not allowed.
- The appearance model must be truthful. The app should not ship fake
  customization controls that do not change real UI behavior.
- Existing sensory behavior decisions stay in force: sound, haptic, reduced
  motion, and accessibility are part of the accepted redesign and cannot be
  weakened in the name of visual parity.
- Sheet vs full-screen vs modal decisions should continue to follow the mobile
  interaction logic already agreed in the redesign draft. Parity means
  re-aligning screens to that logic, not reintroducing arbitrary containers.
- Capture, Goals, Progress, and Timeline should be reconciled after Settings in
  descending order of observed drift and user-facing importance.
- Inbox and Kairo need parity cleanup, but they are secondary because their core
  behavioral model is already closer to the boards.
- A final shipped-state document should be created or updated after parity work
  lands. That document must describe the design that actually shipped.
- Review must add an explicit screen-parity gate. A PR that claims redesign
  completion is not done until it passes both behavioral verification and
  surface-parity verification.

## Testing Decisions

- Good tests should verify external user behavior and stable design contracts,
  not implementation details or internal component structure.
- Existing highest seams should be preferred:
  - mobile screen tests for surface-level behavior
  - existing E2E seams for navigation, keyboard reachability, and critical flows
  - targeted visual/manual verification against the approved boards
- Settings parity should be tested through user-visible sections, controls, and
  navigation behavior rather than helper internals.
- Capture parity should be tested through mode switching, quick chips, detail
  disclosure, goal flow entry, and post-save feedback.
- Goals parity should be tested through list density, next-task preview, detail
  entry, and plan-next-task flow.
- Progress parity should be tested through summary cards, history entry, empty
  state, and completed-item detail behavior.
- Timeline parity should be tested through overdue entry, jump behavior,
  date-group navigation, and empty-state affordances.
- Inbox parity should be tested through triage list defaults, filters, quick
  actions, and schedule interactions.
- Kairo parity should be tested through starter context, proposal/apply flow,
  setup path, and history path.
- Manual board comparison is an explicit acceptance seam for this effort because
  the failure mode was visual/interaction drift, not logic-only regressions.

## Out Of Scope

- Renaming the app’s canonical tabs or redesigning the entire information
  architecture from scratch
- Introducing a compatibility layer to preserve both old and new redesigns
- Rewriting backend or sync systems that are unrelated to parity gaps
- Adding speculative preferences that were never agreed in the redesign source
  of truth
- Expanding into store-distribution or release-marketing work

## Further Notes

- The current acceptance problem is discipline, not only implementation.
- The shipped app is not invalid, but it cannot honestly be described as a full
  realization of the approved boards.
- The first practical checkpoint should be Settings parity, because it will
  force the team to settle whether the board is still the real target.
