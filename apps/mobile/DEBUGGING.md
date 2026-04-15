# Pravah Mobile Debugging

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
