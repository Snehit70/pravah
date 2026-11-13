#!/usr/bin/env bash
# Wait for a background task started by the mobile-device action, replay its
# log, and exit with its status. Usage: await.sh <state-dir> <sdk|prepare>
set -euo pipefail
state=$1
name=$2
deadline=$((SECONDS + 900))
until [[ -f "$state/$name.status" ]]; do
  if (( SECONDS > deadline )); then echo "Timed out waiting for $name"; exit 1; fi
  sleep 1
done
echo "::group::$name log"
cat "$state/$name.log" 2>/dev/null || true
echo "::endgroup::"
exit "$(cat "$state/$name.status")"
