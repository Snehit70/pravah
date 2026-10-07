# Database I/O: ranked findings, October 7, 2026

This research uses current main, read-only local SQLite, official Convex docs
and backend source, and authenticated read probes against the canonical
deployment. It changes no application data or production code. Token minting
can update the existing credential-usage audit. Probe traffic is excluded from
the historical measurement window.

## Measurement basis

Fixed half-open UTC window: October 6, 15:00 to October 7, 15:00.
2,022 captured executions, 13,716,207 reported read bytes and 382,584 write
bytes, totaling **14,098,791 bytes**. Reads are 97.3% of captured I/O.
SQLite stores actual execution usage fields, not estimates from function calls.

There are approximately 10.61 hours of recorded collector heartbeat gaps in
this window. Replay may recover some events, but completeness is unproven.
These figures describe captured executions, not the complete invoice or a
monthly forecast. The previous 39% before/after total compared unequal windows
and mixed workloads; it is not a controlled billing reduction.

| Function | Read bytes | Share of total captured I/O |
| --- | ---: | ---: |
| tasks:listBoardTasks | 4,141,678 | 29.4% |
| goals:listLinks | 2,827,325 | 20.1% |
| tasks:getTimeline | 1,961,824 | 13.9% |
| tasks:listTasks | 1,958,258 | 13.9% |
| automationTools:listTasksPage | 652,131 | 4.6% |
| goals:list | 515,615 | 3.7% |
| automationTools:listTasks | 381,343 | 2.7% |

Evidence snapshots are local scratch artifacts:
`/tmp/pravah-io-ranked-evidence-2026-10-07.json`,
`/tmp/pravah-io-census-2026-10-07.json`, and the range-probe JSON files.
The source database is opened with Python sqlite3 `mode=ro, uri=True`.

## 1. Persistent refresh-associated rereads: largest unresolved opportunity

There are 40 uncached board reads with exactly 112 documents and 66,513 bytes.
Matching goal-link reads repeatedly have 103 documents and 37,630 bytes.
Intervals commonly equal 14.85 minutes, with some double intervals and a
capture gap. 39 board reads occur within five seconds of
`POST /automation/convex-token`. Of these, 36 have no other captured mutation
besides credential-usage auditing within five seconds.

Deduplicating execution IDs of board/goals/link reads within 500 ms of those
39 board reads gives **4,393,038 read bytes, 31.2% of total captured I/O**.
This is a correlated workload bucket, not a proven amount of avoidable waste.
Unchanged byte/cardinality shapes do not prove unchanged record contents.
Nearby-mutation absence does not rule out earlier writes, evictions, deployment
effects, or missing events. The collector does not retain query arguments,
owner identities or client versions; SyncWorker is not a device identifier.

The running local watcher is CLI 2.5.2, started October 6, 20:14 IST. A current
canonical token probe confirms only aud/exp/iat/iss/sub claims, a 900-second
TTL, and equal non-time claims across reissuance. The probe's owner has 182
active tasks, unlike the recurring 112-document cohort. This does not identify
the other client or prove it uses a different owner.

Convex's [cache source][cache] keys authenticated queries by identity, arguments
and journal and validates database dependencies. Its [identity source][identity]
includes full user attributes. The previous two-second fresh-client test
proved short-term cache reuse, not reuse across actual 15-minute refreshes.

Next verification: observe two real refreshes on the reproducing client;
compare sanitized claim-field changes, stable subscription-argument digests,
client version and actual execution bytes. Distinguish identity changes,
subscription recreation, dependency invalidation and eviction before changing
token behavior. Retain auth scoping and revocation policy. Do not extend token
lifetime merely to mask unknown churn.

If 75% of this bucket proves avoidable, savings would be 3.29 MB, or 23.4% of
this captured window. Eliminating all of it would be an upper bound of 31.2%,
not a prediction.

## 2. Timeline reads the inbox and the whole future

