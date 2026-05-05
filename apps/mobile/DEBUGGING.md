# Pravah Debugging

## Log Prefix

- App logs use the prefix: `[PRAVAH_MOBILE]`
- Filter this prefix from `ReactNativeJS` output in Logcat.

## Useful Commands

From the repo root:

```bash
adb -s 57e38b78 logcat -c
adb -s 57e38b78 logcat -v time ReactNativeJS:I ActivityManager:E AndroidRuntime:E "*:S"
```

To filter only Pravah app logs:

```bash
adb -s 57e38b78 logcat -v time ReactNativeJS:I "*:S" | rg "\[PRAVAH_MOBILE\]"
```

To check ANR records:

```bash
adb -s 57e38b78 shell dumpsys dropbox --print data_app_anr | rg -n "com.pravah.mobile|Subject:|Cmd line:"
```

## What To Collect During QA

- Failed step number.
- Approx timestamp (`HH:MM`).
- Expected vs actual behavior.
- A matching `[PRAVAH_MOBILE]` action id if available.

## High-Value Mobile QA Checks

- Open Settings -> Kairo and verify the API key field stays visible above the keyboard.
- With the keyboard open, scroll to base URL and model and confirm they remain reachable.
- Switch between Inbox / Timeline / Completed and confirm no tab briefly renders blank.
- Force a dev-time error in one tab and confirm only that tab falls back, not the whole app.

## Known dependency pins

The list-rendering and bottom-sheet stacks have to be co-validated as a set:

- `react-native-reanimated` (currently `^4.x`)
- `react-native-gesture-handler`
- `@gorhom/bottom-sheet`
- `react-native-draggable-flatlist`

Reanimated 4 introduced breaking changes that older drag/sheet libraries
have not all caught up to. Symptom: the screen header and FAB render but
the list area is silently blank — no skeleton, no items, no empty state.
If you see this, suspect a list-renderer regression first and check the
counts query vs. the rendered list (mismatch = renderer is failing).

Inbox and Timeline currently use plain `FlatList` (drag-to-reorder is
disabled) for this reason. When swapping libraries, run the smoke walk in
`MOBILE_TESTING.md` end-to-end and confirm step 2/3/4 lists actually
render rows.
