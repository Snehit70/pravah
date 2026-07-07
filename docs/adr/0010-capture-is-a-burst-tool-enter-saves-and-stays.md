# Capture is a burst tool: Enter saves and stays open

The capture sheet is optimized for *frictionless brain-dump* — tap the `+`, land in a hot title field, and empty a head full of loose thoughts as fast as they arrive. The load-bearing decision that follows is that **the return key saves the task and keeps the sheet open** (title cleared, cursor still hot) rather than saving and closing. Capturing five thoughts costs one open, not five. Leaving is a separate, explicit act: a footer **"Save & close"** verb, a backdrop tap, or a swipe-down. This inverts the React Native `Modal` default (where the primary submit closes) on purpose, so the surprise is recorded here rather than re-derived.

## Considered options

- **Save & close (the default).** Rejected as the *primary* behavior. It matches muscle memory from single-shot forms, but it turns a burst of related captures into a reopen-per-item grind, which is the exact friction that makes people stop capturing and start forgetting. Retained only as an explicit verb ("Save & close").
- **Save & stay, reset context each time.** Rejected. Keeping the sheet open but wiping the when/goal/priority after every save is the purest "unrelated loose items" model, but it fights the deliberately-visible scheduling and goal controls: batch-adding eight tasks to one goal for Friday would mean re-setting that context eight times.
- **Save & stay, sticky context (chosen).** The title always clears, but the when/goal/priority selections **persist across the burst** and stay visibly lit so it is obvious they are carrying over. This extracts a batch-entry tool ("add these to the Q3 goal for Today") from state behavior alone, without adding a single control.
- **Gesture-only close (no footer button).** Rejected. Most minimal, but a sheet with no visible primary action is a discoverability trap for *how do I leave*, and it contradicts the product's keep-the-controls-visible lean.

## Consequences

- **Two distinct verbs, no ambiguity.** Return = save & add another (stay). Footer "Save & close" = save the current title and dismiss. Backdrop tap / swipe-down = dismiss, guarded by the existing unsaved-draft check so a typed-but-not-saved title is never lost silently.
- **Every save needs an in-sheet confirmation.** Because the sheet no longer closes on save, the old "the sheet went away" signal is gone. A save now flashes an inline **"✓ Saved · N captured"** near the outcome line (~500ms, reduced-motion aware) over the existing capture sound + light haptic — feedback that must stay tasteful on the fifth rapid fire, not just the first.
- **Sticky context can carry a stale intent.** If the next thought in a burst is unrelated, the persisted when/goal/priority must be cleared by hand (one tap back to Inbox / No goal). This is the accepted cost of making batches trivial; the lit selections make the carry-over legible so it is a choice, not a trap.
- **Swipe-down is a net-new gesture.** Pan-to-dismiss (gesture-handler + Reanimated, springs back under threshold) is built as part of this work rather than deferred, so leaving a burst feels as native as entering it.
- **Fully OTA-safe.** The model is JS-only (Modal + Reanimated + gesture-handler already present), no native dependency.
