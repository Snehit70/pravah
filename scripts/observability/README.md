# Convex I/O monitoring

The collector stores Convex-reported execution bytes in local SQLite. It does
not query task or goal tables or write monitoring records to Convex.

```sh
bun scripts/observability/convex-io.mjs report
bun scripts/observability/convex-io.mjs compare --from 2026-10-07T00:00:00Z --to 2026-10-08T00:00:00Z
bun scripts/observability/convex-io.mjs reconcile
bun scripts/observability/convex-io.mjs mark-release <verified-deployed-40-character-sha> "backend release"
bun test scripts/observability
```

`compare` compares the requested interval with the immediately preceding
interval of equal length. Both must fit within the 14-day raw retention.
Per-function call counts, miss counts and mean bytes per miss distinguish
activity changes from changes in execution cost. Release markers are manually
recorded only after deployment verification, not inferred from a local checkout.

Reports clip and merge session gaps within the requested window. Session
coverage measures process availability, not complete log delivery. Replayed
events may fill a process gap; the collector cannot determine exactly which
events were permanently lost. The collector now uses the administrative log
protocol used by the Convex CLI and persists its cursor. Each batch, its metrics
and the new cursor commit in one SQLite transaction. A failed write replays
the batch without double-counting. Initial capture processes all entries the
server returns rather than slicing the last 1,000. Server log retention still
limits recovery during long outages or sleep; a cursor cannot restore discarded
logs. Poll metadata retains cursor positions, receipt times and event ranges,
not raw log contents or credentials.

Capture outcomes distinguish accepted events, duplicates, expired/future events,
malformed input and unavailable byte metrics. Their timestamps are receipt times;
execution-byte totals use server event times. Historical outcomes before this
upgrade are unknown. Optional document/index counts remain null when unavailable;
totals sum known counts and expose unknown counts separately. Missing byte metrics
are never fabricated as zero. SQLite failures are buffered in memory and persisted
after recovery; a crash during a disk failure can still lose these failure counts.

The collector polls the administrative usage API every 15 minutes using the same
local Convex login as the CLI, or an explicitly configured canonical deployment
key. Failures record a fixed outcome; tokens and response/error bodies are never
stored. Reports show the age of the latest snapshot and the latest attempt.
Snapshots from an earlier UTC day/month or older than 30 minutes cannot be
presented as a current difference. Historical observed differences remain
available explicitly. `completedWindows` compares provider month-minus-day
totals at successive UTC boundaries against captured bytes for those completed
intervals, making growth in the discrepancy visible. Missing snapshot days
remain combined intervals; month transitions are skipped rather than guessed.

[The usage API](https://docs.convex.dev/deployment-api/get-current-usage) is beta.
Only `seedStatus=complete` permits a numerical difference. Its day/month windows
start at UTC midnight. The API's `GB` uses 2^30 bytes, as defined in
[Convex's usage model](https://github.com/get-convex/convex-backend/blob/main/crates/model/src/usage_limits/types.rs).
The local comparison uses raw events within retention and hourly rollups for
older calendar-month records. Both represent captured bytes, not guaranteed
complete usage. Provider totals and log delivery are asynchronous; a discrepancy
is evidence to investigate, not an exact missing-event count.

No per-user or device attribution is added. Existing caller/request metadata
does not reliably identify a client device. Local SQLite disk activity is separate
from Convex DB I/O. Administrative API requests use network traffic; their provider
overhead is not measured separately by this collector.

The schema migration preserves raw events, rollups and deduplication keys.
Restart the collector when installing this upgrade to activate durable capture.