`apps/mobile/src/hooks/useTaskQueries.ts` always subscribes to inbox and
timeline when authenticated. Timeline omits startDate to preserve overdue
tasks and uses a far-future end date. `convex/tasks.ts:getTimelineForOwner`
reads matching deadline tasks plus all active records without canonical
deadlines, then filters the latter for legacy scheduled tasks. Thus inbox
records are read even when discarded from the timeline.

Live census at 16:19:58–16:20:02 UTC found 182 active tasks, 112 inbox tasks,
70 timeline tasks across 32 dates. Only 17 timeline tasks are overdue or due
through October 21, the next 14 days.

Cold execution evidence:

| Query | Returned rows | Read documents | Read bytes |
| --- | ---: | ---: | ---: |
| Full timeline | 70 | 183 | 122,343 |
| Inbox | 112 | 112 | 69,586 |
| Timeline through October 21 | 17 | 130 | 82,457 |

The range-only change is a **measured 32.6% lower cold read** on this census.
The identical range query then hit cache with zero read bytes.

After a verified canonical migration, removing the 69,586-byte inbox fallback
from this range would leave approximately 12,871 bytes. That projects 89.5%
less than the current full-timeline cold read. This subtraction is a model,
not a measurement of an implemented endpoint. The remaining extra candidate
and all legacy/import lifecycle cases must be audited before removing fallback.
The existing migration is native-task-specific and is not proof every imported
record is canonical.

Implement a visible horizon with later dates loaded on demand, preserve overdue
access and exact summaries, and avoid fetching later dates merely to count
them. Subscription gating must preserve reminder/offline-sync requirements.
Indexes must bound reads before filtering, as recommended by
[Convex best practices][best].

This function accounts for 13.9% of the captured window. Applying the measured
32.6% per-query reduction to that bucket would mean 4.5% overall; applying the
projected 89.5% would mean 12.5%. Historical task sizes and browsing patterns
can differ from this census.

## 3. Goal/progress screens fetch history to calculate counts

Mobile Goals calculates progress from loaded task records and full goal links.
Web Goals/Insights also request completed history and unscoped goal links.
The census has 230 completed tasks, of which only 83 have a goal link.
Active-only links read 66,245 bytes/157 records versus 100,205 bytes/261 records
for all links, a current measured 33.9% difference for these two scopes.
Active-only links are not a replacement for complete historical goal progress.

Seven captured tasks:listTasks executions read 226–228 documents, totaling
1,063,610 bytes, or 7.5% of total captured I/O. These are history-sized shapes;
their arguments are not retained, so their exact UI attribution is unproven.

Maintain exact owner/goal and day summaries transactionally. Update summaries
for completion, reopening, linking/unlinking, cancellation/restoration, moves,
imports, bulk operations, deletion and undo. Read per-goal tasks only when its
details open, with completed history paginated on demand. Backfill and compare
summaries against authoritative data, including orphan links and ownership.
Daily progress and historical completion-date statistics have different
semantics and must not share an incorrect counter.

[Convex recommends denormalized counts][best]; its [aggregate component][aggregate]
offers an alternative for counts/range sums. Small exact counters may be simpler
for this single-user application. Counter writes consume I/O and need inclusion
in the before/after comparison. An 80% reduction of the history-sized bucket
would save 0.85 MB, or 6.0% overall, as a scenario, not a measured outcome.

## 4. CLI pagination bounds requests but sometimes scans unrelated rows

`listTasksPageForOwner` paginates the owner/active index and filters date/status
after reading each page. `liveClient.listTasks` drains pages to exhaustion.
The CLI already bypasses this path for exact dates, inbox and explicitly
scheduled/timeline requests. The defect remains for active requests with
before/after bounds and for default human output that selects its horizon
locally. Title resolution also loads full history for non-ID targets.

Live request `/tasks/page?status=active&before=2026-10-22`:

