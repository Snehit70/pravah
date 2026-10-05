# Database I/O audit, 2026-10-05

Read-only investigation using the logged-in Convex dashboard, canonical production data, current repository code and a bounded CLI log capture. No I/O optimization deployed by this investigation.

## Current evidence

Dashboard billing window: October 1–31, month-to-date on October 5, UTC. Team database I/O: 187.18 MB / 1 GB. The following are production rows for plan-timeline:

| Function | I/O | Calls | Approximate I/O/call |
|---|---:|---:|---:|
| tasks.listBoardTasks | 82.24 MB | 380 | 216 KB |
| automationTools.listTasks | 39.82 MB | 2.2K, rounded | 18 KB |
| goals.listLinks | 23.41 MB | 332 | 71 KB |
| tasks.listTasks | 11.41 MB | 247 | 46 KB |
| tasks.getTimeline | 9.90 MB | 131 | 76 KB |
| automationTools.listGoalLinks | 8.25 MB | 1K, rounded | 8 KB |

Top three account for 77.7%; top six for 93.5%. Per-call ratios include cache hits and all argument/identity combinations and are not miss-only query costs. [Dashboard](https://dashboard.convex.dev/t/atulya-rai/settings/usage)

One bounded production census found 656 tasks across four ownership scopes: 284 active and 372 completed. This is not one current user's corpus. The two substantial scopes contain 395 tasks (170 active, 225 completed) and 257 tasks (111 active, 146 completed). There are 342 goal links, including 16 referring to task IDs absent from the task table. Ownership/migration semantics must be understood before repairing those links; no data deleted or scopes combined.

A bounded 100-event log capture using the installed CLI:

```sh
bunx convex logs --prod --success --jsonl --history 100
```

exposes `usageStats.databaseIoReadBytes`, `databaseIoWriteBytes`, `databaseReadDocuments`, execution time, execution identity and `cachedResult` even with the current free-tier deployment. The sample spans roughly ten minutes; it is not a historical trend.

Selected actual executions:

| Query | Documents read | Database I/O read bytes |
|---|---:|---:|
| tasks:listBoardTasks | 257 | 156,362 |
| tasks:getTimeline | 173 | 115,794 |
| tasks:listTasks, broad/completed-shaped execution | 222 | 142,341 |
| goals:listLinks | 103 | 37,630 |
| taskImages:listWorkspaceImageCollections | 18 | approximately 11,000 |

Some repeat executions report `cachedResult: true` and zero database bytes. The sampled board read matches the entire 257-task scope, which contains 146 completed tasks. Its current queries read deadline and no-deadline ranges before filtering lifecycle in JavaScript. This independently confirms the history over-read. [Implementation](../../convex/tasks.ts)

## What remains expensive

1. `listBoardTasks` reads both broad deadline ranges and no-deadline ranges, then removes completed/cancelled tasks. `getTimeline` and inbox queries have the same missing lifecycle constraint. Earlier screen gating reduced subscription count, but did not make these backend reads active-only. [Task queries](../../convex/tasks.ts)
2. CLI `filterTasks` sends only `date` to `client.listTasks`. Status, before/after, priority and horizon filters happen after the broad HTTP read. `tasks show` and target resolution also read the full owner corpus. `doctor` uses a full task list as its reachability probe. [CLI](../../packages/cli/src/liveCommands.ts), [doctor](../../packages/cli/src/commands.ts)
3. `goals.listLinks` and automation `listGoalLinks` collect every owner link. Historical links are useful for progress/history, but active board and compact planning views do not need all of them on every read. [Goals](../../convex/goals.ts), [automation](../../convex/automationTools.ts)
4. Image summary generation collects every owner image row and filters requested task IDs afterward. This is a secondary target: image collection I/O is currently only 870 KB, not the primary hotspot. [Summary helper](../../convex/taskImages.ts)
5. The existing desktop watcher subscribes to board, today's completions, goals and goal links. App auth JWTs now last one day, but the watch-specific owner token is still 15 minutes. Dashboard shows 299 token mint HTTP calls month-to-date. Short token lifetime can contribute fresh authenticated executions, but exact attribution requires continuous samples; do not treat token mint count as proof of an I/O regression. [Watcher](../../packages/cli/src/watchClient.ts), [token policy](../../convex/ownerConvexToken.ts)

Convex explicitly bills read documents even if discarded with a filter. Replacing JavaScript filtering with database `.filter()` alone does not avoid scanning; the lifecycle condition must constrain an index range. [Best practices](https://docs.convex.dev/understanding/best-practices), [index performance](https://docs.convex.dev/database/reading-data/indexes/indexes-and-query-perf)

## Recommended tracking on the free tier

First build an external collector of the existing JSONL stream, not a telemetry table in the application database:

- Run the collector under systemd on an always-on machine. Restart with backoff and record collection gaps.
- Allowlist function name, deployment, timestamp, opaque execution identifier for deduplication, parent execution linkage, query/mutation kind, cache hit, duration, document count, read/write bytes and write-index rows. Drop log messages, return values, task content, owner identities and credentials.
- Keep recent execution metrics for 7–14 days in SQLite and hourly aggregates longer. Bound retention and storage. Deduplicate replayed history; do not count reconnect history twice.
- Report hourly/daily totals, cache-hit rate, miss-only average/P95 bytes per query, bytes by function and argument-shape where explicitly instrumented, calls per client, collection gaps and a rolling month-end estimate.
- Keep authentication server-side on the collector host. No deploy key shipped in clients or committed. Streaming access uses deployment observability and adds no application telemetry writes; validate any observed collector overhead rather than assume zero total service cost.
- Query/result client events help attribute mounts, reconnects and token refreshes, but are not authoritative database I/O. Preserve that distinction.

The current installed Convex SDK 1.34.1 does not expose `ctx.meta.getTransactionMetrics()` in its server types. Current official docs describe it; using it would require a separately verified SDK upgrade. Existing CLI execution usage stats avoid needing that upgrade for the first collector. [Current metrics documentation](https://docs.convex.dev/database/writing-data#checking-transaction-headroom)

## Optimization order and regression budgets

1. Introduce owner + active-lifecycle + deadline/position index ranges, derived consistently from the canonical lifecycle. Backfill safely; preserve legacy reads until migration completion. Update all writers (native edits, calendar imports, CLI, complete/reopen/undo, cancellation/restore). Active board, inbox and timeline must not read completed history.
2. Move CLI status/horizon/date bounds to the backend. Use direct `getTask` for exact IDs, indexed resolution for targets, bounded server search for ambiguous names, and a tiny authenticated health query for doctor. Preserve exact counts with small maintained summaries where bounded results require them.
3. Scope goal-link reads to the requested active task set and keep completed-goal progress in a separate bounded/summary contract. Do not silently discard completed history or task-goal associations.
4. Make image summaries task-scoped if profiling shows a material remaining cost.
5. Profile watcher refresh/reconnect churn; consider a bounded longer owner-token policy only after deciding credential revocation guarantees. Do not blindly extend tokens to a day.

Add CI tests that execute real query handlers against a realistic index-aware DB harness. Count visited/returned documents by index, not just query method invocations. Grow completed history 10× while holding active tasks fixed: active-board, inbox and timeline read costs must remain stable. Exercise CLI `today`, `inbox`, `agent context` and exact-ID show at their real request seams. Verify completion/reopen/undo and legacy migration preserve results.

Initial planning goal: materially reduce the top three functions before adding a sync engine. Roughly 57% of the sampled board scope is completed history, so active-only ranges should remove most of those document reads. That is a structural estimate, not a measured billing reduction. Adopt numeric production targets after collecting a representative baseline; compare the same clients/workload and exclude migrations/deploy bursts. No claim of a guaranteed 80–90% reduction.
