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
- `pravah` installed and available on the shell's `PATH` (CLI v2)
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

- `pollIntervalSec` — refresh cadence, default 30 (min 10).
- `defaultTab` — which tab opens on click, default `today`.
- `showCompleted` — show the completed section on Today, default `On`.

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
