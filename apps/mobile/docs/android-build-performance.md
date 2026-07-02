# Android Gradle Build Performance

Scope: the **native Android Gradle build** in isolation (`apps/mobile/android/`),
i.e. what runs when you do `expo run:android` / `./gradlew :app:assembleDebug`.
This is **not** about Metro, EAS, or OTA updates.

## TL;DR

The default Expo-generated `gradle.properties` ships with parallel builds off and
no build/config caching. We enabled them. On this project (4 cores, new
architecture enabled → heavy C++ codegen) the expected effect is:

- **Clean build: ~20–35% faster** (parallel module compilation)
- **Incremental / re-build with no native changes: ~35–80% faster** (build cache
  and daemon reuse avoid recompiling unchanged work)
- **Config phase per invocation: no special speedup currently** because Expo/RN
  still blocks safe use of Gradle configuration cache here

These are estimates from documented Gradle benchmark ranges, not a measured
run on this machine. See "How to verify" to capture real numbers.

## Machine assumptions (why the numbers, and the RAM cap)

This config was tuned for the current dev machine:

- 4 CPU cores
- 15 GB RAM total, but frequently **low free memory** (Metro/Node, editor, etc.
  already resident)

Parallel Gradle + Kotlin daemon + C++/CMake compilers can spawn enough
concurrent JVM/native processes to exhaust RAM and push the box into swap.
Swapping erases the parallelism win. That is why `org.gradle.workers.max=3` is
set — leave one core/headroom for the OS and Metro rather than saturating all 4.

If you move to a machine with more RAM and cores, raise or remove
`org.gradle.workers.max` and consider bumping `-Xmx`.

## What changed in `gradle.properties` and why

| Property | Before | After | Why |
|---|---|---|---|
| `org.gradle.parallel` | `false` | `true` | Compile independent modules concurrently across cores. Main clean-build win. |
| `org.gradle.caching` | (unset) | `true` | Local build cache: reuse task outputs from prior builds instead of recompiling unchanged modules. Main day-to-day win. |
| `org.gradle.configuration-cache` | (unset) | `false` | Expo/RN still starts `node` during configuration, so enabling this currently breaks the build instead of speeding it up. |
| `org.gradle.daemon` | (unset, defaults true) | `true` | Explicitly keep the Gradle daemon warm between builds. |
| `org.gradle.workers.max` | (unset) | `3` | Prevent parallel builds + Metro + compilers from exhausting RAM and swapping. |

## Where the time actually goes in this build

Ranked slowest → fastest for a clean build here:

1. **C++ compilation (CMake/ndk) from the New Architecture.** `newArchEnabled=true`
   triggers codegen + Fabric/TurboModule native compilation. This is the single
   largest, most CPU-bound phase. Parallelism helps it most; caching makes it
   near-free on rebuilds when native inputs are unchanged.
2. **Kotlin/Java compilation** of app + autolinked Expo/RN modules.
3. **Packaging / dexing** into the APK.
4. **Configuration phase** (still reruns normally; configuration cache is intentionally off).

Already good and left alone:

- `reactNativeArchitectures=arm64-v8a` — single ABI. Do **not** add more ABIs for
  dev builds; each extra ABI multiplies C++ compile time.
- `org.gradle.jvmargs=-Xmx4096m` — adequate; deliberately **not** raised because
  of the RAM constraint above.

## Why not Bazel (recorded decision)

Bazel was considered and rejected for this project:

- Bazel does not build Expo/React Native Gradle projects out of the box. RN's
  Android build is bound to the `com.facebook.react` Gradle plugin, Expo
  autolinking (`expoAutolinking` in `settings.gradle`), and the Expo version
  catalog. There is no supported Bazel path for an Expo-managed app.
- Migrating would mean hand-authoring Bazel rules for every native module, RN
  codegen, the CMake C++ targets, and Expo autolinking — weeks-plus of work that
  breaks on every Expo/RN upgrade.
- Bazel's real payoff is remote caching + remote execution across a large
  team/monorepo. This is a single-developer, single-machine project. ~90% of the
  remote-cache benefit is already obtained locally via `org.gradle.caching=true`
  for free.

Verdict: Bazel would cost weeks, add fragility, and likely be slower locally.
Local Gradle caching + parallelism is the correct optimization.

## ccache — accelerating the C++/NDK phase (the #1 bottleneck)

The slowest phase of Pravah's native build is C++ compilation. This is not code we
wrote — React Native itself is C++ under the hood:

