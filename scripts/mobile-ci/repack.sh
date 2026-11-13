#!/usr/bin/env bash
# Embed the current JS bundle into the validated native base and verify it.
# Reads artifacts/mobile-native-base, writes artifacts/mobile-native-apk/app.apk.
set -euo pipefail
repo_root=$(git rev-parse --show-toplevel)
base="$repo_root/artifacts/mobile-native-base"
out="$repo_root/artifacts/mobile-native-apk"
mkdir -p "$out"
cd "$repo_root/apps/mobile"
bunx @expo/repack-app@0.10.4 --platform android --js-bundle-only --embed-bundle-assets \
  --source-app "$base/base.apk" --output "$out/app.apk" \
  --ks "$base/debug.keystore" --ks-key-alias androiddebugkey --ks-pass pass:android --ks-key-pass pass:android
cd "$repo_root"
bun scripts/mobile-ci/verify-apk.ts fixture artifacts/mobile-native-apk/app.apk
