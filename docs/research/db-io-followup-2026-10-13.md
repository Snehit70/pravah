# Database I/O follow-up — 13 October 2026

## Evidence and limits

The local SQLite recorder stores Convex-reported read/write bytes, not function-call estimates. Its file is `~/.local/state/pravah/observability/convex-io.sqlite`. Local writes do not insert application data into Convex. Administrative usage/log API traffic is separate; provider overhead for those requests is not measured individually.

The observed 24-hour window in this investigation contained 6,453,369 bytes. `tasks:listBoardTasks` plus `goals:listLinks` accounted for 5,278,948 bytes (81.8%). The watcher's full task snapshot contract requires every active task, so truncating or returning only today's tasks would change behavior. Query caching can eliminate read bytes on a hit, but we have not proved why every observed miss occurred.

Provider growth since the first paired usage snapshot exceeded recorded local growth by 7,982,122 bytes (12.6% of provider growth). Complete day/month snapshot pairs localize the additional discrepancy to these UTC dates:

| Date | Provider minus captured bytes |
| --- | ---: |
| 8 October | 814,775 |
| 9 October | 4,787,738 |
| 10 October | 486,837 |
| 11 October | 376,807 |
| 12 October | 1,515,965 |

These are observed discrepancies, not proof of particular lost requests. Provider delivery lag, discarded logs and machine interruptions remain relevant. The previous log subprocess had been alive since 8 October; its startup history limit alone does not explain the complete historical shortfall.

## Implemented changes

- Token renewal honors the Convex SDK's forced-refresh request. Transient failures keep renewal pending with bounded exponential retry; an expired or unchanged JWT cannot silently stop scheduled renewal. Revoked credentials terminate renewal. Shutdown cancels mint requests and delays. Snapshot heartbeats expose pending authentication instead of making stale data appear fresh.
- `watchTasks` is an owner-scoped materialized read model containing the fields required by the CLI snapshot and its goal association. Task and link mutations maintain it transactionally. Image/order metadata alone does not rewrite it; legacy completion dates still follow existing fallback semantics. The CLI negotiates this capability at token mint and uses one combined source query plus the goals query. Older backends retain the previous subscriptions.
- Backfill reads at most 100 task rows / 256 KiB per page and schedules remaining pages. Until complete, the combined query falls back to authoritative task/link queries. This preserves full counts through concurrent lifecycle changes. The model adds storage, mutation reads/writes, and a one-time backfill cost; net production savings must be measured after rollout rather than inferred from response size.
- Collector batches and cursors commit atomically to SQLite. Restarts resume from the durable cursor; a failed write rolls back and safely replays. Initial replay processes all entries the server supplies instead of slicing the last 1,000. Server retention still bounds recovery. Batch receipt times, cursor ranges and event time ranges are retained without raw log content or identities.
- Reconciliation rejects stale and previous-calendar-window snapshots as current differences. Historical observed differences remain explicit. Complete month-minus-day snapshots compare successive completed UTC intervals; missing days stay combined and month transitions are skipped.
- A lockfile-only change no longer forces an APK if the generated native fingerprint matches the supported runtime. Missing/mismatched/failed fingerprints and changes to native code, configuration, plugins or assets still block OTA classification.
- PR CI builds and smoke-tests the published CLI bundle, alongside existing root/mobile tests, lint, type checks and web build. Further validation runs in GitHub Actions.

## Rollout and follow-up

Deploy the backend before publishing the new CLI. The capability flag and fallback permit old/new versions to coexist. Keep existing public task/link queries for other clients. No native app or dependency change is included here.

The local collector has been restarted on the new transport and has persisted real batches/checkpoints with replay deduplication. This does not establish complete historical coverage. After deployment and CLI installation, compare measured `watchProjection:sources` bytes, model-maintenance/backfill bytes, other clients' board/link bytes, provider totals and capture health across comparable windows.

## Primary sources

- [Convex query best practices](https://docs.convex.dev/understanding/best-practices): indexes, bounded reads and avoiding unnecessarily large reactive queries.
- [Convex client authentication API](https://docs.convex.dev/api/classes/browser.BaseConvexClient): SDK token-refresh contract. Regression tests also use the installed SDK authentication state machine.
- [Convex usage API](https://docs.convex.dev/deployment-api/get-current-usage): provider usage and completeness status.
- [Expo fingerprint documentation](https://docs.expo.dev/versions/v56.0.0/sdk/fingerprint/): native compatibility validation. The collector log protocol is verified against the installed Convex CLI's `src/cli/lib/logs.ts`, not assumed to be a stable public API.
