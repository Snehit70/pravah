# Pravah Mobile — Manual & Agent-Driven Testing Guide

This guide is written for an agent (or human) who needs to traverse the
Pravah mobile app from the outside via ADB. It tells you what to install,
what commands to run, where every interactive surface lives, and what
checkpoints prove a screen is healthy.

It assumes nothing about the codebase. Use it before opening any source
file — the goal is to learn from the running app, not from `App.tsx`.

---

## 1. Prerequisites

1. **Android device** with USB debugging enabled, plugged in (or paired
   wirelessly) and authorized for this host.
2. **`adb`** on `PATH`. Verify with `adb devices` — exactly one entry
   should appear, ending in `device` (not `unauthorized` or `offline`).
3. **Pravah app installed** as `com.pravah.mobile`. Verify with
   `adb shell pm list packages | grep pravah`.
4. **Signed-in account.** Most queries skip when the session is missing.
   If the screen shows the auth wall (Google sign-in button, no header
   chrome), data tests are not meaningful — sign in first or restore the
   secure-store session.
5. **A scratch directory** for screenshots and UI dumps. Use `/tmp/pravah-test/`
   (create it once with `mkdir -p`).

If multiple devices are attached, prefix every `adb` command with
`-s <serial>` (find the serial via `adb devices`). All examples below
assume a single device.

---

## 2. Launch & lifecycle commands

| Action | Command |
|---|---|
| List installed Pravah build | `adb shell dumpsys package com.pravah.mobile \| grep -E "versionName\|lastUpdateTime"` |
| Cold-start the app | `adb shell am force-stop com.pravah.mobile && adb shell monkey -p com.pravah.mobile -c android.intent.category.LAUNCHER 1` |
| Bring to foreground (warm) | `adb shell monkey -p com.pravah.mobile -c android.intent.category.LAUNCHER 1` |
| Force stop | `adb shell am force-stop com.pravah.mobile` |
| Clear app data (DESTRUCTIVE — wipes secure-store session) | `adb shell pm clear com.pravah.mobile` |

After a cold start, give the app **5–6 seconds** before the first
screenshot. The JS bundle, Convex auth, and Reanimated initialization
all run on first frame; querying earlier will catch a partial UI.

---

## 3. Capturing the UI

### 3.1 Screenshot

```bash
adb exec-out screencap -p > /tmp/pravah-test/<name>.png
```

Always pipe through `exec-out` (not `shell`) — `shell` mangles the PNG
on some devices.

### 3.2 UI hierarchy dump (gives bounds, text, content-desc)

```bash
adb shell uiautomator dump /sdcard/ui.xml
adb pull /sdcard/ui.xml /tmp/pravah-test/ui-<name>.xml
```

You will get a single-line XML. Useful one-liners:

```bash
# All visible text on screen
grep -oE 'text="[^"]+"' /tmp/pravah-test/ui-<name>.xml | sort -u

# Element bounds for tappable buttons
grep -oE '(content-desc|bounds)="[^"]*"' /tmp/pravah-test/ui-<name>.xml \
  | paste - - | grep -i '<keyword>'
```

The dump is the source of truth for tap coordinates. Don't guess pixel
offsets from the screenshot — read them from `bounds="[x1,y1][x2,y2]"`.

### 3.3 Logs

The app prefixes JS log lines with `[PRAVAH_MOBILE]`.

```bash
# Clear, then stream (in background) only what matters
adb logcat -c
adb logcat -v time ReactNativeJS:V ReactNative:W ExpoModulesCore:V '*:S'

# One-shot dump after an action
adb logcat -d -v time | grep -aE 'PRAVAH_MOBILE|ReactNativeJS|screen_error'
```

Action ids worth searching for:
`session_ready`, `retry_queue_hydrated`, `kairo_opened`,
`settings_modal_opened`, `screen_error_boundary_caught`,
`add_task_*`, `complete_task_*`, `move_task_*`.

A native crash leaves a dropbox entry:

```bash
adb shell dumpsys dropbox --print data_app_crash | grep -A 30 com.pravah.mobile
```

---

## 4. Sending input

```bash
# Tap absolute pixel
adb shell input tap <x> <y>

# Swipe (used to scroll lists or pull-to-refresh)
adb shell input swipe <x1> <y1> <x2> <y2> <duration_ms>

# Hardware keys
adb shell input keyevent 4    # BACK
adb shell input keyevent 111  # ESC (closes IME on most ROMs)
adb shell input keyevent 187  # APP_SWITCH
```

