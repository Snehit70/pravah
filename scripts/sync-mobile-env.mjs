import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, ".env.local");
const targetDir = path.join(rootDir, "apps", "mobile");
const targetPath = path.join(targetDir, ".env.local");

function parseEnv(raw) {
  const values = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const hashIndex = trimmed.indexOf(" #");
    const withoutInlineComment = hashIndex >= 0 ? trimmed.slice(0, hashIndex).trim() : trimmed;
    const eqIndex = withoutInlineComment.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = withoutInlineComment.slice(0, eqIndex).trim();
    const value = withoutInlineComment.slice(eqIndex + 1).trim();
    values.set(key, value);
  }
  return values;
}

const sourceRaw = await readFile(sourcePath, "utf8");
const env = parseEnv(sourceRaw);

let existingTarget = new Map();
try {
  const targetRaw = await readFile(targetPath, "utf8");
  existingTarget = parseEnv(targetRaw);
} catch {
  // first-time generation
}

const convexUrl = env.get("VITE_CONVEX_URL") ?? "";
const convexSiteUrl = env.get("VITE_CONVEX_SITE_URL") ?? convexUrl.replace(".convex.cloud", ".convex.site");
const googleWebClientId = env.get("VITE_GOOGLE_CLIENT_ID") ?? "";

const output = [
  `EXPO_PUBLIC_CONVEX_URL=${convexUrl}`,
  `EXPO_PUBLIC_CONVEX_SITE_URL=${convexSiteUrl}`,
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${googleWebClientId}`,
  `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=${existingTarget.get("EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID") ?? ""}`,
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=${existingTarget.get("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID") ?? ""}`,
  "",
].join("\n");

await mkdir(targetDir, { recursive: true });
await writeFile(targetPath, output, "utf8");

console.log(`Synced mobile env -> ${targetPath}`);
