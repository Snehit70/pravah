# Mobile UX Orchestration

This document explains how the mobile app should feel and behave during loading,
keyboard interaction, settings editing, and transitions.

The goal is not just visual polish. The goal is trustworthy behavior on a real
Android device where bottom sheets, scroll views, auth restore, and network
latency all interact.

## UX Priorities

The mobile UX stack is intentionally ordered like this:

1. Correctness
2. Reachability
3. Perceived performance
4. Motion polish

That means:

- a field must stay reachable above the keyboard before it gets a nice animation
- cached data should stay visible before a skeleton replaces anything
- one tab should fail locally before the entire shell disappears

## Loading System

### 1. Boot loading

Use `BootScreen` for app-gate states:

- font loading
- secure auth cache restore
- workspace bootstrap after session recovery

These are full-shell waits, so they should not pretend to be list data.

### 2. First list load

Use structural skeletons from `src/components/LoadingSkeleton.tsx`.

Current principles:

- match the rhythm of the final layout
- show task-row structure, not arbitrary bars floating in space
- keep animation cheap: one opacity pulse over a static structure
- avoid per-row shimmer effects that feel noisy on Android

### 3. Form load

For Kairo settings, use a form-shaped skeleton rather than disabled blank fields.

Why:

- disabled blank inputs look broken
- users need to understand that data is still loading from secure storage
- the skeleton should communicate structure without inviting interaction too early

### 4. Background refresh

Do not replace already visible task data with skeletons during refresh.

Use this model instead:

```text
stale visible data
-> background refresh
-> data updates in place
-> optional subtle sync indicator
```

This is better than blanking the list because it preserves continuity.

## Spinner vs Skeleton Rule

Use a spinner only when there is no meaningful structural preview to show.

Good spinner cases:

- one-off inline action (`Saving…`, `Syncing…`)
- tiny surface where a skeleton would be heavier than the action itself

Good skeleton cases:

- list cold start
- form cold start
- timeline cold start

Bad skeleton case:

- replacing live content during a tiny refresh cycle

## Settings Sheet UX

### Current structure

The settings sheet is a long-form bottom sheet with this order:

1. Assistant / Kairo config
2. Sync
3. Alerts
4. Account

This order is deliberate.

The Kairo section has text inputs and is frequently edited. Putting it near the
top reduces long-scroll + keyboard conflicts and makes the highest-friction
interaction easier to reach.

The Kairo form itself is also intentionally tiered:

- provider + API key are the default path
- endpoint URL + model are behind an `Advanced` toggle

This keeps the common mobile path short while still preserving full provider configurability.

The `Advanced` section auto-opens only when the persisted config has an endpoint URL or model that diverges from the active provider's defaults. Empty fields are treated as "use defaults" and do not auto-open the section. The decision is taken once when the config loads from secure storage, not on every keystroke.

### Section jump chips

The chip row at the top of the sheet is both a jump control and a passive position indicator. Tapping a chip scrolls to the matching section header; manually scrolling also updates which chip is highlighted.

- chips are pressable and use captured `onLayout` offsets to scroll, so behavior stays reliable on Android bottom sheets
- the active chip is filled with the accent color so the user can tell where they are
- scrolling honors `useReducedMotion` — reduced motion jumps without animating
- the active chip tracks manual scroll position via a lightweight `onScroll` handler that compares `contentOffset.y` against the captured offsets — no per-frame animations, just a single state update when the user crosses a section boundary

### Save / clear feedback

Save in Kairo settings is a filled accent chip rather than a text link, and it briefly transitions to a green `Saved` state after a successful write before returning to `Save`. Clear behaves the same way with `Cleared`. The state never blocks the UI longer than ~1.8 seconds, and there is no separate noticeable banner.

### Keyboard rules

The settings sheet must remain usable on Android when the keyboard is open.

Current rules:

- use bottom-sheet keyboard handling (`extend`, `restore`, `adjustResize`)
- use `BottomSheetTextInput` for inputs inside the sheet
- keep `keyboardShouldPersistTaps="handled"` on the scroll container
- leave generous bottom padding so the last field can scroll clear of the keyboard
- group long settings sections into visual cards so the scroll surface reads in chunks instead of as one undifferentiated column

### API key field rules

- hidden by default
- explicit `Show` / `Hide` toggle
- no assumption that masked text is enough feedback

The user must be able to verify whether the saved key is correct.

## Motion Rules

Motion should explain state, not compete with it.

### Good motion

- sheet open/close
- dimming background when Kairo is active
- subtle skeleton pulse
- list item feedback when dragging or completing

### Bad motion

- multiple unrelated surfaces animating at once
- shimmer-heavy loading that costs more than the loaded content
- transitions that hide keyboard/focus bugs instead of fixing them

### Current policy

Use `motion` tokens from `src/theme/tokens.ts`.

Preferred animated properties:

- opacity
- transform

Avoid making layout correctness depend on animation timing.

### Reduced motion

The mobile app subscribes to the OS `reduce motion` setting via `useReducedMotion()` in `src/hooks/useReducedMotion.ts`.

Surfaces that already honor it:

- skeleton pulse: collapses to a single static dim state, no looping opacity, no translate
- settings section-jump scroll: jumps without scroll animation
- Kairo advanced section reveal: skips fade entering/exiting

Rules for new motion:

- never gate correctness on animation completion
- if a surface plays a repeating animation, it must check `useReducedMotion` and provide a static equivalent
- prefer dropping competing per-card entrance animations entirely over making them all conditional — the settings sheet now uses no per-card `FadeInDown` so the section reveal feels like one quiet surface instead of four overlapping ones

## Error UX

### Root-level fallback

Use only when the app shell is truly unrecoverable.

### Screen-level fallback

Use when a single task tab fails.

This gives the user a bounded failure mode:

```text
Timeline tab breaks
-> Timeline fallback shown
-> Header survives
-> Tab bar survives
-> Settings still reachable
-> User can switch tabs or retry
```

## Recommended QA Flows

### Settings keyboard flow

1. Open Settings
2. Tap Kairo API key
3. Confirm the sheet expands cleanly
4. Confirm the focused field is not trapped under the keyboard
5. Scroll to base URL and model while keyboard is still open
6. Toggle Show / Hide
7. Save and reopen settings

### Cold-start task flow

1. Kill the app
2. Relaunch on device
3. Watch auth restore
4. Verify skeletons appear only on true cold-load surfaces
5. Verify tabs switch without blank flashes

### Failure isolation flow

1. Trigger a render error during development in one tab
2. Confirm only that tab shows the fallback
3. Confirm other tabs and settings remain reachable

## Known Tradeoffs

These are intentional tradeoffs, not accidental gaps:

- skeletons are approximate, not pixel-perfect clones of final content
- Kairo still needs a full-workspace query when open because AI context quality matters more there than minimal query count
- the settings experience still lives in one bottom sheet instead of a nested native stack, because that keeps parity with the current product model and reduces navigation complexity

If the settings surface grows substantially beyond the current scope, splitting Kairo configuration into a dedicated sub-screen will likely be the next step.
