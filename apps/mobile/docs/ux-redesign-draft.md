# Mobile UX Redesign Draft

Status: implementation-ready planning draft. Decisions in this document are
accepted for redesign planning unless explicitly reopened.

This document captures the current mobile UX map, accepted redesign decisions,
reference boards, and implementation sequence for the first-principles redesign
of Pravah mobile.

## Ground Rules

- Mobile only. The web app can inform parity, but this redesign discussion is
  for `apps/mobile/`.
- Respect the product language in `CONTEXT.md`: `Inbox`, `Timeline`, `Task`,
  `Deadline`, `Goal`, `Goal Link`, `Kairo`, and `Progress` already have
  meanings.
- Ask one decision question at a time. If code can answer a question, inspect
  the code instead of asking.
- Do not change implementation until the design direction is agreed.

## Handoff Summary

The redesign keeps the existing mobile shell concept: four destination tabs
(`Inbox`, `Timeline`, `Goals`, `Progress`) plus center Capture, with Kairo and
Settings as cross-cutting surfaces. The main change is not navigation count; it
is sharper responsibility per surface and a shared primitive system.

Build order:

1. Design system foundation
2. Shared interaction components
3. Inbox and Capture
4. Timeline
5. Goals
6. Progress
7. Kairo
8. Settings and preferences
9. Final integration polish

Reference boards:

- [Inbox](./assets/inbox-redesign-board.png)
- [Timeline](./assets/timeline-redesign-board.png)
- [Goals](./assets/goals-redesign-board.png)
- [Progress](./assets/progress-redesign-board.png)
- [Capture](./assets/capture-redesign-board.png)
- [Kairo](./assets/kairo-redesign-board.png)
- [Settings](./assets/settings-redesign-board.png)
- [Component primitives](./assets/component-primitives-board.png)

## Current Mobile Shell

The mobile shell is centralized in `apps/mobile/App.tsx`.

Current persistent structure:

| Region | Current UI | Role |
| --- | --- | --- |
| Top header | Pravah wordmark, current tab title, subtitle/count, Kairo link, settings icon | Orientation and secondary entry points |
| Main body | Active tab screen | One destination at a time |
| Bottom nav | Inbox, Timeline, Goals, Progress around center Capture | Primary destinations plus creation |
| Root overlays | Add sheet, edit sheet, Kairo sheet, overdue sheet, settings modal, diagnostics | Cross-cutting workflows |

Important observation: Capture, Kairo, Settings, and Overdue triage are already
modeled as cross-cutting tools rather than ordinary tabs.

## Current Top-Level Tabs

| Tab | What it really does | Current strength | Current UX risk |
| --- | --- | --- | --- |
| Inbox | Holds Tasks without a Deadline; supports search, priority filtering, Goal filtering, and task actions | Strong intake and triage surface | May be carrying too much filtering for a phone-sized inbox |
| Timeline | Shows Tasks with Deadlines; collapses overdue work into a triage doorway | Strongest execution surface | The label is canonical, but may describe the object more than the user intent |
| Goals | Manages long-horizon Goals, progress, linked Tasks, editing, and deletion | Rich strategic layer | May be heavy for daily primary navigation |
| Progress | Shows on-device statistics and Completed Tasks | Good consolidation | Mixes reflection and history in one surface |
| Capture | Creates Tasks, Goals, Task Series, and Multi-Goal Capture outputs | Correctly prominent | Creation sheet may be carrying too many modes |
| Kairo | Near-full-screen copilot with chat history, starters, confirmed actions, and provider setup | Properly cross-cutting | Placement may undersell or oversell it depending on product direction |

## Current User Loops

| Loop | Current path | Notes |
| --- | --- | --- |
| Quick capture | Center Capture -> AddTaskSheet -> save | Should stay one tap from everywhere |
| Triage Inbox | Inbox -> filters/search -> swipe Today or tap edit | Strong functionally, but should feel more like triage than browsing |
| Plan work | Timeline -> scan date sections -> open overdue triage -> task actions | Likely the core daily loop |
| Handle overdue | Timeline overdue bar -> OverdueSheet -> preview/reflow/manual triage | Good pattern because backlog does not flood the Timeline |
| Complete/reopen | Swipe task, checkbox, or edit sheet action | Strong mobile-native behavior |
| Edit Task | Tap Task -> read-only view -> explicit Edit | Deliberate and appropriate for mobile |
| Manage Goals | Goals tab -> Goal list -> detail modal -> linked Tasks/edit/delete | Rich but comparatively managerial |
| Review Progress | Progress -> statistics or Done ledger | Useful, probably not first-session-critical |
| Ask Kairo | Header Kairo -> sheet -> starters/chat/actions | Supports many loops, but is not the default route |
| Configure app | Header settings -> category list -> detail category | Already moved toward drill-down structure |

## Current IA Shape

