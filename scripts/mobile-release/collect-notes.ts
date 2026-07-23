import { appendFile } from "node:fs/promises";

type PullRequest = {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  mergeCommit: { oid: string } | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function run(args: string[]): Promise<string> {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || args.join(" "));
  return stdout;
}

function releaseNotes(body: string): string {
  const match =
    /(?:^|\n)#{1,6}\s+Mobile release notes\s*\n([\s\S]*?)(?=\n#{1,6}\s|\s*$)/i.exec(
      body,
    );
  const notes = match?.[1].trim();
  if (!notes) throw new Error("Pull request is missing Mobile release notes");
  return notes;
}

const sourceSha = required("SOURCE_SHA");
const label = required("RELEASE_LABEL");
const repository = required("GITHUB_REPOSITORY");
const published = new Set(
  JSON.parse(process.env.PUBLISHED_PULL_REQUESTS_JSON || "[]") as number[],
);
const raw = await run([
  "gh",
  "pr",
  "list",
  "--repo",
  repository,
  "--state",
  "merged",
  "--base",
  "main",
  "--limit",
  "100",
  "--json",
  "number,title,body,labels,mergeCommit",
]);
const candidates = JSON.parse(raw) as PullRequest[];
const included: Array<PullRequest & { notes: string }> = [];

for (const pullRequest of candidates) {
  const mergeSha = pullRequest.mergeCommit?.oid;
  if (
    !mergeSha ||
    published.has(pullRequest.number) ||
    !pullRequest.labels.some((item) => item.name === label)
  ) {
    continue;
  }
  const ancestor = Bun.spawnSync([
    "git",
    "merge-base",
    "--is-ancestor",
    mergeSha,
    sourceSha,
  ]);
  if (ancestor.exitCode === 0) {
    included.push({ ...pullRequest, notes: releaseNotes(pullRequest.body) });
  }
}

included.sort((a, b) => a.number - b.number);
if (included.length === 0) {
  throw new Error(`No unreleased ${label} pull requests are included in ${sourceSha}`);
}
const title =
  included.length === 1
    ? included[0].title
    : `Mobile updates from ${included.length} pull requests`;
const notes = included
  .map((pullRequest) => `### #${pullRequest.number} ${pullRequest.title}\n\n${pullRequest.notes}`)
  .join("\n\n");
const pullRequests = included.map((pullRequest) => pullRequest.number);
const output = process.env.GITHUB_OUTPUT;
if (output) {
  const delimiter = `NOTES_${crypto.randomUUID()}`;
  await appendFile(
    output,
    [
      `title<<${delimiter}`,
      title,
      delimiter,
      `notes<<${delimiter}`,
      notes,
      delimiter,
      `pull_requests=${pullRequests.join(",")}`,
      "",
    ].join("\n"),
  );
}
process.stdout.write(`${JSON.stringify({ title, notes, pullRequests })}\n`);
