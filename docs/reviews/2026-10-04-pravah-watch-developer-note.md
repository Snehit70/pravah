# Developer note: Pravah watch fixes

Date: 2026-10-04. Base: `origin/main` at `42f17f8`.
Branch: `fix/todo-plugin-watch-service`.

Watch startup works again on Raja's machine against
`combative-zebra-261`. The updated CLI, service unit, and widget are installed
locally. The backend JWT uniqueness change is tested but not deployed, so
production token renewal is not fully verified.

## What failed

The default widget transport is `watch`. It reads a snapshot maintained by
`pravah watch`; it does not fall back to HTTP polling if that daemon fails.

The user service restarted repeatedly without starting the CLI. Its logs showed:

```text
Failed to set up mount namespacing: /run/user/1000/pravah: No such file or directory
Main process exited, code=exited, status=226/NAMESPACE
```

The unit declared `ReadWritePaths=%t/pravah`, but nothing created that directory
before systemd applied its filesystem sandbox. CLI directory creation could not
help because systemd failed before executing the CLI. Pulling remote code did
not resolve it; the checkout was already current.

## What changed and why

| File | Change | Reason |
| --- | --- | --- |
| [pravah-watch.service](../../packages/todo-plugin/omarchy-plugin/pravah-watch.service) | Add `RuntimeDirectory=pravah`, `RuntimeDirectoryMode=0700`, and `RuntimeDirectoryPreserve=restart`. | systemd creates the private directory before sandbox setup. Restart preserves the last snapshot while the daemon reconnects. |
| [watchClient.ts](../../packages/cli/src/watchClient.ts) | Publish healthy snapshots only when the socket is connected, SDK authentication has succeeded, and the token has not expired. | Cached query values survive disconnects. Repeatedly stamping them with a fresh `generatedAt` previously hid stale data from the widget. |
| [watchClient.ts](../../packages/cli/src/watchClient.ts) and [watchCommand.ts](../../packages/cli/src/watchCommand.ts) | Honor `forceRefreshToken`, handle SDK auth rejection, and return `null` on refresh failure. The CLI exits with an error so systemd can restart it. | Returning the cached JWT can disable SDK refresh scheduling or leave an unauthenticated subscription running. |
| [ownerConvexToken.ts](../../convex/ownerConvexToken.ts) | Add `jti: crypto.randomUUID()` to each JWT. Owner `iss` and `sub` stay unchanged. | Two mints for the same owner in one second produced identical JWTs. Convex expects a different replacement token to schedule proactive refresh. Production returned identical same-second JWTs during diagnosis. This change still needs backend deployment. |
| [PravahData.qml](../../packages/todo-plugin/omarchy-plugin/widget/PravahData.qml) | Bind FileView to watch mode, guard callbacks, refresh on transport changes, and leave failed path resolution retryable. | Watch callbacks could overwrite HTTP-mode data after switching transports. A failed `watch --path` also prevented recovery after upgrading the CLI. |
| [Test.qml](../../packages/todo-plugin/tests/Test.qml) | Continue into the watch test phase instead of finishing after the expected write failure. Add transport-switch assertions. | Earlier green QML results did not execute the watch tests. |
| [README](../../packages/todo-plugin/README.md) | Correct the default transport and document unit updates and the host service test. | Pulling source, rebuilding the CLI, updating installed QML, and reloading the service are separate steps. |

## Verification

The new disconnect, forced-refresh, same-second mint, and transport-switch
regressions failed before their fixes and passed afterward.

- Seven relevant Vitest files: **123 tests passed**, exit 0.
- Full root suite: **50 files, 369 tests passed**, exit 0, with
  `NODE_OPTIONS=--no-experimental-webstorage`. The default local Node runtime
  produced unavailable-`localStorage` failures on both this branch and an
  isolated checkout of unmodified `origin/main`. The flag allows browser test
  environments to provide their own storage. Lint passed, exit 0.
- QML contract suite: **152 checks passed**. Layout suite: **10 passed**, exit 0.
- [Host service test](../../packages/todo-plugin/tests/watch-service.py): **four
  checks passed**, exit 0. It exercises the actual sandbox properties with an
  isolated synthetic writer, including first start, permissions, restart
  preservation, and stop cleanup.
- `bun run typecheck:fast`, CLI build, and `git diff --check`: exit 0.
- Installed daemon was active with zero restarts. Its fresh snapshot had no
  subscription errors, targeted the canonical deployment, and matched active
  task IDs from the production HTTP read. The real Today panel rendered without
  a watch-error banner.

Reproduce the checks from the repository root:

```bash
bun run test:run src/test/pravahWatch.test.ts src/test/pravahWatchClient.test.ts src/test/pravahWatchLock.test.ts src/test/ownerConvexToken.test.ts src/test/httpRoutes.test.ts src/test/pravahLiveCommands.test.ts src/test/pravahCliEnv.test.ts
NODE_OPTIONS=--no-experimental-webstorage bun run test:run
bun run todo-plugin:test
python3 packages/todo-plugin/tests/watch-service.py
bun run typecheck:fast
bun run --cwd packages/cli build
```

The QML checks need Quickshell and a display. The host service check needs Linux
and a running user systemd manager. The mint regression tests endpoint claims
with the signer mocked; it does not prove production signing or deployment.

## Remaining delivery step

Deploy the backend JWT uniqueness change to `combative-zebra-261`, then verify
that same-second mints differ and watch renews across the 15-minute token
lifetime while continuing to publish fresh snapshots. Backend deployment has
not been authorized or performed. Merging source alone does not deploy this fix.

## Separate review findings

These remain outside this watch patch:

- A `tasks:read` credential can exchange for an owner JWT without scope
  restrictions. Owner mutations therefore bypass the HTTP read/write boundary.
  Source tracing confirmed the gap; no live mutation was attempted.
- Goal-only edits return `linkOperation`, which the toast ignores. Composite
  edits need group Undo, but the widget currently requests single-operation Undo.
- Watch-lock acquisition uses a non-atomic PID read/check/write sequence.
  Simultaneous startups can race; a concurrent-process reproduction is pending.

See the [full review](2026-10-04-pravah-plugin.md) for evidence and remaining test
limitations. No production planning records were changed during this work.