```text
Mobile App
├─ Inbox
│  ├─ Search
│  ├─ Priority filters
│  ├─ Goal filter
│  └─ Task rows/actions
├─ Timeline
│  ├─ Overdue triage doorway
│  ├─ Date sections
│  └─ Task rows/actions
├─ Goals
│  ├─ Goal list
│  ├─ Goal detail modal
│  ├─ Linked Tasks
│  └─ Goal edit/delete
├─ Progress
│  ├─ Statistics
│  └─ Completed Tasks
├─ Capture
│  ├─ New Task
│  ├─ New Goal
│  ├─ Date presets
│  ├─ Priority/time/details
│  ├─ Goal linking
│  └─ Bulk capture paths
├─ Kairo
│  ├─ Chat
│  ├─ Starters
│  ├─ Chat history
│  ├─ Confirmed actions
│  └─ Provider setup
└─ Settings
   ├─ Assistant & Automation
   ├─ Sync
   ├─ Reminders
   ├─ Appearance
   └─ About
```

## Product Layers

The implementation suggests four conceptual layers:

| Layer | Product meaning | Current surfaces |
| --- | --- | --- |
| Intake | Capture and hold loose commitments | Capture, Inbox |
| Commitment | Decide what belongs in time | Timeline, overdue triage, task edit |
| Direction | Connect Tasks to longer arcs | Goals, Goal Links |
| Reflection | Understand what happened | Progress, Completed Tasks |

This is the main tension: the current navigation is layer-based, while mobile
usage may be more loop-based.

## Candidate Navigation Models

These are not decisions yet.

| Candidate | Tabs | Why it might be right | Risk |
| --- | --- | --- | --- |
| A | Inbox / Timeline / Goals / Progress | Safest continuation; matches glossary and current implementation | May preserve too much top-level complexity |
| B | Inbox / Timeline / Goals / Progress, but redesigned labels and hierarchy inside each tab | Low implementation churn; respects existing concepts | May not solve the core navigation problem |
| C | Inbox / Timeline / Progress, with Goals inside Timeline or Progress | Cleaner daily loop | Could bury a meaningful strategic surface |
| D | Today / Inbox / Goals / Progress | Execution-first | Conflicts with current `Timeline` term and may reduce week planning clarity |
| E | Timeline / Inbox / Kairo / Progress | Kairo-forward | Risky unless Kairo becomes the product's primary interaction model |

## Resolved Decisions

### Keep Timeline as the execution tab name

`Timeline` remains the primary execution tab name. It is already the core
product metaphor in `CONTEXT.md`. The redesign should make the Timeline feel
more action-oriented through structure, hierarchy, empty states, and overdue
triage rather than renaming the canonical surface.

### Keep Goals as a top-level tab

`Goals` remains a top-level mobile tab. A real planning mode starts from the
larger Goal, then asks which linked Tasks need to move. This is not secondary
reflection only; it is a direction-first workflow. The redesign should sharpen
Goals as the place for goal-led planning and progress, not bury it inside
Timeline or Progress.

### Keep four destination tabs plus center Capture

The mobile bottom navigation remains four destination tabs plus the fixed center
Capture action: `Inbox`, `Timeline`, `Goals`, and `Progress`. With both
Timeline and Goals treated as primary workflows, reducing to three tabs would
hide either intake or reflection. Inbox remains essential for unplaced Tasks,
and Progress remains the place for completion history and on-device feedback.

### Keep completed history inside Progress

`Progress` owns both on-device statistics and the Completed Task history.
Completed Tasks are no longer active planning objects, so they belong with
reflection, streaks, velocity, workload, and history rather than Inbox,
Timeline, or Goals. The current internal `Insights`/`Done` split is
directionally right, but the redesign may improve its labels and hierarchy.

### Make Inbox triage-first, not filter-first

`Inbox` keeps search, priority filters, and Goal filters, but the default
presentation should feel like a triage queue for Tasks without a Deadline. The
advanced controls should stay available for large inboxes and goal-led
planning, but they should be visually quieter than the Task list itself.

### Keep Kairo cross-cutting, not a bottom tab

`Kairo` remains a root-level sheet rather than a bottom navigation tab. It can
reason across Inbox, Timeline, Goals, and Progress, so it should be available
from the shell without becoming a destination peer. The entry point can be made
more explicit in the redesign, but the navigation model stays cross-cutting.

### Keep Capture global for Tasks and Goals

Capture remains the global creation entry point for both Tasks and Goals.
Mobile capture should accept intent quickly, whether it is a short Task or a
new long-horizon Goal. The default mode should be new Task; new Goal should be
a deliberate mode switch inside the capture flow rather than a separate
navigation requirement.

### Define interaction primitives before redesigning screens

Before redesigning individual screens, define a formal mobile interaction
primitive system for Pravah. The redesign should decide when to use each of:
bottom tabs, full-screen flows, modal overlays, bottom sheets, inline
expansions, confirmation dialogs, segmented controls, pickers, toasts, banners,
and persistent header actions. Without this layer, each screen will continue to
solve similar interaction problems locally.

### Reserve bottom tabs for recurring user modes

A bottom tab must be a persistent destination that represents a recurring user
mode, not merely a frequent action or secondary view. Pravah's bottom tabs are:

- `Inbox` for intake and triage
- `Timeline` for time-based execution
- `Goals` for direction-first planning
- `Progress` for reflection and history

Capture is a global action rather than a destination. Kairo is cross-cutting,
Settings is configuration, Completed history belongs inside Progress, and
overdue work is a Timeline sub-flow. None should become an additional tab.

### Use full-screen flows for sustained, structured work

