# Pravah plugin review — 2026-10-04

Watch startup is restored on Raja's machine. Its service is active, snapshots
advance, and the installed panel renders production tasks without a transport
error. The backend token-refresh correction is prepared locally but not deployed.

Reviewed `origin/main` at `42f17f8414719c1d4f4fa0bc773ed626e6d9b0ad`.
`git pull --ff-only origin main` returned `Already up to date`; the checkout was
clean. Fixes are on `fix/todo-plugin-watch-service`.

Scope: installed service and widget, full plugin source, CLI watch transport,
production token exchange and read queries, write receipts/Undo, and tests.
Independent Standards and Spec audits inspected the full implementation; the
recent default-transport diff was `git diff HEAD^...HEAD`. A fresh independent
review of the resulting patch found no actionable regressions. No planning
records were changed and no backend deployment was made.

## Standards

| Priority | Finding and concrete trigger | Result |
| --- | --- | --- |
| P1 | The service allowed writes to `%t/pravah` without creating it. A fresh login/start failed before Bun ran: `226/NAMESPACE`, `/run/user/1000/pravah: No such file or directory`. [Unit](../../packages/todo-plugin/omarchy-plugin/pravah-watch.service) | Fixed and installed: private `RuntimeDirectory`, preserving cached data across restarts. |
| P1 | Heartbeats republished cached query values after socket loss, keeping `generatedAt` fresh indefinitely. [Client](../../packages/cli/src/watchClient.ts) | Fixed and installed: healthy publication requires a connected socket, authenticated client, and unexpired token. Disconnect/reconnect regression passes. |
| P2 | Switching watch → CLI left snapshot callbacks active; heartbeats could overwrite HTTP data. CLI → watch did not initialize its path automatically. [Data layer](../../packages/todo-plugin/omarchy-plugin/widget/PravahData.qml) | Fixed and installed: transport-bound FileView, guarded callbacks, forced refresh when transport changes. |
| P2 | Failed `watch --path` was permanently marked resolved, so upgrading a previously incompatible CLI could not recover on manual refresh. [Data layer](../../packages/todo-plugin/omarchy-plugin/widget/PravahData.qml) | Fixed locally and installed: failures remain retryable. |
| P2 | The QML suite called `finish()` after the expected write failure, before its watch phase. Its green result did not cover watch behavior. [Tests](../../packages/todo-plugin/tests/Test.qml) | Fixed: watch phase now executes; new transport assertions failed before the patch and pass afterward. |
| P2 | Lock acquisition reads/checks a PID and then overwrites the file without atomic exclusion. Two simultaneous manual/service startups can both pass the check. [Lock](../../packages/cli/src/watchLock.ts:47) | Open, source finding; concurrent-process reproduction was not run. Sequential lock tests pass but do not prove exclusion. |

The runtime-directory behavior follows systemd's documented lifecycle.
[systemd reference](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)
The host regression exercises the bundled service properties against the real
user manager, rather than merely asserting configuration strings.

## Spec

