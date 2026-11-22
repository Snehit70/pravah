---
status: accepted
---

# Android home-screen widget

Pravah ships Android home-screen widgets through `react-native-android-widget`: Today (4×2), Agenda (4×4, scrolling), Focus (2×2), and Capture (2×1 and 1×1). They render from a snapshot the app writes to AsyncStorage after every live sync. The widget never fetches to draw. It re-buckets the snapshot against the current clock, so it draws instantly, works offline, and rolls over at midnight on the system's 30-minute update without the app running.

## Decisions

- **Snapshot, not queries.** `buildWidgetSnapshot` keeps open dated tasks up to two days ahead plus today's completions. The app only subscribes to today's completions on the Timeline tab, so the previous snapshot's completions carry forward unless the task comes back open.
- **Complete from the widget.** Ticking a circle runs a headless task. It marks the task pending (drawn done, "Saving…"), mints a Convex token from the stored better-auth session, and calls `tasks.completeTask` over HTTP. Offline keeps it pending, and the app sends it on the next foreground. A server rejection drops it and shows a red notice for 30 minutes. `completeTask` is idempotent, so a duplicate send is harmless. The pending list has its own storage key, apart from the app's retry queue, because the running app owns that queue in memory.
- **Everything else opens the app** through `pravah://capture | today | inbox | task/<id>` links. The library pins these intents to the app's own package, so dev and prod installs on one phone stay separate.
- **Theme.** The widget follows the app's accent and theme preference. With the System theme, Android picks the light or dark tree from night mode.
- **Stale after 3 hours.** Past that, the footer turns amber and shows when it last synced.
- **Sign-out clears it.** Sign-out, wipe, and a lost session remove the widget keys and redraw the signed-out state.

## Compatibility

The library looks up its native module at import time and throws when the module is missing. Only `src/widget/widgetBridge.ts` reaches it, after checking that the module is present, and through a lazy `require`. iOS, web, tests, and APKs built before this change load none of it. The native fingerprint changes with this plugin, so the OTA workflow refuses to ship this bundle to older runtimes. Widgets arrive with the next APK release.

## Consequences

- Widget layouts are not React Native views. The library calls each component as a plain function and builds RemoteViews from the result, so fragments, hooks, and components that return `null` are not allowed. `src/test/widgetLayouts.test.tsx` walks every widget in every state the same way.
- Widget names in `app.config.ts` and `src/widget/widgetNames.ts` must stay in step. Renaming one orphans widgets users have already placed.