A full-screen flow is appropriate when the user needs sustained focus, multiple
sections, or navigation within the surface. Goal detail, complex Task editing,
Progress history, and Settings should use full-screen flows. These surfaces
need stable navigation, enough room for hierarchy and keyboard interaction, and
should not feel temporarily layered over another destination.

Quick capture, simple choices, and confirmations should not take over the
screen.

### Use bottom sheets for context-preserving quick tools

A bottom sheet is appropriate when the user should remain mentally anchored in
the current tab and temporarily use a nearby tool. Capture, Kairo, filters,
rescheduling, and simple Task actions fit this pattern because the user should
return to the exact Inbox, Timeline, Goals, or Progress context afterward.

Bottom sheets should be single-purpose, dismissible, and avoid nested sheet
flows. Capture and Kairo may start as sheets, but they need an expand-to-full-
screen path if the interaction becomes long, multi-step, or structurally
complex. Filters, rescheduling, and simple Task actions should stay as sheets.

Do not use sheets as a softer name for modals. Destructive confirmations and
blocking decisions should use dialogs or modal overlays. Sustained work, deep
editing, multiple sections, or navigation inside the surface should become a
full-screen flow.

### Reserve modal overlays for interruption-level decisions

A modal overlay is appropriate only when the app must interrupt the current
flow because continuing without a decision would be unsafe, incorrect, or
impossible. Pravah should use modal overlays for destructive confirmations,
blocking permission or setup failures, authentication/session blockers, and
rare conflicts where the user must choose before the app can preserve correct
state.

Modals should not be used for normal work, browsing, editing, filtering,
capturing, or choosing between lightweight options. Those should be inline,
sheet-based, or full-screen depending on duration and complexity. This keeps
modal overlays meaningfully severe instead of making the app feel like it is
constantly stopping the user.

### Use inline expansion for clarification inside the same object

Inline expansion is appropriate when the user is revealing, clarifying, or
previewing information that still belongs to the same object on the same
screen. It should not create a separate workflow. Task detail previews,
Goal-linked Task previews, Progress stat explanations, empty-state education,
and lightweight advanced filters can use inline expansion when the expanded
content remains small and directly attached to its trigger.

Inline expansion should not become hidden navigation. If the user starts
editing, choosing from many options, handling multi-step input, or moving
between sub-sections inside the expanded area, the interaction should become a
bottom sheet or full-screen flow instead.

### Require confirmation only for irreversible or high-impact actions

A confirmation dialog is required when an action is destructive, hard to undo,
affects many Tasks or Goals, or changes automation, sync, provider, or
notification behavior. Examples include deleting a Goal, deleting many Tasks,
discarding unsaved complex edits, disabling sync, changing Kairo provider
setup, or applying a bulk reflow that meaningfully changes the Timeline.

Routine work should not require confirmation. Completing a Task, rescheduling a
single Task, editing text, changing filters, opening Kairo, switching tabs, or
using a reversible quick action should happen immediately. When an action can
be safely reversed, prefer immediate execution plus an undo affordance instead
of asking the user to confirm first.

### Match feedback weight to user responsibility

Use a toast for short-lived success, lightweight status, or an undo opportunity
after an action has already succeeded. Completing a Task, saving a simple edit,
moving one Task, or undoing a quick action can use a toast. Toasts should be
brief and should not carry information the user must read before continuing.

Use a banner for screen-level conditions that persist, degrade the experience,
or require attention but do not fully block the app. Offline state, sync
issues, overdue backlog warnings, degraded Kairo availability, or notification
permission gaps can use banners. A banner should stay visible until the
condition changes or the user deliberately dismisses it.

Use inline state when the feedback belongs to a specific object, field, list,
or empty area. Validation errors, loading rows, failed Task actions, empty
Inbox guidance, unavailable Goal links, and Progress explanations should appear
where the user can act on them.

Do not use toasts for failures the user must fix. Do not use banners for
one-off success. Do not hide object-specific problems in global feedback.

### Keep the persistent header stable and global

The persistent header should carry orientation and truly global actions only:
the current destination title, a small contextual subtitle or count, the Kairo
entry point, and Settings. This gives users stable wayfinding while preserving
quick access to cross-cutting tools.

The persistent header should not carry tab-specific controls such as filters,
search, sort, date pickers, Goal-specific actions, bulk actions, or local edit
buttons. Those controls belong inside the active screen, attached to the list,
section, or object they affect. This keeps the shell predictable and prevents
the header from changing personality on every tab.

## Interaction Primitive Decisions

No unresolved interaction primitive questions remain in this pass.

## Screen Mapping Decisions

This pass maps each current mobile surface against the agreed interaction
primitive system and defines what changes per surface.

Surfaces to map:

- `Inbox`
- `Timeline`
- `Goals`
- `Progress`
- `Capture`
- `Kairo`
- `Settings`

### Inbox should optimize for triage of unplaced Tasks

Reference board: [Inbox redesign board](./assets/inbox-redesign-board.png).

Inbox is the intake surface for Tasks without a Deadline. Its default view
should answer: "What loose commitments need a Deadline, a Goal, completion, or
deletion?" Search, priority filters, and Goal filters remain available, but
they should be secondary tools rather than the visual center of the screen.

