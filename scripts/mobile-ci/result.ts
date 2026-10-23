import { SCHEMA, type Context, type Validation } from "./contracts";
import { appendFileSync } from "node:fs";
import { json, required, writeJson } from "./runtime";

if (required("PLAN_RESULT") !== "success" || required("PERSISTENCE_RESULT") !== "success") throw new Error("Mobile planning or persistence benchmark failed");
if (!["success", "skipped"].includes(required("RELEASE_CONTRACT_RESULT"))) throw new Error("Published APK contract check failed");
const context = json<Context>("artifacts/mobile-ci/context.json");
let summary: string;
if (!context.mobileRequired) {
  summary = "Native tests not applicable: only known independent paths changed. Fast checks still run.\n";
} else if (process.env.REUSED === "true") {
  const result = json<Validation>("artifacts/mobile-ci/reused-result.json");
  summary = `Reused successful native validation from https://github.com/${context.repository}/actions/runs/${result.runId}. The complete Git tree, test inputs, native fingerprint and runner image match.\n`;
} else {
  for (const name of ["PREPARE_RESULT", "WORKFLOWS_RESULT", "PERFORMANCE_RESULT"]) {
    if (required(name) !== "success") throw new Error(`${name} did not pass: ${process.env[name]}`);
  }
  const images = [required("PREPARE_IMAGE"), required("WORKFLOWS_IMAGE"), required("PERFORMANCE_IMAGE")];
  const result: Validation = {
    schema: SCHEMA, repository: context.repository, tree: context.tree, harness: context.harness,
    image: images.every((image) => image === context.image) ? context.image : "mixed-runner-images",
    nativeFingerprint: context.nativeFingerprint, trusted: context.trusted,
    runId: Number(required("GITHUB_RUN_ID")), artifactName: required("APK_ARTIFACT"),
    apkFile: required("APK_FILE") as Validation["apkFile"], apkSha256: required("APK_SHA256"),
    checks: { workflows: "success", performance: "success", persistence: "success" },
  };
  writeJson("artifacts/mobile-ci/result.json", result);
  summary = `Native workflows and isolated performance checks passed. APK preparation: ${required("APK_PREPARATION")}. Native fingerprint: ${context.nativeFingerprint}.\n`;
}
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
