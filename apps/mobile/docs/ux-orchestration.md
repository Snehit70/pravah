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

Use `BootScreen` only for true app-gate states:

- font loading
- secure auth cache restore

Workspace bootstrap after session recovery is no longer a full-screen blocker.

Current rule:

```text
launch gate
-> shell appears
-> brief branded handoff overlay fades away
-> cached workspace snapshot or list skeleton
-> live session/bootstrap/query reconciliation happens in background
```

This keeps the boot experience short in the common case where the user is
already signed in and just wants their inbox back.

`BootScreen` should not be used for any phase that can safely happen inside the
real shell.

### 2. First list load

Use structural skeletons from `src/components/LoadingSkeleton.tsx`.

The preferred loading handoff is:

```text
BootScreen
-> real shell
-> short BootScreen-to-shell crossfade
-> cached workspace snapshot if present
-> otherwise structural list skeleton
-> live data replaces the placeholder in place
```

The crossfade should stay short enough that it never delays interaction. It is
there to smooth the visual cut between boot and shell, not to hide loading.

Current principles:

- match the rhythm of the final layout
- show task-row structure, not arbitrary bars floating in space
- keep animation cheap: one opacity pulse over a static structure
- avoid per-row shimmer effects that feel noisy on Android

### 2a. Large task lists

Task-list screens should not hand every row to React on first paint. Use the
shared incremental row release helper in `src/hooks/useIncrementalRowCount.ts`.

Current policy:

- first paint releases 24 rows
- follow-up batches release 24 rows every 32ms
- keep `FlatList` virtualization conservative (`initialNumToRender`,
  `maxToRenderPerBatch`, `updateCellsBatchingPeriod`, `windowSize`)
- show the lightweight `Preparing more tasks...` footer while rows are still
  being released

Current enforced screens:

- `InboxScreen.tsx`
- `TimelineScreen.tsx`
- `CompletedScreen.tsx`

This is a responsiveness safeguard, not pagination. All data can already be in
memory; the helper only prevents large workspaces from scheduling too much React
rendering in the same frame window.

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

## Boot Strategy

### Async-first shell

The mobile app should assume this is the common cold-start path:

1. The user was already signed in previously.
2. Their last-known workspace snapshot is still useful.
3. Auth validation and Convex bootstrap can finish after first paint.

That means:

- render the shell as soon as the launch gate clears
- use cached local workspace data when available
- do not hold the whole app on `storeUser` / `claimLegacyData`
- if the remote session later proves invalid, fall back to sign-in after paint

This is intentionally optimistic because Pravah is a single-user personal tool,
not a high-risk admin surface.

## Settings UX

### Current structure

Settings is a full-screen drill-down modal. The home surface is a category
list, and each category opens a focused detail screen:

1. Kairo
2. Sync
3. Reminders
4. Interaction
5. Appearance
6. About

This order is deliberate.

Kairo remains first because provider setup is the highest-friction
configuration flow. Sync and reminders follow because they expose operational
trust state. Interaction and Appearance hold preference controls. About stays
last because version, diagnostics, and account actions are low-frequency.

The Kairo form itself is also intentionally tiered:

- provider + API key are the default path
- endpoint URL + model are behind an `Advanced` toggle

This keeps the common mobile path short while still preserving full provider configurability.

The `Advanced` section auto-opens only when the persisted config has an endpoint URL or model that diverges from the active provider's defaults. Empty fields are treated as "use defaults" and do not auto-open the section. The decision is taken once when the config loads from secure storage, not on every keystroke.

### Category navigation

The Settings home uses icon-plus-text category rows with short status summaries.
Rows are navigation entries, not inline form controls. The detail screen title
changes to the selected category, and the leading header action becomes Back.

The category list uses explicit divider views between rows instead of Android
hairline borders on pressable rows, so separators render consistently on device.

### Save / clear feedback

Save in Kairo settings is a filled accent chip rather than a text link, and it briefly transitions to a green `Saved` state after a successful write before returning to `Save`. Clear behaves the same way with `Cleared`. The state never blocks the UI longer than ~1.8 seconds, and there is no separate noticeable banner.

### Keyboard rules

Settings detail screens must remain usable on Android when the keyboard is open.

Current rules:

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
- list item feedback when completing (drag is currently disabled)

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
- launch handoff overlay: drops the crossfade and cuts directly to the shell

Rules for new motion:

- never gate correctness on animation completion
- if a surface plays a repeating animation, it must check `useReducedMotion` and provide a static equivalent
- prefer dropping competing per-card entrance animations entirely over making them all conditional — the settings sheet now uses no per-card `FadeInDown` so the section reveal feels like one quiet surface instead of four overlapping ones

## Android Ergonomics

