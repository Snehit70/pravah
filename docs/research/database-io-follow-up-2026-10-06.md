# Database I/O follow-up, 2026-10-06

The research pass audited main, local SQLite execution metrics, the running
watcher snapshot, and primary Convex documentation/source without changing
production data or code. The implementation follow-up below records the first
changes made after authorization. Research estimates remain separate from
implementation tests and production measurements.

## What the measurements say

Frozen analysis window: events at or after 2026-10-05 16:03:46 UTC, just after
the optimization deployment completed. Last captured event in this snapshot:
2026-10-06 13:23:12.549 UTC. Source is
`~/.local/state/pravah/observability/convex-io.sqlite`, queried read-only.

The window contains 1,092 observed execution events, 15,496,634 database read
bytes and 153,805 write bytes: **15.65 MB total**, in decimal units. These are
actual reported execution bytes, not function-count estimates. It includes
cache hits, both observed workload shapes, and investigation traffic. It is
not a complete day or monthly invoice. Laptop sleep caused an approximately
9.8-hour capture interruption; CLI replay is limited. The active collector
session has zero rejected events; 529 older invalid-JSON rejections remain in
the historical counter from initial collector setup.

| Function | Observed I/O | Share of total | Events / cache hits |
| --- | ---: | ---: | ---: |
| tasks:listBoardTasks | 7.402 MB | 47.30% | 87 / 3 |
| goals:listLinks | 5.289 MB | 33.79% | 82 / 3 |
| automationTools:listTasks | 0.767 MB | 4.90% | 8 / 3 |
| goals:list | 0.703 MB | 4.50% | 82 / 3 |
| tasks:getTimeline | 0.639 MB | 4.08% | 9 / 3 |
| adapter:findMany | 0.303 MB | 1.94% | 176 / 96 |
| automation:markCredentialUsed | 0.208 MB | 1.33% | 79 / 0 |
| tasks:listTasks | 0.161 MB | 1.03% | 14 / 6 |
| automation:resolveAutomationCredential | 0.044 MB | 0.28% | 93 / 12 |
| taskImages:listWorkspaceImageCollections | 0.022 MB | 0.14% | 5 / 3 |

The earlier whole-capture comparison mixed pre-deployment reads and workload
shapes. Board miss averages of 194 KB before and 88 KB afterward are useful
observations, but not a controlled 55% billing reduction. Post-deployment board
miss shapes are 111 documents / 65,929 bytes and 171 documents / 106,449 bytes.
Goal-link miss shapes remain 103 documents / 37,630 bytes and 239 documents /
91,493 bytes. The collector does not retain user/client identity, so cardinality
alone cannot identify the clients or prove which ownership scope they use.

## New highest-priority finding: token-refresh cache churn

The goal-link shapes recur at approximately **14.85-minute intervals**. All 79
uncached goal-link executions have board, goals, and today's completion
executions within five seconds. 77 of 79 also have a credential-used mutation
within five seconds. This matches the four subscriptions in
[watchClient.ts](../../packages/cli/src/watchClient.ts) and its 15-minute token
expiry with early refresh.

[ownerConvexToken.ts](../../convex/ownerConvexToken.ts) mints a changing custom
claim, `sessionId: pravah-cli-${issuedAt}`. Its comment says Convex never reads
this claim, but changing identity attributes can still affect query caching.
Convex's [cache implementation][cache] includes identity for queries that
observe auth, and [IdentityCacheKey][identity] holds the full user attributes.
[Attribute serialization][attributes] includes custom claims. Convex's
[auth documentation][auth] also explains why time-varying claims are excluded
from identity in some authentication integrations.

**Diagnosis:** the rotating custom session claim is a strong, source-supported
cause of watcher cache misses on refresh. Timing and code are not a controlled
causal test, and the inspected upstream source need not exactly match the
managed backend build. Validate with unchanged tasks through at least two
refresh cycles before claiming measured savings.

