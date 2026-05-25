# Mobile Build Guide

## Requirements

- **Java 17** at `/usr/lib/jvm/jdk-17.0.12-oracle-x64` (Java 21+ breaks Gradle)
- **Android SDK** at `~/Android/Sdk` (installed via Android Studio)
- **KVM** enabled for emulator acceleration (`sudo usermod -aG kvm $USER`, then re-login)
- **bun** package manager

Java 17 is pinned in `android/gradle.properties` (`org.gradle.java.home`), so no need to set `JAVA_HOME` manually.

## Commands

### First-time build (~15 min)
Downloads NDK, SDK platform tools, and compiles all native modules from scratch.
```bash
cd apps/mobile
bun run android
```

### Subsequent builds (~2 min)
All native modules cached — only changed code recompiles.
```bash
cd apps/mobile
bun run android
```

### JS-only changes (~1 sec, no rebuild needed)
Keep Metro running and just edit files — the app hot-reloads instantly.
```bash
cd apps/mobile
npx expo start
```

## EAS preview delivery (APK install vs JS-only OTA update)

Use this when testing a cloud-built preview APK on a real device.

### One-time baseline (or after native/config changes)
Build and install a fresh preview APK:
```bash
cd apps/mobile
bunx eas-cli build --platform android --profile preview
```

### Fast path for JS-only fixes
If you only changed JS/TS code (no native/plugin/config changes), publish an OTA update:
```bash
cd apps/mobile
bunx eas-cli update --branch preview --platform android --message "fix: <short message>"
```

After publishing, close and reopen the installed app to pick up the update.

`--platform android` is intentional. Without it, `eas update` exports all platforms
and fails in this repo because web support dependencies are not installed for the
mobile Expo app.

### Publishing from a known-good runtime commit
This app uses `runtimeVersion.policy = "appVersion"`, so OTA updates only reach
installed APKs with the same `expo.version`. If a release commit bumps
`apps/mobile/app.json` before the current installed APK is rebuilt, publish the
OTA from the last commit that still has the installed runtime version.

### Version policy for OTA UI rounds
During JS-only UI rounds, do not bump `apps/mobile/app.json` `expo.version`.
Release automation is configured to stop auto-bumping mobile version so OTA
updates keep matching the installed preview runtime. Only bump mobile version
when you intentionally plan a new APK build rollout.

Verified example: the preview APK was built with runtime `2.1.0`, while `main`
had already moved to `2.2.0`. Publishing from the earlier merge commit worked:
```bash
git checkout cb25dfe
cd apps/mobile
node -e 'console.log(require("./app.json").expo.version)' # should print 2.1.0
bunx eas-cli update --branch preview --platform android --message "feat: polish mobile UI surfaces"
cd ../..
git switch main
```

Successful update details from that run:
- Branch: `preview`
- Runtime version: `2.1.0`
- Platform: `android`
- Commit: `cb25dfe4e7ba633b9f4e237a8b19c7f56f482162`
- Update group: `e8738f06-705f-44de-ba5d-217036e11002`

### Decision rule: when `build` is required
Run a new `eas build` when any of these changed:
- native modules or package native code
- Expo plugins list
- Android/iOS app config (package identifiers, permissions, icons/splash, etc.)
- Expo SDK or React Native version

If none of the above changed, prefer `eas update`.

## Emulator setup (one-time)

1. Install Android Studio via Flatpak:
   ```bash
   flatpak install flathub com.google.AndroidStudio -y
   ```
2. Launch: `flatpak run com.google.AndroidStudio`
3. First-run wizard → Standard setup → downloads ~400 MB SDK
4. Device Manager → Create Virtual Device → Pixel 8 → API 37 → Finish
5. Start the emulator from Device Manager before running `bun run android`

## Known issues

### expo-fetch build error
Expo SDK 54 declares `expo.modules.fetch.ExpoFetchModule` in its own `expo-module.config.json` but ships no Android implementation. If you see:
```
error: cannot find symbol expo.modules.fetch.ExpoFetchModule
```
Fix by clearing all three expo copies in node_modules:
```bash
for f in node_modules/.bun/expo@54.*/node_modules/expo/expo-module.config.json; do
  sed -i 's/"modules": \["expo.modules.fetch.ExpoFetchModule"\]/"modules": []/' "$f"
done
cd android && ./gradlew :expo:clean && cd ..
bun run android
```

### Stale Gradle daemons (Java version mismatch)
If you see `Unsupported class file major version 69`, kill all daemons:
```bash
cd android && ./gradlew --stop && cd ..
bun run android
```

### Android Studio lock file
If Android Studio refuses to open with a `DirectoryLock` error:
```bash
rm ~/.var/app/com.google.AndroidStudio/config/Google/AndroidStudio*/. lock
```

## Device targets

Both emulator and physical device work identically. When multiple devices are connected, `bun run android` prompts you to pick one.

Physical device requirements:
- USB debugging enabled (Developer Options)
- On MIUI: also enable "USB debugging (Security settings)" in Developer Options
- Accept the ADB authorization dialog on the phone
