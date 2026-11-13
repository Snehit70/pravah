#!/usr/bin/env bash
# Warm path: build this commit's test APK on the device runner while the
# emulator installs and boots, instead of in a separate prepare job. Run in the
# background after the native base was restored and asserted; writes
# "$1/prepare.status" when finished.
set -uo pipefail
state=$1
doctor=$2
(
  set -euo pipefail
  bun install --frozen-lockfile
  if [[ $doctor == true ]]; then bash scripts/mobile-ci/expo-doctor.sh; fi
  # repack reads build-tools; wait until the SDK prefetch stops writing there.
  bash scripts/mobile-ci/await.sh "$state" sdk || echo "SDK prefetch failed; repacking with the preinstalled build-tools."
  bash scripts/mobile-ci/repack.sh
  GITHUB_OUTPUT="$state/prepared.out" bun scripts/mobile-ci/native-base.ts prepared
  # Mirror the downloaded-artifact layout the device suite installs from.
  cp artifacts/mobile-native-base/base.apk artifacts/mobile-native-base/base.json artifacts/mobile-native-base/prepared.json artifacts/mobile-native-apk/
) > "$state/prepare.log" 2>&1
echo $? > "$state/prepare.status"