Do not lengthen JWT lifetime as the first remedy. Keep the current TTL,
issuer/subject, expiry validation, and credential authorization. Investigate
omitting the synthetic session claim or making it stable for the appropriate
authorized credential/session. Better Auth helpers can read `sessionId`, so
check all token consumers before choosing the payload. Never reuse an actual
browser session ID or expose a credential secret as a claim. A cache hit must
not bypass current authentication or grant additional access.

## Ranked optimization plan

### 1. Keep watcher identity attributes stable across token refresh

Change the synthetic session claim, preserving short-lived tokens and existing
authorization. Test refresh and revocation, multiple credentials/owners, and
failure handling. Measure miss-only bytes and the recurring refresh batches.

This addresses repeated execution, not just documents per execution. Board,
goal links and goal list together are **85.59%** of the observed I/O. If this
change eliminates 25%, 50%, or 75% of their current reads, total observed I/O
would fall by **21.4%, 42.8%, or 64.2%**, respectively. These are sensitivity
scenarios, not measured outcomes. Genuine mutations, deployments, cache
eviction, midnight rollover and other identity differences still cause reads.

### 2. Scope Waybar/watcher goal links to its actual task set

The watcher currently requests `goals.listLinks({})`. It needs associations
only for active tasks and today's completed tasks, not every historical link.
Subscribe with the sorted, deduplicated union of those task IDs. Carefully
manage dependent subscriptions so new/moved/completed tasks cannot temporarily
lose their goal label. Use bounded chunks beyond 500 IDs; avoid a fallback to
full history. Preserve snapshot readiness and midnight transitions.

The local snapshot has 170 active tasks, 145 with goal IDs, and 22 goals.
The matching-looking log shape has 239 links and 22 goals, but the collector
cannot prove attribution. Under that association and similar link sizes,
reading 145 instead of 239 link documents saves about **39% per link read**.
Theoretical savings on the entire observed goal-link stream are smaller and
depend on both workload shapes. This is useful even after fixing cache churn,
but its savings overlap with item 1 and must not be added directly.

An alternative is to persist the single task-goal association on the task
itself, allowing board consumers to avoid the link query entirely. This has a
larger migration surface: all link/unlink writers, undo, deletions and legacy
links must remain consistent. Start with the scoped query before changing the
canonical model solely for this optimization.

### 3. Maintain exact goal progress and workspace summaries transactionally

Goals/Insights currently derive counts from task history and links. Add compact
goal progress rows and, where worthwhile, workspace/day summaries; read the
summary instead of all completed task documents merely to calculate counts.
Use the existing indexes for task detail and drill-down lists. A custom small
counter table is a reasonable first choice for this single-user product;
evaluate the official [Aggregate component][aggregate] when range sums/counts
make it worthwhile.

Cover complete, reopen, link, unlink, goal deletion, undo/restore, hard purge,
bulk creation, imports and legacy migration within the transaction. Establish
exact definitions for cancelled tasks and orphaned links. Backfill in bounded
batches; independently reconcile counters and test idempotent replay. Never
update a full materialized snapshot after every write.

This removes history-dependent reads and prevents future growth from increasing
count costs. It adds write I/O and sometimes read-before-write I/O. Net benefit
is `avoided reads - additional reads/writes`, including initial backfill.
The current sample has too little Goals/Insights activity to estimate a monthly
percentage. Do not claim the whole 33.79% goal-link bucket disappears; active
task labels still need associations unless item 2's model alternative is used.

### 4. Make CLI goal summaries and textual resolution selective

[liveCommands.ts](../../packages/cli/src/liveCommands.ts) still calls unfiltered
`listTasks({})` and unscoped `listGoalLinks()` for `goals list` and `goals show`.
Title-based task resolution also reads the corpus; exact-ID resolution was
already improved. Use summary queries for goal counts, a selected-goal indexed
query for details, and bounded server-side title matching/search with explicit
ambiguity handling. Exact IDs must remain direct reads.

