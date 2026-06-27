# In-app App Update over GitHub Releases

Pravah's mobile app is distributed by sideloading: there is no Play/App Store listing, so friends install an APK from an EAS build link and have no built-in way to learn a newer build exists. We add a **manual "Check for updates"** action on the **About** settings screen that downloads and installs a newer signed APK in-app, sourced from the project's public GitHub Releases — porting the pattern proven in the sibling `pomo` app to Pravah's Expo/React Native stack.

This concerns **App Updates** (new native binaries) only. **OTA Updates** (the `expo-updates` automatic on-load fetch on the `preview` channel) are deliberately left untouched — see [[../../CONTEXT.md]] for both terms.

## Decision

1. **Manual & ephemeral.** The user taps to check; there is no launch-check, background polling, or persisted "update available" flag. Each visit to About starts at Idle. This stays well under GitHub's 60 req/hr unauthenticated limit and avoids stale-flag bugs.
2. **Source of truth is `mobile-v*` GitHub Releases, filtered — not `/releases/latest`.** Pravah's single public repo publishes `web-v*`, `cli-v*`, *and* `mobile-v*` releases, so GitHub's repo-wide "Latest" is usually a web/cli release. The app must `GET /releases`, keep only tags matching `mobile-v`, and pick the highest semver. (This is the key divergence from `pomo`, whose single-product repo can use `/releases/latest` directly.)
3. **Newer = semver from the tag.** Strip `mobile-v`, compare `MAJOR.MINOR.PATCH` numerically against `expo-application`'s `nativeApplicationVersion`. An unparseable tag is treated as "no update" (fail safe).
4. **Single APK by suffix + companion `.apk.md5`.** Select the lone release asset ending in `.apk`. Integrity is verified with **MD5**, not pomo's sha256: React Native has no cheap streaming sha256 (hashing an ~80 MB APK means reading it into a base64 string), whereas `expo-file-system`'s `getInfoAsync(uri, { md5: true })` is native and streaming. MD5 only needs to catch *corruption*; Android's install-time **signature check** is the real defense against a maliciously swapped APK.
5. **Download in-app, then install.** Stream the APK into app-private cache with `expo-file-system`, verify MD5 against the published `.apk.md5`, then hand the file to the system installer via a content URI (`getContentUriAsync` → `expo-intent-launcher` `ACTION_VIEW`). This requires the Android `REQUEST_INSTALL_PACKAGES` permission; if install-from-unknown-sources is not granted, route the user to that settings screen rather than failing silently.
6. **Android-only.** The flow is hidden on iOS (no sideload path). Gated to the canonical `com.pravah.mobile` build.

## Release pipeline

- **Mobile stays out of release-please** (which owns `web-v*` and `cli-v*` only). App version is bumped **by hand** in `app.json` + `apps/mobile/package.json` so appVersion — and therefore the OTA `runtimeVersion` lineage (`policy: "appVersion"`) — moves only on deliberate native releases. Re-adding mobile to release-please was rejected because per-commit auto-bumps would fragment OTA runtime versions.
- A new **`workflow_dispatch`-only** GitHub Actions workflow (no push/tag trigger, to avoid burning EAS credits) reads the version from `app.json`, runs `eas build -p android --profile preview` (the `distribution: internal` profile → APK, matching what friends already install), downloads the artifact, computes `.apk.md5`, and creates/updates the `mobile-v<version>` release with both assets + notes. Requires an `EXPO_TOKEN` repo secret.
- **Signing continuity is load-bearing.** In-place updates only work while every release is signed with the **same EAS-managed Android keystore**. Rotating that keystore would break in-place installs across the boundary (the OS rejects the mismatched signature). Do not rotate it.

## Considered alternatives

- **Browser/installer handoff** (open the GitHub release or EAS build page, install manually). Zero new permissions and OTA-safe, but worse UX — multi-app-switch and no integrity check before install. Rejected in favor of the integrated download, since sideloading is the only distribution path.
- **sha256 (pomo-exact).** Stronger digest but pays a base64-in-memory cost on low-end devices in RN. Rejected for MD5 + the signature-check backstop.
- **No checksum, lean on the installer's signature check.** Simplest, but a truncated download surfaces as a generic OS error instead of a clean "download corrupted, try again." Rejected.
- **Tag-/push-triggered CI build.** Closer to `pomo`'s automation, but would spend EAS credits on every release event. Rejected for a manual button while credits are scarce.
- **Native Play Core In-App Updates.** Irrelevant — requires a Play Store listing Pravah does not have.
