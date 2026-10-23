import { execFileSync } from "node:child_process";
import { reusableValidation, type Context } from "./contracts";
import { api, json, output, required, writeJson } from "./runtime";

type Pull = { merged_at: string | null; merge_commit_sha: string; head: { sha: string; repo: { full_name: string } | null } };
type Run = { id: number; run_attempt: number; status: string; conclusion: string; head_sha: string; head_repository: { full_name: string } | null };
type Artifact = { id: number; name: string; expired: boolean };
const context = json<Context>("artifacts/mobile-ci/context.json");
let reused = false;
// Never promote fork output, cherry-pick an older successful attempt, or reuse
// results for a direct push whose tree was not tested by an associated PR.
if (process.env.GITHUB_EVENT_NAME === "push" && process.env.GITHUB_REF === "refs/heads/main" && !context.forceClean && context.trusted && context.image !== "unknown") {
  try {
    const pulls = api<Pull[]>(`repos/${context.repository}/commits/${context.sha}/pulls`);
    for (const pull of pulls) {
      if (!pull.merged_at || pull.merge_commit_sha !== context.sha || pull.head.repo?.full_name !== context.repository) continue;
      const runs = api<{ workflow_runs: Run[] }>(`repos/${context.repository}/actions/workflows/mobile-native-ci.yml/runs?event=pull_request&head_sha=${pull.head.sha}&per_page=1`).workflow_runs;
      const run = runs[0];
      if (!run || run.status !== "completed" || run.conclusion !== "success" || run.head_sha !== pull.head.sha || run.head_repository?.full_name !== context.repository) continue;
      const artifacts = api<{ artifacts: Artifact[] }>(`repos/${context.repository}/actions/runs/${run.id}/artifacts`).artifacts;
      const artifact = artifacts.find((item) => item.name === `mobile-native-result-${run.run_attempt}` && !item.expired);
      if (!artifact) continue;
      const zip = execFileSync("gh", ["api", `repos/${context.repository}/actions/artifacts/${artifact.id}/zip`, "--allow-escape-sequences"], { maxBuffer: 1024 * 1024 });
      // Read only the expected metadata member. Never extract archive paths.
      const raw = execFileSync("python", ["-c", "import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); i=z.getinfo('result.json'); assert i.file_size < 65536; sys.stdout.buffer.write(z.read(i))"], { input: zip, encoding: "utf8", maxBuffer: 65536 });
      const result: unknown = JSON.parse(raw);
      if (!reusableValidation(result, context, run.id)) continue;
      const apk = artifacts.find((item) => item.name === result.artifactName && !item.expired);
      if (!apk) continue;
      writeJson("artifacts/mobile-ci/reused-result.json", result);
      output({ reused: true, producer_run: String(run.id), artifact_name: result.artifactName,
        apk_sha256: result.apkSha256, promote_base: true });
      reused = true;
      break;
    }
  } catch (error) {
    console.warn(`Prior validation unavailable; running the full suite. ${error instanceof Error ? error.message : "Unknown API error"}`);
  }
}
if (!reused) output({ reused: false, producer_run: required("GITHUB_RUN_ID"), artifact_name: "", promote_base: false });