**Back-button behavior.** A single `BACK` from any open sheet
(Capture / Edit / Settings / Kairo) closes that sheet and returns you
to the workspace — it does **not** background the app. A second `BACK`
from the workspace itself backgrounds the app as expected. If you ever
see one `BACK` press take you straight to the launcher, that is a
regression in the root `BackHandler` (see `App.tsx`).

To dismiss the keyboard without losing screen state, prefer
`adb shell input keyevent 111` (ESC). If the keyboard re-opens by
itself, a `TextInput` somewhere is auto-focusing — that is interesting
data, capture it.

---

## 5. Map of the app

The home view has a fixed header (wordmark, Kairo link, Settings link),
a per-tab title + subtitle, a list area, a Capture FAB, and a bottom tab
bar with three tabs.

```
┌────────────────────────────────┐
│ Pravah               KAIRO  SETTINGS │  ← header (always)
│ <View name>                    │  ← Inbox / Timeline / Completed
│ <subtitle / count line>        │
│                                │
│  ┌── list area ──┐             │
│  │ tasks or      │             │
│  │ empty state   │             │
│  └───────────────┘             │
│                                │
│                       + Capture │  ← FAB (above tab bar)
│ Inbox    Timeline    Done      │  ← bottom tab bar
└────────────────────────────────┘
```

Modals and sheets that overlay the home view:

| Surface | How to open |
|---|---|
| Settings (full-screen modal) | tap `SETTINGS` link top-right |
| Kairo (assistant sheet) | tap `KAIRO` link top-right |
| Add Task (capture sheet) | tap `+ Capture` FAB |
| Edit Task (sheet) | tap an existing task row |

---

## 6. Locating buttons reliably

Pixel coordinates differ per device resolution. **Don't memorize them
across sessions.** Re-dump UI and read the bounds. Anchors that are
stable by `content-desc`:

| `content-desc` | What it is |
|---|---|
| `Open Kairo assistant` | KAIRO link, header right |
| `Open settings` | SETTINGS link, header right |
| `Capture a new task` | FAB |
| `Inbox` / `Timeline` / `Done` | bottom tab buttons |
| `Capture a task` | inline CTA in the empty Inbox state |
| `Sync Google Calendar now` | Settings → Sync card |
| `Bottom sheet backdrop` | dimmed scrim behind any open sheet — tap to dismiss |

Tap the **center** of the bounds: `cx = (x1+x2)/2`, `cy = (y1+y2)/2`.

---

## 7. End-to-end smoke walk

Run this exact sequence on every build before declaring it healthy.
Save a screenshot at every numbered step so a regression is obvious from
the file timeline alone.

1. **Cold start.** Force-stop, then launch. Within 5s, the header should
   appear with the wordmark, Kairo link, Settings link, an active
   bottom-tab indicator under one of the three tabs, and the Capture
   FAB. **Checkpoint:** logcat contains `session_ready` and
   `retry_queue_hydrated`.

2. **Inbox tab.** Tap `Inbox` if not already active. The header subtitle
   reads `NN to triage` (zero-padded). **Checkpoint:** if the count is
   `> 0`, the list area must contain at least one task row; if `00`,
   the empty state ("Nothing to carry forward.") must be present. The
   list area must never be silently blank.

3. **Timeline tab.** Tap `Timeline`. Subtitle reads `NN through this
   week`. **Checkpoint:** if `NN > 0`, at least one date-section header
   plus one task row must render. Pull-to-refresh (swipe down ~600px
   from the top of the list) should briefly show the spinner.

4. **Completed tab.** Tap `Done`. Subtitle reads `Closed loops`.
   **Checkpoint:** completed tasks render with strikethrough and a
   green status dot, sorted by most-recent first.

5. **Capture flow.** Tap the FAB. The Add Task sheet rises from the
   bottom; the title `TextInput` focuses and the keyboard opens.
   Type a title, tap `Add task`. **Checkpoint:** the sheet closes,
   the new task appears in Inbox at the top, and the inbox count
   increments by 1. The primary `Add task` button must remain visible
   while typing — a `Discard` link appears beneath it once a draft
   exists, but it must not replace `Add task`.

6. **Edit flow.** Tap an existing task row. The Edit sheet opens with
   the task pre-filled. Make a trivial change, save. **Checkpoint:**
   the row in the list reflects the change without a refresh.