The Inbox redesign should make the primary loop faster: review an unplaced
Task, decide whether it needs time, direction, completion, or removal, then
return to the list without losing position.

By default, Inbox should show the triage queue, a compact count or subtitle,
and lightweight local access to search and filters. Priority chips, Goal
filters, and heavy search should not be permanently expanded. They should be
represented by an inline collapsed control such as "Search or filter", with
active filter pills visible when applied.

If the user opens the full search and filter composition, it can use a bottom
sheet when the controls need more room than a compact inline expansion. This
keeps filter awareness attached to Inbox without making the default screen
filter-first.

Tapping an Inbox Task should open a bottom-sheet quick-action surface rather
than immediately entering a full edit page. The sheet should expose the triage
decisions for that Task: add Deadline, link or change Goal, mark complete, edit
details, or delete. Only edit details should escalate to a full-screen flow if
the edit becomes complex.

The primary visible row action for an Inbox Task should be Schedule, because an
Inbox Task's core unresolved state is that it has no Deadline. Completion can
remain available through a visible checkbox or quick action, Goal linking can
live in the quick-action sheet, and delete should stay secondary and
destructive.

Swipe gestures may exist only as optional accelerators. Every swipe action must
also have a visible non-swipe path. Swipe actions should be disabled by default
because accidental completion or rescheduling harms trust; users who want faster
gesture workflows can enable swipes in Settings.

### Timeline should optimize for execution clarity

Reference board: [Timeline redesign board](./assets/timeline-redesign-board.png).

Timeline is the execution surface for Tasks with Deadlines. Its default view
should answer: "What should I do next, today, and soon?" The redesign should
foreground due and active Tasks, keep overdue work as a controlled triage
doorway, and avoid turning Timeline into a full calendar, planner, or project
management surface.

Timeline should make time-based commitment feel calm and actionable: current
work first, near-future work second, and long-range scanning only when the user
asks for it.

By default, Timeline should show a focused sequence:

- Overdue doorway, only when overdue Tasks exist
- Today
- Tomorrow or the next few days
- Later, collapsed or lightly summarized

Timeline should not show a dense all-dates list by default. The first screen
should feel like an execution queue, not an archive.

Overdue work should appear as a compact doorway or banner, not as a giant list
inside Timeline. The doorway should show count and severity, then open a
bottom-sheet triage flow for preview, reflow, and manual decisions. This keeps
overdue visible without letting backlog hijack Today.

The primary visible row action for a Timeline Task should be Complete, because
a Timeline Task already has a Deadline and is now in execution mode.
Reschedule should remain secondary but easy to reach through the Task quick
action surface or a visible overflow. This mirrors Inbox with a different
intent: Inbox asks the user to schedule loose work; Timeline asks the user to
finish committed work.

Tapping a Timeline Task should open the same bottom-sheet quick-action pattern
as Inbox, but with Timeline-specific priority. The sheet should lead with
Complete and Reschedule, then Goal link, edit details, and delete. This keeps
Task interaction consistent across tabs while letting the action order match
the user's current mode.

Timeline should not show heavy date navigation by default. It can show
lightweight orientation such as Today, Upcoming, or a small jump affordance, but
not a full date picker or horizontal calendar on the default screen. Full date
jumping should live behind a collapsed control or bottom sheet.

### Goals should optimize for direction-first planning

Reference board: [Goals redesign board](./assets/goals-redesign-board.png).

Goals is the direction surface for longer-horizon outcomes. Its default view
should answer: "Which outcomes am I pursuing, and are they moving?" The
redesign should show Goal health, progress, and next linked Tasks without
turning Goals into a duplicate Task list.

Goals should help the user start from an outcome, inspect whether it has enough
motion, and decide which linked Tasks need attention. It should not compete
with Inbox for intake or Timeline for execution.

By default, Goals should show a compact Goal list. Each Goal row should include
status or health, a progress signal, and a preview of the next linked Task when
one exists. Goals should not show all linked Tasks expanded by default.

Small linked Task previews may expand inline when they clarify the Goal's
current motion. Full Goal detail, broad linked Task management, and complex
Goal editing should use a full-screen flow.

Tapping a Goal should open a full-screen Goal detail surface, not a sheet. Goal
detail contains multiple sections, linked Tasks, progress, editing, and
navigation-like depth, so it needs stable navigation and room for hierarchy.

The primary visible action on a Goal row should be Plan next Task or Add linked
Task, not Edit. The Goal row should push motion toward the outcome. Metadata
maintenance belongs inside Goal detail or an overflow action.

Creating a new Goal should be available from global Capture and from a local
New Goal action inside Goals. Global Capture supports fast intent capture from
anywhere; the local Goals action supports deliberate direction planning. Both
entry points should lead to the same Goal creation flow, not separate forms.

### Progress should optimize for reflection and trust

Reference board: [Progress redesign board](./assets/progress-redesign-board.png).

Progress is the reflection surface for completed work, lightweight trends, and
system confidence. Its default view should answer: "What did I finish, what
patterns matter, and can I trust my system?" The redesign should combine
lightweight stats, completion history, and meaningful trend signals without
becoming a dense analytics dashboard.

Progress should help the user understand momentum and verify that completed
work was recorded correctly. It should not compete with Timeline for execution
or Goals for direction planning.

