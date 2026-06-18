# Local windowed task reminders

The mobile Reminder system is deliberately **device-local** (`expo-notifications`), not server-driven push. A Task's Deadline may carry an optional time-of-day: timed tasks are reminded at that time plus a global lead-time offset, while date-only tasks roll up into a single morning digest that replaces the former generic daily reminder. Because local scheduled notifications have frozen content and iOS caps pending notifications at 64, we only schedule a **rolling window** (next ~7 days), reschedule on every task mutation, and re-sync the window whenever the app is foregrounded — accepting that a digest count can be as-of-last-foreground rather than live.

## Considered options

- **Server-driven push (Convex → FCM/APNs).** Rejected: large infra step for a single-user app, and out of scope for an upgrade that only broadens local reminder types.
- **Background task (`expo-background-task`/`TaskManager`) to recompute the schedule while closed.** Rejected: it is a native module requiring an EAS rebuild (violates the OTA-safe mobile preference), and background timing is unreliable on iOS regardless.
- **Schedule all reminders up front with no window.** Rejected: silently breaches the 64-notification ceiling on busy weeks and drops reminders.

## Consequences

- The on-device schedule is only guaranteed correct as of the last app foreground; a day with no qualifying tasks produces no morning notification (a deliberate change from the old unconditional daily nudge).
- Quiet hours suppresses only auto-chosen times (the morning default/digest is clamped outside the window); reminders at a user-set time fire regardless.
- All of this ships over-the-air, since `expo-notifications` is already in the binary.
