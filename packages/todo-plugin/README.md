# Pravah Todo for Omarchy

A full front-end for the Pravah CLI living in the Omarchy bar: every v2 CLI
capability in a native panel — no terminal needed for daily planning.

## What it does

**Views** (tabs, with live counts):

- **Today** — tasks scheduled today, with overdue pinned at the top in red
  and a collapsible "Completed" section underneath.
- **Inbox** — unscheduled tasks for quick triage.
- **Upcoming** — the next 14 days grouped by date, like `pravah upcoming`.
- **Goals** — goals with linked-task progress bars, add / edit / remove.

**Actions** (all writes go through the CLI's dry-run → apply safety flow):

- Quick capture with tokens: `Draft spec !p1 @work ~30m 9:30` sets priority,
  tags, estimate, and time inline. `⋯` opens the full form (description,
  date picker, time, priority, tags, estimate).
- Complete a task from its checkbox; click again to reopen.
- Row menu (`⋯`): change date (mini calendar), move to Inbox, remove
  (with a confirm dialog; removal stays recoverable through Undo).
- Edit any task field, including notes, via ✎.
- Undo the last write from the toast while the operation is still recoverable.
- Search plus priority and tag filters across all task tabs.
- Health dot in the header: `pravah doctor` / `auth status` run once at
  startup; a read-only credential disables actions with a clear message.

The bar icon keeps a live badge of today's remaining tasks and turns red
when anything is overdue. The last good list is kept visible when a refresh
fails.

## Requirements

- Omarchy Shell
- `pravah` installed and available on the shell's `PATH` (CLI v2). The `watch`
  transport, which is now the default, is not in a published CLI release yet —
  build from source with `bun run --cwd packages/cli build` and check
  `pravah watch --help` works before relying on it.
- An authenticated Pravah credential with `tasks:read`, and `tasks:write`
  for anything beyond viewing

Check local readiness with:

```bash
pravah doctor --json
pravah auth status --json
```

## Install locally

Copy the plugin into Omarchy's user plugin directory (the whole `widget`
folder — the panel is composed of several QML files):

```bash
mkdir -p ~/.config/omarchy/plugins/raja.pravah-todo
cp -r omarchy-plugin/widget ~/.config/omarchy/plugins/raja.pravah-todo/
cp omarchy-plugin/manifest.json ~/.config/omarchy/plugins/raja.pravah-todo/
```

Add the widget to `~/.config/omarchy/shell.json`:

```json
{
  "version": 1,
  "bar": {
    "layout": {
      "right": [
        { "id": "raja.pravah-todo" }
      ]
    }
  }
}
```

Keep the other widgets already present in the `right` array and insert the
Pravah entry where you want its icon to appear.

Then reload local plugins:

```bash
omarchy-shell shell rescanPlugins
```

If Omarchy keeps an older widget instance alive after an upgrade, run
`omarchy restart shell` once.

## Keep the snapshot fresh

The widget defaults to the `watch` transport: `pravah watch` holds a Convex
websocket and publishes a snapshot file, which the widget reads. That replaces
the old `tasks list --all` poll, which re-scanned every task and task-image row
on a timer whether or not anything had changed. Cached query reads are not
charged database bandwidth, so an idle bar costs almost nothing.

Watch mode needs that daemon running. Without it the widget reports an error
rather than quietly falling back to HTTP polling, since stale data behind a
working-looking panel is worse than a visible failure.

Install the bundled user unit:

```bash
cp omarchy-plugin/pravah-watch.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now pravah-watch.service
```

The unit creates the private runtime directory before applying its filesystem
sandbox and preserves the last snapshot across restarts. After updating an
existing installation, copy the unit again, run `daemon-reload`, and restart
`pravah-watch.service`.

Check it:

```bash
systemctl --user status pravah-watch.service
```

Set `transport` back to `cli` in the plugin settings to poll over HTTP instead.
That path needs no daemon, at the cost of the periodic full read.

Writes always go over HTTP in both transports.

## Controls

- Left click opens or closes the panel; right click refreshes immediately.
- `Today | Inbox | Upcoming | Goals` tabs across the top.
- Type in the quick-add field and press Enter to capture; tokens
  `!p1`, `@tag`, `~30m`, and `9:30` are parsed out of the title.
- Checkbox completes / reopens; ✎ edits; ⋯ opens the row menu.
- Escape closes the panel (or the topmost overlay first).

## Keybindings and scripting

The widget registers an IPC target, so the panel can be summoned without
touching the bar icon. Bind it in Hyprland, e.g.:

```ini
bindd = SUPER ALT T, exec, omarchy-shell raja.pravah-todo toggle
```

Available methods: `open`, `close`, `toggle`, `refresh`.

## Settings

Configurable through the widget's settings (shell.json entry or the shell's
widget settings UI):

- `transport` — read transport, default `watch`. Set to `cli` to poll the
  HTTP API instead of reading the snapshot that `pravah watch` maintains.
- `pollIntervalSec` — refresh cadence, default 300 (min 10). Right click still refreshes immediately. Ignored in `watch` transport.
- `defaultTab` — which tab opens on click, default `today`.
- `showCompleted` — show the completed section on Today, default `On`.

### Watch transport

With `transport: watch`, the widget reads
`$XDG_RUNTIME_DIR/pravah/snapshot.json` through a `FileView` and repaints when
the file changes. Reads cost no network and no process spawn. The path is
resolved once at startup via `pravah watch --path`, so the XDG fallback rules
stay in the CLI rather than being duplicated in QML. Writes still go over HTTP.

The widget does not fall back to polling when the snapshot is missing or stops
updating. It shows the failure instead, because silently reverting to polling
would hide a dead `pravah watch` behind data that looks current. The daemon
heartbeats the snapshot every minute while idle, and the widget rechecks
freshness on every file change, on a 30s timer, and on manual refresh (right
click, Refresh button, or the `refresh` IPC method).

Run `pravah watch` yourself, or under a supervisor:

```sh
pravah watch
```

Note that the subscription only carries today's completions, so goal progress in
watch transport counts completions within the current day.

## Tests

The data layer has a QML contract suite that runs against a fake `pravah`
stub (v2 envelope only, no network, no live writes):

```bash
bun run todo-plugin:test
```

It needs `quickshell` and a Wayland/X11 display. Machines without the
Omarchy shell kit skip with exit 0.

The suite covers envelope parsing, task/goal/operation normalization,
today/overdue/upcoming/inbox horizons, quick-add tokens, argv builders,
filters, health, and the dry-run → apply write pipeline with a shared
idempotency key.

On a Linux host with a running user systemd manager, verify the actual service
sandbox and runtime-directory lifecycle separately:

```bash
python3 packages/todo-plugin/tests/watch-service.py
```

Run this from the repository root. It starts an isolated synthetic writer and
checks first-start publication, directory permissions, restart preservation,
and stop cleanup without touching credentials or production data.

## Notes

- The widget only ever runs the v2 CLI contract (`tasks list/add/edit/
  complete/reopen/schedule/unschedule/remove`, `goals …`,
  `operations list/undo`, `doctor`, `auth status`). Every write previews
  with `--dry-run` first and applies with the same argv plus a shared
  `--idempotency-key`, so the dry-run/apply pair for one submission is
  safe. Each new submission mints a fresh key, so a manual retry after
  an ambiguous result is not deduplicated.
- `auth login` / `auth logout` are intentionally not in the panel —
  credentials should never flow through a GUI surface.