By default, Progress should show a compact recent momentum summary first,
recent Completed Tasks second, and deeper trends or history behind a
full-screen drill-down. The first screen should feel like a readable reflection
page, not a metrics wall.

Completed Tasks should be separated inside Progress with clear sections:
momentum and trends at the top, recent Completed Tasks below, and a View
history full-screen route for the full ledger. This keeps Progress coherent
without making completion history compete with reflection.

Momentum should use task-native, trust-building signals only: Tasks completed
recently, completion consistency, overdue reduction, and Goals moved through
linked Tasks. Progress should avoid abstract productivity scores, generic
charts, and heavy dashboard framing. Its signals should stay tied to the
Pravah loop: Capture, Inbox, Timeline or Goals, then completion.

Tapping a Completed Task in Progress should open a bottom-sheet read-only
detail, not the full edit flow. Actions should be limited to Reopen, View
linked Goal, and Delete if needed. Reopen should move the Task back into active
work and route contextually: to Inbox if it has no Deadline, or to Timeline if
it has a Deadline.

Progress should not show Completed Task search or filters on the default
screen. The overview should keep recent Completed Tasks readable immediately.
Search, filters, and dense ledger management belong inside the full-screen View
history route.

### Capture should optimize for fast trusted intake

Reference board: [Capture redesign board](./assets/capture-redesign-board.png).

Capture is the global intake action, not a destination. Its default job is to
let the user write down a Task with minimum friction and trust that it will not
be lost. Goal creation should remain available as a deliberate mode switch, but
the default should be: capture now, refine later in Inbox, Timeline, or Goals.

Capture should preserve the user's current context. It should start as a
bottom sheet, accept the smallest useful input, and return the user to the
screen they came from after save.

Default Capture should show only the Task title input, optional quick Deadline
chips, and Save. Details, priority, Goal link, repeats or series, and
multi-goal capture should sit behind More or a deliberate mode switch. This
protects the capture moment from becoming planning.

Deadline presets should avoid vague labels such as This week. Use concrete
options like Today, Tomorrow, Weekend, Pick date, or Later with a
visible preview day such as "Later, Fri". The user should understand
the resulting Deadline before saving.

Capture should expand to full-screen only when the user deliberately enters a
complex creation mode: richer New Goal creation, repeat or series setup,
multi-goal capture, or long details. Normal Task capture should remain a
bottom sheet.

After saving from Capture, the app should return to the original screen and
show a toast with the result plus one contextual action. For example: "Task
captured" with Schedule if saved without a Deadline, or "Task scheduled" with
View in Timeline if saved with a Deadline. Capture should not auto-navigate
unless the user explicitly chooses the toast action.

### Kairo should optimize for cross-cutting assistance with confirmed action

Reference board: [Kairo redesign board](./assets/kairo-redesign-board.png).

Kairo is a cross-cutting intelligence surface, not a destination tab and not
chat for its own sake. Its primary job is to help across Inbox, Timeline,
Goals, and Progress while preserving user control over state changes.

Kairo should stay a sheet by default so the user remains anchored in the
current screen. It should expand to full-screen only when the interaction
becomes sustained: viewing chat history, reviewing a multi-step plan, comparing
many affected Tasks or Goals, provider setup, or long-running agent work. Short
asks, contextual starters, and single confirmations should stay in the sheet.
Any state-changing action proposed by Kairo should require clear confirmation
before it changes Tasks, Goals, Deadlines, sync, or provider settings.

When opened from the header, Kairo should show contextual starters based on the
active tab plus a compact input. From Inbox it can suggest "Help me triage
these"; from Timeline, "What should I do next?"; from Goals, "Which Goal needs
motion?"; from Progress, "What changed this week?" Kairo should not open
directly into a blank chat transcript.

When Kairo proposes state-changing work, it should present a reviewable action
plan before execution. The plan should group changes, name affected Tasks or
Goals, and use a clear primary action such as "Apply 3 changes" with a
secondary "Edit plan" path. Kairo should not silently mutate data, and complex
work should not end with a vague "Done" message.

### Settings should optimize for configuration clarity and trust

Reference board: [Settings redesign board](./assets/settings-redesign-board.png).

Settings is the configuration surface, not a feature discovery area and not an
everyday workflow surface. It should use a full-screen drill-down structure
with grouped categories for Kairo/provider setup, sync, reminders and
notifications, interaction preferences, appearance, and about or diagnostics.

Settings should hold durable preferences and trust-building operational state:
for example provider configuration, sync status, notification permissions, and
the swipe actions preference. It should not contain controls that belong to
Inbox, Timeline, Goals, Progress, Capture, or Kairo's active workflows.

By default, Settings should show a category list rather than a long form:

- Kairo
- Sync
- Reminders
- Interaction
- Appearance
- About

Each category should open a full-screen detail surface. The swipe actions toggle
belongs in Interaction.

## Visual And Component Primitive Decisions

Reference board: [Component primitives board](./assets/component-primitives-board.png).

This pass defines the reusable mobile UI system that supports the agreed
navigation, interaction primitives, and screen mappings.

Primitives to define:

- Typography
- Color
- Spacing and density
- Task row anatomy
- Goal row anatomy
- Buttons and action hierarchy
- Bottom sheets
- Full-screen surfaces
- Empty states
- Banners
- Toasts
- Motion
- Notifications
- Sound
- Haptics and vibration

