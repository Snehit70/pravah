import { describe, expect, it } from "vitest";
import {
  checkState, mobileChange, REQUIRED_CHECKS, reusableValidation, SCHEMA,
  sha256, TOOLCHAIN, validBase, type Base, type Check, type Context, type Validation,
} from "../../scripts/mobile-ci/contracts";
import { classifyMobileRelease } from "../../scripts/mobile-release/classifier";

const context: Context = {
  schema: SCHEMA, repository: "owner/repo", sha: "a".repeat(40), tree: "b".repeat(40),
  harness: "c".repeat(64), image: "20261001.1", nativeFingerprint: "d".repeat(64),
  mobileRequired: true, forceClean: false, trusted: true, releaseContractRequired: false,
};
const validation: Validation = {
  schema: SCHEMA, repository: context.repository, tree: context.tree, harness: context.harness,
  image: context.image, nativeFingerprint: context.nativeFingerprint, trusted: true,
  runId: 123, artifactName: "mobile-native-apk-1", apkFile: "base.apk", apkSha256: "e".repeat(64),
  checks: { workflows: "success", performance: "success", persistence: "success" },
};

describe("mobile CI routing", () => {
  it.each(["src/components/Inbox.tsx", "docs/guide.md", "packages/cli/src/list.ts", "apps/mobile/docs/notes.md", "apps/mobile/src/test/new.test.ts"])("keeps independent changes on the fast path: %s", (path) => {
    expect(mobileChange([path])).toBe(false);
  });
  it.each(["apps/mobile/App.tsx", "convex/tasks.ts", "src/lib/shared.ts", "apps/mobile/e2e/workflows.yaml", "patches/expo.patch", "scripts/mobile-ci/context.ts", ".github/actions/mobile-device/action.yml", ".github/workflows/mobile-native-ci.yml", "bun.lock", "packages/new-shared/index.ts", "unknown.config.js"])("validates mobile or unknown inputs: %s", (path) => {
    expect(mobileChange([path])).toBe(true);
  });
  it("does not let independent files hide a shared-backend change", () => {
    expect(mobileChange(["docs/guide.md", "convex/tasks.ts"])).toBe(true);
  });
  it("allows test transport changes without shipping an app update", () => {
    expect(classifyMobileRelease({ changedFiles: ["apps/mobile/e2e/provider.js"], labels: ["mobile-no-release"] }).ok).toBe(true);
    expect(classifyMobileRelease({ changedFiles: ["apps/mobile/e2e/provider.js", "apps/mobile/App.tsx"], labels: ["mobile-no-release"] }).ok).toBe(false);
  });
});

describe("native base integrity", () => {
  const apk = new TextEncoder().encode("native APK");
  const key = new TextEncoder().encode("public test-only debug keystore");
  const base: Base = { schema: SCHEMA, toolchain: TOOLCHAIN, nativeFingerprint: context.nativeFingerprint, apkSha256: sha256(apk), keystoreSha256: sha256(key) };
  it("accepts only the matching native identity and intact bytes", () => {
    expect(validBase(base, context.nativeFingerprint, apk, key)).toBe(true);
    expect(validBase(base, "another-fingerprint", apk, key)).toBe(false);
    expect(validBase(base, context.nativeFingerprint, new Uint8Array([1]), key)).toBe(false);
    expect(validBase(base, context.nativeFingerprint, apk, new Uint8Array([2]))).toBe(false);
    expect(validBase({ ...base, toolchain: "old-tools" }, context.nativeFingerprint, apk, key)).toBe(false);
    expect(validBase(null, context.nativeFingerprint, apk, key)).toBe(false);
  });
});

describe("validated result reuse", () => {
  it("accepts an exact trusted result", () => {
    expect(reusableValidation(validation, context, 123)).toBe(true);
  });
  it.each(["tree", "harness", "image", "nativeFingerprint", "repository"] as const)("reruns when %s differs", (field) => {
    expect(reusableValidation({ ...validation, [field]: "different" }, context, 123)).toBe(false);
  });
  it("rejects fork output, forced-clean runs and failed suites", () => {
    expect(reusableValidation({ ...validation, trusted: false }, context, 123)).toBe(false);
    expect(reusableValidation(validation, { ...context, trusted: false }, 123)).toBe(false);
    expect(reusableValidation(validation, { ...context, forceClean: true }, 123)).toBe(false);
    expect(reusableValidation({ ...validation, checks: { ...validation.checks, performance: "failure" } }, context, 123)).toBe(false);
    expect(reusableValidation(validation, context, 999)).toBe(false);
  });
  it("rejects malformed artifact references and incomplete results", () => {
    for (const value of [null, {}, { ...validation, artifactName: "../../another-artifact" }, { ...validation, apkFile: "../../file" }, { ...validation, apkSha256: "" }, { ...validation, checks: undefined }]) {
      expect(reusableValidation(value, context, 123)).toBe(false);
    }
  });
});

describe("publication source gate", () => {
  const checks: Check[] = REQUIRED_CHECKS.map((name) => ({ name, status: "completed", conclusion: "success", app: { slug: "github-actions" } }));
  it("publishes only after all named checks succeed", () => {
    expect(checkState(checks)).toEqual({ pending: [], failed: [] });
    expect(checkState(checks.slice(1)).pending).toEqual(["Lint"]);
    expect(checkState([{ ...checks[0], status: "in_progress", conclusion: null }, ...checks.slice(1)]).pending).toEqual(["Lint"]);
  });
  it.each(["failure", "cancelled", "timed_out", "skipped"])("blocks publication on %s", (conclusion) => {
    expect(checkState([{ ...checks[0], conclusion }, ...checks.slice(1)]).failed).toEqual([`Lint: ${conclusion}`]);
  });
  it("does not accept another app's check with the same name", () => {
    expect(checkState([{ ...checks[0], app: { slug: "another-app" } }, ...checks.slice(1)]).pending).toEqual(["Lint"]);
  });
});
