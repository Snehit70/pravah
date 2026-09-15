#!/usr/bin/env bash
set -euo pipefail

# bunx eas-cli resolves @types/node@* and can 404 on a version whose
# registry metadata exists before the tarball (26.6.0 on 2026-09-15).
# eas-cli's published package does not depend on @types/node; npm's
# global install of a pinned version stays off that types package.
version="${EAS_CLI_VERSION:-24.6.0}"
if command -v eas >/dev/null 2>&1; then
  installed="$(eas --version 2>/dev/null || true)"
  if [[ "$installed" == *"$version"* ]]; then
    exit 0
  fi
fi
npm install --global "eas-cli@${version}"
eas --version
