# Mobile performance and workflow audit

Audit date: 22 October 2026. Source baseline: [`55b12757dc2ae6f051d49af8187be875e666da12`](https://github.com/Snehit70/pravah/commit/55b12757dc2ae6f051d49af8187be875e666da12), local `main`, initially clean. Stack: Expo 56, React Native 0.85.3, React 19.2.3, Reanimated 4.3.1, Convex 1.34.x.

## Assessment

The largest opportunities are reducing repeated persistence, bounding data reads, and preventing hidden screens from doing work. The app already uses virtualized primary lists, optimistic updates, a bounded offline snapshot, lazy tab mounting, native image uploads, upload concurrency limits, and UI-thread animation. A framework rewrite or blanket list-library replacement is not the first move.

Three workflow defects deserve attention alongside performance: the shared readiness flag can allow reminder cancellation before task queries finish; Kairo receives only Inbox tasks even though its tools promise scheduled and completed-task access; and the retry queue removes durable pending entries before the server acknowledges them.

This report contains **27 findings**. Source-confirmed means the described code path exists. It does not establish the size of its effect on a phone. Timing, memory, battery, FPS, network-byte savings, and production frequency require measurements. Priorities express recommended implementation order, not measured severity or an observed production incident.

## Evidence and limitations

- Read the application root, every current tab screen, capture/edit sheets, image coordination and storage, reminders, offline retry, authentication, integrations, Kairo, updates, backend query paths, test configuration, and CI workflows. Source links below are relative to this document; line numbers refer to the baseline commit.
- Inspected existing listeners/processes before considering a development server. No Metro or Expo server was running. No server, emulator, local build, lint, type check, or test suite was started.
- At the initial checks, `adb devices -l` and `adb mdns services` found no device. The user offered to connect a phone. Device evidence will be recorded separately if it becomes available.
- [CI for the exact baseline](https://github.com/Snehit70/pravah/actions/runs/39666553022) passed lint, root and mobile type checks, root and mobile tests, and the web build. Its mobile job reported **80 files and 666 tests passing**. These are existing CI results, not a newly executed audit suite.
- [The preceding OTA workflow](https://github.com/Snehit70/pravah/actions/runs/39666554147) succeeded. A successful release workflow does not prove which OTA a particular phone is running.
- No app behavior was changed, release triggered, production record edited, commit created, or PR opened during source research.
- Auth, network, native rendering, keyboard behavior, notifications delivered by the OS, actual offline transitions, and iOS behavior have not been functionally verified merely by reading their code.

Device pass status at 16:20 UTC on 22 October: `adb devices -l` still returned an empty list. USB inventory and mDNS discovery also did not expose the phone during checks. No startup, navigation, frame, memory, or battery result is available. The source research is complete; the physical-device pass remains pending connection.

## Workflow coverage

| Workflow | Source path reviewed | Main outcome | Device verification needed |
| --- | --- | --- | --- |
| Cold launch and returning session | LaunchGate, auth cache, bootstrap, snapshots, TTI | Readiness signal is incomplete; optional work competes with initial content | Cold/warm start distribution, first usable content, expired/offline session |
| Google sign-in and sign-out | useGoogleAuth, useWorkspaceState, auth-client | Native sign-in and storage gate exist; first bootstrap is serial by design | Account picker, cancellation, expired token, sign-out/relaunch |
| Capture, burst capture, bulk capture | AddTaskSheet, handleAddTask, bulkCreateTasks | Single capture waits for server acknowledgement; bulk capture already uses one mutation | Keyboard, repeated Enter, slow/offline save, app death |
| Edit, complete, undo, reschedule, delete | EditTaskSheet, useTaskMutations | Optimistic paths exist; bulk completion fans out; bulk schedule patches repeatedly | Tap latency, partial failure, rapid consecutive actions, undo |
| Inbox filtering and selection | InboxScreen, memoized rows | Primary list is virtualized; hidden Inbox can receive another tab's tasks | Large corpus, filters, hidden-tab selection retention |
| Timeline compact list | TimelineScreen, task queries | Virtualized, bounded initial horizon; row-release timers continue in background tabs | Fast scroll, expansion, selection, far-future tasks |
| Timeline comfortable carousel | TimelineDayCarousel | Day lists are virtualized; overdue card is not | Horizontal/vertical gesture overlap, big day, large backlog |
| Overdue preview and triage | overdue controller, preview query, sheets | Preview query is already demand-driven | Apply, undo, offline failure, large groups |
| Goals and goal detail | GoalsScreen, goals.listTasks, goalProgress | Backend detail is paginated; UI accumulates all loaded rows in a ScrollView | Several pages, long descriptions, scheduling, completed tab |
| Progress and completion history | InsightsScreen, stats aggregators, heatmap | All completed documents loaded; chart cost grows with history age | Long history, range changes, search, repeated tab revisits |
| Photo/camera/clipboard, upload, viewer | taskImageNative, coordinator, filmstrip, library | Good size/concurrency limits; progress persists too frequently; resume is serial | Five images, slow network, app background, image decode/memory |
| Kairo and chat history | Kairo, kairoAgent, kairoTools, chat storage | Supplied task scope breaks read tools; requests buffer complete JSON responses | Scheduled-task questions, timeout/Stop, long chat, context correctness |
| Calendar/Gmail and settings | integrations hook, SettingsSheet | Several subscriptions and calendar discovery start before settings is opened | Cold launch with integration enabled, token refresh, settings navigation |
| Local reminders | planner, hook, OS diff | Premature sync risk, repeated work, stale content and missing density cap | Slow launch, rename, digest count changes, more than 32 timed tasks on iOS |
| Offline snapshot and retry | snapshot/retry hooks, storage adapters | Snapshot is bounded; replay is not durably acknowledged | Disconnect, process death during replay, reconnection, duplicate prevention |
| OTA/APK update and minimum runtime | release hook, checker, app config, workflows | Deduplicated checks and release controls exist | Running OTA identity, slow update download, resume, rollback |
| Diagnostics and export | diagnostics, logger, export, metadata export | Diagnostic history is repeatedly serialized and rewritten | Full retained history, export latency, storage failure |

## Subscription inventory from source

For an authenticated workspace with the relevant components mounted, the default Inbox path enables approximately 11 query subscriptions: Inbox, Timeline, workspace images, goal progress, image budget, release control, published releases, Calendar status, Gmail status, automation credentials, and bootstrap tokens. Timeline adds today's completed-task query. Goals adds the goals and goal-links subscriptions, with an optional selected-goal page and temporary full-history fallback while summaries are unavailable. Progress adds completion history and goals/links. Overdue preview remains skipped until requested.

These are enabled hook/query shapes, not measured HTTP request counts, active server executions, or billed calls. Convex may share subscriptions and cache results. The inventory shows where to inspect startup work: several queries support unopened settings pages, and the broad image query remains enabled across all current tabs. Related code is in [App.tsx](../../apps/mobile/App.tsx), [useTaskQueries.ts](../../apps/mobile/src/hooks/useTaskQueries.ts), [useMobileRelease.ts](../../apps/mobile/src/hooks/useMobileRelease.ts), [useIntegrationsSettings.ts](../../apps/mobile/src/hooks/useIntegrationsSettings.ts), and [SettingsSheet.tsx](../../apps/mobile/src/components/SettingsSheet.tsx).

## Ranked findings

### 01. Fix task readiness before using it for reminders and startup metrics

**P1, source-confirmed correctness and measurement defect.** [useTaskQueries.ts:267-272](../../apps/mobile/src/hooks/useTaskQueries.ts) defines `isAllTasksReady` as `!includeCompletedHistory || completedHistoryQuery !== undefined`. On Inbox and Timeline, it can therefore be true while both Inbox and Timeline queries are still undefined. [App.tsx:636-641 and 812-849](../../apps/mobile/App.tsx) uses it to enable reminders and report interactivity.

With notification permission enabled and a sufficiently slow query load, the 400 ms reminder debounce can build an empty plan; [syncReminders.ts:12-25](../../apps/mobile/src/lib/syncReminders.ts) then cancels existing reminders absent from that plan. Task data arriving later should reschedule them, but the cancellation window is unnecessary. TTI can also be recorded while the active list still shows a loading state or disables actions.

Introduce separate readiness signals for active-screen interaction, complete reminder inputs, image metadata, and full completion history. Keep existing OS reminders until a complete replacement plan is available. Record TTI after real active-screen content and handlers are ready. [Expo's SDK 56 Observe instructions](https://docs.expo.dev/versions/v56.0.0/sdk/observe/) explicitly place `markInteractive` after initialization/data readiness.

Acceptance: delay Inbox/Timeline queries beyond 400 ms. Existing reminders remain scheduled and TTI does not fire while the active list is unusable. Cached read-only readiness and live mutation readiness should be reported separately.

### 02. Restore Kairo's scheduled and completed task access

**P1, source-confirmed workflow defect.** [useDisplayWorkspace.ts:173](../../apps/mobile/src/hooks/useDisplayWorkspace.ts) returns `kairoTasks: input.inboxTasks`. [App.tsx:629 and 1892](../../apps/mobile/App.tsx) passes that array, plus an Inbox-filtered copy, to Kairo. [kairoTools.ts:227 and 285 onward](../../apps/mobile/src/lib/kairoTools.ts) builds today's schedule and executes date-range, overdue, search, and completed tools from those supplied arrays. [kairoAgent.ts:273-280](../../apps/mobile/src/lib/kairoAgent.ts) runs these reads locally, without fetching missing tasks. Scheduled and completed tasks are therefore absent from a fresh request's read environment. [The existing test at line 113](../../apps/mobile/src/test/useDisplayWorkspace.test.ts) even expects the Inbox-only corpus, so green unit tests preserve this mismatch.

Supply the required live corpus or implement authenticated, bounded server reads for each tool. Completion history should load on demand rather than making every app launch fetch it. The existing horizon expansion on opening Kairo does not help if the resulting tasks never reach Kairo.

Acceptance: seed a scheduled-today task, an overdue task, a completed task, and an Inbox task. Each appropriate tool returns the correct task, including tasks outside the initial 14-day horizon, without treating unloaded data as an empty result.

### 03. Stop rewriting the complete diagnostics history every five seconds

**P1, source-confirmed repeated work; phone impact unmeasured.** [diagnostics.ts:26-30, 151-199, and 215-224](../../apps/mobile/src/lib/diagnostics.ts) retains up to three sessions, repeatedly estimates serialized size, and writes all retained sessions on a 5-second interval. There is no dirty-data check. The configured 20 MiB cap applies to each pruned session, not the whole persisted object; actual saved size has not been measured. A running timer permits up to 720 interval flush attempts per hour. The byte-pruning loop recomputes the entire remaining size after each removal.

Use a dirty generation, incremental byte accounting, a bounded queue, and append/chunk-based persistence or compact recent-event batches. Flush on useful lifecycle boundaries. Keep redaction and crash evidence. Deferring `initializeDiagnostics` until bootstrap settles is already helpful, but does not remove this repeated cost, and the gate does not necessarily wait for initial task rendering.

Acceptance: an unchanged event buffer produces no full-history rewrite; byte-limit pruning is linear; five-minute traces with realistic retained logs show serialization/write counts and JS stalls before and after.

### 04. Scope image metadata reads instead of scanning every attachment

**P1 at growing image counts, source-confirmed unbounded read.** [taskImages.ts:1230 onward](../../convex/taskImages.ts) collects every image owned by the user, reads each affected task, and serializes active images, including upload-record lookups. [useTaskQueries.ts:61-74 and 120](../../apps/mobile/src/hooks/useTaskQueries.ts) changes the query's clock argument every five minutes. [App.tsx:330-335](../../apps/mobile/App.tsx) enables images for every current tab, so the initial Timeline horizon does not bound attachment metadata.

Use visible/loaded task IDs or bounded task collections for rendering. Handle recovery expiry locally when possible. Keep a separate complete or paginated retention inventory: feeding a visible subset to `retainLocalTaskImages` would incorrectly delete cached files belonging to unseen tasks.

Acceptance: a workspace with thousands of historical attachments loads only the relevant page's metadata, while offscreen cached images survive. Record backend rows/bytes and client mapping time. Convex recommends pagination or narrower indexed reads for potentially large [`.collect()` results](https://docs.convex.dev/understanding/best-practices/#only-use-collect-with-a-small-number-of-results).

### 05. Separate Progress summaries from full completion documents

**P1 at long histories, source-confirmed unbounded read.** [useTaskQueries.ts:110](../../apps/mobile/src/hooks/useTaskQueries.ts) requests every completed task when Progress opens. [tasks.ts:375-381 and 144-158](../../convex/tasks.ts) reads the full completed timestamp range and legacy completed rows. [InsightsScreen.tsx:146-240](../../apps/mobile/src/screens/InsightsScreen.tsx) runs several aggregations, sorts completion history, and searches descriptions locally. Client list virtualization cannot reduce this query or aggregation cost.

Provide daily/hour/weekday aggregates and streak summaries, using the existing `goalProgress` projection as a design reference. Paginate history with date and search filters. Preserve exact all-time semantics through aggregates rather than silently discarding old tasks. Measure whether reacquiring history on each Progress visit materially costs bytes or latency before adding a cache.

Acceptance: initial Progress data volume depends on summary size, not all completed descriptions; opening and searching history requests bounded pages. Compare aggregation results against the existing pure functions on fixed fixtures.

### 06. Virtualize the comfortable Timeline's overdue card

**P1 for large backlogs, source-confirmed eager rendering.** [TimelineDayCarousel.tsx:466-667](../../apps/mobile/src/components/TimelineDayCarousel.tsx) uses `ScrollViewWithScrollbar` and `visibleTasks.map` for the overdue card. Every overdue row is created together. The outer horizontal FlatList only virtualizes cards; it cannot virtualize the rows inside one overdue card.

Replace this inner collection with a FlatList using stable task keys and a header/footer. Keep expanded triage state outside row instances so recycling does not lose the selected action/date.

Acceptance: with 500 overdue tasks, mounted row count remains bounded; expand, date picker, completion, and vertical/horizontal gestures remain correct.

### 07. Virtualize accumulated goal-detail tasks

**P1 for large goals, source-confirmed eager rendering.** [GoalsScreen.tsx:464-570](../../apps/mobile/src/screens/GoalsScreen.tsx) maps scheduled, unscheduled, and completed task groups inside a ScrollView. [App.tsx:298 and 1617-1622](../../apps/mobile/App.tsx) already paginates backend goal detail in batches of 50, but every loaded page adds permanently mounted rows in this view.

Use a SectionList or flattened row model with virtualization. Retain the existing server pagination and stable selection state. Distinguish a summary's total count from the number of tasks loaded for bulk selection.

Acceptance: loading ten pages does not mount 500 row trees. All/open/done switching, scheduling, selection, and Load more still work.

### 08. Keep hidden tabs mounted without feeding them unrelated active-tab data

**P2, source-confirmed render/data churn.** [App.tsx:200-204 and 1534-1659](../../apps/mobile/App.tsx) retains visited tabs under `display: none`. That preserves navigation state, but does not freeze React renders or effects. Inbox specifically receives `visibleTasks`, whose meaning changes with the active tab in [useDisplayWorkspace.ts:116-139](../../apps/mobile/src/hooks/useDisplayWorkspace.ts). After visiting Inbox, switching to Timeline can feed scheduled tasks into the hidden Inbox's filtering and row model. Hidden screens also receive loading flags derived from another active screen.

Provide each tab its own stable dataset/readiness, and an explicit visibility signal for optional work. Retain last valid inactive data. Profile or use a supported React activity boundary before choosing an offscreen-freezing strategy. Keep scroll positions and sheet state intact.

Acceptance: switching to Timeline does not replace Inbox's hidden data with Timeline rows; unrelated toast changes do not rebuild every visited list; selection and scroll position survive revisits.

### 09. Stabilize reminder inputs and compare the resulting plan

**P2, source-confirmed unnecessary triggers.** [App.tsx:637-641](../../apps/mobile/App.tsx) constructs `[...inboxTasks, ...scheduledTasks]` on every root render. Both effects in [useReminderSync.ts:21-48](../../apps/mobile/src/hooks/useReminderSync.ts) depend on that array. Unrelated root changes requeue the planner and replace the foreground listener. Debouncing reduces bursts, but does not distinguish an unchanged reminder plan.

Memoize task inputs, depend on reminder-specific preferences, and cache a canonical plan fingerprint before calling the OS. Read latest values through a stable foreground listener. Apply finding 01 first, so an empty loading state never becomes a valid fingerprint.

Acceptance: opening a toast/settings or changing a non-reminder preference performs no native notification enumeration or rescheduling.

### 10. Avoid persisting the image-upload manifest on every progress callback

**P2, source-confirmed write amplification.** [taskImageNative.ts:485-490](../../apps/mobile/src/lib/taskImageNative.ts) forwards progress callbacks. [taskImageCoordinator.ts:730-738](../../apps/mobile/src/lib/taskImageCoordinator.ts) calls `update` for each callback; `update` at lines 403-418 always persists the complete manifest and notifies subscribers. The persistence chain serializes writes but does not coalesce them. Capture caption edits also use this local update path per keystroke. The main edit caption field already saves on blur, so it should not be described as a network request per keystroke.

Separate transient progress from durable state. Persist transitions, source references, claims, and retry checkpoints promptly; throttle UI progress and coalesce redundant manifest snapshots. Retain immediate durability for changes needed after process death.

Acceptance: hundreds of progress callbacks create bounded checkpoint writes, and killing the app still restores every upload correctly.

### 11. Make bulk completion and undo server batches

**P2, source-confirmed mutation fan-out.** [useTaskMutations.ts:549-578](../../apps/mobile/src/hooks/useTaskMutations.ts) completes each selected task through its own mutation and undoes through separate reopen mutations. `Promise.all` permits overlap, but still creates N mutations and multiple invalidation opportunities. Partial success can also conflict with the single success/failure UI.

Add bounded, authenticated bulk-complete/reopen operations, following the existing bulk-delete and reschedule contracts. Define atomic or explicit partial-result semantics and idempotency. This is different from claiming every client mutation necessarily transmits a separate full query result.

Acceptance: completing 100 selected tasks uses bounded batches and provides an accurate result/undo after one item is invalid or already complete.

### 12. Patch bulk optimistic state in one pass

**P2, source-confirmed O(KN) work.** [useTaskMutations.ts:640-656](../../apps/mobile/src/hooks/useTaskMutations.ts) looks up prior dates with `find` for each selected task, then reduces selected IDs while calling `patchTaskInOptimisticView`. [task-optimistic.ts:9-25](../../apps/mobile/src/lib/task-optimistic.ts) maps the whole list for every patch. Selecting K tasks in an N-task list does repeated scans and creates repeated intermediate arrays.

Create an ID lookup once and patch the view once with a Set/Map. Keep unchanged task objects intact. Apply the same method to undo.

Acceptance: a 1,000-task, 500-selection operation performs linear list passes and preserves untouched object identities and prior dates.

### 13. Defer optional hidden-screen startup work

**P2, source-confirmed eager work; benefit needs a startup trace.** The tab trees mount lazily, but [App.tsx:1691 onward and 1892](../../apps/mobile/App.tsx) mounts capture/edit, Kairo, and settings components with the workspace. [Kairo.tsx:220-228](../../apps/mobile/src/components/Kairo.tsx) invokes chat hydration even while hidden; [useKairoChats.ts:119-204](../../apps/mobile/src/hooks/useKairoChats.ts) reads the index and active message blob and may seed storage. Static module imports also evaluate before component-level lazy mounting.

Defer Kairo chat hydration and optional components until first use, then retain state where useful. Measure module evaluation before changing import strategy. Profile font loading separately; [LaunchGate's 1,200 ms cap](../../apps/mobile/App.tsx) is already an intentional mitigation. Consider native font embedding only if it improves measured startup and supports the current font-family names.

Acceptance: a normal Inbox launch performs no chat-blob hydration, and first Kairo open remains acceptable. Preserve auth cache readiness before auth calls.

### 14. Gate settings-only subscriptions and calendar discovery

**P2, source-confirmed optional launch work.** [SettingsSheet.tsx:2951-2962](../../apps/mobile/src/components/SettingsSheet.tsx) subscribes to automation credentials and bootstrap tokens whenever authenticated, regardless of sheet visibility/category. [useIntegrationsSettings.ts:80-87 and 114-185](../../apps/mobile/src/hooks/useIntegrationsSettings.ts) subscribes to two integration statuses and, when Calendar is enabled, requests Google tokens and lists calendars on mount. [useMobileRelease.ts:42-46](../../apps/mobile/src/hooks/useMobileRelease.ts) subscribes to ten published release records for release notes even with settings closed.

Keep small status needed by Timeline and minimum-runtime controls live. Activate credential lists, release notes, and calendar-picker discovery only when the corresponding page needs them, with a cache for revisits.

Acceptance: authenticated Inbox startup has no automation-list or calendar-picker request. Calendar error banners and minimum-runtime enforcement still update promptly.

### 15. Coalesce bounded workspace snapshot writes

**P2, source-confirmed repeated persistence.** [useWorkspaceSnapshot.ts:82-104](../../apps/mobile/src/hooks/useWorkspaceSnapshot.ts) sanitizes, serializes, and writes a full snapshot whenever task-array identities change. There is no debounce or semantic-content check. [workspace-snapshot.ts:144-150](../../apps/mobile/src/lib/workspace-snapshot.ts) already caps persisted counts at 120 Inbox, 160 scheduled, and 120 completed tasks, so this is repeated bounded work, not an unlimited snapshot claim.

Use a serialized latest-write queue, short coalescing window, and content/version fingerprint. Flush on background. Preserve the existing clear-token protection that prevents sign-out races from restoring a deleted snapshot. Keep image expiry-clock metadata from forcing a full content rewrite when visible data has not changed.

Acceptance: a bulk mutation/query burst produces a small number of writes; the latest state wins; immediate sign-out cannot resurrect the snapshot.

### 16. Reconsider the extra timer-driven row-release layer

**P2, source-confirmed additional render loop.** [useIncrementalRowCount.ts:3-28](../../apps/mobile/src/hooks/useIncrementalRowCount.ts) releases 24 more rows every 32 ms until the whole dataset is available. Both [InboxScreen.tsx:422-429](../../apps/mobile/src/screens/InboxScreen.tsx) and [TimelineScreen.tsx:250-263](../../apps/mobile/src/screens/TimelineScreen.tsx) use it on top of FlatList's own batching. For a 1,000-row dataset starting at 24, reaching the full budget requires about 41 state increments. Those increments do not mean 1,000 native rows are all mounted, since FlatList still virtualizes, but they repeatedly rebuild list inputs and selection pools. There is no visibility gate for hidden tabs.

Compare standard FlatList batching with demand-driven/on-end row expansion. At minimum pause optional increments when hidden and memoize row models. Preserve selection semantics and scroll depth.

Acceptance: a parked large list stops scheduling 32 ms increments. Fast scrolling does not reveal persistent blanks or change the meaning of Select all.

### 17. Bound the all-time heatmap's rendered history

**P2, source-confirmed growth with account age.** [InsightsScreen.tsx:171-190](../../apps/mobile/src/screens/InsightsScreen.tsx) derives the heatmap range from the earliest completion. [ConsistencyHeatmap.tsx:218-259](../../apps/mobile/src/components/ConsistencyHeatmap.tsx) creates a colored SVG rectangle and a separate hit-target rectangle for each day inside a horizontal ScrollView. Three years means roughly 2,190 SVG rectangles before labels. This arithmetic is not a memory or FPS measurement.

Page by year or virtualize week blocks, preserving all-time summary counts/streaks. Avoid changing the meaning of all-time statistics merely to shorten the graph.

Acceptance: five years of history renders a bounded visible range; switching years and selecting a day remains accessible and correct.

### 18. Keep timeline scope stable across unrelated screens

**P2, source-confirmed query-shape churn.** [App.tsx:302-309](../../apps/mobile/App.tsx) switches from a 14-day end date to an unlimited horizon for Goals, Progress, or Kairo. [useTaskQueries.ts:305-322](../../apps/mobile/src/hooks/useTaskQueries.ts) uses `9999-12-31` as the unbounded end. `showLaterDates` also makes expansion permanent for the session. Tab changes can replace the query's arguments and cause a wider corpus to be sorted and regrouped.

Use stable screen-specific scopes, paged future ranges, and summaries where a tab only needs counts. Kairo must still be able to request arbitrary dates through explicit tools. Do not hide far-future tasks without a clear Load later path.

Acceptance: opening Progress does not load all future task descriptions just to draw completion charts; navigating beyond the current horizon still finds the expected task.

### 19. Preserve unchanged task identities and row callbacks

**P2, source-confirmed memoization defeats; render count unmeasured.** [useTaskQueries.ts:181-237](../../apps/mobile/src/hooks/useTaskQueries.ts) replaces its image map, `withImages` callback, and every mapped task object when image collections change. The global `observedAt` value changes even if meaningful attachment content does not. Memoized [InboxTaskRow](../../apps/mobile/src/components/InboxTaskRow.tsx), [TimelineTaskRow](../../apps/mobile/src/components/TimelineTaskRow.tsx), and [GoalTaskRow](../../apps/mobile/src/components/GoalTaskRow.tsx) also receive newly created closures from parent row renderers. [useDisplayWorkspace.ts:87-179](../../apps/mobile/src/hooks/useDisplayWorkspace.ts) rebuilds derived sections each root render.

Use per-task normalization keyed by revision/content, stable action callbacks that accept task IDs, and memoized row models. Avoid custom comparators that ignore callbacks or fields and create stale behavior. React Native documents [stable list renderers and memoized row props](https://reactnative.dev/docs/0.85/optimizing-flatlist-configuration) as relevant optimizations.

Acceptance: changing one image or task updates the affected rows; an unrelated root toast does not rerender every visible task.

### 20. Measure the detail-first image cache policy and storage growth

**P3, explicit tradeoff to measure.** [taskImageLibrary.ts:49-77](../../apps/mobile/src/lib/taskImageLibrary.ts) resolves the remote `detail` variant regardless of requested card/detail variant and caches one file per image ID. [taskImageProvider.ts:3-6](../../convex/taskImageProvider.ts) defines 640 px card and 1,600 px detail variants. The current policy avoids a second download when an image is opened, which may be the intended offline tradeoff. Inbox explicitly sets `download={false}` in [TaskImageFilmstrip.tsx:610-630](../../apps/mobile/src/components/TaskImageFilmstrip.tsx), so scrolling Inbox should not be described as automatically downloading every image.

Measure bytes and viewer-open latency for card-first versus detail-first behavior on surfaces that actually download. If splitting variants, key downloads/files by variant and preserve offline viewing. Add a byte-budget/last-use policy for re-downloadable cache files, while protecting staged uploads and any explicitly offline-required copies. Current retention removes forgotten IDs, not old but still-owned attachments.

Acceptance: compare metered-network bytes, file-cache size, image decode memory, and viewer latency using the same images. No quota should remove the only local copy of an unuploaded image.

### 21. Reconcile resumed uploads with bounded parallelism

**P2, source-confirmed sequential network path.** [taskImageCoordinator.ts:1286-1346](../../apps/mobile/src/lib/taskImageCoordinator.ts) awaits reconciliation inside a record loop and calls `pump` after the loop. Each reconciliation has a 30-second timeout. On restoration, entries that depend on this loop can wait behind earlier stalled records; newly recovered pending entries may then wait until the loop finishes. This does not block the entire JS event loop. The app's separate `setForeground(true)` path already pumps independent pending entries, so the loop should not be described as blocking all resumed uploads.

Use a small reconciliation pool, retain generation/paused guards, and permit safe ready-to-upload work to start as records settle. Keep the existing two-upload concurrency limit and avoid double grants or duplicate provider uploads.

Acceptance: one hung reconciliation does not delay every unrelated resumable image by its full timeout. Process-death recovery and upload claims remain correct.

### 22. Add a bounded Kairo request deadline and consider incremental response text

**P2, source-confirmed latency/recovery opportunity.** [Kairo.tsx:605-632](../../apps/mobile/src/components/Kairo.tsx) fetches a complete JSON response for each tool round. [kairoAgent.ts:39 and 227](../../apps/mobile/src/lib/kairoAgent.ts) allows up to six rounds. There is an AbortController and a deliberate two-tap Stop control, but this request path has no explicit automatic deadline. The testing guide's streamed-response wording does not match this implementation.

Add per-round and overall deadlines with a useful retry state. Track time to first useful feedback separately from total completion. Streaming user-visible text is a later, provider-specific improvement; tool arguments must be fully validated before actions run, and cancellation must preserve already-applied outcomes/undo chips.

Acceptance: a hung provider reaches a recoverable timeout; stopping at any round retains accurate applied-action status; normal requests expose total and per-round latency.

### 23. Make slow/offline single capture an explicit durable state

**P2, source-confirmed network-dependent interaction.** [AddTaskSheet.tsx:372-480](../../apps/mobile/src/components/AddTaskSheet.tsx) keeps `saving` set while awaiting `onAdd`; [App.tsx:1090-1174](../../apps/mobile/App.tsx) waits for the add mutation before returning success. The custom retry queue is only populated after a classified network rejection, so it is not evidence that every offline pending request is durably captured. Convex transport may wait/retry rather than immediately reject; installed-client behavior needs a real offline test.

If fast offline capture is a product requirement, persist a draft/outbox entry before declaring it saved, assign a stable idempotency key, and reconcile a provisional row. Keep server/image-claim ownership rules. Do not implement a cosmetic timeout that retries an operation the server might already have accepted.

Acceptance: capture during disconnection, kill the app, relaunch, reconnect, and verify exactly one task. Burst capture should not lose the next draft while an earlier save is pending.

### 24. Keep retry entries durable until acknowledgement

**P1, source-confirmed durability gap.** [useRetryQueue.ts:127-132 and 142-174](../../apps/mobile/src/hooks/useRetryQueue.ts) clears the queue into a local array before replay. The persistence effect can save the empty queue while requests remain in flight. A process death in that interval can lose queued operations. Failed operations are also dropped after five attempts without an exposed persistent failed state.

Persist pending/in-flight/failed states, remove each entry only after confirmed acknowledgement, and serialize replay with a mutex. Use idempotency for non-idempotent operations such as task creation. Preserve terminal failures for review or explicit dismissal. Do not confuse the custom outbox with Convex's in-memory reconnect handling.

Acceptance: kill the app during a multi-item replay, reopen, retry, and verify no lost operations or duplicate additions. Two replay triggers cannot apply the same batch concurrently.

### 25. Diff reminder contents as well as identifiers

**P2, source-confirmed correctness gap.** [planReminders.ts:122-163](../../apps/mobile/src/lib/planReminders.ts) gives timed reminders IDs based on task, suffix, and fire time, and digests IDs based on deadline/fire time. [syncReminders.ts:16-36](../../apps/mobile/src/lib/syncReminders.ts) only compares IDs. Renaming a task without changing its time, or changing the count of date-only tasks for an existing digest, leaves the same ID and can leave stale notification content.

Compare a normalized content/trigger fingerprint and replace changed notifications. Keep identifiers stable where helpful; avoid unconditional cancel-all/reschedule-all.

Acceptance: rename a scheduled task and add another task to an existing date-only digest. Pending notification body/count updates while unrelated notifications remain untouched.

### 26. Enforce reminder capacity explicitly

**P2, source-confirmed missing density bound; OS outcome unverified.** [planReminders.ts:109-165](../../apps/mobile/src/lib/planReminders.ts) bounds time to seven days but does not cap the number of resulting reminders. Two notifications per timed task means 33 tasks can already produce 66 specs, before digests. The planner's comment says the window is intended to respect iOS pending-notification capacity, but a time window alone cannot enforce a count limit.

Add a platform-aware count budget, reserve room for other app notifications, and deterministically prioritize the soonest useful reminders. Keep the exact supported limit verified against the shipping iOS/Expo behavior before implementation. Explain any overflow appropriately in notification settings.

Acceptance: dense schedules produce a bounded, ordered plan, and next-foreground replenishment works without duplicates. Delivery and capacity need a real iOS test.

### 27. Restore native workflow coverage and introduce performance regression checks

**P1 verification gap, confirmed in this repository.** [ADR 0007](../adr/0007-maestro-e2e-blocking-ci-gate.md) calls for a fresh Android build and blocking Maestro flows. The current [ci.yml](../../.github/workflows/ci.yml) contains six lint/type/unit/web jobs and no native workflow gate. The tracked tree contains the ADR but no Maestro flow suite or macrobenchmark implementation. [vitest.config.ts](../../apps/mobile/vitest.config.ts) aliases React Native to react-native-web and SVG to a mock. Its 666 passing tests are useful logic/component evidence, not evidence of native frames, memory, keyboard reachability, or upload behavior.

Reconcile the ADR with the intended policy. Add deterministic native flows against isolated fixtures, then repeated release/profileable-build startup and scroll benchmarks with saved traces and budgets. Functional Maestro assertions and native performance measurements serve different purposes. Keep repository validation in GitHub Actions. Android documents [release-like Macrobenchmark setup](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview) and separate [startup/frame metrics](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-metrics). React Native also requires [release-build performance assessment](https://reactnative.dev/docs/performance).

Acceptance: CI detects a keyboard-covered save button, a launch regression, and a slow large-list workflow. Test data and auth must be isolated from the user's production tasks.

## What should stay

- Primary Inbox and compact Timeline already use tuned FlatList batching and clipping. Comfortable day lists and the outer horizontal carousel are also virtualized. Fix the two eager inner lists before replacing all lists.
- Reanimated/UI-thread scroll tracking is already used by the shared scrollbar when no JavaScript scroll callback is required. Preserve it. Settings' JS scroll persistence is a specific path to profile, not proof that every scroll crosses JS on every frame.
- Preserve lazy tab mounting, scroll-position retention, reduced-motion handling, and memoized task rows. Improve their input stability.
- Preserve parallel SecureStore cache hydration and the rule that auth calls wait for it. The existing bootstrap marker already avoids blocking a returning user on legacy migration.
- Preserve bounded workspace snapshots and sign-out clear-token guards. Do not drop them to save a small amount of storage work.
- Preserve image source-size/pixel checks, serialized normalization, two concurrent uploads, retry backoff, native file upload, generation guards, and staged local copies.
- Preserve demand-driven overdue preview, existing goal-task pagination, goal summary projection, deduplicated OTA checks, and canonical Convex targeting.

## Measurement plan

### Evidence to capture before changing code

Record device model, Android/iOS version, RAM, refresh rate, battery/thermal state, app native version, runtime, exact OTA update ID, connection type, and workspace sizes. Package version alone does not identify the JavaScript bundle.

Use the installed release or a release-like profileable build. Development-client traces can diagnose individual problems, but should not become the production baseline. Keep private task text and credentials out of shared artifacts. Capture a cold launch, warm resume, five-minute idle period, all-tab navigation, list scrolls, and one image workflow separately so one action's metrics are not attributed to another.

| Journey | Workloads | Measurements |
| --- | --- | --- |
| Cold launch / warm resume | Cached/no-cache, authenticated/signed-out, normal/slow/offline network | Native initial display, correct TTI, time to live data, query rows/bytes, font/storage/module spans |
| Inbox and compact Timeline | 100/500/1,000 tasks; long titles/descriptions; select/filter/scroll | Frame overrun distribution, JS tasks, tap latency, mounted rows, memory |
| Comfortable Timeline | Dense day, 500 overdue tasks, repeated swipes | Vertical/horizontal frame timing, card/row mounts, gesture correctness |
| Goals | 50/250/500 linked tasks across pages | Detail-open latency, row mounts, memory, query pages, selection semantics |
| Progress | 1,000/10,000 completions; one/three/five years | Initial payload, aggregation time, SVG nodes, range/search latency, memory |
| Capture and mutation | Single, burst, 100-item completion/reschedule, undo | Local acknowledgement versus server acknowledgement, mutation count, optimistic work, consistency |
| Images | Five large allowed images, alpha PNG, clipboard, slow upload, foreground resume | Prepare/upload/verify spans, manifest write count, JS stalls, bytes, memory, recovery |
| Kairo | Scheduled/overdue/completed queries, 300-message chat, slow/hung provider | Correct tool scope, first useful feedback, per-round/overall time, cancellation |
| Reminders | Slow startup, renamed task, changing digest, dense week | Native enumeration/schedule/cancel calls, exact pending content, capacity/delivery |
| Offline and retries | Disconnect before save; reconnect; kill during replay | Durable pending state, exact once effects, visible recovery, snapshot freshness |
| Idle and background | All tabs visited; settings/Kairo closed; app background/foreground | Diagnostic/storage writes, query traffic, timers, CPU, retained memory |

### Proposed budgets, to calibrate after a baseline

These are starting goals, not measured current performance or promised gains: cached content usable within 1 second on a representative midrange device; live cold-start TTI within 3 seconds on the defined normal-network fixture; a cached tab switch within 100 ms; local capture feedback within 100 ms if a durable outbox is implemented. Track median and tail latency separately. Frame timing should be assessed against the device's actual frame deadline, not a fixed FPS number across 60/90/120 Hz devices. Use repeated runs and saved traces rather than one favorable launch.

App instrumentation should distinguish session restore, bootstrap, live Inbox, live Timeline, image metadata, first meaningful render, and actual interactive state. Add workflow spans for capture, sheet open, goal detail, chart aggregation, image normalization, upload verification, and provider requests. Report queue size and write counts without sensitive content. The current app has Observe startup integration but no app-level workflow-span implementation was found in the reviewed source.

### Commands for the device pass

The following are read-only diagnostics except launching/foregrounding the app. Use a specific device serial if multiple devices appear. Capture the initial screen before navigation; do not clear app data or logcat.

```sh
adb devices -l
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell dumpsys package com.pravah.mobile
adb shell pidof com.pravah.mobile
adb shell dumpsys meminfo com.pravah.mobile
adb shell dumpsys gfxinfo com.pravah.mobile framestats
adb shell am start -W -n com.pravah.mobile/.MainActivity
adb exec-out screencap -p > /tmp/pravah-mobile-audit-screen.png
adb shell uiautomator dump /sdcard/pravah-mobile-audit-ui.xml
adb pull /sdcard/pravah-mobile-audit-ui.xml /tmp/pravah-mobile-audit-ui.xml
```

`am start -W` is native activity-launch evidence, not the time until Convex data is usable. `gfxinfo` is a coarse window-level view; use Perfetto or FrameTimingMetric for attribution and tail frame analysis. Record modal windows too. Cold-start force-stop is a separate controlled sample after recording initial state, not a substitute for a warm-resume sample. On-device data-changing journeys should use uniquely named disposable records, with changes and cleanup recorded.

## Implementation order

1. Fix readiness and Kairo scope; make retry replay durable. Add focused contract tests in CI. These protect correctness while the performance work changes data-loading behavior.
2. Reduce diagnostics and upload-progress persistence; stabilize reminder inputs and snapshot writes. Measure write counts and launch/idle traces.
3. Virtualize overdue and goal-detail rows; stabilize hidden-tab inputs and unchanged row identities. Measure large-workspace scrolling and memory.
4. Introduce bounded image metadata, Progress aggregates/history pagination, and stable timeline scopes. Preserve retention completeness, arbitrary-date discovery, exact summaries, and ownership scoping.
5. Defer optional startup/settings work, add Kairo deadlines, then evaluate image variants, cache budgets, font embedding, or a different list library only if profiles support them.
6. Add native functional and release-performance gates with stored baselines. Update the testing guide to describe four current tabs, burst Enter behavior, and buffered Kairo responses; its older Done-tab/save-and-close instructions currently disagree with source.

Every shipped change still needs normal CI, focused native workflow verification, and a baseline-versus-candidate comparison on the same fixtures. No timing or percentage improvement is claimed by this source audit.