7. **Complete flow.** Tap the priority dot at the left of a task row
   (or whatever the row's complete affordance is). **Checkpoint:** the
   row leaves Inbox/Timeline and appears in Done.

8. **Reorder flow** (Inbox & Timeline). _Currently disabled._ Drag-to-
   reorder is off while the underlying list library catches up to
   Reanimated 4. Long-press should not lift a row; if it does, the
   workaround has been removed and step 8 needs to be re-enabled here.

9. **Settings.** Tap `SETTINGS`. The full-screen modal opens with the
   four jump chips (Assistant / Sync / Alerts / Account) and the
   sections beneath them. Tap each chip and confirm the section
   scrolls into view. **Checkpoint:** Kairo provider toggle (Anthropic
   / OpenAI), API-key field with show/hide, GCal connect status, Gmail
   connect status, Notification permission, Daily reminder toggle, Sign
   out — each must be present and tappable.

10. **Kairo.** Tap `KAIRO`. The Kairo sheet opens, the rest of the
    chrome dims, and the input field accepts text. Send a trivial
    prompt and confirm a streamed response. **Checkpoint:** the input
    survives keyboard open/close without being covered.

11. **Back behaviour.** From the workspace (no sheet open), pressing
    `BACK` should background the app. From inside any sheet/modal,
    pressing `BACK` once should close the sheet and return you to the
    workspace, **not** background the app.

12. **Auth boundary.** Sign out from Settings → Account. **Checkpoint:**
    the auth screen appears immediately; relaunching cold goes to the
    auth screen, not a brief flash of the workspace.

If any checkpoint fails, capture: the screenshot, the UI dump, the last
~50 lines of logcat with the `[PRAVAH_MOBILE]` prefix, and the build's
`versionName` + `lastUpdateTime`.

---

## 8. Header subtitle invariants

Each tab's subtitle is the cheapest signal that data is wired up
correctly. Use it as the first thing you read after switching tabs.

| Tab | Format | Source |
|---|---|---|
| Inbox | `NN to triage` (zero-padded) | count of `status:"inbox"` |
| Timeline | `NN through this week` | count of `status:"scheduled"` within the visible date window |
| Completed | `Closed loops` (no number) | — |

If a count and the rendered list disagree (count > 0 but list is empty,
or vice versa), that is a bug worth filing — the count comes from a
different query than the list and they should always agree once both
have resolved.

---

## 9. What "healthy" looks like in logcat

A clean cold start emits roughly:

```
ExpoModulesCore: ✅ AppContext was initialized
ExpoModulesCore: ✅ JSI interop was installed
ExpoModulesCore: ✅ Constants were exported
ReactNativeJS:   Running "main"
ReactNativeJS:   [PRAVAH_MOBILE] INFO retry_queue_hydrated {"hydratedCount":0}
ReactNativeJS:   [PRAVAH_MOBILE] INFO session_ready {"elapsedMs":<≤2000>}
```

`session_ready` taking longer than ~3s on a warm network is worth
flagging. A missing `retry_queue_hydrated` means the secure-store /
storage gate didn't resolve — the user is probably stuck on the boot
screen.

Anything tagged `screen_error_boundary_caught` is a real exception that
the React boundary swallowed; the `errorMessage` and `componentStack`
fields tell you which screen blew up.

---

## 10. What this guide deliberately does not cover

- Specific tap coordinates (resolution-dependent — re-derive each run).
- Bug status of any individual feature (rots fast — read recent commits).
- Build/release process (see `apps/mobile/eas.json` and the root README).
- iOS specifics (this guide is Android-via-ADB; iOS uses Xcode +
  `xcrun simctl` and is structurally similar but has its own commands).

---

## 11. Quick reference card

```bash
# Setup
mkdir -p /tmp/pravah-test
adb devices

# Cold start + first screenshot
adb shell am force-stop com.pravah.mobile
adb shell monkey -p com.pravah.mobile -c android.intent.category.LAUNCHER 1
sleep 6
adb exec-out screencap -p > /tmp/pravah-test/01-launch.png

# UI hierarchy
adb shell uiautomator dump /sdcard/ui.xml
adb pull /sdcard/ui.xml /tmp/pravah-test/ui-01.xml

# JS logs only
adb logcat -d -v time | grep -aE 'PRAVAH_MOBILE|screen_error'

# Tap by content-desc bounds (read from ui.xml first)
adb shell input tap <cx> <cy>

# Dismiss keyboard without exiting screen
adb shell input keyevent 111
```
