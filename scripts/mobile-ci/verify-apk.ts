import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { command, json, required } from "./runtime";
import { sha256, type Context } from "./contracts";

const [kind, file] = process.argv.slice(2);
if (!["fixture", "release"].includes(kind) || !file) throw new Error("Expected fixture|release APK");
const sdk = process.env.ANDROID_HOME ?? required("ANDROID_SDK_ROOT");
const versions = readdirSync(`${sdk}/build-tools`).filter((name) => /^\d+\.\d+\.\d+$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const tools = `${sdk}/build-tools/${versions.at(-1)}`;
const apk = resolve(file);
if (process.env.EXPECTED_APK_SHA256 && sha256(readFileSync(apk)) !== process.env.EXPECTED_APK_SHA256) throw new Error("Downloaded APK checksum mismatch");
const badging = command([`${tools}/aapt2`, "dump", "badging", apk]);
const resources = command([`${tools}/aapt2`, "dump", "resources", apk]);
const certificate = command([`${tools}/apksigner`, "verify", "--print-certs", apk]);
const fixture = kind === "fixture";
const version = fixture ? "0.0.0" : required("RELEASE_VERSION");
const runtime = fixture ? "native-e2e" : required("MOBILE_NATIVE_RUNTIME");
const packageName = fixture ? "com.pravah.mobile.e2e" : "com.pravah.mobile";
if (!badging.includes(`name='${packageName}'`) || !badging.includes(`versionName='${version}'`)) throw new Error("APK package/version mismatch");
if (!badging.includes(fixture ? "'x86_64'" : "'arm64-v8a'")) throw new Error("APK lacks the required architecture");
const runtimeResource = resources.match(/string\/expo_runtime_version\s*\n[^\n]*"([^"]+)"/);
if (runtimeResource?.[1] !== runtime) throw new Error("APK runtime mismatch");
const bundle = Buffer.from(command(["python", "-c", "import sys,zipfile,base64; print(base64.b64encode(zipfile.ZipFile(sys.argv[1]).read('assets/index.android.bundle')).decode())", apk]), "base64");
if (fixture) {
  const context = json<Context>("artifacts/mobile-ci/context.json");
  const expectedSource = process.env.EXPECTED_FIXTURE_SOURCE ?? context.tree;
  if (!bundle.includes(Buffer.from(expectedSource)) || !bundle.includes(Buffer.from("native-ci-user"))) throw new Error("Fixture APK does not contain this source tree's test bundle");
  const manifest = command([`${tools}/aapt2`, "dump", "xmltree", apk, "--file", "AndroidManifest.xml"]);
  if (!/"expo\.modules\.updates\.ENABLED"[^\n]*\n[^\n]*value[^\n]*0x0\b/.test(manifest)) throw new Error("Fixture APK must disable OTA updates");
} else {
  const [major, minor, patch] = version.split(".").map(Number);
  if (!badging.includes(`versionCode='${major * 1_000_000 + minor * 1000 + patch}'`)) throw new Error("APK version code mismatch");
  const expected = readFileSync(new URL("../mobile-release/android-signer.sha256", import.meta.url), "utf8").trim();
  const signers = [...certificate.matchAll(/Signer #\d+ certificate SHA-256 digest: ([a-f0-9]+)/g)];
  if (signers.length !== 1 || signers[0][1] !== expected) throw new Error("APK signer differs from the installed release lineage");
  if (!bundle.includes(Buffer.from("https://combative-zebra-261.eu-west-1.convex.cloud")) || bundle.includes(Buffer.from("native-ci-user"))) throw new Error("Release APK backend/fixture isolation mismatch");
}
console.log(`Verified ${kind} APK: ${packageName} ${version}, runtime ${runtime}`);