Current `automationTools:listTasks` miss shape is 260 documents / 153 KB, and
its bucket is **4.90%** of the post-deployment sample. That bounds the savings
from that bucket alone; it is not proof that every call came from these CLI
commands. Preserve the complete output contract when a user asks for all tasks.
Text-search usage is a separate resource; an exact indexed normalized-title
path may be preferable for exact matching.

### 5. Add incremental UI pagination and a bounded visible horizon

Mobile still requests the entire future timeline. Goals/Insights load complete
completed history. Load the visible date range and first history page, then
load more on navigation/scroll. Preserve overdue items and an exact indication
of remaining tasks; never hide tasks merely because they lie outside the first
window. Keep export/all-history commands complete and explicitly separate.

The merged HTTP pagination bounds each request, but the CLI drains every page.
That protects request size, not total reads. UI pagination helps only when the
user does not load every page. For a 200-row history with a 30-row first page,
first-load row work is approximately 85% lower; this is an illustrative
affected-query example, not today's measured workload. Convex pagination is
reactive; loaded pages can continue to re-execute. [Pagination documentation][pages]
describes scanned-byte/row limits and changing page sizes.

### 6. Separate large task notes/details from frequently read task metadata

The task document includes description and tags. Board and timeline queries
read the full document even when the UI needs only title/date/status. Move
large notes to an on-demand detail table, or maintain a deliberately small
presentation table. Returning a smaller mapped response alone does not reduce
database bytes. This behavior and explicit small-document modeling are
demonstrated in Convex's [SELECT/COUNT explanation][select].

Current board shapes average approximately 594–623 bytes per task, so this is
not yet proven to be a large savings opportunity. Measure field-size share
using a bounded census before migration. If detail fields represent 30% of
board bytes, removing them saves 30% of affected board reads, before extra
detail/table write costs. That 30% is an example assumption, not a measurement.
Separating details also prevents a notes-only edit from invalidating list
queries that no longer read the detail document.

### 7. Pause unnecessary subscriptions and share equivalent reads

Mobile already gates completed history and full goal-link sync to Goals and
Insights; it does not run full link sync continuously on every tab. Earlier
shorthand omitted this condition. Inbox and full-forward timeline remain live
throughout the authenticated workspace, and images are enabled on four tabs.

Keep essential background operations such as uploads/retries running, but pause
presentation subscriptions when the app is backgrounded or the UI cannot use
their results. Refresh on resume without losing optimistic/outbox state.
Unify duplicate query shapes only when semantics and arguments genuinely match.
The visible mobile timeline bucket is **4.08%** of the current sample, so this
is secondary here. The actual savings depend on unnecessary *uncached* reads,
not time a cached subscription remains mounted. A local JSON/SQLite cache by
itself does not stop server subscriptions.

### 8. Narrow image collection reads, keeping upload recovery intact

`listWorkspaceImageCollections` still reads all owner image rows, then related
tasks and active upload records. Scope card metadata to visible task IDs; keep
full image details on the task sheet. Avoid re-reading stable ready images
solely because the five-minute observation bucket advances. Recoverable expiry
and upload failures must remain accurate, and pending uploads must not depend
on the task's visibility.

This bucket is only **0.14%** of the post-deployment sample. It can become more
important as image history grows, but is not the current main I/O problem.

### 9. Finish legacy migration and remove redundant scans/indexes carefully

Canonical timestamps already make active reads exclude completed history.
Some history/timeline helpers still merge a legacy status query, and
`getTaskCounts` repeats the inbox range. Once legacy writer coverage is proven,
backfill the remaining integration/native compatibility rows and remove only
obsolete branches. Do not merge ownership scopes or delete orphaned links as
an I/O shortcut. Existing integrations and operation undo still use some
legacy indexes.

Audit the 11 custom task indexes against every writer/reader before pruning.
Index writes are measurable in [execution usage metrics][logs], but the current
write share is only about **0.98%** of total I/O. Index pruning alone cannot
deliver a large overall reduction for this observed read-heavy workload.
Rebuild/backfill work has a one-time cost.