### Visual personality should be calm, precise, and quietly warm

Pravah mobile should reduce anxiety and support clear execution. The visual
system should feel calm, precise, and quietly warm rather than playful,
corporate, or generically AI-futuristic. Everyday surfaces should use warm
neutrals, ink text, functional status colors, and restrained motion.

Purple should remain as a signature accent, not the app-wide atmosphere. Use it
sparingly for Kairo, intelligence moments, selected states, or special emphasis.
The core product should not become purple-forward by default.

### Typography should keep Geist and sharpen hierarchy

The current mobile implementation already uses Geist and Geist Mono through
`expo-font`, with rendering gated until fonts load. Keep Geist as the product
typeface for now rather than introducing a new font family without a stronger
reason. The redesign should improve type usage through hierarchy, spacing, and
role discipline instead of changing the font first.

Use Geist Sans for display, headings, Task titles, body copy, and controls. Use
Geist Mono sparingly for compact metadata, counts, dates, priority labels, and
diagnostic/log-like details. Typography should make Tasks feel actionable and
metadata scannable, not decorative.

Settings may include an Appearance preference for font style, but the current
implemented option is Geist only. Do not expose Humanist or System until the
typography system moves from static `StyleSheet` token spreads to dynamic
runtime tokens. Exposing inactive font choices would be a compatibility layer,
not a working setting.

Future font options should be a small curated set rather than an open font
picker, because Task rows, sheets, and metadata depend on predictable line
height and truncation behavior. Any alternate font must preserve legibility for
Task titles, compact metadata, Hindi/English mixed text if supported, and small
mobile controls.

The type scale should preserve clear role separation: strong destination
titles, readable Task and Goal titles, compact but legible metadata, and no
all-caps metadata where sentence case would be easier to read.

### Color should default to warm light-neutral

The redesign baseline is warm light-neutral surfaces by default. The redesigned
mobile flows prioritize anxiety reduction, readable triage, and longer review
sessions; warm light surfaces better support that baseline.

Everyday UI should use warm off-white backgrounds, slightly elevated neutral
surfaces, ink text, muted dividers, and functional status colors. Purple remains
a signature accent for Kairo, intelligence moments, selected states, or special
emphasis, not the dominant app color.

Dark mode should be treated as a first-class Appearance preference once the
light system is stable, not as the default redesign source of truth.

### Spacing should use comfortable density

The redesign should use comfortable density by default: thumb-friendly,
scannable, and calm without becoming airy marketing UI. Task rows should expose
enough information for fast triage while keeping touch targets safe. Sheets
should give inputs and actions enough breathing room. List screens should still
show enough Tasks to make Inbox and Timeline efficient.

Compact density can become an Appearance preference later, but the default
should optimize for trust, readability, and reduced mis-taps.

### Task rows should be stable, scannable action units

Task rows should keep stable anatomy across Inbox, Timeline, and Progress:
title, one line of context metadata, one primary visible action, and optional
status or Goal signal. The primary action changes by surface: Schedule in
Inbox, Complete in Timeline, and Reopen or read-only inspection in Progress.

Rows should not become mini forms. Editing, multi-option decisions, and
destructive actions belong in the quick-action sheet, full-screen edit flow, or
confirmation dialog depending on complexity and risk.

### Goal rows should show direction and motion

Goal rows should show title, health or status, a progress signal, the next
linked Task preview when one exists, and one motion-oriented action such as
Plan next or Add Task. They should not show all linked Tasks, edit controls, or
dense metadata by default.

Tapping a Goal row should open the full-screen Goal detail surface. Goal row
actions should push movement toward the outcome; editing and destructive
actions belong in detail or overflow.

### Actions should have one clear primary per context

Each local context should expose only one primary action. Primary actions use
filled or high-emphasis treatment; secondary actions use outlined, tonal, or
subtle treatment; destructive actions stay low-emphasis until confirmation.
Avoid multiple filled buttons in one row, sheet, or full-screen form unless one
is visually dominant and the other is clearly secondary.

This keeps Schedule, Complete, Save, Apply, Reopen, and Kairo action-plan
confirmation visually unambiguous.

### Bottom sheets should feel like temporary tools

Bottom sheets should have a clear title, optional one-line context, one primary
action, a dismiss handle or close affordance, and content capped to the current
task. They should preserve the user's visual relationship to the screen behind
them.

Sheets should not contain nested sheets, tabs, deep scrolling, or broad
multi-section workflows. If a sheet needs those, the interaction should become
a full-screen surface.

### Full-screen surfaces should feel like committed workspaces

Full-screen surfaces should have a clear top bar with back or close, stable
title, optional subtitle or status, sectioned content, and a persistent or
bottom-anchored primary action only when needed. They should be used for
sustained work, multi-section editing, detail navigation, history, provider
setup, Settings categories, and complex creation flows.

Full-screen surfaces should own navigation depth. They should not look like
oversized sheets, and they should not be used for quick contextual choices.

### Empty states should teach the surface's job

Empty states should explain the current surface's role and offer one next
action. They should use product-specific copy rather than generic "nothing
here" language:

