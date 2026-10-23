import { setTimeout } from "node:timers/promises";
import { checkState, type Check } from "./contracts";
import { api, command, required } from "./runtime";

const repository = required("GITHUB_REPOSITORY");
const sha = required("SOURCE_SHA");
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("An exact source commit is required");
command(["git", "merge-base", "--is-ancestor", sha, "origin/main"]);
const deadline = Date.now() + 30 * 60_000;
let complete = false;
while (Date.now() < deadline) {
  const response = api<{ check_runs: Check[] }>(`repos/${repository}/commits/${sha}/check-runs?filter=latest&per_page=100`);
  const state = checkState(response.check_runs);
  if (state.failed.length) throw new Error(`Candidate validation failed: ${state.failed.join(", ")}`);
  if (!state.pending.length) { complete = true; break; }
  console.log(`Waiting for source checks: ${state.pending.join(", ")}`);
  await setTimeout(15_000);
}
if (!complete) throw new Error("Timed out waiting for source validation; publication remains blocked");
console.log(`All source checks passed for ${sha}`);
