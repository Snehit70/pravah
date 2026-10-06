# Actual Convex I/O monitoring

## What is measured

The installed Convex CLI JSONL stream emits `usageStats.databaseIoReadBytes`
and `databaseIoWriteBytes` per completed execution. These are the primary
metrics. Document counts, index rows written, duration, cache hits and function
name explain the byte totals. Calls are counted separately and never converted
into estimated bytes. A cache hit reporting zero bytes stays zero.

This captures queries, mutations, HTTP actions, crons and component executions
visible to the deployment stream, including clients on other devices. It does
not monitor SQLite app data, device network usage, or task contents. Missing
usage fields are rejected and reported, never replaced with zero.

The free-tier stream has limited replay history. The collector cannot recover
an entire past billing month or guarantee invoice-complete coverage. Compare
its observed byte sums with the dashboard over the same covered window.

## Database location and operation

Default: `$XDG_STATE_HOME/pravah/observability/convex-io.sqlite`, falling back to
`~/.local/state/pravah/observability/convex-io.sqlite`. It is outside this repo
and outside the phone. It stores allowlisted execution metrics, hourly totals,
collector sessions and interruptions. Files are private (0600, service umask
0077). No raw log lines, owners, credentials, arguments, image data or error
bodies are retained. SQLite WAL supports concurrent reports during collection.
Request IDs and parent execution IDs are retained for local correlation. The
allowlisted caller type retains server invocation classes such as `SyncWorker`,
`HttpEndpoint` and `Action`. It does not reliably distinguish mobile, web, CLI
or every transport. These fields do not identify a user or device; older records and
unrecognized invocation types remain unknown.

```sh
bun scripts/observability/convex-io.mjs report
bun scripts/observability/convex-io.mjs collect
```

Compare exact windows after a deployment or a controlled token-refresh test:

```sh
bun scripts/observability/convex-io.mjs report \
  --from 2026-10-06T12:00:00Z --to 2026-10-06T13:00:00Z \
  --function tasks:listBoardTasks
```

The report uses raw events with an inclusive start and exclusive end, rather
than including entire boundary hours. It reports totals, caller breakdowns,
mean and P95 uncached execution bytes. Exact windows must fit the 14-day raw
retention; historical hourly rollups remain in SQLite for a year. Capture gaps
still limit conclusions. A lower call count alone is not a DB I/O reduction.

When upgrading the collector, restart its managed service before opening a new
report. The additive schema migration preserves existing metrics, but an older
collector process still holds SQL prepared against the previous schema.

The collector uses the repository's installed Convex CLI and existing host
Convex login. It targets `combative-zebra-261` production. No new Convex tables,
telemetry mutations, mobile dependency or deploy key in app code are needed.
Keep the host login private. CLI transport is read-only; collection does not
query the application's task/goal tables to estimate their sizes.

On this workstation the `pravah-convex-io.service` user service starts at login,
restarts after failure, reconnects with backoff and replays up to 1,000 recent
log entries. The template assumes `~/projects/pravah` and `~/.bun/bin/bun`;
adjust these paths for another host. `flock` prevents duplicate service instances.

```sh
cp scripts/observability/pravah-convex-io.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now pravah-convex-io.service
```

It records while this machine is awake, logged in and connected. A user service
is not a promise of 24/7 monitoring; an always-on host with its own private
Convex login is needed for that. Reports show process heartbeat separately from
last received event, session restarts, transport warnings, rejected events and
possible capture gaps. No recent event can mean an idle deployment; a process
heartbeat alone does not prove transport health. Machine-sleep heartbeat gaps
are recorded. CLI replay may fill a gap, but gaps are not assumed fully repaired.

Execution IDs deduplicate reconnect history in an atomic transaction with
hourly rollups. Raw metrics last 14 days; hourly totals and sessions last 365.
Replays older than raw retention are ignored to prevent duplicate rollups.
Seven-day reports show bytes by function, cache hits, scanned documents,
write-index rows, and P95 bytes for uncached executions. Raw failure bodies are
excluded. SQLite is telemetry storage, not an application sync database.

## Implemented optimizations and limits

- Active board/inbox/timeline queries constrain owner, `completedAt` and
  `cancelledAt` in an index before reading rows. Existing writers maintain
  these timestamp fields, so no application backfill or parallel lifecycle
  field is needed. Convex builds the index during deployment. Timestamp-free
  legacy rows retain compatibility reads and lifecycle checks.
- CLI task lists request active/status/date/horizon constraints server-side.
  Exact IDs bypass a full task-list read. Doctor probes credential status.
- `/tasks/page` bounds each scan to 100 rows and 256 KiB. The CLI follows every
  cursor, including empty pages, and rejects repeated cursors. The older
  `/tasks` array contract remains available. A first-page 404 permits a legacy
  fallback during rollout; auth errors and failures after a partial read remain
  explicit errors. Pagination bounds transactions;
  reading every page still costs the sum of matching/scanned data. Active pages
  skip canonical history; completed/cancelled history uses timestamp indexes and a separate status-only
  legacy phase, so pagination does not introduce a full owner scan for history.
- Image summaries and optional goal-link reads use owner + requested task IDs.
  CLI link requests batch at 100 IDs. They do not read other tasks' attachments
  or all historical links for a single task/context.
- Web board goal links use active/today task IDs and task details request only
  their own link. Goal screens retain complete link history. Boards above 500
  tasks fall back to the full link query rather than silently truncate.
- Full goal progress and completed-history subscriptions remain complete.
  UI pagination of history needs a separate exact progress-summary contract;
  replacing those arrays with the first page would undercount progress.

The regression tests count documents selected by index ranges, not just calls
or returned rows. Holding four active tasks fixed while canonical completed
and cancelled history grows 100 times keeps active query read costs stable.
These tests catch structural regressions; production usageStats measures billing
bytes including writes and indexes. New indexes have storage/write cost, so
check both read and write bytes after rollout rather than quote guaranteed savings.

## Next optimizations to measure

1. Materialized per-goal progress and active task-link projections could remove
   historical link/task scans on goals and the watcher. They require atomic
   updates across link/unlink, complete/reopen, undo, removal/restore, imports
   and migrations, plus reconciliation. Do not adopt an incomplete counter.
2. Split large, infrequently edited task descriptions from frequently subscribed
   task metadata if document-size profiles show they dominate I/O. Returning a
   smaller object alone does not reduce the bytes of the document read.
3. Delta synchronization with a retained change log can avoid full refreshes
   after reconnects, but adds write amplification and expiry/recovery machinery.
   Use measured reconnect volume to decide whether it beats the indexed queries.
4. Audit redundant indexes against actual call sites before removing any. Each
   index consumes storage and adds write work. Do not remove compatibility or
   integration indexes from assumptions alone.
5. Attribute watcher token refresh/reconnect churn before changing token TTL;
   longer TTL changes credential revocation latency. App tokens already last
   one day. Do not weaken this policy solely to reduce function calls.

Official references: [index performance](https://docs.convex.dev/database/reading-data/indexes/indexes-and-query-perf),
[pagination](https://docs.convex.dev/database/pagination),
[pagination read limits](https://docs.convex.dev/api/interfaces/server.PaginationOptions),
[query best practices](https://docs.convex.dev/understanding/best-practices).
