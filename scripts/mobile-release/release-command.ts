import { ConvexHttpClient } from "convex/browser";
import { appendFile } from "node:fs/promises";
import { api } from "../../convex/_generated/api";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function integerList(name: string): number[] {
  const value = optional(name);
  if (!value) return [];
  return value.split(",").map((item) => {
    const parsed = Number(item.trim());
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${name} must contain positive integers`);
    }
    return parsed;
  });
}

async function writeOutput(values: Record<string, string | number>): Promise<void> {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  await appendFile(
    output,
    `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
  );
}

const command = process.argv[2];
const client = new ConvexHttpClient(required("CONVEX_URL"));
const deploymentSecret = optional("MOBILE_RELEASE_DEPLOY_SECRET");

if (command === "state") {
  const state = await client.query(api.mobileReleases.getState, {});
  if (!state) throw new Error("Mobile release control is not seeded");
  await writeOutput({
    revision: state.revision,
    version: state.latestVersion,
    runtime: state.supportedRuntime,
    fingerprint: state.supportedFingerprint,
  });
  process.stdout.write(`${JSON.stringify(state)}\n`);
} else if (command === "history") {
  const releases = await client.query(api.mobileReleases.listPublished, {
    limit: 100,
  });
  const pullRequests = [
    ...new Set(releases.flatMap((release) => release.pullRequests)),
  ];
  await writeOutput({ pull_requests_json: JSON.stringify(pullRequests) });
  process.stdout.write(`${JSON.stringify(releases)}\n`);
} else if (command === "reserve") {
  if (!deploymentSecret) throw new Error("MOBILE_RELEASE_DEPLOY_SECRET is required");
  const result = await client.mutation(api.mobileReleases.reserve, {
    deploymentSecret,
    expectedRevision: Number(required("EXPECTED_REVISION")),
    delivery: required("DELIVERY") as "ota" | "native" | "rollback",
    sourceSha: required("SOURCE_SHA"),
    sourceRef: required("SOURCE_REF"),
    title: required("RELEASE_TITLE"),
    releaseNotes: required("RELEASE_NOTES"),
    pullRequests: integerList("PULL_REQUESTS"),
    nativeRuntime: required("NATIVE_RUNTIME"),
    nativeFingerprint: required("NATIVE_FINGERPRINT"),
    rollbackOfVersion: optional("ROLLBACK_OF_VERSION"),
    restoresVersion: optional("RESTORES_VERSION"),
  });
  const attempts = await client.query(api.mobileReleases.listAttempts, {
    deploymentSecret,
    limit: 100,
  });
  const attempt = attempts.find((item) => item._id === result.attemptId);
  if (!attempt) throw new Error("Reserved release attempt could not be read back");
  await writeOutput({
    attempt_id: result.attemptId,
    version: result.version,
    revision: result.revision,
    status: attempt.status,
    eas_update_id: attempt.easUpdateId ?? "",
    eas_branch: attempt.easBranch ?? "",
    github_tag: attempt.githubTag ?? "",
    artifact_url: attempt.artifactUrl ?? "",
    checksum_url: attempt.checksumUrl ?? "",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "stage") {
  if (!deploymentSecret) throw new Error("MOBILE_RELEASE_DEPLOY_SECRET is required");
  const result = await client.mutation(api.mobileReleases.markStaged, {
    deploymentSecret,
    attemptId: required("ATTEMPT_ID") as never,
    easUpdateId: optional("EAS_UPDATE_ID"),
    easBranch: optional("EAS_BRANCH"),
    githubTag: optional("GITHUB_TAG"),
    artifactUrl: optional("ARTIFACT_URL"),
    checksumUrl: optional("CHECKSUM_URL"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "publish") {
  if (!deploymentSecret) throw new Error("MOBILE_RELEASE_DEPLOY_SECRET is required");
  const result = await client.mutation(api.mobileReleases.publish, {
    deploymentSecret,
    attemptId: required("ATTEMPT_ID") as never,
    expectedRevision: Number(required("EXPECTED_REVISION")),
  });
  await writeOutput({ version: result.version, revision: result.revision });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "fail") {
  if (!deploymentSecret) throw new Error("MOBILE_RELEASE_DEPLOY_SECRET is required");
  const result = await client.mutation(api.mobileReleases.markFailed, {
    deploymentSecret,
    attemptId: required("ATTEMPT_ID") as never,
    reason: required("REASON"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "reconcile") {
  if (!deploymentSecret) throw new Error("MOBILE_RELEASE_DEPLOY_SECRET is required");
  const result = await client.mutation(api.mobileReleases.reconcile, {
    deploymentSecret,
    attemptId: required("ATTEMPT_ID") as never,
    reason: required("REASON"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "rollback-target") {
  if (!deploymentSecret) throw new Error("MOBILE_RELEASE_DEPLOY_SECRET is required");
  const result = await client.mutation(api.mobileReleases.requestRollback, {
    deploymentSecret,
    defectiveVersion: required("DEFECTIVE_VERSION"),
    restoresVersion: required("RESTORES_VERSION"),
    reason: required("REASON"),
  });
  await writeOutput({
    source_sha: result.sourceSha,
    runtime: result.nativeRuntime,
    fingerprint: result.nativeFingerprint,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "minimum-runtime") {
  if (!deploymentSecret) throw new Error("MOBILE_RELEASE_DEPLOY_SECRET is required");
  const result = await client.mutation(api.mobileReleases.setMinimumRuntime, {
    deploymentSecret,
    nativeRuntime: required("NATIVE_RUNTIME"),
    confirmation: required("CONFIRMATION"),
    reason: required("REASON"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  throw new Error(
    "Expected command: state, history, reserve, stage, publish, fail, reconcile, rollback-target, or minimum-runtime",
  );
}
