# Pravah Today for Omarchy

A compact Omarchy bar widget for today's Pravah tasks.

## What it does

- Shows a task-list icon with the number of tasks left today.
- Opens a focused Today panel on click.
- Adds tasks directly to today.
- Completes a task when its row is clicked.
- Refreshes every 30 seconds without hiding or resizing the bar widget.
- Keeps the last successful list visible when a refresh fails.

Task writes follow Pravah's safe CLI flow. The widget runs a dry-run first, then applies the same add or complete command only after the preview succeeds.

## Requirements

- Omarchy Shell
- `pravah` installed and available on the shell's `PATH`
- An authenticated Pravah credential with `tasks:read` and `tasks:write`

Check local readiness with:

```bash
pravah doctor --json
pravah auth status --json
```

## Install locally

Copy the plugin into Omarchy's user plugin directory:

```bash
mkdir -p ~/.config/omarchy/plugins/raja.pravah-todo/widget
cp omarchy-plugin/manifest.json ~/.config/omarchy/plugins/raja.pravah-todo/
cp omarchy-plugin/widget/PravahTodo.qml ~/.config/omarchy/plugins/raja.pravah-todo/widget/
```

Add the widget to `~/.config/omarchy/shell.json`:

```json
{
  "id": "raja.pravah-todo"
}
```

Then reload local plugins:

```bash
omarchy-shell shell rescanPlugins
```

If Omarchy keeps an older widget instance alive after an upgrade, run `omarchy restart shell` once.

## Controls

- Left click opens or closes the Today panel.
- Right click refreshes immediately.
- Enter a title and press Enter or click Add to create a task for today.
- Click a task row to complete it.

The poll interval is configurable through the widget's `pollIntervalSec` setting. It defaults to 30 seconds.
