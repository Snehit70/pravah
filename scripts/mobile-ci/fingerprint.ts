import { sha256, TOOLCHAIN, type Context } from "./contracts";
import { command, json, output, writeJson } from "./runtime";

const context = json<Context>("artifacts/mobile-ci/context.json");
const result = JSON.parse(command(["bunx", "fingerprint", "fingerprint:generate", "--platform", "android"], `${process.cwd()}/apps/mobile`)) as { hash?: string };
if (!/^[a-f0-9]{40,64}$/.test(result.hash ?? "")) throw new Error("Invalid native fingerprint");
// The cleartext fixture override and Gradle architecture live outside Expo
// config. Include that build recipe as well as Expo's native identity.
context.nativeFingerprint = sha256(result.hash! + TOOLCHAIN + command(["git", "ls-tree", "-rz", "HEAD", "scripts/mobile-ci/build-base.sh"]));
writeJson("artifacts/mobile-ci/context.json", context);
output({ native_fingerprint: context.nativeFingerprint, cache_key: `mobile-native-base-${sha256(TOOLCHAIN).slice(0, 16)}-${context.nativeFingerprint}` });
