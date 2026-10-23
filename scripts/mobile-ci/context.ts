import { mobileChange, SCHEMA, sha256, TOOLCHAIN, type Context } from "./contracts";
import { command, json, output, required, writeJson } from "./runtime";

type Event = {
  before?: string;
  inputs?: { force_clean?: boolean | string };
  pull_request?: { base: { sha: string }; head: { repo: { full_name: string } | null } };
};
const event = json<Event>(required("GITHUB_EVENT_PATH"));
const repository = required("GITHUB_REPOSITORY");
const sha = command(["git", "rev-parse", "HEAD"]);
let base = event.pull_request?.base.sha ?? event.before;
if (base && /^[a-f0-9]{40}$/.test(base) && !/^0+$/.test(base)) {
  try { command(["git", "cat-file", "-e", base]); }
  catch { command(["git", "fetch", "--no-tags", "--depth=1", "origin", base]); }
} else base = undefined;
const files = base ? command(["git", "diff", "--no-renames", "--name-only", "-z", base, "HEAD"]).split("\0").filter(Boolean) : [];
const forceClean = process.env.GITHUB_EVENT_NAME === "schedule" ||
  event.inputs?.force_clean === true || event.inputs?.force_clean === "true";
const context: Context = {
  schema: SCHEMA, repository, sha,
  tree: command(["git", "rev-parse", "HEAD^{tree}"]),
  harness: sha256(TOOLCHAIN + command(["git", "ls-tree", "-rz", "HEAD", "scripts/mobile-ci", "scripts/mobile-performance", ".github/workflows/mobile-native-ci.yml", ".github/actions/mobile-device", "apps/mobile/e2e"])),
  image: process.env.ImageVersion ?? "unknown",
  nativeFingerprint: "", mobileRequired: !base || forceClean || mobileChange(files), forceClean,
  trusted: !event.pull_request || event.pull_request.head.repo?.full_name === repository,
  releaseContractRequired: !base || files.some((path) => /^(scripts\/mobile-ci\/|scripts\/mobile-release\/android-signer|\.github\/workflows\/mobile-(apk|ota)-release)/.test(path)),
};
writeJson("artifacts/mobile-ci/context.json", context);
output({ mobile_required: context.mobileRequired, force_clean: forceClean, tree: context.tree,
  release_contract: context.releaseContractRequired, context_artifact: `mobile-native-context-${required("GITHUB_RUN_ATTEMPT")}` });
