#!/usr/bin/env bash
# Install the SDK packages android-emulator-runner needs, so its own install
# step finds them present. Run in the background at job start; the emulator
# step waits for "$1/sdk.status" so two sdkmanager processes never overlap.
set -uo pipefail
state=$1
sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
(
  set -euo pipefail
  yes | "$sdkmanager" --licenses > /dev/null || true
  "$sdkmanager" --install 'build-tools;37.0.0' platform-tools 'platforms;android-35' \
    'system-images;android-35;google_apis;x86_64' > /dev/null
) > "$state/sdk.log" 2>&1
echo $? > "$state/sdk.status"
