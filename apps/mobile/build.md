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