- Inbox: "Everything has a place."
- Timeline: "Today is clear."
- Goals: "Choose one outcome to move."
- Progress: "Complete a Task to start seeing momentum."

Empty states should avoid large decorative illustrations, celebration overload,
and multiple competing calls to action.

### Banners should carry persistent screen-level conditions

Banners should be compact, actionable status blocks for conditions that affect
trust or execution: offline or sync issues, notification permission gaps,
overdue backlog doorway, degraded Kairo availability, or provider setup needed.

Banners should persist while the condition matters and should be dismissible
only when dismissal does not hide a real problem. One-off success should use a
toast instead of a banner.

### Toasts should confirm successful reversible actions

Toasts should be short, low-drama feedback after successful reversible actions:
Task captured, Task scheduled, Task completed, Task reopened, or Kairo changes
applied. A toast may include one contextual action such as Undo, Schedule, View
in Timeline, or Review.

Toasts should not be used for errors the user must fix, persistent degraded
conditions, or complex explanations. Those belong inline, in a banner, or in a
reviewable surface.

### Motion should clarify state changes

Motion should clarify state changes, not decorate. Use short ease-out
transitions for sheet entrance, row completion or removal, filter expansion,
tab content change, Kairo plan review, and toast appearance. Motion should make
the app feel responsive and calm.

Avoid bounce, elastic motion, excessive parallax, slow animations, and motion
that delays task completion. Respect reduced-motion settings when available.

### Notifications should support trust and execution only

Notifications should be reserved for time-sensitive trust and execution needs:
due Tasks, overdue triage reminders, sync or account problems that require user
action, and Kairo completed long-running work if the user started that work.
Pravah should not send generic engagement nudges.

Notification controls should live in Settings -> Reminders, with quiet hours
and per-category toggles. Notification permission gaps should appear as banners
where relevant and in Settings, not as disappearing toasts.

### Sound should be opt-in and sparse

Sound should be off by default. If enabled, it should use very subtle cues only
for successful completion or capture and critical attention states. Pravah
should not play sounds for every tap, navigation change, sheet open, or routine
save.

Sound controls should live in Settings, likely under Interaction or Reminders,
and should respect device silent mode and platform expectations.

### Feedback should use the Expo-native stack through semantic helpers

Pravah should use the existing Expo-native stack for sensory feedback:
`expo-haptics` for in-app haptics, `expo-audio` for optional in-app sound
effects, and `expo-notifications` for notification sound and vibration
behavior. Do not add another third-party feedback library unless a concrete
platform gap appears.

The implementation should introduce a semantic feedback layer rather than
calling sound or haptic APIs directly from screens. Example events:

- `feedback.selection()`
- `feedback.success()`
- `feedback.warning()`
- `feedback.error()`
- `feedback.captureSaved()`
- `feedback.taskCompleted()`
- `feedback.kairoPlanApplied()`

The semantic layer should respect Settings preferences for haptics and sound,
device silent mode and platform expectations, and reduced-motion or
accessibility settings where relevant.

### Haptics should be subtle and functional

Haptics and vibration should reinforce meaningful state changes, not every
interaction. Use light feedback for successful capture or completion, selection
changes, sheet snap, and Kairo action applied. Use stronger feedback only for
destructive confirmation, critical warning, or error states.

Pravah should not vibrate constantly while scrolling, dragging, or navigating.
Haptics should be controlled by a Settings -> Interaction toggle and routed
through the semantic feedback layer.

## Implementation Sequencing

The redesign should ship as incremental, testable slices rather than one large
rewrite. Each slice should preserve the current data model and existing
business behavior unless the slice explicitly changes interaction semantics.

### Slice 1: Design System Foundation

Build the reusable foundation before changing screens:

- Add warm light-neutral theme tokens.
- Keep Geist as the only implemented font preference until dynamic typography
  tokens exist.
- Add comfortable density tokens and leave room for a future compact density
  preference.
- Add semantic action styles: primary, secondary, subtle, destructive, disabled.
- Add semantic feedback helpers over `expo-haptics` and `expo-audio`.

Validation:

- Typecheck token and preference changes.
- Verify font loading and fallback behavior.
- Verify haptic and sound preferences can disable sensory feedback.

### Slice 2: Shared Interaction Components

Create shared primitives before redesigning destination screens:

- Task row with stable anatomy and surface-specific primary action.
- Goal row with health, progress, next linked Task preview, and motion action.
- Bottom sheet shell for temporary tools.
- Full-screen surface shell for committed workspaces.
- Toast and banner components with the agreed feedback rules.
- Empty-state component with surface-specific copy.

Validation:

- Unit-test prop behavior and action routing.
- Check touch target size and text truncation.
- Verify no component requires swipe gestures.

### Slice 3: Inbox And Capture

Start with the intake loop because it affects daily use and downstream
Timeline/Goals behavior:

- Redesign Inbox as a triage queue for Tasks without a Deadline.
- Move search/filter into inline collapsed control plus full filter sheet.
- Make Schedule the primary visible Inbox row action.
- Add Task quick-action sheet for Inbox.
- Redesign Capture as a minimal bottom sheet with concrete Deadline presets.
- Add contextual post-save toast actions.

Validation:

- Existing Inbox and AddTaskSheet tests should be updated or expanded.
- Verify no vague Deadline preset such as This week appears.
- Verify save returns to the original screen unless the user chooses a toast
  action.