| Page | Returned matches | Cold read documents | Cold read bytes |
| --- | ---: | ---: | ---: |
| First | 0 | 100 | 59,580 |
| Second | 17 | 84 | 63,251 |
| Total | 17 | 184 | 122,831 |

First-page bytes were measured on the initial probe; a repeated first page hit
cache. The second page was measured in the continuation probe. This is a
same-filter multi-probe cold-page budget, not a single all-miss request trace.

Use deadline/status index bounds before pagination. Preserve complete results
for explicit all/history/export requests; use a purpose-built horizon endpoint
plus exact inbox count for the default compact list. Implement bounded indexed
title/ID resolution with explicit ambiguity behavior. [Reactive cursor
pagination][pagination] supports visible-page loading but cannot save reads if
the client still drains every page.

TasksPage plus legacy automation listTasks represent 1,033,474 bytes, or 7.3%
of total captured I/O. Halving that combined bucket would save 0.52 MB or 3.7%
overall; not every call in the bucket is unnecessarily broad.

## Lower-priority options and combined scenarios

Descriptions total 16,794 bytes of 104,939 serialized active-task bytes, about
16%; no active description exceeds 1,000 characters. Those are response-field
sizes, not database billing measurements. Splitting descriptions could reduce
list invalidation and bytes, but this evidence does not justify prioritizing a
schema split over the issues above. Merely dropping fields from responses does
not avoid reading whole documents, as [Convex explains][select].

Workspace-image collections account for 76,587 bytes, 0.54% overall. Credential
usage audit reads/writes total 191,096 bytes, 1.36%. These are small compared
with broad task reads; leave image recovery correctness and auth policy intact.
Index cleanup primarily needs a separate storage/write-overhead assessment.

Illustrative structural scenario: reduce timeline reads 75%, history-sized
reads 80%, and the CLI task-list bucket 50%. These disjoint function buckets
would save 2.84 MB, **20.1%** of the captured total, before incremental summary
writes and migration cost. If, separately, 75% of refresh-associated reads is
prevented, combined savings become 6.13 MB, **43.5%**. These are explicit
assumptions, not forecasts or observed release improvements. Do not add scoped
link savings separately to the refresh bucket, because they overlap.

Order of work: identify refresh cause; canonicalize and bound timeline reads;
implement exact summaries plus on-demand history; fix selective CLI pagination.
Validate output equivalence, overdue/future access, progress correctness, undo,
offline behavior and real refresh cycles. Compare actual bytes on identical
fixtures, then matched production windows with coverage noted. An always-on
collector improves evidence coverage but does not reduce application DB I/O.

## Implemented in the proposed PR

Timeline legacy compatibility now uses a disjoint date index instead of reading
the inbox. Date-filtered CLI pages apply bounds before pagination; legacy
history indexes avoid rereading canonical history. Mobile initially loads
overdue tasks and 14 days ahead, with an explicit action to load later dates.
Previously cached later tasks remain available offline.

Transactional goal counters replace full completed history on the Goals page
after a bounded, idempotent backfill. Mobile goal details paginate 50 links at a
time. Insights still reads full history. CLI compact context bounds its task
horizon, reads inbox separately for an exact count, and resolves exact titles
through an owner/title index with an older-backend fallback.

These changes add index storage and contribution/counter reads and writes.
The initial backfill has a one-time cost. Net production savings must be
measured after deployment; the scenarios above are not validation results.
The refresh-associated cache misses remain unexplained and are not fixed by
this PR. Monitoring stays local and gains no application-table writes.

[best]: https://docs.convex.dev/understanding/best-practices
[pagination]: https://docs.convex.dev/database/pagination
[aggregate]: https://www.convex.dev/components/aggregate
[select]: https://stack.convex.dev/why-doesn-t-convex-have-select-or-count
[cache]: https://github.com/get-convex/convex-backend/blob/main/crates/application/src/cache/mod.rs
[identity]: https://github.com/get-convex/convex-backend/blob/main/crates/common/src/identity.rs
