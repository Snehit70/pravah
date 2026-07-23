import { classifyMobileRelease } from "./classifier";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function command(
  args: string[],
  cwd = process.cwd(),
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const processHandle = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);
  return { stdout, stderr, exitCode };
}

const baseSha = requiredEnv("BASE_SHA");
const headSha = requiredEnv("HEAD_SHA");
const labels = JSON.parse(requiredEnv("PR_LABELS_JSON")) as string[];
const supportedFingerprint = process.env.SUPPORTED_FINGERPRINT?.trim();
const pullRequestBody = process.env.PR_BODY ?? "";

const diff = await command([
  "git",
  "diff",
  "--name-only",
  "--diff-filter=ACMR",
  `${baseSha}...${headSha}`,
]);
if (diff.exitCode !== 0) {
  throw new Error(`Unable to read pull-request diff: ${diff.stderr.trim()}`);
}
const changedFiles = diff.stdout.split("\n").map((line) => line.trim()).filter(Boolean);

let sourceFingerprint: string | undefined;
let fingerprintError: string | undefined;
if (labels.includes("mobile-ota")) {
  const fingerprint = await command(
    ["bunx", "fingerprint", "fingerprint:generate", "--platform", "android"],
    `${process.cwd()}/apps/mobile`,
  );
  if (fingerprint.exitCode !== 0) {
    fingerprintError = fingerprint.stderr.trim() || "unknown fingerprint error";
  } else {
    try {
      sourceFingerprint = (
        JSON.parse(fingerprint.stdout) as { hash?: string }
      ).hash;
      if (!sourceFingerprint) fingerprintError = "fingerprint output omitted hash";
    } catch (error) {
      fingerprintError =
        error instanceof Error ? error.message : "invalid fingerprint output";
    }
  }
}

const result = classifyMobileRelease({
  changedFiles,
  labels,
  sourceFingerprint,
  supportedFingerprint,
  fingerprintError,
  pullRequestBody,
});

const output = {
  ...result,
  changedFiles,
  sourceFingerprint,
  supportedFingerprint,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const summary = [
    "## Mobile release classification",
    "",
    `- Classification: ${result.classification ?? "none"}`,
    `- Result: ${result.ok ? "pass" : "fail"}`,
    `- Changed files: ${changedFiles.length}`,
    ...(result.reasons.length
      ? ["", "### Reasons", "", ...result.reasons.map((reason) => `- ${reason}`)]
      : []),
    "",
  ].join("\n");
  await Bun.write(summaryPath, summary);
}

if (!result.ok) process.exit(1);
