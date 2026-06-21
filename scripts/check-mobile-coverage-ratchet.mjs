import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const summaryPath = path.join(repoRoot, "apps/mobile/coverage/coverage-summary.json");
const baselinePath = path.join(repoRoot, "apps/mobile/coverage-ratchet.json");
const gatedPathPattern = /^apps\/mobile\/src\/(?:lib|hooks)\//;
const metrics = ["lines", "statements", "functions", "branches"];

const normalizePath = (filePath) => {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
};

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const coverageSummary = await readJson(summaryPath);
const baseline = await readJson(baselinePath);

const failures = [];

for (const [relativeFilePath, expectedMetrics] of Object.entries(baseline.files)) {
  const normalizedFilePath = normalizePath(relativeFilePath);

  if (!gatedPathPattern.test(normalizedFilePath)) {
    throw new Error(`Coverage ratchet baseline contains non-gated path: ${relativeFilePath}`);
  }

  const actualMetrics = Object.entries(coverageSummary).find(
    ([filePath]) => normalizePath(filePath) === normalizedFilePath,
  )?.[1];

  if (!actualMetrics) {
    failures.push(`${relativeFilePath}: missing from coverage summary`);
    continue;
  }

  for (const metric of metrics) {
    const expected = expectedMetrics[metric];
    const actual = actualMetrics[metric]?.pct;

    if (typeof expected !== "number" || typeof actual !== "number") {
      failures.push(`${relativeFilePath}: missing ${metric} coverage`);
      continue;
    }

    if (actual < expected) {
      failures.push(`${relativeFilePath}: ${metric} dropped from ${expected}% to ${actual}%`);
    }
  }
}

if (failures.length > 0) {
  console.error("Mobile coverage ratchet failed for src/lib/** and src/hooks/**:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Mobile coverage ratchet passed for ${Object.keys(baseline.files).length} src/lib/** and src/hooks/** files.`);
