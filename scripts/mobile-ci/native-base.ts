import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { SCHEMA, sha256, TOOLCHAIN, validBase, type Base, type Context } from "./contracts";
import { json, output, required, writeJson } from "./runtime";

const context = json<Context>("artifacts/mobile-ci/context.json");
const folder = "artifacts/mobile-native-base";
const mode = process.argv[2];
if (mode === "check" || mode === "assert") {
  let valid = false;
  try {
    valid = validBase(json<Base>(`${folder}/base.json`), context.nativeFingerprint,
      readFileSync(`${folder}/base.apk`), readFileSync(`${folder}/debug.keystore`));
  } catch { /* Missing or corrupt cache takes the full native build path. */ }
  if (mode === "assert" && !valid) throw new Error("Native base integrity check failed");
  output({ valid });
} else if (mode === "seal") {
  mkdirSync(folder, { recursive: true });
  copyFileSync("apps/mobile/android/app/build/outputs/apk/release/app-release.apk", `${folder}/base.apk`);
  copyFileSync("apps/mobile/android/app/debug.keystore", `${folder}/debug.keystore`);
  const base: Base = { schema: SCHEMA, toolchain: TOOLCHAIN, nativeFingerprint: context.nativeFingerprint,
    apkSha256: sha256(readFileSync(`${folder}/base.apk`)), keystoreSha256: sha256(readFileSync(`${folder}/debug.keystore`)) };
  writeJson(`${folder}/base.json`, base);
  console.log(`Sealed native base ${context.nativeFingerprint}`);
} else if (mode === "prepared") {
  copyFileSync("artifacts/mobile-native-apk/app.apk", `${folder}/base.apk`);
  const apkSha256 = sha256(readFileSync(`${folder}/base.apk`));
  const base = json<Base>(`${folder}/base.json`);
  base.apkSha256 = apkSha256;
  writeJson(`${folder}/base.json`, base);
  writeJson(`${folder}/prepared.json`, { tree: context.tree, nativeFingerprint: context.nativeFingerprint, apkSha256 });
  output({ artifact_name: `mobile-native-apk-${required("GITHUB_RUN_ATTEMPT")}`, apk_file: "base.apk", apk_sha256: apkSha256 });
} else throw new Error("Expected check, seal or prepared");