### 10. Reduce ancillary credential bookkeeping only if profiling warrants it

Credential-used records/audits are already throttled to five minutes. Watcher
refresh is roughly 15 minutes, so each refresh can still write usage/audit rows.
Use a coarser timestamp or separate bookkeeping when product requirements
permit; retain immediate credential authorization checks and revocation.

Credential-used I/O is **1.33%**, credential resolution **0.28%**, and adapter
reads **1.94%** in this sample. All these buckets together provide a ceiling
of roughly 3.55% if removed entirely, which is neither feasible nor desirable.
Fix identity cache churn before extending token TTL or redesigning auth.

## Overall expected benefit and order

Implement and measure item 1 first, then item 2, then summaries and selective
CLI goal reads. Use pagination for actual screen history, not as a substitute
for narrowing the index range. Later consider thin task documents and delta
sync if the remaining measured costs justify them.

For the captured workload, **30–60% lower total database I/O is a reasonable
planning target for the first group**, conditional on reducing the recurring
watcher misses and scoping the remaining link reads. This is not a confidence
interval, not a guaranteed savings forecast, and not a monthly bill estimate.
The directly computed sensitivity scenarios are 21.4/42.8/64.2% for removing
25/50/75% of the three hot streams. Scope/history changes can add savings on
what remains, but overlap and extra writes must be accounted for.

If token claim stabilization does not stop the recurring misses, discard that
forecast and use the measured per-query reductions instead. Do not keep claiming
token refresh is the cause after contradictory evidence. If the idle watcher
pattern dominates a complete 24-hour baseline, savings could exceed 60%; if
editing/import activity dominates, they could be lower than 30%.

## Validation and ongoing measurement

1. Observe an unchanged workspace across two actual token refreshes. Compare
   database bytes and cache state; JWT refresh must still succeed on time.
2. Then edit, link, complete, reopen, undo, cancel, restore and delete a task.
   Check every client receives correct results and summaries remain exact.
3. Grow completed history 10x at fixed active/visible tasks. Active queries and
   summary reads must not grow with that history.
4. For pagination, test empty filtered pages, continuation, insertion/deletion
   during pagination, timezone/day boundaries, overdue and far-future tasks.
5. Record added summary writes, backfill I/O and auth bookkeeping separately.
   Compare net read-plus-write bytes, not just query counts or payload sizes.
6. Retain request/parent IDs and transport kind locally if exposed by the feed,
   so nested work can be correlated and double-counting assessed. Use no
   identities, secrets or task content. Anonymous client instrumentation would
   be a separate change and is not authoritative DB-byte accounting.
7. Run the existing collector continuously on an always-on host if a complete
   baseline is needed. Export local daily/per-function comparisons and gap
   warnings; reconcile against dashboard Database I/O over the same interval.
   [Log delivery is best-effort][logs]; the local totals are observed metrics.
8. Optionally set dashboard usage warnings. Warnings do not reduce I/O; a hard
   disable threshold can stop the app, so do not enable it as an optimization.
   [Database I/O and egress are separate resource categories][limits].

A full local-first delta-sync system is a later architectural option. It can
reduce repeated bootstrap reads, but requires per-owner revision cursors,
tombstones, retention/compaction, cursor-expiry rebasing, idempotent outbox and
replay semantics. It adds server writes. The observability SQLite database is
not that app sync database, and moving it to Fate would improve measurement
coverage rather than lower application database I/O directly.

[cache]: https://github.com/get-convex/convex-backend/blob/main/crates/application/src/cache/mod.rs
[identity]: https://github.com/get-convex/convex-backend/blob/main/crates/common/src/identity.rs
[attributes]: https://github.com/get-convex/convex-backend/blob/main/crates/pb/src/user_identity_attributes.rs
[auth]: https://docs.convex.dev/auth/functions-auth
[aggregate]: https://www.convex.dev/components/aggregate
[pages]: https://docs.convex.dev/database/pagination
[select]: https://stack.convex.dev/why-doesn-t-convex-have-select-or-count
[logs]: https://docs.convex.dev/production/integrations/log-streams
[limits]: https://docs.convex.dev/production/usage-limits


