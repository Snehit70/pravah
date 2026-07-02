# Mobile Redesign Parity Signoff

Status: final shipped-state signoff for the mobile redesign parity pass on
`mobile/mock-parity-fixes`.

Related tracker work:

- Parent: https://github.com/Snehit70/pravah/issues/153
- Slice issues: https://github.com/Snehit70/pravah/issues/154 through
  https://github.com/Snehit70/pravah/issues/171

Board sources:

- `apps/mobile/docs/assets/inbox-redesign-board.png`
- `apps/mobile/docs/assets/timeline-redesign-board.png`
- `apps/mobile/docs/assets/goals-redesign-board.png`
- `apps/mobile/docs/assets/progress-redesign-board.png`
- `apps/mobile/docs/assets/capture-redesign-board.png`
- `apps/mobile/docs/assets/kairo-redesign-board.png`
- `apps/mobile/docs/assets/settings-redesign-board.png`
- `apps/mobile/docs/assets/component-primitives-board.png`

## Final Position

The redesign should now be described as:

- faithful on information architecture and primary task flow
- explicit about the few remaining simplifications
- documented enough that future work can start from shipped truth instead of
  the old mismatch between mocks and code

This is not a claim of literal pixel parity. It is a claim that every surfaced
difference is now either implemented or recorded below as an intentional
simplification with a reason.

## Surface Mapping

| Surface | Board expectation | Shipped implementation | Final state |
| --- | --- | --- | --- |
| Settings | Category home plus truthful appearance, interaction, reminders, sync, and about sections | Full category spine, swipe/sound/haptic controls, truthful appearance baseline cards, density and task-accent controls, sync and reminder summaries | Implemented with truthful cuts |
| Capture | Compact task capture, goal mode, concrete deadline chips, clear save outcomes | Shared bottom sheet with task/goal split, concrete date presets, optional first linked task, truthful outcome copy | Implemented |
| Goals | Compact list, next-task preview, full goal detail, plan-next entry | Goal list preview, full-screen detail, linked-task section, plan-next action, goal deep-link support | Implemented |
| Progress | Momentum summary, recent completions, full history, completed-task detail sheet | Momentum tiles, recent completions, full-screen searchable history, read-only completed-task detail sheet | Implemented |
| Timeline | Jump affordance, overdue doorway, focused later summary, action-first rows | Jump chips, overdue doorway, simplified later summary, visible complete/inbox actions | Implemented with one lighter navigation treatment |
| Inbox | Triage queue, search/filter entry, active pills, schedule-first action model | Triage queue framing, inline disclosure filters, active pills, visible Schedule action opening the scheduling flow, helper copy | Implemented with documented action-entry replacement |
| Kairo | Contextual entry, setup state, proposal/apply loop, history | Context card, clearer setup banner, empty-history CTA, proposal/apply flow, history/session list | Implemented with lighter full-screen expansion |

## Intentional Simplifications

These are the remaining differences the team is explicitly accepting.

| Area | Simplification | Reason | Shipped behavior |
| --- | --- | --- | --- |
| Settings appearance | Theme/font controls remain baseline cards instead of live toggles | Runtime theme and font switching are not globally wired; fake controls would be worse than omission | Settings states the warm-light and Geist baseline explicitly while only exposing controls that actually change UI |
| Inbox filter entry | The board showed a dedicated filter sheet | Inline disclosure is faster for frequent triage and keeps search/filter one tap away without adding another layer | Inbox opens an inline search/filter panel and keeps active pills visible above the list |
| Inbox schedule entry | The board implied a dedicated task action sheet | The shared edit sheet already owns date/time editing and keeps task mutation logic in one truthful flow | The visible `Schedule` action now opens the scheduling/edit flow instead of silently moving the task to Today |
| Timeline jump | The board suggested a deeper jump sheet | The shipped timeline only needs fast near-term section jumps for the current scope | A chip row jumps to loaded sections and the later bucket expands inline |
| Kairo expansion | The board leaned harder on separate full-screen setup/history surfaces | The near-full-screen sheet already supports longer work while keeping Kairo cross-cutting from every tab | Setup, history, and session switching stay inside the Kairo surface with stronger context cues |

## Issue Checklist

| Issue | Delivered by shipped state |
| --- | --- |
| #154 | Parity acceptance now uses this signoff file plus the archived audit and PRD |
| #155 | Settings category home and navigation restored |
| #156 | Appearance controls are truthful and documented |
| #157 | Interaction and sensory controls restored |
| #158 | Reminders, sync, automation, and about summaries restored |
| #159 | Capture task outcome copy aligned |
| #160 | Goal capture connects directly to the first linked task |
| #161 | Goal cards preview the next linked task |
| #162 | Goal detail exposes a visible plan-next action |
| #163 | Progress momentum tiles restored |
| #164 | Progress history now has a completed-task detail sheet and predictable return behavior |
| #165 | Timeline jump navigation restored |
| #166 | Timeline overdue doorway and later summary aligned |
| #167 | Inbox now reads as a triage queue by default |
| #168 | Inbox `Schedule` is truthful and routes into the scheduling flow |
| #169 | Kairo entry states carry workspace context |
| #170 | Kairo history states and empty state aligned |
| #171 | This shipped-state signoff records the final accepted design |

## Verification Targets

Primary implementation files:

- `apps/mobile/App.tsx`
- `apps/mobile/src/components/TaskCard.tsx`
- `apps/mobile/src/components/CompletedTaskSheet.tsx`
- `apps/mobile/src/components/SettingsSheet.tsx`
- `apps/mobile/src/components/AddTaskSheet.tsx`
- `apps/mobile/src/components/Kairo.tsx`
- `apps/mobile/src/components/KairoChatList.tsx`
- `apps/mobile/src/screens/InboxScreen.tsx`
- `apps/mobile/src/screens/TimelineScreen.tsx`
- `apps/mobile/src/screens/GoalsScreen.tsx`
- `apps/mobile/src/screens/InsightsScreen.tsx`

Targeted tests covering the parity seam:

- `apps/mobile/src/test/settingsNavigation.test.ts`
- `apps/mobile/src/test/addTaskSheet.test.tsx`
- `apps/mobile/src/test/taskCard.test.tsx`
- `apps/mobile/src/test/inboxScreen.test.tsx`
- `apps/mobile/src/test/progressScreen.test.tsx`
- `apps/mobile/src/test/completedTaskSheet.test.tsx`

Current local limitation:

- The repo state in this environment still lacks a working local `vitest`
  binary and related typecheck dependencies, so this pass could only update
  tests and run static diff hygiene locally.

## Future Rule

Any future mobile redesign PR is not done until it includes all four of these:

1. Updated shipped-state docs when the surface changes.
2. A board-to-code mapping for every changed surface.
3. Explicit notes for every intentional simplification.
4. A parity signoff artifact before merge, not after merge.
