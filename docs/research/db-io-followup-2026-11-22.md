# Database I/O follow-up — 22 November 2026

## Evidence

Window: 14 to 22 November 2026 (8.1 days) from the local collector. Completed UTC days reconcile with provider usage snapshots to 0 bytes.

- Reads: 33.3 MB (about 4.1 MB/day). Writes: 0.89 MB.
- `watchProjection:sources`: 17.2 MB (52%), about 90 KB per uncached run (158 documents).

Inferred re-run causes (see `rerunCauses` in the report):

| Cause | Bytes | Share of reads |
| --- | ---: | ---: |
| Watcher token renewal | 12.4 MB | 37% |
| App open / auth request | 6.4 MB | 19% |
| Task write re-running `sources` | 4.5 MB | 13% |

## Findings

- The 12-hour watcher token (PR #293) was merged on 13 November but not deployed. Renewals stayed 59 min 51 s apart (a 1-hour token minus the SDK's 10 s refresh margin). It was deployed on 22 November, and a release marker was recorded.
- Renewals rose from about 13/day to 36/day on 11 November. Clustering renewal chains shows two watchers. One uses the read model, runs on this laptop and pauses while it sleeps. The other uses the pre-read-model subscriptions (`listBoardTasks`, `listTodayCompletedTasks`, `listLinks`), so it runs a CLI older than 2.5.4. It keeps renewing overnight, which points to another always-on machine.
- Of the 162 tasks in the watcher snapshot, 111 are inbox tasks. Any task write re-read all 162 rows.
- `automation:markCredentialUsed` was the largest writer (230 KB of about 400 KB, 20 to 22 November).
- `pravah goals list` (`automationTools:listGoalTasks`) costs about 266 KB per uncached call, but it ran 3 times in 8 days. It needs completed-task history for its progress counts, so it was left unchanged.

## Changes

- `watchProjection:sources` takes an optional `part` (`inbox` or `timeline`) backed by a new `[owner, completedAt, status]` index. Each part reads a disjoint index range, so an inbox write no longer re-reads the timeline, and a timeline write no longer re-reads the inbox. Calls without `part` behave as before. The token endpoint advertises `watchSourceParts: 1`, and new CLIs subscribe to both parts and publish their union.
- The credential last-used write interval goes from 5 minutes to 1 hour.

Measure after rollout with `bun scripts/observability/convex-io.mjs compare`.
