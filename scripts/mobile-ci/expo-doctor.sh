#!/usr/bin/env bash
# Check SDK and native dependency alignment. Only the SDK patch-drift check may
# warn (OTA release path); any other expo-doctor failure fails the caller.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)/apps/mobile"
output=$(bunx expo-doctor@1.21.5 2>&1)
status=$?
printf '%s\n' "$output"
if [[ $status -ne 0 ]]; then
  if grep -q "1 check failed" <<<"$output" && grep -q "Check that packages match versions required by installed Expo SDK" <<<"$output"; then
    echo "::warning::expo-doctor reports SDK package patch drift; continuing (OTA release path)."
  else
    exit "$status"
  fi
fi