### Slice 4: Timeline

Redesign the execution loop after Inbox/Capture are stable:

- Default Timeline sequence: overdue doorway, Today, near future, Later.
- Keep overdue as compact doorway into triage sheet.
- Make Complete the primary visible Timeline row action.
- Add Timeline Task quick-action sheet with Complete and Reschedule first.
- Keep heavy date jumping behind a collapsed control or sheet.

Validation:

- Existing Timeline and overdue triage tests should be updated or expanded.
- Verify overdue does not flood the default Timeline.
- Verify Timeline remains usable with no overdue, empty Today, and many Tasks.

### Slice 5: Goals

Redesign direction-first planning:

- Compact Goal list with health, progress, and next linked Task preview.
- Plan next or Add Task as the primary row action.
- Full-screen Goal detail instead of modal detail.
- Shared Goal creation flow from Capture and local New Goal.

Validation:

- Goal storage and mutation behavior should remain unchanged unless explicitly
  migrated.
- Verify Goals does not duplicate Inbox or Timeline task-list behavior.
- Verify linked Task previews do not become hidden navigation.

### Slice 6: Progress

Redesign reflection and history:

- Recent momentum summary first.
- Recent Completed Tasks second.
- View history full-screen route for full ledger, search, and filters.
- Completed Task read-only sheet with Reopen, View linked Goal, Delete.

Validation:

- Existing completed and stats tests should be updated or expanded.
- Verify Progress does not use Analytics, Stats, or Dashboard language in
  user-facing UI.
- Verify Reopen routes to Inbox or Timeline based on Deadline.

### Slice 7: Kairo

Redesign cross-cutting assistance:

- Contextual starter sheet based on active tab.
- Compact input by default, no blank transcript first.
- Reviewable action plans before mutation.
- Full-screen expansion for history, provider setup, multi-step plans, and
  long-running work.

Validation:

- Existing Kairo policy/action tests should remain the safety net.
- Verify state-changing actions require explicit confirmation.
- Verify Kairo failures use inline state or banners, not disappearing toasts.

### Slice 8: Settings And Preferences

Convert Settings into the full-screen configuration surface:

- Category list: Kairo, Sync, Reminders, Interaction, Appearance, About.
- Add Interaction preferences for swipe actions, haptics, and sound.
- Keep the warm-light, Geist, comfortable-density baseline explicit; expose
  only the working tab-order preference.
- Keep notification controls under Reminders.

Validation:

- Existing settings navigation and notification tests should be updated.
- Verify swipe actions default off.
- Verify Settings does not contain everyday workflow controls.

### Slice 9: Final Integration Polish

After all surfaces are migrated:

- Audit copy against canonical terms in `CONTEXT.md`.
- Audit motion and reduced-motion behavior.
- Audit banners, toasts, haptics, sound, and notification behavior against
  preferences.
- Run targeted tests, then full mobile typecheck and test suite.

Validation commands:

```bash
cd apps/mobile
npm run typecheck
npm test
```

Do not run Expo/EAS/native builds unless explicitly requested.

## Current Implementation Notes

Implemented on `mobile-ux-redesign` in this pass:

- Warm light-neutral mobile tokens, light Expo style, light splash and
  notification color.
- Settings categories: Kairo, Sync, Reminders, Interaction, Appearance, About.
- Interaction settings for swipe actions, haptics, sound, and reduced motion.
- Swipe actions disabled by default; visible Task row actions are now required.
- Preference-gated haptics through `lib/haptic.ts` and semantic feedback through
  `lib/feedback.ts`.
- Optional sound system through `expo-audio` with bundled quiet cues under
  `apps/mobile/assets/sounds/`.
- Inbox collapsed search/filter launcher with active filter pills.
- Timeline focused default view with later sections summarized.
- Concrete Capture and overdue triage language: Today, Tomorrow, Later this
  week with a visible day, and Week end with a visible date.
- Full-screen Goal detail presentation instead of a centered modal card.
- Explicit bottom-tab labels around the fixed Capture action.
- Progress copy changed from vague "this week" language to trailing 7-day
  windows.

Deferred deliberately:

- Dark/system theme switching. The app now ships the redesigned light system;
  additional themes should be exposed only after dynamic theme tokens exist.
- Humanist/System font switching. The current static `StyleSheet` token spread
  cannot apply font changes globally at runtime, so no inert font control is
  exposed.
- Full Task quick-action sheet and Progress history drill-down. Task rows now
  expose primary visible actions first; the richer object action surfaces are
  the next implementation layer.

## Open Terminology Issues

These need careful discussion before renaming anything:

- `Timeline` is a canonical term in `CONTEXT.md`, and the glossary says to
  avoid `calendar` and `planner`. Renaming the tab to `Plan` would conflict
  with existing language unless we update the glossary.
- `Progress` is canonical and the glossary says to avoid `Insights`, `Stats`,
  `Analytics`, and `Dashboard`. The UI already labels the tab as `Progress`
  while some code still uses `InsightsScreen`.
- `Goal` is canonical and should not be diluted into vague words like
  objective or target.
- `Kairo` is canonical; do not call it assistant or bot in user-facing language
  unless the glossary changes.