## Implementation follow-up

The first batch addresses the repeat watcher reads and bounded CLI goal reads:

- Owner websocket JWTs omit the synthetic, time-varying `sessionId`. Standard
  issuer, subject, audience, issue time and 15-minute lifetime remain unchanged.
  Every token exchange still checks the bearer credential. Signer-call tests
  verify stable identity attributes across refresh and separation of owners;
  existing refresh and revoked-credential tests remain in place.
- Watcher goal links use the sorted union of active and today-completed task
  IDs in chunks of at most 500. Empty workspaces make no link query. Selection
  changes wait for every link chunk before publishing. Unchanged task IDs reuse
  subscriptions. Stale callbacks and partial chunk failures cannot overwrite
  the last complete snapshot or resume healthy heartbeats.
- Midnight renews only the completion query, keeping unchanged board/goals/link
  subscriptions. Tests cover day rollover and cleanup.
- `/goals/tasks` follows owner/goal link indexes and reads associated tasks in
  bounded pages of 100 links / 256 KiB. It checks task ownership and tolerates
  dangling/imported links. CLI `goals show` selects the resolved goal; `goals
  list` reads linked tasks rather than unrelated owner history. All pages are
  drained to preserve complete progress and active-task output. This is scoped
  reading, not materialized progress counters. Only an initial missing route
  allows legacy fallback. Auth, malformed data, cursor loops and later-page
  failures remain explicit errors.
- Task counts reuse inbox candidates for legacy scheduled-task checks rather
  than executing the same inbox range twice.
- SQLite retains allowlisted request/parent execution IDs and caller types,
  without owner/client identities, task content or secrets. Report `--from`,
  `--to` and `--function` use exact raw-event windows with actual read/write
  bytes and documents, caller buckets and miss mean/P95. Migration and replay
  tests preserve existing metrics.

### Remaining conditional work

Transactional progress counters, mobile/web visible-page loading, task-note
separation, image-collection scoping, legacy migration/index removal and usage
audit coarsening are not part of this batch. The research recommends measuring
the watcher fix first, because its streams account for 85.59% of sampled bytes.
Those changes need separate correctness coverage or a field/workload census;
adding summary writes or schema migrations before measuring the dominant idle
read source would make the net benefit harder to establish. They remain ranked
options above rather than claims of implementation.

After backend rollout and CLI installation, compare unchanged-workspace reads
over at least two real refresh cycles using the exact-window report. Compare
mutating-workspace bytes separately, including all new writes. The planning
range of 30–60% lower total I/O remains conditional and is not a measured result.

### Verified implementation evidence

- Root suite: 58 test files / 421 tests passed.
- SQLite collector: 11 tests passed, including original-schema migration, replay
  deduplication, privacy filtering, exact windows and 2,000-event UTF-8 ingestion.
- Root typecheck, lint and CLI bundle build passed.
- A one-shot watcher against the existing canonical deployment produced a
  complete snapshot in 1,812 ms: 170 active tasks, 22 goals, 145 linked tasks,
  zero errors. No task content or credentials were printed or persisted.
- Controlled same-owner full/scoped goal-link reads at 2026-10-06 14:05 UTC
  returned matching association values for the 170 selected tasks. The captured
  uncached full query read 91,493 bytes / 239 documents; the scoped query read
  61,085 bytes / 145 documents. **33.24% fewer DB read bytes for this link query**.
  This is one controlled comparison, not total monthly savings.
- The collector was restarted after its additive migration. Its new session
  remained active with zero rejected events. The installed CLI and deployed
  token signer remain unchanged until release/backend rollout.

The token-refresh cache improvement still needs the two-cycle production
comparison after deployment; the code tests verify removal of the changing
custom claim, not managed-server cache behavior or monthly billing.
