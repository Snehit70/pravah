export const MOBILE_RELEASE_PREFIX = "mobile-v";
export const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/Snehit70/pravah/releases";

export type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type GitHubRelease = {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAsset[];
};

export type UpdateAvailableResult = {
  status: "update-available";
  version: string;
  apkUrl: string;
  md5Url: string;
  releaseNotes: string;
};

export type UpdateResolution =
  | { status: "up-to-date" }
  | UpdateAvailableResult
  | { status: "malformed-metadata" }
  | { status: "missing-asset"; version: string };

export type UpdateCheckResult =
  | UpdateResolution
  | { status: "offline" }
  | { status: "rate-limited"; retryAfter?: string };

type Semver = { major: number; minor: number; patch: number };

function parseSemver(value: string): Semver | null {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left: Semver, right: Semver): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function releaseVersion(release: GitHubRelease): string | null {
  if (!release.tag_name.startsWith(MOBILE_RELEASE_PREFIX)) return null;
  return release.tag_name.slice(MOBILE_RELEASE_PREFIX.length);
}

function isGitHubReleaseAsset(value: unknown): value is GitHubReleaseAsset {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { browser_download_url?: unknown }).browser_download_url === "string"
  );
}

function isGitHubRelease(value: unknown): value is GitHubRelease {
  if (typeof value !== "object" || value === null) return false;

  const release = value as { tag_name?: unknown; assets?: unknown };
  return (
    typeof release.tag_name === "string" &&
    (release.assets === undefined ||
      (Array.isArray(release.assets) && release.assets.every(isGitHubReleaseAsset)))
  );
}

export function resolveUpdate(
  currentVersion: string | null | undefined,
  releases: readonly GitHubRelease[],
): UpdateResolution {
  if (!currentVersion) return { status: "malformed-metadata" };

  const current = parseSemver(currentVersion);
  if (!current) return { status: "malformed-metadata" };

  const candidates = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => {
      const version = releaseVersion(release);
      const parsed = version ? parseSemver(version) : null;
      return version && parsed ? { release, version, parsed } : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => compareSemver(b.parsed, a.parsed));

  const latest = candidates[0];
  if (!latest || compareSemver(latest.parsed, current) <= 0) {
    return { status: "up-to-date" };
  }

  const assets = latest.release.assets ?? [];
  const apk = assets.find((asset) => asset.name.endsWith(".apk"));
  const md5 = assets.find((asset) => asset.name.endsWith(".apk.md5"));
  if (!apk || !md5) return { status: "missing-asset", version: latest.version };

  return {
    status: "update-available",
    version: latest.version,
    apkUrl: apk.browser_download_url,
    md5Url: md5.browser_download_url,
    releaseNotes: latest.release.body?.trim() || "No release notes provided.",
  };
}

function isRateLimited(response: Response): boolean {
  return (
    response.status === 429 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
  );
}

type ReleaseListResult =
  | { status: "ok"; releases: GitHubRelease[] }
  | { status: "offline" }
  | { status: "rate-limited"; retryAfter?: string }
  | { status: "malformed-metadata" };

async function fetchReleaseList(fetchImpl: typeof fetch): Promise<ReleaseListResult> {
  let response: Response;
  try {
    response = await fetchImpl(GITHUB_RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
  } catch {
    return { status: "offline" };
  }

  if (isRateLimited(response)) {
    return {
      status: "rate-limited",
      retryAfter: response.headers.get("retry-after") ?? undefined,
    };
  }

  if (!response.ok) return { status: "offline" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: "malformed-metadata" };
  }
  if (!Array.isArray(payload) || !payload.every(isGitHubRelease)) {
    return { status: "malformed-metadata" };
  }

  return { status: "ok", releases: payload };
}

export async function checkForAppUpdate(
  currentVersion: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateCheckResult> {
  const list = await fetchReleaseList(fetchImpl);
  if (list.status !== "ok") return list;
  return resolveUpdate(currentVersion, list.releases);
}

export type MobileRelease = {
  version: string;
  notes: string;
};

export type ReleaseFeedResult =
  | { status: "ok"; releases: MobileRelease[] }
  | { status: "offline" }
  | { status: "rate-limited"; retryAfter?: string }
  | { status: "malformed-metadata" };

export function resolveReleaseFeed(releases: readonly GitHubRelease[]): MobileRelease[] {
  return releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => {
      const version = releaseVersion(release);
      const parsed = version ? parseSemver(version) : null;
      return version && parsed ? { release, version, parsed } : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => compareSemver(b.parsed, a.parsed))
    .map(({ release, version }) => ({
      version,
      notes: release.body?.trim() || "No release notes provided.",
    }));
}

export async function fetchMobileReleases(
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseFeedResult> {
  const list = await fetchReleaseList(fetchImpl);
  if (list.status !== "ok") return list;
  return { status: "ok", releases: resolveReleaseFeed(list.releases) };
}
