const { execSync } = require("child_process");
const { withGradleProperties, withDangerousMod } = require("@expo/config-plugins");

/**
 * Expo config plugin: persist Gradle + ccache optimizations across prebuild.
 *
 * Without this, `android/gradle.properties` reverts to Expo defaults (parallel
 * off, no build cache) every time prebuild runs — wiping local speedups and
 * leaving CI/EAS builds permanently slow.
 *
 * What it does (applied during every prebuild):
 *
 * 1. gradle.properties — inject performance flags:
 *    - parallel=true        (compile modules concurrently)
 *    - caching=true         (local build cache)
 *    - configuration-cache=true  (skip re-running config phase)
 *    - daemon=true          (keep daemon warm)
 *    - workers.max=3        (prevent swap on RAM-constrained machines)
 *
 * 2. build.gradle — detect ccache and wire CMAKE_C/CXX_COMPILER_LAUNCHER
 *    into all Android subprojects. Only activates when ccache is on PATH;
 *    EAS/CI without ccache fall back to plain clang and build normally.
 *
 * Reference: apps/mobile/docs/android-build-performance.md
 */

const PERFORMANCE_PROPERTIES = [
  { key: "org.gradle.parallel", value: "true" },
  { key: "org.gradle.caching", value: "true" },
  // Expo/RN Android build scripts still spawn node during configuration, which
  // makes Gradle's configuration cache fail the build instead of speeding it up.
  { key: "org.gradle.configuration-cache", value: "false" },
  { key: "org.gradle.daemon", value: "true" },
  { key: "org.gradle.workers.max", value: "3" },
];

// ---------------------------------------------------------------------------
// gradle.properties — upsert keys, preserve everything else
// ---------------------------------------------------------------------------
function withPerformanceGradleProperties(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;

    for (const { key, value } of PERFORMANCE_PROPERTIES) {
      const existing = props.find((p) => p[0] === key);
      if (existing) {
        existing[1] = value;
      } else {
        props.push([key, value]);
      }
    }

    return cfg;
  });
}

// ---------------------------------------------------------------------------
// build.gradle — prepend ccache detection and CMAKE launcher injection
// Only runs when ccache is on PATH; safe on any environment.
// ---------------------------------------------------------------------------
const CCACHE_GRADLE_BLOCK = `
// --- ccache: auto-injected by plugins/withBuildPerformance.js ---
//加速 NDK/C++ compilation. Auto-disabled when ccache is absent (EAS/CI safe).
// See docs/android-build-performance.md.
def _ccacheDetect = null;
try {
  def _ccacheResult = providers.exec {
    commandLine "sh", "-c", "command -v ccache || true"
  }.standardOutput.asText.get().trim();
  if (_ccacheResult) _ccacheDetect = _ccacheResult;
} catch (ignored) {}
if (_ccacheDetect != null) {
  println "ccache detected at \${_ccacheDetect}; enabling for native (C/C++) compilation."
  subprojects { _sub ->
    _sub.afterEvaluate { _ae ->
      def _android = _ae.extensions.findByName("android");
      if (_android != null) {
        _android.defaultConfig.externalNativeBuild.cmake.arguments(
          "-DCMAKE_C_COMPILER_LAUNCHER=\${_ccacheDetect}",
          "-DCMAKE_CXX_COMPILER_LAUNCHER=\${_ccacheDetect}"
        );
      }
    }
  }
}
// --- end ccache ---
`;

function withCcacheBlock(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const fs = require("fs");
      const buildGradlePath = cfg.modRequest.platformProjectRoot + "/build.gradle";
      let contents = fs.readFileSync(buildGradlePath, "utf8");

      if (!contents.includes("_ccacheDetect")) {
        contents = CCACHE_GRADLE_BLOCK + "\n" + contents;
        fs.writeFileSync(buildGradlePath, contents, "utf8");
      }

      return cfg;
    },
  ]);
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------
function withBuildPerformance(config) {
  config = withPerformanceGradleProperties(config);
  config = withCcacheBlock(config);
  return config;
}

module.exports = withBuildPerformance;