These rules exist because Android has a smaller default touch target tolerance than
iOS and no system-level equivalent of `UILargeContentViewer`. Without an explicit
policy, small interactive elements accumulate across the codebase until they are
consistently unreachable on mid-range Android devices.

### Touch target policy

**Minimum `hitSlop`: 12** on every `Pressable`.

Use the literal number `12`, not a token, because this is a physical constraint not
a design decision. A `hitSlop` value below 12 must be treated as a bug.

Current enforced sites:

- `KairoSettingsSection.tsx` — API key show/hide toggle, Advanced toggle, Save, Clear
- `SettingsSheet.tsx` — Close button, section-jump chips, all inline action links
- `AddTaskSheet.tsx` — Add and Discard use scalar `hitSlop={12}`; the
  Inbox/Today mode toggles and the More/Less toggle use vertical-only `hitSlop`
  because they sit on the same row with sibling controls inside the touch radius
- `EditTaskSheet.tsx` — Cancel and Save use vertical-only `hitSlop`; they sit
  side-by-side in `styles.actions` with only `spacing.lg` between them
- `TaskMetaFields.tsx` — Due, Clear, Priority share one row and use vertical-only
  `hitSlop` to keep neighboring hit regions from overlapping
- `BottomTabBar.tsx` — tab targets use vertical-only `hitSlop` plus a minimum
  48pt visual height so adjacent tabs do not overlap horizontally
- `TaskCard.tsx` — row press target and completion checkbox

When adding a new `Pressable` to any screen or component:

1. If the visual target is at least 44×44 pts, `hitSlop` is optional.
2. Otherwise set `hitSlop={12}` unconditionally.

Use a `hitSlop` object (`{ top, bottom, left, right }`) only when adjacent
sibling controls would otherwise overlap the touch radius. Rule of thumb: if
a sibling `Pressable` sits within 24pt of the target's edge on an axis,
expansion on that axis must be zeroed. Bottom tabs, the EditTaskSheet action
row, the AddTaskSheet mode row, and the TaskMetaFields meta row all qualify;
isolated controls keep the scalar form.

### Keyboard dismiss policy

The software keyboard must be dismissed **before** calling `onClose()` on any
bottom sheet that contains text inputs.

Rule:

```ts
// correct
Keyboard.dismiss();
onClose();

// incorrect — keyboard may linger over next surface on Android
onClose();
```

Where to apply this:

- `SettingsSheet.tsx` `onChange` handler (pan-down close)
- `SettingsSheet.tsx` explicit Close button `onPress`
- Any future bottom sheet that renders `BottomSheetTextInput`

Why: on Android, dismissing a bottom sheet without first calling `Keyboard.dismiss()`
can leave the keyboard open over the next focused surface, compressing the layout
until the user taps elsewhere.

`AddTaskSheet` and `EditTaskSheet` already followed this pattern before this policy
was written. `SettingsSheet` was the only outlier.

### Hardware back button

Android's hardware/gesture BACK is intercepted at the app root
(`MobileApp` in `App.tsx`). When any overlay is open it closes the topmost
one and consumes the event; only when no overlay is open does it return
`false` and let the OS exit the app.

Priority order (closes the first match):

1. Settings sheet (`isSettingsModalOpen`)
2. Kairo sheet (`isKairoActive`)
3. Edit task sheet (`isEditSheetOpen`)
4. Add task sheet (`isAddSheetOpen`)

Without this, BACK from an open Capture sheet would dismiss the sheet's
gesture layer *and* pop the activity in one press, sending the user to
the launcher.

### Capture sheet primary action

`AddTaskSheet` always renders the primary "Add task" button — it is
disabled while the title is empty, never hidden. The "Discard" link
appears as a secondary action *below* the primary button when there are
draft changes. Earlier the two swapped places, which caused Add to
disappear the moment the user typed a single character.

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

## Runtime Diagnostics

Development builds render a floating `Diag` chip above the bottom tabs. It opens
a compact diagnostics panel with task counts, retry queue count, pending mutation
count, Kairo readiness, snapshot usage, and bootstrap readiness.

Rules:

- keep this panel behind `__DEV__`
- never include secrets, API keys, tokens, prompt text, or task titles
- prefer counts and readiness booleans over raw data
- pair panel readings with `[PRAVAH_MOBILE]` logs when debugging device issues

Kairo chat history uses `FlatList`, not `ScrollView`, so long conversations keep
the same virtualization posture as task lists. Kairo provider failures, deferred
sends, deferred replays, and network/provider errors are logged with structured
events for Logcat filtering.

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
- Settings uses an in-modal reducer rather than a native navigation stack,
  because the flow is shallow and should stay context-preserving.

If the settings surface grows substantially beyond the current scope, moving
Settings to a dedicated native stack will likely be the next step.