| Priority | Requirement and implementation gap | Result |
| --- | --- | --- |
| P1 | Failure visibility: the [README](../../packages/todo-plugin/README.md) promises a visible stale-watch failure. Cached heartbeats hid network loss. | Fixed locally and installed; overlaps the Standards finding. |
| P1 | Read/write scope boundary: [API contract](../api.md) and plugin requirements distinguish `tasks:read` from `tasks:write`. `/automation/convex-token` accepts a read credential, but mints an owner JWT without scope restrictions. Public owner mutations accept that identity. [Exchange](../../convex/http.ts:325), [claims](../../convex/ownerConvexToken.ts:119), [task mutation](../../convex/tasks.ts:469), [goal mutation](../../convex/goals.ts:119) | Open, confirmed by source tracing; no live mutation or exploit attempted. UI button disabling does not enforce this backend boundary. Needs a separate backend authorization change. |
| P2 | Persistent watch authentication: the client ignored the SDK's `forceRefreshToken` request. Same-second owner mints produce identical JWTs, causing the SDK to enter `notRefetching` without its proactive timer. Refresh failure returned that cached JWT, and auth rejection did not stop healthy heartbeats. [Client](../../packages/cli/src/watchClient.ts), [mint](../../convex/ownerConvexToken.ts) | Client fix installed: honor forced refresh, return null and exit for supervised retry on failure, gate publishing on SDK auth state. Backend fix adds unique `jti`; it is tested but **not deployed**. Two real production mints in the same issue second returned identical JWTs without `jti`. Full production renewal remains pending deployment and a token-lifetime check. |
| P2 | Recoverable Undo: goal-only task edits return `linkOperation`, while the toast reads only `operation`. Composite field+goal edits need group Undo; the widget builds single-operation Undo. [Receipt](../../packages/cli/src/liveCommands.ts:327), [toast](../../packages/todo-plugin/omarchy-plugin/widget/PravahTodo.qml:942), [Undo argv](../../packages/todo-plugin/omarchy-plugin/widget/PravahData.qml:814) | Open, source finding; no live edits attempted. Goal-only edits have no toast Undo, and composite Undo can leave the goal change behind. |
| P2 | Both transports are exposed in settings, but switching left the old read source active. | Fixed locally and installed; overlaps Standards. |
| P3 | The README called `cli` the default while manifest/widget used `watch`; its source-build and installed-service steps were separate. | Default and unit-update instructions corrected. Install paths still assume the package working directory. |

Today-only goal-completion counts in watch mode are explicitly documented. They
remain a limitation: the goal card's generic “tasks done” wording can look like
all-time progress. Direct snapshot tests still do not fully cover atomic file
replacement reaching FileView, and queue-length assertions alone do not prove
that no HTTP process ran. Multi-monitor shell logs also show duplicate plugin
IPC targets; `open` reached the laptop panel rather than the focused monitor.

## Verification

- Relevant Vitest run: **7 files, 123 tests, exit 0**. Includes snapshot/lock,
  watch lifecycle, owner mint, HTTP routes, live commands, and endpoint resolution.
- QML: **152 checks, failed 0**; layout: **10 checks, failed 0**, exit 0.
- `python3 packages/todo-plugin/tests/watch-service.py`: **4 checks, failed 0**,
  exit 0. Verifies first-start writing through the sandbox, directory mode 0700,
  restart preservation, and cleanup on stop in an isolated runtime directory.
- `bun run typecheck:fast`: exit 0. CLI bundle build and `git diff --check`: exit 0.
- Full root suite before PR delivery: **50 files, 369 tests passed**, exit 0,
  using `NODE_OPTIONS=--no-experimental-webstorage bun run test:run`. Lint also
  passed. The default local Node runtime failed with unavailable `localStorage`:
  20 test failures and two failed imports. An isolated checkout of unmodified
  `origin/main` reproduced the same failures. Disabling native Node web storage
  lets the browser test environments provide their own storage implementation.
- Real installed daemon PID at verification: `89379`, active, `NRestarts=0`.
  Fresh snapshot targets `https://combative-zebra-261.eu-west-1.convex.cloud`,
  contains no subscription errors, and active task IDs match the HTTP CLI read.
  Snapshot mode is 0600 and directory mode 0700; later timestamps confirm idle
  heartbeat publication. Production task counts changed during review; no
  planning write was performed.
- Installed Today panel inspected on `eDP-1`, displaying tasks, Inbox and Goals
  counts without a watch-error banner. Test-opened panels were closed afterward.
- Plain `bun` in this harness failed with `mise ERROR T3-Code.AppImage is not a
  valid shim`. Checks used Bun 1.4.2's installed binary, with its bin directory
  prepended to PATH. No system shim configuration was changed.

Standards: **6 findings**, worst P1 startup/freshness failures now fixed.
Spec: **6 findings**, worst open P1 read-only token authority expansion.
The watch renewal backend fix remains ready for deployment; no completion claim
is made for production token renewal or the three open adjacent findings.
