#!/usr/bin/env bash
set -euo pipefail

mode=${1:-all}
case "$mode" in workflows|performance|all) ;; *) echo 'Unknown native test suite' >&2; exit 1 ;; esac
out="artifacts/mobile-native/$mode"
mkdir -p "$out"
trap 'adb logcat -d > "$out/logcat.txt"; adb shell dumpsys meminfo com.pravah.mobile.e2e > "$out/memory-final.txt"; kill "${fixture_pid:-}" 2>/dev/null || true' EXIT
git rev-parse HEAD > "$out/revision.txt"
adb shell getprop ro.build.fingerprint > "$out/device-fingerprint.txt"
# Keep the Pixel 6 logical layout, with fewer pixels for the CI host's
# software renderer. These settings apply only to the disposable emulator.
adb shell wm size 720x1600
adb shell wm density 280
adb shell wm size > "$out/display-size.txt"
adb shell wm density > "$out/display-density.txt"
adb install "${APK_PATH:-apps/mobile/android/app/build/outputs/apk/release/app-release.apk}"
adb shell pm clear com.pravah.mobile.e2e > "$out/clear-state.txt"
timeout 30s adb wait-for-device
adb reverse tcp:8765 tcp:8765
python - <<'PY'
import socket
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', 8765)) == 0:
        raise RuntimeError('Port 8765 is already in use; refusing to start a second fixture server')
PY
python scripts/mobile-performance/fixture-server.py > "$out/fixture-server.txt" 2>&1 &
fixture_pid=$!
# Establish an app/device round trip before Maestro starts its driver. Clearing
# data inside launchApp can briefly drop ADB on a freshly booted API 35 image.
adb shell am start -W -n com.pravah.mobile.e2e/.MainActivity > "$out/setup-launch.txt"
adb shell am force-stop com.pravah.mobile.e2e
timeout 30s adb wait-for-device
if [[ "$mode" == workflows || "$mode" == all ]]; then
  maestro test --format junit --output "$out/workflows.xml" --test-output-dir "$out/maestro-workflows" apps/mobile/e2e/workflows.yaml
fi
if [[ "$mode" == performance || "$mode" == all ]]; then
  python scripts/mobile-performance/native-check.py startup --out "$out"
  maestro test --format junit --output "$out/scroll.xml" --test-output-dir "$out/maestro-scroll" apps/mobile/e2e/scroll.yaml
  python scripts/mobile-performance/native-check.py scroll --out "$out"
fi
