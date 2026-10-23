import { createHash } from "node:crypto";

export const SCHEMA = 1;
export const TOOLCHAIN = "ubuntu24-jdk17-api35-x86_64-emulator16428233-maestro2.11-repack0.10.4-v1";
export const REQUIRED_CHECKS = [
  "Lint", "Typecheck root", "Typecheck mobile", "Test root", "Test mobile",
  "Build web", "Build CLI", "Android native workflows and performance",
  "Mobile persistence performance",
] as const;

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function androidRuntime(resources: string): string | null {
  // Newer build-tools append flags to the resource header.
  return resources.match(/string\/expo_runtime_version[^\n]*\n[^"\n]*"([^"\n]+)"/)?.[1] ?? null;
}

export function mobileChange(files: readonly string[]): boolean {
  return files.some((path) => {
    if (/^apps\/mobile\/(docs\/|src\/test\/)/.test(path)) return false;
    if (/^(apps\/mobile\/|convex\/|patches\/|scripts\/mobile-|\.github\/actions\/)/.test(path)) return true;
    if (/^\.github\/workflows\/(mobile-|ci\.yml)/.test(path)) return true;
    if (["package.json", "bun.lock"].includes(path)) return true;
    // Only known independent areas skip native CI. New shared directories
    // and configuration files take the full path until classified explicitly.
    return !/^(src\/(?:components\/|pages\/|test\/|App\.tsx$|main\.tsx$|(?:index|App)\.css$)|public\/|docs\/|packages\/(cli|todo-plugin)\/|\.github\/|[^/]+\.md$|index\.html$|vite\.|vitest\.|tsconfig|eslint\.|\.gitignore$|\.prettier)/.test(path);
  });
}

export type Context = {
  schema: number;
  repository: string;
  sha: string;
  tree: string;
  harness: string;
  image: string;
  nativeFingerprint: string;
  mobileRequired: boolean;
  forceClean: boolean;
  trusted: boolean;
  releaseContractRequired: boolean;
};

export type Base = {
  schema: number;
  toolchain: string;
  nativeFingerprint: string;
  apkSha256: string;
  keystoreSha256: string;
};

export type Validation = {
  schema: number;
  repository: string;
  tree: string;
  harness: string;
  image: string;
  nativeFingerprint: string;
  trusted: boolean;
  runId: number;
  artifactName: string;
  apkFile: "base.apk";
  apkSha256: string;
  checks: { workflows: string; performance: string; persistence: string };
};

export function reusableValidation(value: unknown, context: Context, runId: number): value is Validation {
  if (!value || typeof value !== "object" || context.forceClean) return false;
  const result = value as Validation;
  return result.schema === SCHEMA && result.trusted === true && context.trusted &&
    result.repository === context.repository && result.tree === context.tree &&
    result.harness === context.harness && result.image === context.image &&
    result.nativeFingerprint === context.nativeFingerprint && result.runId === runId &&
    /^mobile-native-apk-\d+$/.test(result.artifactName ?? "") &&
    result.apkFile === "base.apk" &&
    /^[a-f0-9]{64}$/.test(result.apkSha256 ?? "") &&
    result.checks?.workflows === "success" && result.checks?.performance === "success" &&
    result.checks?.persistence === "success";
}

export function validBase(value: unknown, fingerprint: string, apk: Uint8Array, key: Uint8Array): boolean {
  if (!value || typeof value !== "object") return false;
  const base = value as Base;
  return base.schema === SCHEMA && base.toolchain === TOOLCHAIN &&
    base.nativeFingerprint === fingerprint && base.apkSha256 === sha256(apk) &&
    base.keystoreSha256 === sha256(key);
}

export type Check = { name: string; status: string; conclusion: string | null; app?: { slug?: string } };
export function checkState(checks: readonly Check[]): { pending: string[]; failed: string[] } {
  const pending: string[] = [];
  const failed: string[] = [];
  for (const name of REQUIRED_CHECKS) {
    const check = checks.find((item) => item.name === name && item.app?.slug === "github-actions");
    if (!check || check.status !== "completed") pending.push(name);
    else if (check.conclusion !== "success") failed.push(`${name}: ${check.conclusion}`);
  }
  return { pending, failed };
}
