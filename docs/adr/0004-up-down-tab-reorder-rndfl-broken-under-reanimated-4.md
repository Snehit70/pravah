# Reorder lists with up/down controls, not drag, while RNDFL is broken under Reanimated 4

Mobile list reordering (now including the navigation tab order) uses **up/down controls** rather than drag-and-drop. `react-native-draggable-flatlist@4.0.3` silently fails to render under `react-native-reanimated@4.x`, so drag-to-reorder is disabled app-wide and lists fall back to plain `FlatList`. Up/down controls reuse the existing `TaskCard.onReorder` accessibility pattern, work today, and ship over-the-air — so they are the chosen reorder affordance until a Reanimated-4-compatible sortable library is in place.

## Considered options

- **Drag-to-reorder via react-native-draggable-flatlist.** Rejected: the installed version renders nothing under Reanimated 4; this is the root cause, not a usable option.
- **Bespoke drag with gesture-handler + reanimated 4 directly.** Rejected for now: meaningful custom gesture/layout work for a marginal feel improvement, and it would not revive the broken task-reorder lists.
- **Replace/upgrade to a Reanimated-4-compatible sortable library.** Deferred, not rejected: this is the real fix and would restore drag everywhere (inbox, timeline, goals, tabs), but it is larger than any single reorder feature and out of scope for the tab-order work.

## Consequences

- The decision spans surfaces: the same up/down pattern covers task lists and the new tab-order editor, so the rationale is documented once here rather than re-explained per feature.
- A future reader who expects drag will find up/down instead; the reason is this constraint, not a UX preference. When the sortable library is upgraded, the reorder affordance can be revisited and this ADR superseded.
- All reorder UI stays JS-only / OTA-safe.
