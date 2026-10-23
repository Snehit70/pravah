#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${APP_VARIANT:-}" == e2e && "${PRAVAH_E2E:-}" == 1 ]]
repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root/apps/mobile"
bunx expo prebuild --platform android --no-install
python - <<'PY'
import pathlib
import xml.etree.ElementTree as ET
ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')
ET.register_namespace('tools', 'http://schemas.android.com/tools')
manifest = pathlib.Path('android/app/src/main/AndroidManifest.xml')
tree = ET.parse(manifest)
tree.getroot().find('application').set('{http://schemas.android.com/apk/res/android}usesCleartextTraffic', 'true')
tree.write(manifest, encoding='utf-8', xml_declaration=True)
PY
cd android
build_evidence="$repo_root/artifacts/mobile-native-build"
mkdir -p "$build_evidence"
(
  for minute in {1..10}; do sleep 60; done
  free -m > "$build_evidence/memory.txt"
  ps -eo pid,ppid,stat,pcpu,pmem,comm --sort=-pcpu > "$build_evidence/processes.txt"
  jps -l | while read -r pid main_class; do
    case "$main_class" in
      *GradleDaemon|*KotlinCompileDaemon) jcmd "$pid" Thread.print > "$build_evidence/threads-$pid.txt" 2>&1 || true ;;
    esac
  done
) &
probe_pid=$!
trap 'kill "$probe_pid" 2>/dev/null || true' EXIT
gradle_args=(assembleRelease -PreactNativeArchitectures=x86_64 --max-workers=2 --no-parallel --no-daemon --console=plain --stacktrace)
if [[ "${FORCE_CLEAN:-false}" == true ]]; then gradle_args+=(--no-build-cache --rerun-tasks); fi
./gradlew "${gradle_args[@]}" 2>&1 | tee "$build_evidence/gradle.log"
cd "$repo_root"
EXPECTED_FIXTURE_SOURCE=0000000000000000000000000000000000000000 bun scripts/mobile-ci/verify-apk.ts fixture apps/mobile/android/app/build/outputs/apk/release/app-release.apk
bun scripts/mobile-ci/native-base.ts seal