- **Hermes** (the JS engine) runs our JavaScript — written in C++.
- **Fabric** (the renderer) turns `<View>`/`<Text>` into Android views — C++.
- **TurboModules** bridge JS to native modules — C++.

With `newArchEnabled=true`, RN generates app-specific C++ (codegen) and compiles it
every native build. On top of that, native modules Pravah depends on
(`react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`,
`react-native-svg`) each ship their own C++ compiled via CMake. clang recompiles all
of this from scratch on clean builds even though the C++ almost never changes (we edit
JS/Kotlin).

### What we use now vs. what accelerates it

| | Compiler | Per build |
|---|---|---|
| Before | NDK clang | recompiles all New-Arch + module C++ every clean build |
| After | NDK clang (**unchanged**) | ccache returns cached objects; clang only runs on C++ that actually changed |

ccache is **not a compiler replacement** — clang stays. ccache sits in front of clang
and caches compiled object files. Expected **~50–90% off the native compile phase** on
a warm cache, which for the New-Arch build is the biggest remaining win.

### How it is wired (see `android/build.gradle`)

- RN 0.85 has no built-in ccache hook, so it is wired manually in the root
  `android/build.gradle`.
- It applies `CMAKE_C_COMPILER_LAUNCHER` / `CMAKE_CXX_COMPILER_LAUNCHER=ccache` to
  **all** Android subprojects (not just `:app`), so reanimated/worklets/gesture-handler/
  svg C++ are cached too — not only app codegen.
- It is **auto-detected**: enabled only when `ccache` is on `PATH`. Environments
  without it (EAS build servers, CI) fall back to plain clang and build normally. This
  is deliberate — hardcoding the launcher would break remote builds.

### One-time local setup

```bash
# Fedora
sudo dnf install ccache      # already installed on the current dev machine (v4.12.3)

# Give the cache room for RN's C++ output, and relax timestamp sloppiness
ccache -M 10G
ccache --set-config sloppiness=pch_defines,time_macros,include_file_ctime,include_file_mtime
```

### Verifying it works

```bash
ccache -z                                   # zero the stats
./gradlew clean && ./gradlew :app:assembleDebug   # first build: populates cache (misses)
./gradlew clean && ./gradlew :app:assembleDebug   # second build: should be mostly hits
ccache -s                                   # inspect hit rate
```

A healthy second clean build shows a high cache hit ratio in `ccache -s`, with the
native compile phase dropping sharply.

### Notes / gotchas

- ccache keys on compiler inputs; changing NDK version or compiler flags invalidates
  entries (expected).
- If hit rate is low across different build directories, set `CCACHE_BASEDIR` to the
  project root to make cached paths relocatable.

### How this survives prebuild (config plugin)

`android/` is gitignored and regenerated by `expo prebuild`. The ccache wiring
**and** the `gradle.properties` flags are applied by the Expo config plugin at
`plugins/withBuildPerformance.js`, which runs during every prebuild (local `expo
run:android`, `expo prebuild --clean`, and EAS CI builds).

Without the plugin, prebuild reverts `gradle.properties` to Expo defaults (parallel
off, no build cache) and produces a clean `build.gradle` without the ccache block —
wiping all local speedups and leaving CI permanently slow.

The plugin is registered in `app.json` under `expo.plugins`. No manual re-apply
is needed.

## Faster than a native rebuild at all

The fastest native build is the one you skip. For JS-only changes, build the dev
client once, then rely on Metro fast refresh — no Gradle. Reserve native builds
for native/dependency changes. (Full workflow lives in `apps/mobile/build.md`.)

## How to verify (capture real numbers)

Run these from `apps/mobile/android/` to replace the estimates above with
measured values:

```bash
# Clean build baseline
./gradlew clean
time ./gradlew :app:assembleDebug

# Incremental no-op rebuild (should hit cache / up-to-date)
time ./gradlew :app:assembleDebug

# See where time is spent
./gradlew :app:assembleDebug --profile   # writes build/reports/profile/*.html
```

Compare against a run with the flags disabled
(`-Dorg.gradle.parallel=false -Dorg.gradle.caching=false`) to isolate the gain.

## Caveats

- Configuration cache is intentionally disabled in this project today. Expo/RN
  Android build scripts still spawn `node` during configuration, which Gradle
  rejects under configuration-cache mode. Re-check this after Expo/RN/Gradle
  upgrades because it may become viable later.
- `android/` is regenerated by `expo prebuild`. If you ever run a clean prebuild,
  re-apply these `gradle.properties` changes (or move them into an Expo config
  plugin so they survive regeneration).
